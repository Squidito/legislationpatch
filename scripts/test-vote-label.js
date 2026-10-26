#!/usr/bin/env node
// test-vote-label.js — teeth for the rep-page vote badge (util.voteBadge).
//
// WHY THIS EXISTS. rep.js and generate_rep_pages.js each mapped the stored
// voteHistory[].vote with substring tests, and checked includes('no') BEFORE
// 'not' — so every stored "Not Voting" printed as a red "Nay" badge: a vote the
// member did not cast (1,490 rows on 351 static member pages, HOTFIX-REAL-PEOPLE-2,
// 2026-10-26). Both now call ONE exact table in util.js.
//
// Checks (zero dependencies, no network, nothing written):
//   1. every DISTINCT stored vote value in data/votes/*.json (members[] and
//      crossovers[]) and data/reps/*.json (voteHistory[]) has a reviewed
//      expected badge below — a new value fails until someone decides it;
//   2. no value outside Yea/Yes/Aye→Yea-side or Nay/No→Nay-side ever renders
//      as "Yea" or "Nay";
//   3. the static generator's row renderer uses the shared table;
//   4. rep.js calls voteBadge and carries no substring vote matching;
//   5. no committed rep/<slug>/index.html shows a "Nay" badge on a row whose
//      stored vote is "Not Voting".
//
//   node scripts/test-vote-label.js

'use strict';

const fs = require('fs');
const path = require('path');
const { voteBadge } = require('../util.js');

const ROOT = path.join(__dirname, '..');
let failures = 0;
const fail = (msg) => { failures++; console.error('  x ' + msg); };

// Reviewed expectations for every stored value. "Aye" / "Present" print as
// stored with the neutral style — unchanged by this hotfix (see handback).
const EXPECTED = {
  'Yea':        { label: 'Yea',        cls: 'rv-yea' },
  'Nay':        { label: 'Nay',        cls: 'rv-nay' },
  'No':         { label: 'Nay',        cls: 'rv-nay' },
  'Not Voting': { label: 'Not Voting', cls: 'rv-nv'  },
  'Aye':        { label: 'Aye',        cls: 'rv-nv'  },
  'Present':    { label: 'Present',    cls: 'rv-nv'  },
};

// 1. Distinct stored values.
const seen = new Map();
const note = (v, where) => { const k = String(v); seen.set(k, (seen.get(k) || 0) + 1); if (!(k in EXPECTED)) fail(`unreviewed stored vote value ${JSON.stringify(v)} (${where})`); };
const votesDir = path.join(ROOT, 'data', 'votes');
for (const f of fs.readdirSync(votesDir).filter(f => f.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(votesDir, f), 'utf8'));
  for (const rc of (j.votes || [])) {
    for (const m of (rc.members || [])) note(m.vote, 'data/votes/' + f);
    for (const m of (rc.crossovers || [])) note(m.vote, 'data/votes/' + f);
  }
}
const repsDir = path.join(ROOT, 'data', 'reps');
const profiles = {};
for (const f of fs.readdirSync(repsDir).filter(f => f.endsWith('.json'))) {
  const rep = JSON.parse(fs.readFileSync(path.join(repsDir, f), 'utf8'));
  profiles[rep.bioguideId || f.replace(/\.json$/, '')] = rep;
  for (const v of (rep.voteHistory || [])) note(v.vote, 'data/reps/' + f);
}
console.log('  distinct stored vote values: ' + [...seen].map(([k, n]) => `${JSON.stringify(k)}=${n}`).join(', '));

for (const [raw, exp] of Object.entries(EXPECTED)) {
  for (const variant of [raw, raw.toLowerCase(), raw.toUpperCase(), ' ' + raw + ' ']) {
    const got = voteBadge(variant);
    if (got.label !== exp.label || got.cls !== exp.cls) fail(`voteBadge(${JSON.stringify(variant)}) = ${JSON.stringify(got)}, want ${JSON.stringify(exp)}`);
  }
}

// 2. Nothing else may become Yea / Nay.
for (const raw of ['Not Voting', 'not voting', 'Present', 'Aye', 'Nothing', 'Note', 'Notvoting', 'None', 'Abstain', '', null, undefined]) {
  const got = voteBadge(raw);
  if (raw !== 'Aye' && (got.label === 'Nay' || got.label === 'Yea')) fail(`voteBadge(${JSON.stringify(raw)}) coerced to ${got.label}`);
  if (got.cls !== 'rv-nv') fail(`voteBadge(${JSON.stringify(raw)}) styled ${got.cls}, want rv-nv`);
}

// 3. Static generator renders through the shared table.
const { voteHistoryHtml } = require('./generate_rep_pages.js');
const nvRow = voteHistoryHtml({ voteHistory: [{ billId: '119-HR-1', vote: 'Not Voting', date: '2026-01-01' }] });
if (!nvRow.includes('rep-vote-badge rv-nv">Not Voting<')) fail('generate_rep_pages.js renders a "Not Voting" row as: ' + (nvRow.match(/rep-vote-badge[^<]*/) || [''])[0]);

// 4. rep.js (browser-only) uses the shared table.
const repJs = fs.readFileSync(path.join(ROOT, 'rep.js'), 'utf8');
if (!/voteBadge\(v\.vote\)/.test(repJs)) fail('rep.js no longer calls voteBadge(v.vote) for the vote-history badge');
if (/rawVote\.includes\(/.test(repJs)) fail('rep.js has substring vote matching (rawVote.includes) again');
const gen = fs.readFileSync(path.join(__dirname, 'generate_rep_pages.js'), 'utf8');
if (/rawVote\.includes\(/.test(gen)) fail('generate_rep_pages.js has substring vote matching (rawVote.includes) again');

// 5. Committed static pages: no "Not Voting" row printed as Nay.
let pages = 0, nvRows = 0;
const slugIdx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'rep-slug-index.json'), 'utf8'));
for (const [id, slug] of Object.entries(slugIdx)) {
  const f = path.join(ROOT, 'rep', slug, 'index.html');
  if (!fs.existsSync(f) || !profiles[id]) continue;
  pages++;
  const html = fs.readFileSync(f, 'utf8');
  for (const v of (profiles[id].voteHistory || [])) {
    if (String(v.vote).trim().toLowerCase() !== 'not voting') continue;
    nvRows++;
    const row = voteHistoryHtml({ voteHistory: [v] });
    const wrong = row.slice(row.indexOf('<div class="rep-vote-row">'))   // drop the data-idx wrapper
      .replace('rep-vote-badge rv-nv">Not Voting<', 'rep-vote-badge rv-nay">Nay<');
    if (html.includes(wrong)) fail(`rep/${slug}/ shows Nay for stored "Not Voting" on ${v.billId} (${v.date})`);
  }
}
console.log(`  static pages scanned: ${pages}; stored "Not Voting" rows checked: ${nvRows}`);

if (failures) { console.error(`\nX test-vote-label: ${failures} failure(s).`); process.exit(1); }
console.log('OK test-vote-label: every stored vote value maps exactly; no "Not Voting" shown as Nay.');
