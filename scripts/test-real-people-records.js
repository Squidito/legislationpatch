#!/usr/bin/env node
// test-real-people-records.js — two stored-record checks on real members (HOTFIX-REAL-PEOPLE-2, 2026-10-26).
//
//   1. SPONSOR <-> PORTRAIT. bill.sponsor ("Rep. Steil, Bryan (R-WI-1)") and bill.sponsor_bioguide must name the
//      SAME member in the repo's own roster (data/reps-index.json, else data/reps/<id>.json): same last name,
//      party and state. 119-HR-7008 carried S001215 (Haley M. Stevens, D-MI) on Rep. Bryan Steil's bill, so the
//      card portrait, its alt text and the app RepPortrait showed a Democrat's photo on a Republican's bill.
//   2. NO SUPPORTER UNDER «Opposed — who and why». A criticisms[] entry whose text is the start of the SAME
//      speaker's featured quote stored with stance "support" is a supporter filed as an opponent (119-HR-5625
//      Harris, 119-HR-3490 Garcia, 119-HR-1329 De La Cruz). The member-page copy of that speech
//      (data/reps/<id>.json comments[]) must not carry stance "oppose" either.
//
// Reads data/cache.json, data/bills/*.json, data/reps-index.json, data/reps/*.json. No network, nothing written.
//   node scripts/test-real-people-records.js     (also in npm test)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

let failures = 0;
// KNOWN OPEN — a reviewed, not-yet-fixed case ('crit|<billId>|<who>' or 'comment|<bioguideId>|<billId>'); a stale
// entry fails the test. EMPTY: the 7 further cases this test found on 2026-10-26 were fixed in the same hotfix
// (James 10-26 «Add the 7 yes»). Root cause still open: fetch_bill_cr.js builds criticisms from stance data and
// never clears stale entries.
const KNOWN_OPEN = new Set([]);
const openSeen = new Set();
const fail = (m) => { failures++; console.error('  x ' + m); };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const roster = {};
for (const arr of Object.values(readJson(path.join(DATA, 'reps-index.json')))) for (const r of arr) roster[r.bioguideId] = r;
const member = (id) => {
  if (roster[id]) return roster[id];
  const p = path.join(DATA, 'reps', id + '.json');
  return fs.existsSync(p) ? readJson(p) : null;
};

const cache = readJson(path.join(DATA, 'cache.json'));
const billFiles = fs.readdirSync(path.join(DATA, 'bills')).filter(f => f.endsWith('.json'));
const sources = [['data/cache.json', cache.bills]].concat(billFiles.map(f => ['data/bills/' + f, [readJson(path.join(DATA, 'bills', f))]]));

// 1. sponsor <-> sponsor_bioguide
let checked = 0;
for (const [where, bills] of sources) for (const b of bills) {
  if (!b.sponsor_bioguide) continue;
  const m = String(b.sponsor || '').match(/^(?:Sen\.|Rep\.|Del\.|Com\.|Resident Commissioner)\s+([^,]+),.*[([]([A-Z]+)-([A-Z]{2})(?:-[0-9A-Z]+)?[)\]]\s*$/);
  if (!m) { fail(`${where} ${b.id}: unparseable sponsor «${b.sponsor}»`); continue; }
  const [, last, party, state] = m;
  const r = member(b.sponsor_bioguide);
  checked++;
  if (!r) { fail(`${where} ${b.id}: sponsor_bioguide ${b.sponsor_bioguide} is not in the roster`); continue; }
  const lastOk = fold(r.name).split(/[\s,.]+/).includes(fold(last).split(/\s+/).pop()) || fold(r.name).includes(fold(last));
  const partyOk = String(r.party || '').toUpperCase()[0] === party[0];
  const stateOk = String(r.state || '').toUpperCase() === state;
  if (!lastOk || !partyOk || !stateOk) fail(`${where} ${b.id}: sponsor «${b.sponsor}» but sponsor_bioguide ${b.sponsor_bioguide} = ${r.name} (${r.party}-${r.state})`);
}
console.log(`  1. sponsor <-> sponsor_bioguide: ${checked} record(s) checked`);

// 2. supporters under criticisms[]; member-page stance of the same speech
const head = (s) => fold(s).replace(/\s+/g, ' ').trim().slice(0, 80);
let crits = 0;
const supportSpeech = new Map();   // bioguideId|head -> billId
for (const [where, bills] of sources) for (const b of bills) {
  const support = (b.featured_quotes || []).filter(q => q.stance === 'support');
  for (const q of support) if (q.bioguideId) supportSpeech.set(q.bioguideId + '|' + head(q.text), b.id);
  for (const c of (b.criticisms || [])) {
    crits++;
    const hit = support.find(q => head(c.why) && head(q.text) === head(c.why));
    if (hit && KNOWN_OPEN.has(`crit|${b.id}|${c.who}`)) { openSeen.add(`crit|${b.id}|${c.who}`); continue; }
    if (hit) fail(`${where} ${b.id}: «Opposed — who and why» lists ${c.who}, whose stored quote is stance "support": «${String(c.why).slice(0, 70)}…»`);
  }
}
let comments = 0;
for (const f of fs.readdirSync(path.join(DATA, 'reps')).filter(f => f.endsWith('.json'))) {
  const rep = readJson(path.join(DATA, 'reps', f));
  for (const c of (rep.comments || [])) {
    comments++;
    const bill = supportSpeech.get(rep.bioguideId + '|' + head(c.text));
    if (bill && bill === c.billId && c.stance === 'oppose' && KNOWN_OPEN.has(`comment|${rep.bioguideId}|${c.billId}`)) { openSeen.add(`comment|${rep.bioguideId}|${c.billId}`); continue; }
    if (bill && bill === c.billId && c.stance === 'oppose') fail(`data/reps/${f}: comment on ${c.billId} is stance "oppose" but the same speech is stored as "support" on the bill: «${String(c.text).slice(0, 70)}…»`);
  }
}
for (const k of KNOWN_OPEN) if (!openSeen.has(k)) fail(`KNOWN_OPEN entry no longer found (fixed?) — remove it: ${k}`);
console.log(`  2. criticisms checked: ${crits}; member-page comments checked: ${comments}; known open (not fixed, listed for oversight): ${KNOWN_OPEN.size}`);

if (failures) { console.error(`\nX test-real-people-records: ${failures} failure(s).`); process.exit(1); }
console.log('OK test-real-people-records: every sponsor portrait id names the sponsor; no supporter is filed as opposed.');
