// scripts/fetch_bill_text.js
// Fetches and saves full bill text for existing cache entries without re-running analysis.
// Text is saved to data/bill-text/{billId}.txt and served by bill.html.
//
// Usage:
//   node scripts/fetch_bill_text.js              # all analyzed bills missing text files
//   node scripts/fetch_bill_text.js --bill 119-HR-2319   # single bill
//   node scripts/fetch_bill_text.js --all --force        # overwrite existing files

'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const { fetchBillText, cleanHTML } = require('./batch_processor');

const CACHE_FILE   = path.join(__dirname, '../data/cache.json');
const BILL_TEXT_DIR = path.join(__dirname, '../data/bill-text');
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync(BILL_TEXT_DIR)) fs.mkdirSync(BILL_TEXT_DIR, { recursive: true });

function parseBillId(id) {
    const parts = id.split('-');
    return { congress: parseInt(parts[0], 10), type: parts[1], number: parts[2] };
}

async function processBill(bill) {
    const { congress, type, number } = parseBillId(bill.id);
    console.log(`[${bill.id}] Fetching text...`);

    const { text: raw, isXML } = await fetchBillText({ congress, type, number });
    if (!raw) {
        console.log(`  ✕ No text available from Congress.gov`);
        return false;
    }

    const clean = cleanHTML(raw);
    const outPath = path.join(BILL_TEXT_DIR, `${bill.id}.txt`);
    fs.writeFileSync(outPath, clean);
    console.log(`  ✓ Saved ${clean.length.toLocaleString()} chars → data/bill-text/${bill.id}.txt`);
    return true;
}

async function main() {
    const billFlagIdx = process.argv.indexOf('--bill');
    const billArg     = billFlagIdx !== -1 ? process.argv[billFlagIdx + 1] : null;
    const force       = process.argv.includes('--force');

    const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    const bills     = Array.isArray(cacheData.bills) ? cacheData.bills : Object.values(cacheData.bills || {});

    let targets;
    if (billArg) {
        targets = bills.filter(b => b.id === billArg);
        if (!targets.length) { console.error(`Bill ${billArg} not found in cache.json`); process.exit(1); }
    } else {
        targets = bills.filter(b => {
            if (!b.analyzed || b.demo) return false;
            if (force) return true;
            return !fs.existsSync(path.join(BILL_TEXT_DIR, `${b.id}.txt`));
        });
    }

    if (!targets.length) {
        console.log('All bill text files already exist. Use --force to overwrite.');
        return;
    }

    console.log(`=== FETCH BILL TEXT — ${targets.length} bill(s) ===\n`);

    let saved = 0;
    for (const bill of targets) {
        const ok = await processBill(bill);
        if (ok) saved++;
        await sleep(500);
    }

    console.log(`\nDone. ${saved}/${targets.length} bill(s) saved to data/bill-text/`);
}

main().catch(console.error);
