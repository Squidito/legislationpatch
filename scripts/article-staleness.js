// article-staleness.js — advisory freshness checker for articles/*.html.
//
// WHAT IT DOES
//   Scans every articles/*.html for the bills it references (via bill links and
//   bill-code text patterns), normalizes those to cache ids, and cross-references
//   each against data/cache.json. It flags any article whose referenced bill has
//   a stageDate NEWER than the article's own "last updated" date — a signal the
//   article's prose may describe a bill state that has since moved on. An article
//   with no parseable date is flagged as "no date".
//
//   ADVISORY ONLY. It prints a report and ALWAYS exits 0 — it never blocks a
//   commit or a batch. It fixes nothing (a parallel process owns articles/).
//
// Run:  npm run stale   (or  node scripts/article-staleness.js )
// Hooks into run-batch --post as an advisory print near validate.

'use strict';

const fs   = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const DATA     = path.join(ROOT, 'data');
const ARTICLES = path.join(ROOT, 'articles');

// ── Load cache -> { id: {stageLabel, stageDate} } ──────────────────────────────

const cache = JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8'));
const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});
const byId = new Map();
for (const b of bills) byId.set(b.id, { stageLabel: b.stageLabel || b.stage || '', stageDate: b.stageDate || b.date || '' });

const CONGRESS = '119'; // the site tracks the 119th Congress; text codes normalize into it

// Text bill-code -> cache-id type token.
const CODE_TYPE = {
  HR: 'HR', H: 'HR',
  S: 'S',
  HRES: 'HRES', SRES: 'SRES',
  HJRES: 'HJRES', SJRES: 'SJRES',
  HCONRES: 'HCONRES', SCONRES: 'SCONRES',
};

// ── Reference extraction ───────────────────────────────────────────────────────

function normalizeId(rawType, num) {
  const t = CODE_TYPE[String(rawType).toUpperCase().replace(/[^A-Z]/g, '')];
  if (!t || !num) return null;
  return `${CONGRESS}-${t}-${num}`;
}

// Reverse slug -> id lookup (for /bill/<slug>/ href references).
let slugToId = {};
try {
  const slugMap = JSON.parse(fs.readFileSync(path.join(DATA, 'slug-map.json'), 'utf8'));
  for (const [id, v] of Object.entries(slugMap)) {
    if (v && v.slug) slugToId[v.slug] = id;
    for (const h of (v && v.history) || []) slugToId[h] = id;
  }
} catch (_) {}

function extractRefs(html) {
  const ids = new Set();

  // 1. bill.html?id=119-HR-2480 (and lowercase variants)
  let m;
  const hrefIdRe = /bill\.html\?id=(\d+)-([A-Za-z]+)-(\d+\w*)/g;
  while ((m = hrefIdRe.exec(html)) !== null) {
    const t = CODE_TYPE[m[2].toUpperCase()];
    if (t) ids.add(`${m[1]}-${t}-${m[3]}`);
  }

  // 2. /bill/<slug>/ hrefs — resolve via the slug map (non-bill paths won't resolve)
  const slugRe = /\/bill\/([a-z0-9-]+)\/?/g;
  while ((m = slugRe.exec(html)) !== null) {
    const id = slugToId[m[1]];
    if (id) ids.add(id);
  }

  // 3. Bill-code text patterns: "H.R. 2480", "S. 5", "H.J.Res. 133", etc.
  //    Normalized to ids; only those present in the cache are kept downstream.
  const codeRe = /\b(H\.?\s?R\.|H\.?\s?J\.?\s?Res\.|H\.?\s?Con\.?\s?Res\.|H\.?\s?Res\.|S\.?\s?J\.?\s?Res\.|S\.?\s?Con\.?\s?Res\.|S\.?\s?Res\.|S\.)\s?(\d{1,5})\b/g;
  while ((m = codeRe.exec(html)) !== null) {
    const id = normalizeId(m[1], m[2]);
    if (id) ids.add(id);
  }

  return [...ids];
}

// ── Article date parsing (best-effort) ─────────────────────────────────────────

const MONTHS = { january:1, february:2, march:3, april:4, may:5, june:6, july:7,
                 august:8, september:9, october:10, november:11, december:12 };

// Returns { date: 'YYYY-MM-DD', source: '...' } or null.
function articleDate(html) {
  // 1. JSON-LD dateModified (most precise, day-level)
  let m = html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  if (m) return { date: m[1], source: 'JSON-LD dateModified' };

  // 2. Visible "Updated <Month> <D?>, <Year>" / "Last updated <Month> <Year>"
  m = html.match(/(?:last\s+)?updated[^\dA-Za-z]*([A-Za-z]+)\.?\s+(\d{1,2})?,?\s*(\d{4})/i);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo) {
      const day = m[2] ? String(Number(m[2])).padStart(2, '0') : '01';
      return { date: `${m[3]}-${String(mo).padStart(2, '0')}-${day}`, source: `visible "${m[0].trim()}"` };
    }
  }

  // 3. JSON-LD datePublished as a last resort
  m = html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  if (m) return { date: m[1], source: 'JSON-LD datePublished (no modified date)' };

  return null;
}

// ── Scan ───────────────────────────────────────────────────────────────────────

function main() {
  let files = [];
  try {
    files = fs.readdirSync(ARTICLES)
      .filter(f => f.endsWith('.html') && f !== 'index.html')
      .sort();
  } catch (_) {
    console.log('article-staleness: no articles/ directory — nothing to check.');
    return;
  }

  // ROSTER DRIFT — the tripwire that was missing.
  //
  // The staleness check above sees bill MOVEMENT (a referenced bill advanced past
  // the article's date). It cannot see CORPUS GROWTH, and that is how the
  // 119th-congress-tracker went silently stale: it was written on 2026-05-08 when
  // the cache held 23 bills and claimed a "complete list", then the June-August
  // backlog batches grew the corpus to 212 behind it. Not one bill it cited had
  // moved, so nothing flagged for months.
  //
  // generate-tracker-roster.js --check re-derives the roster block AND the
  // snapshot receipts sheet from the cache and diffs both against disk, which is
  // exactly the corpus-growth signal. Run here, reported, and NEVER allowed to
  // change the exit code: the snapshot regenerates only on that article's refresh,
  // so between refreshes drift is the NORMAL state, and blocking a batch commit on
  // it would be the live-fixture trap already rejected for tracker:gate:test.
  function rosterAdvisory() {
    const script  = path.join(__dirname, 'generate-tracker-roster.js');
    const article = path.join(ARTICLES, '119th-congress-tracker.html');
    console.log('─'.repeat(64));
    console.log('  Tracker roster drift (advisory) — corpus growth vs. the published roster');
    console.log('─'.repeat(64));
    if (!fs.existsSync(script) || !fs.existsSync(article)) {
      console.log('  · skipped — generate-tracker-roster.js or the tracker article is not present.');
      console.log('');
      return;
    }
    const r = spawnSync(process.execPath, [script, '--check', '--file', article],
                        { cwd: ROOT, encoding: 'utf8' });
    const out = ((r.stdout || '') + (r.stderr || '')).trim();
    if (r.error) {
      console.log(`  · could not run the roster check: ${r.error.message}`);
    } else if (r.status === 0) {
      console.log('  ✓ roster and snapshot match the cache — the tracker covers the current corpus.');
    } else {
      console.log('  ⚠  ROSTER DRIFT — articles/119th-congress-tracker.html no longer matches the cache.');
      for (const line of out.split('\n')) if (line.trim()) console.log(`      ${line.trim()}`);
      console.log('      Refresh it:  node scripts/generate-tracker-roster.js --apply');
      console.log('      then re-audit and republish (npm run article:publish -- --refresh).');
    }
    console.log('');
  }

  const flagged = [];   // { file, date, dateSource, stale:[{id, stageLabel, stageDate}], noDate }
  let refCount = 0, scanned = 0;

  for (const f of files) {
    const html = fs.readFileSync(path.join(ARTICLES, f), 'utf8');
    const refs = extractRefs(html).filter(id => byId.has(id));
    if (!refs.length) continue; // only articles that reference tracked bills are in scope
    scanned++;
    refCount += refs.length;

    const dinfo = articleDate(html);
    if (!dinfo) {
      flagged.push({ file: f, noDate: true, refs });
      continue;
    }
    const stale = [];
    for (const id of refs.sort()) {
      const b = byId.get(id);
      if (b.stageDate && b.stageDate > dinfo.date) {
        stale.push({ id, stageLabel: b.stageLabel, stageDate: b.stageDate });
      }
    }
    if (stale.length) flagged.push({ file: f, date: dinfo.date, dateSource: dinfo.source, stale });
  }

  // ── Report ──
  console.log('─'.repeat(64));
  console.log('  Article staleness (advisory) — bill refs vs. article date');
  console.log('─'.repeat(64));
  console.log(`  Scanned ${scanned} article(s) referencing tracked bills (${refCount} ref(s)).`);
  console.log('');

  if (!flagged.length) {
    console.log('  ✓ No stale articles — every referenced bill is at or behind its article date.');
    console.log('');
    rosterAdvisory();
    process.exit(0);
  }

  for (const a of flagged) {
    if (a.noDate) {
      console.log(`  ⚠  ${a.file} — NO PARSEABLE DATE (references ${a.refs.length} tracked bill(s))`);
      console.log('');
      continue;
    }
    console.log(`  ⚠  ${a.file} — article date ${a.date} (${a.dateSource})`);
    for (const s of a.stale) {
      console.log(`        ${s.id}: now "${s.stageLabel}" as of ${s.stageDate}  (newer than article)`);
    }
    console.log('');
  }

  const staleN = flagged.filter(a => !a.noDate).length;
  const noDateN = flagged.filter(a => a.noDate).length;
  console.log(`  ${flagged.length} article(s) flagged: ${staleN} stale, ${noDateN} no-date. Advisory only — not blocking.`);
  console.log('');
  rosterAdvisory();
  process.exit(0); // always advisory — including the roster check above
}

main();
