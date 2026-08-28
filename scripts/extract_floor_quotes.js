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
const { countBillRefs: countRefs, soleCachedRef: soleRef } = require('./lib/bill-refs');

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
// Bill-reference extraction ("H.R. 1234", "H. Con. Res. 40", "S. 5") lives in
// lib/bill-refs.js -- shared with generate_reps.js so BOTH quote linkers apply
// the same explicit-citation rule (see that file header for why a keyword
// scorer is never allowed to create a link).

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

    // Attribute a standalone floor quote to a cached bill ONLY when the granule is
    // unambiguously THAT bill's OWN floor debate. Weak signals are rejected — a
    // wrong link is worse than no link. They mislinked the 2026-08-12 batch: a
    // hemp-amendment quote → "KIDS Act" (119-HR-7757) on the shared word "kids",
    // and five Russia-sanctions quotes → H.R. 2913 — a single passing mention —
    // when the granule was really the H.R. 5334 debate (H.R. 5334 was not yet
    // cached, so the old matcher fell back to a thematically-similar minor mention).
    //
    // GovInfo labels a floor-debate granule with the bill's NAME, not its number
    // (e.g. "AGOA EXTENSION ACT--Motion to Proceed"), so we cannot require the
    // number in the heading. Instead a link needs ONE of two strong signals:
    //  (1) SUBJECT MATCH — the bill cited MOST in the granule body (its subject)
    //      is cached, is cited 2+ times (not a passing reference), AND the heading
    //      matches that bill's title on 2+ significant words. Using the dominant
    //      bill defeats the Russia bug: the true subject out-cites the passing
    //      mention, and when the subject isn't cached we return null rather than
    //      fall back to a minor cached mention.
    //  (2) EXPLICIT CITATION — the heading, or the quote's own text, cites exactly
    //      one cached bill by number (H.R./S. + number).
    const TITLE_STOP = new Set(['act','the','and','for','resolution','bill','providing',
        'consideration','making','appropriations','related','other','purposes','fiscal',
        'year','amendment','directing','pursuant','section','requirement','clause','rule',
        'waiving','further','additional','concurrent','joint']);
    const sigWords = s => new Set((s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/).filter(w => w.length > 3 && !TITLE_STOP.has(w)));
    // Heading matches a bill title only when they share 2+ significant words AND
    // the heading covers 60%+ of the bill title's significant words. The 2-word
    // floor kills the single-common-word matches ("kids", "russia") that short or
    // generic titles trivially satisfied.
    function titleMatch(billTitle, granuleTitle) {
        const bt = sigWords(billTitle), gt = sigWords(granuleTitle);
        if (bt.size < 2) return false;                     // title too generic to match safely
        let hit = 0; for (const w of bt) if (gt.has(w)) hit++;
        return hit >= 2 && hit / bt.size >= 0.6;
    }
    // Frequency of each bill number cited in a block of text (billRefsInText dedups;
    // here we need counts to find the granule dominant SUBJECT bill).
    const countBillRefs = text => countRefs(text, CONGRESS);
    // Signal (2): exactly one cached bill cited by number in `text`.
    const soleCachedRef = text => soleRef(text, cachedIds, cacheTitle, CONGRESS);
    function granuleBill(g) {
        // (2) explicit: the debate heading itself cites exactly one cached bill.
        const headingRef = soleCachedRef(g.granuleTitle || '');
        if (headingRef) return headingRef;
        // (1) subject match: the dominant bill in the body, cited 2+ times, cached,
        //     with a heading that matches its title.
        const ranked = Object.entries(countBillRefs(g.text || '')).sort((a, b) => b[1] - a[1]);
        if (!ranked.length) return null;
        const [subjectId, subjectCount] = ranked[0];
        if (subjectCount < 2) return null;                 // no bill is genuinely the subject
        if (!cachedIds.has(subjectId)) return null;        // real subject isn't cached — do NOT fall back
        if (!titleMatch(cacheTitle[subjectId], g.granuleTitle)) return null;
        return { id: subjectId, title: cacheTitle[subjectId] || null };
    }

    // Gather candidates grouped by date.
    const byDate = {};
    for (const g of granules) {
        // GUARD: every standalone quote must carry a real, dated source string
        // ("House Floor, Aug 7, 2026"). floor.js sorts, dates, and labels quotes
        // straight off this string, so a granule with no chamber or no parseable
        // date can only yield sourceless, unrenderable quotes — skip it whole.
        const source = (g.chamber && isoToDisplay(g.date))
            ? `${g.chamber} Floor, ${isoToDisplay(g.date)}` : '';
        if (!source) {
            console.warn(`  ⚠️  [skip granule] ${g.granuleId || g.date || '?'}: no chamber/date — sourceless quotes dropped`);
            continue;
        }
        const cands = extractQuotesFromCR(g.text || '', '', '', g.chamber);   // empty bill args = general; chamber disambiguates speakers
        const gb = granuleBill(g);                                            // cached bill named in the debate heading, or null
        for (const q of cands) {
            const shock = computeShockScore(q);
            if (shock < MIN_SHOCK) continue;                                 // drop one-liners / procedural fragments
            if (TRIBUTE_RE.test((q.text || '').slice(0, 180))) continue;      // drop ceremonial tributes
            const key = `${q.name}|${(q.text || '').slice(0, 40)}`;
            if (seen.has(key)) continue;
            const link = gb || soleCachedRef(q.text);                        // heading match, else the quote's own explicit citation
            (byDate[g.date] = byDate[g.date] || []).push({
                name: q.name, party: q.party, state: q.state, bioguideId: q.bioguideId,
                text: q.text,
                source,
                stance: q.stance,
                billId: link ? link.id : null, billTitle: link ? link.title : null,
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
