#!/usr/bin/env node
// test-figures.js -- teeth for the dollar tokenizer (lib/figures.js).
//
// WHY THIS EXISTS: the unit letter had no word boundary after it, so
// `\s*(B|M|K)?` took the first letter of the NEXT WORD as a multiplier --
// "$15,000 base" was valued as $15 TRILLION, "$400 monthly" as $400M. False
// flags only, never false passes, but noise is what trains a reviewer to skim
// past a real flag. Two scripts carried independent copies of the same bug.
//
// The fix has a trap on the other side: requiring \b would REGRESS "$15 billion",
// which only ever worked because the "b" of "billion" happened to be the right
// multiplier. Both directions are pinned here, because a future tightening that
// silently drops the spelled-out forms would break real figure verification and
// nothing else would notice.
//
// Also asserts the SEEDED cases the fix was proven against end to end:
// a seeded "$15,000" must not read as trillions, a real "$15B" must still
// verify, a fabricated "$99B" must still be unfindable.
//
// Zero dependencies, no network, nothing written:
//   node scripts/test-figures.js      (or: npm run figures:test)

'use strict';

const { dollarTokens, shortToVal } = require('./lib/figures.js');

let passes = 0, failures = 0;

function check(desc, cond, extra) {
  if (cond) { passes++; console.log('  ok    ' + desc); return true; }
  failures++;
  console.error('  FAIL  ' + desc + (extra ? '\n          ' + extra : ''));
  return false;
}

/** First token in `s`, and its value. */
function read(s) {
  const t = dollarTokens(s)[0];
  return { token: t, value: t == null ? null : shortToVal(t) };
}

function expect(s, token, value) {
  const got = read(s);
  check(`${JSON.stringify(s)} -> ${JSON.stringify(token)} = ${value}`,
    got.token === token && got.value === value,
    `got ${JSON.stringify(got.token)} = ${got.value}`);
}

console.log('\nDollar tokenizer teeth\n');

console.log('  -- the bug: a following word is never a unit --');
expect('$15,000 base rate',        '$15,000',      15000);          // was $15 trillion
expect('$400 monthly',             '$400',         400);            // was $400M
expect('$9,000 minimum penalty',   '$9,000',       9000);           // was $9B
expect('a fee of $120 but not more', '$120',       120);            // was $120B
expect('$96,000,000, Board of',    '$96,000,000,', 96000000);       // was $96 quadrillion
expect('$5 kilometres away',       '$5',           5);
expect('$7 billing cycles',        '$7',           7);

console.log('\n  -- real units still scale --');
expect('$15B',            '$15B',          15e9);
expect('$3.0B for NASA',  '$3.0B',         3e9);
expect('$584.3M',         '$584.3M',       584.3e6);
expect('$50K',            '$50K',          50e3);
expect('$7.5B.',          '$7.5B',         7.5e9);
expect('$2 B per year',   '$2 B',          2e9);

console.log('\n  -- spelled-out forms, matched deliberately not by accident --');
expect('$15 billion',     '$15 billion',   15e9);
expect('$3.0 million',    '$3.0 million',  3e6);
expect('$10 billion, up', '$10 billion',   10e9);
expect('$2 thousand',     '$2 thousand',   2e3);   // old regex read this as a bare $2
expect('$1.5 trillion',   '$1.5 trillion', 1.5e12);

console.log('\n  -- plain figures and non-figures --');
expect('$1,234 flat',  '$1,234', 1234);
check('no dollar sign yields no token', dollarTokens('15,000 base').length === 0);
check('a bare "$" yields no token',     dollarTokens('costs $ and time').length === 0);
check('every figure in a list is found',
  dollarTokens('$45 and $105 and $63.51').join('|') === '$45|$105|$63.51',
  dollarTokens('$45 and $105 and $63.51').join('|'));

console.log('\n  -- the seeded end-to-end cases --');
check('a seeded $15,000 does not read as trillions',
  shortToVal(dollarTokens('penalty of $15,000 base')[0]) === 15000);
check('a real $15B still values as 15 billion',
  shortToVal(dollarTokens('appropriates $15B')[0]) === 15e9);
check('a fabricated $99B still values as 99 billion (so it is looked for, and missed)',
  shortToVal(dollarTokens('appropriates $99B')[0]) === 99e9);

console.log('\n' + passes + ' passed, ' + failures + ' failed\n');
process.exit(failures ? 1 : 0);
