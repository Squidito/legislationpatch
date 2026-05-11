// validate-batch.js
// Pre-push validation — checks that all batch processing is complete and correct.
// Run standalone: node scripts/validate-batch.js
// Called automatically by run-batch.js at the end of each pipeline run.

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

// ── Reporting ──────────────────────────────────────────────────────────────

let errors = 0, warnings = 0;

function pass(msg)  { console.log(`  ✅ ${msg}`); }
function warn(msg)  { console.log(`  ⚠️  ${msg}`); warnings++; }
function fail(msg)  { console.log(`  ❌ ${msg}`); errors++; }
function section(label) { console.log(`\n── ${label}`); }

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
                warn(`${bill.id}: section label won't auto-link: "${label.slice(0, 55)}"`);
                issues++;
            }
        }
    }
    if (issues === 0) pass('All section labels auto-parse or have explicit billSection');
}

// ── Check: raw dollar amounts ──────────────────────────────────────────────

section('Dollar amount formatting');
{
    const RAW_DOLLAR = /\$\d{1,3}(?:,\d{3}){2,}/;
    let found = 0;

    function walkForDollars(obj, path, billId) {
        if (typeof obj === 'string') {
            if (RAW_DOLLAR.test(obj)) {
                fail(`${billId} ${path}: contains raw dollar amount`);
                found++;
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
}

// ── Check: vote data ───────────────────────────────────────────────────────

section('Vote data');
{
    const NEEDS_VOTES = new Set(['house', 'senate', 'signed']);
    let missing = 0;
    for (const bill of bills) {
        if (!NEEDS_VOTES.has(bill.stage)) continue;
        if (!bill.votes || bill.votes.length === 0) {
            warn(`${bill.id}: no votes (stage: ${bill.stage}) — voice vote or fetch returned nothing`);
            missing++;
        }
    }
    if (missing === 0) pass('All passed/signed bills have vote data');
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
            if (!Array.isArray(bill.divisions) || bill.divisions.length === 0) {
                fail(`${bill.id}: isOmnibus but no divisions array`);
                allOk = false;
                continue;
            }
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
    const analyzedBills = bills.filter(b => b.analyzed && !b.demo && !b.live);

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

// ── Summary ────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(56));
console.log(`  ${errors} error(s)   ${warnings} warning(s)`);
if (errors > 0) {
    console.log('  ❌ NOT ready to push — fix errors first.');
} else if (warnings > 0) {
    console.log('  ⚠️  Ready to push — review warnings above.');
} else {
    console.log('  ✅ All checks passed — ready to push.');
}
console.log('═'.repeat(56) + '\n');

if (errors > 0) process.exit(1);
