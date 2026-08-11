#!/usr/bin/env node
// qa-metrics-snapshot.js — append a point-in-time QA metrics snapshot to the history log.
// Deterministic, ZERO LLM cost. Run after each sweep/batch so accuracy trends over time.
//
//   npm run qa-metrics            → append today's snapshot to data/qa-metrics/history.jsonl
//
// Feeds the dashboard (npm run qa-metrics:render). A spike in material-error rate on a new
// batch = a generator/model regression caught early.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'qa-metrics');
const HIST = path.join(DIR, 'history.jsonl');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

let summary;
try {
  summary = JSON.parse(execSync('node scripts/qa-ledger-report.js --json', { cwd: ROOT, encoding: 'utf8' }));
} catch (e) { console.error('  Could not read ledger summary:', e.message); process.exit(1); }

const live = summary.liveAccuracy || { claims: 0, material: 0, minor: 0, byType: {} };
const snap = {
  date: new Date().toISOString().slice(0, 10),
  fullClaimsAudited: summary.fullClaimsAudited,
  total: summary.total,
  coveragePct: summary.total ? Math.round((summary.fullClaimsAudited / summary.total) * 100) : 0,
  liveMaterial: live.material,
  liveMinor: live.minor,
  loggedClaims: live.claims,
  materialRate: live.claims ? +(live.material / live.claims * 100).toFixed(3) : 0,
  byType: live.byType || {},
  importedHistorical: summary.importedHistorical,
  neverAudited: summary.neverAudited,
};

// de-dupe same-day: replace an existing snapshot for today rather than stacking
let lines = fs.existsSync(HIST) ? fs.readFileSync(HIST, 'utf8').split('\n').filter(Boolean) : [];
lines = lines.filter(l => { try { return JSON.parse(l).date !== snap.date; } catch (e) { return false; } });
lines.push(JSON.stringify(snap));
fs.writeFileSync(HIST, lines.join('\n') + '\n');

console.log(`\n  qa-metrics: snapshot for ${snap.date} → data/qa-metrics/history.jsonl (${lines.length} total)`);
console.log(`    coverage ${snap.coveragePct}% (${snap.fullClaimsAudited}/${snap.total})  ·  live material ${snap.liveMaterial}  ·  minor ${snap.liveMinor}  ·  material-rate ${snap.materialRate}%\n`);
