#!/usr/bin/env node
// qa-ledger-regression.js — deterministic regression gate over the QA claim-ledger.
// ZERO LLM cost. Runs in seconds; safe to wire into the pre-commit / CI gate.
//
//   npm run qa-regression            → check (exit 1 on any hard regression)
//   npm run qa-regression -- --update  → re-baseline audit-freshness hashes after intended edits
//
// Two checks:
//   1) RECEIPT REPLAY (HARD — blocks): every SUPPORTED claim in a full-claims ledger
//      must STILL resolve to the current source (bill-text + ref-text). A previously
//      verified receipt that no longer holds means the source drifted or the ledger went
//      stale — a silent accuracy regression. This is the guarantee that keeps the swept
//      "0 material errors" state from rotting.
//   2) AUDIT FRESHNESS (WARN): hash each audited bill's current prose and compare to the
//      committed baseline (data/qa-regression-baseline.json). A changed hash means the
//      analysis was edited since it was audited → that bill's ledger may need a re-audit.
//      Re-run with --update (and commit the baseline) when the change is intended.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AL = require('./lib/article-ledger');

const ROOT = path.join(__dirname, '..');
const LEDGER_DIR = path.join(ROOT, 'data', 'qa-ledger');
const CACHE = path.join(ROOT, 'data', 'cache.json');
const BILLTEXT = path.join(ROOT, 'data', 'bill-text');
const REFTEXT = path.join(ROOT, 'data', 'ref-text');
const BASELINE = path.join(ROOT, 'data', 'qa-regression-baseline.json');
const UPDATE = process.argv.includes('--update');

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
const norm = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
const isElided = s => /…|\.\.\./.test(s);

function loadCache() {
    const c = readJson(CACHE, { bills: [] });
    const bills = Array.isArray(c) ? c : (c.bills || Object.values(c));
    const byId = {};
    for (const b of bills) byId[b.id || b.billId] = b;
    return byId;
}
function sourceFor(id) {
    let txt = '';
    const bt = path.join(BILLTEXT, id + '.txt');
    if (fs.existsSync(bt)) txt += fs.readFileSync(bt, 'utf8');
    if (fs.existsSync(REFTEXT)) for (const f of fs.readdirSync(REFTEXT)) if (f.endsWith('.txt')) txt += '\n' + fs.readFileSync(path.join(REFTEXT, f), 'utf8');
    return txt;
}
// hash of the audited prose fields only (ignores votes/quotes/stage churn)
const AUDITED_FIELDS = ['summary', 'brief', 'top_lines', 'sections', 'changes', 'underreported', 'gaps', 'likelihoodReason', 'divisions'];
function contentHash(bill) {
    const slice = {};
    for (const f of AUDITED_FIELDS) if (bill[f] !== undefined) slice[f] = bill[f];
    return crypto.createHash('sha256').update(JSON.stringify(slice)).digest('hex').slice(0, 16);
}

const cache = loadCache();
const baseline = readJson(BASELINE, {});
const newBaseline = {};

let checkedBills = 0, checkedArticles = 0, checkedSpans = 0;
const regressions = [];   // hard: a SUPPORTED receipt no longer resolves
const staleAudits = [];   // warn: analysis changed since baseline
const missingProse = [];  // info: an audited article's draft is no longer on disk

for (const f of fs.readdirSync(LEDGER_DIR)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    const l = readJson(path.join(LEDGER_DIR, f), null);
    if (!l || !l.id || l.depth !== 'full-claims' || l.status !== 'audited') continue;  // only real audits carry a baseline

    // ARTICLE ledgers: receipts replay against the ONE source each claim names.
    // The hard guarantee runs entirely off tracked files (data/qa-ledger +
    // data/ref-text), so it holds whether the prose is still an untracked draft
    // or has been published into articles/.
    if (AL.isArticleLedger(l)) {
        checkedArticles++;
        const srcCache = {};
        for (const c of (l.claims || [])) {
            if (c.verdict !== 'SUPPORTED') continue;
            const span = (c.sourceSpan || '').trim();
            if (!span || isElided(span)) continue;
            checkedSpans++;
            const r = AL.sourceTextForClaim(l, c, srcCache);
            if (!r.ok) { regressions.push(`${l.id} [${c.field || '?'}]: ${r.reason}`); continue; }
            if (r.text.indexOf(span) < 0 && !norm(r.text).includes(norm(span))) {
                regressions.push(`${l.id} [${c.field || '?'}]: verified receipt no longer in ${c.sourceFile} — "${span.slice(0, 70)}${span.length > 70 ? '…' : ''}"`);
            }
        }
        const ah = AL.proseHash(l);
        if (ah === null) { missingProse.push(l.id); continue; }   // draft discarded; receipts above still enforced
        newBaseline[l.id] = ah;
        if (!UPDATE && baseline[l.id] !== undefined && baseline[l.id] !== ah) staleAudits.push(l.id);
        continue;
    }

    const bill = cache[l.id];
    if (!bill) { regressions.push(`${l.id}: audited bill no longer in cache (orphan ledger)`); continue; }
    checkedBills++;

    const raw = sourceFor(l.id);
    const rawNorm = norm(raw);
    for (const c of (l.claims || [])) {
        if (c.verdict !== 'SUPPORTED') continue;           // the regression baseline = the verified-correct claims
        const span = (c.sourceSpan || '').trim();
        if (!span || isElided(span)) continue;
        checkedSpans++;
        if (raw.indexOf(span) < 0 && !rawNorm.includes(norm(span))) {
            regressions.push(`${l.id} [${c.field || '?'}]: verified receipt no longer in source — "${span.slice(0, 70)}${span.length > 70 ? '…' : ''}"`);
        }
    }

    const h = contentHash(bill);
    newBaseline[l.id] = h;
    if (!UPDATE && baseline[l.id] !== undefined && baseline[l.id] !== h) {
        staleAudits.push(l.id);
    }
}

// Persist baseline: on --update (re-baseline everything) or first run (bootstrap when no baseline exists).
if (UPDATE || Object.keys(baseline).length === 0) {
    fs.writeFileSync(BASELINE, JSON.stringify(newBaseline, null, 2) + '\n');
}

console.log('');
console.log(`  QA regression gate — ${checkedBills} audited bill(s)` +
    (checkedArticles ? ` + ${checkedArticles} audited article(s)` : '') +
    `, ${checkedSpans} verified receipt(s) replayed`);
if (missingProse.length) console.log(`  ℹ️  ${missingProse.length} audited article(s) have no prose file on disk (draft discarded): ${missingProse.join(', ')}`);
if (regressions.length) {
    console.log(`\n  ❌ ${regressions.length} REGRESSION(S) — a previously-verified claim no longer holds against source:`);
    regressions.slice(0, 40).forEach(r => console.log('    ' + r));
    if (regressions.length > 40) console.log(`    …and ${regressions.length - 40} more`);
} else {
    console.log('  ✅ Every verified receipt still resolves to real source text — no regressions.');
}
if (UPDATE) {
    console.log(`\n  ↻ Re-baselined audit-freshness hashes for ${Object.keys(newBaseline).length} bill(s) → data/qa-regression-baseline.json`);
} else if (Object.keys(baseline).length === 0) {
    console.log(`\n  ↻ Bootstrapped audit-freshness baseline for ${Object.keys(newBaseline).length} bill(s) → data/qa-regression-baseline.json (commit it)`);
} else if (staleAudits.length) {
    console.log(`\n  ⚠️  ${staleAudits.length} bill(s) whose analysis CHANGED since it was audited (re-audit or --update): ${staleAudits.join(', ')}`);
} else {
    console.log('  ✅ No audited analysis changed since baseline.');
}
console.log('');
process.exitCode = regressions.length ? 1 : 0;
