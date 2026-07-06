#!/usr/bin/env node
// add-bills.js — merge analyzed bill entries into data/cache.json
//
// Replaces the one-off _add-*.js pattern: batch data lives in a JSON data file
// (diffable, reviewable, replayable), never embedded in a new script.
// See SCRIPT-CONVENTIONS.md §2/§8.
//
// Usage:
//   node scripts/add-bills.js <analysis-file.json> [--force] [--dry-run]
//
// <analysis-file.json>: {"bills":[{...}, ...]} or a bare array [{...}, ...]
// Existing bill ids are SKIPPED unless --force (then replaced).
// --dry-run prints what would change without writing.
//
// After running: npm run validate

const fs = require('fs');
const path = require('path');
const { SMART_QUOTES } = require('./lib/patterns.js');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

if (!file) {
    console.error('Usage: node scripts/add-bills.js <analysis-file.json> [--force] [--dry-run]');
    process.exit(1);
}

let raw;
try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error(`Cannot read/parse ${file}: ${e.message}`); process.exit(1); }
const entries = Array.isArray(raw) ? raw : (raw.bills || []);
if (!entries.length) { console.error('No bill entries found in input.'); process.exit(1); }

// Guards: every entry needs an id; catch curly quotes in anchor ids before they
// reach the cache (validate-batch would catch them too, but failing here keeps
// the cache clean instead of dirty-then-flagged).
for (const e of entries) {
    if (!e.id) { console.error('Entry missing "id": ' + JSON.stringify(e).slice(0, 80)); process.exit(1); }
    const checkTl = (tl, where) => {
        if (tl && typeof tl.billSection === 'string' && SMART_QUOTES.test(tl.billSection)) {
            console.error(`${e.id}${where}: billSection contains curly quotes: "${tl.billSection}"`);
            process.exit(1);
        }
    };
    (e.top_lines || []).forEach(tl => checkTl(tl, ''));
    (e.sections || []).forEach(s => checkTl(s, ''));
    for (const d of e.divisions || []) {
        (d.top_lines || []).forEach(tl => checkTl(tl, ` div ${d.divisionKey}`));
        (d.sections || []).forEach(s => checkTl(s, ` div ${d.divisionKey}`));
    }
}

const cachePath = path.join(__dirname, '../data/cache.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

let added = 0, replaced = 0, skipped = 0;
for (const entry of entries) {
    const idx = cache.bills.findIndex(b => b.id === entry.id);
    if (idx >= 0) {
        if (force) { cache.bills[idx] = entry; replaced++; console.log(`  replaced ${entry.id}`); }
        else { skipped++; console.log(`  skipped  ${entry.id} (exists — use --force to replace)`); }
    } else {
        cache.bills.push(entry); added++; console.log(`  added    ${entry.id}`);
    }
}

if (dryRun) {
    console.log(`[dry-run] Would write: +${added} added, ${replaced} replaced, ${skipped} skipped.`);
} else {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
    console.log(`Done: ${added} added, ${replaced} replaced, ${skipped} skipped. Cache: ${cache.bills.length} bills.`);
    console.log('Next: npm run validate');
}
