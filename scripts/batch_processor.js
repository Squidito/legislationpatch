require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { SYSTEM_PROMPT, CHUNK_MAP_PROMPT } = require('./prompts');
const { processVotesForBill } = require('./fetch_vote_data');
const { ACRONYMS } = require('../acronyms');

// State codes and other all-caps tokens that are not acronyms worth flagging
const _ACRONYM_EXCLUDED = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
    'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
    'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
    'TX','UT','VT','VA','WA','WV','WI','WY','DC',
    'USA','US','TV','AM','PM','AI','IT','HR','GOP',
    'II','III','IV','VI','VII','VIII','IX','XI','XII',
]);

function _collectBillTexts(parsed) {
    const texts = [];
    const add = v => { if (typeof v === 'string' && v.length > 2) texts.push(v); };

    function collectUnit(unit) {
        add(unit.brief); add(unit.summary);
        for (const tl of unit.top_lines || []) {
            add(tl.headline);
            for (const s of tl.subs || []) add(typeof s === 'string' ? s : s.text);
        }
        for (const sec of unit.sections || []) {
            add(sec.label);
            for (const item of sec.items || []) { add(item.main); add(item.detail); add(item.label); add(item.text); }
        }
        for (const q of unit.featured_quotes || []) add(q.text);
        const flat = [...(unit.underreported || []), ...(unit.criticisms || []), ...(unit.gaps || [])];
        for (const item of flat) {
            if (typeof item === 'string') add(item);
            else { add(item.summary); add(item.why_unreported); add(item.why); add(item.text); add(item.description); }
        }
        const ch = unit.changes || {};
        for (const list of [ch.added || [], ch.modified || [], ch.removed || []]) {
            for (const item of list) add(typeof item === 'string' ? item : (item.description || item.text));
        }
    }

    collectUnit(parsed);
    for (const div of parsed.divisions || []) collectUnit(div);
    return texts;
}

function reportNewAcronyms(billId, parsed) {
    const known = new Set(Object.keys(ACRONYMS));
    const found = new Set();
    const pat = /\b([A-Z]{2,6})\b/g;
    for (const text of _collectBillTexts(parsed)) {
        let m;
        while ((m = pat.exec(text)) !== null) {
            if (!known.has(m[1]) && !_ACRONYM_EXCLUDED.has(m[1])) found.add(m[1]);
        }
    }
    if (found.size) {
        console.log(`   [ACRONYMS] Unknown in ${billId} — add to acronyms.js if these need tooltips:`);
        console.log(`   → ${[...found].sort().join(', ')}`);
    }
}

// --- CONFIGURATION ---
const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const GOVINFO_API_KEY  = process.env.GOVINFO_API_KEY  || '';
const CONGRESS_SESSION = parseInt(process.env.CONGRESS_SESSION || '119', 10);
const LM_STUDIO_URL    = 'http://localhost:1235/v1/chat/completions';
const MODEL_NAME       = 'local-model';
const CACHE_FILE       = path.join(__dirname, '../data/cache.json');
const LAST_FETCH_FILE  = path.join(__dirname, '../data/last-fetch.json');

function loadFetchCutoff() {
    try {
        const { lastRun } = JSON.parse(fs.readFileSync(LAST_FETCH_FILE, 'utf8'));
        // Go back 1 extra day from last run for overlap redundancy
        return new Date(new Date(lastRun).getTime() - 3 * 24 * 60 * 60 * 1000);
    } catch {
        // First run — default to 30 days
        return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
}

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

// Extracts the first well-balanced JSON object from a string.
// Handles cases where the model outputs the JSON multiple times or appends extra text.
function extractFirstJSON(text) {
    if (!text) return null;
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (text[i] === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                return text.slice(start, i + 1);
            }
        }
    }
    return null;
}

function cleanHTML(html) {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .replace(/\s+/g, ' ')
        .trim();
}

// Like cleanHTML but preserves paragraph structure by converting block-level closing
// tags to newlines before stripping. Used for committee reports where line breaks
// are needed to detect signature blocks at the end of views sections.
function cleanHTMLStructured(html) {
    return html
        .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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

// Store dates as ISO YYYY-MM-DD (single canonical format). The UI renders them
// as mm-dd-yy via formatDateCompact. Storing ISO keeps date sorting/math reliable.
function formatDate(dateStr) {
    if (!dateStr) return '';
    const s = String(dateStr).trim();
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);     // already ISO (possibly w/ time)
    if (iso) return iso[1];
    try {
        const d = new Date(s);
        if (isNaN(d)) return s;
        return d.toISOString().slice(0, 10);
    } catch (e) { return s; }
}

function detectStage(latestActionText, billType) {
    const t = (latestActionText || '').toLowerCase();
    if (t.includes('vetoed by president') || t.includes('pocket veto') ||
        (t.includes('returned to') && t.includes('with objections')))
        return { key: 'vetoed',      label: 'Vetoed',              step: 4 };
    if (t.includes('signed by president') || t.includes('became public law') || t.includes('enacted'))
        return { key: 'signed',      label: 'Signed into Law',    step: 4 };
    if (t.includes('passed senate') || t.includes('senate agreed') || t.includes('received in the senate'))
        return { key: 'senate',      label: 'Passed Senate',       step: 3 };
    if (t.includes('passed house') || t.includes('passed the house') || t.includes('house agreed') || t.includes('on passage') || t.includes('motion to reconsider laid on the table agreed to'))
        return { key: 'house',       label: 'Passed House',        step: 2 };
    // Union Calendar / House Calendar = passed committee, awaiting House floor vote
    if (t.includes('union calendar') || t.includes('house calendar') || t.includes('senate calendar') || t.includes('placed on the calendar') || t.includes('calendar no'))
        return { key: 'committee',   label: 'On House Calendar',   step: 1 };
    if (t.includes('reported by') || t.includes('ordered to be reported') || t.includes('referred to')) {
        // House-originated bills only receive Senate committee actions after passing the House.
        // Senate markup actions start with the committee name ("Committee on X. Ordered to be reported..."),
        // whereas House markup says "Ordered to be Reported by...". Detect Senate-side activity and
        // infer the bill has already cleared the House floor.
        const houseOrigin = billType && /^H(R|JRES|CONRES|RES)$/i.test(billType);
        const senateSide  = t.startsWith('committee on') || (t.includes('senate') && !t.includes('referred to the house'));
        if (houseOrigin && senateSide)
            return { key: 'house', label: 'Passed House', step: 2 };
        return { key: 'committee',   label: 'In Committee',        step: 1 };
    }
    return     { key: 'introduced', label: 'Introduced',           step: 0 };
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
    const sourceText         = (billText + ' ' + crsText).toLowerCase();
    // Strip commas from source for number lookups — appropriations bills write
    // amounts as "240,774,000" but the model normalises to "240774000".
    const sourceTextNoCommas = sourceText.replace(/,/g, '');
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

    // 1. Dollar amounts — check against both the normal source and the comma-stripped
    // version so that "$240,774,000" (model output) matches "240,774,000" (bill text).
    const dollarMatches = [...new Set(
        factualJson.match(/\$[\d,.]+\s*(?:billion|million|trillion|[BMTKbmtk])\b|\$[\d,.]+/gi) || []
    )];
    for (const amt of dollarMatches) {
        const coreNum = amt.replace(/[$,\s]/g, '').match(/[\d.]+/)?.[0];
        if (coreNum && !sourceText.includes(coreNum) && !sourceTextNoCommas.includes(coreNum)) {
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
// SKIP (DOA_ACTIONS below): bills stuck at introduction / referral with no
//   floor time — not worth analyzing yet.
//
// SKIP (SKIP_TITLE_PATTERNS below): resolutions with no standalone policy
//   content — procedural floor rules, administrative housekeeping, non-binding
//   sense resolutions, facility naming, and memorials.
//
// DEFERRED — tribal / land transfer bills: strategy (bundle or skip) TBD.
//   These pass nearly unanimously, affect specific communities, and have no
//   controversial content. Hold for a future decision before adding a rule.
//
// ─────────────────────────────────────────────────────────────────────────────

const DOA_ACTIONS = [
    'introduced in', 'read twice and referred', 'referred to the committee',
    'referred to committee', 'held at the desk', 'referred to the subcommittee'
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

// Fetch recently enacted public laws — catches signed bills that fall outside
// the updateDate-sorted general query (e.g. Senate bills signed but not recently updated).
async function fetchRecentLaws(limit = 20) {
    console.log(`[1a] Checking /law endpoint for recently enacted laws...`);
    const url = `https://api.congress.gov/v3/law/${CONGRESS_SESSION}?limit=${limit}&format=json&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res = await fetch(url);
        if (!res.ok) { console.log('   - Law endpoint unavailable, skipping.'); return []; }
        const data = await res.json();
        const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35-day window
        const laws = (data.bills || []).filter(b => {
            const actionDate = new Date(b.latestAction?.actionDate || 0);
            if (actionDate < cutoff) return false;
            const title = (b.title || '').toLowerCase();
            if (SKIP_TITLE_PATTERNS.some(p => title.includes(p))) return false;
            return true;
        });
        console.log(`   - ${laws.length} recently enacted law(s) found in 35-day window.`);
        return laws;
    } catch (e) {
        console.error('   - Failed to fetch law endpoint:', e.message);
        return [];
    }
}

async function fetchRecentBills(cutoff = loadFetchCutoff()) {
    console.log(`[1] Fetching recently updated bills from Congress.gov (session ${CONGRESS_SESSION})...`);
    const PAGE    = 250; // API max per request
    const results = [];
    let   offset  = 0;
    let   done    = false;

    while (!done) {
        const url = `https://api.congress.gov/v3/bill/${CONGRESS_SESSION}?sort=updateDate+desc&limit=${PAGE}&offset=${offset}&format=json&api_key=${CONGRESS_API_KEY}`;
        await sleep(offset === 0 ? 4000 : 2000);
        try {
            const res = await fetch(url);
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
                // Strict floor-time rule: only bills that have been voted on the floor
                if (detectStage(b.latestAction?.text || '', b.type).step < 2) continue;
                results.push(b);
            }

            if (!data.pagination?.next) break;
            offset += PAGE;
        } catch (e) {
            console.error('Failed to fetch bills:', e);
            break;
        }
    }

    console.log(`   Found ${results.length} qualifying bill(s) with floor time in 6-month window.`);
    return results;
}

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
            const version = data.textVersions[data.textVersions.length - 1];
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

// --- STRUCTURAL XML CHUNKING ---
// Chunks USLM Legislative XML by <section> boundaries instead of arbitrary word counts.
// Semantically whole sections = better LLM extraction, no mid-provision cuts.
function chunkXMLByStructure(xmlText, targetChars = 12000, maxChars = 22000) {
    const sections = [];

    // Split at every <section opening tag, keeping the tag with each part
    const parts = xmlText.split(/(?=<section[\s>])/i);

    for (const part of parts) {
        if (!part.trim()) continue;
        // Extract the first <enum> and <header> found (the section's own label)
        const enumMatch   = part.match(/<enum[^>]*>([\s\S]*?)<\/enum>/i);
        const headerMatch = part.match(/<header[^>]*>([\s\S]*?)<\/header>/i);
        const enumText    = (enumMatch?.[1]   || '').replace(/<[^>]+>/g, '').trim();
        const headerText  = (headerMatch?.[1] || '').replace(/<[^>]+>/g, '').trim();
        const label       = [enumText, headerText].filter(Boolean).join(' — ');
        // Strip all XML tags to plain text
        const plain = part.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (plain.length < 60) continue;
        sections.push({ label: label || 'Section', text: plain });
    }

    if (!sections.length) return []; // signal: no structure found, caller should fall back

    // Group small sections up to targetChars; word-split any section over maxChars
    const chunks = [];
    let buf = '', bufLabel = '';

    const flush = () => { if (buf) { chunks.push({ label: bufLabel, text: buf }); buf = ''; bufLabel = ''; } };

    for (const sec of sections) {
        // Section too large on its own — split by words and flush separately
        if (sec.text.length > maxChars) {
            flush();
            chunkText(sec.text).forEach((wc, i) =>
                chunks.push({ label: `${sec.label} (part ${i + 1})`, text: wc })
            );
            continue;
        }
        if (buf && buf.length + sec.text.length > targetChars) flush();
        buf      = buf ? buf + '\n\n--- ' + sec.label + ' ---\n' + sec.text : sec.text;
        bufLabel = bufLabel || sec.label;
    }
    flush();
    return chunks;
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

async function fetchBillActions(congress, type, number) {
    const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}/actions?format=json&limit=250&api_key=${CONGRESS_API_KEY}`;
    await sleep(2000);
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        return (await res.json()).actions || [];
    } catch (e) {
        console.error('Failed to fetch bill actions:', e.message);
        return [];
    }
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

// --- LOCAL LLM ---

function stripThinkingTags(text) {
    if (!text) return text;
    // Remove properly closed think blocks
    let result = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    // Remove unclosed think blocks — if <think> appears with no closing tag,
    // everything from that point is reasoning with no answer following it
    result = result.replace(/<think>[\s\S]*/gi, '');
    return result.trim();
}

// Prepended to every system prompt to prevent Qwen3 entering think mode via API
const NO_THINK_PREFIX = 'Do not use <think> tags or internal reasoning. Begin your response immediately with the requested content.\n\n';

// prefill: optional string to inject as the start of the assistant response.
// Forces the model directly into generation mode before think tokens can appear.
async function callLocalLLM(systemPrompt, userMessage, prefill = '') {
    const messages = [
        { role: 'system',    content: NO_THINK_PREFIX + systemPrompt },
        { role: 'user',      content: userMessage },
    ];
    if (prefill) {
        messages.push({ role: 'assistant', content: prefill });
    }

    const payload = {
        model:       MODEL_NAME,
        messages,
        temperature: 0.1,
        max_tokens:  4096,
        stream:      false,
        chat_template_kwargs: { enable_thinking: false }
    };
    try {
        const res = await fetch(LM_STUDIO_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body:   JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`LM Studio Error: ${res.status}`);
        const content = (await res.json()).choices[0].message.content;
        const stripped = stripThinkingTags(content);
        // Re-attach prefill since the API returns only the continuation
        return prefill ? prefill + stripped : stripped;
    } catch (e) {
        console.error('Failed to contact LM Studio on port 1235. Is it running?', e);
        return null;
    }
}

// --- NUMBER HUMANIZER ---
// Runs AFTER the verification gate has passed — purely cosmetic reformatting.
// $240,774,000 → $241M  |  $1,175,482,000 → $1.2B  |  $15,750 → unchanged (below 1M)

function humanizeAmount(str) {
    return String(str).replace(/\$[\d,]+(?:\.\d+)?/g, match => {
        const num = parseFloat(match.replace(/[$,]/g, ''));
        if (isNaN(num) || num < 1_000_000) return match;
        if (num >= 1_000_000_000) {
            const b = num / 1_000_000_000;
            return '$' + (b % 1 === 0 ? b.toFixed(0) : b.toFixed(1)) + 'B';
        }
        return '$' + Math.round(num / 1_000_000) + 'M';
    });
}

function humanizeAmountsDeep(obj) {
    if (typeof obj === 'string') return humanizeAmount(obj);
    if (Array.isArray(obj)) return obj.map(humanizeAmountsDeep);
    if (obj !== null && typeof obj === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            // Never reformat numeric fields (likelihood, currentStep, etc.)
            out[k] = typeof v === 'number' ? v : humanizeAmountsDeep(v);
        }
        return out;
    }
    return obj;
}

// --- MAIN BILL PROCESSOR ---

async function processBill(bill) {
    const { congress, type, number } = bill;
    const billId = `${congress}-${type}-${number}`;
    console.log(`\n[2] Processing: ${billId} — ${bill.title}`);

    // Step 1 — Fetch bill text (required; skip if unavailable)
    const { text: rawTextRaw, isXML } = await fetchBillText(bill);
    if (!rawTextRaw) { console.log('   - No bill text available. Skipping.'); return null; }

    // Step 2 — Fetch metadata, CRS summary, and bill actions in parallel
    const [meta, crsText, actions] = await Promise.all([
        fetchBillMetadata(bill),
        fetchCRSSummary(bill),
        fetchBillActions(congress, type, number),
    ]);

    const floorDates = extractFloorDates(actions, meta?.latestAction?.actionDate || meta?.updateDate || '');
    const recordText = await fetchCongressionalRecord(type, number, floorDates, actions);
    const hasRecord  = recordText.length > 0;

    console.log(`   - Congressional Record: ${hasRecord
        ? 'found — quotes/criticisms will be sourced from it'
        : 'not found — quotes/criticisms/comments will be empty'}`);

    // Step 3 — Choose chunking strategy (priority order):
    //   1. XML structural: split at legal <section> boundaries — best quality
    //   2. CRS-primary: use the CRS summary as source when bill is huge and CRS is rich
    //   3. Word-count: fallback for any remaining case
    const cleanedBillText = cleanHTML(rawTextRaw); // strip XML/HTML for verification
    const cleanedCRS      = crsText ? crsText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const estimatedPages  = Math.max(1, Math.round(cleanedBillText.length / 2500));
    const MEGA_BILL_THRESHOLD = 100000;

    let chunks, sourceLabel;

    if (isXML) {
        const xmlChunks = chunkXMLByStructure(rawTextRaw);
        if (xmlChunks.length > 0) {
            chunks      = xmlChunks.map(c => c.label ? `[${c.label}]\n${c.text}` : c.text);
            sourceLabel = 'bill XML (section-structured)';
            console.log(`   - Raw bill: ${cleanedBillText.length} chars (~${estimatedPages} pages). XML structural chunking: ${xmlChunks.length} section-chunk(s).`);
        } else {
            // XML present but no <section> tags found — fall through to word-count
            console.log('   - XML available but no <section> structure found. Falling back to word-count.');
        }
    }

    if (!chunks && cleanedBillText.length > MEGA_BILL_THRESHOLD && cleanedCRS.length > 10000) {
        chunks      = chunkText(cleanedCRS);
        sourceLabel = 'CRS summary';
        console.log(`   - Raw bill: ${cleanedBillText.length} chars (~${estimatedPages} pages). Mega-bill — using CRS (${cleanedCRS.length} chars): ${chunks.length} chunk(s).`);
    }

    if (!chunks) {
        chunks      = chunkText(cleanedBillText);
        sourceLabel = 'bill text';
        console.log(`   - Raw bill: ${cleanedBillText.length} chars (~${estimatedPages} pages). Word-count chunking: ${chunks.length} chunk(s).`);
    }

    // Step 4 — Map phase: extract facts from each chunk
    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
        console.log(`   - Chunk ${i + 1}/${chunks.length}...`);
        const summary = await callLocalLLM(
            'You are a legal text extraction assistant. Extract only what is explicitly stated in the text. Do not add outside knowledge.',
            `${CHUNK_MAP_PROMPT}\n\nSOURCE (${sourceLabel}):\n${chunks[i]}`,
            '- '
        );
        if (summary) {
            console.log(`   - Chunk ${i + 1} extracted ${summary.length} chars of notes.`);
            chunkSummaries.push(summary);
        } else {
            console.log(`   - Chunk ${i + 1} returned no content from model.`);
        }
    }
    if (!chunkSummaries.length) {
        console.log('   - No chunk notes produced — bill may be too short or procedural to analyze.');
        return null;
    }

    // Step 5 — Build reduce-phase context
    // For small bills (≤8 chunks): direct proportional truncation.
    // For large bills (>8 chunks): hierarchical two-pass reduce — groups of chunks are
    // mid-reduced to key facts first, then the key facts are synthesized into final JSON.
    // This keeps the final reduce input well within the 12,288-token context window.
    const MAX_REDUCE_NOTES    = 20000;
    const DIRECT_CHUNK_LIMIT  = 14; // ≤14 chunks → direct proportional truncation
    const MID_REDUCE_GROUP    = 15; // chunks per mid-reduce group (for 15+ chunk bills)

    let combinedNotes;

    if (chunkSummaries.length <= DIRECT_CHUNK_LIMIT) {
        const notesPerChunk = Math.floor(MAX_REDUCE_NOTES / Math.max(1, chunkSummaries.length));
        combinedNotes = chunkSummaries
            .map((s, i) => `[Chunk ${i + 1}/${chunkSummaries.length}]\n` + s.slice(0, notesPerChunk))
            .join('\n---\n');
        if (chunkSummaries.length > 1) {
            console.log(`   - Notes: ${combinedNotes.length} chars (${notesPerChunk}/chunk × ${chunkSummaries.length} chunks).`);
        }
    } else {
        // Two-pass hierarchical reduce
        const groups = [];
        for (let i = 0; i < chunkSummaries.length; i += MID_REDUCE_GROUP) {
            groups.push(chunkSummaries.slice(i, i + MID_REDUCE_GROUP));
        }
        console.log(`   - Large bill: hierarchical reduce — ${chunkSummaries.length} chunks → ${groups.length} groups of ≤${MID_REDUCE_GROUP}.`);

        const groupSummaries = [];
        for (let g = 0; g < groups.length; g++) {
            console.log(`   - Mid-reduce group ${g + 1}/${groups.length}...`);
            const groupNotes = groups[g]
                .map((s, i) => `[Chunk ${g * MID_REDUCE_GROUP + i + 1}]\n` + s.slice(0, 2000))
                .join('\n---\n');
            const keyfacts = await callLocalLLM(
                'You extract the most important legislative provisions from bill notes. Include exact numbers. Return bullet points only.',
                `Extract the 4-6 most important provisions from these bill notes (group ${g + 1}/${groups.length}):\n\n${groupNotes}`,
                '- '
            );
            if (keyfacts) {
                const start = g * MID_REDUCE_GROUP + 1;
                const end   = Math.min((g + 1) * MID_REDUCE_GROUP, chunkSummaries.length);
                groupSummaries.push(`[Chunks ${start}–${end}]\n${keyfacts}`);
            }
        }
        combinedNotes = groupSummaries.join('\n---\n').slice(0, MAX_REDUCE_NOTES);
        console.log(`   - Hierarchical reduce complete: ${groupSummaries.length} group summaries, ${combinedNotes.length} chars total.`);
    }
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

    // For mega-bills the CRS was the primary chunk source, so the notes already
    // contain all the CRS content — we only need a short header here to orient the
    // model, not a full preview (saves ~1000 tokens for the output).
    const CRS_PREVIEW_LEN = sourceLabel === 'CRS summary' ? 1000 : 3000;
    const crsSection = cleanedCRS
        ? `CRS OFFICIAL SUMMARY (Zone 1 source — verified against this):\n${cleanedCRS.slice(0, CRS_PREVIEW_LEN)}`
        : 'CRS SUMMARY: Not available.';

    const recordSection = hasRecord
        ? `CONGRESSIONAL RECORD EXCERPTS (Zone 2 — the ONLY source for quotes, comments, and criticisms):\n${recordText}`
        : `CONGRESSIONAL RECORD: No floor debate found for this bill.\nIMPORTANT: Return [] for featured_quotes, [] for criticisms, and [] for every comments array.`;

    // Step 6 — Reduce phase: synthesize JSON
    console.log('   - Synthesizing final JSON...');
    const finalJSONString = await callLocalLLM(
        SYSTEM_PROMPT,
        `${billContext}\n\n${crsSection}\n\n${recordSection}\n\nSOURCE NOTES — ${sourceLabel} (Zone 1 primary):\n${combinedNotes}

━━━ FINAL REMINDER BEFORE YOU OUTPUT ━━━
Every dollar amount, percentage, section number, and named program in your JSON must appear verbatim in the Bill Text Notes or CRS Summary above.
CRITICAL — DOLLAR AMOUNTS: Use the exact figure from the source. Never round or abbreviate.
If the source says "$240,774,000" you must write "$240,774,000" — NOT "$240.8 million" or "$241 million".
If the source says "$3,040,000,000" you must write "$3,040,000,000" — NOT "$3.04 billion".
Every speaker name in quotes, criticisms, and comments must appear verbatim in the Congressional Record excerpts above.
If a fact is not in the source material provided: omit it. Do not estimate. Do not complete from memory.
An empty array [] is always correct. An invented fact is never acceptable.`,
        '{' // prefill forces model directly into JSON output
    );

    // Step 7 — Parse LLM output
    let parsed;
    try {
        console.log(`   - LLM snippet: ${finalJSONString ? finalJSONString.substring(0, 120) : 'NULL'}`);
        const jsonStr = extractFirstJSON(finalJSONString);
        if (!jsonStr) throw new Error('No JSON object found in LLM response.');
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        console.error('   - Failed to parse LLM JSON:', e.message);
        console.error('   - Full response:\n', finalJSONString);
        return null;
    }

    // Step 8 — Normalize likelihood and derive label from number
    // Model sometimes outputs 0-1 scale, sometimes 0-100, sometimes 0 as "unknown"
    let pct = parsed.likelihood;
    if (typeof pct === 'number' && pct > 0 && pct <= 1) pct = Math.round(pct * 100);
    pct = Math.min(99, Math.max(1, Math.round(pct || 0)));
    // If model output 0 (no assessment), floor to 1 so it renders as Long shot
    if (pct === 0) pct = 1;
    parsed.likelihood = pct;

    // Derive label from number — eliminates model inconsistency between the two fields
    parsed.likelihoodLabel = pct >= 100 ? 'Enacted'
        : pct >= 75 ? 'Likely'
        : pct >= 50 ? 'Possible'
        : pct >= 25 ? 'Unlikely'
        : 'Long shot';

    // Step 9 — Run full verification gate
    const failures = verifyOutput(parsed, cleanedBillText, crsText, recordText, hasRecord);

    if (failures.length > 0) {
        console.log(`   - REJECTED — ${failures.length} unverified claim(s):`);
        failures.forEach(f => console.log(`     ✕ ${f}`));
        return null;
    }

    console.log('   - Verification passed: all claims confirmed in source text.');

    // Step 9.5 — Humanize dollar amounts (post-verification, cosmetic only)
    // Verification confirmed all numbers are real; now reformat for display.
    parsed = humanizeAmountsDeep(parsed);

    // Step 10 — Stamp all required UI fields
    const stage = detectStage(meta?.latestAction?.text || '', bill.type);

    parsed.id               = billId;
    parsed.title            = bill.title;
    parsed.official_title   = bill.title;
    parsed.code             = `${type}.${number}`;
    parsed.date             = formatDate(meta?.introducedDate || bill.updateDate);
    parsed.stageDate        = formatDate(meta?.latestAction?.actionDate || '');
    parsed.enactedDate      = stage.key === 'signed' ? formatDate(meta?.latestAction?.actionDate || '') : '';
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
    parsed.demo             = false;

    // Step 11 — Ensure all array/object fields exist
    parsed.sections        = Array.isArray(parsed.sections)        ? parsed.sections        : [];
    parsed.underreported   = Array.isArray(parsed.underreported)   ? parsed.underreported   : [];
    parsed.criticisms      = Array.isArray(parsed.criticisms)      ? parsed.criticisms      : [];
    parsed.gaps            = Array.isArray(parsed.gaps)            ? parsed.gaps            : [];
    parsed.featured_quotes = Array.isArray(parsed.featured_quotes) ? parsed.featured_quotes : [];
    parsed.top_lines       = Array.isArray(parsed.top_lines)       ? parsed.top_lines       : [];
    parsed.changes         = parsed.changes || { added: [], modified: [], removed: [] };

    // Save full bill text for bill detail page
    try {
        const btDir = path.join(__dirname, '../data/bill-text');
        if (!fs.existsSync(btDir)) fs.mkdirSync(btDir, { recursive: true });
        fs.writeFileSync(path.join(btDir, `${billId}.txt`), cleanedBillText);
        console.log(`   - Bill text saved: data/bill-text/${billId}.txt`);
    } catch (e) {
        console.warn('   - Warning: could not save bill text:', e.message);
    }

    console.log(`   - Done: ${billId} | stage: ${stage.key} | likelihood: ${parsed.likelihood}%`);
    reportNewAcronyms(billId, parsed);
    return parsed;
}

// --- MAIN ---

function loadCache() {
    let cacheData = { generated: new Date().toISOString(), bills: [] };
    if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        if (raw.trim()) {
            cacheData = JSON.parse(raw);
            if (!cacheData.bills) cacheData.bills = [];
        }
    }
    return cacheData;
}

function saveCache(cacheData) {
    cacheData.generated = new Date().toISOString();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
}

// Targeted single-bill test mode.
// Usage: node scripts/batch_processor.js --bill 119-HR-8071
async function runSingleBill(targetId) {
    console.log(`=== TARGETED TEST: ${targetId} ===`);

    const parts = targetId.split('-');
    if (parts.length !== 3) {
        console.error('Invalid format. Use: --bill 119-HR-8071');
        return;
    }

    const [congressStr, type, number] = parts;
    const congress = parseInt(congressStr, 10);

    // Fetch metadata first to get the title and latestAction
    console.log('\n[1] Fetching bill metadata to construct bill object...');
    const meta = await fetchBillMetadata({ congress, type, number });
    if (!meta) {
        console.error('Could not fetch metadata for this bill. Check the ID and API key.');
        return;
    }

    // Floor-time check — skip committee/introduced bills unless --force is passed
    const floorStage = detectStage(meta.latestAction?.text || '', type);
    if (floorStage.step < 2) {
        if (process.argv.includes('--force')) {
            console.log(`   ⚠ Floor-time override (--force): stage is '${floorStage.key}' — proceeding anyway.`);
        } else {
            console.log(`\n✕ Skipped: ${targetId} has not seen floor time (stage: ${floorStage.key}).`);
            console.log('  Bills must have passed the House or Senate. Use --force to override.');
            return;
        }
    }

    const bill = {
        congress,
        type,
        number,
        title:        meta.title || `${type} ${number}`,
        latestAction: meta.latestAction,
        updateDate:   meta.updateDate,
    };

    // Remove from cache if present so we reprocess cleanly
    const cacheData = loadCache();
    const wasCached  = cacheData.bills.some(b => b.id === targetId);
    if (wasCached) {
        cacheData.bills = cacheData.bills.filter(b => b.id !== targetId);
        console.log(`   - Removed existing ${targetId} from cache to allow fresh reprocessing.`);
    }

    const processedData = await processBill(bill);
    if (processedData) {
        cacheData.bills.unshift(processedData);
        saveCache(cacheData);
        console.log(`\n=== SUCCESS: ${targetId} saved to cache.json ===`);
        try {
            await processVotesForBill(processedData, cacheData);
            saveCache(cacheData);
        } catch (e) {
            console.warn(`   - Vote fetch skipped (non-fatal): ${e.message}`);
        }
    } else {
        console.log(`\n=== REJECTED: ${targetId} did not pass verification ===`);
    }
}

async function runBatch() {
    console.log('=== LEGISLATION PATCH BATCH PROCESSOR ===');

    if (!CONGRESS_API_KEY) { console.error('ERROR: Missing CONGRESS_API_KEY in .env'); return; }

    const cacheData   = loadCache();
    const existingIds = new Set(cacheData.bills.map(b => b.id));

    // Merge law endpoint (catches signed Senate bills missed by updateDate sort)
    // with the general recent-bills query. Deduplicate by bill ID.
    const [recentLaws, recentBills] = await Promise.all([fetchRecentLaws(20), fetchRecentBills()]);
    const seen = new Set();
    const billsToProcess = [...recentLaws, ...recentBills].filter(b => {
        const id = `${b.congress}-${b.type}-${b.number}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
    let processedCount = 0;

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
            saveCache(cacheData);
            console.log(`   - Saved ${billId} to cache.json.`);
            processedCount++;
            try {
                await processVotesForBill(processedData, cacheData);
                saveCache(cacheData);
            } catch (e) {
                console.warn(`   - Vote fetch skipped (non-fatal): ${e.message}`);
            }
        }
    }

    fs.writeFileSync(LAST_FETCH_FILE, JSON.stringify({ lastRun: new Date().toISOString() }));
    console.log(`\n=== BATCH COMPLETE — ${processedCount} new bill(s) processed ===`);
}

// Entry point — supports targeted test mode via --bill flag
if (require.main === module) {
    const billFlagIdx = process.argv.indexOf('--bill');
    if (billFlagIdx !== -1 && process.argv[billFlagIdx + 1]) {
        runSingleBill(process.argv[billFlagIdx + 1]);
    } else {
        runBatch();
    }
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
