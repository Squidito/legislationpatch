#!/usr/bin/env node
// qa-ledger-report.js — corpus-wide view of the hostile QA claim-ledger.
//
//   npm run qa-ledger              → coverage + LIVE accuracy + worklist
//   npm run qa-ledger -- --worklist  → un-audited (never-audited) bill ids, one per line
//   npm run qa-ledger -- --json      → machine-readable summary
//
// The ledger (data/qa-ledger/<id>.json, schema in that dir's README) records which bills
// have had the comprehensive hostile fidelity audit (docs/QA-AUDIT-RUBRIC.md). Reads only
// stored data — no LLM, no cost. Three ledger classes:
//   • depth "full-claims"  = a real v1 audit (receipts + SUPPORTED baseline) → COUNTS as coverage + live accuracy
//   • depth "imported"     = seeded from the old gold-set/Wave-1 audits (historical flags, no baseline) → NOT live accuracy
//   • (no ledger file)     = never audited → the priority worklist

const fs = require('fs');
const path = require('path');

const CURRENT_AUDIT_VERSION = '1.0';
const ROOT = path.join(__dirname, '..');
const LEDGER_DIR = path.join(ROOT, 'data', 'qa-ledger');
const CACHE = path.join(ROOT, 'data', 'cache.json');
const PROVENANCE = path.join(ROOT, 'data', 'qa-provenance.json');
const BILLTEXT = path.join(ROOT, 'data', 'bill-text');

const args = process.argv.slice(2);
const WORKLIST_ONLY = args.includes('--worklist');
const JSON_OUT = args.includes('--json');

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }

function loadCacheBills() {
    const c = readJson(CACHE, null);
    if (!c) return [];
    const bills = Array.isArray(c) ? c : (c.bills ? c.bills : Object.values(c));
    return bills.map(b => ({ id: b.id || b.billId, title: b.title || '', billType: b.billType || '', pages: b.pages || 0 }));
}

function loadLedgers() {
    if (!fs.existsSync(LEDGER_DIR)) return {};
    const out = {};
    for (const f of fs.readdirSync(LEDGER_DIR)) {
        if (!f.endsWith('.json') || f.startsWith('_')) continue;
        const l = readJson(path.join(LEDGER_DIR, f), null);
        if (l && l.id) out[l.id] = l;
    }
    return out;
}

// sha256 helper for source-change detection (optional; needs the provenance sidecar).
function sha256(p) {
    try { return require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (e) { return null; }
}

const bills = loadCacheBills();
const ledgers = loadLedgers();
const provenance = readJson(PROVENANCE, {});

// Classify every cached bill.
const full = [];        // real v1 audits
const imported = [];    // seeded historical
const worklist = [];    // never audited
const stale = [];       // full audit under an older rubric version
for (const b of bills) {
    const l = ledgers[b.id];
    if (l && l.depth === 'full-claims' && l.status === 'audited') {
        full.push({ ...b, l });
        if ((l.auditVersion || '0') !== CURRENT_AUDIT_VERSION) stale.push({ ...b, l });
    } else if (l && l.depth === 'imported') {
        imported.push({ ...b, l });
    } else {
        worklist.push(b);
    }
}
const orphans = Object.keys(ledgers).filter(id => !bills.find(b => b.id === id));

// Source-changed-since-analysis (only if provenance stamped).
const sourceChanged = [];
for (const b of bills) {
    const pv = provenance[b.id];
    if (pv && pv.billTextSha) {
        const cur = sha256(path.join(BILLTEXT, b.id + '.txt'));
        if (cur && cur !== pv.billTextSha) sourceChanged.push(b.id);
    }
}

// LIVE accuracy — full-claims bills only; a claim counts as a live error when it is an
// unfixed, non-SUPPORTED verdict that the cross-model verify did NOT reject.
function isLiveError(c) {
    return c.verdict && c.verdict !== 'SUPPORTED' && c.status !== 'fixed' && c.verify !== 'REJECTED';
}
let liveMaterial = 0, liveMinor = 0, liveClaims = 0;
const liveByType = {};
for (const { l } of full) {
    for (const c of (l.claims || [])) {
        liveClaims++;
        if (!isLiveError(c)) continue;
        if (c.severity === 'material') liveMaterial++; else if (c.severity === 'minor') liveMinor++;
        liveByType[c.type || 'other'] = (liveByType[c.type || 'other'] || 0) + 1;
    }
}

// Historical flags from imported bills (may already be fixed — informational only).
let histFlags = 0;
const histByType = {};
for (const { l } of imported) {
    for (const c of (l.claims || [])) {
        if (c.verdict && c.verdict !== 'SUPPORTED') { histFlags++; histByType[c.type || 'other'] = (histByType[c.type || 'other'] || 0) + 1; }
    }
}

if (WORKLIST_ONLY) { worklist.forEach(b => process.stdout.write(b.id + '\n')); process.exit(0); }

const summary = {
    total: bills.length,
    fullClaimsAudited: full.length,
    importedHistorical: imported.length,
    neverAudited: worklist.length,
    auditVersion: CURRENT_AUDIT_VERSION,
    liveAccuracy: full.length ? { claims: liveClaims, material: liveMaterial, minor: liveMinor, byType: liveByType } : null,
    historicalFlags: { count: histFlags, byType: histByType, note: 'from imported/seeded bills; may already be fixed' },
    staleVersion: stale.map(s => s.id),
    sourceChanged,
    orphans,
};
if (JSON_OUT) { process.stdout.write(JSON.stringify(summary, null, 2) + '\n'); process.exit(0); }

const pct = bills.length ? Math.round((full.length / bills.length) * 100) : 0;
const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');
console.log('');
console.log('  QA Claim-Ledger — corpus coverage (rubric v' + CURRENT_AUDIT_VERSION + ')');
console.log('  ' + '─'.repeat(58));
console.log(`  ${bar}  ${full.length}/${bills.length} audited to rubric depth (${pct}%)`);
console.log(`  imported/historical: ${imported.length} (upgrade optional)   ·   never audited: ${worklist.length} (priority worklist)`);
console.log('');
console.log('  LIVE accuracy (currently-shipping errors, full-claim audits only):');
if (full.length) {
    console.log(`    material: ${liveMaterial}   minor: ${liveMinor}   (over ${liveClaims} logged claims in ${full.length} bill(s))`);
    if (Object.keys(liveByType).length) console.log('    by type: ' + Object.entries(liveByType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join('  '));
} else {
    console.log('    not yet measured — 0 bills audited to full-claim depth. Run the sweep.');
}
console.log('');
console.log(`  Historical flags (imported bills, may already be fixed): ${histFlags}`);
if (Object.keys(histByType).length) console.log('    by type: ' + Object.entries(histByType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join('  '));
if (stale.length) console.log(`\n  ⚠️  ${stale.length} full audit(s) under an OLDER rubric — re-audit: ${stale.map(s => s.id).join(', ')}`);
if (sourceChanged.length) console.log(`\n  ⚠️  ${sourceChanged.length} bill(s) whose source text CHANGED since analysis (re-audit): ${sourceChanged.join(', ')}`);
if (orphans.length) console.log(`\n  ⚠️  ${orphans.length} ledger file(s) with no cached bill: ${orphans.join(', ')}`);
if (worklist.length) {
    const big = worklist.filter(b => b.pages >= 10).map(b => `${b.id}(${b.pages}p)`);
    console.log(`\n  Priority worklist (${worklist.length} never-audited bills):`);
    console.log(`    medium/large: ${big.length ? big.join(', ') : 'none — all remaining are small <10p'}`);
    console.log(`    small <10p: ${worklist.length - big.length}`);
    console.log(`\n  Next: 'npm run qa-ledger -- --worklist' for the id list.`);
} else {
    console.log('\n  ✅ Every cached bill has a full-claim audit at the current rubric version.');
}
console.log('');
