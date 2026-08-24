#!/usr/bin/env node
// verify-production.js -- post-deploy verification of the LIVE site.
//
// WHY: every existing gate (preflight, validate, smoke) checks the working
// tree or localhost. Nothing ever looked at what legislationpatch.com actually
// serves -- and with GitHub Pages + Cloudflare in front, production can
// genuinely diverge from source: a deploy that half-ran, a stale Cloudflare
// cache, a broken canonical only present in the rendered output. "The source
// is right" and "production is right" are different claims; this script tests
// the second one.
//
// BASELINE: origin/main, not the working tree. dev is usually AHEAD of
// production, so comparing live HTML against local files would flag every
// undeployed change as a production bug. What production is SUPPOSED to serve
// is exactly what was pushed to main -- so expectations come from
// `git show origin/main:<file>`. Run `git fetch` first if origin/main is stale.
//
// WHAT IS CHECKED
//   robots.txt        200, references the sitemap
//   sitemap.xml       200, parses, URL set matches origin/main's sitemap
//   sampled pages     200 with no redirect, no noindex (header or meta),
//                     <title> / canonical / meta description byte-equal to
//                     origin/main, <h1> present where the source has one
//
// Sampling: sitemap URLs are grouped by first path segment (bill, articles,
// rep, topics, ...) and first/middle/last of each group are taken, so every
// page class is covered each run without fetching all 800+ URLs.
//
// Usage:
//   node scripts/verify-production.js                  # sampled run (~30 URLs)
//   node scripts/verify-production.js --all            # every sitemap URL (slow)
//   node scripts/verify-production.js --per-group 5    # wider sample
//   node scripts/verify-production.js --base https://legislationpatch.com
//
// Read-only against the repo; makes polite GETs (concurrency 4) against prod.
// Exit 0 = production matches origin/main. Exit 1 = divergence found.
// NOTE on failures: Cloudflare caches pages -- right after a push, a mismatch
// can be cache lag rather than a bad deploy. Re-run after the cache TTL (~4h)
// before treating a title/canonical mismatch as real.

'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const { fetchWithRetry } = require('./lib/fetch-helpers.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const opt  = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

const BASE      = (opt('base') || 'https://legislationpatch.com').replace(/\/$/, '');
const PER_GROUP = Number(opt('per-group') || 3);
const ALL       = flag('all');
const VERBOSE   = flag('verbose');
const CONCURRENCY = 4;
const TIMEOUT_MS  = 20000;

let failures = 0, checked = 0;
function section(t) { console.log(`\n── ${t}`); }
// pass() is quiet (a sampled run checks dozens of pages; only failures are
// signal there); ok() is the loud variant for the singleton robots/sitemap
// checks, whose section would otherwise print an ambiguous empty header.
function pass(m)  { checked++; if (VERBOSE) console.log(`  ✅ ${m}`); }
function ok(m)    { checked++; console.log(`  ✅ ${m}`); }
function fail(m)  { checked++; failures++; console.log(`  ❌ ${m}`); }

// ── origin/main file access ─────────────────────────────────────────────────

function gitShow(relPath) {
  try {
    // cat-file -t first: `git show` on a DIRECTORY happily prints a tree
    // listing, which would then be "compared" against live HTML as if it were
    // the page source (/author/james-shearn hit exactly this).
    const type = execFileSync('git', ['cat-file', '-t', `origin/main:${relPath}`],
      { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (type !== 'blob') return null;
    return execFileSync('git', ['show', `origin/main:${relPath}`],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch { return null; }
}

/** Map a site URL to the repo file that backs it on origin/main (or null). */
function deployedFileFor(url) {
  let rel;
  try { rel = decodeURIComponent(new URL(url).pathname).replace(/^\//, ''); } catch { return null; }
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  for (const cand of [rel, rel + '.html', rel.replace(/\.html$/, '') + '/index.html']) {
    const body = gitShow(cand);
    if (body !== null) return { path: cand, body };
  }
  return null;
}

// ── HTML feature extraction (same shapes preflight checks statically) ───────

function features(html) {
  const descTag = (html.match(/<meta[^>]*name=["']description["'][^>]*>/) || [])[0];
  return {
    title: ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '').trim(),
    canonical: (html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/) || [])[1]
            || (html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/) || [])[1] || '',
    description: (descTag && ((descTag.match(/content="([^"]*)"/) || descTag.match(/content='([^']*)'/)) || [])[1] || '').trim(),
    noindex: /<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html),
    hasH1: /<h1[\s>]/i.test(html),
  };
}

// ── polite fetch pool ───────────────────────────────────────────────────────

// fetchWithRetry absorbs transient 429/5xx (Cloudflare returned a one-off 503
// on sitemap.xml during testing -- without retry that single blip fails the
// whole verdict). The signal budget covers all attempts INCLUDING backoff
// waits, so it must be much larger than a single request's worth.
async function get(url) {
  try {
    const res = await fetchWithRetry(url, {
      tries: 3, baseDelay: 2000,
      init: {
        redirect: 'follow',
        signal: AbortSignal.timeout(3 * TIMEOUT_MS),
        headers: { 'User-Agent': 'legislationpatch-verify-production/1.0 (self-check)' },
      },
    });
    const body = await res.text();
    return { status: res.status, finalUrl: res.url, body, headers: res.headers };
  } catch (e) {
    return { status: 0, error: String(e && e.message || e) };
  }
}

async function pool(items, worker) {
  const queue = items.slice();
  const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

// ── page verification ───────────────────────────────────────────────────────

async function verifyPage(url) {
  const deployed = deployedFileFor(url);
  if (!deployed) {
    // In the deployed sitemap but not on origin/main -- the sitemap itself is
    // compared to origin/main earlier, so this means URL->file mapping failed.
    fail(`${url}: no backing file found on origin/main`);
    return;
  }
  const live = await get(url);
  if (live.status !== 200) {
    fail(`${url}: HTTP ${live.status || 'ERR'} ${live.error || ''}`);
    return;
  }
  const problems = [];
  // A canonical URL that redirects tells crawlers the sitemap lies.
  // Compare with query strings stripped from BOTH sides (rep.html?id=... is a
  // sitemap URL whose query survives the fetch untouched).
  const norm = u => u.split('?')[0].replace(/\/$/, '');
  if (live.finalUrl && norm(live.finalUrl) !== norm(url)) {
    problems.push(`redirected to ${live.finalUrl}`);
  }
  const xRobots = live.headers && live.headers.get && (live.headers.get('x-robots-tag') || '');
  if (/noindex/i.test(xRobots)) problems.push(`x-robots-tag header says noindex ("${xRobots}")`);

  const want = features(deployed.body);
  const got  = features(live.body);
  if (got.title !== want.title) problems.push(`title mismatch: live "${got.title.slice(0, 60)}" vs deployed source "${want.title.slice(0, 60)}"`);
  if (got.canonical !== want.canonical) problems.push(`canonical mismatch: live "${got.canonical}" vs "${want.canonical}"`);
  if (got.description !== want.description) problems.push(`meta description differs from deployed source`);
  if (got.noindex && !want.noindex) problems.push(`live page is noindex but deployed source is not`);
  if (want.hasH1 && !got.hasH1) problems.push(`deployed source has an <h1>, live page does not`);

  if (problems.length) fail(`${url}: ${problems.join('; ')}`);
  else pass(`${url}`);
}

// ── sampling ────────────────────────────────────────────────────────────────

function sample(urls) {
  if (ALL) return urls;
  const groups = new Map();
  for (const u of urls) {
    let seg;
    try { seg = new URL(u).pathname.split('/').filter(Boolean)[0] || '(root)'; } catch { continue; }
    if (!groups.has(seg)) groups.set(seg, []);
    groups.get(seg).push(u);
  }
  const picked = new Set([BASE + '/']);
  for (const [, list] of groups) {
    const idx = new Set([0, Math.floor(list.length / 2), list.length - 1]);
    // widen deterministically for --per-group > 3: spread evenly
    for (let k = 0; k < PER_GROUP; k++) idx.add(Math.floor(k * list.length / PER_GROUP));
    [...idx].slice(0, Math.max(PER_GROUP, 3)).forEach(i => picked.add(list[i]));
  }
  return [...picked];
}

// ── main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`verify-production — ${BASE} vs origin/main${ALL ? ' (--all)' : ''}`);

  const deployedSitemap = gitShow('sitemap.xml');
  if (!deployedSitemap) {
    console.error('  ❌ cannot read origin/main:sitemap.xml — run `git fetch` first');
    process.exit(1);
  }
  const expectedLocs = [...deployedSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

  section('robots.txt');
  {
    const r = await get(BASE + '/robots.txt');
    if (r.status !== 200) fail(`/robots.txt: HTTP ${r.status || 'ERR'}`);
    else if (!/^sitemap:/im.test(r.body)) fail('/robots.txt: no Sitemap: line');
    else ok('/robots.txt serves and references a sitemap');
  }

  section('sitemap.xml');
  let liveLocs = expectedLocs;
  {
    const r = await get(BASE + '/sitemap.xml');
    if (r.status !== 200) {
      fail(`/sitemap.xml: HTTP ${r.status || 'ERR'}`);
    } else {
      liveLocs = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
      const liveSet = new Set(liveLocs), wantSet = new Set(expectedLocs);
      const missing = expectedLocs.filter(u => !liveSet.has(u));
      const extra   = liveLocs.filter(u => !wantSet.has(u));
      if (!missing.length && !extra.length) {
        ok(`live sitemap matches origin/main (${liveLocs.length} URLs)`);
      } else {
        fail(`live sitemap differs from origin/main: ${missing.length} missing, ${extra.length} extra (cache lag? re-run after ~4h)`);
        missing.slice(0, 5).forEach(u => console.log(`      missing live: ${u}`));
        extra.slice(0, 5).forEach(u => console.log(`      extra live:   ${u}`));
      }
    }
  }

  section('pages (live output vs origin/main source)');
  const urls = sample(expectedLocs);
  console.log(`  checking ${urls.length} of ${expectedLocs.length} sitemap URL(s)...`);
  let done = 0;
  await pool(urls, async u => {
    await verifyPage(u);
    if (++done % 25 === 0) console.log(`  ...${done}/${urls.length}`);
  });

  console.log('\n' + '═'.repeat(56));
  if (failures) {
    console.log(`  ❌ verify-production: ${failures} failure(s) across ${checked} check(s)`);
    console.log('     (fresh deploy? Cloudflare cache can lag ~4h — re-run before acting)');
    console.log('═'.repeat(56));
    process.exit(1);
  }
  console.log(`  ✅ verify-production: production matches origin/main (${checked} check(s))`);
  console.log('═'.repeat(56));
})();
