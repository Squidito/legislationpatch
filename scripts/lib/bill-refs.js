// bill-refs.js -- extract bill references ("H.R. 1234", "H. Con. Res. 40", "S. 5")
// out of prose and turn them into normalized cache ids.
//
// Extracted from extract_floor_quotes.js 2026-08-27 so the SECOND quote linker
// (generate_reps.js attributeQuotesToBills) can share the same hardened rule
// instead of keyword-scoring. Both linkers now answer one question through this
// module: "does this text cite exactly one cached bill BY NUMBER?"
//
// The governing principle, learned twice (the 2026-08-12 "kids" -> KIDS Act batch
// mislink, and the 2026-08-27 Grassley-socialism -> RESULTS Act mislink): a WRONG
// link is worse than no link. Thematic/keyword similarity is never a link signal.

'use strict';

// Longest forms first; the lookbehind blocks the "U.S. 50" -> "S. 50" false match.
const BILL_REF_RE = /(?<![A-Za-z]\.)\b(H\.?\s?Con\.?\s?Res\.?|S\.?\s?Con\.?\s?Res\.?|H\.?\s?J\.?\s?Res\.?|S\.?\s?J\.?\s?Res\.?|H\.?\s?Res\.?|S\.?\s?Res\.?|H\.?\s?R\.?|S\.?)\s?(\d{1,5})\b/gi;
const REF_TYPE = { HR:'HR', HJRES:'HJRES', HCONRES:'HCONRES', HRES:'HRES', SJRES:'SJRES', SCONRES:'SCONRES', SRES:'SRES', S:'S' };

const defaultCongress = () => process.env.CONGRESS_SESSION || '119';

// Every distinct bill id cited in `text` (deduped).
function billRefsInText(text, congress = defaultCongress()) {
    const out = new Set();
    for (const m of (text || '').matchAll(BILL_REF_RE)) {
        const t = REF_TYPE[m[1].toUpperCase().replace(/[^A-Z]/g, '')];
        if (t) out.add(`${congress}-${t}-${m[2]}`);
    }
    return out;
}

// How often each bill id is cited -- used to find a granule's dominant SUBJECT bill.
function countBillRefs(text, congress = defaultCongress()) {
    const counts = {};
    for (const m of (text || '').matchAll(BILL_REF_RE)) {
        const t = REF_TYPE[m[1].toUpperCase().replace(/[^A-Z]/g, '')];
        if (t) { const id = `${congress}-${t}-${m[2]}`; counts[id] = (counts[id] || 0) + 1; }
    }
    return counts;
}

// THE explicit-citation signal: `text` cites exactly one CACHED bill by number.
// Two cached bills = ambiguous = no link. Zero = no link. Never guesses.
// `cachedIds` is a Set of cache ids; `cacheTitle` an optional id -> title map.
function soleCachedRef(text, cachedIds, cacheTitle = {}, congress = defaultCongress()) {
    const refs = [...billRefsInText(text, congress)].filter(id => cachedIds.has(id));
    return refs.length === 1 ? { id: refs[0], title: cacheTitle[refs[0]] || null } : null;
}

module.exports = { BILL_REF_RE, REF_TYPE, billRefsInText, countBillRefs, soleCachedRef };
