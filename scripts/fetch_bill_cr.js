// scripts/fetch_bill_cr.js
// Retroactively fetches Congressional Record quotes for bills already in cache.json.
// Uses pattern-based speaker extraction — no LLM required.
//
// Usage:
//   node scripts/fetch_bill_cr.js --bill 119-HR-5587
//   node scripts/fetch_bill_cr.js --all
//
// --bill: re-runs even if the bill already has quotes (lets you refresh a specific bill)
// --all:  only fills bills with empty featured_quotes; skips demo/live bills

'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const {
    fetchBillActions,
    extractFloorDates,
    fetchCongressionalRecord,
} = require('./batch_processor');

const CACHE_FILE = path.join(__dirname, '../data/cache.json');
const sleep      = ms => new Promise(r => setTimeout(r, ms));

// --- Rep index lookup ---
const repsByLastName = {};
try {
    const repsIndex = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/reps-index.json'), 'utf8'));
    for (const stateReps of Object.values(repsIndex)) {
        for (const rep of stateReps) {
            // Strip name suffixes like "Jr.", "Sr.", "III" before extracting last name
            const clean = rep.name.replace(/,?\s+(jr\.?|sr\.?|ii+v?|iv|v)\s*$/i, '').trim();
            const ln    = clean.split(/\s+/).pop().toLowerCase();
            if (!repsByLastName[ln]) repsByLastName[ln] = [];
            repsByLastName[ln].push(rep);
        }
    }
} catch (e) { console.warn('Warning: could not load reps-index.json — party/state resolution disabled'); }

function resolveRepInfo(allCapsName) {
    // allCapsName: "WYDEN" or "VAN HOLLEN" (already stripped of "of State")
    const lastName = allCapsName.split(/\s+/).pop().toLowerCase();
    if (!lastName || lastName.length < 2) return {};
    const candidates = repsByLastName[lastName] || [];
    if (!candidates.length) return {};
    return { bioguideId: candidates[0].bioguideId, party: candidates[0].party, state: candidates[0].state };
}

// --- Pattern-based speaker extraction ---
// CR format: "Mr. LASTNAME." or "Mr. LASTNAME of State." (all-caps last name is distinctive)
const SPEAKER_RE = /\b(Mr\.|Ms\.|Mrs\.|Dr\.)\s+([A-Z]{2,}(?:\s+[A-Z]{2,})?(?:\s+of\s+[A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+)*)?)\./g;

// Titles that indicate a presiding officer, not a member giving a speech
const SKIP_NAME_WORDS = ['PRESIDING', 'PRESIDENT', 'CHAIR', 'ACTING', 'SPEAKER', 'CLERK', 'SECRETARY', 'TEMPORE'];

const PROCEDURAL_RE = /^(i yield|will the gentleman|unanimous consent|point of order|quorum call|i move to reconsider|i suggest the absence|i ask that)/i;

// Per-sentence filler patterns — matched against each sentence individually
const FILLER_SENTENCE_RE = [
    /^(?:Madam|Mr\.?)\s+(?:Speaker|President),?\s+I\s+yield\s+myself\s+such\s+time\s+as\s+I\s+may\s+consume/i,
    /^I\s+yield\s+myself\s+such\s+time\s+as\s+I\s+may\s+consume/i,
    /^(?:Madam|Mr\.?)\s+(?:Speaker|President),?\s+I\s+rise\s+(?:today\s+)?in\s+(?:strong\s+)?(?:support\s+of|opposition\s+to)/i,
    /^I\s+rise\s+(?:today\s+)?in\s+(?:strong\s+)?(?:support\s+of|opposition\s+to)/i,
    /^I\s+want\s+to\s+(?:begin\s+by\s+)?(?:commend|thank|congratulat|recogniz|acknowledg)/i,
    /^I\s+also\s+want\s+to\s+(?:commend|thank|congratulat|recogniz)/i,
    /^I\s+thank\s+(?:the\s+)?(?:gentle(?:man|woman)|my\s+colleague)/i,
    /^(?:Madam|Mr\.?)\s+(?:Speaker|President),?\s+I\s+ask\s+unanimous\s+consent/i,
];

function stripFillerOpeners(text) {
    // Split into sentences (same logic as bestExcerpt — won't break on "H.R." abbreviations)
    const sentences = text.split(/(?<=[a-z0-9][.!?])\s+(?=[A-Z])/);
    let firstSubstantive = -1;
    for (let i = 0; i < sentences.length; i++) {
        if (!FILLER_SENTENCE_RE.some(p => p.test(sentences[i].trim()))) {
            firstSubstantive = i;
            break;
        }
    }
    if (firstSubstantive <= 0) return firstSubstantive === 0 ? text : text; // nothing to strip or all filler
    const result = sentences.slice(firstSubstantive).join(' ').trim();
    return result.length > 30 ? result : text;
}

function detectStance(text) {
    const t = text.toLowerCase();
    if (/\b(oppose|against|vote no|reject|dangerous|harmful|cannot support|will not support|urge.*defeat|vote against)\b/.test(t)) return 'oppose';
    if (/\b(support|favor|proud|urge.*pass|commend|pleased|important step|must pass|vote yes|vote for)\b/.test(t)) return 'support';
    return 'neutral';
}

function bestExcerpt(text, maxLen = 550) {
    // Split on sentence boundaries — not on abbreviation periods like H.R., U.S., etc.
    const parts = text.split(/(?<=[a-z0-9][.!?])\s+(?=[A-Z])/);
    let result = '';
    for (const s of parts) {
        if (result && result.length + 1 + s.length > maxLen) break;
        result = result ? result + ' ' + s : s;
    }
    // Always include at least one sentence; trim cleanly if over limit
    if (!result) result = parts[0] || text;
    if (result.length > maxLen) result = result.slice(0, maxLen);
    // If result doesn't end on sentence-closing punctuation, back up to last sentence end
    if (!/[.!?]$/.test(result.trim())) {
        const lastEnd = result.search(/[.!?][^.!?]*$/);
        if (lastEnd > 30) result = result.slice(0, lastEnd + 1);
        else result = result.replace(/\s+\S*$/, ''); // fallback: trim last partial word
    }
    return result.trim();
}

function extractQuotesFromCR(crText) {
    const speakerMatches = [...crText.matchAll(SPEAKER_RE)];
    if (!speakerMatches.length) return [];

    const quotes     = [];
    const seenNames  = new Set();

    for (let i = 0; i < speakerMatches.length; i++) {
        const m         = speakerMatches[i];
        const prefix    = m[1];   // "Mr." / "Ms." etc.
        const rawName   = m[2];   // e.g. "WYDEN" or "VAN HOLLEN of Oregon"

        // Skip presiding officers
        if (SKIP_NAME_WORDS.some(w => rawName.includes(w))) continue;

        const textStart = m.index + m[0].length;
        const textEnd   = i + 1 < speakerMatches.length ? speakerMatches[i + 1].index : textStart + 1500;
        const body      = crText.slice(textStart, Math.min(textStart + 1500, textEnd))
                                .replace(/\s+/g, ' ')
                                .replace(/\s*(?:The Clerk (?:read|will designate) the (?:title|bill)|The text of the bill is as follows|Be it enacted by the Senate).*/i, '')
                                .trim();

        // Strip leading yield-of-time sentence before procedural check
        const stripped = body.replace(/^I yield[^.]+\.\s*/i, '').trim();
        if (PROCEDURAL_RE.test(stripped)) continue;
        if (stripped.split(/\s+/).length < 12) continue;

        // Parse name: strip "of State" for lookup, title-case for display
        const namePart    = rawName.replace(/\s+of\s+.+$/i, '').trim();
        const nameKey     = namePart.toLowerCase();
        if (seenNames.has(nameKey)) continue;
        seenNames.add(nameKey);

        const displayLast = namePart.split(/\s+/).map(w =>
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        ).join(' ');
        const displayName = `${prefix} ${displayLast}`;

        const repInfo    = resolveRepInfo(namePart);
        const substantive = stripFillerOpeners(stripped);
        const text        = bestExcerpt(substantive);
        if (text.length < 30) continue;

        quotes.push({
            name:       displayName,
            party:      repInfo.party      || null,
            state:      repInfo.state      || null,
            bioguideId: repInfo.bioguideId || null,
            text,
            stance:     detectStance(stripped),
        });

        if (quotes.length >= 6) break;
    }

    return quotes;
}

function selectQuotes(quotes) {
    // featured_quotes: up to 3, prefer oppose > support > neutral, dedupe by bioguideId/name
    const sorted = [...quotes].sort((a, b) => {
        const order = { oppose: 0, support: 1, neutral: 2 };
        return (order[a.stance] ?? 2) - (order[b.stance] ?? 2);
    });

    const seen     = new Set();
    const featured = [];
    for (const q of sorted) {
        const key = q.bioguideId || q.name;
        if (seen.has(key)) continue;
        seen.add(key);
        featured.push(q);
        if (featured.length >= 3) break;
    }

    const criticisms = quotes
        .filter(q => q.stance === 'oppose')
        .map(q => ({
            who: `${q.name}${q.state ? ` (${q.party || '?'}-${q.state})` : ''}`,
            why: q.text,
        }));

    return { featured, criticisms };
}

function parseBillId(id) {
    const parts = id.split('-');
    return { congress: parseInt(parts[0], 10), type: parts[1], number: parts[2] };
}

function reformatStageDate(displayDate) {
    // "Apr 13, 2026" → "2026-04-13"
    if (!displayDate) return '';
    try {
        const d = new Date(displayDate);
        return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    } catch (e) { return ''; }
}

function loadCache() {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
}

function saveCache(data) {
    data.generated = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

// --- Per-bill update ---
async function processBillEntry(bill) {
    const { congress, type, number } = parseBillId(bill.id);

    console.log(`\n[${bill.id}] ${bill.title}`);

    const actions    = await fetchBillActions(congress, type, number);
    const fallback   = reformatStageDate(bill.enactedDate || bill.stageDate || '');
    const floorDates = extractFloorDates(actions, fallback);

    if (!floorDates.length) {
        console.log('  No floor dates found — skipping.');
        return false;
    }

    // fetchCongressionalRecord tries page refs first (fast), then date scanning (thorough)
    const crText = await fetchCongressionalRecord(type, number, floorDates, actions);

    if (!crText) {
        console.log('  No CR text found.');
        return false;
    }

    const rawQuotes = extractQuotesFromCR(crText);
    console.log(`  Extracted ${rawQuotes.length} speaker quote(s).`);
    if (!rawQuotes.length) return false;

    const { featured, criticisms } = selectQuotes(rawQuotes);

    rawQuotes.forEach(q =>
        console.log(`  ${q.name} (${q.party || '?'}-${q.state || '?'}) [${q.stance}]`)
    );

    bill.featured_quotes = featured;
    if (criticisms.length) bill.criticisms = criticisms;

    console.log(`  → ${featured.length} featured quote(s), ${criticisms.length} criticism(s) saved.`);
    return true;
}

// --- Entry point ---
async function main() {
    const billFlagIdx = process.argv.indexOf('--bill');
    const billArg     = billFlagIdx !== -1 ? process.argv[billFlagIdx + 1] : null;
    const doAll       = process.argv.includes('--all');

    if (!billArg && !doAll) {
        console.log('Usage:');
        console.log('  node scripts/fetch_bill_cr.js --bill 119-HR-5587');
        console.log('  node scripts/fetch_bill_cr.js --all');
        process.exit(0);
    }

    const cacheData = loadCache();
    const bills     = Array.isArray(cacheData.bills) ? cacheData.bills : Object.values(cacheData.bills || {});

    let targets;
    if (billArg) {
        targets = bills.filter(b => b.id === billArg);
        if (!targets.length) {
            console.error(`Bill ${billArg} not found in cache.json.`);
            process.exit(1);
        }
    } else {
        // --all: only analyzed, non-demo, non-live bills with empty featured_quotes
        targets = bills.filter(b => b.analyzed && !b.demo && !b.live && !b.featured_quotes?.length);
    }

    console.log(`=== FETCH BILL CR — ${targets.length} bill(s) ===`);

    let updated = 0;
    for (const bill of targets) {
        const changed = await processBillEntry(bill);
        if (changed) {
            updated++;
            saveCache(cacheData);
        }
        await sleep(500);
    }

    console.log(`\nDone. ${updated}/${targets.length} bill(s) updated.`);
}

main().catch(console.error);
