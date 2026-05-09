// validate-batch.js
// Pre-push validation — checks that all batch processing is complete and correct.
// Run standalone: node scripts/validate-batch.js
// Called automatically by run-batch.js at the end of each pipeline run.

const fs   = require('fs');
const path = require('path');

const DATA         = path.join(__dirname, '../data');
const BILL_TEXT    = path.join(DATA, 'bill-text');
const SITEMAP_FILE = path.join(__dirname, '../sitemap.xml');

// ── Load data ──────────────────────────────────────────────────────────────

const cache  = JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8'));
const bills  = cache.bills || [];

let rawBills = [];
try { rawBills = JSON.parse(fs.readFileSync(path.join(DATA, 'bills_raw.json'), 'utf8')); }
catch (e) {}

let quotes = { processedDates: [] };
try { quotes = JSON.parse(fs.readFileSync(path.join(DATA, 'quotes.json'), 'utf8')); }
catch (e) {}

let crRaw = [];
try { crRaw = JSON.parse(fs.readFileSync(path.join(DATA, 'cr_raw.json'), 'utf8')); }
catch (e) {}

// ── Reporting ──────────────────────────────────────────────────────────────

let errors = 0, warnings = 0;

function pass(msg)  { console.log(`  ✅ ${msg}`); }
function warn(msg)  { console.log(`  ⚠️  ${msg}`); warnings++; }
function fail(msg)  { console.log(`  ❌ ${msg}`); errors++; }
function section(label) { console.log(`\n── ${label}`); }

// ── Check: unprocessed bills ───────────────────────────────────────────────

section('Unprocessed bills');
{
    const cachedIds   = new Set(bills.map(b => b.id));
    const unprocessed = rawBills.filter(b => !cachedIds.has(b.billId));
    if (unprocessed.length === 0) {
        pass('All fetched bills have been analyzed');
    } else {
        unprocessed.forEach(b => fail(`Not yet analyzed: ${b.billId} — ${b.title}`));
    }
}

// ── Check: required fields ─────────────────────────────────────────────────

section('Required fields');
{
    const REQUIRED = ['summary', 'brief', 'top_lines', 'sections', 'changes', 'stageDate', 'date', 'stage', 'likelihood'];
    let allOk = true;
    for (const bill of bills) {
        const missing = REQUIRED.filter(f => {
            const v = bill[f];
            return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
        });
        if (missing.length) { fail(`${bill.id}: missing ${missing.join(', ')}`); allOk = false; }
    }
    if (allOk) pass('All bills have required fields');
}

// ── Check: bill text files ─────────────────────────────────────────────────

section('Bill text files');
{
    let allOk = true;
    for (const bill of bills) {
        const file = path.join(BILL_TEXT, `${bill.id}.txt`);
        if (!fs.existsSync(file)) {
            fail(`Missing: data/bill-text/${bill.id}.txt`);
            allOk = false;
        } else {
            const size = fs.statSync(file).size;
            if (size < 500) { warn(`${bill.id}.txt is suspiciously small (${size} bytes)`); }
        }
    }
    if (allOk) pass('All bills have text files');
}

// ── Check: billSection on top_lines ───────────────────────────────────────

section('billSection fields on top_lines');
{
    // Resolving-clause bill types have no section anchors — skip them
    const NO_ANCHOR_TYPES = new Set(['HJRES', 'HCONRES', 'SCONRES', 'SRES', 'HRES']);
    let missing = 0;
    for (const bill of bills) {
        const type = bill.id.split('-')[1];
        if (NO_ANCHOR_TYPES.has(type)) continue;
        for (const tl of (bill.top_lines || [])) {
            if (typeof tl === 'object' && !tl.billSection) {
                warn(`${bill.id}: top_line "${(tl.headline || '').slice(0, 45)}" missing billSection`);
                missing++;
            }
        }
    }
    if (missing === 0) pass('All top_lines have billSection fields');
}

// ── Check: section label format ────────────────────────────────────────────

section('Section label format');
{
    let issues = 0;
    for (const bill of bills) {
        for (const sec of (bill.sections || [])) {
            if (sec.billSection) continue;
            const label = sec.label || '';
            const autoOk =
                /^Sections?\s+\d/i.test(label) ||
                /^Title\s+[IVXLC]/i.test(label) ||
                /^resolving/i.test(label);
            if (!autoOk && label.length > 0) {
                warn(`${bill.id}: section label won't auto-link: "${label.slice(0, 55)}"`);
                issues++;
            }
        }
    }
    if (issues === 0) pass('All section labels auto-parse or have explicit billSection');
}

// ── Check: raw dollar amounts ──────────────────────────────────────────────

section('Dollar amount formatting');
{
    const RAW_DOLLAR = /\$\d{1,3}(?:,\d{3}){2,}/;
    let found = 0;
    for (const bill of bills) {
        const searchIn = [
            ['summary', bill.summary],
            ['brief', bill.brief],
            ...( bill.top_lines || []).flatMap((tl, i) =>
                (tl.subs || []).map((s, j) => [`top_lines[${i}].subs[${j}]`, s])
            ),
            ...(bill.sections || []).flatMap((sec, i) =>
                (sec.items || []).flatMap((item, j) => [
                    [`sections[${i}].items[${j}].main`, item.main],
                    [`sections[${i}].items[${j}].detail`, item.detail],
                ])
            ),
        ];
        for (const [loc, text] of searchIn) {
            if (RAW_DOLLAR.test(text || '')) {
                fail(`${bill.id} ${loc}: contains raw dollar amount`);
                found++;
            }
        }
    }
    if (found === 0) pass('No raw dollar amounts found');
}

// ── Check: vote data ───────────────────────────────────────────────────────

section('Vote data');
{
    const NEEDS_VOTES = new Set(['house', 'senate', 'signed']);
    let missing = 0;
    for (const bill of bills) {
        if (!NEEDS_VOTES.has(bill.stage)) continue;
        if (!bill.votes || bill.votes.length === 0) {
            warn(`${bill.id}: no votes (stage: ${bill.stage}) — voice vote or fetch returned nothing`);
            missing++;
        }
    }
    if (missing === 0) pass('All passed/signed bills have vote data');
}

// ── Check: CR dates processed ──────────────────────────────────────────────

section('CR dates processed');
{
    if (crRaw.length === 0) {
        pass('No pending CR data (cr_raw.json is empty)');
    } else {
        const crDates    = [...new Set(crRaw.map(g => g.date))];
        const processed  = new Set(quotes.processedDates || []);
        const pending    = crDates.filter(d => !processed.has(d));
        if (pending.length === 0) {
            pass(`All ${crDates.length} CR date(s) have been processed`);
        } else {
            pending.forEach(d => warn(`CR date not yet processed: ${d}`));
        }
    }
}

// ── Check: sitemap ─────────────────────────────────────────────────────────

section('Sitemap');
{
    if (!fs.existsSync(SITEMAP_FILE)) {
        fail('sitemap.xml not found — run generate_sitemap.js');
    } else {
        const sitemap = fs.readFileSync(SITEMAP_FILE, 'utf8');
        let missing = 0;
        for (const bill of bills) {
            if (!sitemap.includes(bill.id)) {
                warn(`${bill.id} not in sitemap.xml`);
                missing++;
            }
        }
        if (missing === 0) pass(`sitemap.xml is current (${bills.length} bills accounted for)`);
        else warn(`Run generate_sitemap.js to update`);
    }
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(56));
console.log(`  ${errors} error(s)   ${warnings} warning(s)`);
if (errors > 0) {
    console.log('  ❌ NOT ready to push — fix errors first.');
} else if (warnings > 0) {
    console.log('  ⚠️  Ready to push — review warnings above.');
} else {
    console.log('  ✅ All checks passed — ready to push.');
}
console.log('═'.repeat(56) + '\n');

if (errors > 0) process.exit(1);
