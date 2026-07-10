#!/usr/bin/env node
// test-security-helpers.js — hostile-payload tests for the keystone security
// helpers in util.js (escHtml, portraitUrl, safeBioId).
//
// WHY THIS EXISTS: every innerHTML sink in the app assumes these three helpers
// neutralize hostile strings. If a future edit weakens one of them (loosens the
// bioguide regex, drops an escaped character), every sink breaks at once with
// no visible symptom. This test makes that weakening impossible to do silently:
// it feeds attribute-breakout, javascript:-URL, and path-traversal payloads
// through each helper and asserts the output is inert.
//
// Runs in plain Node with zero dependencies:  node scripts/test-security-helpers.js
// Wired into: pre-commit hook (blocking), CI (blocking), npm test.
// See SECURITY.md for the invariant -> gate map.

'use strict';

const path = require('path');
const { escHtml, portraitUrl, safeBioId } = require(path.join(__dirname, '..', 'util.js'));

let failures = 0;
let passes = 0;

function check(desc, cond) {
  if (cond) { passes++; return; }
  failures++;
  console.error('  FAIL: ' + desc);
}

// Hostile payloads — attribute breakout, script injection, URL schemes, traversal.
const HOSTILE = [
  '"><img src=x onerror=alert(1)>',
  "'><script>alert(1)</script>",
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  '../../etc/passwd',
  '..\\..\\windows\\system32',
  '//evil.example.com/x.jpg',
  'C001098" onerror="alert(1)',
  "C001098' onmouseover='alert(1)",
  'C001098<script>',
  'C001098 ', // trailing space — must not pass the strict alphanumeric rule
  ' C001098',
  'C001098/../../photo',
  'id&param=1',
  '${alert(1)}',
  '  ', // JS line separators
];

// Non-string junk the helpers can receive from ingested JSON — must never throw.
const JUNK = [null, undefined, 0, 42, true, false, {}, [], NaN];

// ── escHtml ────────────────────────────────────────────────────────────────
console.log('escHtml:');

// The five sensitive characters must always be escaped.
const esc = escHtml('&<>"\'');
check('escapes all 5 sensitive chars', esc === '&amp;&lt;&gt;&quot;&#39;');

for (const p of HOSTILE) {
  const out = escHtml(p);
  check(`neutralizes ${JSON.stringify(p)}`, !/[<>"']/.test(out));
}

// Escaped output must not contain a raw ampersand that isn't part of an entity.
check('no bare ampersands survive', !/&(?!amp;|lt;|gt;|quot;|#39;)/.test(escHtml('a & b &< c')));

for (const j of JUNK) {
  let ok = true;
  try { const out = escHtml(j); ok = typeof out === 'string' && !/[<>"']/.test(out); }
  catch (e) { ok = false; }
  check(`does not throw / leaks nothing on ${String(j)}`, ok);
}

// ── portraitUrl ────────────────────────────────────────────────────────────
console.log('portraitUrl:');

// Contract: hostile or malformed input -> the inline-SVG fallback, never a URL
// built from the hostile string. Valid ids -> https bioguide/override URL that
// is attribute-safe (no quotes, spaces, angle brackets, backticks).
const FALLBACK = portraitUrl(null); // null is documented to return the fallback
check('fallback is a data:image/svg URI', typeof FALLBACK === 'string' && FALLBACK.startsWith('data:image/svg+xml'));

for (const p of HOSTILE) {
  check(`rejects ${JSON.stringify(p)}`, portraitUrl(p) === FALLBACK);
}
for (const j of JUNK) {
  let ok = true;
  try { ok = portraitUrl(j) === FALLBACK; } catch (e) { ok = false; }
  check(`falls back without throwing on ${String(j)}`, ok);
}

const valid = portraitUrl('C001098');
check('valid id -> https bioguide URL', valid === 'https://bioguide.congress.gov/bioguide/photo/C/C001098.jpg');
check('lowercase id normalized upward', portraitUrl('c001098') === valid);
check('PHOTO_OVERRIDES honored (C001115)', portraitUrl('C001115') === 'https://clerk.house.gov/images/members/C001115.jpg');

// Every possible return value must be attribute-safe as-is. (The fallback
// data-URI legitimately contains spaces — harmless inside a quoted attribute;
// what must never appear is a quote, angle bracket, or backtick.)
for (const id of ['C001098', 'C001115', 'B000944', null, 'x']) {
  const out = portraitUrl(id);
  check(`output attribute-safe for ${JSON.stringify(id)}`, !/[<>"'`]/.test(out));
}

// ── safeBioId ──────────────────────────────────────────────────────────────
console.log('safeBioId:');

// Contract: strictly alphanumeric in -> unchanged out; anything else -> ''.
for (const p of HOSTILE) {
  check(`rejects ${JSON.stringify(p)}`, safeBioId(p) === '');
}
for (const j of JUNK) {
  let ok = true;
  try { ok = safeBioId(j) === ''; } catch (e) { ok = false; }
  check(`returns '' without throwing on ${String(j)}`, ok);
}
check('valid id passes through', safeBioId('C001098') === 'C001098');
check('output always /^[A-Za-z0-9]*$/', /^[A-Za-z0-9]*$/.test(safeBioId('C001098')) && /^[A-Za-z0-9]*$/.test(safeBioId('"><x>')));

// ── result ─────────────────────────────────────────────────────────────────
console.log('');
if (failures > 0) {
  console.error(`X security-helper tests: ${failures} FAILED, ${passes} passed`);
  console.error('  A keystone sanitizer in util.js no longer neutralizes hostile input.');
  console.error('  Do NOT weaken these helpers — every innerHTML sink depends on them.');
  process.exit(1);
}
console.log(`OK security-helper tests: ${passes} passed, 0 failed`);
