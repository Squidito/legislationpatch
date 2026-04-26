require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { SYSTEM_PROMPT, CHUNK_MAP_PROMPT } = require('./prompts');

// --- CONFIGURATION ---
const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const CONGRESS_SESSION = parseInt(process.env.CONGRESS_SESSION || '119', 10);
const LM_STUDIO_URL    = 'http://localhost:1235/v1/chat/completions';
const MODEL_NAME       = 'local-model';
const CACHE_FILE       = path.join(__dirname, '../data/cache.json');

// Every verification failure is a hard failure — immediate rejection.
// There are no soft warnings or thresholds. One unverified claim = rejected.

// Named entities that appear in almost every piece of legislation —
// no need to verify these against the bill text.
const ALWAYS_VALID_ENTITIES = [
    'United States', 'Federal Reserve', 'Social Security', 'Internal Revenue',
    'Department of Defense', 'Department of the Treasury', 'Department of Justice',
    'Department of Labor', 'Department of Health', 'Department of Education',
    'House of Representatives', 'Supreme Court', 'District of Columbia',
    'Small Business Administration', 'Veterans Affairs',
];

// --- UTILITIES ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function cleanHTML(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function chunkText(text, chunkSize = 3000, overlap = 500) {
    const words = text.split(' ');
    const chunks = [];
    let i = 0;
    while (i < words.length) {
        chunks.push(words.slice(i, i + chunkSize).join(' '));
        i += (chunkSize - overlap);
    }
    return chunks;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    } catch (e) { return dateStr; }
}

function detectStage(latestActionText) {
    const t = (latestActionText || '').toLowerCase();
    if (t.includes('signed by president') || t.includes('became public law') || t.includes('enacted'))
        return { key: 'signed',      label: 'Signed into Law', step: 4 };
    if (t.includes('passed senate') || t.includes('senate agreed') || t.includes('received in the senate'))
        return { key: 'senate',      label: 'Passed Senate',   step: 3 };
    if (t.includes('passed house') || t.includes('passed the house') || t.includes('house agreed') || t.includes('on passage'))
        return { key: 'house',       label: 'Passed House',    step: 2 };
    if (t.includes('reported by') || t.includes('ordered to be reported') || t.includes('referred to'))
        return { key: 'committee',   label: 'In Committee',    step: 1 };
    return     { key: 'introduced', label: 'Introduced',      step: 0 };
}

function formatBillTypeForRecord(type) {
    const map = {
        'HR': 'H.R.', 'HRES': 'H. Res.', 'HJRES': 'H.J. Res.', 'HCONRES': 'H. Con. Res.',
        'S':  'S.',   'SRES': 'S. Res.', 'SJRES': 'S.J. Res.', 'SCONRES': 'S. Con. Res.',
    };
    return map[type.toUpperCase()] || type;
}

// ============================================================
//  VERIFICATION GATE
//  Runs after the model produces its JSON.
//  Returns { hardFailures: string[], softWarnings: string[] }
//
//  Hard failures → immediate rejection, no threshold.
//  Soft warnings → rejection if count >= SOFT_WARNING_THRESHOLD.
//
//  Zone 1 (factual fields): checked against bill text + CRS summary.
//  Zone 2 (quotes/criticisms): checked against Congressional Record.
// ============================================================

function verifyOutput(parsed, billText, crsText, recordText, hasRecord) {
    const sourceText = (billText + ' ' + crsText).toLowerCase();
    const failures   = []; // all failures are hard — one failure = rejected

    // ── ZONE 2: QUOTES, CRITICISMS, COMMENTS ──────────────────────────────
    // Source: Congressional Record only. Zero tolerance.

    const hasQuotes     = (parsed.featured_quotes || []).length > 0;
    const hasCriticisms = (parsed.criticisms || []).length > 0;
    const hasComments   = (parsed.sections || []).some(s =>
        (s.items || []).some(item => (item.comments || []).length > 0)
    );

    if (!hasRecord && (hasQuotes || hasCriticisms || hasComments)) {
        failures.push(
            'ZONE 2: quotes/criticisms/comments present but no Congressional Record ' +
            'was available — all attributed statements are fabricated'
        );
    }

    if (hasRecord) {
        const recordLower = recordText.toLowerCase();

        for (const quote of parsed.featured_quotes || []) {
            const lastName = (quote.name || '').split(' ').pop().toLowerCase();
            if (lastName.length > 2 && !recordLower.includes(lastName)) {
                failures.push(`ZONE 2: speaker "${quote.name}" not found in Congressional Record`);
            }
        }

        for (const criticism of parsed.criticisms || []) {
            const words = (criticism.who || '')
                .split(' ').filter(w => w.length > 4 && /^[A-Z]/.test(w));
            if (words.length > 0 && !words.some(w => recordLower.includes(w.toLowerCase()))) {
                failures.push(`ZONE 2: criticism source "${criticism.who}" not found in Congressional Record`);
            }
        }

        for (const section of parsed.sections || []) {
            for (const item of section.items || []) {
                for (const comment of item.comments || []) {
                    const nameMatch = (comment.text || '').match(/^([^:]+):/);
                    if (nameMatch) {
                        const lastName = nameMatch[1].split(' ').pop().toLowerCase();
                        if (lastName.length > 3 && !recordLower.includes(lastName)) {
                            failures.push(`ZONE 2: comment speaker "${nameMatch[1]}" not found in Congressional Record`);
                        }
                    }
                }
            }
        }
    }

    // ── ZONE 1: FACTUAL FIELDS ─────────────────────────────────────────────
    // Source: bill text + CRS summary. One unverified claim = rejected.

    const factualJson = JSON.stringify({
        summary:       parsed.summary,
        brief:         parsed.brief,
        top_lines:     parsed.top_lines,
        sections:      parsed.sections,
        underreported: parsed.underreported,
        gaps:          parsed.gaps,
        changes:       parsed.changes,
    });

    // 1. Dollar amounts
    const dollarMatches = [...new Set(
        factualJson.match(/\$[\d,.]+\s*(?:billion|million|trillion|[BMTKbmtk])\b|\$[\d,.]+/gi) || []
    )];
    for (const amt of dollarMatches) {
        const coreNum = amt.replace(/[$,\s]/g, '').match(/[\d.]+/)?.[0];
        if (coreNum && !sourceText.includes(coreNum)) {
            failures.push(`ZONE 1: dollar amount "${amt}" not in bill text or CRS summary`);
        }
    }

    // 2. Percentages
    for (const pct of [...new Set(factualJson.match(/\d+(?:\.\d+)?%/g) || [])]) {
        if (!sourceText.includes(pct.replace('%', ''))) {
            failures.push(`ZONE 1: percentage "${pct}" not in bill text or CRS summary`);
        }
    }

    // 3. Section number references
    for (const sec of [...new Set(factualJson.match(/(?:[Ss]ection|§)\s*\d+[A-Za-z]?/g) || [])]) {
        const num = sec.replace(/[Ss]ection\s*|§\s*/g, '');
        if (!sourceText.includes(num)) {
            failures.push(`ZONE 1: section reference "${sec}" not in bill text or CRS summary`);
        }
    }

    // 4. Named programs and agencies (2-5 capitalized words + institutional noun)
    const programPattern = /(?:[A-Z][a-z]+\s+){1,4}(?:Act|Fund|Program|Agency|Office|Bureau|Administration|Service|Authority|Board|Commission|Council|Center|Institute|Foundation|Corporation)\b/g;
    for (const prog of [...new Set(factualJson.match(programPattern) || [])]) {
        if (ALWAYS_VALID_ENTITIES.some(v => prog.includes(v))) continue;
        if (prog.split(' ').length < 2) continue;
        if (!sourceText.includes(prog.toLowerCase())) {
            failures.push(`ZONE 1: named program/agency "${prog}" not in bill text or CRS summary`);
        }
    }

    // 5. Underreported section names — key words must exist in bill text
    const SKIP_WORDS = new Set(['the','of','and','for','a','an','in','to','on','at','by','section','—','-']);
    for (const item of parsed.underreported || []) {
        const sectionName = (item.section || '').trim();
        if (!sectionName) continue;
        const keyWords    = sectionName.toLowerCase().split(/[\s—\-]+/)
            .filter(w => w.length > 3 && !SKIP_WORDS.has(w));
        const missing     = keyWords.filter(w => !sourceText.includes(w));
        if (missing.length > 0) {
            failures.push(
                `ZONE 1: underreported section "${sectionName}" — ` +
                `key words [${missing.join(', ')}] not in bill text`
            );
        }
    }

    return failures;
}

// --- CONGRESS API FETCHING ---

const DOA_ACTIONS = [
    'introduced in', 'read twice and referred', 'referred to the committee',
    'referred to committee', 'held at the desk', 'referred to the subcommittee'
];

async function fetchRecentBills(limit = 10) {
    console.log(`[1] Fetching ${limit} recent bills from Congress.gov (session ${CONGRESS_SESSION})...`);
    const url = `https://api.congress.gov/v3/bill/${CONGRESS_SESSION}?sort=updateDate+desc&limit=${limit}&format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(4000);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Congress API Error: ${res.status}`);
        const data = await res.json();
        const active = (data.bills || []).filter(b => {
            const action = (b.latestAction?.text || '').toLowerCase();
            return !DOA_ACTIONS.some(pattern => action.includes(pattern));
        });
        console.log(`   - ${data.bills?.length || 0} fetched, ${active.length} passed DOA filter.`);
        return active;
    } catch (e) {
        console.error('Failed to fetch bills:', e);
        return [];
    }
}

async function fetchBillText(bill) {
    const { congress, type, number } = bill;
    const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}/text?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(4000);
    try {
        const res  = await fetch(url);
        const data = await res.json();
        if (!data.textVersions?.length) return '';
        const version = data.textVersions[data.textVersions.length - 1];
        const format  = version.formats.find(f => f.type === 'Formatted Text' || f.type === 'Formatted XML');
        if (!format) return '';
        await sleep(1000);
        return await (await fetch(format.url)).text();
    } catch (e) {
        console.error('Failed to fetch bill text:', e);
        return '';
    }
}

async function fetchBillMetadata(bill) {
    const { congress, type, number } = bill;
    const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return (await res.json()).bill;
    } catch (e) {
        console.error('Failed to fetch bill metadata:', e);
        return null;
    }
}

async function fetchCRSSummary(bill) {
    const { congress, type, number } = bill;
    const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}/summaries?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res = await fetch(url);
        if (!res.ok) return '';
        const data = await res.json();
        const summaries = data.summaries || [];
        if (!summaries.length) return '';
        // Use the most recent summary
        const latest = summaries[summaries.length - 1];
        const text   = cleanHTML(latest.text || '');
        console.log(`   - CRS summary: ${text.length > 0 ? `${text.length} chars` : 'none available'}`);
        return text;
    } catch (e) {
        console.error('Failed to fetch CRS summary:', e);
        return '';
    }
}

async function fetchCongressionalRecord(actionDate, billType, billNumber) {
    if (!actionDate) return '';
    const d = new Date(actionDate);
    if (isNaN(d)) return '';

    const year  = d.getFullYear();
    const month = d.getMonth() + 1;
    const day   = d.getDate();

    console.log(`   - Fetching Congressional Record for ${year}-${month}-${day}...`);
    const url = `https://api.congress.gov/v3/congressional-record?y=${year}&m=${month}&d=${day}&format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);

    try {
        const res = await fetch(url);
        if (!res.ok) { console.log('   - No Congressional Record found for that date.'); return ''; }
        const data = await res.json();

        const issues = data.Results?.Issues || data.dailyCongressionalRecord || [];
        if (!issues.length) { console.log('   - Congressional Record: no issues returned.'); return ''; }

        const isHouseBill    = ['HR', 'HRES', 'HJRES', 'HCONRES'].includes(billType.toUpperCase());
        const chamberKeyword = isHouseBill ? 'House' : 'Senate';

        let sectionUrl = null;
        for (const issue of issues) {
            // Handle multiple possible response shapes from the API
            const items = issue.links?.items || issue.sections || [];
            for (const item of items) {
                if ((item.name || item.label || '').includes(chamberKeyword)) {
                    sectionUrl = item.url || item.htmlUrl;
                    break;
                }
            }
            if (!sectionUrl) {
                const links = issue.links || {};
                for (const key of Object.keys(links)) {
                    if (key.includes(chamberKeyword) && links[key]?.HTML) {
                        sectionUrl = links[key].HTML;
                        break;
                    }
                }
            }
            if (sectionUrl) break;
        }

        if (!sectionUrl) { console.log(`   - Could not find ${chamberKeyword} section in Record.`); return ''; }

        await sleep(1500);
        const textRes = await fetch(sectionUrl);
        if (!textRes.ok) return '';
        const fullText = cleanHTML(await textRes.text());
        return extractBillMentions(fullText, billType, billNumber);

    } catch (e) {
        console.error('   - Failed to fetch Congressional Record:', e.message);
        return '';
    }
}

function extractBillMentions(text, billType, billNumber) {
    const formattedType = formatBillTypeForRecord(billType);
    const searchPatterns = [
        `${formattedType} ${billNumber}`,
        `${formattedType}${billNumber}`,
        `${billType} ${billNumber}`,
        `${billType}.${billNumber}`,
    ];

    const CONTEXT_WINDOW = 2500;
    const MAX_MENTIONS   = 4;
    const found = [];

    for (const pattern of searchPatterns) {
        let idx = text.indexOf(pattern);
        while (idx !== -1 && found.length < MAX_MENTIONS) {
            found.push(text.slice(Math.max(0, idx - CONTEXT_WINDOW), Math.min(text.length, idx + CONTEXT_WINDOW)));
            idx = text.indexOf(pattern, idx + pattern.length);
        }
        if (found.length >= MAX_MENTIONS) break;
    }

    if (!found.length) { console.log('   - Bill not mentioned in Congressional Record for this date.'); return ''; }
    console.log(`   - Found ${found.length} mention(s) in Congressional Record.`);
    return found.join('\n\n---\n\n').slice(0, 10000);
}

// --- LOCAL LLM ---

function stripThinkingTags(text) {
    if (!text) return text;
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function callLocalLLM(systemPrompt, userMessage) {
    const payload = {
        model:       MODEL_NAME,
        messages:    [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: `/no_think\n\n${userMessage}` }
        ],
        temperature: 0.1,
        max_tokens:  4096,
        stream:      false
    };
    try {
        const res = await fetch(LM_STUDIO_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body:   JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`LM Studio Error: ${res.status}`);
        return stripThinkingTags((await res.json()).choices[0].message.content);
    } catch (e) {
        console.error('Failed to contact LM Studio on port 1235. Is it running?', e);
        return null;
    }
}

// --- MAIN BILL PROCESSOR ---

async function processBill(bill) {
    const { congress, type, number } = bill;
    const billId = `${congress}-${type}-${number}`;
    console.log(`\n[2] Processing: ${billId} — ${bill.title}`);

    // Step 1 — Fetch bill text (required; skip if unavailable)
    let rawText = await fetchBillText(bill);
    if (!rawText) { console.log('   - No bill text available. Skipping.'); return null; }

    // Step 2 — Fetch metadata, CRS summary, and Congressional Record in parallel
    const [meta, crsText] = await Promise.all([
        fetchBillMetadata(bill),
        fetchCRSSummary(bill),
    ]);

    const actionDate = meta?.latestAction?.actionDate || meta?.updateDate || '';
    const recordText = await fetchCongressionalRecord(actionDate, type, number);
    const hasRecord  = recordText.length > 0;

    console.log(`   - Congressional Record: ${hasRecord
        ? 'found — quotes/criticisms will be sourced from it'
        : 'not found — quotes/criticisms/comments will be empty'}`);

    // Step 3 — Clean and chunk bill text
    rawText = cleanHTML(rawText);
    const cleanedBillText = rawText;
    const estimatedPages  = Math.max(1, Math.round(rawText.length / 2500));
    console.log(`   - ${rawText.length} chars (~${estimatedPages} pages), ${chunkText(rawText).length} chunk(s).`);

    // Step 4 — Map phase: extract facts from each bill text chunk
    const chunks        = chunkText(rawText);
    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
        console.log(`   - Chunk ${i + 1}/${chunks.length}...`);
        const summary = await callLocalLLM(
            'You are a legal text extraction assistant. Extract only what is explicitly stated in the text. Do not add outside knowledge.',
            `${CHUNK_MAP_PROMPT}\n\nBILL TEXT CHUNK:\n${chunks[i]}`
        );
        if (summary) chunkSummaries.push(summary);
    }

    // Step 5 — Build reduce-phase context
    const combinedNotes  = chunkSummaries.join('\n---\n');
    const primarySponsor = meta?.sponsors?.[0];
    const sponsorLine    = primarySponsor
        ? `${primarySponsor.fullName || primarySponsor.name} (${primarySponsor.party}-${primarySponsor.state}), bioguideId: ${primarySponsor.bioguideId || ''}`
        : 'Unknown';

    const billContext = `BILL METADATA (for likelihood analysis only):
- Title: ${bill.title}
- Number: ${type} ${number}, Congress: ${congress}
- Primary sponsor: ${sponsorLine}
- Cosponsors: ${meta?.cosponsors?.count || 0}
- Latest action: ${meta?.latestAction?.text || 'Unknown'}
- Introduced: ${meta?.introducedDate || 'unknown'}`;

    const crsSection = crsText
        ? `CRS OFFICIAL SUMMARY (additional Zone 1 source — use alongside bill text notes):\n${crsText.slice(0, 3000)}`
        : 'CRS SUMMARY: Not available.';

    const recordSection = hasRecord
        ? `CONGRESSIONAL RECORD EXCERPTS (Zone 2 — the ONLY source for quotes, comments, and criticisms):\n${recordText}`
        : `CONGRESSIONAL RECORD: No floor debate found for this bill.\nIMPORTANT: Return [] for featured_quotes, [] for criticisms, and [] for every comments array.`;

    // Step 6 — Reduce phase: synthesize JSON
    console.log('   - Synthesizing final JSON...');
    const finalJSONString = await callLocalLLM(
        SYSTEM_PROMPT,
        `${billContext}\n\n${crsSection}\n\n${recordSection}\n\nBILL TEXT NOTES (Zone 1 primary source):\n${combinedNotes}

━━━ FINAL REMINDER BEFORE YOU OUTPUT ━━━
Every dollar amount, percentage, section number, and named program in your JSON must appear verbatim in the Bill Text Notes or CRS Summary above.
Every speaker name in quotes, criticisms, and comments must appear verbatim in the Congressional Record excerpts above.
If a fact is not in the source material provided: omit it. Do not estimate. Do not complete from memory.
An empty array [] is always correct. An invented fact is never acceptable.`
    );

    // Step 7 — Parse LLM output
    let parsed;
    try {
        console.log(`   - LLM snippet: ${finalJSONString ? finalJSONString.substring(0, 120) : 'NULL'}`);
        const jsonMatch = finalJSONString?.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found in LLM response.');
        parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error('   - Failed to parse LLM JSON:', e.message);
        console.error('   - Full response:\n', finalJSONString);
        return null;
    }

    // Step 8 — Normalize likelihood scale (0-1 → 0-100)
    if (typeof parsed.likelihood === 'number' && parsed.likelihood <= 1) {
        parsed.likelihood = Math.round(parsed.likelihood * 100);
    }
    parsed.likelihood = Math.min(100, Math.max(0, Math.round(parsed.likelihood || 0)));

    // Step 9 — Run full verification gate
    const failures = verifyOutput(parsed, cleanedBillText, crsText, recordText, hasRecord);

    if (failures.length > 0) {
        console.log(`   - REJECTED — ${failures.length} unverified claim(s):`);
        failures.forEach(f => console.log(`     ✕ ${f}`));
        return null;
    }

    console.log('   - Verification passed: all claims confirmed in source text.');

    // Step 10 — Stamp all required UI fields
    const stage = detectStage(meta?.latestAction?.text || '');

    parsed.id               = billId;
    parsed.title            = bill.title;
    parsed.official_title   = bill.title;
    parsed.code             = `${type}.${number}`;
    parsed.date             = formatDate(meta?.introducedDate || bill.updateDate);
    parsed.version          = 'v1.0';
    parsed.stage            = stage.key;
    parsed.stageLabel       = stage.label;
    parsed.currentStep      = stage.step;
    parsed.pipeline         = ['Introduced', 'Committee', 'Passed House', 'Passed Senate', 'Signed'];
    parsed.sponsor          = primarySponsor?.fullName || primarySponsor?.name || 'Unknown';
    parsed.sponsor_bioguide = primarySponsor?.bioguideId || '';
    parsed.sponsors         = meta?.sponsors || [];
    parsed.cosponsors       = meta?.cosponsors?.count || 0;
    parsed.pages            = estimatedPages;
    parsed.analyzed         = true;
    parsed.live             = false;
    parsed.demo             = false;

    // Step 11 — Ensure all array/object fields exist
    parsed.sections        = Array.isArray(parsed.sections)        ? parsed.sections        : [];
    parsed.underreported   = Array.isArray(parsed.underreported)   ? parsed.underreported   : [];
    parsed.criticisms      = Array.isArray(parsed.criticisms)      ? parsed.criticisms      : [];
    parsed.gaps            = Array.isArray(parsed.gaps)            ? parsed.gaps            : [];
    parsed.featured_quotes = Array.isArray(parsed.featured_quotes) ? parsed.featured_quotes : [];
    parsed.top_lines       = Array.isArray(parsed.top_lines)       ? parsed.top_lines       : [];
    parsed.changes         = parsed.changes || { added: [], modified: [], removed: [] };

    console.log(`   - Done: ${billId} | stage: ${stage.key} | likelihood: ${parsed.likelihood}%`);
    return parsed;
}

// --- MAIN ---

async function runBatch() {
    console.log('=== LEGISLATION PATCH BATCH PROCESSOR ===');

    if (!CONGRESS_API_KEY) { console.error('ERROR: Missing CONGRESS_API_KEY in .env'); return; }

    let cacheData = { generated: new Date().toISOString(), bills: [] };
    if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        if (raw.trim()) {
            cacheData = JSON.parse(raw);
            if (!cacheData.bills) cacheData.bills = [];
        }
    }

    const existingIds    = new Set(cacheData.bills.map(b => b.id));
    const billsToProcess = await fetchRecentBills(10);
    let processedCount   = 0;

    for (const bill of billsToProcess) {
        if (processedCount >= 2) break;

        const billId = `${bill.congress}-${bill.type}-${bill.number}`;
        if (existingIds.has(billId)) {
            console.log(`Skipping ${billId} — already in cache.`);
            continue;
        }

        const processedData = await processBill(bill);
        if (processedData) {
            cacheData.bills.unshift(processedData);
            cacheData.generated = new Date().toISOString();
            fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
            console.log(`   - Saved ${billId} to cache.json.`);
            processedCount++;
        }
    }

    console.log(`\n=== BATCH COMPLETE — ${processedCount} new bill(s) processed ===`);
}

runBatch();
