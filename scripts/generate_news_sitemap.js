#!/usr/bin/env node
// generate_news_sitemap.js -- build news-sitemap.xml, the Google News feed.
//
// A news sitemap is NOT the regular sitemap. Google's spec:
//   - only URLs published in the last 48 HOURS
//   - fewer than 1,000 URLs
//   - <news:news> with <news:publication>, <news:publication_date>, <news:title>
// Google's crawlers treat entries here as time-sensitive and worth fetching
// quickly -- this is the mechanism behind "indexed in minutes" for breaking
// stories, and the first crawl may be the only shot at Top Stories.
//
// EXPECTED TO BE EMPTY most days. That is correct behaviour, not a bug: the site
// currently publishes evergreen guides, and the file only fills up once the
// Dispatch lane (ARTICLE-WRITER-SPEC.md Phase 1) starts emitting event-pegged
// pages. An empty <urlset> is valid and is what Google should see when nothing
// was published in the window.
//
// Usage:
//   node scripts/generate_news_sitemap.js
//   node scripts/generate_news_sitemap.js --now 2026-08-13T12:00:00Z   # test

'use strict';

const fs   = require('fs');
const path = require('path');

const entity = require('./lib/entity');
const { allArticles } = require('./lib/article-meta');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt  = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

const WINDOW_HOURS = 48;
const MAX_URLS     = 1000;

const NOW = opt('now') ? new Date(opt('now')) : new Date();
if (Number.isNaN(NOW.getTime())) {
  console.error('generate_news_sitemap: --now must be an ISO date');
  process.exit(1);
}

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The interval the article could have been published in.
 *
 * A full timestamp pins it to an instant. A date-only value ("2026-08-13")
 * genuinely means "some time that day", so it spans the whole UTC day --
 * pretending it means midnight is what halved the window: an item published
 * at 20:00 was measured as 20 hours older than it was, and dropped out of the
 * 48-hour feed after 28 real hours.
 */
function publishInterval(a) {
  const raw = a.datePublishedAt || a.datePublished;
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw)) {
    const at = new Date(raw.replace(' ', 'T'));
    if (Number.isNaN(at.getTime())) return null;
    return { earliest: at, latest: at, dayPrecision: false };
  }

  const earliest = new Date(`${raw}T00:00:00.000Z`);
  const latest   = new Date(`${raw}T23:59:59.999Z`);
  if (Number.isNaN(earliest.getTime())) return null;
  return { earliest, latest, dayPrecision: true };
}

/**
 * An article qualifies if its publication instant falls inside the window.
 * We use datePublished, not dateModified: Google News wants genuinely new
 * items. Re-listing a refreshed evergreen guide as "news" is the kind of
 * recycling that gets a publisher's news treatment pulled.
 *
 * Measured against the LATEST instant it could have been published, so a
 * day-precision article gets the full 48 hours rather than a truncated one --
 * under-listing costs the Top Stories crawl outright, and the crawl may be
 * the only shot at it.
 */
function withinWindow(a) {
  const w = publishInterval(a);
  if (!w) return false;
  if (NOW < w.earliest) return false;            // not published yet
  return (NOW - w.latest) / 36e5 <= WINDOW_HOURS;
}

function main() {
  const site = entity.site();
  const BASE = site.baseUrl;

  // Dispatches are the reason this file exists: event-pegged pages published
  // within minutes of a floor vote are the only content here that is news in
  // Google's sense. Evergreen articles stay eligible but essentially never
  // fall inside a 48-hour window.
  const { allDispatches } = require('./lib/dispatch-meta.js');
  const candidates = [...allDispatches(), ...allArticles()];
  const fresh = candidates.filter(withinWindow).slice(0, MAX_URLS);

  const entries = fresh.map(a => `  <url>
    <loc>${xmlEscape(`${BASE}${a.url}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${xmlEscape(site.name)}</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${xmlEscape(a.datePublishedAt || a.datePublished)}</news:publication_date>
      <news:title>${xmlEscape(a.title)}</news:title>
    </news:news>
  </url>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}${entries ? '\n' : ''}</urlset>
`;

  const out = path.join(ROOT, 'news-sitemap.xml');
  fs.writeFileSync(out, xml);

  console.log(`news-sitemap: ${fresh.length} URL(s) inside the ${WINDOW_HOURS}h window -> news-sitemap.xml`);
  if (!fresh.length) {
    console.log('  (empty is expected until the Dispatch lane publishes event-pegged pages)');
  }
  for (const a of fresh) {
    const w = publishInterval(a);
    // Day-precision inside the window is worth saying out loud: the entry is
    // being given the benefit of the doubt on its publish hour. Dispatches
    // should carry a full timestamp so the window is exact.
    const note = w && w.dayPrecision ? '  (day-precision datePublished — no time recorded)' : '';
    console.log(`  ${a.datePublishedAt || a.datePublished}  ${a.title}${note}`);
  }
}

main();
