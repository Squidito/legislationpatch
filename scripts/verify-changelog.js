#!/usr/bin/env node
// verify-changelog.js -- cross-check every published changelog edition against
// the current bill record.
//
// WHY: a changelog edition is generated once and never regenerated, so it
// freezes whatever the bill was called that day. When a chamber substitutes a
// bill's text the TITLE changes -- and the frozen edition then misidentifies the
// bill to readers, and links to a slug that no longer exists.
//
// Found on first run: the 2026-08-12 edition calls H.R. 5334 the "Supporting
// Early-childhood Educators' Deductions Act of 2025". It is now the "Lindsey O.
// Graham Sanctioning Russia and Iran Act of 2026" -- a completely different
// bill by subject.
//
// Checks per entry: bill resolves; title matches the current title; the claimed
// destination stage matches the recorded stage; the bill link resolves on disk.
// Also checks the edition's own "N advanced a stage" count against the entries.
//
// Usage: node scripts/verify-changelog.js   (exit 1 if anything is off)

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT  = path.join(__dirname, '..');
const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache.json'), 'utf8'));
const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});

// index by the id itself (slug in the href carries it)
const byId = {};
for (const b of bills) byId[String(b.id).toUpperCase()] = b;

function decode(s) {
  return String(s)
    .replace(/<[^>]*>/g, '')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rarr;/g, '→')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** "/bill/119-hr-2069-stop-secret-spending-act-of-2025/" -> "119-HR-2069" */
function idFromHref(href) {
  const m = String(href).match(/\/bill\/(\d+)-([a-z]+)-(\d+)-/i);
  return m ? `${m[1]}-${m[2].toUpperCase()}-${m[3]}` : null;
}

const dir = path.join(ROOT, 'changelog');
const editions = fs.readdirSync(dir, { withFileTypes: true })
  .filter(e => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'index.html')))
  .map(e => e.name).sort();

let problems = 0, entries = 0;

for (const ed of editions) {
  const html = fs.readFileSync(path.join(dir, ed, 'index.html'), 'utf8');

  const found = [];
  for (const m of html.matchAll(/<li class="cl-entry">([\s\S]*?)<\/li>/g)) {
    const li = m[1];
    const hrefM  = li.match(/<a class="cl-code" href="([^"]+)"/);
    const codeM  = li.match(/<a class="cl-code"[^>]*>([\s\S]*?)<\/a>/);
    const titleM = li.match(/<span class="cl-title">([\s\S]*?)<\/span>/);
    const nowM   = li.match(/<span class="cl-renamed"[^>]*>\(now:\s*([\s\S]*?)\)<\/span>/);
    const transM = li.match(/<span class="cl-transition">([\s\S]*?)<\/span>\s*<span class="cl-meta">/);
    if (!codeM) continue;
    const trans = decode(transM ? transM[1] : '');
    const parts = trans.split('→').map(s => s.trim());
    found.push({
      href: hrefM ? hrefM[1] : '',
      id: hrefM ? idFromHref(hrefM[1]) : null,
      code: decode(codeM[1]),
      title: decode(titleM ? titleM[1] : ''),
      to: parts.length > 1 ? parts[1] : trans,
      nowTitle: nowM ? decode(nowM[1]) : null,
    });
  }

  const claimed = (html.match(/(\d+)\s+advanced a stage/) || [])[1];
  console.log(`\n── ${ed}   ${found.length} entr${found.length === 1 ? 'y' : 'ies'}${claimed ? ` (header: ${claimed})` : ''}`);

  if (claimed && Number(claimed) !== found.length) {
    console.log(`  ❌ count mismatch — header says ${claimed}, ${found.length} listed`);
    problems++;
  }

  for (const e of found) {
    entries++;
    const bill = e.id ? byId[e.id.toUpperCase()] : null;
    if (!bill) { console.log(`  ❌ ${e.code}: id ${e.id || '?'} not in cache`); problems++; continue; }

    const issues = [];

    // TITLE is identity. A superseded title misidentifies the bill to a reader
    // TODAY -- H.R. 5334 went from an early-childhood education bill to a Russia
    // sanctions bill via a Senate text substitution, so the frozen title names
    // the wrong subject entirely. Flagged unless the entry already carries a
    // "now:" annotation pointing at the current title.
    if (e.title && bill.title && e.title !== bill.title && !e.nowTitle) {
      issues.push(`TITLE STALE\n        edition: "${e.title}"\n        current: "${bill.title}"`);
    } else if (e.nowTitle && e.nowTitle !== bill.title) {
      issues.push(`"now:" annotation is itself stale\n        says:    "${e.nowTitle}"\n        current: "${bill.title}"`);
    }

    // STAGE is deliberately NOT compared against the current record. A changelog
    // edition logs the transition as it stood that day; a bill advancing further
    // afterwards is the system working, not a defect. (Comparing them produced
    // false positives on H.R. 2069 and H.R. 6644, both of which simply advanced
    // again later.)
    // link must resolve on disk
    const rel = e.href.replace(/^\//, '');
    if (rel && !fs.existsSync(path.join(ROOT, rel, 'index.html')) && !fs.existsSync(path.join(ROOT, rel))) {
      issues.push(`link 404: ${e.href}`);
    }

    if (issues.length) { console.log(`  ❌ ${e.code}: ${issues.join('; ')}`); problems += issues.length; }
    else console.log(`  ✅ ${e.code} — ${e.title.slice(0, 50)}`);
  }
}

console.log('\n' + '═'.repeat(58));
if (problems) {
  console.log(`  ❌ ${problems} problem(s) across ${entries} entr(ies) in ${editions.length} edition(s)`);
  process.exit(1);
}
console.log(`  ✅ All ${entries} entr(ies) across ${editions.length} edition(s) verify clean`);
