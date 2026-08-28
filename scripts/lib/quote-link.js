// quote-link.js -- link a STORED floor quote to a cached bill (the second quote linker).
//
// Consumer: generate_reps.js, which re-runs this over data/quotes.json on every
// `npm run reps` / `npm run batch:post`. Its sibling is extract_floor_quotes.js
// granuleBill(), which links at EXTRACTION time and has the granule body to work
// with; this one only ever sees the stored quote record.
//
// A WRONG link is worse than no link.
//
// HISTORY (why this file exists). attributeQuotesToBills used to keyword-score
// every cached bill against the quote text and take the winner above a threshold:
//   * 2026-08-12 batch: a hemp-amendment quote -> "KIDS Act" (119-HR-7757) on the
//     shared word "kids". That incident hardened extract_floor_quotes.js ONLY --
//     this second linker was missed and kept re-firing on every batch:post.
//   * 2026-08-27: a Grassley Senate floor statement about socialism -> 119-HR-5269
//     "RESULTS Act", because the quote contains "the failed results that we have
//     witnessed". Score 6, matchCount 2 -- exactly the old threshold.
// Reverting a billId to null was NOT durable: the scorer skipped only quotes that
// already HAD a billId, so the next run re-created the mislink from stored inputs.
//
// THE RULE (mirrors granuleBill(), reduced to the signals that survive in a stored
// quote record -- the granule BODY is not stored, so granuleBill's dominant-subject
// signal is not computable here and is deliberately absent):
//   (a) HEADING  -- the stored debate heading cites exactly one cached bill; or
//   (b) EXPLICIT -- the quote's own text cites exactly one cached bill.
// Two cached bills cited = ambiguous = no link. Thematic similarity = never a link.
// Fewer attributed quotes is the intended outcome.

'use strict';

const { soleCachedRef } = require('./bill-refs');

// Mutates `quotes` in place; returns how many gained a billId.
function attributeQuotesToBills(quotes, bills, congress = process.env.CONGRESS_SESSION || '119', log = console.log) {
  const cacheTitle = {};
  for (const b of (bills || [])) if (b && b.id) cacheTitle[b.id] = b.title || b.official_title || null;
  const cachedIds = new Set(Object.keys(cacheTitle));
  const cong = String(congress);
  let count = 0;
  for (const q of (quotes || [])) {
    if (q.billId) continue;
    // Heading first -- a debate heading naming one cached bill is the strongest
    // signal available here, same precedence as granuleBill().
    const link = soleCachedRef(q.granuleTitle || '', cachedIds, cacheTitle, cong)
              || soleCachedRef(q.text || '',        cachedIds, cacheTitle, cong);
    if (!link) continue;
    q.billId    = link.id;
    q.billTitle = link.title;
    count++;
    if (log) log(`  [attr] "${(q.text || '').slice(0, 55)}..." → ${link.id} (explicit citation)`);
  }
  return count;
}

module.exports = { attributeQuotesToBills };
