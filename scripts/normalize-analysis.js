#!/usr/bin/env node
// normalize-analysis.js — mechanically fix the two recurring formatting-error
// classes that validate-batch.js blocks on, so a batch is never halted over a
// misformatted dollar or anchor the model wrote.
//
// Fixes, in the authored Zone-1 analysis fields only:
//   1. Raw dollar amounts ($7,500,000)      -> shortened house form ($7.5M / $46.55B)
//   2. billSection anchors with annotations -> plain ASCII ("2(c) [amending 49 U.S.C. §109(h)]" -> "2(c)")
//
// SAFETY: never touches verbatim Congressional-Record text — featured_quotes,
// criticisms, and sections/divisions `comments` are skipped, so a speaker who
// said "$13 billion" on the floor is never silently re-quoted. Those rare cases
// stay for human adjudication (data/qa-adjudications.json), exactly as today.
//
// Scope mirrors validate-batch.js's own dollar walk (summary, brief, top_lines,
// sections, underreported, gaps, changes, divisions) minus the verbatim fields.
// Idempotent — re-running on clean data changes nothing.
//
// Usage:
//   node scripts/normalize-analysis.js [--all] [--bill 119-HR-1234] [--dry-run]
//   node scripts/normalize-analysis.js --self-test
// Runs automatically inside `run-batch.js --post` before validate.

const fs = require('fs');
const path = require('path');

// ── Pure transforms ────────────────────────────────────────────────────────

// $11,083,012,000 -> $11.08B ; $7,500,000 -> $7.5M. Only comma-grouped millions+
// (>= $1,000,000, i.e. 2+ ",###" groups) — exactly what validate-batch flags.
const RAW_DOLLAR = /\$\d{1,3}(?:,\d{3}){2,}/g;

function fmtUnit(value, divisor, suffix) {
    let s = (value / divisor).toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    return '$' + s + suffix;
}
function fmtDollar(value) {
    if (value >= 1e9) return fmtUnit(value, 1e9, 'B');
    // A hundreds-of-millions figure that rounds up to 1000M reads better as $1B.
    if (Number((value / 1e6).toFixed(2)) >= 1000) return fmtUnit(value, 1e9, 'B');
    return fmtUnit(value, 1e6, 'M');
}
function shortenDollars(str) {
    return str.replace(RAW_DOLLAR, m => fmtDollar(Number(m.replace(/[$,]/g, ''))));
}

// "2(c) [amending 49 U.S.C. §109(h)]" -> "2(c)" ; "§409K" -> "409K".
function normBillSection(s) {
    if (typeof s !== 'string') return s;
    let out = s.replace(/\s*\[.*$/s, '')          // drop " [annotation…]" to end of string
               .replace(/[^\x20-\x7E]/g, '')      // drop any remaining non-ASCII (e.g. §)
               .trim();
    if (!out) { const m = s.match(/\d+/); out = m ? m[0] : ''; }  // never emit empty
    return out || s;
}

// ── Bill-level normalizer (mutates in place, returns change count) ──────────

const DOLLAR_FIELDS = ['summary', 'brief', 'top_lines', 'sections', 'underreported', 'gaps', 'changes', 'divisions'];
const SKIP_KEYS = new Set(['comments', 'featured_quotes', 'criticisms']); // verbatim CR — never rewrite

function normalizeBill(bill) {
    let changes = 0;
    const walk = node => {
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
                if (typeof node[i] === 'string') { const n = shortenDollars(node[i]); if (n !== node[i]) { node[i] = n; changes++; } }
                else walk(node[i]);
            }
        } else if (node && typeof node === 'object') {
            for (const k of Object.keys(node)) {
                if (SKIP_KEYS.has(k)) continue;
                if (typeof node[k] === 'string') { const n = shortenDollars(node[k]); if (n !== node[k]) { node[k] = n; changes++; } }
                else walk(node[k]);
            }
        }
    };
    for (const f of DOLLAR_FIELDS) if (bill[f] != null) walk(bill[f]);

    const fixSection = o => {
        if (o && typeof o === 'object' && typeof o.billSection === 'string') {
            const n = normBillSection(o.billSection);
            if (n !== o.billSection) { o.billSection = n; changes++; }
        }
    };
    (bill.top_lines || []).forEach(fixSection);
    (bill.sections || []).forEach(fixSection);
    for (const d of bill.divisions || []) {
        (d.top_lines || []).forEach(fixSection);
        (d.sections || []).forEach(fixSection);
    }
    return changes;
}

module.exports = { shortenDollars, normBillSection, normalizeBill, fmtDollar };

// ── Self-test ──────────────────────────────────────────────────────────────

function selfTest() {
    const cases = [
        [shortenDollars('$7,500,000'), '$7.5M'],
        [shortenDollars('$2,750,000'), '$2.75M'],
        [shortenDollars('$10,000,000'), '$10M'],
        [shortenDollars('$20,000,000 per year'), '$20M per year'],
        [shortenDollars('$584,250,000'), '$584.25M'],
        [shortenDollars('$11,083,012,000'), '$11.08B'],
        [shortenDollars('$46,550,000,000'), '$46.55B'],
        [shortenDollars('$1,000,000,000'), '$1B'],
        [shortenDollars('$250,000'), '$250,000'],            // 1 group — below flag threshold, untouched
        [shortenDollars('up to $7,500,000 and $2,750,000'), 'up to $7.5M and $2.75M'],
        [normBillSection('2(c) [amending 49 U.S.C. §109(h)]'), '2(c)'],
        [normBillSection('2 [new PHS §409K(b)]'), '2'],
        [normBillSection('2(a) [new 41 U.S.C. §3313]'), '2(a)'],
        [normBillSection('2(c)-(d)'), '2(c)-(d)'],            // clean — unchanged
        [normBillSection('title-II'), 'title-II'],
    ];
    let fail = 0;
    for (const [got, want] of cases) {
        const ok = got === want;
        if (!ok) fail++;
        console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${JSON.stringify(got)}${ok ? '' : ' != ' + JSON.stringify(want)}`);
    }
    console.log(fail ? `\n${fail} self-test(s) FAILED` : `\nAll ${cases.length} self-tests passed`);
    process.exit(fail ? 1 : 0);
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--self-test')) selfTest();

    const dryRun = args.includes('--dry-run');
    const billArg = args.find(a => a.startsWith('--bill'));
    const onlyId = billArg ? (billArg.includes('=') ? billArg.split('=')[1] : args[args.indexOf(billArg) + 1]) : null;

    const cachePath = path.join(__dirname, '../data/cache.json');
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    let totalChanges = 0, billsTouched = 0;
    for (const bill of cache.bills) {
        if (onlyId && bill.id !== onlyId) continue;
        const before = JSON.stringify(bill);
        const n = normalizeBill(bill);
        if (n > 0 && JSON.stringify(bill) !== before) { billsTouched++; totalChanges += n; console.log(`  ${dryRun ? '[dry] ' : ''}${bill.id}: ${n} fix(es)`); }
    }
    if (totalChanges === 0) { console.log('normalize-analysis: nothing to fix — all clean.'); process.exit(0); }
    if (dryRun) { console.log(`normalize-analysis: would fix ${totalChanges} field(s) across ${billsTouched} bill(s). Nothing written.`); process.exit(0); }
    cache.generated = cache.generated; // preserve; this is a formatting pass, not a data refresh
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
    console.log(`normalize-analysis: fixed ${totalChanges} field(s) across ${billsTouched} bill(s).`);
}
