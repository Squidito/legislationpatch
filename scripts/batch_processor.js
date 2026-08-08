// scripts/batch_processor.js
//
// Shared Congress.gov / GovInfo fetch + HTML-clean helpers.
//
// NOTE: This file used to also contain a local-LLM ("LM Studio") auto-analysis
// CLI (processBill / runBatch / callLocalLLM / verifyOutput / chunking, etc.).
// That machine has been removed — bill analysis is done in-conversation, not by
// a local model. What remains here is purely the network/parse helpers that the
// live pipeline tools depend on:
//   • fetch_bill_text.js  → fetchBillText
//   • fetch_bill_cr.js    → fetchBillActions, extractFloorDates,
//                            fetchCongressionalRecord, parseReportRefs,
//                            fetchCommitteeReportText
// (the remaining exports are internal collaborators of the above.)
//
// If a local model is ever reintroduced, the auto-analysis CLI can be rebuilt on
// top of these helpers. Natural follow-up: rename this file to lib/congress-api.js.

// --- CONFIGURATION + shared helpers (scripts/lib/, B2 extraction 2026-07-06) ---
const { CONGRESS_API_KEY, GOVINFO_API_KEY, CONGRESS_SESSION } = require('./lib/config.js');
const { sleep, cleanHTML, cleanHTMLStructured } = require('./lib/fetch-helpers.js');
const congressApi = require('./lib/congress-api.js');
const { formatBillTypeForRecord } = congressApi;

// (moved to scripts/lib/fetch-helpers.js) cleanHTML

// Like cleanHTML but preserves paragraph structure by converting block-level closing
// tags to newlines before stripping. Used for committee reports where line breaks
// are needed to detect signature blocks at the end of views sections.
// (moved to scripts/lib/fetch-helpers.js) cleanHTMLStructured

// (moved to scripts/lib/congress-api.js) formatBillTypeForRecord

async function fetchBillText(bill) {
    const { congress, type, number } = bill;
    const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}/text?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(4000);
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res  = await fetch(url);
            const data = await res.json();
            if (!data.textVersions?.length) {
                console.log(`  [text] No text versions listed on Congress.gov for ${congress}-${type}-${number}`);
                return { text: '', isXML: false };
            }
            // Pick the LATEST version by type priority (Enrolled > ... > Introduced),
            // NOT array position. Congress.gov ordering is not guaranteed, and the old
            // [length-1] returned the OLDEST (Introduced) — silently re-introducing
            // version drift. Mirrors selectLatestTextVersion() in fetch_bills_data.js.
            const vrank = v => { const t = (v.type || '').toLowerCase();
                return t.includes('enrolled') ? 100 : t.includes('public law') ? 95
                     : t.includes('engrossed amendment') ? 90 : t.includes('engrossed') ? 80
                     : t.includes('reported') ? 60 : t.includes('referred') ? 40
                     : t.includes('introduced') ? 20 : 10; };
            const version = [...data.textVersions].sort((a, b) => (vrank(b) - vrank(a)) || (new Date(b.date || 0) - new Date(a.date || 0)))[0];
            // Prefer Formatted XML for structural chunking; fall back to Formatted Text
            const xmlFormat  = version.formats.find(f => f.type === 'Formatted XML');
            const textFormat = version.formats.find(f => f.type === 'Formatted Text');
            const format     = xmlFormat || textFormat;
            if (!format) {
                console.log(`  [text] No usable format for ${congress}-${type}-${number} (version: ${version.type})`);
                return { text: '', isXML: false };
            }
            await sleep(1000);
            const rawRes = await fetch(format.url);
            if (!rawRes.ok) throw new Error(`Text URL returned HTTP ${rawRes.status}`);
            const text = await rawRes.text();
            if (!text?.trim()) throw new Error('Text URL returned empty body');
            console.log(`  [text] Fetched ${Math.round(text.length/1000)}K chars (${version.type}) on attempt ${attempt}`);
            return { text, isXML: !!xmlFormat };
        } catch (e) {
            console.error(`  [text] Attempt ${attempt}/3 failed for ${congress}-${type}-${number}: ${e.message}`);
            if (attempt < 3) await sleep(5000 * attempt);
        }
    }
    console.error(`  [text] All 3 attempts failed — bill will be skipped.`);
    return { text: '', isXML: false };
}

// Unified paginated fetch lives in scripts/lib/congress-api.js. This wrapper
// preserves this module's historical contract for downstream importers
// (fetch_bill_cr.js): [] on failure, never null.
async function fetchBillActions(congress, type, number) {
    return (await congressApi.fetchBillActions(congress, type, number, { pace: 2000 })) || [];
}

function extractFloorDates(actions, fallbackDate) {
    const FLOOR_KEYWORDS = [
        'passed house', 'passed senate', 'passed the house', 'passed the senate',
        'house agreed', 'senate agreed', 'on passage', 'final passage',
        'motion to reconsider', 'yeas and nays', 'recorded vote', 'roll call',
        'received in the senate', 'received in the house',
        'signed by president', 'became public law',
    ];
    const dates = new Set();
    for (const action of (actions || [])) {
        const text = (action.text || '').toLowerCase();
        const date = action.actionDate;
        if (!date) continue;
        if (FLOOR_KEYWORDS.some(kw => text.includes(kw))) {
            dates.add(date);
            // Add day before — floor debate precedes the vote
            const d = new Date(`${date}T12:00:00`);
            d.setDate(d.getDate() - 1);
            dates.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
        }
    }
    if (fallbackDate && !dates.has(fallbackDate)) dates.add(fallbackDate);
    return [...dates].sort((a, b) => b.localeCompare(a)); // newest first
}

// Parse CR page references embedded in action texts: "(text: CR H1147)" → [{date, page}]
function parseCRPageRefs(actions) {
    const seen = new Set();
    const refs  = [];
    for (const action of (actions || [])) {
        const date = action.actionDate;
        if (!date) continue;
        for (const m of (action.text || '').matchAll(/\bCR\s+([HS]\d+)/g)) {
            const key = `${date}-${m[1]}`;
            if (!seen.has(key)) { seen.add(key); refs.push({ date, page: m[1] }); }
        }
    }
    return refs;
}

// Parse H./S. Rept. references from action texts: "H. Rept. 119-42" → [{chamber, congress, number}]
function parseReportRefs(actions) {
    const seen = new Set();
    const refs  = [];
    for (const action of (actions || [])) {
        for (const m of (action.text || '').matchAll(/\b([HS])\.\s*Rept\.\s*(\d+)-(\d+)/g)) {
            const key = `${m[1]}-${m[2]}-${m[3]}`;
            if (!seen.has(key)) {
                seen.add(key);
                refs.push({ chamber: m[1], congress: parseInt(m[2], 10), number: parseInt(m[3], 10) });
            }
        }
    }
    return refs;
}

// Fetch a full committee report from GovInfo and return it as structured text.
// Package ID format: H. Rept. 119-42 → CRPT-119hrpt42
async function fetchCommitteeReportText(chamber, congress, reportNumber) {
    if (!GOVINFO_API_KEY) return '';
    const chamberStr = chamber === 'H' ? 'hrpt' : 'srpt';
    const packageId  = `CRPT-${congress}${chamberStr}${reportNumber}`;
    console.log(`   - Fetching committee report ${packageId}...`);
    await sleep(1000);
    try {
        const res = await fetch(
            `https://api.govinfo.gov/packages/${packageId}/htm?api_key=${GOVINFO_API_KEY}`
        );
        if (res.status === 429) { await sleep(30000); return ''; }
        if (!res.ok) { console.log(`   - Report ${packageId}: HTTP ${res.status}`); return ''; }
        const html = await res.text();
        console.log(`   - Report ${packageId}: ${html.length} chars raw`);
        return cleanHTMLStructured(html);
    } catch (e) {
        console.log(`   - Report fetch error: ${e.message}`);
        return '';
    }
}

// Directly fetch specific CR granules by page reference — fast path, no granule iteration.
// Each page ref gets the base granule + sub-granule suffixes (-2 through -6) because
// the CR splits a single page into multiple sub-granules per bill or speaker.
// Returns the full cleaned granule text (not just mention windows) because when we
// have the specific bill granule, the whole thing is relevant.
async function fetchCRByPageRefs(refs, type, number) {
    if (!GOVINFO_API_KEY || !refs?.length) return '';
    const chunks = [];
    const seen   = new Set();
    for (const { date, page } of refs) {
        const packageId = `CREC-${date}`;
        for (const suffix of ['', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9']) {
            const granuleId = `${packageId}-pt1-Pg${page}${suffix}`;
            if (seen.has(granuleId)) continue;
            seen.add(granuleId);
            try {
                await sleep(400);
                const r = await fetch(
                    `https://api.govinfo.gov/packages/${packageId}/granules/${granuleId}/htm?api_key=${GOVINFO_API_KEY}`
                );
                if (r.status === 429) { await sleep(30000); continue; }
                if (!r.ok) continue;
                const text = cleanHTML(await r.text());
                const hasMention = extractBillMentions(text, type, number);
                if (hasMention) {
                    console.log(`   - Found bill in ${granuleId} (${text.length} chars)`);
                    chunks.push(text);
                }
            } catch (e) { continue; }
        }
    }
    return chunks.join('\n\n===\n\n');
}

// Single-date CR fetch via GovInfo granules — returns bill mention excerpts or ''
// Congress.gov CR API only returns PDF links; GovInfo provides the HTML granule text.
async function fetchCRForDate(dateStr, billType, billNumber) {
    if (!dateStr || !GOVINFO_API_KEY) return '';
    const d = new Date(`${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return '';

    const year  = d.getFullYear();
    const month = d.getMonth() + 1;
    const day   = d.getDate();

    // Step 1: Get CR package ID from Congress.gov (confirms CR exists for this date)
    await sleep(1200);
    let packageId;
    try {
        const crRes = await fetch(
            `https://api.congress.gov/v3/congressional-record?y=${year}&m=${month}&d=${day}&format=json&api_key=${CONGRESS_API_KEY}`
        );
        if (!crRes.ok) return '';
        const crData = await crRes.json();
        const issues = crData.Results?.Issues || crData.dailyCongressionalRecord || [];
        if (!issues.length) return '';
        const pub = issues[0].PublishDate
            || `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        packageId = `CREC-${pub}`;
    } catch (e) { return ''; }

    // Step 2: List granules from GovInfo, filter to the correct chamber
    const isHouse      = ['HR', 'HRES', 'HJRES', 'HCONRES'].includes(billType.toUpperCase());
    const granuleClass = isHouse ? 'HOUSE' : 'SENATE';
    const SKIP_TITLES  = [
        'PRAYER', 'PLEDGE', 'QUORUM', 'RECESS', 'TRIBUTE', 'HONORING', 'RECOGNIZING',
        'ADDITIONAL COSPONSORS', 'INTRODUCTION OF BILLS', 'MESSAGE FROM',
        'MEASURES PLACED', 'MEASURES READ', 'REPORTS OF COMMITTEES',
    ];

    // Step 2: Fetch all granule titles from GovInfo (paginated via offsetMark)
    let granules = [];
    try {
        let mark = '*';
        while (granules.length < 400) {
            await sleep(800);
            const grRes = await fetch(
                `https://api.govinfo.gov/packages/${packageId}/granules?api_key=${GOVINFO_API_KEY}&pageSize=100&offsetMark=${encodeURIComponent(mark)}`
            );
            if (grRes.status === 429) { await sleep(30000); break; }
            if (!grRes.ok) break;
            const grData = await grRes.json();
            granules = granules.concat(grData.granules || []);
            if (!grData.nextPage) break;
            mark = new URL(grData.nextPage).searchParams.get('offsetMark') || mark;
        }
    } catch (e) { return ''; }

    granules = granules
        .filter(g => g.granuleClass === granuleClass)
        .filter(g => !SKIP_TITLES.some(s => (g.title || '').toUpperCase().startsWith(s)));

    if (!granules.length) return '';

    // Prioritise granules whose title mentions the bill number — fetch those first
    const formattedType = formatBillTypeForRecord(billType);
    const titlePatterns = [
        `${formattedType} ${billNumber}`.toUpperCase(),
        `${billType} ${billNumber}`.toUpperCase(),
        ` ${billNumber} `, ` ${billNumber},`, ` ${billNumber}.`,
    ];
    const priority  = granules.filter(g => titlePatterns.some(p => (g.title || '').toUpperCase().includes(p)));
    const remainder = granules.filter(g => !priority.includes(g)).slice(0, 20);
    const toFetch   = [...priority, ...remainder].slice(0, 30);

    // Step 3: Fetch each granule's HTML text and return full granule for any that mention this bill.
    // Full granule text (rather than ±2500-char context windows) captures all speakers in the debate.
    const found = [];
    for (const g of toFetch) {
        try {
            await sleep(600);
            const textRes = await fetch(
                `https://api.govinfo.gov/packages/${packageId}/granules/${g.granuleId}/htm?api_key=${GOVINFO_API_KEY}`
            );
            if (textRes.status === 429) { await sleep(30000); continue; }
            if (!textRes.ok) continue;
            const text = cleanHTML(await textRes.text());
            if (extractBillMentions(text, billType, billNumber)) found.push(text);
        } catch (e) { continue; }
    }

    return found.join('\n\n---\n\n');
}

// Primary CR fetch — tries page refs first (fast), falls back to date scanning (thorough)
async function fetchCongressionalRecord(type, number, dates, actions = []) {
    // Fast path: derive exact granule IDs from CR page references in action texts
    if (actions.length && GOVINFO_API_KEY) {
        const refs = parseCRPageRefs(actions);
        if (refs.length) {
            console.log(`   - Trying ${refs.length} direct CR page reference(s)...`);
            const result = await fetchCRByPageRefs(refs, type, number);
            if (result) return result;
            console.log('   - Page refs yielded no mentions; falling back to date scan.');
        }
    }

    if (!dates?.length) return '';
    console.log(`   - Searching Congressional Record across ${dates.length} date(s)...`);
    let accumulated = '';
    let datesChecked = 0;

    for (const dateStr of dates) {
        if (datesChecked >= 12) break;
        process.stdout.write(`   - Checking CR ${dateStr}... `);
        const mentions = await fetchCRForDate(dateStr, type, number);
        datesChecked++;
        if (mentions) {
            console.log(`found (${mentions.length} chars)`);
            accumulated += (accumulated ? '\n\n===\n\n' : '') + mentions;
        } else {
            console.log('not found');
        }
    }

    if (!accumulated) console.log('   - Bill not mentioned in Congressional Record for any checked date.');
    return accumulated;
}

function extractBillMentions(text, billType, billNumber) {
    const formattedType = formatBillTypeForRecord(billType);
    const patterns = [
        `${formattedType} ${billNumber}`,
        `${formattedType}${billNumber}`,
        `${billType} ${billNumber}`,
        `${billType}.${billNumber}`,
    ];
    const found = patterns.some(p => text.includes(p));
    if (!found) console.log('   - Bill not mentioned in this granule.');
    return found;
}

module.exports = {
    fetchBillActions,
    extractFloorDates,
    parseCRPageRefs,
    parseReportRefs,
    fetchCRByPageRefs,
    fetchCRForDate,
    fetchCongressionalRecord,
    fetchCommitteeReportText,
    fetchBillText,
    extractBillMentions,
    cleanHTML,
    cleanHTMLStructured,
    formatBillTypeForRecord,
};
