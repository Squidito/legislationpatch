// extract_floor_quotes.js
//
// Automated extraction of GENERAL (non-bill) floor statements from
// data/cr_raw.json into data/quotes.json — the automated replacement for the
// old hand-written add_cr_quotes.js (which hardcoded LLM-picked quotes).
//
// "Spicy filter" mode: regex extraction (reuses fetch_bill_cr's
// extractQuotesFromCR with EMPTY bill args, which skips the bill-proximity
// filter and returns any substantive speaker quote), then keep only
// oppose/support-stance statements (drop neutral/procedural), rank by the SAME
// computeShockScore the carousel uses (app-carousel.js), and cap a handful per session
// day. No LLM. Idempotent: dedups against existing quotes + processedDates.
//
// Pipeline: runs in run-batch.js after fetch_cr_data.js (which produces
// cr_raw.json). Standalone backfill: node scripts/fetch_cr_data.js --days=50
// then node scripts/extract_floor_quotes.js.
//
// NOTE: attribution uses extractQuotesFromCR's surname→reps-index lookup (it
// takes the first surname match — it does NOT disambiguate by the CR's "of
// State"). validate-batch.js's Quote-attribution check is the backstop; review
// its WARN/ERROR output and fix any wrong person before pushing.

'use strict';
const fs   = require('fs');
const path = require('path');
const { extractQuotesFromCR } = require('./fetch_bill_cr');

const CR_RAW      = path.join(__dirname, '../data/cr_raw.json');
const QUOTES_FILE = path.join(__dirname, '../data/quotes.json');
// Balanced coverage (2026-06-30): quotes.json feeds the WHOLE floor page (the
// category accordion), not just the carousel — so we store comprehensively and
// let the carousel keep ranking by shock score to surface the spiciest. We keep
// all stances (incl. neutral) and apply only a light quality bar to drop pure
// procedural/ceremonial filler. The per-day cap is per chamber, by speaker.
const PER_DAY_CAP = 15;  // keep up to N statements per session day
// Light floor under which a quote is just a one-liner / procedural fragment.
// (A substantive statement of ~160+ chars clears this on length alone.)
const MIN_SHOCK   = 2;

// Ceremonial tributes ("I rise to honor/recognize/congratulate X", memorials,
// anniversaries) are real floor statements but not policy debate — drop them so
// the topic page stays about legislation. Matched only against the opener so a
// policy speech that happens to say "remember" later isn't caught.
const TRIBUTE_RE = /\b(?:rise (?:today )?to (?:honor|recognize|congratulate|celebrate|pay tribute|remember|commemorate|mark the|acknowledge)|in (?:honor|memory|recognition|celebration) of|congratulat\w+|pay(?:ing)? tribute|\d{2,3}(?:th|st|nd|rd) anniversary|life and legacy of|for (?:his|her|their) (?:many years of |decades of )?(?:dedicated |distinguished )?service)\b/i;

// Mirror of computeShockScore() in app-carousel.js — keep in sync if that changes.
function computeShockScore(q) {
    let score = 0;
    const text = (q.text || '').toLowerCase();
    if (q.stance === 'oppose') score += 3;
    score += (q.text.match(/!/g) || []).length * 2;
    ['never','cannot','wrong','fail','destroy','steal','corrupt','socialism','looting',
     'screaming','disgusting','dangerous','unconstitutional','betrayed','shameful',
     'criminal','fraud','disaster','outrage'].forEach(w => { if (text.includes(w)) score += 1; });
    score += Math.min(4, Math.floor((q.text || '').length / 80));
    return score;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function isoToDisplay(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${MONTHS[+m[2]-1]} ${+m[3]}, ${m[1]}` : '';
}

const CONGRESS = process.env.CONGRESS_SESSION || '119';
// Extract bill references ("H.R. 1234", "H. Con. Res. 40", "S. 5") → normalized ids.
// Longest forms first; a lookbehind blocks the "U.S. 50" → "S. 50" false match.
const BILL_REF_RE = /(?<![A-Za-z]\.)\b(H\.?\s?Con\.?\s?Res\.?|S\.?\s?Con\.?\s?Res\.?|H\.?\s?J\.?\s?Res\.?|S\.?\s?J\.?\s?Res\.?|H\.?\s?Res\.?|S\.?\s?Res\.?|H\.?\s?R\.?|S\.?)\s?(\d{1,5})\b/gi;
const REF_TYPE = { HR:'HR', HJRES:'HJRES', HCONRES:'HCONRES', HRES:'HRES', SJRES:'SJRES', SCONRES:'SCONRES', SRES:'SRES', S:'S' };
function billRefsInText(text) {
    const out = new Set();
    for (const m of (text || '').matchAll(BILL_REF_RE)) {
        const t = REF_TYPE[m[1].toUpperCase().replace(/[^A-Z]/g, '')];
        if (t) out.add(`${CONGRESS}-${t}-${m[2]}`);
    }
    return out;
}

function main() {
    if (!fs.existsSync(CR_RAW)) { console.log('No data/cr_raw.json — run fetch_cr_data.js first.'); return; }
    const granules = JSON.parse(fs.readFileSync(CR_RAW, 'utf8'));
    if (!Array.isArray(granules) || !granules.length) { console.log('cr_raw.json is empty — nothing to extract.'); return; }

    const quotesData = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8'));
    const existing   = quotesData.quotes || [];
    const seen       = new Set(existing.map(q => `${q.name}|${(q.text || '').slice(0, 40)}`));

    // Cached bill titles, for high-confidence bill attribution below.
    const cacheTitle = {};
    try {
        const cache = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cache.json'), 'utf8'));
        for (const b of (cache.bills || [])) cacheTitle[b.id] = b.title || b.official_title || null;
    } catch (e) { console.warn('Warning: cache.json not loaded — bill attribution disabled'); }
    const cachedIds = new Set(Object.keys(cacheTitle));

    // Attribute a bill only when the granule clearly centers on ONE cached bill:
    // (1) exactly one cached bill referenced, (2) not a multi-bill grab-bag, and
    // (3) the granule's TITLE substantially matches the bill's title — the debate
    // heading IS that measure, not a different topic that cites it in passing.
    // (3) is what rejects e.g. a "Highlighting Women's Health" granule that mentions
    // the Ukraine Support Act once, or a quote tagged to a bill from an "S. Res. 616"
    // granule. Procedural granule titles (rule waivers, etc.) reduce to no signal
    // words and are correctly rejected.
    const TITLE_STOP = new Set(['act','the','and','for','resolution','bill','providing',
        'consideration','making','appropriations','related','other','purposes','fiscal',
        'year','amendment','directing','pursuant','section','requirement','clause','rule',
        'waiving','further','additional','providing','concurrent','joint']);
    const sigWords = s => new Set((s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/).filter(w => w.length > 3 && !TITLE_STOP.has(w)));
    function titleMatch(billTitle, granuleTitle) {
        const bt = sigWords(billTitle), gt = sigWords(granuleTitle);
        if (!bt.size) return false;
        let hit = 0; for (const w of bt) if (gt.has(w)) hit++;
        return hit / bt.size >= 0.6;
    }
    function granuleBill(g) {
        const refs = billRefsInText(g.text || '');
        const cached = [...refs].filter(id => cachedIds.has(id));
        if (cached.length === 1 && refs.size <= 4 && titleMatch(cacheTitle[cached[0]], g.granuleTitle)) {
            return { id: cached[0], title: cacheTitle[cached[0]] || null };
        }
        return null;
    }

    // Gather candidates grouped by date.
    const byDate = {};
    for (const g of granules) {
        const cands = extractQuotesFromCR(g.text || '', '', '', g.chamber);   // empty bill args = general; chamber disambiguates speakers
        const gb = granuleBill(g);                                            // one cached bill for the whole granule, or null
        for (const q of cands) {
            const shock = computeShockScore(q);
            if (shock < MIN_SHOCK) continue;                                 // drop one-liners / procedural fragments
            if (TRIBUTE_RE.test((q.text || '').slice(0, 180))) continue;      // drop ceremonial tributes
            const key = `${q.name}|${(q.text || '').slice(0, 40)}`;
            if (seen.has(key)) continue;
            (byDate[g.date] = byDate[g.date] || []).push({
                name: q.name, party: q.party, state: q.state, bioguideId: q.bioguideId,
                text: q.text,
                source: `${g.chamber} Floor, ${isoToDisplay(g.date)}`,
                stance: q.stance,
                billId: gb ? gb.id : null, billTitle: gb ? gb.title : null,
                chamber: g.chamber,
                granuleId: g.granuleId || null,
                _score: computeShockScore(q),
                _key: key,
            });
        }
    }

    // Per day: dedup by speaker (keep their spiciest), rank, cap.
    const toAdd = [];
    for (const date of Object.keys(byDate).sort()) {
        const bySpeaker = new Map();
        for (const e of byDate[date].sort((a, b) => b._score - a._score)) {
            const sp = e.bioguideId || e.name;
            if (!bySpeaker.has(sp)) bySpeaker.set(sp, e);
        }
        const ranked = [...bySpeaker.values()].sort((a, b) => b._score - a._score).slice(0, PER_DAY_CAP);
        for (const e of ranked) {
            if (seen.has(e._key)) continue;
            seen.add(e._key);
            toAdd.push(e);
        }
    }
    toAdd.forEach(e => { delete e._score; delete e._key; });

    quotesData.quotes = [...existing, ...toAdd];

    // Mark every date present in cr_raw as processed (so re-runs are no-ops).
    const processed = new Set(quotesData.processedDates || []);
    granules.forEach(g => { if (g.date) processed.add(g.date); });
    quotesData.processedDates = [...processed].sort();
    quotesData.generated = new Date().toISOString();

    fs.writeFileSync(QUOTES_FILE, JSON.stringify(quotesData, null, 2) + '\n');

    const withBill = toAdd.filter(e => e.billId).length;
    console.log(`Added ${toAdd.length} general floor statement(s) (${withBill} attributed to a cached bill). Total quotes: ${quotesData.quotes.length}.`);
    const perDay = {};
    toAdd.forEach(e => { perDay[e.source] = (perDay[e.source] || 0) + 1; });
    Object.entries(perDay).sort().forEach(([s, n]) => console.log(`  + ${s}: ${n}`));
}

main();
