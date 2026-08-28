// fetch_bills_data.js
// Discovers new bills and fetches their raw text + metadata.
// Does NOT call any LLM — outputs data/bills_raw.json for in-conversation Claude processing.
//
// Usage: node scripts/fetch_bills_data.js

require('dotenv').config();
const { sleep: libSleep, fetchWithRetry, cleanHTML, cleanBillHTML } = require('./lib/fetch-helpers.js');
const { fetchBillActions } = require('./lib/congress-api.js');
const fs   = require('fs');
const path = require('path');

const CONGRESS_API_KEY    = process.env.CONGRESS_API_KEY;
const CONGRESS_SESSION    = parseInt(process.env.CONGRESS_SESSION || '119', 10);
const CACHE_FILE          = path.join(__dirname, '../data/cache.json');
const OUTPUT_FILE         = path.join(__dirname, '../data/bills_raw.json');
const LAST_FETCH_FILE     = path.join(__dirname, '../data/last-fetch.json');

function loadFetchCutoff() {
    try {
        const { lastRun } = JSON.parse(fs.readFileSync(LAST_FETCH_FILE, 'utf8'));
        return new Date(new Date(lastRun).getTime() - 3 * 24 * 60 * 60 * 1000);
    } catch {
        return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
}
const PRIOR_YEAR_MAP_FILE = path.join(__dirname, 'prior-year-map.json');
const BILL_TEXT_DIR       = path.join(__dirname, '../data/bill-text');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// (moved to scripts/lib/fetch-helpers.js) fetchWithRetry

// (moved to scripts/lib/fetch-helpers.js) cleanHTML — note: the shared version
// also decodes numeric entities (&#8212; → —), which this file's old flat copy
// did not. Deliberate drift fix.

// (moved to scripts/lib/fetch-helpers.js) cleanBillHTML

// Stage derivation lives in lib/stage.js -- shared with refresh_stages.js, which
// carried the CORRECT version (passage markers over the full action history) while
// this file guessed from the latest-action STRING alone. That guess read S. 2296 as
// "Introduced" because its latest action is the bare housekeeping line "Held at the
// desk", months after it passed the Senate 77-20. Read that file's header before
// touching any of it.
const { detectStage } = require('./lib/stage.js');

// ─── BILL INCLUSION CRITERIA ─────────────────────────────────────────────────
//
// INCLUDE (anything with floor time that doesn't match a skip rule below):
//   - Named legislation (HR, S, HJRES, SJRES) — core content
//   - War powers resolutions (HCONRES/SCONRES directing troop removal)
//   - CRA disapproval resolutions — substantive regulation reversals
//   - Censure resolutions — rare, historically significant formal rebukes
//   - Impeachment articles — only when they reach a floor vote (stage >= 2)
//   - Commemorative medals / coins — small, infrequent, worth a note
//
// SKIP (DOA_ACTIONS): bills stuck at introduction / referral with no floor time.
//
// SKIP (SKIP_TITLE_PATTERNS): procedural floor rules, administrative
//   housekeeping, non-binding sense resolutions, facility naming, memorials.
//
// DEFERRED — tribal / land transfer bills: strategy (bundle or skip) TBD.
//
// ─────────────────────────────────────────────────────────────────────────────

// NOTE — 'held at the desk' was REMOVED from this list on 2026-08-27. It is the
// opposite of dead-on-arrival: nothing reaches the other chamber's desk without
// having passed its own. Because this screen runs BEFORE detectStage, a bill in
// that state was dropped from the corpus entirely — S. 2296 passed the Senate
// 77-20 and had to be added by hand. The `step < 2` check below is what actually
// filters out no-floor-time bills, so removing it here lets in exactly the
// already-transmitted measures this list is not meant to skip.
const DOA_ACTIONS = [
    'introduced in', 'read twice and referred', 'referred to the committee',
    'referred to committee', 'referred to the subcommittee'
];

const SKIP_TITLE_PATTERNS = [
    // Procedural floor resolutions — set debate rules for another bill, no own content
    'providing for consideration of',
    'providing for the hour of meeting',
    'fixing the daily hour of meeting',
    'providing that section',           // in-session rules adjustments
    // Administrative housekeeping
    'to inform the senate that',
    'directing the clerk of the house',
    'requesting return of official papers',
    'adopting the rules of the house',
    // Technical / editorial — no policy content
    'technical correction',
    'clerical amendment',
    // Facility / infrastructure naming
    'to designate the facility',
    'to name the ',
    // Non-binding sense resolutions
    'expressing the sense of congress',
    'expressing the sense of the',
    // Commemorative recognitions (medals handled separately under includes)
    'recognizing the',
    'honoring the',
    'commending the',
    // Committee assignment procedurals
    'electing members to',
    'electing a member to',
    // Memorial resolutions
    'expressing the profound sorrow',
    'on the death of',
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
        const res  = await fetchWithRetry(url);
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

async function fetchRecentBills(cutoff = loadFetchCutoff()) {
    console.log('[1b] Fetching recently updated bills...');
    const PAGE    = 250; // API max per request
    const results = [];
    let   offset  = 0;
    let   done    = false;

    while (!done) {
        const url = `https://api.congress.gov/v3/bill/${CONGRESS_SESSION}?sort=updateDate+desc&limit=${PAGE}&offset=${offset}&format=json&api_key=${CONGRESS_API_KEY}`;
        await sleep(offset === 0 ? 4000 : 2000);
        try {
            const res  = await fetchWithRetry(url);
            if (!res.ok) throw new Error(`Congress API Error: ${res.status}`);
            const data = await res.json();
            const page = data.bills || [];
            if (!page.length) break;

            for (const b of page) {
                if (new Date(b.updateDate) < cutoff) { done = true; break; }
                const action = (b.latestAction?.text || '').toLowerCase();
                const title  = (b.title || '').toLowerCase();
                if (DOA_ACTIONS.some(p => action.includes(p))) continue;
                if (SKIP_TITLE_PATTERNS.some(p => title.includes(p))) continue;
                if (detectStage(b.latestAction?.text || '', b.type).step < 2) continue;
                results.push(b);
            }

            if (!data.pagination?.next) break;
            offset += PAGE;
        } catch (e) { console.error('Failed to fetch bills:', e.message); break; }
    }

    console.log(`   Found ${results.length} qualifying bill(s) with floor time in 6-month window.`);
    return results;
}

async function fetchSpecificBill(type, number) {
    console.log(`   Fetching specific bill: ${type} ${number}...`);
    const url = `https://api.congress.gov/v3/bill/${CONGRESS_SESSION}/${type.toLowerCase()}/${number}?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res  = await fetchWithRetry(url);
        if (!res.ok) return null;
        return (await res.json()).bill;
    } catch (e) { console.error('Error:', e.message); return null; }
}

// Split a cleaned bill display text into per-division chunks.
// Returns [{ label, divisionKey, text, charCount }] or null if not a multi-division bill.
// Distinguishes TOC entries (first occurrence per letter) from body starts (second occurrence).
function splitIntoDivisions(displayText) {
    const lines = displayText.split('\n');
    // Handles plain "DIVISION A--TITLE", "DIVISION A --", and GPO-annotated
    // "DIVISION A <<NOTE: Title.>> --" forms found in different bill versions.
    const DIVISION_RE = /^DIVISION\s+([A-Z])(?:\s*<<[^>]*>>)?\s*--(.*)$/i;

    // Collect all occurrences: { lineIdx, letter, subtitle, rawLine }
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].trim().match(DIVISION_RE);
        if (m) matches.push({ lineIdx: i, letter: m[1].toUpperCase(), subtitle: m[2].trim() });
    }
    if (matches.length < 2) return null;

    // First occurrence per letter = TOC (build label from it).
    // Second occurrence = body start. Letters with only one occurrence past line 400 = body.
    const tocLabels = {};
    const letterOccs = {};
    for (const m of matches) {
        if (!letterOccs[m.letter]) letterOccs[m.letter] = [];
        letterOccs[m.letter].push(m);
    }

    const bodyStarts = [];
    for (const [letter, occs] of Object.entries(letterOccs)) {
        // Build TOC label from first occurrence
        const subtitle = occs[0].subtitle.replace(/\s+/g, ' ').trim();
        tocLabels[letter] = subtitle
            ? `Division ${letter} — ${subtitle}`
            : `Division ${letter}`;

        if (occs.length >= 2) {
            bodyStarts.push(occs[1]); // second occurrence = body start
        } else if (occs[0].lineIdx >= 400) {
            // Single occurrence past preamble — treat as body
            bodyStarts.push(occs[0]);
        }
        // else: single occurrence in preamble (TOC-only entry, no body) — skip
    }

    if (bodyStarts.length < 2) return null;

    // Sort by line index; deduplicate same-letter entries within 100 lines
    bodyStarts.sort((a, b) => a.lineIdx - b.lineIdx);
    const seenLetterLine = {};
    const deduped = [];
    for (const bs of bodyStarts) {
        const prev = seenLetterLine[bs.letter];
        if (prev !== undefined && bs.lineIdx - prev < 100) continue;
        seenLetterLine[bs.letter] = bs.lineIdx;
        deduped.push(bs);
    }

    if (deduped.length < 2) return null;

    // Split text at body division positions
    const divisions = [];
    for (let i = 0; i < deduped.length; i++) {
        const startLine = deduped[i].lineIdx;
        const endLine   = i < deduped.length - 1 ? deduped[i + 1].lineIdx : lines.length;
        const displayChunk  = lines.slice(startLine, endLine).join('\n').trim();
        const analysisChunk = displayChunk.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        divisions.push({
            label:       tocLabels[deduped[i].letter] || `Division ${deduped[i].letter}`,
            divisionKey: deduped[i].letter,
            text:        analysisChunk,
            charCount:   analysisChunk.length,
        });
    }

    const totalChars = divisions.reduce((s, d) => s + d.charCount, 0);
    if (totalChars < displayText.length * 0.3) {
        console.log(`  [omnibus] Division text (${totalChars} chars) is only ${Math.round(totalChars / displayText.length * 100)}% of bill — may be a detection issue`);
    }

    return divisions.length >= 2 ? divisions : null;
}

// Returns { display, analysis } — display has line structure for bill-text/*.txt,
// analysis is flat for bills_raw.json. Both are uncapped; callers decide limits.
// Congress.gov returns textVersions NEWEST-FIRST and interleaves procedural
// reprints (Referred in Senate / Placed on Calendar) that carry the SAME text as
// the engrossed version. The old code took textVersions[length-1] — the OLDEST =
// Introduced — so any bill past Introduced was analyzed against stale text.
// Select by version-type priority per CLAUDE.md HARD RULE
// (Enrolled > Engrossed Amendment > Engrossed > Reported > Introduced), tie-broken
// by newest date, so we always fetch the newest APPLICABLE text.
function textVersionPriority(vtype) {
    const t = (vtype || '').toLowerCase();
    if (t.includes('enrolled'))            return 100;
    if (t.includes('public law'))          return 95;  // identical text to enrolled
    if (t.includes('engrossed amendment')) return 90;
    if (t.includes('engrossed'))           return 80;
    if (t.includes('reported'))            return 60;
    if (t.includes('placed on calendar'))  return 55;  // reprint of engrossed
    if (t.includes('referred'))            return 50;  // reprint of engrossed
    if (t.includes('received'))            return 45;
    if (t.includes('introduced'))          return 20;
    return 10;
}
function selectLatestTextVersion(textVersions) {
    return [...textVersions].sort((a, b) => {
        const pa = textVersionPriority(a.type), pb = textVersionPriority(b.type);
        if (pb !== pa) return pb - pa;
        return new Date(b.date || 0) - new Date(a.date || 0);
    })[0];
}

async function fetchBillText(congress, type, number) {
    const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}/text?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(4000);
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res  = await fetchWithRetry(url);
            const data = await res.json();
            if (!data.textVersions?.length) {
                console.log(`  [text] No text versions listed on Congress.gov for ${congress}-${type}-${number}`);
                return { display: '', analysis: '' };
            }
            const version    = selectLatestTextVersion(data.textVersions);
            const textFormat = version.formats.find(f => f.type === 'Formatted Text') || version.formats[0];
            if (!textFormat) {
                console.log(`  [text] No usable format for ${congress}-${type}-${number} (version: ${version.type})`);
                return { display: '', analysis: '' };
            }
            await sleep(1000);
            const rawRes = await fetchWithRetry(textFormat.url);
            if (!rawRes.ok) throw new Error(`Text URL returned HTTP ${rawRes.status}`);
            const raw = await rawRes.text();
            if (!raw?.trim()) throw new Error('Text URL returned empty body');
            console.log(`  [text] Fetched ${Math.round(raw.length/1000)}K chars (${version.type}) on attempt ${attempt}`);
            return {
                display:  cleanBillHTML(raw),
                analysis: cleanHTML(raw),
            };
        } catch (e) {
            console.error(`  [text] Attempt ${attempt}/3 failed for ${congress}-${type}-${number}: ${e.message}`);
            if (attempt < 3) await sleep(5000 * attempt);
        }
    }
    console.error(`  [text] All 3 attempts failed — bill will be skipped (no text available).`);
    return { display: '', analysis: '' };
}

async function fetchBillMetadata(congress, type, number) {
    const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res = await fetchWithRetry(url);
        if (!res.ok) return null;
        return (await res.json()).bill;
    } catch (e) { console.error('Metadata error:', e.message); return null; }
}

async function fetchCRSSummary(congress, type, number) {
    const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}/summaries?format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res  = await fetchWithRetry(url);
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
        const res  = await fetchWithRetry(url);
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
        const textRes = await fetchWithRetry(sectionUrl);
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

// ---- Prior-year appropriations matching ----

function loadPriorYearMap() {
    try { return JSON.parse(fs.readFileSync(PRIOR_YEAR_MAP_FILE, 'utf8')); }
    catch (e) { return {}; }
}

// Order matters — check longer/more-specific phrases first.
const APPROP_AGENCY_KEYWORDS = [
    'Homeland Security', 'Department of Defense', 'Defense',
    'Agriculture', 'Commerce, Justice, Science', 'Energy and Water',
    'Financial Services', 'Interior, Environment', 'Labor, Health',
    'Military Construction', 'State, Foreign Operations',
    'Transportation, Housing', 'Veterans Affairs', 'Legislative Branch',
];

function classifyAppropriation(title) {
    const t = title.toLowerCase();
    if (!t.includes('appropriations')) return { appType: null, agency: null };
    if (t.includes('consolidated') || t.includes('omnibus'))
        return { appType: 'omnibus', agency: null };
    for (const kw of APPROP_AGENCY_KEYWORDS) {
        if (t.includes(kw.toLowerCase()))
            return { appType: 'single-agency', agency: kw };
    }
    if (t.includes('continuing appropriations'))
        return { appType: 'cr-only', agency: null };
    return { appType: null, agency: null };
}

// REMINDER, not a downloader. Flags a thin amend/extend bill whose substance
// likely lives in a referenced bill/statute, and surfaces the most prominent
// referenced sources so the analyst can fetch them with scripts/fetch-reference.js.
// Best-effort pattern matching — expect occasional misses and extra hits; it is a
// nudge for the analyst to decide, never authoritative. (See CLAUDE.md cross-ref practice.)
function detectReferenceHints(text, title) {
    const t       = text || '';
    const titleL  = (title || '').toLowerCase();
    const head     = (titleL + ' ' + t.slice(0, 4000));
    const amendatory = /\b(to amend|is amended|amends|reauthoriz|extend(s|ed|ing)?|repeal date|sunset)\b/.test(head);
    const shortBill  = t.length > 0 && t.length < 18000; // ~8 pages or less
    const likelyReferenceDependent = amendatory && shortBill;
    if (!likelyReferenceDependent) return null;

    // Collect candidate referenced sources, deduped and ranked by how often cited.
    const counts = new Map();
    const add = (key, kind, citation, suggestedFetch) => {
        if (!counts.has(key)) counts.set(key, { kind, citation, suggestedFetch, n: 0 });
        counts.get(key).n++;
    };
    for (const m of t.matchAll(/\b(\d{1,2})\s+U\.?\s?S\.?\s?C\.?\s+(\d+[A-Za-z]?)/g))
        add(`usc-${m[1]}-${m[2].toLowerCase()}`, 'statute', `${m[1]} U.S.C. ${m[2]}`, `node scripts/fetch-reference.js --usc "${m[1]}:${m[2]}"`);
    for (const m of t.matchAll(/\bP(?:ublic|ub)\.?\s*L(?:aw)?\.?\s*(\d{2,3})-(\d{1,4})\b/gi))
        add(`pl-${m[1]}-${m[2]}`, 'law', `Public Law ${m[1]}-${m[2]}`, null);
    for (const m of (title || '').matchAll(/\b([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){1,6}\s+Act(?:\s+of\s+\d{4})?)/g)) {
        const name = m[1].replace(/^(?:To\s+amend\s+the\s+|To\s+amend\s+|the\s+)/i, '').trim();
        if (/^(?:[IVXLC]+|title)\b/i.test(name)) continue; // skip "VII of the ... Act" fragments
        add(`act-${name.toLowerCase()}`, 'act', name, null);
    }

    const sources = [...counts.values()]
        .sort((a, b) => b.n - a.n)
        .slice(0, 6)
        .map(({ kind, citation, suggestedFetch }) => ({ kind, citation, suggestedFetch }));

    return { likelyReferenceDependent: true, sources };
}

async function searchPriorCongressLaws(priorCongress, agencyKeyword, isOmnibus) {
    const url = `https://api.congress.gov/v3/law/${priorCongress}?limit=100&format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res = await fetchWithRetry(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.bills || []).filter(b => {
            const t = (b.title || '').toLowerCase();
            if (!t.includes('appropriations act')) return false;
            if (isOmnibus) return t.includes('consolidated') || t.includes('omnibus');
            return agencyKeyword && t.includes(agencyKeyword.toLowerCase());
        });
    } catch (e) { console.error('  [prior-year] Search error:', e.message); return []; }
}

async function findPriorYearBill(billId, title, currentCongress) {
    const map = loadPriorYearMap();

    // Layer 1: manual override
    if (billId in map) {
        if (map[billId] === null) {
            console.log('  [prior-year] Skipped (manual map).');
            return { status: 'skipped', billRef: null };
        }
        const parts = map[billId].split('-');
        const ref = { congress: parseInt(parts[0]), type: parts[1], number: parts.slice(2).join('-'), title: null };
        console.log(`  [prior-year] Manual override: ${map[billId]}`);
        return { status: 'manual', billRef: ref };
    }

    // Layer 2: classify bill type
    const { appType, agency } = classifyAppropriation(title);
    if (!appType || appType === 'cr-only') {
        console.log(`  [prior-year] Skipped (${appType || 'not an appropriations bill'}).`);
        return { status: 'skipped', billRef: null };
    }

    // Layer 3: auto-search prior Congress enacted laws
    const priorCongress = currentCongress - 1;
    const label = appType === 'omnibus' ? 'omnibus' : `"${agency}"`;
    console.log(`  [prior-year] Searching ${priorCongress}th Congress for ${label} appropriations...`);
    const matches = await searchPriorCongressLaws(priorCongress, agency, appType === 'omnibus');

    if (!matches.length) {
        console.log(`  [prior-year] No match found in ${priorCongress}th Congress.`);
        return { status: 'not-found', billRef: null };
    }

    const confidence = matches.length === 1 ? 'auto-high' : 'auto-low';
    const m = matches[0];
    const billRef = {
        congress: m.congress,
        type: (m.type || m.billType || '').toUpperCase(),
        number: m.number,
        title: m.title,
    };
    console.log(`  [prior-year] ${confidence}: ${billRef.congress}-${billRef.type}-${billRef.number} — ${billRef.title}`);
    return { status: confidence, billRef };
}

// ---- End prior-year matching ----

async function processBillEntry(congress, type, number, title) {
    const billId = `${congress}-${type}-${number}`;
    console.log(`\nProcessing ${billId}: ${title}`);
    const [billTextResult, meta, crs] = await Promise.all([
        fetchBillText(congress, type, number),
        fetchBillMetadata(congress, type, number),
        fetchCRSSummary(congress, type, number),
    ]);
    if (!billTextResult.analysis) { console.log('  No text available — skipping.'); return null; }
    const actionDate = meta?.latestAction?.actionDate || '';
    const cr = await fetchCongressionalRecord(actionDate, type, number);
    // The full action history, so the stage comes from passage markers rather than
    // from whichever line Congress.gov happens to report as `latestAction`. That
    // line is often housekeeping ("Held at the desk.") and reading it alone is what
    // filed a Senate-passed NDAA vehicle as "Introduced". One extra paced call per
    // bill; on failure detectStage falls back to the latest-action string.
    const actions = await fetchBillActions(congress, type, number, { pace: 1500 });
    const stage = detectStage(meta?.latestAction?.text || '', type, actions);
    if (actions && actions.length) console.log(`  Actions: ${actions.length} — stage derived from passage markers`);
    console.log(`  Text: ${billTextResult.analysis.length} chars | CRS: ${crs.length} chars | CR: ${cr.length > 0 ? cr.length + ' chars' : 'none'} | Stage: ${stage.label}`);

    // Prior-year appropriations comparison
    const billTitle = meta?.title || title;
    const priorYear = await findPriorYearBill(billId, billTitle, congress);
    let priorYearBillText = null;
    if (priorYear.billRef) {
        console.log('  Fetching prior-year bill text...');
        const pyResult = await fetchBillText(
            priorYear.billRef.congress,
            priorYear.billRef.type,
            priorYear.billRef.number
        );
        priorYearBillText = pyResult.analysis || null;
        const pyChars = priorYearBillText ? priorYearBillText.length : 0;
        console.log(`  Prior-year text: ${pyChars > 0 ? pyChars + ' chars' : 'none'}`);
    }

    // Detect omnibus and split into divisions if applicable
    const { appType } = classifyAppropriation(billTitle);
    const isOmnibus = appType === 'omnibus';
    let divisions = null;
    if (isOmnibus && billTextResult.display) {
        divisions = splitIntoDivisions(billTextResult.display);
        if (divisions) {
            console.log(`  Omnibus: ${divisions.length} divisions detected — ${divisions.map(d => `${d.divisionKey}(${Math.round(d.charCount / 1000)}K)`).join(', ')}`);
        } else {
            console.log('  Omnibus detected but division split failed — storing as flat text.');
        }
    }

    // Save structured bill text to data/bill-text/ for the full bill page
    if (!fs.existsSync(BILL_TEXT_DIR)) fs.mkdirSync(BILL_TEXT_DIR, { recursive: true });
    fs.writeFileSync(path.join(BILL_TEXT_DIR, `${billId}.txt`), billTextResult.display);
    console.log(`  Saved bill text → data/bill-text/${billId}.txt`);

    // Reference-dependency reminder — advisory; the analyst decides whether to fetch.
    const referenceHints = detectReferenceHints(billTextResult.display, billTitle);
    if (referenceHints) {
        console.log('  ℹ Looks reference-dependent (thin amend/extend bill). If the substance lives in a referenced source, fetch it before analyzing:');
        referenceHints.sources.forEach(s => console.log(`     - ${s.citation}${s.suggestedFetch ? '   ->  ' + s.suggestedFetch : ''}`));
    }

    return {
        billId,
        title: billTitle,
        type, number, congress,
        stage: stage.key,
        stageLabel: stage.label,
        latestAction: meta?.latestAction?.text || '',
        actionDate,
        sponsor: meta?.sponsors?.[0] || null,
        cosponsors: meta?.cosponsors?.count || 0,
        introducedDate: meta?.introducedDate || '',
        isOmnibus: isOmnibus && !!divisions,
        // For omnibus bills with successful split, billText is empty — use divisions[].text instead.
        // For all other bills, billText is the full flat analysis text.
        billText: divisions ? '' : billTextResult.analysis,
        divisions: divisions || null,
        crsSummary: crs,
        congressionalRecord: cr,
        hasRecord: cr.length > 0,
        priorYearMatchStatus: priorYear.status,
        priorYearBillId: priorYear.billRef
            ? `${priorYear.billRef.congress}-${priorYear.billRef.type}-${priorYear.billRef.number}`
            : null,
        priorYearBillTitle: priorYear.billRef?.title || null,
        priorYearBillText,
        ...(referenceHints ? { referenceHints } : {}),
    };
}

async function main() {
    if (!CONGRESS_API_KEY) { console.error('CONGRESS_API_KEY not set.'); process.exit(1); }

    // --bill 119-HR-7148  Force-refetch a specific bill regardless of cache status.
    // Parses congress/type/number from the standard bill ID format.
    const billArg = process.argv.find(a => a.startsWith('--bill=') || a === '--bill');
    const billArgValue = billArg
        ? (billArg.startsWith('--bill=') ? billArg.split('=')[1] : process.argv[process.argv.indexOf('--bill') + 1])
        : null;

    if (billArgValue) {
        const parts = billArgValue.split('-');
        if (parts.length < 3) { console.error('--bill format: CONGRESS-TYPE-NUMBER (e.g. 119-HR-7148)'); process.exit(1); }
        const congress = parseInt(parts[0], 10);
        const type     = parts[1].toUpperCase();
        const number   = parts.slice(2).join('-');
        console.log(`\nForce-refetching ${billArgValue} (bypassing cache check)...`);
        const result = await processBillEntry(congress, type, number, `${type} ${number}`);
        if (!result) { console.error('Fetch failed.'); process.exit(1); }

        // Merge into existing bills_raw.json — replace existing entry if present, else append
        let existing = [];
        try { existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')); } catch (e) {}
        const idx = existing.findIndex(b => b.billId === result.billId);
        if (idx >= 0) existing[idx] = result; else existing.push(result);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(existing, null, 2));
        console.log(`\nDone. ${result.billId} written to bills_raw.json`);
        console.log(`  isOmnibus: ${result.isOmnibus}`);
        if (result.divisions) {
            result.divisions.forEach(d => console.log(`  Division ${d.divisionKey}: ${Math.round(d.charCount / 1000)}K chars — ${d.label}`));
        }
        return;
    }

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

    // Resume + incremental save: start from whatever is already in bills_raw.json,
    // skip bills already fetched (unless --force), and persist after EVERY bill so a
    // crash or rate-limit never loses progress — re-running picks up where it left off.
    // (This also stops re-fetching the un-analyzed backlog on every run.)
    const force = process.argv.includes('--force');
    let results = [];
    try { results = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8')); if (!Array.isArray(results)) results = []; } catch (e) {}
    const savedIds     = new Set(results.map(r => r.billId));
    const saveProgress = () => fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

    let ok = 0, skipped = 0, failed = 0;
    const fetchedThisRun = [];
    for (const b of newBills) {
        const congress = b.congress || CONGRESS_SESSION;
        const type     = (b.type || b.billType || '').toUpperCase();
        const billId   = `${congress}-${type}-${b.number}`;
        if (!force && savedIds.has(billId)) { skipped++; continue; }
        try {
            const result = await processBillEntry(congress, type, b.number, b.title);
            if (result) {
                const idx = results.findIndex(r => r.billId === billId);
                if (idx >= 0) results[idx] = result; else results.push(result);
                savedIds.add(billId);
                saveProgress();           // persist immediately — resume-safe
                fetchedThisRun.push(result);
                ok++;
            }
        } catch (e) {
            failed++;
            console.error(`  ✗ ${billId} failed: ${e.message} — skipping; re-run to retry it.`);
        }
        await sleep(2000);
    }

    saveProgress();
    // Only advance the fetch cutoff on a fully clean run; if anything failed, leave it
    // so the next run re-discovers the same window and retries the stragglers.
    if (failed === 0) fs.writeFileSync(LAST_FETCH_FILE, JSON.stringify({ lastRun: new Date().toISOString() }));
    console.log(`\nDone. ${ok} fetched, ${skipped} already saved (resumed), ${failed} failed. Total in bills_raw.json: ${results.length}`);
    if (failed > 0) console.log(`  ⚠ ${failed} failed — re-run \`node scripts/fetch_bills_data.js\` to retry just those (already-fetched bills are skipped).`);
    fetchedThisRun.forEach(r => console.log(`  ${r.billId} — ${r.title} [${r.stageLabel}]`));
}

if (require.main === module) {
    // Safety net: a stray async rejection (e.g. a late socket error from a fetch whose
    // result we already moved past) should be logged, not crash the whole run and lose
    // progress. Per-bill failures are handled in the loop; bills_raw.json is saved
    // incrementally, so the process can exit non-fatally either way.
    process.on('unhandledRejection', (reason) => {
        console.warn('  [warn] Unhandled promise rejection (continuing):', reason?.message || reason);
    });
    main().catch(e => { console.error('Fatal:', e); process.exit(1); });
}

module.exports = { detectReferenceHints, fetchWithRetry };
