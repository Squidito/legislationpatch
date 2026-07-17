#!/usr/bin/env node
'use strict';

// demand-signal.js -- search-demand signal for LegislationPatch backlog triage.
//
// WHAT IT DOES
//   Fetches Congress.gov's public "Most-Viewed Bills" list
//   (https://www.congress.gov/most-viewed-bills), a free weekly ranking of the
//   bills people are actually searching for. It parses the most recent week's
//   top list, keeps only 119th-Congress bills, and cross-references each against
//   this repo's analyzed set (data/cache.json) and deliberately-skipped set
//   (data/analysis-skip.json). Anything ranked but NOT yet analyzed or skipped
//   is flagged BACKLOG -- i.e. "analyze these next", because search demand
//   already exists for a page we don't have.
//
// OUTPUT
//   - Writes data/demand-signal.json:
//       { fetchedAt, sourceWeek, droppedPriorCongress, entries: [
//           { rank, id, title, status, slug?, skipCategory? } ] }
//   - Prints a console table with BACKLOG entries first (the recommendations),
//     then analyzed / skipped for completeness.
//
// USAGE
//   node scripts/demand-signal.js
//
//   Advisory only. It NEVER writes bill data and NEVER guesses: if every fetch
//   path fails or the page defeats parsing, it prints a clear message and
//   writes nothing. It feeds batch selection (see run-batch.js / the analysis
//   backlog) -- run it to decide which backlog bills to prioritize.
//
// HOW IT FETCHES (two tiers)
//   1. Plain HTTPS fetch (Node global fetch, no browser). Congress.gov sits
//      behind Cloudflare bot protection that rejects plain non-browser fetches
//      with HTTP 403 / a "Just a moment..." challenge -- even from residential
//      connections -- so this tier usually fails, but it is free to try.
//   2. Playwright browser fallback (playwright is already a devDependency;
//      no new deps). Tries headless Chromium first; empirically the Cloudflare
//      challenge does NOT clear in any headless mode (headless shell, new
//      headless, Chrome headless), so as a last resort it opens a VISIBLE
//      browser window (system Chrome if installed, else bundled Chromium),
//      waits for the bill table to render, captures page.content(), and
//      closes. Expect a brief browser-window flash on a normal run -- that is
//      currently the only path Cloudflare lets through.
//   Only if BOTH tiers fail does the script report failure and write nothing.
//
// NOTES
//   - The parser targets the current server-rendered structure: one <table>
//     per archived week, newest first, week date in <caption>, rows of
//     rank / bill-number link / title. If Congress.gov restructures the page,
//     the script fails loudly rather than emitting bad data.

const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://www.congress.gov/most-viewed-bills';
const CONGRESS = 119; // only keep bills from this Congress
const USER_AGENT =
  'LegislationPatch-DemandSignal/1.0 (+https://legislationpatch.com; ' +
  'advisory backlog-prioritization tool; contact chuckles77459@gmail.com)';

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUT_FILE = path.join(DATA_DIR, 'demand-signal.json');

// ---------------------------------------------------------------------------
// Parsing (pure functions -- exported for testing against saved fixtures)
// ---------------------------------------------------------------------------

// Congress.gov URL path segment -> the site's bill-type token.
const URL_TYPE_MAP = {
  'house-bill': 'HR',
  'senate-bill': 'S',
  'house-joint-resolution': 'HJRES',
  'senate-joint-resolution': 'SJRES',
  'house-concurrent-resolution': 'HCONRES',
  'senate-concurrent-resolution': 'SCONRES',
  'house-resolution': 'HRES',
  'senate-resolution': 'SRES',
};

// Displayed-identifier prefixes (dots/spaces stripped, uppercased) -> token.
// Covers S., H.R., H.J.Res., S.J.Res., H.Con.Res., S.Con.Res., H.Res., S.Res.
const TEXT_TYPE_TOKENS = new Set([
  'HR', 'S', 'HJRES', 'SJRES', 'HCONRES', 'SCONRES', 'HRES', 'SRES',
]);

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

// True when the body is a Cloudflare bot-challenge page, not the real site.
function looksLikeChallenge(html) {
  return (
    /Just a moment\.\.\./i.test(html) ||
    /challenge-platform|cf-chl-|__cf_chl/i.test(html)
  );
}

// Extract { congress, id } from a Congress.gov bill href. Returns null on miss.
function parseFromHref(href) {
  if (!href) return null;
  const m = href.match(/\/bill\/(\d+)(?:st|nd|rd|th)-congress\/([a-z-]+)\/(\d+)/i);
  if (!m) return null;
  const congress = parseInt(m[1], 10);
  const token = URL_TYPE_MAP[m[2].toLowerCase()];
  const number = m[3];
  if (!token) return null;
  return { congress, id: `${congress}-${token}-${number}` };
}

// Fallback: extract { congress, id } from the displayed cell text,
// e.g. "H.R.4818 [118th]" or "S.J.Res.12 [119th]".
function parseFromText(text) {
  if (!text) return null;
  const congMatch = text.match(/\[(\d+)(?:st|nd|rd|th)\]/i);
  const congress = congMatch ? parseInt(congMatch[1], 10) : null;
  // Strip the bracket, then split leading non-digits (the prefix) from the number.
  const core = text.replace(/\[[^\]]*\]/g, '').trim();
  const idMatch = core.match(/^([^\d]+?)\s*(\d+)/);
  if (!idMatch || congress == null) return null;
  const token = idMatch[1].replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!TEXT_TYPE_TOKENS.has(token)) return null;
  return { congress, id: `${congress}-${token}-${idMatch[2]}` };
}

// Parse the most recent Most-Viewed Bills table out of the page HTML.
// Returns { sourceWeek, rows: [{ rank, id, congress, title, billNumberText }] }.
// Throws if the table cannot be located or yields no bill rows.
function parseMostViewed(html) {
  if (!html || typeof html !== 'string') throw new Error('empty response body');

  if (looksLikeChallenge(html)) {
    throw new Error('Cloudflare bot-challenge page returned instead of the bill list');
  }

  // Grab every <table>...</table> block; the Most-Viewed tables are the ones
  // whose header row names "Bill number" and "Bill title". The FIRST such table
  // is the most recent week.
  const tableBlocks = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  const target = tableBlocks.find(
    (t) => /Bill\s*number/i.test(t) && /Bill\s*title/i.test(t)
  );
  if (!target) {
    throw new Error('could not locate the Most-Viewed Bills table in the page');
  }

  const capMatch = target.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
  const sourceWeek = capMatch ? stripTags(capMatch[1]) : null;

  const rows = [];
  const trBlocks = target.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trBlocks) {
    // Skip header rows (they use <th>, no <td>).
    const cells = tr.match(/<td[\s\S]*?<\/td>/gi);
    if (!cells || cells.length < 3) continue;

    const rankText = stripTags(cells[0]);
    const rankMatch = rankText.match(/(\d+)/);
    if (!rankMatch) continue; // not a data row

    const billCell = cells[1];
    const billNumberText = stripTags(billCell);
    const hrefMatch = billCell.match(/href\s*=\s*["']([^"']+)["']/i);
    const href = hrefMatch ? hrefMatch[1] : null;
    const title = stripTags(cells[2]);

    const parsed = parseFromHref(href) || parseFromText(billNumberText);
    if (!parsed) continue; // could not identify the bill; skip this row

    rows.push({
      rank: parseInt(rankMatch[1], 10),
      id: parsed.id,
      congress: parsed.congress,
      title,
      billNumberText,
    });
  }

  if (rows.length === 0) {
    throw new Error('located the table but parsed zero bill rows (structure changed?)');
  }
  return { sourceWeek, rows };
}

// ---------------------------------------------------------------------------
// Cross-reference helpers
// ---------------------------------------------------------------------------

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Build the { fetchedAt, sourceWeek, droppedPriorCongress, entries } payload
// from parsed rows + the repo's analyzed / skipped / slug data.
function buildSignal(parsed, refs, fetchedAt) {
  const { analyzedIds, skipCategories, slugById } = refs;
  const entries = [];
  let droppedPriorCongress = 0;

  for (const row of parsed.rows) {
    if (row.congress !== CONGRESS) {
      droppedPriorCongress += 1;
      continue;
    }
    const entry = { rank: row.rank, id: row.id, title: row.title };
    if (analyzedIds.has(row.id)) {
      entry.status = 'analyzed';
      const slug = slugById.get(row.id);
      if (slug) entry.slug = slug;
    } else if (skipCategories.has(row.id)) {
      entry.status = 'skipped';
      entry.skipCategory = skipCategories.get(row.id);
    } else {
      entry.status = 'BACKLOG';
    }
    entries.push(entry);
  }

  return {
    fetchedAt,
    sourceWeek: parsed.sourceWeek,
    droppedPriorCongress,
    entries,
  };
}

function loadRefs() {
  const cache = loadJson(path.join(DATA_DIR, 'cache.json'));
  const skip = loadJson(path.join(DATA_DIR, 'analysis-skip.json'));

  const analyzedIds = new Set((cache.bills || []).map((b) => b.id));
  const skipCategories = new Map(
    (skip.skip || []).map((s) => [s.id, s.category])
  );

  // Prefer slug-map.json ({ id: { slug } }); fall back to slug-index.json (flat).
  const slugById = new Map();
  try {
    const slugMap = loadJson(path.join(DATA_DIR, 'slug-map.json'));
    for (const [id, v] of Object.entries(slugMap)) {
      if (v && v.slug) slugById.set(id, v.slug);
    }
  } catch (_) {
    try {
      const slugIndex = loadJson(path.join(DATA_DIR, 'slug-index.json'));
      for (const [id, slug] of Object.entries(slugIndex)) slugById.set(id, slug);
    } catch (_2) {
      /* slugs are optional */
    }
  }

  return { analyzedIds, skipCategories, slugById };
}

// ---------------------------------------------------------------------------
// Fetch tiers
// ---------------------------------------------------------------------------

// Tier 1: plain HTTPS fetch. Returns the HTML string, or null if blocked /
// failed (pushing a human-readable reason onto `failures`).
async function fetchPlain(failures) {
  let res;
  try {
    res = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
  } catch (err) {
    failures.push(`plain fetch: network error -- ${err.message}`);
    return null;
  }

  // Always drain the body so the socket is released cleanly.
  const body = await res.text().catch(() => '');

  if (!res.ok) {
    const challenged = looksLikeChallenge(body) ? ' (Cloudflare challenge page)' : '';
    failures.push(`plain fetch: HTTP ${res.status} ${res.statusText}${challenged}`);
    return null;
  }
  if (looksLikeChallenge(body)) {
    failures.push('plain fetch: HTTP 200 but body is a Cloudflare challenge page');
    return null;
  }
  return body;
}

// Tier 2: Playwright browser. Tries headless first; Cloudflare's challenge
// does not clear in headless Chrome (verified empirically 2026-07-17), so it
// escalates to a visible window (system Chrome, then bundled Chromium).
// Returns the rendered HTML, or null with reasons pushed onto `failures`.
async function fetchViaBrowser(failures) {
  let pw;
  try {
    pw = require('playwright');
  } catch (_) {
    failures.push('browser fallback: playwright is not installed (run npm install)');
    return null;
  }

  const attempts = [
    { label: 'headless Chromium', opts: { headless: true }, waitMs: 20000 },
    { label: 'visible Chrome window', opts: { channel: 'chrome', headless: false }, waitMs: 45000 },
    { label: 'visible Chromium window', opts: { headless: false }, waitMs: 45000 },
  ];

  for (const att of attempts) {
    let browser;
    try {
      browser = await pw.chromium.launch(att.opts);
    } catch (err) {
      // e.g. channel 'chrome' when system Chrome is absent -- try next mode.
      failures.push(
        `browser fallback (${att.label}): launch failed -- ${err.message.split('\n')[0]}`
      );
      continue;
    }
    try {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        locale: 'en-US',
      });
      const page = await ctx.newPage();
      console.error(`[demand-signal] trying ${att.label}...`);
      await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // Wait for a Most-Viewed table to render (gives any Cloudflare
      // challenge time to clear on its own).
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll('table')).some(
            (t) =>
              /Bill\s*number/i.test(t.innerText) && /Bill\s*title/i.test(t.innerText)
          ),
        { timeout: att.waitMs }
      );
      const html = await page.content();
      console.error(`[demand-signal] ${att.label}: bill list rendered.`);
      return html;
    } catch (err) {
      let title = '?';
      try {
        const pages = browser.contexts()[0].pages();
        if (pages.length) title = await pages[0].title();
      } catch (_) {
        /* keep '?' */
      }
      failures.push(
        `browser fallback (${att.label}): bill list never rendered ` +
          `(page title: ${JSON.stringify(title)})`
      );
    } finally {
      await browser.close().catch(() => {});
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Console reporting
// ---------------------------------------------------------------------------

function report(signal) {
  const backlog = signal.entries.filter((e) => e.status === 'BACKLOG');
  const analyzed = signal.entries.filter((e) => e.status === 'analyzed');
  const skipped = signal.entries.filter((e) => e.status === 'skipped');

  console.log('');
  console.log('Congress.gov Most-Viewed Bills -- demand signal');
  console.log(`  Source week : ${signal.sourceWeek || '(unknown)'}`);
  console.log(`  Fetched at  : ${signal.fetchedAt}`);
  console.log(
    `  ${signal.entries.length} bills (119th) | ` +
      `${backlog.length} BACKLOG | ${analyzed.length} analyzed | ` +
      `${skipped.length} skipped | ${signal.droppedPriorCongress} dropped (prior Congress)`
  );

  const line = (e) => {
    const parts = [
      `#${String(e.rank).padStart(2)}`,
      e.id.padEnd(14),
      e.title.length > 58 ? e.title.slice(0, 55) + '...' : e.title,
    ];
    if (e.skipCategory) parts.push(`(${e.skipCategory})`);
    if (e.slug) parts.push(`/${e.slug}`);
    return '  ' + parts.join('  ');
  };

  console.log('');
  console.log('>> ANALYZE NEXT (ranked, in demand, not yet on the site):');
  if (backlog.length) backlog.forEach((e) => console.log(line(e)));
  else console.log('  (none -- every ranked 119th bill is already analyzed or skipped)');

  if (analyzed.length) {
    console.log('');
    console.log('Already analyzed (live pages):');
    analyzed.forEach((e) => console.log(line(e)));
  }
  if (skipped.length) {
    console.log('');
    console.log('Deliberately skipped:');
    skipped.forEach((e) => console.log(line(e)));
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const failures = [];

  // Tier 1: plain fetch (fast; usually blocked by Cloudflare).
  let html = await fetchPlain(failures);
  if (html === null) {
    console.error(`[demand-signal] ${failures[failures.length - 1]}`);
    console.error('[demand-signal] falling back to Playwright browser...');
    // Tier 2: Playwright browser (headless, then visible window).
    html = await fetchViaBrowser(failures);
  }

  if (html === null) {
    console.error('');
    console.error('FAILED: could not fetch the Most-Viewed Bills page by any method.');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('  Nothing written. This is an advisory tool -- try again later.');
    process.exitCode = 1;
    return;
  }

  let parsed;
  try {
    parsed = parseMostViewed(html);
  } catch (err) {
    console.error('FAILED: could not parse the Most-Viewed Bills page.');
    console.error(`  ${err.message}`);
    console.error('  Nothing written (the tool never guesses).');
    process.exitCode = 1;
    return;
  }

  const signal = buildSignal(parsed, loadRefs(), new Date().toISOString());

  fs.writeFileSync(OUT_FILE, JSON.stringify(signal, null, 2) + '\n', 'utf8');
  report(signal);
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} (${signal.entries.length} entries).`);
}

// Run only when invoked directly; export pure functions for testing.
if (require.main === module) {
  main().catch((err) => {
    console.error(`FAILED (unexpected): ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseMostViewed,
  parseFromHref,
  parseFromText,
  buildSignal,
  stripTags,
  looksLikeChallenge,
};
