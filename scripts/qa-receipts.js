#!/usr/bin/env node
// qa-receipts.js — deterministic check that every ledger claim's `sourceSpan` is a REAL
// span of the source text, not an LLM paraphrase. Zero LLM cost.
//
//   npm run qa-receipts            → verify all receipts, list failures
//   npm run qa-receipts -- --write → also backfill sourceStart/sourceEnd offsets on exact matches
//   npm run qa-receipts -- --bill 119-HR-1   → single bill
//
// A hostile audit can quote a "receipt" that supports its verdict but that the model
// invented; this catches that. Elided spans (containing "…"/"...") are skipped — the pre-v1
// imported seeds use elision, so only real v1 full-claim spans are strictly enforced.

const fs = require('fs');
const path = require('path');
const AL = require('./lib/article-ledger');

const ROOT = path.join(__dirname, '..');
const LEDGER_DIR = path.join(ROOT, 'data', 'qa-ledger');
const BILLTEXT = path.join(ROOT, 'data', 'bill-text');
const REFTEXT = path.join(ROOT, 'data', 'ref-text');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const billArg = (() => { const i = args.indexOf('--bill'); return i >= 0 ? args[i + 1] : null; })();

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
const norm = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
const isElided = s => /…|\.\.\./.test(s);

// Source text for a bill = its bill-text plus any ref-text (a receipt may cite a referenced source).
function sourceFor(id) {
    let txt = '';
    const bt = path.join(BILLTEXT, id + '.txt');
    if (fs.existsSync(bt)) txt += fs.readFileSync(bt, 'utf8');
    if (fs.existsSync(REFTEXT)) {
        for (const f of fs.readdirSync(REFTEXT)) if (f.endsWith('.txt')) txt += '\n' + fs.readFileSync(path.join(REFTEXT, f), 'utf8');
    }
    return txt;
}

let checked = 0, verified = 0, elided = 0, failed = 0, wrote = 0, importedAdvisory = 0;
const failures = [];          // full-claims: real fabrication signal (blocks)
const advisory = [];          // imported seeds: historical paraphrase, informational only

for (const file of fs.readdirSync(LEDGER_DIR)) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue;
    const l = readJson(path.join(LEDGER_DIR, file), null);
    if (!l || !l.id) continue;
    if (billArg && l.id !== billArg) continue;

    const isArticle = AL.isArticleLedger(l);
    const srcCache = {};
    const raw = isArticle ? '' : sourceFor(l.id);
    if (!isArticle && !raw) continue;
    const rawNorm = norm(raw);
    const isImported = l.depth === 'imported';   // seeds use paraphrased/elided spans — advise, don't block
    let dirty = false;

    for (const c of (l.claims || [])) {
        const span = (c.sourceSpan || '').trim();
        if (!span) continue;
        // Elision is tolerated only on the pre-v1 imported BILL seeds it exists
        // for. An article ledger is always a v1 audit against a source fetched
        // this year, so an elided span there is a receipt nobody can check --
        // exactly the hole receipts exist to close.
        if (isElided(span)) {
            if (!isArticle) { elided++; continue; }
            checked++; failed++;
            failures.push(`${l.id}  [${c.field || '?'}]  elided span (articles require a verbatim receipt): "${span.slice(0, 70)}…"`);
            continue;
        }
        if (!isImported) checked++;

        // An ARTICLE claim is checked against the ONE source it names, never the
        // pooled ref-text — see lib/article-ledger.js for why that matters.
        let text = raw, textNorm = rawNorm;
        if (isArticle) {
            const r = AL.sourceTextForClaim(l, c, srcCache);
            if (!r.ok) {
                failed++;
                failures.push(`${l.id}  [${c.field || '?'}]  ${r.reason}`);
                continue;
            }
            text = r.text; textNorm = norm(text);
        }

        // exact match → true char offsets; else whitespace-tolerant → ok, no offsets
        const exactIdx = text.indexOf(span);
        if (exactIdx >= 0) {
            if (!isImported) verified++;
            if (WRITE && !isImported && (c.sourceStart == null || c.sourceEnd == null)) { c.sourceStart = exactIdx; c.sourceEnd = exactIdx + span.length; dirty = true; wrote++; }
        } else if (textNorm.includes(norm(span))) {
            if (!isImported) verified++;
        } else if (isImported) {
            importedAdvisory++;
            if (advisory.length < 5) advisory.push(`${l.id}  [${c.field || '?'}]  (imported historical span)`);
        } else {
            failed++;
            failures.push(`${l.id}  [${c.field || '?'}]  span not found: "${span.slice(0, 80)}${span.length > 80 ? '…' : ''}"`);
        }
    }
    if (WRITE && dirty) fs.writeFileSync(path.join(LEDGER_DIR, file), JSON.stringify(l, null, 2) + '\n');
}

console.log('');
console.log(`  QA receipts (full-claims audits): ${checked} span(s) checked · ${verified} verified · ${elided} elided-skipped · ${failed} FAILED`);
if (importedAdvisory) console.log(`  (${importedAdvisory} imported/historical span(s) don't match literally — advisory only, not enforced)`);
if (WRITE) console.log(`  backfilled offsets on ${wrote} exact-match span(s)`);
if (failures.length) {
    console.log('\n  ❌ Unverifiable receipts on REAL audits (span not in source — possible fabrication):');
    failures.slice(0, 50).forEach(f => console.log('    ' + f));
    if (failures.length > 50) console.log(`    …and ${failures.length - 50} more`);
    process.exitCode = 1;
} else if (checked) {
    console.log('  ✅ Every full-claims receipt resolves to real source text.');
} else {
    console.log('  (no full-claims audits yet — nothing to enforce; run the sweep.)');
}
console.log('');
