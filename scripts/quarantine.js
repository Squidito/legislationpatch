#!/usr/bin/env node
// quarantine.js — resilient-run engine.
//
// After analysis + normalize, one bill's bad analysis should not sink the whole
// batch. This triages the corpus: any NEW bill whose analysis still fails a
// content check is pulled OUT of cache.json into data/analysis-quarantine.json,
// so the clean bills ship while the bad one is held for fix. The run continues.
//
// It is a scalpel, not a mute button — these still HARD-FAIL (exit 1) so a human
// looks, exactly as before:
//   • structural errors not tied to one bill (e.g. a JS-source curly quote)
//   • an error on an already-live bill (a regression — never yank live content)
//   • more than 1/3 of the new batch failing (systemic — the analysis step is off)
//
// Pipeline mode (default): node scripts/quarantine.js [--run=<runId>]
//   exit 0 → cache is now clean (0+ bills quarantined); the run may continue.
//   exit 1 → could not isolate the failure; the run must stop.
// node scripts/quarantine.js --list           show held bills
// node scripts/quarantine.js --restore <id>   re-open a held bill for analysis

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT  = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'data/cache.json');
const QFILE = path.join(ROOT, 'data/analysis-quarantine.json');
const FRACTION = 1 / 3;   // > this share of the new batch failing = systemic → hard-fail

const readJson  = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const writeJson = (p, o)  => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
const loadQ = () => { const q = readJson(QFILE, { quarantined: [] }); q.quarantined = q.quarantined || []; return q; };

const args = process.argv.slice(2);

// ── Subcommand: --list ──────────────────────────────────────────────────────
if (args[0] === '--list') {
    const q = loadQ();
    if (!q.quarantined.length) { console.log('Quarantine empty.'); process.exit(0); }
    console.log(`${q.quarantined.length} bill(s) held:`);
    for (const e of q.quarantined) {
        console.log(`\n  ${e.id} — ${e.title}`);
        console.log(`     held ${e.quarantinedAt}${e.runId ? ` (run ${e.runId})` : ''}`);
        (e.errors || []).forEach(m => console.log(`     ✗ ${m}`));
    }
    process.exit(0);
}

// ── Subcommand: --restore <id> ──────────────────────────────────────────────
if (args[0] === '--restore') {
    const id = args[1];
    if (!id) { console.error('usage: node scripts/quarantine.js --restore <bill-id>'); process.exit(1); }
    const q = loadQ();
    const before = q.quarantined.length;
    q.quarantined = q.quarantined.filter(e => e.id !== id);
    if (q.quarantined.length === before) { console.error(`${id} is not in quarantine.`); process.exit(1); }
    writeJson(QFILE, q);
    console.log(`Restored ${id}. It re-enters the analysis pool on the next run — re-analyze it to fix the original error (the held copy is kept in git history for reference).`);
    process.exit(0);
}

// ── Pipeline triage mode ────────────────────────────────────────────────────
const runId = (args.find(a => a.startsWith('--run=')) || '').split('=')[1] || null;

// 1. NEW bills = in cache now, not in the last committed cache. Only these are
//    quarantinable; if we cannot tell, we refuse to quarantine (fail safe).
function committedCacheIds() {
    const r = spawnSync('git', ['show', 'HEAD:data/cache.json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.status !== 0) return null;
    try { return new Set((JSON.parse(r.stdout).bills || []).map(b => b.id)); } catch { return null; }
}
const committed = committedCacheIds();

// 2. Structured validate result.
const tmp = path.join(os.tmpdir(), `vb-quarantine-${process.pid}.json`);
spawnSync('node', ['scripts/validate-batch.js', '--json', tmp], { cwd: ROOT, encoding: 'utf8' });
const vb = readJson(tmp, null);
try { fs.unlinkSync(tmp); } catch {}
if (!vb) { console.error('[quarantine] could not read validate output — aborting (run will hard-fail).'); process.exit(1); }
if (vb.errors === 0) { console.log('[quarantine] validate clean — nothing to quarantine.'); process.exit(0); }

// 3. Classify the errors.
const cache = readJson(CACHE, null);
const cacheIds = new Set((cache.bills || []).map(b => b.id));
const byBill = new Map();
const structural = [];
for (const e of vb.errorList) {
    if (!e.billId)              { structural.push(e.message); continue; }
    if (!cacheIds.has(e.billId)) continue;                       // not a live cache entry — ignore
    if (!byBill.has(e.billId))   byBill.set(e.billId, []);
    byBill.get(e.billId).push(e.message);
}

// 4. Structural (non-bill) errors cannot be quarantined.
if (structural.length) {
    console.error(`[quarantine] ${structural.length} error(s) not tied to a single bill — cannot quarantine, run must stop:`);
    structural.forEach(m => console.error('   • ' + m));
    process.exit(1);
}

// 5. Never yank an already-live bill (a regression needs a human).
if (committed === null) {
    console.error('[quarantine] cannot compare against the committed cache (no git HEAD) — refusing to quarantine; run will hard-fail on the errors.');
    process.exit(1);
}
const existingFailing = [...byBill.keys()].filter(id => committed.has(id));
if (existingFailing.length) {
    console.error('[quarantine] error(s) on already-live bill(s) — regression, run must stop:');
    existingFailing.forEach(id => console.error(`   • ${id}: ${byBill.get(id).join('; ')}`));
    process.exit(1);
}

// 6. Systemic threshold — too many new bills failing means fix the analysis step,
//    don't paper over it by shipping the remainder.
const newFailing = [...byBill.keys()].filter(id => !committed.has(id));
const newCount = [...cacheIds].filter(id => !committed.has(id)).length;
const limit = Math.max(1, Math.floor(newCount * FRACTION));
if (newFailing.length > limit) {
    console.error(`[quarantine] ${newFailing.length} of ${newCount} new bills failed (over the ${Math.round(FRACTION * 100)}% / ${limit}-bill threshold) — systemic, run must stop:`);
    newFailing.forEach(id => console.error(`   • ${id}: ${byBill.get(id).join('; ')}`));
    process.exit(1);
}

// 7. Isolated new-bill failures → quarantine them.
const q = loadQ();
const now = new Date().toISOString();
for (const id of newFailing) {
    const idx = cache.bills.findIndex(b => b.id === id);
    const entry = idx >= 0 ? cache.bills.splice(idx, 1)[0] : null;
    q.quarantined = q.quarantined.filter(e => e.id !== id);
    q.quarantined.push({ id, title: (entry && entry.title) || '', errors: byBill.get(id), quarantinedAt: now, runId, entry });
    console.log(`[quarantine] held ${id} — ${byBill.get(id).join('; ')}`);
}
writeJson(CACHE, cache);
writeJson(QFILE, q);
console.log(`[quarantine] held ${newFailing.length} bill(s); ${newCount - newFailing.length} new bill(s) remain clean and will ship. See: npm run quarantine:list`);
process.exit(0);
