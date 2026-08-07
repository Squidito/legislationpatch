// scripts/fetch-reference.js
//
// Fetches a REFERENCED source (another bill, a public law, or a U.S. Code
// statute section) so its text can back cross-referenced figures in an analysis
// — and so the figure-sourcing guard can verify those figures against it.
//
// This supports the cross-bill / referenced-source practice (see CLAUDE.md):
// when a bill references another bill/act, the substantive figures live in the
// referenced source. We fetch + STORE that source so provenance is recorded and
// every cross-sourced figure stays verifiable. Training data is NEVER a source.
//
// It does NOT mutate cache.json. It saves the source text to data/ref-text/ and
// prints the `referencedSources` entry for you to paste into the bill's cache
// entry (analysis is written in-conversation). Then tag the cross-sourced items
// with  "source": "<id>"  and run validate-batch.
//
// Usage:
//   node scripts/fetch-reference.js --bill 119-HR-1234
//   node scripts/fetch-reference.js --usc "50:1881a"        (50 U.S.C. 1881a)
//   node scripts/fetch-reference.js --usc "50:1881a" --label "FISA Section 702"

'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { fetchBillText, cleanHTML } = require('./batch_processor');

const GOVINFO_API_KEY = process.env.GOVINFO_API_KEY || '';
const REF_DIR = path.join(__dirname, '../data/ref-text');

function arg(flag) {
    const i = process.argv.indexOf(flag);
    return i !== -1 ? process.argv[i + 1] : null;
}
const today = () => new Date().toISOString().slice(0, 10);

function ensureDir() { fs.mkdirSync(REF_DIR, { recursive: true }); }

function save(slug, text) {
    ensureDir();
    const file = path.join(REF_DIR, `${slug}.txt`);
    fs.writeFileSync(file, text, 'utf8');
    return path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
}

function emitEntry(entry) {
    console.log('\n  ✅ Saved referenced source text. Paste this into the bill\'s "referencedSources": [ ... ]');
    console.log('     and tag each cross-sourced item with  "source": "' + entry.id + '"\n');
    console.log(JSON.stringify(entry, null, 2).split('\n').map(l => '  ' + l).join('\n'));
    console.log('');
}

// ── Referenced BILL / public law (Congress.gov) ─────────────────────────────
async function fetchReferencedBill(billId) {
    const m = billId.match(/^(\d+)-([A-Za-z]+)-(\d+)$/);
    if (!m) { console.error(`  ❌ --bill must look like 119-HR-1234 (got "${billId}")`); process.exit(1); }
    const [, congress, type, number] = m;
    console.log(`  Fetching referenced bill ${billId} from Congress.gov…`);
    const { text } = await fetchBillText({ congress, type, number });
    if (!text || text.trim().length < 200) {
        console.error('  ❌ No usable text returned for that bill (no text version on Congress.gov?).');
        process.exit(1);
    }
    const slug = `bill-${congress}-${type.toLowerCase()}-${number}`;
    const textFile = save(slug, text);
    emitEntry({
        id: slug,
        kind: 'bill',
        label: arg('--label') || `${type.toUpperCase()} ${number} (${congress}th Congress)`,
        citation: `${type.toUpperCase()} ${number}`,
        srcUrl: `https://www.congress.gov/bill/${congress}th-congress/${/^s/i.test(type) ? 'senate' : 'house'}-bill/${number}/text`,
        textFile,
        fetchedAt: today(),
    });
}

// ── Referenced U.S. CODE section (GovInfo USCODE) ───────────────────────────
async function fetchReferencedUSC(spec) {
    if (!GOVINFO_API_KEY) { console.error('  ❌ GOVINFO_API_KEY missing in .env'); process.exit(1); }
    const m = spec.match(/^(\d+)\s*[:\s]\s*([0-9]+[A-Za-z0-9\-]*)$/);
    if (!m) { console.error(`  ❌ --usc must look like "50:1881a" (title:section). Got "${spec}"`); process.exit(1); }
    const title = m[1], section = m[2];

    // 1. Resolve the latest USCODE-{year}-title{N} package.
    console.log(`  Resolving latest USCODE package for title ${title}…`);
    let pkg = null;
    for (let year = new Date().getFullYear(); year >= 2018 && !pkg; year--) {
        const id = `USCODE-${year}-title${title}`;
        const r = await fetch(`https://api.govinfo.gov/packages/${id}/summary?api_key=${GOVINFO_API_KEY}`);
        if (r.ok) pkg = id;
    }
    if (!pkg) { console.error(`  ❌ Could not find a USCODE package for title ${title}.`); process.exit(1); }
    console.log(`  Using ${pkg}. Locating section ${section}…`);

    // 2. Page through the title's granules to find the one for this section.
    const want = `-sec${section}`.toLowerCase();
    let mark = '*', granuleId = null;
    for (let page = 0; page < 12 && !granuleId; page++) {
        const r = await fetch(`https://api.govinfo.gov/packages/${pkg}/granules?api_key=${GOVINFO_API_KEY}&pageSize=1000&offsetMark=${encodeURIComponent(mark)}`);
        if (!r.ok) break;
        const j = await r.json();
        const hit = (j.granules || []).find(g => (g.granuleId || '').toLowerCase().endsWith(want));
        if (hit) granuleId = hit.granuleId;
        if (!j.nextPage) break;
        mark = new URL(j.nextPage).searchParams.get('offsetMark') || mark;
    }
    if (!granuleId) { console.error(`  ❌ Could not find section ${section} in ${pkg}.`); process.exit(1); }

    // 3. Fetch + clean the section text.
    const htmBase = `https://api.govinfo.gov/packages/${pkg}/granules/${granuleId}/htm`;
    const tr = await fetch(`${htmBase}?api_key=${GOVINFO_API_KEY}`);
    if (!tr.ok) { console.error(`  ❌ Section text fetch failed (HTTP ${tr.status}).`); process.exit(1); }
    const text = cleanHTML(await tr.text());
    if (text.length < 200) { console.error('  ❌ Section text suspiciously short — aborting.'); process.exit(1); }

    const slug = `usc-${title}-${section.toLowerCase()}`;
    const textFile = save(slug, text);
    emitEntry({
        id: slug,
        kind: 'statute',
        label: arg('--label') || `${title} U.S.C. ${section}`,
        citation: `${title} U.S.C. ${section}`,
        srcUrl: htmBase,
        textFile,
        fetchedAt: today(),
    });
}

(async () => {
    const bill = arg('--bill'), usc = arg('--usc');
    if (bill)      await fetchReferencedBill(bill);
    else if (usc)  await fetchReferencedUSC(usc);
    else {
        console.error('Usage:\n  node scripts/fetch-reference.js --bill 119-HR-1234\n  node scripts/fetch-reference.js --usc "50:1881a" [--label "FISA Section 702"]');
        process.exit(1);
    }
})();
