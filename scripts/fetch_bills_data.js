// fetch_bills_data.js
// Discovers new bills and fetches their raw text + metadata.
// Does NOT call any LLM — outputs data/bills_raw.json for in-conversation Claude processing.
//
// Usage: node scripts/fetch_bills_data.js

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_SESSION = parseInt(process.env.CONGRESS_SESSION || '119', 10);
const CACHE_FILE       = path.join(__dirname, '../data/cache.json');
const OUTPUT_FILE      = path.join(__dirname, '../data/bills_raw.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function cleanHTML(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectStage(latestActionText) {
    const t = (latestActionText || '').toLowerCase();
    if (t.includes('signed by president') || t.includes('became public law') || t.includes('enacted'))
        return { key: 'signed', label: 'Signed into Law', step: 4 };
    if (t.includes('passed senate') || t.includes('senate agreed') || t.includes('received in the senate'))
        return { key: 'senate', label: 'Passed Senate', step: 3 };
    if (t.includes('passed house') || t.includes('passed the house') || t.includes('house agreed') || t.includes('on passage') || t.includes('motion to reconsider laid on the table agreed to'))
        return { key: 'house', label: 'Passed House', step: 2 };
    if (t.includes('union calendar') || t.includes('house calendar') || t.includes('senate calendar') || t.includes('placed on the calendar') || t.includes('calendar no'))
        return { key: 'committee', label: 'On House Calendar', step: 1 };
    if (t.includes('reported by') || t.includes('ordered to be reported') || t.includes('referred to'))
        return { key: 'committee', label: 'In Committee', step: 1 };
    return { key: 'introduced', label: 'Introduced', step: 0 };
}

const DOA_ACTIONS = [
    'introduced in', 'read twice and referred', 'referred to the committee',
    'referred to committee', 'held at the desk', 'referred to the subcommittee'
];

const SKIP_TITLE_PATTERNS = [
    'technical correction', 'clerical amendment', 'to designate the facility',
    'to name the ', 'expressing the sense of congress', 'expressing the sense of the',
    'recognizing the', 'honoring the', 'commending the', 'electing members to',
    'electing a member to', 'expressing the profound sorrow', 'on the death of',
];

function formatBillTypeForRecord(type) {
    const map = {
        'HR': 'H.R.', 'HRES': 'H. Res.', 'HJRES': 'H.J. Res.', 'HCONRES': 'H. Con. Res.',
        'S': 'S.', 'SRES': 'S. Res.', 'SJRES': 'S.J. Res.', 'SCONRES': 'S. Con. Res.',
    };
    return map[type.toUpperCase()] || type;
}

// Load existing cache to know what's already processed
function loadExistingIds() {
    try {
        const raw   = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        const bills = Array.isArray(raw) ? raw : (raw.bills || Object.values(raw));
        return new Set(bills.map(b => b.id));
    } catch (e) { return new Set(); }
}

async function fetchRecentLaws(limit = 20) {
    console.log('[1a] Checking /law endpoint for recently enacted laws...');
    const url = `https://api.congress.gov/v3/law/${CONGRESS_SESSION}?limit=${limit}&format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res  = await fetch(url);
        if (!res.ok) { console.log('    Law endpoint unavailable.'); return []; }
        const data = await res.json();
        const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
        return (data.bills || []).filter(b => {
            if (new Date(b.latestAction?.actionDate || 0) < cutoff) return false;
            const title = (b.title || '').toLowerCase();
            if (SKIP_TITLE_PATTERNS.some(p => title.includes(p))) return false;
            return true;
        });
    } catch (e) { console.error('Law endpoint error:', e.message); return []; }
}

async function fetchRecentBills(limit = 20) {
    console.log(`[1b] Fetching ${limit} recent bills...`);
    const url = `https://api.congress.gov/v3/bill/${CONGRESS_SESSION}?sort=updateDate+desc&limit=${limit}&format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(4000);
    try {
        const res  = await fetch(url);
        if (!res.ok) throw new Error(`Congress API Error: ${res.status}`);
        const data = await res.json();
        return (data.bills || []).filter(b => {
            const action = (b.latestAction?.text || '').toLowerCase();
            const title  = (b.title || '').toLowerCase();
            if (DOA_ACTIONS.some(p => action.includes(p))) return false;
            if (SKIP_TITLE_PATTERNS.some(p => title.includes(p))) return false;
            if (detectStage(b.latestAction?.text || '').step < 2) return false;
            return true;
        });
    } catch (e) { console.error('Failed to fetch bills:', e.message); return []; }
}

async function fetchSpecificBill(type, number) {
    console.log(`   Fetching specific bill: ${type} ${number}...`);
    const url = `https://api.congress.gov/v3/bill/${CONGRESS_SESSION}/${type.toLowerCase()}/${number}?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res  = await fetch(url);
        if (!res.ok) return null;
        return (await res.json()).bill;
    } catch (e) { console.error('Error:', e.message); return null; }
}

async function fetchBillText(congress, type, number) {
    const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}/text?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(4000);
    try {
        const res  = await fetch(url);
        const data = await res.json();
        if (!data.textVersions?.length) return '';
        const version    = data.textVersions[data.textVersions.length - 1];
        const textFormat = version.formats.find(f => f.type === 'Formatted Text') || version.formats[0];
        if (!textFormat) return '';
        await sleep(1000);
        const raw = await (await fetch(textFormat.url)).text();
        return cleanHTML(raw).slice(0, 80000); // cap at 80k chars
    } catch (e) { console.error('Bill text error:', e.message); return ''; }
}

async function fetchBillMetadata(congress, type, number) {
    const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return (await res.json()).bill;
    } catch (e) { console.error('Metadata error:', e.message); return null; }
}

async function fetchCRSSummary(congress, type, number) {
    const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}/summaries?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res  = await fetch(url);
        if (!res.ok) return '';
        const data = await res.json();
        const summaries = data.summaries || [];
        if (!summaries.length) return '';
        return cleanHTML(summaries[summaries.length - 1].text || '');
    } catch (e) { return ''; }
}

async function fetchCongressionalRecord(actionDate, type, number) {
    if (!actionDate) return '';
    const d = new Date(actionDate);
    if (isNaN(d)) return '';
    const year = d.getFullYear(), month = d.getMonth() + 1, day = d.getDate();
    console.log(`   Fetching CR for ${year}-${month}-${day}...`);
    const url = `https://api.congress.gov/v3/congressional-record?y=${year}&m=${month}&d=${day}&format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res  = await fetch(url);
        if (!res.ok) return '';
        const data = await res.json();
        const issues = data.Results?.Issues || data.dailyCongressionalRecord || [];
        if (!issues.length) return '';
        const isHouse = ['HR','HRES','HJRES','HCONRES'].includes(type.toUpperCase());
        const chamberKw = isHouse ? 'House' : 'Senate';
        let sectionUrl = null;
        for (const issue of issues) {
            const items = issue.links?.items || issue.sections || [];
            for (const item of items) {
                if ((item.name || item.label || '').includes(chamberKw)) { sectionUrl = item.url || item.htmlUrl; break; }
            }
            if (!sectionUrl) {
                const links = issue.links || {};
                for (const key of Object.keys(links)) {
                    if (key.includes(chamberKw) && links[key]?.HTML) { sectionUrl = links[key].HTML; break; }
                }
            }
            if (sectionUrl) break;
        }
        if (!sectionUrl) return '';
        await sleep(1500);
        const textRes = await fetch(sectionUrl);
        if (!textRes.ok) return '';
        const fullText = cleanHTML(await textRes.text());
        // Extract context around bill mentions
        const formattedType = formatBillTypeForRecord(type);
        const patterns = [`${formattedType} ${number}`, `${type} ${number}`];
        const found = [];
        for (const pattern of patterns) {
            let idx = fullText.indexOf(pattern);
            while (idx !== -1 && found.length < 4) {
                found.push(fullText.slice(Math.max(0, idx - 2500), Math.min(fullText.length, idx + 2500)));
                idx = fullText.indexOf(pattern, idx + pattern.length);
            }
            if (found.length >= 4) break;
        }
        if (!found.length) { console.log('   Bill not mentioned in CR.'); return ''; }
        console.log(`   Found ${found.length} CR mention(s).`);
        return found.join('\n\n---\n\n').slice(0, 10000);
    } catch (e) { console.error('CR fetch error:', e.message); return ''; }
}

async function processBillEntry(congress, type, number, title) {
    const billId = `${congress}-${type}-${number}`;
    console.log(`\nProcessing ${billId}: ${title}`);
    const [text, meta, crs] = await Promise.all([
        fetchBillText(congress, type, number),
        fetchBillMetadata(congress, type, number),
        fetchCRSSummary(congress, type, number),
    ]);
    if (!text) { console.log('  No text available — skipping.'); return null; }
    const actionDate = meta?.latestAction?.actionDate || '';
    const cr = await fetchCongressionalRecord(actionDate, type, number);
    const stage = detectStage(meta?.latestAction?.text || '');
    console.log(`  Text: ${text.length} chars | CRS: ${crs.length} chars | CR: ${cr.length > 0 ? cr.length + ' chars' : 'none'} | Stage: ${stage.label}`);
    return {
        billId,
        title: meta?.title || title,
        type, number, congress,
        stage: stage.key,
        stageLabel: stage.label,
        latestAction: meta?.latestAction?.text || '',
        actionDate,
        sponsor: meta?.sponsors?.[0] || null,
        cosponsors: meta?.cosponsors?.count || 0,
        introducedDate: meta?.introducedDate || '',
        billText: text,
        crsSummary: crs,
        congressionalRecord: cr,
        hasRecord: cr.length > 0,
    };
}

async function main() {
    if (!CONGRESS_API_KEY) { console.error('CONGRESS_API_KEY not set.'); process.exit(1); }
    const existing = loadExistingIds();
    console.log(`Already in cache: ${existing.size} bills`);

    // Discovery
    const [laws, recent] = await Promise.all([fetchRecentLaws(), fetchRecentBills()]);

    // Merge and deduplicate discovery results
    const seen     = new Set();
    const allFound = [];
    for (const b of [...laws, ...recent]) {
        const id = `${b.congress}-${(b.type || b.billType || '').toUpperCase()}-${b.number}`;
        if (!seen.has(id)) { seen.add(id); allFound.push(b); }
    }

    const newBills = allFound.filter(b => {
        const id = `${b.congress}-${(b.type || b.billType || '').toUpperCase()}-${b.number}`;
        return !existing.has(id);
    });
    console.log(`\nDiscovery: ${allFound.length} eligible bills, ${newBills.length} new (not in cache).`);

    // Also include the 3 manually-queued bills if not already in cache
    const MANUAL_BILLS = [
        { congress: 119, type: 'HR', number: '7148', title: 'Consolidated Appropriations Act 2026' },
        { congress: 119, type: 'HR', number: '6387', title: 'FIRE Act' },
        { congress: 119, type: 'HR', number: '2319', title: 'Women and Lung Cancer Research and Prevention Act' },
    ];
    for (const m of MANUAL_BILLS) {
        const id = `${m.congress}-${m.type}-${m.number}`;
        if (!existing.has(id) && !seen.has(id)) {
            newBills.push({ congress: m.congress, type: m.type, billType: m.type, number: m.number, title: m.title });
            seen.add(id);
            console.log(`  + Queued manual bill: ${id}`);
        }
    }

    if (!newBills.length) {
        console.log('\nNo new bills to process. Exiting.');
        return;
    }

    console.log(`\nFetching data for ${newBills.length} bill(s)...`);
    const results = [];
    for (const b of newBills) {
        const congress = b.congress || CONGRESS_SESSION;
        const type     = (b.type || b.billType || '').toUpperCase();
        const result   = await processBillEntry(congress, type, b.number, b.title);
        if (result) results.push(result);
        await sleep(2000);
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
    console.log(`\nDone. Saved ${results.length} bills to ${OUTPUT_FILE}`);
    results.forEach(r => console.log(`  ${r.billId} — ${r.title} [${r.stageLabel}]`));
}

main().catch(console.error);
