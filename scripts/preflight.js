#!/usr/bin/env node
// preflight.js -- structural checks across every rendered HTML page.
//
// WHY: validate-batch.js checks the DATA (cache.json, bill text, quotes). Nothing
// checked the PAGES. The entity migration touched 258 files and the only proof it
// worked was spot-checking one article and one bill page by hand. That is exactly
// how something ships broken and nobody notices.
//
// First run of this script found a real bug: `#website` was referenced by two
// pages via isPartOf but defined nowhere, and the homepage was still emitting an
// unlinked duplicate Organization -- silently undermining the entity work.
//
// These are STATIC checks (no browser). Rendered checks -- horizontal overflow,
// console errors -- live in preflight-render.js because they need a real layout.
//
// Usage:
//   node scripts/preflight.js           # exit 1 on any failure
//   node scripts/preflight.js --verbose # list every page checked

'use strict';

const fs   = require('fs');
const path = require('path');
const entity = require('./lib/entity.js');

const ROOT = path.join(__dirname, '..');

// Hosts that mean "this site". A link to https://legislationpatch.com/x is an
// INTERNAL link written the long way -- it was being skipped as "external" and
// never resolved, so 93 absolute author links and every absolute bill link on
// the redirect stubs were unchecked.
const SELF_HOSTS = new Set(['legislationpatch.com', 'www.legislationpatch.com']);

// U+201C / U+201D, written as escapes so this file does not itself contain the
// character it is hunting. The Edit-tool corruption class from CLAUDE.md.
const CURLY_CLASS = '[\\u201C\\u201D]';
const CURLY = new RegExp(CURLY_CLASS);
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');

// docs/ holds rulebooks and the article template — reference material, not
// served pages. The template's relative paths are written for articles/, so
// checking them here would always fail.
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'og', 'data', 'scripts', 'archive', '.playwright-mcp', 'docs']);

let failures = 0;
let checks = 0;

function section(t) { console.log(`\n── ${t}`); }
function pass(m)  { console.log(`  ✅ ${m}`); }
function fail(m)  { console.log(`  ❌ ${m}`); failures++; }
function warn(m)  { console.log(`  ⚠️  ${m}`); }

/**
 * A draft is an article that has not moved yet. drafts/<slug>.html is written
 * with the exact relative paths it will have at articles/<slug>.html, so
 * publishing is a move with no rewriting -- which means every structural check
 * here must judge a draft AS an article, resolving its links from articles/.
 * Checking a draft against its own directory would report broken links for
 * paths that are correct, and would skip the byline/disclosure checks entirely.
 */
const isArticle = f => f.startsWith('articles/') || f.startsWith('drafts/');
const linkBase  = f => (f.startsWith('drafts/') ? 'articles' : path.dirname(f));

function walkHtml(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walkHtml(p, acc);
    } else if (e.name.endsWith('.html')) {
      acc.push(p);
    }
  }
  return acc;
}

function jsonLdBlocks(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].trim();
    // An empty block is a placeholder populated by JS at runtime
    // (e.g. rep.html's <script id="rep-schema">), not malformed markup.
    if (!raw) continue;
    out.push({ raw });
  }
  return out;
}

function nodesOf(parsed) {
  return parsed['@graph'] || (Array.isArray(parsed) ? parsed : [parsed]);
}

/**
 * A noindex / meta-refresh redirect stub. Slug-change redirects and the search
 * page render no chrome and are deliberately kept out of the index, so the
 * checks about reader-facing structure do not apply to them. Everything ELSE
 * is checked -- "has nothing to check" must never mean "passes".
 */
function isStub(html) {
  return /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html)
      || /http-equiv=["']refresh["']/i.test(html);
}

// ---------------------------------------------------------------------------
const allHtml = walkHtml(ROOT).map(f => path.relative(ROOT, f).replace(/\\/g, '/'));
// drafts/topic-*.html are hub-prose FRAGMENTS, not pages: no head, no byline,
// no theme bootstrap by design. Page-shaped checks would all false-fail; their
// content is gated by the article-lane audit + qa-receipts instead.
const fragments = allHtml.filter(f => /^drafts\/topic-[a-z0-9-]+\.html$/.test(f));
const files = allHtml.filter(f => !fragments.includes(f));
console.log(`preflight: ${files.length} HTML page(s)` + (fragments.length ? ` (+${fragments.length} hub-prose fragment(s) exempt from page checks)` : '') + '\n');

// 1. Every JSON-LD block must parse ------------------------------------------
section('JSON-LD parses');
{
  const broken = [];
  for (const f of files) {
    for (const b of jsonLdBlocks(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
      checks++;
      try { JSON.parse(b.raw); } catch (e) { broken.push(`${f}: ${e.message.slice(0, 60)}`); }
    }
  }
  if (broken.length) broken.slice(0, 10).forEach(b => fail(b));
  else pass(`All JSON-LD blocks parse (${checks} block(s))`);
}

// 1b. Smart quotes must never appear in MARKUP ------------------------------
// This is the check that protects the other checks. A curly quote where an
// attribute delimiter belongs (id=<curly>x<curly>) means the browser no longer
// sees that attribute -- and neither do the regexes below, so the element
// silently drops out of checks 3, 6 and 7 while everything reports green.
// Corruption converting checked markup into UNCHECKED markup is worse than
// corruption that breaks loudly.
//
// Prose is left alone: curly quotes in body text and in human-readable
// attribute values (descriptions, titles, og:*) are correct typography. Only
// delimiter positions and machine-read values are flagged.
section('No smart quotes in markup');
{
  const bad = [];
  // attributes whose values are machine-read -- a curly quote in any of these
  // is corruption, never typography
  const STRUCTURAL_ATTR = /\b(href|src|class|id|rel|type|itemprop|property|hreflang|charset)\s*=\s*"([^"]*)"/gi;

  for (const f of files) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');

    // (a) a curly quote used as an attribute delimiter
    const delim = new RegExp(`=\\s*${CURLY_CLASS}`, 'g');
    for (const m of h.matchAll(delim)) {
      const line = h.slice(0, m.index).split('\n').length;
      bad.push(`${f}:${line}: smart quote used as an attribute delimiter — the attribute is invisible to browsers AND to this gate`);
    }

    // (b) a curly quote inside a structural attribute value
    for (const m of h.matchAll(STRUCTURAL_ATTR)) {
      if (!CURLY.test(m[2])) continue;
      const line = h.slice(0, m.index).split('\n').length;
      bad.push(`${f}:${line}: smart quote inside ${m[1]}="..." — machine-read value, must be ASCII`);
    }

    // (c) a curly quote in JSON-LD keys or machine-read values. Malformed
    // blocks are check 1's job; this catches the ones that still PARSE, where
    // a stray curly quote inside an @id silently breaks entity resolution.
    for (const b of jsonLdBlocks(h)) {
      let parsed; try { parsed = JSON.parse(b.raw); } catch { continue; }
      const MACHINE_KEY = /^(@id|@type|@context|url|identifier|sameAs|logo|image|contentUrl|target|urlTemplate)$/;
      const visit = n => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(visit);
        for (const [k, v] of Object.entries(n)) {
          if (CURLY.test(k)) bad.push(`${f}: smart quote in JSON-LD key "${k}"`);
          if (typeof v === 'string' && MACHINE_KEY.test(k) && CURLY.test(v)) {
            bad.push(`${f}: smart quote in JSON-LD ${k} value "${v.slice(0, 60)}"`);
          }
          if (v && typeof v === 'object') visit(v);
        }
      };
      nodesOf(parsed).forEach(visit);
    }
  }

  if (bad.length) bad.slice(0, 10).forEach(b => fail(b));
  else pass(`No smart quotes in markup across ${files.length} page(s)`);
}

// 2. Every @id reference must resolve to a node defined somewhere ------------
section('Entity @id references resolve');
{
  const defined = new Set();
  const referenced = new Map();

  for (const f of files) {
    for (const b of jsonLdBlocks(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
      let parsed; try { parsed = JSON.parse(b.raw); } catch { continue; }
      const visit = n => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(visit);
        // a node WITH @type defines its @id; a bare {@id} is a reference
        if (n['@id'] && n['@type']) defined.add(n['@id']);
        if (n['@id'] && !n['@type']) {
          if (!referenced.has(n['@id'])) referenced.set(n['@id'], []);
          referenced.get(n['@id']).push(f);
        }
        for (const v of Object.values(n)) if (v && typeof v === 'object') visit(v);
      };
      nodesOf(parsed).forEach(visit);
    }
  }

  let bad = 0;
  for (const [id, where] of referenced) {
    if (!defined.has(id)) {
      bad++;
      fail(`unresolved @id "${id}" — referenced by ${where.length} page(s), e.g. ${where[0]}`);
    } else if (VERBOSE) {
      pass(`${id} <- ${where.length} page(s)`);
    }
  }
  if (!bad) pass(`All ${referenced.size} distinct @id reference(s) resolve (${defined.size} nodes defined)`);
}

// 3. No page may re-declare the shared entities inline -----------------------
// Was a raw regex on the file text: /"(author|publisher)":\s*\{\s*"@type"/.
// That matched exactly one serialization. It missed key order
// ({"name":"X","@type":"Organization"}), single-quoted JSON, line breaks
// between the brace and the first key -- and it did not look at isPartOf at
// all, which is how five inline anonymous WebSite blobs sat in the corpus
// after the entity migration was declared complete.
//
// Now it parses the JSON-LD and inspects the actual values, so serialization
// cannot hide anything.
section('No duplicate inline author/publisher/website blobs');
{
  // the three slots that must resolve to the site's canonical shared entities
  const SHARED_SLOT = new Set(['author', 'publisher', 'isPartOf']);
  const offenders = [];

  for (const f of files) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const b of jsonLdBlocks(h)) {
      let parsed; try { parsed = JSON.parse(b.raw); } catch { continue; }
      const visit = n => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(visit);
        for (const [k, v] of Object.entries(n)) {
          if (SHARED_SLOT.has(k) && v && typeof v === 'object' && !Array.isArray(v) && v['@type']) {
            offenders.push(`${f}: ${k} is an inline ${v['@type']} blob — must be a bare {"@id": ...} reference`);
          }
          if (v && typeof v === 'object') visit(v);
        }
      };
      nodesOf(parsed).forEach(visit);
    }
  }
  if (offenders.length) offenders.slice(0, 10).forEach(o => fail(o));
  else pass('Every author, publisher and isPartOf is an @id reference');
}

// 4. Articles carry exactly one byline and one disclosure --------------------
section('Article byline + AI disclosure');
{
  const arts = files.filter(f => isArticle(f) && !f.endsWith('/index.html'));
  const noByline = [], badDisc = [], outside = [];
  for (const f of arts) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!/By <a href="[^"]*\/author\/[^"]*"[^>]*rel="author"/.test(h)) noByline.push(f);
    const n = (h.match(/class="article-disclosure"/g) || []).length;
    if (n !== 1) badDisc.push(`${f} (${n})`);
    else {
      const bodyStart = h.indexOf('class="article-body"');
      const artEnd    = h.indexOf('</article>');
      const dIdx      = h.indexOf('class="article-disclosure"');
      if (!(dIdx > bodyStart && dIdx < artEnd)) outside.push(f);
    }
  }
  if (noByline.length) noByline.forEach(f => fail(`${f}: missing linked author byline`));
  if (badDisc.length)  badDisc.forEach(f => fail(`${f}: expected exactly 1 disclosure`));
  if (outside.length)  outside.forEach(f => fail(`${f}: disclosure is outside .article-body`));
  if (!noByline.length && !badDisc.length && !outside.length) pass(`All ${arts.length} article(s) have a linked byline and one in-body disclosure`);
}

// 5. Theme default must be consistent (dark) --------------------------------
// `if (!/lpTheme/.test(h)) continue` was a silent skip: a page that lost its
// theme bootstrap entirely -- the actual defect, a flash of light on a
// dark-default site -- passed by having nothing to check.
//
// The presence test is POSITIONAL, because presence alone cannot tell a
// bootstrap from a toggle: nearly every page also carries a theme toggle that
// mentions lpTheme and calls setAttribute('data-theme') too. A page that lost
// its bootstrap but kept its toggle flashes light on every load and would
// still satisfy any presence test. What makes it a bootstrap is running
// BEFORE the first rendered element -- so that is what is checked. All 278
// non-stub pages satisfy it today; noindex/redirect stubs render no chrome
// and are legitimately exempt.
section('Theme default consistency');
{
  const optIn = [], noTheme = [];
  for (const f of files) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const setsTheme  = h.match(/setAttribute\(\s*['"]data-theme['"]/);
    const firstPaint = h.match(/<(header|main)\b/);
    const bootstrapped = /lpTheme/.test(h) && setsTheme && firstPaint && setsTheme.index < firstPaint.index;
    if (!bootstrapped) {
      if (!isStub(h)) noTheme.push(f);
      continue;
    }
    // opting IN to dark means the page defaults LIGHT while the rest defaults DARK
    if (/lpTheme'\)\s*===\s*'dark'/.test(h) || /lpTheme'\)==='dark'/.test(h) || /\bt\s*===\s*'dark'/.test(h) || /\bt==='dark'/.test(h)) {
      optIn.push(f);
    }
  }
  if (optIn.length) optIn.slice(0, 10).forEach(f => fail(`${f}: defaults to LIGHT (tests === 'dark'); site default is dark`));
  if (noTheme.length) noTheme.slice(0, 10).forEach(f => fail(`${f}: no pre-paint theme bootstrap — will flash light on a dark-default site`));
  if (!optIn.length && !noTheme.length) pass('Every themed page defaults to dark');
}

// 6. Internal links resolve on disk -----------------------------------------
// Two widenings over the original:
//   - href='...' (single quotes) is matched, not just href="...".
//   - https://legislationpatch.com/x is an INTERNAL link written absolutely.
//     It was skipped by the blanket `^https?:` external test, leaving 93
//     absolute author links and every absolute bill link on the redirect
//     stubs -- exactly the links a slug rename breaks -- unverified.
section('Internal links resolve');
{
  const missing = new Map();
  let checked = 0;

  /** null = not ours (external, mailto:, ...). Otherwise a site-root path. */
  function toSitePath(href, dir) {
    if (/^(mailto:|tel:|data:|javascript:)/i.test(href)) return null;
    let rest = href;
    if (/^(https?:)?\/\//i.test(href)) {
      let u; try { u = new URL(href, 'https://legislationpatch.com'); } catch { return null; }
      if (!SELF_HOSTS.has(u.hostname.toLowerCase())) return null;
      rest = u.pathname;
    }
    rest = rest.split('#')[0].split('?')[0];
    if (!rest) return null;                       // pure #anchor or ?query
    return rest.startsWith('/') ? rest : path.posix.join('/', dir === '.' ? '' : dir, rest);
  }

  for (const f of files) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const dir = linkBase(f);
    // A draft's canonical points at the articles/ URL it will occupy once
    // James publishes it. That target is SUPPOSED to be absent -- if it already
    // existed the draft would be overwriting a live article. Its own future
    // path is the one link exempted; every other link on the page is checked.
    const selfPath = f.startsWith('drafts/') ? '/' + f.replace(/^drafts\//, 'articles/') : null;
    for (const m of h.matchAll(/href=(?:"([^"]*)"|'([^']*)')/g)) {
      const sitePath = toSitePath(m[1] !== undefined ? m[1] : m[2], dir);
      if (!sitePath || sitePath === selfPath) continue;
      checked++;
      const target = path.join(ROOT, sitePath);
      const ok = fs.existsSync(target)
        || fs.existsSync(target + '.html')
        || fs.existsSync(path.join(target, 'index.html'));
      if (!ok) {
        if (!missing.has(sitePath)) missing.set(sitePath, []);
        missing.get(sitePath).push(f);
      }
    }
  }
  if (missing.size) {
    [...missing].slice(0, 12).forEach(([href, where]) =>
      fail(`broken link "${href}" on ${where.length} page(s), e.g. ${where[0]}`));
  } else pass(`All internal links resolve (${checked} checked)`);
}

// 7. Trust surfaces are reachable from every footer -------------------------
section('Footer trust links');
{
  const bad = [];
  for (const f of files) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = h.match(/<p class="footer-links">([\s\S]*?)<\/p>/);
    if (!m) continue;
    for (const req of ['about', 'corrections', 'editorial-standards']) {
      if (!m[1].includes(req)) bad.push(`${f}: footer missing ${req}`);
    }
  }
  if (bad.length) bad.slice(0, 10).forEach(b => fail(b));
  else pass('Every footer links About, Corrections and Editorial Standards');
}

// 7b. Every indexable, non-redirect page is one click from Editorial Standards.
// The check above only validates pages that USE the <p class="footer-links">
// pattern -- a page with no trust footer at all (as articles/index.html once was)
// has no such block, so `if (!m) continue` skipped it entirely and it passed.
// Articles carry the link inline via their AI-disclosure line, not a footer block,
// so require the editorial-standards link itself in ANY markup. noindex /
// meta-refresh stubs (slug-change redirects, search) are legitimately exempt.
section('Editorial Standards reachable from every indexable page');
{
  const bad = [];
  for (const f of files) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (isStub(h)) continue;
    if (!/href="[^"]*editorial-standards/i.test(h)) {
      bad.push(`${f}: no link to Editorial Standards (orphaned from trust surfaces)`);
    }
  }
  if (bad.length) bad.slice(0, 10).forEach(b => fail(b));
  else pass('Every indexable page links to Editorial Standards');
}

// 8. Canonical + title present ----------------------------------------------
section('Canonical URL and title');
{
  const bad = [];
  for (const f of files) {
    if (f.startsWith('bill/')) continue; // generated, checked by their generator
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!/<title>[^<]{3,}<\/title>/.test(h)) bad.push(`${f}: missing/empty <title>`);
    // A noindex page needs no canonical -- it is deliberately kept out of the
    // index (user-specific views, thin fallbacks, internal demos).
    const noindex = /name="robots"[^>]*content="[^"]*noindex/.test(h);
    if (!noindex && !/rel="canonical"/.test(h)) bad.push(`${f}: missing canonical (and not noindex)`);
  }
  if (bad.length) bad.slice(0, 10).forEach(b => fail(b));
  else pass('All non-generated pages have a title and canonical');
}

// 8b. No two indexable pages may share a <title> ----------------------------
// Search engines treat byte-identical titles as duplicate-content signal and
// render indistinguishable SERP entries. This is not hypothetical here:
// companion bills (House + Senate versions of the same-named bill) generated
// four pairs of identical titles until generate_bill_pages.js learned to
// append the bill code. Check 8 skips bill/ pages ("checked by their
// generator") -- but uniqueness is a CROSS-page property no per-page generator
// can see, so every page is included here. Drafts are exempt: a draft
// legitimately carries the title of the article it is about to become.
section('Title uniqueness');
{
  const byTitle = new Map();
  for (const f of files) {
    if (f.startsWith('drafts/')) continue;
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (isStub(h)) continue;
    const t = (h.match(/<title>([^<]+)<\/title>/) || [])[1];
    if (!t) continue; // presence is check 8's job
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(f);
  }
  const dups = [...byTitle].filter(([, v]) => v.length > 1);
  if (dups.length) {
    dups.slice(0, 10).forEach(([t, v]) =>
      fail(`duplicate <title> "${t.slice(0, 70)}" on ${v.length} pages: ${v.slice(0, 3).join(', ')}`));
  } else pass(`All ${byTitle.size} indexable page titles are unique`);
}

// 8c. Every indexable page carries a real meta description -------------------
// The description is the SERP snippet; a missing one lets the engine pick
// arbitrary body text. NOTE the extraction regex pairs the quote style --
// content="..." may legitimately contain apostrophes ("Congress's"), so a
// naive [^"']* matcher truncates at the first apostrophe and false-flags.
section('Meta description present');
{
  const bad = [];
  for (const f of files) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (isStub(h)) continue;
    const tag = (h.match(/<meta[^>]*name=["']description["'][^>]*>/) || [])[0];
    const d = tag && ((tag.match(/content="([^"]*)"/) || tag.match(/content='([^']*)'/)) || [])[1];
    if (!d) bad.push(`${f}: no meta description`);
    else if (d.trim().length < 25) bad.push(`${f}: meta description too short (${d.trim().length} chars)`);
  }
  if (bad.length) bad.slice(0, 10).forEach(b => fail(b));
  else pass('Every indexable page has a meta description (25+ chars)');
}

// 8d. Sitemap and disk agree, both directions --------------------------------
// Direction A: a sitemap URL with no file behind it is a promised page that
// 404s to crawlers. Direction B: an indexable page absent from the sitemap is
// discoverable only by link-crawling -- bills.html sat outside the sitemap for
// a month this way. Drafts are exempt from B (unpublished by definition).
section('Sitemap ↔ disk');
{
  const smPath = path.join(ROOT, 'sitemap.xml');
  if (!fs.existsSync(smPath)) {
    fail('sitemap.xml missing from repo root');
  } else {
    const locs = [...fs.readFileSync(smPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    const onDisk = new Set();
    const ghost = [];
    for (const u of locs) {
      let rel;
      try { rel = decodeURIComponent(new URL(u).pathname).replace(/^\//, ''); } catch { ghost.push(u); continue; }
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      // extensionless URLs (/author/james-shearn) may be backed by either
      // <rel>.html or <rel>/index.html -- and a bare <rel> that exists as a
      // DIRECTORY must not count, or the page it contains is never credited.
      const isFile = c => { try { return fs.statSync(path.join(ROOT, c)).isFile(); } catch { return false; } };
      const hit = [rel, rel + '.html', rel.replace(/\.html$/, '') + '/index.html']
        .find(isFile);
      if (!hit) ghost.push(u);
      else onDisk.add(hit);
    }
    if (ghost.length) ghost.slice(0, 10).forEach(u => fail(`sitemap URL has no file on disk: ${u}`));
    else pass(`All ${locs.length} sitemap URLs resolve to files on disk`);

    const orphan = [];
    for (const f of files) {
      if (f.startsWith('drafts/')) continue;
      if (isStub(fs.readFileSync(path.join(ROOT, f), 'utf8'))) continue;
      if (!onDisk.has(f)) orphan.push(f);
    }
    if (orphan.length) orphan.slice(0, 10).forEach(f => fail(`indexable page not in sitemap: ${f}`));
    else pass('Every indexable page is in the sitemap');
  }
}

// 8e. Rep-page district geography traces to the fetched Census files --------
// The composition blocks assert county/place facts; qa-geo-verify.js re-derives
// every name and whole/partial flag from the raw relationship files in
// data/geo-src/ (the figure-sourcing-guard pattern, applied to geography).
section('District geography sourcing');
{
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'qa-geo-verify.js')], { stdio: 'pipe' });
    pass('Every district composition claim traces to data/geo-src/');
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    const lines = out.split('\n').filter(l => l.includes('❌') && !/failure\(s\)/.test(l));
    if (lines.length) lines.slice(0, 8).forEach(l => fail(l.trim().replace(/^❌\s*/, '')));
    else fail(`qa-geo-verify failed: ${String(e.message).slice(0, 90)}`);
  }
}

// 9. Published changelog editions still identify their bills correctly ------
// Editions are generated once and never rebuilt, so a later bill rename leaves
// them frozen. H.R. 5334 was published as an early-childhood education bill and
// is now a Russia sanctions bill; the edition named the wrong subject entirely.
section('Changelog editions vs current bill record');
{
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'verify-changelog.js')], { stdio: 'pipe' });
    pass('Every changelog entry matches the current bill record');
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    const lines = out.split('\n').filter(l => l.includes('❌') && !/problem\(s\) across/.test(l));
    if (lines.length) lines.slice(0, 8).forEach(l => fail(l.trim().replace(/^❌\s*/, '')));
    else fail(`verify-changelog failed: ${String(e.message).slice(0, 90)}`);
  }
}

// 10. Article card summaries still match the articles they link to ----------
// Card summaries are hand-written in data/articles-index.json; the articles they
// describe are refreshed by publish-article.js. Nothing tied the two together,
// so the refresh lane twice shipped a card frozen at figures its article had
// moved past. The card is the first thing a reader sees on /articles/.
section('Article card summaries vs their articles');
{
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'verify-card-summaries.js')], { stdio: 'pipe' });
    pass('Every card summary figure appears in the article it links to');
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    const lines = out.split('\n').filter(l => l.includes('❌') && !/problem\(s\) across/.test(l));
    if (lines.length) lines.slice(0, 8).forEach(l => fail(l.trim().replace(/^❌\s*/, '')));
    else fail(`verify-card-summaries failed: ${String(e.message).slice(0, 90)}`);
  }
}

// 11. The trust pages' derived figures are still current --------------------
// articles/methodology.html, what-is-legislationpatch.html, how-we-track-voting,
// how-we-source-quotes and what-is-congressional-record publish counts about this
// site. Every one of those numbers is derived by scripts/generate-site-facts.js
// into data/ref-text/record-lp-site-facts.txt, which their audit ledgers quote as
// their receipt. A bill batch, a rep refresh or a change to validate-batch.js
// moves those numbers, and a stale sheet means a live page is now stating a
// figure the repository no longer supports.
//
// WARN, not fail, and deliberately so: this sheet moves on ordinary batch work,
// and the blocking teeth already exist one step later — qa-receipts and the
// qa-regression pre-commit gate both fail outright the moment a ledger receipt
// stops resolving against it. This line is the early prompt, not the gate.
section('Trust-page derived figures (site-facts sheet)');
{
  const { execFileSync } = require('child_process');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'generate-site-facts.js'), '--check'], { stdio: 'pipe' });
    pass('data/ref-text/record-lp-site-facts.txt matches the repository');
  } catch (e) {
    warn('data/ref-text/record-lp-site-facts.txt is STALE — the trust pages quote it. Re-run: node scripts/generate-site-facts.js --apply, then re-check the pages whose ledgers cite the changed lines.');
    const out = (String(e.stdout || '') + String(e.stderr || '')).split('\n').filter(l => /line \d+/.test(l));
    out.slice(0, 6).forEach(l => console.log('       ' + l.trim()));
  }
}

// 19. External citations resolve (D5) ---------------------------------------
// The section above this one checks 65,000 INTERNAL links. Nothing checked a
// single EXTERNAL one, and neither did the article audit lane -- which is how
// congressional-review-act passed the full first-refresh lane while two of its
// "Key Sources" pointed at nothing, and how the 2026-08 sweep found 17 dead
// citations live in trust boxes on indexed pages. FOURTEEN OF THE SEVENTEEN
// ANSWERED HTTP 200, serving an error page in the body, so a status-code checker
// would have passed every one of them.
//
// BLOCKING, and cheap: qa-citation-links.js reads a committed result cache and
// fetches only URLs that are new, expired or previously dead, so an unchanged
// corpus costs zero requests. It fails ONLY on positive evidence of death; bot
// walls (403), 5xx and transport errors are reported and never block, so a flaky
// connection cannot fail a commit.
//
// Offline escape hatch: PREFLIGHT_SKIP_LINKS=1 (or --skip-links) judges from the
// cache alone. It is a skip for working on a plane, not for working around a
// finding -- a URL the cache already knows is dead still fails.
section('External citations resolve');
{
  const { execFileSync } = require('child_process');
  const offline = process.env.PREFLIGHT_SKIP_LINKS === '1' || args.includes('--skip-links');
  const argv = [path.join(__dirname, 'qa-citation-links.js'), '--preflight'];
  if (offline) argv.push('--offline');
  try {
    const out = execFileSync(process.execPath, argv, { stdio: 'pipe', encoding: 'utf8' });
    out.split('\n').filter(l => l.trim()).forEach(l => console.log(l.replace(/^ {2}/, '  ')));
    if (offline) console.log('       (offline mode — cache only; run `npm run link-check` to re-verify)');
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    out.split('\n').filter(l => l.trim()).forEach(l => console.log('  ' + l.trim()));
    fail('external citation(s) do not resolve — see above');
  }
}

// ---------------------------------------------------------------------------
console.log('\n' + '═'.repeat(56));
if (failures) {
  console.log(`  ❌ preflight: ${failures} failure(s)`);
  console.log('═'.repeat(56));
  process.exit(1);
}
console.log('  ✅ preflight: all structural page checks passed');
console.log('═'.repeat(56));
