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

// Sentence counting is a heuristic (terminator + whitespace), so the method is
// printed with the number — a receipt a reader cannot re-derive is not a receipt.
const sentences = (s) => String(s || '').split(/(?<=[.!?])\s+/).filter(x => x.trim()).length;
const sumLens = billIds.map(id => sentences(bills[id].summary));
const sMin = Math.min(...sumLens), sMax = Math.max(...sumLens);
const sOver3 = sumLens.filter(n => n > 3).length;

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
for (const id of billIds) {
    const fq = bills[id].featured_quotes || [];
    if (!fq.length) billsNoQuotes++;
    for (const q of fq) {
        featuredCount++;
        if (q.granuleId) featuredGranule++;
        if (q.source) featuredDated++;
        featuredMaxLen = Math.max(featuredMaxLen, (q.text || '').length);
    }
}
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
L.push(`Senate roll-call match keys (lastName + state) in use: ${Object.keys(senatorKeys).length}`);
L.push(`Senate roll-call match key collisions: ${senatorCollisions.length}${senatorCollisions.length ? ' — ' + senatorCollisions.map(([k, v]) => `${k} (${v.join(', ')})`).join('; ') : ''}`);
L.push('');
L.push('## Bill corpus (data/cache.json, data/analysis-skip.json)');
L.push(`Analyzed bills in the database: ${billIds.length}`);
L.push(`Bills by stage: ${Object.entries(stageCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ')}`);
L.push(`Bills whose displayed text is the enrolled version (stage signed): ${stageCounts.signed || 0} of ${billIds.length}`);
L.push(`Bill-text panel label rendered by bill.js: "${billTextLabel}"`);
L.push(`Top-line change counts per bill: range ${tlMin} to ${tlMax}; ${tlOver3} of ${billIds.length} bills carry more than three.`);
L.push(`Plain-English summary length per bill: range ${sMin} to ${sMax} sentences; ${sOver3} of ${billIds.length} bills run to more than three. (Sentence count = split on a sentence terminator followed by whitespace.)`);
L.push(`Bills deliberately excluded from analysis in data/analysis-skip.json: ${skip.length}`);
L.push(`Excluded bills by category: ${Object.entries(skipCats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(', ')}`);
L.push('The cra-disapproval category covers resolutions of disapproval, which reach the floor by design; they are excluded from analysis, so coverage is not "all legislation with floor action".');
L.push('');
L.push('## Congressional Record quotes (data/quotes.json, data/cache.json featured_quotes)');
L.push(`Standalone floor quotes stored in data/quotes.json: ${standalone.length}`);
L.push(`Standalone floor quotes carrying a granuleId: ${standaloneGranule} of ${standalone.length}`);
L.push(`Bill-attached quotes stored in cache.json featured_quotes: ${featuredCount} across ${billIds.length} bills`);
L.push(`Bill-attached quotes carrying a granuleId: ${featuredGranule} of ${featuredCount}`);
L.push(`Bill-attached quotes carrying a stored source line (chamber + floor date): ${featuredDated} of ${featuredCount}`);
L.push(`Quote records carrying a session field, in either store: ${sessionFieldCount}`);
L.push(`Bills with no Congressional Record quote at all: ${billsNoQuotes} of ${billIds.length}`);
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
