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
//   node scripts/fetch-reference.js --rule "house:XV"       (House Rule XV, current Congress)
//
// --rule pulls a standing chamber rule from the House Rules and Manual (govinfo HMAN),
// which prints the rule text AND the parliamentary annotations under it. Explainer
// articles are sourced from these exactly as bill analyses are sourced from bill text.
// House only: govinfo's modern Senate Manual packages are not published under SMAN the
// way HMAN is, so --rule senate is deliberately unimplemented rather than guessed at.

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

// Registry of every source ever fetched, keyed by id. A bill records its own
// referencedSources inline in cache.json, but an ARTICLE ledger only stores the
// id -- so without this the label, citation and srcUrl of a fetched source would
// exist nowhere except the terminal output of the run that fetched it. Upsert,
// so re-fetching refreshes fetchedAt without duplicating.
const REGISTRY = path.join(__dirname, '../data/ref-sources.json');
function registerSource(entry) {
    let reg = {};
    try { reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch (e) { reg = {}; }
    reg[entry.id] = entry;
    const ordered = {};
    for (const k of Object.keys(reg).sort()) ordered[k] = reg[k];
    fs.writeFileSync(REGISTRY, JSON.stringify(ordered, null, 2) + '\n');
    const back = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    if (!back[entry.id]) throw new Error('source registry write did not read back');
    console.log(`  ↳ registered in data/ref-sources.json (${Object.keys(back).length} source(s))`);
}

function emitEntry(entry) {
    registerSource(entry);
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

// ── Standing chamber RULE (govinfo HMAN — House Rules and Manual) ───────────
async function fetchReferencedRule(spec) {
    if (!GOVINFO_API_KEY) { console.error('  ❌ GOVINFO_API_KEY missing in .env'); process.exit(1); }
    const m = spec.match(/^\s*(house)\s*[:\s]\s*([IVXLC]+)\s*$/i);
    if (!m) {
        console.error(`  ❌ --rule must look like "house:XV" (chamber:roman numeral). Got "${spec}"`);
        console.error('     Senate rules are not available through this path — see the header note.');
        process.exit(1);
    }
    const numeral = m[2].toUpperCase();

    // 1. Newest HMAN package = the current Congress's rules. Walk back so an
    //    un-republished Congress falls through to the last one actually published.
    console.log('  Resolving the newest House Rules and Manual package…');
    let pkg = null;
    for (let c = 130; c >= 115 && !pkg; c--) {
        const r = await fetch(`https://api.govinfo.gov/packages/HMAN-${c}/summary?api_key=${GOVINFO_API_KEY}`);
        if (r.ok) pkg = `HMAN-${c}`;
    }
    if (!pkg) { console.error('  ❌ Could not find any HMAN package.'); process.exit(1); }
    console.log(`  Using ${pkg}. Locating Rule ${numeral}…`);

    // 2. The granule list carries no rule heading, so scan the HOUSERULES granules
    //    and match each one's summary heading. ~30 lookups, worst case.
    const granules = [];
    for (let off = 0; ; off += 100) {
        const r = await fetch(`https://api.govinfo.gov/packages/${pkg}/granules?offset=${off}&pageSize=100&api_key=${GOVINFO_API_KEY}`);
        if (!r.ok) break;
        const j = await r.json();
        granules.push(...(j.granules || []));
        if (!(j.granules || []).length || granules.length >= (j.count || 0)) break;
    }
    let hit = null;
    for (const g of granules.filter(g => g.granuleClass === 'HOUSERULES')) {
        const r = await fetch(`https://api.govinfo.gov/packages/${pkg}/granules/${g.granuleId}/summary?api_key=${GOVINFO_API_KEY}`);
        if (!r.ok) continue;
        const s = await r.json();
        if (String(s.heading || '').trim().toUpperCase() === `RULE ${numeral}`) { hit = { ...g, ...s }; break; }
    }
    if (!hit) { console.error(`  ❌ Could not find Rule ${numeral} in ${pkg}.`); process.exit(1); }

    // 3. Fetch + clean the rule text (rule + annotations).
    const htmBase = `https://api.govinfo.gov/packages/${pkg}/granules/${hit.granuleId}/htm`;
    const tr = await fetch(`${htmBase}?api_key=${GOVINFO_API_KEY}`);
    if (!tr.ok) { console.error(`  ❌ Rule text fetch failed (HTTP ${tr.status}).`); process.exit(1); }
    const text = cleanHTML(await tr.text());
    if (text.length < 500) { console.error('  ❌ Rule text suspiciously short — aborting.'); process.exit(1); }

    const congress = pkg.split('-')[1];
    const slug = `hman-${congress}-rule-${numeral.toLowerCase()}`;
    const textFile = save(slug, text);
    emitEntry({
        id: slug,
        kind: 'rule',
        label: arg('--label') || `House Rule ${numeral} — ${hit.title} (${congress}th Congress)`,
        citation: `House Rule ${numeral}`,
        srcUrl: `https://www.govinfo.gov/app/details/${pkg}/${hit.granuleId}`,
        textFile,
        fetchedAt: today(),
    });
}

(async () => {
    const bill = arg('--bill'), usc = arg('--usc'), rule = arg('--rule');
    if (bill)      await fetchReferencedBill(bill);
    else if (usc)  await fetchReferencedUSC(usc);
    else if (rule) await fetchReferencedRule(rule);
    else {
        console.error('Usage:\n  node scripts/fetch-reference.js --bill 119-HR-1234\n  node scripts/fetch-reference.js --usc "50:1881a" [--label "FISA Section 702"]\n  node scripts/fetch-reference.js --rule "house:XV"');
        process.exit(1);
    }
})();
