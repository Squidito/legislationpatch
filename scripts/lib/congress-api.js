// congress-api.js — Congress.gov API wrappers shared by pipeline scripts.
// Part of scripts/lib/ (B2 extraction, 2026-07-06). Replaces THREE independently
// drifting fetchBillActions copies (batch_processor.js, fetch_vote_data.js,
// refresh_stages.js) — and fixes the latent single-page cap: the old copies
// fetched at most 250 actions with no pagination, silently truncating
// long-lived bills' action lists.

const { CONGRESS_API_KEY } = require('./config.js');
const { sleep, fetchWithRetry } = require('./fetch-helpers.js');

// Fetch ALL actions for a bill, paginated.
// Returns: Array (possibly empty) on success; [] on 404 (bill has no actions);
//          null after exhausting retries (fetch failed — callers that don't
//          care about the distinction use `(await fetchBillActions(...)) || []`).
// opts.pace — politeness delay before the first request (ms), matching the old
// callers' per-bill pacing (batch/vote used 2000, refresh used 1500).
async function fetchBillActions(congress, type, number, { pace = 1500, tries = 3 } = {}) {
    const PAGE = 250, MAX_PAGES = 8; // 2,000 actions — far beyond any real bill
    const all = [];
    await sleep(pace);
    for (let page = 0; page < MAX_PAGES; page++) {
        const url = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}/actions`
                  + `?format=json&limit=${PAGE}&offset=${page * PAGE}&api_key=${CONGRESS_API_KEY}`;
        let res;
        try {
            res = await fetchWithRetry(url, { tries, baseDelay: 3000, label: `${congress}-${type}-${number} actions` });
        } catch { return null; }
        if (res.status === 404) return page === 0 ? [] : all;
        if (!res.ok) return null;
        const batch = (await res.json()).actions || [];
        all.push(...batch);
        if (batch.length < PAGE) break;   // last page
        await sleep(800);                 // between-page pacing
    }
    return all;
}

function formatBillTypeForRecord(type) {
    const map = {
        'HR': 'H.R.', 'HRES': 'H. Res.', 'HJRES': 'H.J. Res.', 'HCONRES': 'H. Con. Res.',
        'S':  'S.',   'SRES': 'S. Res.', 'SJRES': 'S.J. Res.', 'SCONRES': 'S. Con. Res.',
    };
    return map[type.toUpperCase()] || type;
}

module.exports = { fetchBillActions, formatBillTypeForRecord };
