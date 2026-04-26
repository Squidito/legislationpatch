require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { SYSTEM_PROMPT, CHUNK_MAP_PROMPT } = require('./prompts');

// --- CONFIGURATION ---
const CONGRESS_API_KEY   = process.env.CONGRESS_API_KEY;
const CONGRESS_SESSION   = parseInt(process.env.CONGRESS_SESSION || '119', 10);
const LM_STUDIO_URL      = 'http://localhost:1235/v1/chat/completions';
const MODEL_NAME         = 'local-model';
const CACHE_FILE         = path.join(__dirname, '../data/cache.json');

// Max unverified number claims before a bill is rejected as too hallucinated
const HALLUCINATION_THRESHOLD = 4;

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

// Format a bill type into the Congressional Record citation style
// e.g. HR → H.R., HCONRES → H. Con. Res., SRES → S. Res.
function formatBillTypeForRecord(type) {
    const map = {
        'HR':       'H.R.',
        'HRES':     'H. Res.',
        'HJRES':    'H.J. Res.',
        'HCONRES':  'H. Con. Res.',
        'S':        'S.',
        'SRES':     'S. Res.',
        'SJRES':    'S.J. Res.',
        'SCONRES':  'S. Con. Res.',
    };
    return map[type.toUpperCase()] || type;
}

// --- VERIFICATION GATE ---
// Checks that dollar amounts, percentages, and section numbers in the
// model's factual output actually appear in the source bill text.
// Only checks factual fields — not quotes, criticisms, or likelihood.
function verifyFactualClaims(parsed, billText) {
    const src = billText.toLowerCase();
    const issues = [];

    const factualOutput = JSON.stringify({
        summary:      parsed.summary,
        brief:        parsed.brief,
        top_lines:    parsed.top_lines,
        sections:     parsed.sections,
        underreported: parsed.underreported,
        gaps:         parsed.gaps,
        changes:      parsed.changes,
    });

    // Dollar amounts: $500M, $1.2B, $50 million, $1,200,000
    const dollarMatches = [...new Set(
        factualOutput.match(/\$[\d,.]+\s*(?:billion|million|trillion|[BMTKbmtk])\b|\$[\d,.]+/gi) || []
    )];
    for (const amt of dollarMatches) {
        const coreNum = amt.replace(/[$,\s]/g, '').match(/[\d.]+/)?.[0];
        if (coreNum && !src.includes(coreNum)) {
            issues.push(`Dollar amount "${amt}" not in bill text`);
        }
    }

    // Percentages: 3%, 26.5%
    const pctMatches = [...new Set(factualOutput.match(/\d+(?:\.\d+)?%/g) || [])];
    for (const pct of pctMatches) {
        const num = pct.replace('%', '');
        if (!src.includes(num)) {
            issues.push(`Percentage "${pct}" not in bill text`);
        }
    }

    return issues;
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
    const textMetaUrl = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}/text?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(4000);
    try {
        const res  = await fetch(textMetaUrl);
        const data = await res.json();
        if (!data.textVersions?.length) return '';
        const version = data.textVersions[data.textVersions.length - 1];
        const format  = version.formats.find(f => f.type === 'Formatted Text' || f.type === 'Formatted XML');
        if (!format) return '';
        await sleep(1000);
        const textRes = await fetch(format.url);
        return await textRes.text();
    } catch (e) {
        console.error('Failed to fetch bill text:', e);
        return '';
    }
}

async function fetchBillMetadata(bill) {
    const { congress, type, number } = bill;
    const metaUrl = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res = await fetch(metaUrl);
        if (!res.ok) return null;
        const data = await res.json();
        return data.bill;
    } catch (e) {
        console.error('Failed to fetch bill metadata:', e);
        return null;
    }
}

// Fetches Congressional Record for a given date and extracts passages
// that mention this specific bill. Returns clean plain text or ''.
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
        if (!res.ok) {
            console.log(`   - No Congressional Record found for that date.`);
            return '';
        }
        const data = await res.json();

        // Congress.gov returns either Results.Issues or dailyCongressionalRecord
        const issues = data.Results?.Issues || data.dailyCongressionalRecord || [];
        if (!issues.length) {
            console.log('   - Congressional Record returned no issues.');
            return '';
        }

        // Determine relevant chamber section
        const isHouseBill = ['HR', 'HRES', 'HJRES', 'HCONRES'].includes(billType.toUpperCase());
        const chamberKeyword = isHouseBill ? 'House' : 'Senate';

        // Find the section URL for the relevant chamber
        let sectionUrl = null;
        for (const issue of issues) {
            // Handle multiple possible response shapes
            const sections = issue.links?.items || issue.sections || [];
            for (const section of sections) {
                const name = section.name || section.label || '';
                if (name.includes(chamberKeyword)) {
                    sectionUrl = section.url || section.htmlUrl;
                    break;
                }
            }
            // Also try direct HTML links on the issue object
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

        if (!sectionUrl) {
            console.log(`   - Could not find ${chamberKeyword} section URL in Congressional Record.`);
            return '';
        }

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

// Searches the full Congressional Record text for mentions of this bill
// and returns surrounding context with speaker attribution preserved.
function extractBillMentions(text, billType, billNumber) {
    const formattedType = formatBillTypeForRecord(billType);

    // Try multiple citation formats the Record might use
    const searchPatterns = [
        `${formattedType} ${billNumber}`,
        `${formattedType}${billNumber}`,
        `${billType} ${billNumber}`,
        `${billType}.${billNumber}`,
    ];

    const CONTEXT_WINDOW = 2500; // chars of surrounding context per mention
    const MAX_MENTIONS   = 4;
    const found = [];

    for (const pattern of searchPatterns) {
        let idx = text.indexOf(pattern);
        while (idx !== -1 && found.length < MAX_MENTIONS) {
            const start = Math.max(0, idx - CONTEXT_WINDOW);
            const end   = Math.min(text.length, idx + CONTEXT_WINDOW);
            found.push(text.slice(start, end));
            idx = text.indexOf(pattern, idx + pattern.length);
        }
        if (found.length >= MAX_MENTIONS) break;
    }

    if (!found.length) {
        console.log(`   - Bill not mentioned in Congressional Record for this date.`);
        return '';
    }

    console.log(`   - Found ${found.length} mention(s) in Congressional Record.`);
    return found.join('\n\n---\n\n').slice(0, 10000);
}

// --- LOCAL LLM PROCESSING ---

function stripThinkingTags(text) {
    if (!text) return text;
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

async function callLocalLLM(systemPrompt, userMessage) {
    const payload = {
        model: MODEL_NAME,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: `/no_think\n\n${userMessage}` }
        ],
        temperature: 0.1,
        max_tokens:  4096,
        stream:      false
    };
    try {
        const res = await fetch(LM_STUDIO_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`LM Studio Error: ${res.status}`);
        const data = await res.json();
        return stripThinkingTags(data.choices[0].message.content);
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

    // 1. Fetch bill text
    let rawText = await fetchBillText(bill);
    if (!rawText) {
        console.log('   - Failed to fetch raw text. Skipping.');
        return null;
    }

    // 2. Fetch metadata (sponsors, latestAction, cosponsors, dates)
    const meta = await fetchBillMetadata(bill);

    // 3. Fetch Congressional Record for the bill's most recent action date
    const actionDate   = meta?.latestAction?.actionDate || meta?.updateDate || '';
    const recordText   = await fetchCongressionalRecord(actionDate, type, number);
    const hasRecord    = recordText.length > 0;
    console.log(`   - Congressional Record: ${hasRecord ? 'found, will source quotes/criticisms from it' : 'not found, quotes/criticisms will be empty'}`);

    // 4. Clean, measure, and chunk bill text
    rawText = cleanHTML(rawText);
    const cleanedBillText  = rawText; // preserve for verification
    const estimatedPages   = Math.max(1, Math.round(rawText.length / 2500));
    console.log(`   - ${rawText.length} chars (~${estimatedPages} pages), chunking...`);
    const chunks = chunkText(rawText);
    console.log(`   - ${chunks.length} chunk(s).`);

    // 5. Map phase — extract key facts from each bill text chunk (text only)
    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
        console.log(`   - Analyzing chunk ${i + 1}/${chunks.length}...`);
        const summary = await callLocalLLM(
            'You are a legal text extraction assistant. Extract only what is explicitly stated in the text. Do not add outside knowledge.',
            `${CHUNK_MAP_PROMPT}\n\nBILL TEXT CHUNK:\n${chunks[i]}`
        );
        if (summary) chunkSummaries.push(summary);
    }

    // 6. Build reduce-phase context
    const combinedNotes  = chunkSummaries.join('\n---\n');
    const primarySponsor = meta?.sponsors?.[0];
    const sponsorLine    = primarySponsor
        ? `${primarySponsor.fullName || primarySponsor.name} (${primarySponsor.party}-${primarySponsor.state}), bioguideId: ${primarySponsor.bioguideId || ''}`
        : 'Unknown';

    const billContext = `BILL METADATA (for likelihood analysis only — do not use for factual claims):
- Title: ${bill.title}
- Number: ${type} ${number}, Congress: ${congress}
- Primary sponsor: ${sponsorLine}
- Cosponsors: ${meta?.cosponsors?.count || 0}
- Latest action: ${meta?.latestAction?.text || 'Unknown'}
- Introduced: ${meta?.introducedDate || 'unknown'}`;

    const recordSection = hasRecord
        ? `CONGRESSIONAL RECORD EXCERPTS (the ONLY source for quotes, comments, and criticisms):
${recordText}`
        : `CONGRESSIONAL RECORD: No floor debate found for this bill on its action date.
IMPORTANT: Because no Congressional Record is available, you MUST return empty arrays [] for featured_quotes, criticisms, and all comments arrays inside sections.`;

    // 7. Reduce phase — synthesize JSON
    console.log('   - Synthesizing final JSON...');
    const finalJSONString = await callLocalLLM(
        SYSTEM_PROMPT,
        `${billContext}\n\n${recordSection}\n\nBILL TEXT NOTES (for all factual fields):\n${combinedNotes}`
    );

    // 8. Parse LLM output
    let parsed;
    try {
        console.log(`   - LLM output snippet: ${finalJSONString ? finalJSONString.substring(0, 120) : 'NULL'}`);
        const jsonMatch = finalJSONString?.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON object found in LLM response.');
        parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error('   - Failed to parse LLM JSON:', e.message);
        console.error('   - Full LLM response:\n', finalJSONString);
        return null;
    }

    // 9. Normalize likelihood scale (model sometimes returns 0-1 instead of 0-100)
    if (typeof parsed.likelihood === 'number' && parsed.likelihood <= 1) {
        parsed.likelihood = Math.round(parsed.likelihood * 100);
    }
    parsed.likelihood = Math.min(100, Math.max(0, Math.round(parsed.likelihood || 0)));

    // 10. Verification gate — check factual claims against bill text
    const hallucinations = verifyFactualClaims(parsed, cleanedBillText);
    if (hallucinations.length > 0) {
        console.log(`   - Verification: ${hallucinations.length} unverified claim(s):`);
        hallucinations.forEach(issue => console.log(`     ⚠ ${issue}`));
        if (hallucinations.length >= HALLUCINATION_THRESHOLD) {
            console.log(`   - Rejected: too many unverified claims (${hallucinations.length} >= threshold of ${HALLUCINATION_THRESHOLD}).`);
            return null;
        }
        console.log(`   - Proceeding (below rejection threshold).`);
    } else {
        console.log('   - Verification: all factual claims confirmed in source text.');
    }

    // 11. Stamp all required UI fields
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

    // 12. Ensure all array/object fields exist so the UI never crashes
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

// --- MAIN EXECUTION ---
async function runBatch() {
    console.log('=== LEGISLATION PATCH BATCH PROCESSOR ===');

    if (!CONGRESS_API_KEY) {
        console.error('ERROR: Missing CONGRESS_API_KEY in .env file.');
        return;
    }

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
