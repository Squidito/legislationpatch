#!/usr/bin/env node
// qa-injection-score.js — score the audit's RECALL on the injected-error fixtures.
// Deterministic, ZERO LLM cost. Reads the fixture manifest + a results file (produced by
// running the hostile auditor on each fixture) and reports catch-rate per error class.
// A low catch-rate for a class = the rubric has a blind spot there.
//
//   npm run qa-inject:score
//
// data/qa-injection/_results.json format: { "<fixtureId>": { "caught": true|false } }
//   caught = the auditor flagged the injected error (right field/type). Missing fixture = not scored.

const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'data', 'qa-injection');
function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }

const manifest = readJson(path.join(DIR, '_manifest.json'), null);
if (!manifest || !manifest.fixtures || !manifest.fixtures.length) {
  console.error('  No fixtures. Run `npm run qa-inject` first.'); process.exit(1);
}
const results = readJson(path.join(DIR, '_results.json'), null);
if (!results) {
  console.log('\n  No results yet. To measure recall:');
  console.log('  1) For each data/qa-injection/<fixtureId>.json, reconstruct the mutated analysis (apply before→after');
  console.log('     to that field) and run the hostile auditor (docs/QA-AUDIT-RUBRIC.md) against the bill\'s unchanged source.');
  console.log('  2) Record whether it flagged the injected error in data/qa-injection/_results.json as');
  console.log('     { "<fixtureId>": { "caught": true|false } }.');
  console.log('  3) Re-run `npm run qa-inject:score`.\n');
  process.exit(0);
}

const byType = {};
let scored = 0, caught = 0, unscored = 0;
for (const fx of manifest.fixtures) {
  const t = fx.injectedType;
  byType[t] = byType[t] || { total: 0, scored: 0, caught: 0 };
  byType[t].total++;
  const r = results[fx.fixtureId];
  if (!r || typeof r.caught !== 'boolean') { unscored++; continue; }
  scored++; byType[t].scored++;
  if (r.caught) { caught++; byType[t].caught++; }
}

console.log('\n  QA injection recall — did the audit catch the planted errors?');
console.log('  ' + '─'.repeat(52));
for (const [t, s] of Object.entries(byType)) {
  const pct = s.scored ? Math.round((s.caught / s.scored) * 100) : 0;
  const bar = '█'.repeat(Math.round(pct / 10)).padEnd(10, '░');
  console.log(`  ${t.padEnd(12)} ${bar} ${s.caught}/${s.scored} caught (${pct}%)` + (s.total > s.scored ? `  [${s.total - s.scored} unscored]` : ''));
}
const overall = scored ? Math.round((caught / scored) * 100) : 0;
console.log('  ' + '─'.repeat(52));
console.log(`  OVERALL recall: ${caught}/${scored} (${overall}%)` + (unscored ? `  ·  ${unscored} fixture(s) not yet scored` : ''));
const misses = Object.entries(byType).filter(([, s]) => s.scored && s.caught < s.scored);
if (misses.length) console.log(`\n  ⚠️  Classes with misses (rubric blind spots to investigate): ${misses.map(([t]) => t).join(', ')}`);
console.log('');
