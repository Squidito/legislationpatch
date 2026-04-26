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

// Maps latestAction text to a stage key, label, and pipeline step index
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

// --- CONGRESS API FETCHING ---
async function fetchRecentBills(limit = 10) {
    console.log(`[1] Fetching ${limit} recent bills from Congress.gov (session ${CONGRESS_SESSION})...`);
    const url = `https://api.congress.gov/v3/bill/${CONGRESS_SESSION}?sort=updateDate+desc&limit=${limit}&format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(4000);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Congress API Error: ${res.status}`);
        const data = await res.json();
        return data.bills || [];
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

// --- LOCAL LLM PROCESSING (LM STUDIO) ---
async function callLocalLLM(systemPrompt, userMessage) {
    const payload = {
        model: MODEL_NAME,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userMessage  }
        ],
        temperature: 0.1,
        stream: false
    };
    try {
        const res = await fetch(LM_STUDIO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`LM Studio Error: ${res.status}`);
        const data = await res.json();
        return data.choices[0].message.content;
    } catch (e) {
        console.error('Failed to contact LM Studio on port 1235. Is it running?', e);
        return null;
    }
}

async function processBill(bill) {
    const { congress, type, number } = bill;
    const billId = `${congress}-${type}-${number}`;
    console.log(`\n[2] Processing: ${billId} — ${bill.title}`);

    // 1. Fetch full text
    let rawText = await fetchBillText(bill);
    if (!rawText) {
        console.log('   - Failed to fetch raw text. Skipping.');
        return null;
    }

    // 2. Fetch full metadata (sponsors, latestAction, cosponsors, dates)
    const meta = await fetchBillMetadata(bill);

    // 3. Clean, measure, and chunk
    rawText = cleanHTML(rawText);
    const estimatedPages = Math.max(1, Math.round(rawText.length / 2500));
    console.log(`   - ${rawText.length} chars (~${estimatedPages} pages), chunking...`);
    if (rawText.length < 50) {
        console.log('   - WARNING: Text is unusually short. Full text may not be available yet.');
    }
    const chunks = chunkText(rawText);
    console.log(`   - ${chunks.length} chunks.`);

    // 4. Map phase — extract key points from each chunk
    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
        console.log(`   - Analyzing chunk ${i + 1}/${chunks.length}...`);
        const summary = await callLocalLLM(
            'You are a helpful legal assistant.',
            `${CHUNK_MAP_PROMPT}\n\nTEXT:\n${chunks[i]}`
        );
        if (summary) chunkSummaries.push(summary);
    }

    // 5. Reduce phase — synthesize final JSON from chunk notes
    console.log('   - Synthesizing final JSON...');
    const combinedNotes  = chunkSummaries.join('\n---\n');
    const finalJSONString = await callLocalLLM(
        SYSTEM_PROMPT,
        `Synthesize these chunk notes into the strict JSON schema requested.\n\nNOTES:\n${combinedNotes}`
    );

    // 6. Parse and validate LLM output
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

    // 7. Derive stage from latestAction
    const stage = detectStage(meta?.latestAction?.text || '');

    // 8. Build the sponsor object
    const primarySponsor = meta?.sponsors?.[0];
    const sponsorName    = primarySponsor?.fullName || primarySponsor?.name || 'Unknown';
    const sponsorBio     = primarySponsor?.bioguideId || '';

    // 9. Stamp all required fields onto the parsed object
    parsed.id              = billId;                                             // "119-HR-6955"
    parsed.title           = bill.title;
    parsed.official_title  = bill.title;
    parsed.code            = `${type}.${number}`;                               // "HR.6955"
    parsed.date            = formatDate(meta?.introducedDate || bill.updateDate);
    parsed.version         = 'v1.0';
    parsed.stage           = stage.key;                                          // "committee" etc.
    parsed.stageLabel      = stage.label;                                        // "In Committee" etc.
    parsed.currentStep     = stage.step;                                         // 0-4
    parsed.pipeline        = ['Introduced', 'Committee', 'Passed House', 'Passed Senate', 'Signed'];
    parsed.sponsor         = sponsorName;
    parsed.sponsor_bioguide = sponsorBio;
    parsed.sponsors        = meta?.sponsors || [];
    parsed.cosponsors      = meta?.cosponsors?.count || 0;
    parsed.pages           = estimatedPages;
    parsed.analyzed        = true;
    parsed.live            = false;
    parsed.demo            = false;

    // 10. Ensure all array/object fields exist so the UI never crashes
    parsed.sections       = Array.isArray(parsed.sections)       ? parsed.sections       : [];
    parsed.underreported  = Array.isArray(parsed.underreported)  ? parsed.underreported  : [];
    parsed.criticisms     = Array.isArray(parsed.criticisms)     ? parsed.criticisms     : [];
    parsed.gaps           = Array.isArray(parsed.gaps)           ? parsed.gaps           : [];
    parsed.featured_quotes = Array.isArray(parsed.featured_quotes) ? parsed.featured_quotes : [];
    parsed.top_lines      = Array.isArray(parsed.top_lines)      ? parsed.top_lines      : [];
    parsed.changes        = parsed.changes || { added: [], modified: [], removed: [] };

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

    // Load existing cache
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
