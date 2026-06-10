// bill-facts.js — pre-analysis facts sheet for a bill.
//
// Extracts every figure, percentage, deadline, date, and section heading from
// the fetched bill text, each with its line number and source line, plus
// per-section dollar sums. The analysis workflow rule: figures are COPIED from
// this sheet (or from a fetched referenced source), never re-read from memory.
// This kills the transcription-error class (e.g. FY2027 vs FY2028) and makes
// computed sums reproducible instead of in-head arithmetic.
//
// Usage:
//   node scripts/bill-facts.js --bill 119-HR-1234            facts sheet
//   node scripts/bill-facts.js --bill 119-HR-1234 --sums     facts + per-section sums
//   node scripts/bill-facts.js --bill 119-HR-1234 --full     no per-category cap
//
// Sum semantics (read the caveats it prints):
//   - "not to exceed" amounts are EXCLUDED from sums and listed separately —
//     they are caps/sub-allocations, not additional money (CLAUDE.md:
//     "Appropriations vs. ceilings", the HR-1 $100B loan-ceiling trap).
//   - rescinded amounts are EXCLUDED and listed separately.
//   - "of which" sub-items may still double-count inside traditional
//     appropriations accounts — the tool flags sections containing "of which".

const fs = require('fs');
const path = require('path');

const arg = (flag) => {
    const i = process.argv.indexOf(flag);
    return i !== -1 ? process.argv[i + 1] : null;
};
const has = (flag) => process.argv.includes(flag);

const billId = arg('--bill');
if (!billId) { console.error('Usage: node scripts/bill-facts.js --bill 119-HR-1234 [--sums] [--full]'); process.exit(1); }

const file = path.join(__dirname, '..', 'data', 'bill-text', `${billId}.txt`);
let text;
try { text = fs.readFileSync(file, 'utf8'); }
catch { console.error(`No bill text at data/bill-text/${billId}.txt — fetch it first.`); process.exit(1); }

const lines = text.split('\n');
const CAP = has('--full') ? Infinity : 400;

const trim = (s) => s.replace(/\s+/g, ' ').trim();
function printCat(title, rows) {
    console.log(`\n━━━ ${title} (${rows.length}${rows.length > CAP ? `, showing ${CAP} — use --full` : ''}) ━━━`);
    rows.slice(0, CAP).forEach(r => console.log(`  L${String(r.ln).padStart(6)}  ${r.text}`));
}

// ── Headings ────────────────────────────────────────────────────────────────
const headings = [];
lines.forEach((l, i) => {
    // Uppercase only — "Section 254 of the Communications Act" mid-text amendment
    // references are not headings; real headings print as "SEC. 2." / "SECTION 1."
    if (/^\s*(?:SECTION|SEC\.)\s+\d+[A-Z]?\.?/.test(l) || /^\s*TITLE\s+[IVXLC]+\b/.test(l) ||
        /^\s*DIVISION\s+[A-Z]\b/.test(l) || /^\s*Subtitle\s+[A-Z]\b/.test(l)) {
        headings.push({ ln: i + 1, text: trim(l).slice(0, 110), idx: i });
    }
});

// ── Dollar amounts ──────────────────────────────────────────────────────────
// Classify each: appropriation-looking, "not to exceed" cap, or rescission.
const dollars = [];
lines.forEach((l, i) => {
    for (const m of l.matchAll(/\$[\d][\d,]*(?:\.\d+)?/g)) {
        const before = l.slice(Math.max(0, m.index - 90), m.index);
        const after = l.slice(m.index, m.index + 120);
        const next = (lines[i + 1] || '').slice(0, 60);
        let tag = '';
        if (/not to exceed\s*$/i.test(before) || /not to exceed[^$]{0,40}$/i.test(before)) tag = ' [CAP — not to exceed]';
        if (/rescinded/i.test(after + ' ' + next)) tag = ' [RESCISSION]';
        dollars.push({ ln: i + 1, text: `${m[0]}${tag}  ::  ${trim(l).slice(0, 130)}` });
    }
});

// ── Percentages — including line-broken "30 / percent" (the HR-2399 lesson) ─
const percents = [];
lines.forEach((l, i) => {
    for (const m of l.matchAll(/\b\d+(?:\.\d+)?\s?(?:percent\b|%)/gi)) {
        percents.push({ ln: i + 1, text: `${m[0]}  ::  ${trim(l).slice(0, 130)}` });
    }
    // number at end of line + "percent" starting the next line
    const tail = l.match(/\b(\d+(?:\.\d+)?)\s*$/);
    if (tail && /^\s*percent\b/i.test(lines[i + 1] || '')) {
        percents.push({ ln: i + 1, text: `${tail[1]} percent [LINE-BROKEN]  ::  ${trim(l).slice(-90)} | ${trim(lines[i + 1]).slice(0, 50)}` });
    }
});

// ── Deadlines ───────────────────────────────────────────────────────────────
const deadlines = [];
lines.forEach((l, i) => {
    for (const m of l.matchAll(/\b(?:not later than|within|no later than)\s+\d+\s*(?:calendar\s+|business\s+)?(?:days?|months?|years?|weeks?)\b/gi)) {
        deadlines.push({ ln: i + 1, text: `${m[0]}  ::  ${trim(l).slice(0, 130)}` });
    }
    // "not later than <date phrase>" wrapping to next line is caught by DATES below
});

// ── Dates and fiscal years ──────────────────────────────────────────────────
const dates = [];
const MONTH = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
lines.forEach((l, i) => {
    for (const m of l.matchAll(new RegExp(`\\b${MONTH}\\s+\\d{1,2},\\s+\\d{4}\\b`, 'g'))) {
        dates.push({ ln: i + 1, text: `${m[0]}  ::  ${trim(l).slice(0, 130)}` });
    }
    for (const m of l.matchAll(/\bfiscal years?\s+\d{4}(?:\s+(?:through|and)\s+\d{4})?/gi)) {
        dates.push({ ln: i + 1, text: `${m[0]}  ::  ${trim(l).slice(0, 130)}` });
    }
});

// ── Output ──────────────────────────────────────────────────────────────────
console.log(`BILL FACTS SHEET — ${billId}  (${text.length.toLocaleString()} chars, ${lines.length.toLocaleString()} lines)`);
console.log('Rule: every figure in the analysis is COPIED from this sheet or from a fetched');
console.log('referenced source (fetch-reference.js). If it is not on the sheet, do not write it.');

printCat('SECTION / TITLE HEADINGS', headings);
printCat('DOLLAR AMOUNTS', dollars);
printCat('PERCENTAGES', percents);
printCat('DEADLINES', deadlines);
printCat('DATES & FISCAL YEARS', dates);

// ── Per-section sums (opt-in) ───────────────────────────────────────────────
if (has('--sums')) {
    console.log('\n━━━ PER-SECTION DOLLAR SUMS ━━━');
    console.log('  Sums EXCLUDE "not to exceed" caps and rescissions (listed separately).');
    console.log('  CAVEAT: traditional appropriations accounts with "of which" sub-items can');
    console.log('  still double-count — flagged below; verify account structure by reading.');
    const secHeads = headings.filter(h => /^(?:SECTION|SEC\.)\s+\d/.test(h.text.trim()) || /^TITLE\s+[IVXLC]+/.test(h.text.trim()));
    for (let s = 0; s < secHeads.length; s++) {
        const start = secHeads[s].idx;
        const end = s + 1 < secHeads.length ? secHeads[s + 1].idx : lines.length;
        let sum = 0, items = 0;
        const caps = [], rescissions = [];
        let hasOfWhich = false;
        for (let i = start; i < end; i++) {
            const l = lines[i];
            if (/\bof which\b/i.test(l)) hasOfWhich = true;
            for (const m of l.matchAll(/\$([\d][\d,]*)(?!\d)/g)) {
                const v = parseInt(m[1].replace(/,/g, ''), 10);
                if (isNaN(v) || v < 1000) continue; // skip tiny non-appropriation figures
                // lookbehind spans the previous line — "not to exceed" often wraps
                // (the HR-1 $100B loan ceilings sit on the line after the phrase)
                const before = ((lines[i - 1] || '').slice(-80) + ' ' + l.slice(0, m.index)).slice(-170);
                const after = l.slice(m.index, m.index + 120) + ' ' + (lines[i + 1] || '').slice(0, 60);
                if (/not to exceed[^$]{0,60}$/i.test(before)) { caps.push(v); continue; }
                if (/rescinded/i.test(after)) { rescissions.push(v); continue; }
                sum += v; items++;
            }
        }
        if (items === 0 && caps.length === 0 && rescissions.length === 0) continue;
        const fmt = (n) => n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : '$' + n.toLocaleString();
        let line = `  L${String(secHeads[s].ln).padStart(6)}  ${secHeads[s].text.slice(0, 70).padEnd(70)} SUM ${fmt(sum)} (${items} items)`;
        if (caps.length) line += ` | caps excluded: ${caps.map(fmt).join(', ')}`;
        if (rescissions.length) line += ` | rescissions: ${rescissions.map(fmt).join(', ')}`;
        if (hasOfWhich) line += ' | ⚠ "of which" present — verify';
        console.log(line);
    }
}
