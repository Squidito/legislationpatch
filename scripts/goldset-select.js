// goldset-select.js — pick a stratified sample of bills for the accuracy gold set
// and write a blank label TEMPLATE per bill to data/gold-set/<id>.json.
//
// Stratification: all omnibus bills are force-included (highest error surface),
// then a round-robin across billType groups, taking the largest (most pages =
// most claims = most error surface) unlabeled bill from each type in turn. Fully
// deterministic. Never overwrites a file already marked candidate/adjudicated.
//
// Run:  npm run goldset:select -- --n 30   (default 30)

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const GOLD = path.join(DATA, 'gold-set');

const N = (() => {
  const i = process.argv.indexOf('--n');
  return i >= 0 ? Math.max(1, parseInt(process.argv[i + 1], 10) || 30) : 30;
})();

const cache = JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8'));
const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});

function primaryType(b) {
  const t = b.billType;
  return Array.isArray(t) ? (t[0] || 'amendment') : (t || 'amendment');
}
function isOmnibus(b) {
  return !!b.isOmnibus || (Array.isArray(b.divisions) && b.divisions.length > 0);
}

// ── Select ────────────────────────────────────────────────────────────────────

const picked = [];
const seen = new Set();

// 1. All omnibus bills first.
for (const b of bills) {
  if (!b.demo && isOmnibus(b) && !seen.has(b.id)) { picked.push(b); seen.add(b.id); }
}

// 2. Group the rest by type, largest-first within each group.
const groups = {};
for (const b of bills) {
  if (b.demo || seen.has(b.id)) continue;
  const t = primaryType(b);
  (groups[t] = groups[t] || []).push(b);
}
for (const t of Object.keys(groups)) {
  groups[t].sort((a, b) => (b.pages || 0) - (a.pages || 0) || String(a.id).localeCompare(String(b.id)));
}

// 3. Round-robin across types until we reach N.
const typeKeys = Object.keys(groups).sort();
let row = 0;
while (picked.length < N) {
  let added = false;
  for (const t of typeKeys) {
    const b = groups[t][row];
    if (b && !seen.has(b.id)) {
      picked.push(b); seen.add(b.id); added = true;
      if (picked.length >= N) break;
    }
  }
  if (!added) break; // pool exhausted
  row++;
}

const sample = picked.slice(0, N);

// ── Write templates ───────────────────────────────────────────────────────────

fs.mkdirSync(GOLD, { recursive: true });
let created = 0, keptExisting = 0;
for (const b of sample) {
  const fp = path.join(GOLD, `${b.id}.json`);
  if (fs.existsSync(fp)) {
    let cur = {};
    try { cur = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch (_) {}
    if (cur.status && cur.status !== 'template') { keptExisting++; continue; } // don't clobber real labels
  }
  const tmpl = {
    id: b.id,
    title: b.title || b.code || b.id,
    billType: b.billType || '',
    stage: b.stage || '',
    pages: b.pages || 0,
    status: 'template',
    labeledBy: '',
    labeledAt: '',
    sourceReadDepth: '',
    errors: [],
    verifiedCorrectClaims: 0,
    notes: '',
  };
  fs.writeFileSync(fp, JSON.stringify(tmpl, null, 2) + '\n');
  created++;
}

const byType = sample.reduce((o, b) => { const t = primaryType(b); o[t] = (o[t] || 0) + 1; return o; }, {});
const manifest = {
  selectedAt: new Date().toISOString(),
  n: sample.length,
  byType,
  ids: sample.map(b => b.id),
};
fs.writeFileSync(path.join(GOLD, '_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`goldset-select: ${sample.length} bills selected (${created} new template(s), ${keptExisting} already labeled).`);
console.log('  by type:', JSON.stringify(byType));
console.log('  → fill errors[] in data/gold-set/<id>.json with ground truth, set status="adjudicated".');
