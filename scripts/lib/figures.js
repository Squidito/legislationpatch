// figures.js -- how a dollar figure in ANALYSIS PROSE is tokenized and valued.
//
// One definition, because there were two and they drifted into the same bug:
// qa-source-verify.js (figure-sourcing flags) and lib/attribution.js (the
// "right number, wrong account" guard) each carried a private copy.
//
// THE BUG (found 2026-08-27). Both copies wrote the unit as `\s*(B|M|K)?` with
// no word boundary after it, so the regex took the FIRST LETTER OF THE NEXT WORD
// as a multiplier:
//     "$15,000 base"        -> $15,000 B  = $15 TRILLION
//     "$400 monthly"        -> $400M
//     "$9,000 minimum"      -> $9B
//     "$120 but"            -> $120B
//     "$96,000,000, Board"  -> $96 quadrillion
// False FLAGS only, never false passes -- an inflated value is simply not found
// in the source, so nothing wrong ever shipped. But roughly 27 strings corpus-wide
// carried noise flags, and noise is exactly what trains a reviewer to skim past a
// real one.
//
// Requiring \b after the unit letter fixes that. On its own it would REGRESS the
// spelled-out forms, which only ever worked by accident: "$15 billion" parsed
// because the "b" of "billion" happened to be the right multiplier. So the
// spelled-out words are matched deliberately now -- and "$2 thousand", which the
// old regex read as a bare $2, scales correctly for the first time.
//
// Note the token STRING is what the QA adjudication ledger keys on (exact match
// on billId+kind+token+path), so changing tokenization deliberately re-opens the
// adjudications that were keyed on a mis-parsed token. That is the intended
// behaviour: those adjudications were recorded against a figure the verifier had
// mis-read, and must be re-verified against source rather than carried forward.

'use strict';

// Every dollar figure in a string, with its unit if it has one.
const DOLLAR_TOKEN_RE = /\$[0-9][0-9,.]*(?:\s*(?:B|M|K)\b|\s+(?:billion|million|thousand|trillion)\b)?/gi;
// The same shape, capturing, for valuing a single token.
const DOLLAR_PARSE_RE = /\$([0-9][0-9,.]*)(?:\s*(B|M|K)\b|\s+(billion|million|thousand|trillion)\b)?/i;

const UNIT_SCALE = { B: 1e9, BILLION: 1e9, M: 1e6, MILLION: 1e6, K: 1e3, THOUSAND: 1e3, TRILLION: 1e12 };

/** Every dollar token in `s`, in order. */
function dollarTokens(s) {
  return String(s || '').match(DOLLAR_TOKEN_RE) || [];
}

/** "$3.0B" -> 3000000000. Returns null if `tok` is not a dollar figure. */
function shortToVal(tok) {
  const m = String(tok).match(DOLLAR_PARSE_RE);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  const u = (m[2] || m[3] || '').toUpperCase();
  return u ? n * UNIT_SCALE[u] : n;
}

module.exports = { DOLLAR_TOKEN_RE, DOLLAR_PARSE_RE, UNIT_SCALE, dollarTokens, shortToVal };
