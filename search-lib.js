// search-lib.js — shared client-side search matcher for data/search-index.json.
// Pure functions, no DOM. Loaded by search.js on the website; mirrored on
// mobile in lib/search.ts (keep the two in sync — same contract as util.js).
// Dual-mode: browser global + Node module.exports.

// Result-group order is a product decision: bills first, then reps (name-shaped
// queries usually want the person), quotes, guides last.
const SEARCH_TYPE_ORDER = ['bill', 'rep', 'quote', 'article'];

// Canonical bill-code form: "H.R. 40" / "hr40" / "h con res 40" / "119-hr-40"
// all -> "hr40". Must stay in sync with codeNorm() in generate-search-index.js.
function normalizeBillCodeQuery(str) {
  const m = String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    .match(/^(?:\d{2,3})?(hconres|sconres|hjres|sjres|hres|sres|hr|s)(\d+)$/);
  return m ? m[1] + m[2] : null;
}

function searchTokenize(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean);
}

// Score one record against pre-tokenized query terms.
// Field weights: title dominates, sub (code/party/stage line) next, body text last.
// Every query term must match somewhere (AND semantics); an exact bill-code hit
// short-circuits that requirement and outranks everything.
function scoreRecord(rec, terms, queryCode) {
  if (queryCode && rec.code === queryCode) return 1000;

  let total = 0;
  for (const term of terms) {
    let best = 0;
    for (const [field, weight] of [['title', 10], ['sub', 4], ['text', 2]]) {
      const tokens = rec._tok[field];
      for (const tok of tokens) {
        if (tok === term) { best = Math.max(best, weight); break; }
        if (term.length >= 2 && tok.startsWith(term)) best = Math.max(best, weight * 0.6);
      }
      if (best >= weight) break; // exact hit in the strongest remaining field
    }
    if (best === 0) return 0; // AND: a term with no match anywhere kills the record
    total += best;
  }
  return total;
}

// records: array from search-index.json. query: raw user string.
// typeFilter: 'all' or one of SEARCH_TYPE_ORDER.
// Returns [{...record, score}] sorted by score desc (stable within equal scores).
function searchRecords(records, query, typeFilter) {
  const terms = searchTokenize(query);
  if (!terms.length) return [];
  const queryCode = normalizeBillCodeQuery(query);

  const results = [];
  for (const rec of records) {
    if (typeFilter && typeFilter !== 'all' && rec.t !== typeFilter) continue;
    if (!rec._tok) {
      rec._tok = { title: searchTokenize(rec.title), sub: searchTokenize(rec.sub), text: searchTokenize(rec.text) };
    }
    const score = scoreRecord(rec, terms, queryCode);
    if (score > 0) results.push({ rec, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.map(r => Object.assign({ score: r.score }, r.rec));
}

// Node interop for the parity checker / tests (no-op in the browser).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SEARCH_TYPE_ORDER, normalizeBillCodeQuery, searchTokenize, searchRecords };
}
