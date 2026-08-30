#!/usr/bin/env node
// generate-site-facts.js — derive the countable facts the SELF-DESCRIPTIVE trust
// pages assert about this site, and write them to a stored source sheet the
// article audit ledgers bind their receipts to.
//
//   node scripts/generate-site-facts.js            (dry run: print the sheet)
//   node scripts/generate-site-facts.js --apply    (write the sheet)
//   node scripts/generate-site-facts.js --check    (exit 1 if the sheet is stale)
//
// WHY THIS EXISTS. articles/methodology.html, what-is-legislationpatch.html,
// how-we-track-voting.html, how-we-source-quotes.html and
// what-is-congressional-record.html describe THIS SITE. Their factual claims are
// therefore checkable against this repo and nothing else — but the article audit
// lane's receipts must resolve to a STORED text file (lib/article-ledger.js), and
// "551 members" is not a verbatim span of any data file. So the counts are
// derived here, written once to data/ref-text/record-lp-site-facts.txt, and the
// ledger claims quote THIS file. Same role, and the same rationale, as the
// corpus snapshot scripts/generate-tracker-roster.js writes for the 119th
// Congress tracker: provenance for a generated claim.
//
// Nothing countable is typed in this file (docs/TOPIC-HUBS.md rule 1) — every
// number below is computed from data/ or from the scripts being described.
// Fail-closed: a missing input is an error, never a silently skipped line.
//
// Reads:  data/reps-index.json, data/reps/, data/cache.json, data/quotes.json,
//         data/analysis-skip.json, data/qa-ledger/*.json, scripts/validate-batch.js,
//         scripts/fetch_bill_cr.js, scripts/fetch_vote_data.js, bill.js
// Writes: data/ref-text/record-lp-site-facts.txt   (--apply)

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const APPLY = flag('apply');
const CHECK = flag('check');

const OUT = path.join(ROOT, 'data/ref-text/record-lp-site-facts.txt');

const die = (m) => { console.error(`  ❌ ${m}`); process.exit(1); };
const readJson = (rel) => {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) die(`missing input ${rel}`);
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { die(`${rel} does not parse: ${e.message}`); }
};
const readText = (rel) => {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) die(`missing input ${rel}`);
    return fs.readFileSync(p, 'utf8');
};

// ── Member database ─────────────────────────────────────────────────────────
const repsIndex = readJson('data/reps-index.json');
const members = [];
for (const list of Object.values(repsIndex)) {
    if (!Array.isArray(list)) die('data/reps-index.json is not a state -> array map');
    for (const r of list) members.push(r);
}
const memberIds = new Set(members.map(m => m.bioguideId));
if (memberIds.size !== members.length) die('reps-index.json carries duplicate bioguideIds');
const byRole = {};
for (const m of members) byRole[m.role] = (byRole[m.role] || 0) + 1;
const repFiles = fs.readdirSync(path.join(ROOT, 'data/reps')).filter(f => f.endsWith('.json'));

// The exact field set a stored member record carries, unioned over every file —
// the claim "for each member we store X" is checkable only against this.
const repFieldSet = new Set();
for (const f of repFiles) {
    const rec = readJson(path.posix.join('data/reps', f));
    for (const k of Object.keys(rec)) repFieldSet.add(k);
}
const repFields = [...repFieldSet].sort();
const bioSources = {};
for (const f of repFiles) {
    const rec = readJson(path.posix.join('data/reps', f));
    bioSources[rec.bioSource || '(none)'] = (bioSources[rec.bioSource || '(none)'] || 0) + 1;
}

// Seats vs profiles. The database holds MORE profiles than there are seats, and
// the reason is visible in the data itself: some seats carry two profiles.
// Derived rather than asserted, so the trust pages never have to cite an outside
// authority for the size of Congress.
const houseSeats = {};
for (const m of members) {
    if (m.role !== 'Representative') continue;
    const key = m.state + '-' + (m.district === null || m.district === undefined ? 'at-large/non-voting' : m.district);
    (houseSeats[key] = houseSeats[key] || []).push(m.name);
}
const numberedDistricts = Object.keys(houseSeats).filter(k => !/at-large\/non-voting$/.test(k)).length;
const nonVotingSeats = Object.keys(houseSeats).filter(k => /at-large\/non-voting$/.test(k));
const sharedHouseSeats = Object.entries(houseSeats).filter(([, v]) => v.length > 1);
const senatorsByState = {};
for (const m of members) if (m.role === 'Senator') (senatorsByState[m.state] = senatorsByState[m.state] || []).push(m.name);
const sharedSenateStates = Object.entries(senatorsByState).filter(([, v]) => v.length > 2);

// Senate roll-call matching: fetch_vote_data.js keys senators on lastName+state
// because the Senate XML omits bio_id. Report the key count and any collision.
const senatorKeys = {};
for (const m of members) {
    if (m.role !== 'Senator') continue;
    const last = String(m.name).split(',')[0].split(' ').pop().toLowerCase().replace(/[^a-z]/g, '');
    const key = last + '-' + m.state;
    (senatorKeys[key] = senatorKeys[key] || []).push(m.bioguideId);
}
const senatorCollisions = Object.entries(senatorKeys).filter(([, v]) => v.length > 1);

// The crossover threshold suppresses real crossings. Count how often, and name
// one deterministic example, so the article can quote a figure instead of an
// adjective. NOT a superlative: an earlier version reported a "largest" case
// with a silent first-wins tie-break and there was an exact tie, which made the
// uniqueness claim false. The ordering is stated with the example.
const VOTES_DIR = path.join(ROOT, 'data/votes');
let rollCallEntries = 0, rollCallNoMembers = 0, voiceOrUcEntries = 0, suppressedVotes = 0;
const suppressedRanked = [];
let suppressed = null;
if (fs.existsSync(VOTES_DIR)) {
    for (const f of fs.readdirSync(VOTES_DIR).sort()) {
        if (!f.endsWith('.json')) continue;
        const raw = readJson(path.posix.join('data/votes', f));
        // One file was written as a bare array instead of the {billId,title,votes}
        // envelope every other file uses; reading rec.votes on it silently dropped
        // a real roll call from this count. Tolerate both shapes.
        const rec = Array.isArray(raw) ? { billId: f.replace(/\.json$/, ''), votes: raw } : raw;
        for (const v of (rec.votes || [])) {
            // A voice or UC passage has no yea/nay tally at all; a roll call whose
            // member list was never stored still has one, and is still a roll call.
            const hasTally = Number.isFinite(v.yeas) && Number.isFinite(v.nays) && (v.yeas + v.nays) > 0;
            if (!Array.isArray(v.members) || !v.members.length) {
                if (hasTally) { rollCallEntries++; rollCallNoMembers++; continue; }
                voiceOrUcEntries++; continue;
            }
            rollCallEntries++;
            const total = (v.yeas || 0) + (v.nays || 0);
            if (!total) continue;
            const marginPct = Math.abs(v.yeas - v.nays) / total * 100;
            if (marginPct <= 30) continue;                 // inside the threshold
            if ((v.crossovers || []).length) continue;     // already surfaced
            // Count the members who DID vote against their party's majority.
            const tally = {};
            for (const m of v.members) {
                const p = m.party || 'I';
                const vv = String(m.vote || '').toLowerCase();
                if (!tally[p]) tally[p] = { Yea: 0, Nay: 0 };
                if (vv === 'yea' || vv === 'aye' || vv === 'yes') tally[p].Yea++;
                else if (vv === 'nay' || vv === 'no') tally[p].Nay++;
            }
            const maj = {};
            for (const [p, c] of Object.entries(tally)) maj[p] = c.Yea >= c.Nay ? 'Yea' : 'Nay';
            let crossed = 0;
            for (const m of v.members) {
                const vv = String(m.vote || '').toLowerCase();
                const mv = (vv === 'yea' || vv === 'aye' || vv === 'yes') ? 'Yea' : (vv === 'nay' || vv === 'no') ? 'Nay' : null;
                if (mv && maj[m.party || 'I'] && mv !== maj[m.party || 'I']) crossed++;
            }
            if (!crossed) continue;
            suppressedVotes++;
            suppressedRanked.push({ billId: rec.billId, chamber: v.chamber, date: v.date, question: v.question, result: v.result, yeas: v.yeas, nays: v.nays, marginPct, crossed });
        }
    }
    // Deterministic and stated: most crossers, then widest margin, then bill id.
    suppressedRanked.sort((a, b) => b.crossed - a.crossed || b.marginPct - a.marginPct || a.billId.localeCompare(b.billId));
    suppressed = suppressedRanked[0] || null;
}

// ── Bill corpus ─────────────────────────────────────────────────────────────
const cache = readJson('data/cache.json');
const bills = cache.bills;
if (!bills) die('data/cache.json has no bills map');
const billIds = Object.keys(bills);
const stageCounts = {};
for (const id of billIds) stageCounts[bills[id].stage] = (stageCounts[bills[id].stage] || 0) + 1;

const topLineLens = billIds.map(id => (bills[id].top_lines || []).length);
const tlMin = Math.min(...topLineLens), tlMax = Math.max(...topLineLens);
const tlOver3 = topLineLens.filter(n => n > 3).length;

// Sentence counting is a heuristic, so the method is printed with the number — a
// receipt a reader cannot re-derive is not a receipt. The naive
// "terminator + whitespace" rule was wrong: it split "D.C. Official Code" and
// "U.S. Code" into separate sentences and inflated the count (a hostile pass
// caught it, 2026-08-30). Abbreviations and decimals are masked first.
const ABBREV = /\b(?:U\.S\.C|U\.S|D\.C|Pub\.\s?L|P\.L|Stat|Sec|Secs|No|Nos|Art|Rep|Sen|Reps|Sens|Mr|Mrs|Ms|Dr|Gov|Jr|Sr|St|Fig|Ch|Ed|Inc|Ltd|Co|Corp|approx|e\.g|i\.e|etc|vs|v|al|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|FY)\./gi;
const INITIAL = /\b([A-Z])\./g;   // "William M. (Mac) Thornberry"
const sentences = (s) => String(s || '')
    .replace(ABBREV, (m) => m.replace(/\./g, '\u0001'))          // mask abbreviation dots (case-insensitive: "sec." too)
    .replace(INITIAL, '$1\u0001')                                // mask single-letter initials
    .replace(/(\d)\.(\d)/g, '$1\u0001$2')                      // mask decimals
    .split(/(?<=[.!?])\s+(?=["\u201c(]?[A-Z0-9])/)
    .filter(x => x.trim()).length;
const sumLens = billIds.map(id => sentences(bills[id].summary));
const sMin = Math.min(...sumLens), sMax = Math.max(...sumLens);
const sOver3 = sumLens.filter(n => n > 3).length;

// What version of the text is actually ON DISK for each bill, versus what the
// bill's own versions[] says Congress.gov has posted. The pipeline PREFERS the
// newest applicable version, but an already-cached bill that advances is not
// automatically re-fetched, so intent and reality diverge. Measured because
// what-is-legislationpatch.html and methodology.html both describe what a
// reader is looking at.
const TEXT_RANK = { enrolled: 100, 'public law': 95, 'engrossed amendment': 90, engrossed: 80, reported: 60, 'placed on calendar': 55, referred: 50, introduced: 20 };
// GPO also writes the version as a bare code in a non-bracket header line
// ("HR 5366 ENR: Doug LaMalfa...", "119 HR 7971 IH: Taxpayer..."). Nine stored
// bill-text files use that form; without this map they scored 0 and every bill
// among them looked stale against its own versions[] (caught 2026-08-30).
const TEXT_CODE = {
    enr: 100, pl: 95, pp: 95, eah: 90, eas: 90, eh: 80, es: 80, rh: 60, rs: 60,
    pcs: 55, pch: 55, rfs: 50, rfh: 50, cps: 50, cph: 50, ih: 20, is: 20,
};
function rankOf(label) {
    const l = String(label || '').toLowerCase();
    let best = 0;
    for (const [k, v] of Object.entries(TEXT_RANK)) if (l.includes(k) && v > best) best = v;
    return best;
}
function rankOfCode(head) {
    // The code sits immediately before the colon on the header line.
    const m = String(head || '').match(/\b([A-Za-z]{2,3})\s*:/);
    if (!m) return 0;
    return TEXT_CODE[m[1].toLowerCase()] || 0;
}
function storedTextLabel(id) {
    const f = path.join(ROOT, 'data/bill-text', id + '.txt');
    if (!fs.existsSync(f)) return null;
    const head = fs.readFileSync(f, 'utf8').slice(0, 600);
    // The GPO header opens with "[Congressional Bills 119th Congress]" and only a
    // later bracket names the version, so take the highest-ranking bracket rather
    // than the first (which otherwise scores 0 for every bill).
    const brackets = head.match(/\[[^\]]*\]/g) || [];
    let best = null, bestRank = -1;
    for (const b of brackets) { const r = rankOf(b); if (r > bestRank) { bestRank = r; best = b; } }
    if (best && bestRank > 0) return best;
    if (/public law/i.test(head)) return 'Public Law';
    const firstLine = head.split('\n')[0];
    if (rankOfCode(firstLine) > 0) return firstLine.slice(0, 80);
    return best || firstLine.slice(0, 80);
}
// A stored label is ranked by keyword first, then by the bare GPO code.
function storedRankOf(label) {
    const r = rankOf(label);
    return r > 0 ? r : rankOfCode(label);
}
let signedShowingIntroduced = [], staleAgainstPosted = 0, nonEnactedShowingIntroduced = 0, nonEnactedTotal = 0;
for (const id of billIds) {
    const b = bills[id];
    if (!b || !b.id) continue;
    const stored = storedTextLabel(b.id);
    const storedRank = storedRankOf(stored);
    const postedRank = Math.max(0, ...(b.versions || []).map(v => rankOf(v.type || v.name || v)));
    if (b.stage === 'signed') {
        if (stored && /introduced/i.test(stored)) signedShowingIntroduced.push(b.id);
        continue;
    }
    nonEnactedTotal++;
    if (stored && /introduced/i.test(stored)) nonEnactedShowingIntroduced++;
    if (stored && postedRank > storedRank) staleAgainstPosted++;
}

const skip = readJson('data/analysis-skip.json').skip;
if (!Array.isArray(skip)) die('data/analysis-skip.json has no skip array');
const skipCats = {};
for (const s of skip) skipCats[s.category] = (skipCats[s.category] || 0) + 1;

// ── Quotes ──────────────────────────────────────────────────────────────────
const standalone = readJson('data/quotes.json').quotes;
if (!Array.isArray(standalone)) die('data/quotes.json has no quotes array');
const standaloneGranule = standalone.filter(q => q.granuleId).length;
const standaloneMaxLen = Math.max(...standalone.map(q => (q.text || '').length));

let featuredCount = 0, featuredGranule = 0, featuredDated = 0, featuredMaxLen = 0, billsNoQuotes = 0;
const featuredSources = [];
for (const id of billIds) {
    const fq = bills[id].featured_quotes || [];
    if (!fq.length) billsNoQuotes++;
    for (const q of fq) {
        featuredCount++;
        if (q.granuleId) featuredGranule++;
        if (q.source) { featuredDated++; featuredSources.push(String(q.source)); }
        featuredMaxLen = Math.max(featuredMaxLen, (q.text || '').length);
    }
}
// The two quote stores are separate pipelines, not one field carried through.
// Measured because two live pages described them as if they were the same store.
// NB: `bills` is an ARRAY, so billIds are indices — the map below MUST be keyed
// on bill.id. Keying it on the index silently made every lookup miss and
// reported a false "0 overlap" (caught by a hostile pass, 2026-08-30).
const quoteKey = (t) => String(t || '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')   // smart-quotes-ok: deliberate quote normalisation
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ').trim().toLowerCase();
const fqText = {};
for (const id of billIds) {
    const b = bills[id];
    if (!b || !b.id) continue;
    fqText[b.id] = new Set((b.featured_quotes || []).map(q => quoteKey(q.text)));
}
const standaloneWithBill = standalone.filter(q => q.billId);
const standaloneAlsoOnBillPage = standaloneWithBill.filter(q => {
    const set = fqText[q.billId];
    return !!set && set.has(quoteKey(q.text));
}).length;

// Sources registered for tracker both-sides sections, by kind. how-we-source-quotes
// promised sitewide that no press release is ever quoted; the tracker lane cites
// organisation and member statements from their own published pages, which is a
// different content type with its own gate (tracker-gate.js).
const refSources = readJson('data/ref-sources.json');
const orgKinds = {};
for (const e of Object.values(refSources)) if (e && e.kind) orgKinds[e.kind] = (orgKinds[e.kind] || 0) + 1;

const sessionFieldCount =
    standalone.filter(q => q.session !== undefined).length +
    billIds.reduce((n, id) => n + (bills[id].featured_quotes || []).filter(q => q.session !== undefined).length, 0);

// ── validate-batch.js: which checks actually block ───────────────────────────
// Parsed from the script itself so the number cannot drift from the code.
const vbLines = readText('scripts/validate-batch.js').split(/\r?\n/);
const vbSections = [];
let cur = null;
for (const line of vbLines) {
    const m = line.match(/^\s*section\('([^']+)'\)/);
    if (m) { cur = { name: m[1], fail: 0, warn: 0 }; vbSections.push(cur); }
    if (!cur) continue;
    if (/(^|[^A-Za-z])fail\(/.test(line)) cur.fail++;
    if (/(^|[^A-Za-z])warn\(/.test(line)) cur.warn++;
}
const vbBlocking = vbSections.filter(s => s.fail > 0);
const vbWarnOnly = vbSections.filter(s => s.fail === 0);
const figureSection = vbSections.find(s => /Figure sourcing/.test(s.name));
if (!figureSection) die('validate-batch.js has no "Figure sourcing" section — the parser is stale');

// ── Article audit ledgers ───────────────────────────────────────────────────
const ledgerDir = path.join(ROOT, 'data/qa-ledger');
const articleLedgers = fs.readdirSync(ledgerDir).filter(f => f.startsWith('article-') && f.endsWith('.json'));
// Model FAMILY, not model string: "opus-5 (in-conversation)" and "opus" are the
// same model for the purpose of "a different model audited it". Take the first
// token and drop the version suffix, so opus-5/opus collapse and sonnet/opus do not.
const family = (s) => String(s || '').trim().split(/[\s(]/)[0].toLowerCase().replace(/[^a-z].*$/, '');
let sameModel = 0, diffModel = 0;
const ledgerRows = [];
for (const f of articleLedgers.sort()) {
    const l = readJson(path.posix.join('data/qa-ledger', f));
    const same = !!l.drafterModel && !!l.auditModel && family(l.drafterModel) === family(l.auditModel);
    if (same) sameModel++; else diffModel++;
    ledgerRows.push(`${l.slug || f} | drafter: ${l.drafterModel || '(none)'} | auditor: ${l.auditModel || '(none)'} | verify: ${l.verifyModel || '(none)'} | ${same ? 'SAME MODEL' : 'different model'}`);
}
const billLedgers = fs.readdirSync(ledgerDir).filter(f => f.endsWith('.json') && !f.startsWith('article-') && !f.startsWith('_'));
let billDrafterRecorded = 0;
for (const f of billLedgers) if (readJson(path.posix.join('data/qa-ledger', f)).drafterModel) billDrafterRecorded++;

// ── Source-of-record for bill text + the excerpt cap ────────────────────────
const fetchBills = readText('scripts/fetch_bills_data.js');
const govinfoHits = (fetchBills.match(/govinfo/gi) || []).length;
const congressApiHits = (fetchBills.match(/api\.congress\.gov/g) || []).length;
const excerptCap = (readText('scripts/fetch_bill_cr.js').match(/function bestExcerpt\(text, maxLen = (\d+)\)/) || [])[1];
if (!excerptCap) die('could not read the excerpt cap out of fetch_bill_cr.js');
const billTextLabel = (readText('bill.js').match(/<div class="bill-text-label">([^<]+)<\/div>/) || [])[1];
if (!billTextLabel) die('could not read the bill-text label out of bill.js');
const crossoverMargin = (readText('scripts/fetch_vote_data.js').match(/Math\.abs\(yeas - nays\) \/ total > ([\d.]+)/) || [])[1];
if (!crossoverMargin) die('could not read the crossover margin out of fetch_vote_data.js');

// ── Sheet ───────────────────────────────────────────────────────────────────
const L = [];
L.push('LegislationPatch site-facts sheet — the countable claims the self-descriptive pages make');
L.push('Source: this repository, generated by scripts/generate-site-facts.js. Every number is derived,');
L.push('none is typed. Re-derive with `node scripts/generate-site-facts.js --check`.');
L.push('');
L.push('## Member database (data/reps-index.json, data/reps/)');
L.push(`Member profiles: ${members.length}`);
L.push(`Member profiles by role: ${Object.entries(byRole).sort().map(([k, v]) => `${v} ${k}`).join(', ')}`);
L.push(`Per-member record files in data/reps/: ${repFiles.length}`);
L.push(`Fields stored on a member record: ${repFields.join(', ')}`);
L.push('No member record carries a term field: there is no term start date, term end date, term number, or years-served field in the schema.');
L.push(`Biography source recorded on member records: ${Object.entries(bioSources).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ')}`);
L.push(`Distinct House seats represented (state + district): ${Object.keys(houseSeats).length}; ${numberedDistricts} carry a district number and ${nonVotingSeats.length} do not (at-large states and non-voting delegations are both stored with district null).`);
L.push(`House seats held by more than one person during the 119th Congress: ${sharedHouseSeats.length}`);
for (const [seat, names] of sharedHouseSeats.sort()) L.push(`  ${seat}: ${names.sort().join(' / ')}`);
L.push(`States holding more than two senator profiles: ${sharedSenateStates.length}`);
for (const [st, names] of sharedSenateStates.sort()) L.push(`  ${st}: ${names.sort().join(' / ')}`);
L.push(`Senate roll-call match keys (lastName + state) in use: ${Object.keys(senatorKeys).length}`);
L.push(`Senate roll-call match key collisions: ${senatorCollisions.length}${senatorCollisions.length ? ' — ' + senatorCollisions.map(([k, v]) => `${k} (${v.join(', ')})`).join('; ') : ''}`);
L.push('');
L.push('## Bill corpus (data/cache.json, data/analysis-skip.json)');
L.push(`Analyzed bills in the database: ${billIds.length}`);
L.push(`Bills by stage: ${Object.entries(stageCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ')}`);
L.push(`Bills signed into law (stage signed), and so eligible to show enrolled text: ${stageCounts.signed || 0} of ${billIds.length}`);
L.push(`Bill-text panel label rendered by bill.js: "${billTextLabel}"`);
L.push(`Enacted bills whose stored text is still the version as introduced: ${signedShowingIntroduced.length}${signedShowingIntroduced.length ? ' (' + signedShowingIntroduced.join(', ') + ')' : ''}`);
L.push(`Non-enacted bills: ${nonEnactedTotal}; of those, ${nonEnactedShowingIntroduced} show the text as introduced.`);
L.push(`Bills whose stored text is OLDER than the newest version their own versions[] lists as posted: ${staleAgainstPosted} of ${nonEnactedTotal} non-enacted bills. The pipeline prefers the newest applicable version at fetch time, but an already-cached bill that advances is not automatically re-fetched.`);
L.push(`Top-line change counts per bill: range ${tlMin} to ${tlMax}; ${tlOver3} of ${billIds.length} bills carry more than three.`);
L.push(`Plain-English summary length per bill: range ${sMin} to ${sMax} sentences; ${sOver3} of ${billIds.length} bills run to more than three. (Sentence count = split on a terminator followed by whitespace and a capital, after masking common abbreviations case-insensitively such as U.S., D.C., Pub. L. and sec., plus single-letter initials and decimal numbers.)`);
L.push(`Bills deliberately excluded from analysis in data/analysis-skip.json: ${skip.length}`);
L.push(`Excluded bills by category: ${Object.entries(skipCats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ')}`);
L.push('The cra-disapproval category covers resolutions of disapproval, which reach the floor by design; they are excluded from analysis, so coverage is not "all legislation with floor action".');
L.push('');
L.push('## Congressional Record quotes (data/quotes.json, data/cache.json featured_quotes)');
L.push(`Standalone floor quotes stored in data/quotes.json: ${standalone.length}`);
L.push(`Standalone floor quotes carrying a granuleId: ${standaloneGranule} of ${standalone.length}`);
L.push(`Bill-attached quotes stored in cache.json featured_quotes: ${featuredCount} across ${billIds.length} bills`);
L.push(`Bill-attached quotes carrying a granuleId: ${featuredGranule} of ${featuredCount}`);
L.push(`Bill-attached quotes carrying a stored source string at all: ${featuredDated} of ${featuredCount}; the stored values are ${[...new Set(featuredSources)].sort().map(v => `"${v}"`).join(', ') || '(none)'} \u2014 a chamber label with no date.`);
L.push(`Quote records carrying a session field, in either store: ${sessionFieldCount}`);
L.push(`Bills with no Congressional Record quote at all: ${billsNoQuotes} of ${billIds.length}`);
L.push(`Standalone floor quotes carrying a billId: ${standaloneWithBill.length} of ${standalone.length}; carrying none: ${standalone.length - standaloneWithBill.length}`);
L.push(`Standalone floor quotes whose text also appears in that same bill's featured_quotes (case/punctuation-normalized): ${standaloneAlsoOnBillPage} of ${standaloneWithBill.length}. The two stores are built by separate extractors and mostly do not overlap.`);
L.push(`Sources registered in data/ref-sources.json by kind: ${Object.entries(orgKinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ')}`);
L.push(`Excerpt cap enforced by fetch_bill_cr.js bestExcerpt(): ${excerptCap} characters`);
L.push(`Longest stored quote, standalone store: ${standaloneMaxLen} characters; bill-attached store: ${featuredMaxLen} characters`);
L.push('');
L.push('## Validation gates (scripts/validate-batch.js)');
L.push(`Check sections in validate-batch.js: ${vbSections.length}`);
L.push(`Sections that can block a release (call fail()): ${vbBlocking.length}`);
L.push(`Sections that only warn: ${vbWarnOnly.length}`);
L.push(`Blocking sections: ${vbBlocking.map(s => s.name).join('; ')}`);
L.push(`Warn-only sections: ${vbWarnOnly.map(s => s.name).join('; ')}`);
L.push(`The figure-sourcing guard is warn-only: the "${figureSection.name}" section calls warn() ${figureSection.warn} time(s) and fail() ${figureSection.fail} time(s); it blocks only under the opt-in --strict flag.`);
L.push('');
L.push('## Bill-text source of record (scripts/fetch_bills_data.js)');
L.push(`References to govinfo in fetch_bills_data.js: ${govinfoHits}`);
L.push(`References to api.congress.gov in fetch_bills_data.js: ${congressApiHits}`);
L.push('Primary bill text is fetched from the Congress.gov API, not from GovInfo. GovInfo is the source for Congressional Record granules (fetch_cr_data.js) and for statutes and manuals (fetch-reference.js).');
L.push('');
L.push('## Vote data (scripts/fetch_vote_data.js)');
L.push(`Crossover votes are surfaced only when the yea-nay margin is within ${Math.round(parseFloat(crossoverMargin) * 100)}% of total yeas plus nays.`);
L.push('');
L.push('## Stored vote records (data/votes/)');
L.push(`Recorded roll-call entries: ${rollCallEntries}, of which ${rollCallEntries - rollCallNoMembers} store the full member list and ${rollCallNoMembers} store only the tally. Voice-vote or unanimous-consent entries, with no tally at all: ${voiceOrUcEntries}.`);
L.push(`Roll calls where the margin exceeded the 30% threshold and members nonetheless voted against their party majority, so no crossovers were surfaced: ${suppressedVotes} (measured over the ${rollCallEntries - rollCallNoMembers} roll calls that store a member list).`);
if (suppressed) {
    L.push(`One such roll call (ordered by crosser count, then margin, then bill id — not a unique maximum; ${suppressedRanked.filter(r => r.crossed === suppressed.crossed).length} roll call(s) tie on crosser count): ${suppressed.billId}, ${suppressed.chamber} ${suppressed.date}, "${suppressed.question}" ${suppressed.result} ${suppressed.yeas}-${suppressed.nays} — margin ${suppressed.marginPct.toFixed(1)}% of yeas plus nays, ${suppressed.crossed} member(s) voted against their party majority, 0 surfaced as crossovers.`);
}
L.push('');
L.push('## Audit ledgers (data/qa-ledger/)');
L.push(`Article claim ledgers: ${articleLedgers.length}`);
L.push(`Article ledgers whose recorded auditing model is the same model that drafted the article: ${sameModel} of ${articleLedgers.length}`);
L.push(`Article ledgers whose recorded auditing model differs from the drafting model: ${diffModel} of ${articleLedgers.length}`);
for (const row of ledgerRows) L.push('  ' + row);
L.push(`Bill claim ledgers: ${billLedgers.length}`);
L.push(`Bill ledgers recording a drafting model at all: ${billDrafterRecorded} of ${billLedgers.length}`);
L.push('No bill ledger records a drafting model, so no bill ledger records that a different model audited what drafted it.');
L.push('');

const sheet = L.join('\n') + '\n';

if (CHECK) {
    if (!fs.existsSync(OUT)) die(`${path.relative(ROOT, OUT)} does not exist — run with --apply`);
    const onDisk = fs.readFileSync(OUT, 'utf8');
    if (onDisk !== sheet) {
        console.error('  ❌ data/ref-text/record-lp-site-facts.txt is stale — re-run with --apply and re-audit the pages that cite it.');
        const a = onDisk.split('\n'), b = sheet.split('\n');
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i] !== b[i]) console.error(`    line ${i + 1}\n      on disk: ${a[i] === undefined ? '(none)' : a[i]}\n      derived: ${b[i] === undefined ? '(none)' : b[i]}`);
        }
        process.exit(1);
    }
    console.log('  ✅ site-facts sheet matches the repository.');
    process.exit(0);
}

if (!APPLY) {
    process.stdout.write(sheet);
    console.log('\n  (dry run — add --apply to write data/ref-text/record-lp-site-facts.txt)\n');
    process.exit(0);
}

fs.writeFileSync(OUT, sheet, 'utf8');
const back = fs.readFileSync(OUT, 'utf8');
if (back !== sheet) die('read-back of the site-facts sheet does not match what was written');
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} (${sheet.length} chars, ${L.length} lines)`);
