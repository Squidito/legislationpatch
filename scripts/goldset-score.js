// goldset-score.js — report the measured accuracy from the gold-set labels.
//
//   PRODUCT ACCURACY (always): over the ADJUDICATED label files, how many bills
//   carry a material error, and the error breakdown by type. This is the real
//   answer to "how accurate is my info?" — it scores the analyses, not the QA.
//
//   QA RECALL/PRECISION (only if a run report data/gold-set/_run-<label>.json is
//   present): of the gold material errors, how many did that QA pass flag
//   (recall), and how many flags were real (precision). This scores the QA.
//
// Only status "adjudicated" files count as gold; "candidate" files are shown
// separately (awaiting your adjudication) and never scored.
//
// Run:  npm run goldset:score

'use strict';

const fs   = require('fs');
const path = require('path');

const GOLD = path.join(__dirname, '..', 'data', 'gold-set');

function loadLabels() {
  let files = [];
  try { files = fs.readdirSync(GOLD); } catch (_) { return []; }
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    try { out.push(JSON.parse(fs.readFileSync(path.join(GOLD, f), 'utf8'))); } catch (_) {}
  }
  return out;
}

function materialErrors(label) {
  return (label.errors || []).filter(e => (e.severity || 'material') === 'material');
}

const labels = loadLabels();
if (!labels.length) {
  console.log('goldset-score: no label files yet. Run  npm run goldset:select  first.');
  process.exit(0);
}

const adjudicated = labels.filter(l => l.status === 'adjudicated');
const candidates  = labels.filter(l => l.status === 'candidate');
const templates   = labels.filter(l => l.status === 'template' || !l.status);

// ── Product accuracy over the adjudicated (gold) set ────────────────────────────

const byType = {};
let totalMaterial = 0, billsWithMaterial = 0, totalAll = 0;
for (const l of adjudicated) {
  const mat = materialErrors(l);
  totalAll += (l.errors || []).length;
  totalMaterial += mat.length;
  if (mat.length) billsWithMaterial++;
  for (const e of mat) byType[e.type || 'other'] = (byType[e.type || 'other'] || 0) + 1;
}
const cleanBills = adjudicated.length - billsWithMaterial;
const cleanRate = adjudicated.length ? (100 * cleanBills / adjudicated.length) : 0;

const line = '─'.repeat(66);
console.log(line);
console.log('  Gold-set accuracy report');
console.log(line);
console.log(`  Labels: ${adjudicated.length} adjudicated · ${candidates.length} candidate (unadjudicated) · ${templates.length} blank`);

if (!adjudicated.length) {
  console.log('\n  No ADJUDICATED bills yet — nothing to score. Adjudicate candidates first.');
  if (candidates.length) {
    const cand = candidates.reduce((n, l) => n + (l.errors || []).length, 0);
    console.log(`  (${candidates.length} candidate file(s) hold ${cand} proposed error(s) awaiting your review.)`);
  }
  process.exit(0);
}

console.log('\n  PRODUCT ACCURACY (the analyses themselves):');
console.log(`    ${cleanBills}/${adjudicated.length} bills clean of material errors  (${cleanRate.toFixed(1)}%)`);
console.log(`    ${totalMaterial} material error(s) across ${billsWithMaterial} bill(s); ${totalAll} total incl. minor`);
if (Object.keys(byType).length) {
  console.log('    by type:');
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${t.padEnd(20)} ${n}`);
  }
}

// ── QA recall/precision vs a run report (optional) ──────────────────────────────

let runFile = null;
try {
  runFile = fs.readdirSync(GOLD).find(f => f.startsWith('_run-') && f.endsWith('.json'));
} catch (_) {}

if (!runFile) {
  console.log('\n  QA RECALL: (no data/gold-set/_run-<label>.json present — run a fidelity QA pass');
  console.log('             that records its flags there, then re-score to see what QA caught.)');
  process.exit(0);
}

const run = JSON.parse(fs.readFileSync(path.join(GOLD, runFile), 'utf8'));
const flaggedByBill = run.bills || {};
function fieldMatch(a, b) {
  a = String(a || ''); b = String(b || '');
  return a === b || a.startsWith(b) || b.startsWith(a);
}
let goldMat = 0, caught = 0, flaggedTotal = 0, flaggedReal = 0;
for (const l of adjudicated) {
  const gErrs = materialErrors(l);
  const flags = (flaggedByBill[l.id] && flaggedByBill[l.id].flagged) || [];
  goldMat += gErrs.length;
  flaggedTotal += flags.length;
  for (const g of gErrs) {
    if (flags.some(fl => (fl.type === g.type) && fieldMatch(fl.field, g.field))) caught++;
  }
  for (const fl of flags) {
    if (gErrs.some(g => (g.type === fl.type) && fieldMatch(fl.field, g.field))) flaggedReal++;
  }
}
const recall = goldMat ? (100 * caught / goldMat) : 0;
const precision = flaggedTotal ? (100 * flaggedReal / flaggedTotal) : 0;
console.log(`\n  QA RECALL (run "${run.label || runFile}"):`);
console.log(`    caught ${caught}/${goldMat} gold material errors  (recall ${recall.toFixed(1)}%)`);
console.log(`    ${flaggedReal}/${flaggedTotal} flags matched a real error  (precision ${precision.toFixed(1)}%)`);
