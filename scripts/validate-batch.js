// validate-batch.js
// Pre-push validation — checks that all batch processing is complete and correct.
// Run standalone: node scripts/validate-batch.js   (--strict: warnings block too)
// Called automatically by run-batch.js at the end of each pipeline run.
//
// Checks (ERROR blocks push; WARN is the QA worklist):
//   - unprocessed bills, required fields, bill text files, pages consistency
//   - billSection anchors, section label format, sourcing integrity
//   - dollar formatting: raw statutory amounts (ERROR) and spelled-out
//     "$X billion/million" magnitudes (WARN — always shorten to $X.XXB/$XM)
//   - vote data presence
//   - stage ↔ vote consistency (ERROR): stage claiming chamber passage while
//     that chamber's latest passage-type vote failed (the HCONRES-40 class)
//   - stage ↔ prose consistency (WARN): stale status narration in likelihoodReason
//   - analysis freshness (WARN): stageDate newer than analyzedAt — bill moved
//     after the analysis prose was last reviewed
//   - figure sourcing (training-data guard), referenced sources, acronyms,
//     quote quality/attribution, ISO dates, omnibus structure, sitemap
//
// Warnings individually verified against source can be adjudicated with evidence
// in data/qa-adjudications.json (exact-match keyed — edits re-open the warning).

const fs   = require('fs');
const path = require('path');
const { PASSAGE_CONTEXT, SMART_QUOTES } = require('./lib/patterns.js');
const { attributionFlags } = require('./lib/attribution.js');

const DATA         = path.join(__dirname, '../data');
const BILL_TEXT    = path.join(DATA, 'bill-text');
const SITEMAP_FILE = path.join(__dirname, '../sitemap.xml');

// ── Load data ──────────────────────────────────────────────────────────────

const cache  = JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8'));
const bills  = cache.bills || [];

let rawBills = [];
try { rawBills = JSON.parse(fs.readFileSync(path.join(DATA, 'bills_raw.json'), 'utf8')); }
catch (e) {}

let quotes = { processedDates: [] };
try { quotes = JSON.parse(fs.readFileSync(path.join(DATA, 'quotes.json'), 'utf8')); }
catch (e) {}

let crRaw = [];
try { crRaw = JSON.parse(fs.readFileSync(path.join(DATA, 'cr_raw.json'), 'utf8')); }
catch (e) {}

// --strict: treat warnings as blocking too (used by the QA loop to detect a
// truly "perfect" pass — 0 errors AND 0 warnings).
const STRICT = process.argv.includes('--strict');

let ACRONYMS = {};
try { ACRONYMS = require('../acronyms.js').ACRONYMS || {}; } catch (e) {}

// data/analysis-quarantine.json — bills pulled OUT of cache by the quarantine
// engine because their analysis failed a content check. Like skip-listed bills,
// a quarantined id is "not in cache but not an error" — it is held for fix, not
// missing. Kept separate from analysis-skip.json (deliberate non-analysis).
let QUARANTINED = new Set();
try {
    for (const q of JSON.parse(fs.readFileSync(path.join(__dirname, '../data/analysis-quarantine.json'), 'utf8')).quarantined || [])
        QUARANTINED.add(q.id);
} catch { /* no quarantine file */ }

// ── Shared helpers ─────────────────────────────────────────────────────────

function billText(id) {
    try { return fs.readFileSync(path.join(BILL_TEXT, `${id}.txt`), 'utf8'); }
    catch { return ''; }
}

const digitsOnly = s => String(s).replace(/[,\s]/g, '');

// Concatenate the prose fields that describe the BILL'S OWN CONTENT (so figures
// in them must be sourced from the bill text). Deliberately excludes criticisms
// and likelihoodReason — those cite outside context (vote counts, dates, politics).
function contentProse(bill) {
    const out = [];
    const walk = (obj) => {
        if (typeof obj === 'string') out.push(obj);
        else if (Array.isArray(obj)) obj.forEach(walk);
        else if (obj && typeof obj === 'object') {
            const SKIP = new Set(['billSection', 'why_unreported']);
            for (const [k, v] of Object.entries(obj)) if (!SKIP.has(k)) walk(v);
        }
    };
    ['summary', 'brief', 'top_lines', 'sections', 'underreported', 'gaps', 'changes', 'divisions']
        .forEach(f => walk(bill[f]));
    return out.join('  ');
}

// ── Cross-referenced-source helpers (figure sourcing) ───────────────────────
// A bill may carry referencedSources: fetched referenced bills/laws/statutes,
// each with a stored textFile under data/ref-text/. Analysis items that draw a
// figure from one tag it with "source": "<id>" (string or array). The guard then
// verifies that figure against the recorded source — provenance is required, and
// nothing clears on "it's cross-referenced" alone. See CLAUDE.md
// "Cross-Bill / Referenced-Source Practice".

const asArray = v => Array.isArray(v) ? v.map(String) : (v ? [String(v)] : []);

// Map referencedSources id -> lowercased stored text ('' if file missing).
function refTexts(bill) {
    const m = new Map();
    for (const s of bill.referencedSources || []) {
        let t = '';
        try { t = fs.readFileSync(path.join(__dirname, '..', s.textFile || ''), 'utf8'); } catch {}
        m.set(s.id, t.toLowerCase());
    }
    return m;
}

// Every "source" tag value used anywhere in the analysis (to validate it resolves).
function collectSourceTags(bill) {
    const tags = new Set();
    const walk = (o) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === 'object') {
            if (o.source) asArray(o.source).forEach(t => tags.add(t));
            for (const v of Object.values(o)) walk(v);
        }
    };
    ['top_lines', 'sections', 'changes', 'underreported', 'gaps', 'divisions'].forEach(f => walk(bill[f]));
    return tags;
}

// Prose units paired with the referenced-source ids that back them. [] sourceIds
// = must be sourced from the CURRENT bill text only. Synthesis fields
// (summary/brief/underreported/gaps) may draw on any recorded source.
function proseUnits(bill) {
    const units = [];
    const allIds = (bill.referencedSources || []).map(s => s.id);
    const push = (text, ids) => { if (text) units.push({ text, sourceIds: ids }); };

    const synth = [bill.summary, bill.brief,
                   ...(bill.underreported || []), ...(bill.gaps || [])]
        .map(x => typeof x === 'string' ? x : (x && (x.summary || x.why || x.text || x.description)) || '')
        .filter(Boolean).join('  ');
    push(synth, allIds);

    const tlUnit = tl => push(
        [tl.headline, ...((tl.subs || []).map(s => typeof s === 'string' ? s : s && s.text))].filter(Boolean).join('  '),
        asArray(tl.source));
    const secUnits = sec => {
        const secSrc = asArray(sec.source);
        for (const it of sec.items || [])
            push([it.main, it.detail, it.label, it.text].filter(Boolean).join('  '),
                 asArray(it.source).length ? asArray(it.source) : secSrc);
    };
    (bill.top_lines || []).forEach(tlUnit);
    (bill.sections || []).forEach(secUnits);
    const ch = bill.changes || {};
    for (const list of [ch.added || [], ch.modified || [], ch.removed || []])
        for (const it of list)
            push(typeof it === 'string' ? it : (it.description || it.text || ''),
                 typeof it === 'object' ? asArray(it.source) : []);
    for (const d of bill.divisions || []) {
        (d.top_lines || []).forEach(tlUnit);
        (d.sections || []).forEach(secUnits);
    }
    return units;
}

// ── Reporting ──────────────────────────────────────────────────────────────

let errors = 0, warnings = 0;

// Structured capture so a caller (the quarantine engine) can tell WHICH bill each
// error belongs to. --json <path> dumps { errorList, warnList } at the end; a
// null billId means the error is not attributable to one bill (structural — e.g.
// a JS-source curly quote) and therefore is NOT quarantinable.
let currentSection = '';
const errorList = [], warnList = [];
const BILL_ID_RE = /\b(\d{2,3}-[A-Z]+-\d+)\b/;
const extractBillId = msg => { const m = String(msg).match(BILL_ID_RE); return m ? m[1] : null; };

function pass(msg)  { console.log(`  ✅ ${msg}`); }
function warn(msg)  { console.log(`  ⚠️  ${msg}`); warnings++; warnList.push({ message: String(msg), billId: extractBillId(msg), check: currentSection }); }
function fail(msg)  { console.log(`  ❌ ${msg}`); errors++;   errorList.push({ message: String(msg), billId: extractBillId(msg), check: currentSection }); }
function section(label) { console.log(`\n── ${label}`); currentSection = label; }

// Adjudication ledger (data/qa-adjudications.json): warnings a QA pass has
// individually verified against source. A matching entry downgrades the warning
// to an informational note. Keys are exact, so any change to the underlying
// content re-opens the warning for fresh adjudication.
let ADJUDICATIONS = [];
try {
    ADJUDICATIONS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'qa-adjudications.json'), 'utf8')).validateBatch || [];
} catch { /* no ledger */ }
function adjudication(billId, check, key) {
    return ADJUDICATIONS.find(a => a.billId === billId && a.check === check && a.key === key);
}
function noteAdjudicated(msg, a) { console.log(`  ◦  ${msg} — adjudicated ${a.verifiedAt}: ${a.reason}`); }

// ── Check: unprocessed bills ───────────────────────────────────────────────

section('Unprocessed bills');
{
    // data/analysis-skip.json — bills DELIBERATELY not analyzed (ceremonial,
    // CRA disapprovals, procedural housekeeping, deferred minor land/naming
    // bills). Skip-listed ids downgrade from ERROR to an informational note so
    // the pre-commit hook can pass; anything unlisted still blocks. Remove an
    // entry from the file to put that bill back on the must-analyze list.
    let SKIP = new Map();
    try {
        for (const s of JSON.parse(fs.readFileSync(path.join(DATA, 'analysis-skip.json'), 'utf8')).skip || [])
            SKIP.set(s.id, s.category || 'unspecified');
    } catch { /* no skip list */ }

    const cachedIds   = new Set(bills.map(b => b.id));
    const unprocessed = rawBills.filter(b => !cachedIds.has(b.billId));
    const skipped     = unprocessed.filter(b => SKIP.has(b.billId));
    const quarantined = unprocessed.filter(b => !SKIP.has(b.billId) && QUARANTINED.has(b.billId));
    const blocking    = unprocessed.filter(b => !SKIP.has(b.billId) && !QUARANTINED.has(b.billId));

    blocking.forEach(b => fail(`Not yet analyzed: ${b.billId} — ${b.title}`));
    if (skipped.length) {
        const byCat = {};
        skipped.forEach(b => { const c = SKIP.get(b.billId); byCat[c] = (byCat[c] || 0) + 1; });
        console.log(`  ◦  ${skipped.length} deliberately-skipped bill(s) — ${Object.entries(byCat).map(([c, n]) => `${n} ${c}`).join(', ')} (data/analysis-skip.json)`);
    }
    if (quarantined.length) {
        console.log(`  ◦  ${quarantined.length} quarantined bill(s) held for fix (data/analysis-quarantine.json)`);
    }
    if (blocking.length === 0) pass(skipped.length ? 'All non-skip-listed fetched bills have been analyzed' : 'All fetched bills have been analyzed');
}

// ── Check: required fields ─────────────────────────────────────────────────

section('Required fields');
{
    const REQUIRED = ['summary', 'brief', 'top_lines', 'sections', 'changes', 'stageDate', 'date', 'stage', 'likelihood'];
    let allOk = true;
    for (const bill of bills) {
        const missing = REQUIRED.filter(f => {
            const v = bill[f];
            return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
        });
        if (missing.length) { fail(`${bill.id}: missing ${missing.join(', ')}`); allOk = false; }
    }
    if (allOk) pass('All bills have required fields');
}

// ── Check: bill text files ─────────────────────────────────────────────────

section('Bill text files');
{
    let allOk = true;
    for (const bill of bills) {
        const file = path.join(BILL_TEXT, `${bill.id}.txt`);
        if (!fs.existsSync(file)) {
            fail(`Missing: data/bill-text/${bill.id}.txt`);
            allOk = false;
        } else {
            const size = fs.statSync(file).size;
            if (size < 500) { warn(`${bill.id}.txt is suspiciously small (${size} bytes)`); }
        }
    }
    if (allOk) pass('All bills have text files');
}

// ── Check: billSection on top_lines ───────────────────────────────────────

section('billSection fields on top_lines');
{
    // Resolving-clause bill types have no section anchors — skip them
    const NO_ANCHOR_TYPES = new Set(['HJRES', 'HCONRES', 'SCONRES', 'SRES', 'HRES']);
    let missing = 0;
    for (const bill of bills) {
        const type = bill.id.split('-')[1];
        if (NO_ANCHOR_TYPES.has(type)) continue;
        for (const tl of (bill.top_lines || [])) {
            if (typeof tl === 'object' && !tl.billSection) {
                warn(`${bill.id}: top_line "${(tl.headline || '').slice(0, 45)}" missing billSection`);
                missing++;
            }
        }
    }
    if (missing === 0) pass('All top_lines have billSection fields');
}

// ── Check: section label format ────────────────────────────────────────────

section('Section label format');
{
    // Resolution types have no section anchors in their texts (same rationale as
    // the top_lines NO_ANCHOR_TYPES exemption) — a label that cannot link is fine.
    const NO_ANCHOR = new Set(['HJRES', 'HCONRES', 'SCONRES', 'SRES', 'HRES', 'SJRES']);
    let issues = 0;
    for (const bill of bills) {
        if (NO_ANCHOR.has(bill.id.split('-')[1])) continue;
        for (const sec of (bill.sections || [])) {
            if (sec.billSection) continue;
            const label = sec.label || '';
            const autoOk =
                /^Sections?\s+\d/i.test(label) ||
                /^Title\s+[IVXLC]/i.test(label) ||
                /^Division\s+[A-Z0-9]+\b/i.test(label) || // bt-div anchors exist since 2026-07-06
                /^resolving/i.test(label);
            if (!autoOk && label.length > 0) {
                {
                    const a = adjudication(bill.id, 'section-label', label.slice(0, 55));
                    if (a) noteAdjudicated(`${bill.id}: section label won't auto-link: "${label.slice(0, 55)}"`, a);
                    else warn(`${bill.id}: section label won't auto-link: "${label.slice(0, 55)}"`);
                }
                issues++;
            }
        }
    }
    if (issues === 0) pass('All section labels auto-parse or have explicit billSection');
}

// ── Check: smart-quote character safety ────────────────────────────────────
// Curly quotes (U+2018/2019/201C/201D) silently corrupt anchor ids (billSection
// → bt-sec-N links) and JS template literals — the known Edit-tool corruption
// class (see CLAUDE.md "Watch out" under Bill Text Section Linking). Prose
// fields legitimately contain typographic quotes (CR quote text) and are NOT
// checked; this guards structural fields and JS source files only.

section('Smart-quote character safety');
{
    let bad = 0;

    // billSection values become HTML anchor ids — ANY non-ASCII (curly quote,
    // en-dash "title–II", NBSP…) silently breaks the anchor, not just curly quotes.
    const NON_ASCII = /[^\x20-\x7E]/;
    const checkBillSection = (billId, where, o) => {
        if (o && typeof o === 'object' && typeof o.billSection === 'string' && NON_ASCII.test(o.billSection)) {
            fail(`${billId}${where}: billSection contains non-ASCII character(s): "${o.billSection}" — anchors break; use plain ASCII (digits or title-II form)`);
            bad++;
        }
    };
    for (const bill of bills) {
        (bill.top_lines || []).forEach(o => checkBillSection(bill.id, '', o));
        (bill.sections || []).forEach(o => checkBillSection(bill.id, '', o));
        for (const d of bill.divisions || []) {
            (d.top_lines || []).forEach(o => checkBillSection(bill.id, ` div ${d.divisionKey}`, o));
            (d.sections || []).forEach(o => checkBillSection(bill.id, ` div ${d.divisionKey}`, o));
        }
        for (const sec of [...(bill.sections || []), ...(bill.divisions || []).flatMap(d => d.sections || [])]) {
            if (sec.label && SMART_QUOTES.test(sec.label)) {
                warn(`${bill.id}: section label contains curly quotes: "${sec.label.slice(0, 55)}" — normalize to ASCII`);
            }
        }
    }

    // JS source files: no curly quote belongs in any tracked .js file — inside a
    // template literal it breaks HTML attribute ids without any parse error.
    // (scripts/archive/ is legacy and deliberately skipped.)
    const jsDirs = [path.join(__dirname, '..'), __dirname, path.join(__dirname, 'lib')];
    const jsFiles = jsDirs.flatMap(dir => {
        try { return fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)); }
        catch { return []; }
    });
    for (const file of jsFiles) {
        if (path.basename(file) === 'patterns.js') continue; // defines the pattern itself
        const src = fs.readFileSync(file, 'utf8');
        if (!SMART_QUOTES.test(src)) continue;
        src.split('\n').forEach((l, i) => {
            if (l.includes('smart-quotes-ok')) return; // explicit opt-out for code that PROCESSES typographic quotes
            if (SMART_QUOTES.test(l)) {
                fail(`${path.relative(path.join(__dirname, '..'), file)}:${i + 1}: curly quote in JS source — Edit-tool corruption class; replace with ASCII`);
                bad++;
            }
        });
    }
    if (bad === 0) pass('No curly quotes in billSection fields or JS source files');
}

// ── Check: pages field vs actual bill text file ────────────────────────────
//
// All analyses MUST be sourced from the actual bill text fetched from Congress.gov.
// Training knowledge is not a valid source — it cannot be verified and may be wrong.
//
// Rules enforced here:
//  1. If data/bill-text/{id}.txt exists and is non-trivial (>500 bytes), pages must be > 0.
//     pages:0 with a real text file means the analysis was written without reading the text.
//  2. The pages value should be roughly proportional to the file size (~2200 chars/page).
//     A large mismatch (e.g. pages:0 while the file is 100K bytes) is a hard error.

section('Bill text sourcing integrity');
{
    let allOk = true;
    bills.forEach(b => {
        if (!b.analyzed) return;
        const txtFile = path.join(BILL_TEXT, `${b.id}.txt`);
        if (!fs.existsSync(txtFile)) return; // missing file caught by earlier check

        const fileBytes = fs.statSync(txtFile).size;
        if (fileBytes < 500) return; // trivially short — pages:0 is fine

        if (!(b.pages > 0)) { // catches 0, null, and missing alike
            fail(`${b.id}: pages:${b.pages} but data/bill-text/${b.id}.txt exists (${Math.round(fileBytes/1000)}K bytes) — analysis was written without reading the bill text. Re-fetch and reanalyze.`);
            allOk = false;
            return;
        }

        // Sanity-check pages is in the right ballpark (1 page ≈ 2200 chars)
        const estPages = Math.round(fileBytes / 2200);
        if (b.pages > 0 && estPages > 0 && b.pages < Math.round(estPages * 0.1)) {
            warn(`${b.id}: pages:${b.pages} but text file suggests ~${estPages} pages — pages field may be stale`);
        }
    });
    if (allOk) pass('All analyzed bills have pages field consistent with text file');
}

// ── Check: raw dollar amounts ──────────────────────────────────────────────

section('Dollar amount formatting');
{
    const RAW_DOLLAR = /\$\d{1,3}(?:,\d{3}){2,}/;
    // Spelled-out magnitudes ("$26.4 billion") are the training-data smell the
    // dollar rules ban — always shorten to $26.37B / $584.3M. Trillions are not
    // covered by the shortening rule and are left alone.
    const SPELLED_DOLLAR = /\$\d[\d,.]*\s?[bm]illion\b/i;
    let found = 0, spelled = 0;

    function walkForDollars(obj, path, billId) {
        if (typeof obj === 'string') {
            if (RAW_DOLLAR.test(obj)) {
                fail(`${billId} ${path}: contains raw dollar amount`);
                found++;
            }
            const sm = obj.match(SPELLED_DOLLAR);
            if (sm) {
                const a = adjudication(billId, 'dollar-format', path);
                if (a) {
                    noteAdjudicated(`${billId} ${path}: spelled-out "${sm[0]}"`, a);
                } else {
                    warn(`${billId} ${path}: spelled-out "${sm[0]}" — shorten to $X.XXB/$XM form (CLAUDE.md dollar rules)`);
                    spelled++;
                }
            }
        } else if (Array.isArray(obj)) {
            obj.forEach((v, i) => walkForDollars(v, `${path}[${i}]`, billId));
        } else if (obj && typeof obj === 'object') {
            // Skip fields that legitimately hold raw numbers (likelihoodReason cites real statutes, votes hold integers)
            const SKIP_KEYS = new Set(['votes', 'likelihood', 'currentStep', 'cosponsors', 'pages', 'charCount', 'bioguideId']);
            for (const [k, v] of Object.entries(obj)) {
                if (!SKIP_KEYS.has(k)) walkForDollars(v, `${path}.${k}`, billId);
            }
        }
    }

    for (const bill of bills) {
        walkForDollars(bill.summary,      'summary',      bill.id);
        walkForDollars(bill.brief,        'brief',        bill.id);
        walkForDollars(bill.top_lines,    'top_lines',    bill.id);
        walkForDollars(bill.sections,     'sections',     bill.id);
        walkForDollars(bill.underreported,'underreported',bill.id);
        walkForDollars(bill.criticisms,   'criticisms',   bill.id);
        walkForDollars(bill.gaps,         'gaps',         bill.id);
        walkForDollars(bill.changes,      'changes',      bill.id);
        walkForDollars(bill.divisions,    'divisions',    bill.id);
    }
    if (found === 0) pass('No raw dollar amounts found');
    if (spelled === 0) pass('No spelled-out dollar magnitudes found');
}

// ── Check: vote data ───────────────────────────────────────────────────────

section('Vote data');
{
    const NEEDS_VOTES = new Set(['house', 'senate', 'signed']);
    let missing = 0;
    for (const bill of bills) {
        if (!NEEDS_VOTES.has(bill.stage)) continue;
        if (!bill.votes || bill.votes.length === 0) {
            const a = adjudication(bill.id, 'vote-data', 'no-votes');
            if (a) noteAdjudicated(`${bill.id}: no votes (stage: ${bill.stage})`, a);
            else { warn(`${bill.id}: no votes (stage: ${bill.stage}) — voice vote or fetch returned nothing`); missing++; }
        }
    }
    if (missing === 0) pass('All passed/signed bills have vote data');
}

// ── Check: stage ↔ vote consistency ───────────────────────────────────────
// Stage/likelihood prose is written once at analysis time; votes[] is refetched
// mechanically afterward — the two drift apart silently (HCONRES-40 was recorded
// "Passed House" while its own roll call said Failed 213-214). A passage-type
// vote decides the measure itself; procedural motions (recommit, commit, table,
// cloture, proceed) say nothing about stage and are ignored.

section('Stage ↔ vote consistency');
{
    const PASSAGE_Q = PASSAGE_CONTEXT; // shared with refresh_stages.js — scripts/lib/patterns.js
    const PASSED = /\b(passed|agreed to)\b/i;
    const FAILED = /\b(failed|rejected)\b/i;
    // Chambers whose passage the stage asserts. Kept minimal (stage 'senate' does
    // not also assert a House check) to avoid false positives on origin-chamber
    // votes the pipeline does not track.
    const STAGE_IMPLIES = { house: ['House'], senate: ['Senate'], signed: ['House', 'Senate'] };
    let bad = 0;

    for (const bill of bills) {
        const latestByChamber = {};
        let latestOverall = null;
        for (const v of bill.votes || []) {
            if (!PASSAGE_Q.test(v.question || '')) continue;
            const ch = v.chamber || 'House';
            if (!latestByChamber[ch] || String(v.date) > String(latestByChamber[ch].date)) latestByChamber[ch] = v;
            if (!latestOverall || String(v.date) > String(latestOverall.date)) latestOverall = v;
        }

        for (const ch of STAGE_IMPLIES[bill.stage] || []) {
            const v = latestByChamber[ch];
            if (v && FAILED.test(v.result || '') && !PASSED.test(v.result || '')) {
                fail(`${bill.id}: stage "${bill.stageLabel || bill.stage}" but latest ${ch} passage vote (${v.date}) is "${v.result}" ${v.yeas != null ? v.yeas + '-' + v.nays : ''} — stage contradicts the vote record`);
                bad++;
            }
        }
        if (bill.stage === 'dead' && latestOverall
            && PASSED.test(latestOverall.result || '') && !FAILED.test(latestOverall.result || '')) {
            warn(`${bill.id}: stage "dead" but the latest passage vote (${latestOverall.chamber} ${latestOverall.date}) is "${latestOverall.result}" — verify how the bill died`);
        }
    }
    if (bad === 0) pass('No stage/vote contradictions');
}

// ── Check: passage corroboration ──────────────────────────────────────────
// A stage asserting chamber passage (house/senate/signed) should be backed by
// hard evidence the bill actually passed: a passing roll-call vote, an
// engrossed/enrolled/law text version on record, or engrossed/enrolled text on
// disk. The trap (HR-1329, 2026-07): "Motion to reconsider laid on the table
// Agreed to" closes out BOTH a passed and a FAILED vote, so detectStage can mark
// a FAILED bill "Passed House". A bill that truly passes a chamber gets engrossed
// — the absence of any passage-grade evidence is the tell, and (unlike the
// Stage↔vote ERROR above) this fires even before votes are fetched. WARN, not
// ERROR: voice-voted bills with no engrossed text posted are legitimate — verify
// and adjudicate those.
section('Passage corroboration');
{
    const ASSERTS_PASSAGE = new Set(['house', 'senate', 'signed']);
    const PASSAGE_VERSION = /engrossed|enrolled|public law|became public law/i;
    const PASSED_RESULT   = /\b(passed|agreed to)\b/i;
    let flagged = 0;
    for (const bill of bills) {
        if (!ASSERTS_PASSAGE.has(bill.stage)) continue;
        const hasPassVote    = (bill.votes || []).some(v => PASSAGE_CONTEXT.test(v.question || '') && PASSED_RESULT.test(v.result || ''));
        const hasPassVersion = (bill.versions || []).some(v => PASSAGE_VERSION.test(v.type || ''));
        let hasPassText = false;
        try { hasPassText = PASSAGE_VERSION.test(fs.readFileSync(path.join(BILL_TEXT, `${bill.id}.txt`), 'utf8').slice(0, 400)); }
        catch { /* missing text file is reported by the "Bill text files" check */ }
        if (hasPassVote || hasPassVersion || hasPassText) continue;
        const a = adjudication(bill.id, 'passage-corroboration', 'no-engrossed');
        if (a) { noteAdjudicated(`${bill.id}: stage "${bill.stageLabel || bill.stage}" without passage-grade evidence`, a); continue; }
        warn(`${bill.id}: stage "${bill.stageLabel || bill.stage}" but no passing vote, engrossed/enrolled version, or engrossed/enrolled text on disk — verify it actually passed (cf. HR-1329: marked Passed House but failed 204-216)`);
        flagged++;
    }
    if (flagged === 0) pass('All passage-stage bills have passage-grade evidence');
}

// ── Check: stage ↔ prose consistency ──────────────────────────────────────
// likelihoodReason narrates status in prose; catch the stale-stage phrasings
// that have actually occurred ("committee-stage bill" after House passage,
// "passed the House" on a bill that never did).

section('Stage ↔ prose consistency');
{
    const AT_LEAST_HOUSE = new Set(['house', 'senate', 'signed']);
    let flagged = 0;

    for (const bill of bills) {
        const r = bill.likelihoodReason || '';
        if (!r) continue;

        if (/committee[-\s]stage/i.test(r) && AT_LEAST_HOUSE.has(bill.stage)) {
            warn(`${bill.id}: likelihoodReason calls this a "committee-stage" bill but stage is "${bill.stageLabel || bill.stage}" — stale prose`);
            flagged++;
        }
        if (/\bpassed the house\b/i.test(r) && ['introduced', 'committee'].includes(bill.stage)) {
            warn(`${bill.id}: likelihoodReason says "passed the House" but stage is "${bill.stageLabel || bill.stage}"`);
            flagged++;
        }
        if (/\bpassed the senate\b/i.test(r) && ['introduced', 'committee'].includes(bill.stage)) {
            warn(`${bill.id}: likelihoodReason says "passed the Senate" but stage is "${bill.stageLabel || bill.stage}"`);
            flagged++;
        }
        if (/\bfailed in the (house|senate)\b/i.test(r) && !['dead', 'vetoed'].includes(bill.stage)) {
            warn(`${bill.id}: likelihoodReason says the bill failed but stage is "${bill.stageLabel || bill.stage}"`);
            flagged++;
        }
    }
    if (flagged === 0) pass('No stage/prose mismatches');
}

// ── Check: analysis freshness (analyzedAt vs stageDate) ───────────────────
// analyzedAt = the date the analysis prose was last written or re-verified.
// stageDate = the bill's latest action date (refetched mechanically). If the
// bill moved after the prose was last reviewed, the analysis may describe a
// stale procedural reality — re-review it (the generalized HCONRES-40 lesson).

section('Analysis freshness (analyzedAt)');
{
    let stale = 0, missing = 0;
    for (const bill of bills) {
        if (!bill.analyzed) continue;
        if (!bill.analyzedAt) {
            warn(`${bill.id}: no analyzedAt — stamp it when writing or re-verifying the analysis`);
            missing++;
            continue;
        }
        if (bill.stageDate && String(bill.stageDate) > String(bill.analyzedAt)) {
            warn(`${bill.id}: stageDate ${bill.stageDate} is newer than analyzedAt ${bill.analyzedAt} — bill moved after the analysis was last reviewed; re-review stage/likelihood prose`);
            stale++;
        }
    }
    if (stale === 0 && missing === 0) pass('All analyses are fresh relative to their latest action date');
}

// ── Check: CR dates processed ──────────────────────────────────────────────

section('CR dates processed');
{
    if (crRaw.length === 0) {
        pass('No pending CR data (cr_raw.json is empty)');
    } else {
        const crDates    = [...new Set(crRaw.map(g => g.date))];
        const processed  = new Set(quotes.processedDates || []);
        const pending    = crDates.filter(d => !processed.has(d));
        if (pending.length === 0) {
            pass(`All ${crDates.length} CR date(s) have been processed`);
        } else {
            pending.forEach(d => warn(`CR date not yet processed: ${d}`));
        }
    }
}

// ── Check: omnibus bills ───────────────────────────────────────────────────

section('Omnibus bill structure');
{
    const omnibusBills = bills.filter(b => b.isOmnibus);
    if (omnibusBills.length === 0) {
        pass('No omnibus bills in cache (or none marked isOmnibus)');
    } else {
        const DIV_REQUIRED = ['label', 'summary', 'sections'];
        let allOk = true;
        for (const bill of omnibusBills) {
            if (!Array.isArray(bill.divisions)) {
                fail(`${bill.id}: isOmnibus but no divisions array`);
                allOk = false;
                continue;
            }
            if (bill.divisions.length === 0) continue; // isOmnibus used for card styling only
            for (let di = 0; di < bill.divisions.length; di++) {
                const div = bill.divisions[di];
                const missing = DIV_REQUIRED.filter(f => {
                    const v = div[f];
                    return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
                });
                if (missing.length) {
                    fail(`${bill.id} divisions[${di}] (${div.label || '?'}): missing ${missing.join(', ')}`);
                    allOk = false;
                }
                // Each division section should have parseable labels
                for (const sec of (div.sections || [])) {
                    if (sec.billSection) continue;
                    const label = sec.label || '';
                    const autoOk =
                        /^Sections?\s+\d/i.test(label) ||
                        /^Title\s+[IVXLC]/i.test(label) ||
                        /^Division\s+[A-Z0-9]+\b/i.test(label) || // bt-div anchors exist since 2026-07-06
                        /^resolving/i.test(label);
                    if (!autoOk && label.length > 0) {
                        const a = adjudication(bill.id, 'section-label', label.slice(0, 55));
                        if (a) noteAdjudicated(`${bill.id} div ${div.divisionKey}: section label won't auto-link: "${label.slice(0, 55)}"`, a);
                        else warn(`${bill.id} div ${div.divisionKey}: section label won't auto-link: "${label.slice(0, 55)}"`);
                    }
                }
            }
            if (allOk) pass(`${bill.id}: ${bill.divisions.length} divisions all have required fields`);
        }
    }
}

// ── Check: raw bills_raw omnibus entries ───────────────────────────────────

section('Omnibus raw data (bills_raw.json)');
{
    const omnibusRaw = rawBills.filter(b => b.isOmnibus);
    if (omnibusRaw.length === 0) {
        pass('No omnibus entries in bills_raw.json');
    } else {
        let allOk = true;
        for (const b of omnibusRaw) {
            if (!Array.isArray(b.divisions) || b.divisions.length === 0) {
                fail(`bills_raw: ${b.billId} is isOmnibus but has no divisions array`);
                allOk = false;
            } else {
                const tooLarge = b.divisions.filter(d => d.charCount > 900000);
                if (tooLarge.length) {
                    warn(`${b.billId}: divisions ${tooLarge.map(d => d.divisionKey).join(', ')} exceed 900K chars — may approach context window limit`);
                }
            }
        }
        if (allOk) pass(`${omnibusRaw.length} omnibus raw bill(s) have divisions arrays`);
    }
}

// ── Check: sitemap ─────────────────────────────────────────────────────────

section('Sitemap');
{
    if (!fs.existsSync(SITEMAP_FILE)) {
        fail('sitemap.xml not found — run generate_sitemap.js');
    } else {
        // Slug URLs store bill ids lowercased — compare case-insensitively.
        const sitemap = fs.readFileSync(SITEMAP_FILE, 'utf8').toLowerCase();
        let missing = 0;
        for (const bill of bills) {
            if (!sitemap.includes(bill.id.toLowerCase())) {
                warn(`${bill.id} not in sitemap.xml`);
                missing++;
            }
        }
        if (missing === 0) pass(`sitemap.xml is current (${bills.length} bills accounted for)`);
        else warn(`Run generate_sitemap.js to update`);
    }
}

// ── Check: quote quality ───────────────────────────────────────────────────

section('Quote quality audit');
{
    const PROCEDURAL_PATTERNS = [
        /\bi move to suspend the rules\b/i,
        /\bi ask unanimous consent\b/i,
        /\bi ask for the yeas and nays\b/i,
        /\bi demand the yeas and nays\b/i,
        /\bpursuant to (?:the order|section|house resolution|clause)\b/i,
        /\bthe question was taken\b/i,
        /\bthe rules were suspended\b/i,
        /\ba motion to reconsider was laid\b/i,
        /^in closing\b/i,
        /\bi was unable to vote\b/i,
        /\bi was not present\b/i,
        /\bhad i been present\b/i,
        /\bfor the purpose of debate\b/i,
        /\bi yield back the balance of my time\b/i,
        /\breserve the balance of my time\b/i,
        // Classes found in the 2026-07-10 quote review (motions, vote corrections,
        // absence announcements, clerk/chair narration) — mirrored in fetch_bill_cr.js
        // DISPLAY_PROCEDURAL (keep the two lists in sync).
        /\bi have (?:a|an) (?:motion|amendment)(?: to \w+)? at the desk\b/i,
        /\bthe material previously referred to\b/i,
        /\bmoves? to recommit the bill\b/i,
        /\bi move that the (?:house|committee|senate)\b/i,
        /\bi move to proceed\b/i,
        /\bcloture motion\b/i,
        /\bnecessarily absent\b/i,
        /\bi announce that the senator\b/i,
        /\bmistakenly (?:voted|recorded)\b/i,
        /\bon roll call no\b/i,
        /\bhad i recorded my vote\b/i,
        /\bi was absent from the chamber\b/i,
        /\ba recorded vote (?:was ordered|has been demanded)\b/i,
        /\bi demand a recorded vote\b/i,
        /\bthe question is on\b/i,
        /\bhow much time (?:i have |is )?remaining\b/i,
        /\bi know of no further debate\b/i,
        /\bthere being no objection\b/i,
        /\bthe committee was discharged\b/i,
        /\bi have no statement to make\b/i,
        /\bquestion of the privileges of the house\b/i,
        /\bthe clerk (?:will )?(?:read|designate|redesignate)\b/i,
        // Senate passage narration (2026-08-07) — mirrored in fetch_bill_cr.js.
        /\bwas ordered to be engrossed\b/i,
        /\bwas read the third time\b/i,
    ];

    // Stance detection — same logic as fetch_bill_cr.js (keep in sync)
    function detectStance(text) {
        const t = text.toLowerCase();
        // Explicit first-person declarations about THIS bill take priority — the keyword
        // fallback below misfires on incidental phrasing ("harassment campaigns against
        // American companies" is not opposition to the bill; "strong opposition" contains
        // no bare "oppose" token, so it used to read as neutral).
        const explicitOppose  = /\b(?:i|we)\s+(?:strongly\s+|firmly\s+|respectfully\s+)?oppose\s+(?:this|the)\s+(?:bill|resolution|legislation|measure|act)\b/.test(t)
            || /\b(?:rise|stand|here)[^.!?]{0,40}\bin\s+(?:strong\s+|firm\s+|fierce\s+)?opposition\b/.test(t)
            || /\b(?:voice|voicing|express(?:ing)?|register(?:ing)?)\s+(?:my\s+|our\s+)?(?:strong\s+|firm\s+)?opposition\s+to\b/.test(t);
        const explicitSupport = /\b(?:i|we)\s+(?:strongly\s+|proudly\s+|fully\s+)?support\s+(?:this|the)\s+(?:bill|resolution|legislation|measure|act)\b/.test(t)
            || /\b(?:rise|stand|here)[^.!?]{0,40}\bin\s+(?:very\s+)?(?:strong\s+|proud\s+|full\s+)?support\s+of\b/.test(t);
        if (explicitOppose && !explicitSupport) return 'oppose';
        if (explicitSupport && !explicitOppose) return 'support';
        const hasOppose = /\b(?:(?:i|we)\s+oppose|oppose\s+(?:this|the)\s+(?:bill|legislation|resolution|measure|act)|(?:vote|voting|voted|stand|standing|am|are|is)\s+against|against\s+(?:this|the)\s+(?:bill|legislation|resolution|measure|act)|vote\s+no|reject\s+(?:this|the)|wrongheaded|dangerous|harmful|harm\b|cannot\s+support|will\s+not\s+support|urge.*defeat)\b/.test(t);
        const negated   = /\b(?:do(?:es)?|did|will|would|shall|have|has)\s+not\s+oppose\b|\bnot\s+oppose\b|\bno\s+opposition\b/.test(t);
        if (hasOppose && !negated) return 'oppose';
        if (/\b(support|favor|proud|urge.*pass|commend|pleased|important step|must pass|vote yes|vote for)\b/.test(t)) return 'support';
        return 'neutral';
    }

    let quoteIssues = 0;
    const analyzedBills = bills.filter(b => b.analyzed && !b.demo);

    for (const bill of analyzedBills) {
        const qs = bill.featured_quotes || [];
        for (const q of qs) {
            const text = q.text || '';
            const words = text.trim().split(/\s+/);
            const id = `${bill.id} "${q.name}"`;

            // Too short
            if (words.length < 10) {
                warn(`${id}: quote only ${words.length} words — likely noise`);
                quoteIssues++;
            }

            // CR formatting artifacts
            if (/\[\[Page |\{time\}\s*\d/.test(text)) {
                fail(`${id}: contains raw CR artifact ([[Page or {time})`);
                quoteIssues++;
            }

            // Fragment markers — "Word) that the House..."
            if (/^[A-Za-z]+\)\s/.test(text)) {
                fail(`${id}: starts with fragment marker (e.g. "Smith) that...")`);
                quoteIssues++;
            }

            // Truncated on title abbreviation
            if (/\s(?:Mr|Ms|Mrs|Dr|Sen|Rep)\.\s*$/.test(text)) {
                fail(`${id}: truncates on title abbreviation (ends with Mr./Ms. etc.)`);
                quoteIssues++;
            }

            // Procedural language surviving in displayed text
            const proceduralHit = PROCEDURAL_PATTERNS.find(p => p.test(text));
            if (proceduralHit) {
                fail(`${id}: procedural language in displayed quote`);
                quoteIssues++;
            }

            // Stance mismatch — stored stance vs what the text actually says
            if (q.stance && q.stance !== 'neutral') {
                const computed = detectStance(text);
                if (computed !== 'neutral' && computed !== q.stance) {
                    const a = adjudication(bill.id, 'quote-stance', q.name);
                    if (a) noteAdjudicated(`${id}: stance stored as "${q.stance}" but text reads "${computed}"`, a);
                    else {
                        warn(`${id}: stance stored as "${q.stance}" but text reads "${computed}"`);
                        quoteIssues++;
                    }
                }
            }
        }
    }

    const totalQuotes = analyzedBills.reduce((n, b) => n + (b.featured_quotes?.length || 0), 0);
    if (quoteIssues === 0) {
        pass(`All ${totalQuotes} quote(s) across ${analyzedBills.length} bills passed quality checks`);
    }
}

// ── Check: quote attribution (bioguide ↔ rep name/state) ───────────────────
//
// Floor quotes are attributed by surname ("Ms. SMITH of Minnesota"); a bioguideId
// matched on surname ALONE grabs the wrong person when surnames repeat (Smith,
// Mann, Johnson…) → wrong photo. This cross-checks every quote's bioguideId
// against reps-index.json: surname must appear in the rep's name (ERROR if not —
// wrong person), and the quote's state should match the rep's (WARN — likely a
// state typo or a same-surname mixup).

section('Quote attribution (bioguide ↔ rep)');
{
    let repsIdx = null;
    try { repsIdx = JSON.parse(fs.readFileSync(path.join(DATA, 'reps-index.json'), 'utf8')); } catch (e) {}
    if (!repsIdx) {
        warn('reps-index.json not loaded — skipping attribution check');
    } else {
        const byId = {};
        (function w(o) {
            if (Array.isArray(o)) o.forEach(w);
            else if (o && typeof o === 'object') {
                if (o.bioguideId && o.name) byId[o.bioguideId] = { name: o.name, state: o.state, party: o.party };
                Object.values(o).forEach(w);
            }
        })(repsIdx);

        // Normalize: strip diacritics (so the CR's ASCII "Barragan" matches "Barragán"),
        // drop hyphens/apostrophes (so "Ocasio-Cortez" stays one token), then turn any
        // other punctuation into spaces.
        const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/['’\-]/g, '').replace(/[^a-z\s]/g, ' '); // smart-quotes-ok: processes typographic quotes deliberately
        const surnameOf = (n) => {
            const t = norm(String(n || '').replace(/^(Mr|Mrs|Ms|Dr|Sen|Rep)\.?\s+/i, '')).trim().split(/\s+/).filter(Boolean);
            return t[t.length - 1] || '';
        };
        const repTokens = (n) => norm(n).trim().split(/\s+/).filter(Boolean);

        let issues = 0;
        const check = (q, where) => {
            if (!q.bioguideId) return;
            const rep = byId[q.bioguideId];
            if (!rep) { warn(`${where}: "${q.name}" bioguide ${q.bioguideId} not in reps-index`); issues++; return; }
            const sn = surnameOf(q.name);
            if (sn && !repTokens(rep.name).includes(sn)) {
                fail(`${where}: "${q.name}" (${q.party || '?'}-${q.state || '?'}) → bioguide ${q.bioguideId} is ${rep.name} (${rep.party}-${rep.state}) — WRONG PERSON (surname mismatch)`);
                issues++;
            } else if (q.state && rep.state && q.state !== rep.state) {
                warn(`${where}: "${q.name}" state=${q.state} but bioguide ${q.bioguideId} = ${rep.name} is ${rep.state} — verify`);
                issues++;
            }
        };
        for (const b of bills) for (const q of (b.featured_quotes || [])) check(q, b.id);
        for (const q of (quotes.quotes || [])) check(q, 'quotes.json');
        if (issues === 0) pass('All quote bioguideIds match the rep name/state');
    }
}

// ── Check: date format (ISO storage) ───────────────────────────────────────
//
// Dates MUST be stored ISO (YYYY-MM-DD). Human formats like "May 19, 2026" break
// React Native's Hermes engine (new Date() returns Invalid), which silently
// scrambles bill ordering on the mobile app. The UI renders them as mm-dd-yy.

section('Date format (ISO storage)');
{
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    const DATE_FIELDS = ['date', 'stageDate', 'enactedDate'];
    let bad = 0;
    for (const bill of bills) {
        for (const f of DATE_FIELDS) {
            const v = bill[f];
            if (v && !ISO.test(v)) {
                fail(`${bill.id}: ${f}="${v}" is not ISO YYYY-MM-DD (breaks Hermes date sort)`);
                bad++;
            }
        }
    }
    if (bad === 0) pass('All date fields are ISO YYYY-MM-DD');
}

// ── Check: referenced sources resolve + source tags are registered ─────────
//
// Cross-sourced figures must point to a RECORDED + FETCHED referenced source —
// never cleared on "it's cross-referenced" alone. So: every referencedSources
// entry must resolve to a real stored textFile, and every "source" tag in the
// analysis must name a registered entry. These are ERRORS (blocking).

section('Referenced sources');
{
    let ok = true;
    for (const bill of bills) {
        const ids = new Set((bill.referencedSources || []).map(s => s.id));
        for (const s of bill.referencedSources || []) {
            if (!s.id || !s.textFile) { fail(`${bill.id}: a referencedSources entry is missing id/textFile`); ok = false; continue; }
            let t = ''; try { t = fs.readFileSync(path.join(__dirname, '..', s.textFile), 'utf8'); } catch {}
            if (t.trim().length < 200) { fail(`${bill.id}: referenced source "${s.id}" text missing/too short — ${s.textFile} (run scripts/fetch-reference.js)`); ok = false; }
        }
        for (const tag of collectSourceTags(bill))
            if (!ids.has(tag)) { fail(`${bill.id}: "source": "${tag}" has no matching referencedSources entry`); ok = false; }
    }
    if (ok) pass('All referenced sources resolve and all source tags are registered');
}

// ── Check: figure sourcing (training-data guard) ───────────────────────────
//
// Every dollar figure, percentage, and "Section N" cite in the bill-content
// prose should appear in the actual fetched bill text — OR, for an item tagged
// with "source", in that recorded referenced source's text. A figure that
// appears in NEITHER is a strong signal it came from training knowledge (the
// recurring fabrication failure mode). Conservative — warnings, not errors.

section('Figure sourcing (training-data guard)');
{
    const SCALE = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
    let flagged = 0;

    // Run the three figure checks on one prose unit against its effective source
    // text (current bill text, plus any referenced-source text the unit cites).
    const checkUnit = (prose, text, norm, misses) => {
        let m;
        // Dollar THRESHOLD figures (e.g. "$25 billion"). Decimals skipped — usually
        // rounded line items that won't string-match the precise figure in the text.
        const dollarRe = /\$\s?(\d+)\s*(billion|million|trillion|thousand)\b/gi;
        while ((m = dollarRe.exec(prose))) {
            const num = m[1], scale = m[2].toLowerCase();
            const full = String(Math.round(parseFloat(num) * SCALE[scale]));
            if (!(text.includes(`${num} ${scale}`) || norm.includes(full))) misses.add(`$${num} ${scale}`);
        }
        // Percentages
        const pctRe = /(\d+(?:\.\d+)?)\s*(?:%|percent)\b/gi;
        while ((m = pctRe.exec(prose))) {
            const num = m[1];
            if (!(text.includes(`${num} percent`) || text.includes(`${num}%`) || text.includes(`${num} per centum`))) misses.add(`${num}%`);
        }
        // "Section N" — "section N" / "sec. N" / "sec N", OR a bare enumerator at a
        // line start ("2. Short title"), how many House bills format headers in the
        // fetched text. Mirrors renderBtLine() on the bill page.
        const secRe = /\bsection\s+(\d+[a-z]?)\b/gi;
        while ((m = secRe.exec(prose))) {
            const n = m[1].toLowerCase();
            const numCore = n.replace(/[a-z]$/, '');
            const inSecForm  = new RegExp('\\bsec(?:tion|\\.)?\\s*' + n + '\\b', 'i').test(text);
            const inBareForm = new RegExp('(^|\\n)\\s*' + numCore + '\\.\\s', 'm').test(text);
            if (!inSecForm && !inBareForm) misses.add(`Section ${m[1]}`);
        }
    };

    for (const bill of bills) {
        if (!bill.analyzed) continue;
        const rawCur = billText(bill.id);
        if (rawCur.length < 500) continue; // no/!trivial text — sourcing checked elsewhere
        const curText = rawCur.toLowerCase();
        const curNorm = digitsOnly(curText);
        const refMap  = refTexts(bill);
        const misses  = new Set();

        for (const unit of proseUnits(bill)) {
            let text = curText, norm = curNorm;
            if (unit.sourceIds.length) {
                for (const id of unit.sourceIds) { const rt = refMap.get(id); if (rt) text += '\n' + rt; }
                norm = digitsOnly(text);
            }
            checkUnit(unit.text, text, norm, misses);
        }

        if (misses.size) {
            const open = [], verified = [];
            for (const tok of misses) {
                const a = adjudication(bill.id, 'figure-sourcing', tok);
                if (a) verified.push({ tok, a }); else open.push(tok);
            }
            for (const { tok, a } of verified) noteAdjudicated(`${bill.id}: "${tok}" not string-matchable in bill text`, a);
            if (open.length) {
                const list = open.slice(0, 8).join(', ');
                warn(`${bill.id}: ${open.length} figure(s)/cite(s) not found in bill text — verify: ${list}${open.length > 8 ? ' …' : ''}`);
                flagged++;
            }
        }
    }
    if (flagged === 0) pass('All figures/cites in analyses are traceable to the bill text');
}

// ── Check: account attribution ("right number, wrong account") ─────────────
// For each appropriations/omnibus dollar figure, compare the account LABEL the
// analysis binds it to against the enclosing SOURCE account heading (via
// lib/attribution.js). Zero distinctive-word overlap = a likely wrong-account
// binding — the NASA-$3.0B / NFS↔Wildland-Fire / SBA-"$15B disaster" class that
// figure-presence checks are structurally blind to. Advisory (warnings).

// Opt-in only (`--attribution`): high-precision-ish but the program-vs-account
// naming class makes it too false-positive-prone for the default commit gate.
// Used as a cheap SCREEN that feeds candidates to the cross-model verify loop.
if (process.argv.includes('--attribution')) {
    section('Account attribution');
    let flagged = 0;
    for (const bill of bills) {
        if (!bill.analyzed) continue;
        const bt = bill.billType;
        const isApprop = Array.isArray(bt) ? bt.includes('appropriation') : bt === 'appropriation';
        const isOmni   = !!bill.isOmnibus || (Array.isArray(bill.divisions) && bill.divisions.length > 0);
        if (!isApprop && !isOmni) continue; // the wrong-account class is an appropriations phenomenon
        let hits = [];
        try { hits = attributionFlags(bill, path.join(__dirname, '..')); } catch (e) { continue; }
        const open = [];
        for (const h of hits) {
            const key = `${h.token} -> ${h.heading}`;
            const a = adjudication(bill.id, 'account-attribution', key);
            if (a) noteAdjudicated(`${bill.id}: ${h.token} labeled "${h.account}" vs source heading "${h.heading}"`, a);
            else open.push(h);
        }
        for (const h of open.slice(0, 6)) {
            warn(`${bill.id}: ${h.token} labeled "${h.account}" but sits under source heading "${h.heading}" [${h.tag}:${h.lineNo}] (${h.label}) — verify account binding`);
            flagged++;
        }
        if (open.length > 6) { warn(`${bill.id}: …and ${open.length - 6} more possible wrong-account bindings`); flagged++; }
    }
    if (flagged === 0) pass('No suspected wrong-account figure attributions');
}

// ── Check: version drift (stale source text) ───────────────────────────────
// A bill that PASSED a chamber but whose on-disk bill text is still the
// Introduced version, AND whose versionChanges shows the passed text differs, was
// analyzed against superseded text ("ALWAYS analyze the LATEST version" HARD RULE).
// Deterministic and precise (no false positives). Fidelity audits CANNOT catch this
// — the prose is faithful to the wrong-version source on disk. Fix = re-fetch the
// latest text + re-derive the affected prose.

section('Version drift (stale source)');
{
    const ADV = new Set(['house', 'senate', 'signed']);
    const drift = [];
    for (const bill of bills) {
        if (!bill.analyzed || !ADV.has(bill.stage)) continue;
        let head = '';
        try { head = fs.readFileSync(path.join(BILL_TEXT, `${bill.id}.txt`), 'utf8').slice(0, 500); } catch (e) { continue; }
        if (!/Introduced in (House|Senate)|\((?:IH|IS)\)/.test(head)) continue; // on-disk text is a later version → OK
        const vc = bill.versionChanges || {};
        const nch = (vc.modified || []).length + (vc.removed || []).length + (vc.added || []).length;
        if (nch === 0) continue;                                                // passed unamended → Introduced text is accurate
        if (adjudication(bill.id, 'version-drift', 'introduced-stale')) continue;
        drift.push({ id: bill.id, st: bill.stageLabel || bill.stage, nch });
    }
    drift.sort((a, b) => b.nch - a.nch);
    if (!drift.length) pass('No advanced bills analyzed against stale (Introduced) text');
    else {
        for (const d of drift.slice(0, 10)) warn(`${d.id}: ${d.st} but analyzed against INTRODUCED text (${d.nch} version change(s)) — re-fetch latest + re-derive prose`);
        if (drift.length > 10) warn(`version-drift backlog: ${drift.length} advanced bills analyzed against stale Introduced text (${drift.length - 10} beyond those listed) — re-analyze against latest version`);
    }
}

// ── Check: pending re-analysis queue (needsReanalysis flag) ─────────────────
// The version-drift check above keys on the ON-DISK text version marker, so it
// goes green the instant the latest text is fetched — even if the prose is still
// stale (e.g. a bill re-fetched but deferred for a larger rebuild). The
// needsReanalysis flag is the durable signal that survives that: refresh_stages
// sets it when a cached bill advances, and it is cleared only after the prose is
// actually reconciled. Surface every still-flagged bill so none can ship invisibly.

section('Reanalysis queue (needsReanalysis)');
{
    const pending = bills.filter(b => b.needsReanalysis);
    if (!pending.length) pass('No bills awaiting re-analysis');
    else {
        pending.sort((a, b) => (a.id < b.id ? -1 : 1));
        for (const b of pending) {
            const st = b.stageLabel || b.stage || '';
            warn(`${b.id}: flagged needsReanalysis${st ? ` (${st})` : ''} — analysis not yet reconciled to latest text; re-analyze + clear the flag`);
        }
    }
}

// ── Check: acronym audit ───────────────────────────────────────────────────
//
// Flags all-caps acronyms used in prose that are neither in acronyms.js nor
// introduced inline with a parenthetical expansion — so readers never hit
// undefined jargon. Advisory (warnings).

section('Acronym audit');
{
    const STOP = new Set([
        'US', 'USA', 'U', 'S', 'ACT', 'BILL', 'GOP', 'CEO', 'CFO', 'COO', 'FAQ', 'TV', 'AI',
        'ID', 'OK', 'PDF', 'URL', 'HTML', 'AM', 'PM', 'USC', 'CFR', 'PL', 'HR', 'NDAA',
        'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'IT', 'BE', 'AND', 'THE', 'FOR', 'WHO',
        // Common English words that appear in ALL-CAPS quoted bill headings/short-titles
        'USE', 'LAW', 'NEW', 'ANY', 'ALL', 'END', 'RUN', 'ADD', 'OUT', 'OFF', 'OWN',
    ]);
    const known = new Set(Object.keys(ACRONYMS).map(k => k.toUpperCase()));
    let flagged = 0;

    for (const bill of bills) {
        if (!bill.analyzed) continue;
        const prose = contentProse(bill);
        const introduced = new Set(); // acronyms defined inline as "(ABC)"
        let pm;
        const introRe = /\(([A-Z][A-Z0-9\-]{1,7})\)/g;
        while ((pm = introRe.exec(prose))) introduced.add(pm[1].toUpperCase());

        const unknown = new Set();
        let am;
        // 3–6 letters: 2-letter tokens are mostly state codes / common words (IP, EV, AG).
        const acroRe = /\b([A-Z]{3,6})\b/g;
        while ((am = acroRe.exec(prose))) {
            const a = am[1];
            const U = a.toUpperCase();
            if (STOP.has(U) || known.has(U) || introduced.has(U)) continue;
            if (/^[IVXLCDM]+$/.test(U)) continue; // roman numerals (Title XVI, LXXXV) are not acronyms
            unknown.add(a);
        }
        if (unknown.size) {
            warn(`${bill.id}: ${unknown.size} undefined acronym(s): ${[...unknown].slice(0, 10).join(', ')}`);
            flagged++;
        }
    }
    if (flagged === 0) pass('All acronyms are in acronyms.js or introduced inline');
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(56));
console.log(`  ${errors} error(s)   ${warnings} warning(s)`);
const blocking = errors > 0 || (STRICT && warnings > 0);
if (errors > 0) {
    console.log('  ❌ NOT ready to push — fix errors first.');
} else if (warnings > 0) {
    console.log(STRICT
        ? '  ❌ --strict: warnings present — not a clean pass.'
        : '  ⚠️  Ready to push — review warnings above.');
} else {
    console.log('  ✅ All checks passed — clean pass.');
}
console.log('═'.repeat(56) + '\n');

// --json <path>: machine-readable result for the quarantine engine. Written on
// every run (clean or not) so a caller can act on the structured error list.
const JSON_OUT = (() => {
    const eq = process.argv.find(a => a.startsWith('--json='));
    if (eq) return eq.split('=')[1];
    const i = process.argv.indexOf('--json');
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();
if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ ok: errors === 0, errors, warnings, errorList, warnList }, null, 2));
}

if (blocking) process.exit(1);
