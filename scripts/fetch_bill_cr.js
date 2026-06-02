// scripts/fetch_bill_cr.js
// Retroactively fetches Congressional Record quotes for bills already in cache.json.
// Uses pattern-based speaker extraction — no LLM required.
//
// Usage:
//   node scripts/fetch_bill_cr.js --bill 119-HR-5587
//   node scripts/fetch_bill_cr.js --all
//
// --bill: re-runs even if the bill already has quotes (lets you refresh a specific bill)
// --all:  only fills bills with empty featured_quotes; skips demo bills

'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const {
    fetchBillActions,
    extractFloorDates,
    fetchCongressionalRecord,
    parseReportRefs,
    fetchCommitteeReportText,
} = require('./batch_processor');
const { ACRONYMS } = require('../acronyms');

const _ACRONYM_EXCLUDED = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
    'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
    'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
    'TX','UT','VT','VA','WA','WV','WI','WY','DC',
    'USA','US','TV','AM','PM','AI','IT','HR','GOP',
    'II','III','IV','VI','VII','VIII','IX','XI','XII',
]);

function reportCRQuoteAcronyms(billId, quotes) {
    const known = new Set(Object.keys(ACRONYMS));
    const found = new Set();
    const pat = /\b([A-Z]{2,6})\b/g;
    for (const q of quotes) {
        let m;
        while ((m = pat.exec(q.text || '')) !== null) {
            if (!known.has(m[1]) && !_ACRONYM_EXCLUDED.has(m[1])) found.add(m[1]);
        }
    }
    if (found.size) {
        console.log(`  [ACRONYMS] Unknown in ${billId} quotes — add to acronyms.js if needed:`);
        console.log(`  → ${[...found].sort().join(', ')}`);
    }
}

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

const PROCEDURAL_RE = /^(?:(?:madam|mr\.?)\s+(?:speaker|president|chair),\s*)?(?:i yield|i claim the time|i do not oppose|i have no objection|i ask unanimous consent|i ask for the yeas and nays|i demand the yeas and nays|on that i demand|by direction of the committee|for the purpose of debate|pursuant to (?:the order|section|house resolution|senate rule|clause)|i was unable to vote|i was not recorded|i was not present|i was unavoidably absent|had i been present|i had a \w+ flight|will the gentleman|unanimous consent|point of order|quorum call|i move to suspend|i move to reconsider|i suggest the absence|i ask that)/i;

// Filler sentence patterns — applied to every sentence in the quote, regardless of position.
const FILLER_SENTENCE_RE = [
    // Yield / procedural openers
    /^(?:Madam|Mr\.?)\s+(?:Speaker|President),?\s+I\s+yield\s+myself\s+such\s+time/i,
    /^I\s+yield\s+myself\s+such\s+time/i,
    /^(?:Madam|Mr\.?)\s+(?:Speaker|President),?\s+I\s+rise\s+(?:today\s+)?in\s+(?:strong\s+)?(?:support\s+of|opposition\s+to)/i,
    /^I\s+rise\s+(?:today\s+)?in\s+(?:strong\s+)?(?:support\s+of|opposition\s+to)/i,
    /^(?:Madam|Mr\.?)\s+(?:Speaker|President),?\s+I\s+ask\s+unanimous\s+consent/i,
    // Thank-yous and formalities (anywhere in the quote)
    /^Thank\s+you(?:[,.]?\s+(?:Madam|Mr\.?)\s+(?:Speaker|President|Chair(?:man|woman)?))?[.!]?\s*$/i,
    /^(?:Again,?\s+)?(?:And\s+)?I\s+(?:also\s+)?(?:want\s+to\s+)?thank\b/i,
    /^[A-Za-z]+\)\s+that\s+the\s+(?:House|Senate)\b/i,
    /^(?:And\s+)?I\s+want\s+to\s+(?:(?:begin|start)\s+by\s+(?:just\s+)?)?(?:commend|thank|congratulat|recogniz|acknowledg)/i,
    /^(?:And\s+)?I\s+(?:will\s+start|will\s+begin)\s+by\s+(?:acknowledg|recogniz|thank|commend)/i,
    /^(?:And\s+)?I\s+also\s+want\s+to\s+(?:commend|thank|congratulat|recogniz)/i,
    /^Before\s+I\s+(?:begin|speak|continue),?\s+I\s+(?:want\s+to\s+|would\s+like\s+to\s+)?(?:thank|recognize|acknowledge)/i,
    // Closing statements
    /^I\s+have\s+no\s+further\s+speakers/i,
    /^I\s+(?:have\s+no\s+)?(?:further\s+)?speakers?,?\s+and\s+I\s+(?:yield|reserve)/i,
    /^I\s+am\s+prepared\s+to\s+close\b/i,
    /^I\s+am\s+so\s+pleased\b/i,
    /^I\s+am\s+(?:very\s+)?proud\s+to\s+(?:be\s+here|join|stand|rise|introduce|co-?sponsor)/i,
    /^In\s+closing\b/i,
    /\burge\s+(?:all\s+(?:of\s+)?)?(?:my\s+)?(?:colleagues|members|everyone|the\s+house|the\s+senate)\s+to\s+(?:pass|vote|support|oppose|reject)/i,
    /^By\s+direction\s+of\s+the\s+Committee\b/i,
    /^On\s+that\s+I\s+demand\s+the\s+yeas\b/i,
    // Tribute / honorary openers (no policy content)
    /\brise\s+(?:today\s+)?(?:to|in\s+order\s+to)\s+(?:honor|recognize|congratulate|pay\s+tribute|celebrate)\b/i,
    // Yield-back and procedural closers (anywhere)
    /\byield\s+back(?:\s+the\s+balance\s+of\s+my\s+time)?\b/i,
    /\breserve\s+the\s+balance\s+of\s+my\s+time\b/i,
    /\burge\s+(?:my\s+)?(?:colleagues|members|everyone|the\s+house|the\s+senate)\s+to\s+(?:pass|vote|support|oppose|reject)/i,
    /\burge\s+(?:passage|adoption|approval|support)\s+of\b/i,
    /\bask\s+unanimous\s+consent\b/i,
    /\bask\s+that\s+the\s+remainder\b/i,
    /\bthank\s+(?:the\s+)?(?:gentle(?:man|woman)|chair|speaker|president)\s+for\b/i,
    /\bthank\s+you\s+(?:very\s+much\s+)?(?:Madam|Mr\.?)\s+(?:Speaker|President|Chair)\b/i,
    // Administrative/parliamentary announcements
    /^The following (?:Senator|Representative|Member)s?\s+(?:is|are)\s+necessarily absent/i,
    /^The (?:legislative\s+)?clerk (?:read|called|will)/i,
    /^There appears to be a sufficient second/i,
    /^The question was taken\b/i,
    /^The rules were suspended\b/i,
    /^A motion to reconsider was laid\b/i,
];

// Optional salutation prefix senators use before their actual statement.
const SALUTATION_RE = /^(?:(?:Madam|Mr\.?)\s+(?:Speaker|President|Chair(?:man|woman)?),?\s+)+/i;

// Remove every sentence that matches a filler pattern, from any position.
// Strips the leading salutation from the whole text BEFORE splitting into sentences,
// because the splitter fires at "Mr." (lowercase r + period) and would break
// "Mr. President, I want to thank..." into ["Mr.", "President, I want to thank..."]
// where neither fragment matches our patterns.
// Falls back to original text if filtering would leave nothing.
function stripFillerSentences(text) {
    const cleaned = text.replace(SALUTATION_RE, '');
    // Temporarily neutralise title abbreviations so "Mr. Smith" doesn't get split
    // into ["Mr.", "Smith"] by the sentence boundary regex.
    const TITLES = /\b(Mr|Ms|Mrs|Dr|Sen|Rep|Prof|Hon|Gov|Jr|Sr)\.\s+([A-Z])/g;
    const guarded   = cleaned.replace(TITLES, '$1·$2');
    const sentences = guarded.split(/(?<=[a-z0-9][.!?])\s+(?=[A-Z])/)
        .map(s => s.replace(/\b(Mr|Ms|Mrs|Dr|Sen|Rep|Prof|Hon|Gov|Jr|Sr)·([A-Z])/g, '$1. $2'));
    const kept = sentences.filter(s => {
        const t  = s.trim();
        const ts = t.replace(SALUTATION_RE, '');
        return !FILLER_SENTENCE_RE.some(p => p.test(t) || p.test(ts));
    });
    const result = kept.join(' ').trim();
    // If filtering removed everything, return empty string so the caller can skip.
    // (Returning original text would preserve all-filler quotes.)
    return result.length > 30 ? result : '';
}

function detectStance(text) {
    const t = text.toLowerCase();
    const hasOppose = /\b(oppose|against|vote no|reject|dangerous|harmful|cannot support|will not support|urge.*defeat|vote against)\b/.test(t);
    const negated   = /\b(?:do(?:es)?|did|will|would|shall|have|has)\s+not\s+oppose\b|\bnot\s+oppose\b|\bno\s+opposition\b/.test(t);
    if (hasOppose && !negated) return 'oppose';
    if (/\b(support|favor|proud|urge.*pass|commend|pleased|important step|must pass|vote yes|vote for)\b/.test(t)) return 'support';
    return 'neutral';
}

function bestExcerpt(text, maxLen = 550) {
    // Protect title abbreviations before splitting so "Mr. Smith" isn't split mid-name.
    const TITLES = /\b(Mr|Ms|Mrs|Dr|Sen|Rep|Prof|Hon|Gov|Jr|Sr)\.\s+([A-Z])/g;
    const guarded = text.replace(TITLES, '$1·$2');
    const parts = guarded.split(/(?<=[a-z0-9][.!?])\s+(?=[A-Z])/)
        .map(s => s.replace(/\b(Mr|Ms|Mrs|Dr|Sen|Rep|Prof|Hon|Gov|Jr|Sr)·([A-Z])/g, '$1. $2'));
    let result = '';
    for (const s of parts) {
        if (result && result.length + 1 + s.length > maxLen) break;
        result = result ? result + ' ' + s : s;
    }
    // Always include at least one sentence; trim cleanly if over limit
    if (!result) result = parts[0] || text;
    if (result.length > maxLen) result = result.slice(0, maxLen);
    // Strip trailing title abbreviations (Mr., Ms., etc.) — they look like sentence ends
    // but are actually mid-sentence name references that got cut off.
    result = result.replace(/\s+\b(?:Mr|Ms|Mrs|Dr|Jr|Sr|Rep|Sen|Prof)\.\s*$/, '').trim();
    // If result doesn't end on sentence-closing punctuation, back up to last sentence end
    if (!/[.!?]$/.test(result.trim())) {
        const lastEnd = result.search(/[.!?][^.!?]*$/);
        if (lastEnd > 30) result = result.slice(0, lastEnd + 1);
        else result = result.replace(/\s+\S*$/, ''); // fallback: trim last partial word
    }
    return result.trim();
}

// Build candidate bill reference strings to locate the bill in a CR granule.
function buildBillPatterns(billType, billNumber) {
    if (!billType || !billNumber) return [];
    const t = billType.toUpperCase();
    const n = String(billNumber);
    const pats = [`${t} ${n}`, `${t}.${n}`];
    if (t === 'HR')       pats.push(`H.R. ${n}`, `H.R.${n}`);
    else if (t === 'S')   pats.push(`S. ${n}`);
    else if (t === 'HJRES')   pats.push(`H.J. Res. ${n}`, `H.J.Res. ${n}`);
    else if (t === 'SJRES')   pats.push(`S.J. Res. ${n}`, `S.J.Res. ${n}`);
    else if (t === 'HRES')    pats.push(`H. Res. ${n}`, `H.Res. ${n}`);
    else if (t === 'SRES')    pats.push(`S. Res. ${n}`, `S.Res. ${n}`);
    else if (t === 'HCONRES') pats.push(`H. Con. Res. ${n}`);
    else if (t === 'SCONRES') pats.push(`S. Con. Res. ${n}`);
    return pats;
}

function extractQuotesFromCR(crText, billType = '', billNumber = '') {
    const speakerMatches = [...crText.matchAll(SPEAKER_RE)];
    if (!speakerMatches.length) return [];

    // Locate all positions where this bill is mentioned, for proximity filtering.
    const billPatterns = buildBillPatterns(billType, billNumber);
    const mentionPositions = [];
    for (const pat of billPatterns) {
        let idx = crText.indexOf(pat);
        while (idx !== -1) { mentionPositions.push(idx); idx = crText.indexOf(pat, idx + pat.length); }
    }

    const quotes     = [];
    const seenNames  = new Set();

    for (let i = 0; i < speakerMatches.length; i++) {
        const m         = speakerMatches[i];
        const prefix    = m[1];   // "Mr." / "Ms." etc.
        const rawName   = m[2];   // e.g. "WYDEN" or "VAN HOLLEN of Oregon"

        // Skip presiding officers
        if (SKIP_NAME_WORDS.some(w => rawName.includes(w))) continue;

        const textStart = m.index + m[0].length;
        const textEnd   = i + 1 < speakerMatches.length ? speakerMatches[i + 1].index : textStart + 5000;
        const body      = crText.slice(textStart, textEnd)
                                .replace(/\s+/g, ' ')
                                .replace(/\[\[Page [^\]]+\]\]/g, '')        // strip [[Page H3113]] artifacts
                                .replace(/\{time\}\s*\d+\s*/g, '')         // strip {time} 1420 artifacts
                                .replace(/\s*(?:The Clerk (?:read|will designate) the (?:title|bill)|The text of the bill is as follows|Be it enacted by the Senate).*/i, '')
                                .replace(/\s*The (?:SPEAKER|CHAIR|PRESIDENT|PRESIDING OFFICER)(?:\s+pro\s+tempore)?\.\s[^.!?]+[.!?]/g, '')
                                .replace(/\s*The (?:Chair|Speaker|President)\s+(?:recognizes|yields|directs)\s[^.!?]+[.!?]/g, '')
                                .trim();

        // Skip fragment bodies: must start with a capital letter or opening quote,
        // and must not start with “Word)” which indicates mid-sentence extraction.
        if (!/^[A-Z”’”’]/.test(body) || /^[A-Za-z]+\)/.test(body)) continue;

        // Strip leading yield-of-time sentence before procedural check
        const stripped = body.replace(/^I yield[^.]+\.\s*/i, '').trim();
        if (PROCEDURAL_RE.test(stripped)) continue;
        if (stripped.split(/\s+/).length < 25) continue;

        // Relevance check: speaker must be talking about this bill, not something else
        // that happened to appear on the same CR page.
        if (mentionPositions.length > 0) {
            const bodyHasBill = billPatterns.some(p => body.includes(p));
            if (!bodyHasBill) {
                // If the opener names a different piece of legislation ("the SAVE America Act
                // has been a discussion..."), the speaker is on a different topic entirely.
                const opener        = stripped.slice(0, 300);
                const namedActMatch = opener.match(/\bthe\s+(?:[A-Z][A-Za-z]+\s+){1,6}(?:Act|Resolution|Amendment)\b/);
                const META_ACTS     = /congressional review|continuing resolution|budget|appropriations|parliamentary/i;
                if (namedActMatch && !META_ACTS.test(namedActMatch[0])) continue;

                const nearestDist = mentionPositions.reduce((d, pos) => Math.min(d, Math.abs(textStart - pos)), Infinity);

                // In large granules (full session transcripts) a tight window is needed —
                // senators often speak on unrelated business right after a vote.
                const tightWindow = crText.length > 50000 ? 1500 : 10000;
                if (nearestDist > tightWindow) continue;
            }
        }

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
        const substantive = stripFillerSentences(stripped);
        if (!substantive) continue;  // all sentences were filler
        const text        = bestExcerpt(substantive);
        if (text.length < 30) continue;

        quotes.push({
            name:       displayName,
            party:      repInfo.party      || null,
            state:      repInfo.state      || null,
            bioguideId: repInfo.bioguideId || null,
            text,
            stance:     detectStance(text),
        });

        if (quotes.length >= 6) break;
    }

    return quotes;
}

// --- Committee report views extraction ---

// Signer names appear near the end of a views section as short isolated lines.
// After cleanHTMLStructured, those are lines with just "First Last." (< 55 chars).
function extractSigners(sectionText) {
    const lines = sectionText.split('\n').map(l => l.trim()).filter(Boolean);
    // Match "First Last." or "Dr. First Last." — cap at 4 words to exclude
    // institutional names like "Treasury Inspector General For Tax Administration"
    const SIG_RE = /^(?:(?:Mr\.|Ms\.|Mrs\.|Dr\.|Sen\.\s|Rep\.\s|Senator\s|Representative\s))?[A-Z][a-z]{2,}(?: [A-Z][a-z]{2,}){1,3}\.?$/;
    return lines.slice(-30)
        .filter(l => l.length > 2 && l.length < 55 && SIG_RE.test(l))
        .map(l => l.replace(/\.$/, '').trim());
}

// Find MINORITY/ADDITIONAL/DISSENTING VIEWS sections and return raw section data.
function extractViewsQuotes(reportText) {
    const VIEWS_RE = /\b(MINORITY|MAJORITY|ADDITIONAL|SUPPLEMENTAL|DISSENTING|SEPARATE|INDIVIDUAL)\s+VIEWS?\b/g;
    const matches  = [...reportText.matchAll(VIEWS_RE)];
    const sections = [];

    for (let i = 0; i < matches.length; i++) {
        const m         = matches[i];
        const viewsType = m[1];
        const afterHdr  = reportText.slice(m.index + m[0].length, m.index + m[0].length + 120);
        const ofMatch   = afterHdr.match(/^\s+OF\s+((?:[A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){0,5}))/);
        const namedPerson = ofMatch ? ofMatch[1].trim() : null;

        const bodyStart = m.index + m[0].length + (ofMatch ? ofMatch[0].length : 0);
        const bodyEnd   = i + 1 < matches.length ? matches[i + 1].index : reportText.length;
        const body      = reportText.slice(bodyStart, bodyEnd).trim();

        // Skip table-of-contents entries and CR formatting artifacts
        if (/^[.\-_\s]*\d+/.test(body) || /^\.{5,}/.test(body)) continue;
        // Skip bodies starting with "[" (report header artifacts) or formal letter headers
        if (/^\[/.test(body)) continue;
        if (/^Congress\s+of\s+the\s+United\s+States|^Dear\s+\w|^To\s+(?:Whom|the\s+Chair)/i.test(body)) continue;
        if (!body || body.split(/\s+/).length < 20) continue;

        let stance;
        if (viewsType === 'MINORITY' || viewsType === 'DISSENTING') stance = 'oppose';
        else if (viewsType === 'MAJORITY')                           stance = 'support';
        else                                                         stance = detectStance(body);

        sections.push({ viewsType, namedPerson, signers: extractSigners(body), body, stance });
    }

    return sections;
}

// Convert raw views sections to quote objects in the same shape as CR quotes.
function viewsSectionsToQuotes(sections) {
    const quotes = [];
    for (const sec of sections) {
        const rawName = sec.namedPerson || sec.signers[0] || null;
        let displayName, repInfo = {};

        if (rawName) {
            // Title-case display name; resolve by last name
            displayName = rawName.split(/\s+/)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            repInfo = resolveRepInfo(rawName.split(/\s+/).pop().toUpperCase());
        } else {
            const typeLabel = sec.viewsType.charAt(0) + sec.viewsType.slice(1).toLowerCase();
            displayName = `Committee ${typeLabel} Members`;
        }

        const text = bestExcerpt(stripFillerSentences(sec.body.replace(/\n+/g, ' ')));
        if (!text || text.length < 30) continue;

        quotes.push({
            name:       displayName,
            party:      repInfo.party      || null,
            state:      repInfo.state      || null,
            bioguideId: repInfo.bioguideId || null,
            text,
            stance:     sec.stance,
        });
    }
    return quotes;
}

function selectQuotes(quotes) {
    // featured_quotes: all quotes, sorted oppose > support > neutral, deduped by bioguideId/name
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

    const actions  = await fetchBillActions(congress, type, number);
    const fallback = reformatStageDate(bill.enactedDate || bill.stageDate || '');

    let allQuotes = [];

    // --- Congressional Record ---
    const floorDates = extractFloorDates(actions, fallback);
    if (floorDates.length) {
        const crText = await fetchCongressionalRecord(type, number, floorDates, actions);
        if (crText) {
            const crQuotes = extractQuotesFromCR(crText, type, number);
            console.log(`  CR: ${crQuotes.length} speaker quote(s).`);
            allQuotes = allQuotes.concat(crQuotes);
        } else {
            console.log('  No CR text found.');
        }
    } else {
        console.log('  No floor dates — skipping CR.');
    }

    // --- Committee reports (MINORITY/ADDITIONAL/DISSENTING VIEWS) ---
    const reportRefs = parseReportRefs(actions);
    for (const ref of reportRefs) {
        const reportText = await fetchCommitteeReportText(ref.chamber, ref.congress, ref.number);
        if (!reportText) continue;
        const sections = extractViewsQuotes(reportText);
        console.log(`  Report ${ref.chamber}. Rept. ${ref.congress}-${ref.number}: ${sections.length} views section(s).`);
        allQuotes = allQuotes.concat(viewsSectionsToQuotes(sections));
    }

    if (!allQuotes.length) {
        console.log('  No quotes found from any source.');
        // When explicitly re-running a single bill, clear stale quotes so old
        // bad data doesn't persist just because we found nothing new.
        if (bill.featured_quotes?.length) {
            bill.featured_quotes = [];
            bill.criticisms = [];
            console.log('  Cleared stale quotes.');
            return true;
        }
        return false;
    }

    allQuotes.forEach(q =>
        console.log(`  ${q.name} (${q.party || '?'}-${q.state || '?'}) [${q.stance}]`)
    );

    const { featured, criticisms } = selectQuotes(allQuotes);

    bill.featured_quotes = featured;
    if (criticisms.length) bill.criticisms = criticisms;

    console.log(`  → ${featured.length} featured quote(s), ${criticisms.length} criticism(s) saved.`);
    reportCRQuoteAcronyms(bill.id, [...featured, ...criticisms]);
    return true;
}

// ─── LLM-assisted quote extraction ───────────────────────────────────────────

const CR_CACHE_DIR = path.join(__dirname, '../data/cr-cache');

function normalizeForVerify(text) {
    return text
        .toLowerCase()
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/—/g, '--')
        .replace(/\s+/g, ' ')
        .trim();
}

// Build the prompt printed to the user for pasting into Claude.
function buildExtractionPrompt(bill, crText) {
    return `\
Congressional Record excerpts for: ${bill.title}
Bill ID: ${bill.id}

${'─'.repeat(60)}
${crText}
${'─'.repeat(60)}

Extract up to 6 members who make substantive policy arguments specifically about this bill.

SKIP entirely (do not include):
- Procedural motions: moving to proceed, asking for yeas and nays, unanimous consent requests
- Speeches clearly about other bills or unrelated topics
- Vote tallies, roll call readings, administrative announcements
- Pure formalities: thank yous, yielding time, generic introductions
- Single-sentence statements with no policy substance

INCLUDE only speakers who argue for or against the policy merits of this specific bill.
Prefer excerpts where the speaker explains HOW the bill works or WHY it changes something — not just background statistics about the problem it addresses.

For each valid speaker, copy the most substantive 1–3 sentences verbatim from the text above. Do not paraphrase, summarise, or alter wording in any way.

Return ONLY a valid JSON array with no other text before or after it:
[
  {
    "name": "Mr. Smith",
    "party": "R",
    "state": "TX",
    "text": "verbatim sentences copied from the CR text above",
    "stance": "support | oppose | neutral"
  }
]

If no members make substantive on-topic arguments, return [].`;
}

// Verify each quote's text appears verbatim in the CR source.
// Checks sentence-by-sentence so multi-sentence extracts are fully sourced.
function verifyCRQuotes(rawQuotes, crText) {
    const crNorm = normalizeForVerify(crText);
    const verified = [];

    for (const q of rawQuotes) {
        const name = (q.name || '').trim();
        const text = (q.text || '').trim();
        if (!name || !text) { console.log(`  ✕ SKIP: missing name or text`); continue; }

        // Speaker's last name must appear in CR
        const lastName = name.split(/\s+/).pop().toUpperCase();
        if (!crText.toUpperCase().includes(lastName)) {
            console.log(`  ✕ REJECTED (name not in CR): ${name}`);
            continue;
        }

        // Every sentence of the quote must appear verbatim in the CR
        const SENT_SPLIT = /(?<=[a-z0-9][.!?])\s+(?=[A-Z])/;
        const sentences = text.split(SENT_SPLIT).map(s => s.trim()).filter(s => s.length > 15);
        const failures = sentences.filter(s => !crNorm.includes(normalizeForVerify(s)));

        if (failures.length > 0) {
            console.log(`  ✕ REJECTED (text not verbatim in CR): ${name}`);
            failures.forEach(f => console.log(`    ↳ "${f.slice(0, 80)}..."`));
            continue;
        }

        console.log(`  ✓ VERIFIED: ${name} [${q.stance || 'neutral'}]`);
        const repInfo = resolveRepInfo(lastName);
        verified.push({
            name,
            party:      q.party      || repInfo.party      || null,
            state:      q.state      || repInfo.state      || null,
            bioguideId: repInfo.bioguideId || null,
            text,
            stance:     q.stance || 'neutral',
        });
    }

    return verified;
}

// --fetch-cr: fetch CR text for a bill, save it, and print the Claude prompt.
async function fetchCRMode(billId) {
    const cacheData = loadCache();
    const bills     = Array.isArray(cacheData.bills) ? cacheData.bills : Object.values(cacheData.bills || {});
    const bill      = bills.find(b => b.id === billId);
    if (!bill) { console.error(`Bill ${billId} not found in cache.json.`); process.exit(1); }

    const { congress, type, number } = parseBillId(billId);
    const actions    = await fetchBillActions(congress, type, number);
    const fallback   = reformatStageDate(bill.enactedDate || bill.stageDate || '');
    const floorDates = extractFloorDates(actions, fallback);

    let crText = '';
    if (floorDates.length) {
        console.log(`Fetching CR for ${billId}...`);
        crText = await fetchCongressionalRecord(type, number, floorDates, actions);
    }

    if (!crText) {
        console.log(`No Congressional Record text found for ${billId}.`);
        process.exit(0);
    }

    // Also append any committee report views sections
    const reportRefs = parseReportRefs(actions);
    for (const ref of reportRefs) {
        const reportText = await fetchCommitteeReportText(ref.chamber, ref.congress, ref.number);
        if (!reportText) continue;
        const sections = extractViewsQuotes(reportText);
        if (!sections.length) continue;
        const viewsText = sections.map(s =>
            `[${s.viewsType} VIEWS${s.namedPerson ? ' OF ' + s.namedPerson : ''}]\n${s.body.replace(/\n+/g, ' ').trim()}`
        ).join('\n\n');
        crText += `\n\n=== COMMITTEE REPORT ===\n${viewsText}`;
        console.log(`  Added ${sections.length} committee report views section(s).`);
    }

    // Save for later verification
    if (!fs.existsSync(CR_CACHE_DIR)) fs.mkdirSync(CR_CACHE_DIR, { recursive: true });
    const crCacheFile = path.join(CR_CACHE_DIR, `${billId}.txt`);
    fs.writeFileSync(crCacheFile, crText, 'utf8');
    console.log(`CR text saved (${crText.length} chars) → data/cr-cache/${billId}.txt\n`);

    console.log('═'.repeat(70));
    console.log('PASTE THE FOLLOWING TO CLAUDE:');
    console.log('═'.repeat(70));
    console.log('');
    console.log(buildExtractionPrompt(bill, crText));
    console.log('');
    console.log('═'.repeat(70));
    console.log(`After Claude returns JSON, save it to a file and run:`);
    console.log(`  node scripts/fetch_bill_cr.js --apply-quotes ${billId} <quotes.json>`);
}

// --apply-quotes: verify Claude's JSON output and save to cache.
async function applyQuotesMode(billId, jsonPath) {
    const crCacheFile = path.join(CR_CACHE_DIR, `${billId}.txt`);
    if (!fs.existsSync(crCacheFile)) {
        console.error(`No cached CR text for ${billId}. Run --fetch-cr ${billId} first.`);
        process.exit(1);
    }
    const crText = fs.readFileSync(crCacheFile, 'utf8');

    // Read JSON from file arg or stdin
    let rawJSON;
    if (jsonPath) {
        rawJSON = fs.readFileSync(jsonPath, 'utf8');
    } else {
        process.stdout.write('Paste Claude\'s JSON output, then press Ctrl+D:\n');
        rawJSON = fs.readFileSync('/dev/stdin', 'utf8');
    }

    // Strip markdown code fences if present
    rawJSON = rawJSON.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    let rawQuotes;
    try {
        rawQuotes = JSON.parse(rawJSON);
        if (!Array.isArray(rawQuotes)) throw new Error('Expected a JSON array');
    } catch (e) {
        console.error('Failed to parse JSON:', e.message);
        process.exit(1);
    }

    console.log(`\nVerifying ${rawQuotes.length} quote(s) against CR source...`);
    const verified = verifyCRQuotes(rawQuotes, crText);

    if (!verified.length) {
        console.log('\nNo quotes passed verification. Cache not updated.');
        return;
    }

    const { featured, criticisms } = selectQuotes(verified);
    const cacheData = loadCache();
    const bills     = Array.isArray(cacheData.bills) ? cacheData.bills : Object.values(cacheData.bills || {});
    const bill      = bills.find(b => b.id === billId);
    if (!bill) { console.error(`Bill ${billId} not found in cache.json.`); return; }

    bill.featured_quotes = featured;
    if (criticisms.length) bill.criticisms = criticisms;
    saveCache(cacheData);

    console.log(`\n✓ Saved ${featured.length} quote(s), ${criticisms.length} criticism(s) for ${billId}.`);
    reportCRQuoteAcronyms(billId, [...featured, ...criticisms]);
}

// --- Entry point ---
async function main() {
    const args = process.argv.slice(2);

    // LLM-assisted modes
    const fetchCRIdx = args.indexOf('--fetch-cr');
    if (fetchCRIdx !== -1) {
        await fetchCRMode(args[fetchCRIdx + 1]);
        return;
    }
    const applyIdx = args.indexOf('--apply-quotes');
    if (applyIdx !== -1) {
        await applyQuotesMode(args[applyIdx + 1], args[applyIdx + 2] || null);
        return;
    }

    const billFlagIdx = process.argv.indexOf('--bill');
    const billArg     = billFlagIdx !== -1 ? process.argv[billFlagIdx + 1] : null;
    const doAll       = process.argv.includes('--all');

    if (!billArg && !doAll) {
        console.log('Usage:');
        console.log('  node scripts/fetch_bill_cr.js --bill 119-HR-5587        (regex extraction)');
        console.log('  node scripts/fetch_bill_cr.js --all                     (regex, bulk)');
        console.log('  node scripts/fetch_bill_cr.js --fetch-cr 119-HR-5587    (fetch + print Claude prompt)');
        console.log('  node scripts/fetch_bill_cr.js --apply-quotes 119-HR-5587 quotes.json');
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
        // --all: only analyzed, non-demo bills with empty featured_quotes
        targets = bills.filter(b => b.analyzed && !b.demo && !b.featured_quotes?.length);
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
