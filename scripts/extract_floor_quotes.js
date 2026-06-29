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
// computeShockScore the carousel uses (app.js), and cap a handful per session
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
const PER_DAY_CAP = 6;   // keep the top N spiciest per session day
// Minimum shockScore to qualify as "controversial". Stance alone is too loose —
// "I am proud / I commend" ceremonial speeches read as support but score ~4
// (length only). Genuine controversy (oppose stance, charged words, "!") scores
// 5+. This bar drops National-Forest-Week / memorial / choir-tribute noise.
const MIN_SHOCK   = 5;

// Mirror of computeShockScore() in app.js — keep in sync if that changes.
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

function main() {
    if (!fs.existsSync(CR_RAW)) { console.log('No data/cr_raw.json — run fetch_cr_data.js first.'); return; }
    const granules = JSON.parse(fs.readFileSync(CR_RAW, 'utf8'));
    if (!Array.isArray(granules) || !granules.length) { console.log('cr_raw.json is empty — nothing to extract.'); return; }

    const quotesData = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8'));
    const existing   = quotesData.quotes || [];
    const seen       = new Set(existing.map(q => `${q.name}|${(q.text || '').slice(0, 40)}`));

    // Gather candidates grouped by date.
    const byDate = {};
    for (const g of granules) {
        const cands = extractQuotesFromCR(g.text || '', '', '');   // empty bill args = general
        for (const q of cands) {
            if (q.stance !== 'oppose' && q.stance !== 'support') continue;   // spicy: drop neutral
            const shock = computeShockScore(q);
            if (shock < MIN_SHOCK) continue;                                 // spicy: drop ceremonial/low-heat
            const key = `${q.name}|${(q.text || '').slice(0, 40)}`;
            if (seen.has(key)) continue;
            (byDate[g.date] = byDate[g.date] || []).push({
                name: q.name, party: q.party, state: q.state, bioguideId: q.bioguideId,
                text: q.text,
                source: `${g.chamber} Floor, ${isoToDisplay(g.date)}`,
                stance: q.stance,
                billId: null, billTitle: null,
                chamber: g.chamber,
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

    console.log(`Added ${toAdd.length} general floor statement(s). Total quotes: ${quotesData.quotes.length}.`);
    const perDay = {};
    toAdd.forEach(e => { perDay[e.source] = (perDay[e.source] || 0) + 1; });
    Object.entries(perDay).sort().forEach(([s, n]) => console.log(`  + ${s}: ${n}`));
}

main();
