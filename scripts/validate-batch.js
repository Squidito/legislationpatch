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

function pass(msg)  { console.log(`  ✅ ${msg}`); }
function warn(msg)  { console.log(`  ⚠️  ${msg}`); warnings++; }
function fail(msg)  { console.log(`  ❌ ${msg}`); errors++; }
function section(label) { console.log(`\n── ${label}`); }

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
    const cachedIds   = new Set(bills.map(b => b.id));
    const unprocessed = rawBills.filter(b => !cachedIds.has(b.billId));
    if (unprocessed.length === 0) {
        pass('All fetched bills have been analyzed');
    } else {
        unprocessed.forEach(b => fail(`Not yet analyzed: ${b.billId} — ${b.title}`));
    }
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
    let issues = 0;
    for (const bill of bills) {
        for (const sec of (bill.sections || [])) {
            if (sec.billSection) continue;
            const label = sec.label || '';
            const autoOk =
                /^Sections?\s+\d/i.test(label) ||
                /^Title\s+[IVXLC]/i.test(label) ||
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

        if (b.pages === 0) {
            fail(`${b.id}: pages:0 but data/bill-text/${b.id}.txt exists (${Math.round(fileBytes/1000)}K bytes) — analysis was written without reading the bill text. Re-fetch and reanalyze.`);
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
                warn(`${billId} ${path}: spelled-out "${sm[0]}" — shorten to $X.XXB/$XM form (CLAUDE.md dollar rules)`);
                spelled++;
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
    const PASSAGE_Q = /\b(on passage|suspend the rules and pass|agreeing to the (concurrent )?resolution|motion to concur)\b/i;
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
                        /^resolving/i.test(label);
                    if (!autoOk && label.length > 0) {
                        warn(`${bill.id} div ${div.divisionKey}: section label won't auto-link: "${label.slice(0, 55)}"`);
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
        const sitemap = fs.readFileSync(SITEMAP_FILE, 'utf8');
        let missing = 0;
        for (const bill of bills) {
            if (!sitemap.includes(bill.id)) {
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
    ];

    // Stance detection — same logic as fetch_bill_cr.js
    function detectStance(text) {
        const t = text.toLowerCase();
        const hasOppose = /\b(oppose|against|vote no|reject|dangerous|harmful|harm\b|cannot support|will not support|urge.*defeat|vote against)\b/.test(t);
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
                    warn(`${id}: stance stored as "${q.stance}" but text reads "${computed}"`);
                    quoteIssues++;
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

        // Normalize: drop hyphens/apostrophes (so "Ocasio-Cortez" stays one token),
        // then turn any other punctuation into spaces.
        const norm = (s) => String(s || '').toLowerCase().replace(/['’\-]/g, '').replace(/[^a-z\s]/g, ' ');
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

if (blocking) process.exit(1);
