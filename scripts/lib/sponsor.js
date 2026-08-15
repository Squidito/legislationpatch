// sponsor.js -- rendering a sponsor's name in PROSE.
//
// `bill.sponsor` is stored as Congress.gov returns it: "Rep. Cole, Tom (R-OK-4)".
// That is a SORT KEY -- last name first -- and printing it in a sentence gives
// "Sponsored by Rep. Cole, Tom (R-OK-4)", which no human would write.
//
// Extracted from generate_bill_pages.js (2026-08-14) after the Dispatch lane
// rendered the raw field and shipped exactly that. Same defect class as the
// HR.5625-vs-H.R. 5625 bug that produced lib/bill-code.js: a lookup key used as
// prose, while a correct formatter already existed elsewhere in the codebase and
// was not shared. Both were caught by LOOKING AT THE RENDERED PAGE, not by any
// gate -- the fidelity gate verifies facts, not whether prose reads like English.
//
// Note the sibling helper `sponsorShort()` in util.js does something DIFFERENT
// and is not a substitute: it produces "COLE (R-OK-4)" for compact bill-card
// labels, and is mirrored in the mobile app. This is the prose form.

'use strict';

// Every honorific Congress.gov actually uses. The extracted original stripped
// only Sen./Rep./Dr./Mr./Ms., so a DELEGATE came out doubled and inverted:
// "Del. Norton, Eleanor Holmes (D-DC)" -> the "Del." survived into the name,
// the comma split made the last name "Del. Norton", and sponsorInline then
// prepended the honorific again -> "Del. Eleanor Holmes Del. Norton (D-DC)".
// No bill in the corpus has a delegate sponsor today, so nothing shipped wrong;
// it would have fired the first time one did. Kept in ONE place so the two
// callers cannot drift.
const HONORIFIC = /^(Sen\.|Rep\.|Del\.|Com\.|Dr\.|Mr\.|Ms\.|Resident Commissioner)\s+/;

/** "Sen. Britt, Katie Boyd (R-AL)" -> "Katie Boyd Britt" (schema.org Person). */
function sponsorPersonName(raw) {
  let s = String(raw || '').replace(/\s*\([^)]*\)\s*$/, '')
    .replace(HONORIFIC, '').trim();
  if (s.includes(',')) {
    const [last, first] = s.split(',').map(x => x.trim());
    s = `${first} ${last}`.trim();
  }
  return s;
}

/** "Sen. Britt, Katie Boyd (R-AL)" -> "Sen. Katie Boyd Britt (R-AL)" for prose. */
function sponsorInline(sponsorOrBill) {
  const raw = String(
    (sponsorOrBill && typeof sponsorOrBill === 'object' ? sponsorOrBill.sponsor : sponsorOrBill) || ''
  ).trim();
  if (!raw) return '';
  const hon = (raw.match(HONORIFIC) || [])[1] || '';
  const party = (raw.match(/\(([^)]*)\)\s*$/) || [])[1] || '';
  const name = sponsorPersonName(raw);
  return `${hon ? hon + ' ' : ''}${name}${party ? ` (${party})` : ''}`.trim();
}

module.exports = { sponsorPersonName, sponsorInline };
