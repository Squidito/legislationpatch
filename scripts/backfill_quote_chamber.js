#!/usr/bin/env node
// backfill_quote_chamber.js
//
// Bill `featured_quotes` (in cache.json) historically stored only
// name/party/state/bioguideId/text/stance — no chamber — while standalone
// floor quotes (quotes.json) encode the chamber in their `source` string. That
// asymmetry is why carousel taglines were inconsistent. Featured quotes are
// just the higher-scoring controversy quotes; they should carry the same
// fields. This adds a structured `chamber` ("House" | "Senate") to every quote
// that can be resolved, so the tagline can render uniformly.
//
// Resolution order: bioguideId -> reps-index role, then the "Rep."/"Sen." name
// prefix, then (quotes.json only) the "House/Senate Floor" source prefix.
//
// Dry-run by default; pass --apply to write cache.json + quotes.json.

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const CACHE      = path.join(ROOT, 'data', 'cache.json');
const QUOTES     = path.join(ROOT, 'data', 'quotes.json');
const REPS_INDEX = path.join(ROOT, 'data', 'reps-index.json');
const APPLY      = process.argv.includes('--apply');

// --- bioguideId -> chamber map from reps-index.json ---
const idx = JSON.parse(fs.readFileSync(REPS_INDEX, 'utf8'));
const chamberById = new Map();
for (const state of Object.keys(idx)) {
  for (const rep of idx[state]) {
    if (!rep.bioguideId) continue;
    const role = (rep.role || '').toLowerCase();
    let chamber = '';
    if (role.includes('senator')) chamber = 'Senate';
    else if (role.includes('representative') || role.includes('delegate') || role.includes('commissioner')) chamber = 'House';
    else if (rep.district != null) chamber = 'House';
    if (chamber) chamberById.set(rep.bioguideId, chamber);
  }
}

function chamberFromName(name) {
  if (!name) return '';
  if (/^\s*Sen\./i.test(name)) return 'Senate';
  if (/^\s*Rep\./i.test(name)) return 'House';
  return '';
}
function chamberFromSource(source) {
  if (!source) return '';
  if (/^\s*Senate\b/i.test(source)) return 'Senate';
  if (/^\s*House\b/i.test(source))  return 'House';
  return '';
}

function resolveChamber(q) {
  return (q.bioguideId && chamberById.get(q.bioguideId))
    || chamberFromName(q.name)
    || chamberFromSource(q.source)
    || '';
}

const stats = { set: 0, already: 0, unresolved: [] };

function backfillQuote(q, label) {
  const chamber = resolveChamber(q);
  if (!chamber) { stats.unresolved.push(`${label}: ${q.name || '(no name)'} [${q.bioguideId || 'no-id'}]`); return; }
  if (q.chamber === chamber) { stats.already++; return; }
  q.chamber = chamber;
  stats.set++;
}

// --- cache.json featured_quotes (+ any division-level) ---
const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
for (const bill of cache.bills) {
  (bill.featured_quotes || []).forEach(q => backfillQuote(q, bill.id));
  (bill.divisions || []).forEach(d =>
    (d.featured_quotes || []).forEach(q => backfillQuote(q, `${bill.id}/${d.divisionKey || ''}`)));
}

// --- quotes.json standalone quotes ---
const quotesData = JSON.parse(fs.readFileSync(QUOTES, 'utf8'));
const quotesArr  = Array.isArray(quotesData) ? quotesData : (quotesData.quotes || []);
quotesArr.forEach((q, i) => backfillQuote(q, `quotes.json[${i}]`));

console.log(`reps-index chamber map: ${chamberById.size} bioguide IDs`);
console.log(`chamber set: ${stats.set} | already correct: ${stats.already} | unresolved: ${stats.unresolved.length}`);
if (stats.unresolved.length) {
  console.log('UNRESOLVED (left without chamber — will fall back to plain "Floor" at render):');
  stats.unresolved.forEach(u => console.log('  - ' + u));
}

if (APPLY) {
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n');
  fs.writeFileSync(QUOTES, JSON.stringify(quotesData, null, 2) + '\n');
  console.log('\n✅ Wrote cache.json + quotes.json');
} else {
  console.log('\n(dry run — re-run with --apply to write)');
}
