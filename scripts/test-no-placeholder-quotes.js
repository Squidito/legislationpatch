#!/usr/bin/env node
// Guard (oversight 2026-10-25, plan rows 237 / 240; widened HOTFIX-REAL-PEOPLE-2 2026-10-26): the site's
// client code must never again carry hard-coded quotes attributed to real members.
//   - The April 2026 «Placeholder shock quotes» array (4 invented quotes: Greene, Crockett, Tuberville,
//     Tlaib) reached the live carousel pool; removed from main (1cd695e1c) and qa/v6 (3ce5d8a22).
//   - api.js getDemoBills() (3 invented bills «sponsored» by Klobuchar, Pallone and Wicker, with quoted
//     comments from Klobuchar, Capito, Barrasso, Matsui, Thune, Sanders, Wicker, Warren and Gallego)
//     was shown whenever data/cache.json failed to load; removed (field-gap list D10).
// Every quote shown must come from stored, receipted data.
//
// Scans:
//   1. EVERY tracked client file — all .js / .html outside scripts/, data/ and node_modules/ (root
//      scripts, generated bill / rep / article / topic pages) — for the known invented texts.
//   2. Every client .js file for the STRUCTURE of a hard-coded attributed quote:
//      (a) an object literal with a literal member name («Rep./Sen./Mr./Mrs./Ms. …») in name / who /
//          speaker AND a literal text / quote / why string;
//      (b) an object literal with a literal bioguideId AND a literal text / quote string;
//      (c) a string literal that opens «Rep./Sen. Name (P-ST): '…» — a quote put in a member's mouth.
//   Generated HTML is exempt from (2): it legitimately renders STORED quotes from data/.
//
//   node scripts/test-no-placeholder-quotes.js      (also in npm test)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SKIP_DIRS = new Set(['scripts', 'data', 'node_modules', '_worktrees', '.git', 'docs', 'shared']);
const files = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!(rel === '' && SKIP_DIRS.has(e.name)) && e.name !== 'node_modules' && e.name !== '.git') walk(path.join(dir, e.name), rel + e.name + '/'); }
    else if (/\.(js|mjs|html)$/.test(e.name)) files.push(rel + e.name);
  }
})(ROOT, '');

const BANNED = [
  // 4 invented «shock quotes»
  /SHOCK_QUOTES/,
  /Placeholder shock quotes/i,
  /socialism with a bow on it/i,
  /I cannot do this job without screaming/i,
  /funding mental health programs for people who just do not want to work/i,
  /voted yes anyway\. Remember their names/i,
  // api.js getDemoBills()
  /getDemoBills/,
  /American Infrastructure Renewal Act of 2025/i,
  /Protecting Medicare's Drug Pricing Negotiation Act/i,
  /largest bridge investment since the Highway Act/i,
  /wants prevailing wage provisions removed/i,
  /market should drive EV adoption, not mandates/i,
  /Closes the digital divide\. Strongly in favor/i,
  /Pharma has gotten away with price gouging/i,
  /reduce R&D investment for rare diseases/i,
  /Good start — we need full Medicare for All/i,
  /maintain our edge over China and Russia/i,
  /audit the Pentagon before writing blank checks/i,
  /Bipartisan support — our troops deserve this/i,
  /Prevailing wage requirements are seen as inflating project costs/i,
];

const MEMBER_NAME = new RegExp(`\\b(?:name|who|speaker)\\s*:\\s*['"\`](?:Rep|Sen|Mr|Mrs|Ms)\\.?\\s`);
const MEMBER_ID   = /\bbioguideId\s*:\s*['"`][A-Z]\d{6}['"`]/;
const QUOTE_TEXT  = /\b(?:text|quote|why)\s*:\s*['"`][^'"`\n]{12,}/;
const SAID        = /['"`](?:Rep|Sen)\.\s+[A-Z][\w'.-]*(?:\s+[A-Z][\w'.-]*)*\s*\([DRI]-[A-Z]{2}[^)]*\)\s*:\s*['"]/;

let bad = 0;
const hit = (msg) => { console.error('  ✗ ' + msg); bad++; };
let jsCount = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const re of BANNED) if (re.test(src)) hit(`${f}: matches ${re}`);
  if (!f.endsWith('.js') && !f.endsWith('.mjs')) continue;
  jsCount++;
  for (const o of (src.match(/\{[^{}]*\}/g) || [])) {
    if ((MEMBER_NAME.test(o) || MEMBER_ID.test(o)) && QUOTE_TEXT.test(o)) hit(`${f}: hard-coded quote attributed to a member: ${o.replace(/\s+/g, ' ').slice(0, 140)}`);
  }
  const lines = src.split('\n');
  lines.forEach((l, i) => { if (SAID.test(l)) hit(`${f}:${i + 1}: string puts a quote in a member's mouth: ${l.trim().slice(0, 140)}`); });
}
if (bad) { console.error(`test-no-placeholder-quotes: ${bad} hit(s) — hard-coded / invented quotes are banned in client code`); process.exit(1); }
console.log(`test-no-placeholder-quotes: ok (${files.length} client files incl. ${jsCount} .js, ${BANNED.length} text patterns + 3 structure rules)`);
