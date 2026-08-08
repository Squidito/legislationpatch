// article-backlog.js — the "Assignment Editor": which analyzed bills still lack
// a focused explainer/tracker article, ranked by how article-worthy they are.
//
// WHAT IT DOES
//   A bill "has an explainer" only if a FOCUSED article (one referencing <= 10
//   bills) links it — the 40-bill mega-tracker does NOT count. Every cache bill
//   without one is a candidate, tiered by salience:
//     TRENDING   — in data/demand-signal.json (Congress.gov most-viewed), by rank
//     MOVED      — passed a chamber or was signed into law, by recency
//     HIGH-INT.  — >= 25 cosponsors, by cosponsor count
//     other      — everything else (counted, not listed)
//
//   ADVISORY ONLY. Prints a report, writes data/article-backlog.json for
//   downstream use, and always exits 0. It writes no article and no bill data.
//
// Run:  npm run backlog   (or  node scripts/article-backlog.js )
// Not wired into the batch — it's a planning tool, like demand-signal.js.

'use strict';

const fs   = require('fs');
const path = require('path');

const { buildArticleIndex } = require('./lib/article-index.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const FOCUSED_MAX = 10;              // article referencing <= this many bills = an explainer
const HIGH_INTEREST_COSPONSORS = 25;
const PRINT_CAP = 30;

// ── Load ───────────────────────────────────────────────────────────────────────

const cache = JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8'));
const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});

const { byBill } = buildArticleIndex();
function hasExplainer(id) {
  return (byBill.get(id) || []).some(a => a.breadth <= FOCUSED_MAX);
}

// demand-signal rank map (lower rank = more views). Optional — absent is fine.
const rankById = {};
try {
  const ds = JSON.parse(fs.readFileSync(path.join(DATA, 'demand-signal.json'), 'utf8'));
  for (const e of (ds.entries || [])) {
    if (e && e.id && Number.isFinite(e.rank)) rankById[e.id] = e.rank;
  }
} catch (_) {}

const MOVED_STAGES = new Set(['house', 'senate', 'signed']);

const TYPE_DISPLAY = {
  HR: 'H.R.', S: 'S.', HRES: 'H.Res.', SRES: 'S.Res.',
  HJRES: 'H.J.Res.', SJRES: 'S.J.Res.', HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.',
};
function displayCode(id) {
  const m = String(id).match(/^\d+-([A-Z]+)-(\d+\w*)$/);
  return m ? `${TYPE_DISPLAY[m[1]] || m[1]} ${m[2]}` : String(id);
}

function entry(b) {
  return {
    id: b.id,
    code: displayCode(b.id),
    title: b.title || b.code || b.id,
    stage: b.stage || '',
    stageLabel: b.stageLabel || '',
    stageDate: b.stageDate || b.enactedDate || b.date || '',
    cosponsors: b.cosponsors || 0,
    rank: rankById[b.id] != null ? rankById[b.id] : null,
  };
}

// ── Tier the candidates ─────────────────────────────────────────────────────────

const candidates = bills.filter(b => !hasExplainer(b.id));

const trending = [], moved = [], highInterest = [], other = [];
for (const b of candidates) {
  const e = entry(b);
  if (e.rank != null)                                 trending.push(e);
  else if (MOVED_STAGES.has(e.stage))                 moved.push(e);
  else if (e.cosponsors >= HIGH_INTEREST_COSPONSORS)  highInterest.push(e);
  else                                                other.push(e);
}
trending.sort((a, b) => a.rank - b.rank);
moved.sort((a, b) => String(b.stageDate).localeCompare(String(a.stageDate)));
highInterest.sort((a, b) => b.cosponsors - a.cosponsors);

// ── Report ───────────────────────────────────────────────────────────────────────

function section(title, list, fmt) {
  console.log(`\n  ${title} (${list.length})`);
  if (!list.length) { console.log('    — none'); return; }
  for (const e of list.slice(0, PRINT_CAP)) console.log('    ' + fmt(e));
  if (list.length > PRINT_CAP) console.log(`    …and ${list.length - PRINT_CAP} more (see data/article-backlog.json)`);
}

const rule = '─'.repeat(70);
console.log(rule);
console.log('  Article backlog (advisory) — analyzed bills with no focused explainer');
console.log(rule);
console.log(`  ${candidates.length} of ${bills.length} bills have no focused article.`);

section('TRENDING — write these first (Congress.gov most-viewed)', trending,
  e => `#${e.rank}  ${e.code} — ${e.title}`);
section('MOVED — passed a chamber / signed into law', moved,
  e => `${e.code} — ${e.title}  [${e.stageLabel || e.stage}, ${e.stageDate}]`);
section('HIGH-INTEREST — 25+ cosponsors', highInterest,
  e => `${e.code} — ${e.title}  [${e.cosponsors} cosponsors]`);
console.log(`\n  other (no strong signal): ${other.length} bill(s) — not listed.`);

// ── Persist ────────────────────────────────────────────────────────────────────

const out = {
  generatedAt: new Date().toISOString(),
  counts: {
    trending: trending.length, moved: moved.length,
    highInterest: highInterest.length, other: other.length, total: candidates.length,
  },
  trending, moved, highInterest,
};
fs.writeFileSync(path.join(DATA, 'article-backlog.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`\n  Wrote data/article-backlog.json (${candidates.length} candidates; ${other.length} low-signal omitted from the lists).`);
process.exit(0);
