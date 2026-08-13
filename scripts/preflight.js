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

const ROOT = path.join(__dirname, '..');
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

// ---------------------------------------------------------------------------
const files = walkHtml(ROOT).map(f => path.relative(ROOT, f).replace(/\\/g, '/'));
console.log(`preflight: ${files.length} HTML page(s)\n`);

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
section('No duplicate inline author/publisher blobs');
{
  const offenders = [];
  for (const f of files) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // an author/publisher whose value carries @type instead of a bare @id
    if (/"(author|publisher)":\s*\{\s*"@type"/.test(h)) offenders.push(f);
  }
  if (offenders.length) offenders.slice(0, 10).forEach(f => fail(`${f} carries an inline author/publisher blob — should reference the shared @id`));
  else pass('Every author/publisher is an @id reference');
}

// 4. Articles carry exactly one byline and one disclosure --------------------
section('Article byline + AI disclosure');
{
  const arts = files.filter(f => f.startsWith('articles/') && !f.endsWith('/index.html'));
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
section('Theme default consistency');
{
  const optIn = [];
  for (const f of files) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!/lpTheme/.test(h)) continue;
    // opting IN to dark means the page defaults LIGHT while the rest defaults DARK
    if (/lpTheme'\)\s*===\s*'dark'/.test(h) || /lpTheme'\)==='dark'/.test(h) || /\bt\s*===\s*'dark'/.test(h) || /\bt==='dark'/.test(h)) {
      optIn.push(f);
    }
  }
  if (optIn.length) optIn.slice(0, 10).forEach(f => fail(`${f}: defaults to LIGHT (tests === 'dark'); site default is dark`));
  else pass('Every themed page defaults to dark');
}

// 6. Internal links resolve on disk -----------------------------------------
section('Internal links resolve');
{
  const missing = new Map();
  for (const f of files) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const dir = path.dirname(f);
    for (const m of h.matchAll(/href="([^"#?][^"]*)"/g)) {
      let href = m[1];
      if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(href)) continue;
      href = href.split('#')[0].split('?')[0];
      if (!href) continue;
      const target = href.startsWith('/') ? path.join(ROOT, href) : path.join(ROOT, dir, href);
      const ok = fs.existsSync(target)
        || fs.existsSync(target + '.html')
        || fs.existsSync(path.join(target, 'index.html'));
      if (!ok) {
        const key = `${href}`;
        if (!missing.has(key)) missing.set(key, []);
        missing.get(key).push(f);
      }
    }
  }
  if (missing.size) {
    [...missing].slice(0, 12).forEach(([href, where]) =>
      fail(`broken link "${href}" on ${where.length} page(s), e.g. ${where[0]}`));
  } else pass('All internal links resolve');
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

// ---------------------------------------------------------------------------
console.log('\n' + '═'.repeat(56));
if (failures) {
  console.log(`  ❌ preflight: ${failures} failure(s)`);
  console.log('═'.repeat(56));
  process.exit(1);
}
console.log('  ✅ preflight: all structural page checks passed');
console.log('═'.repeat(56));
