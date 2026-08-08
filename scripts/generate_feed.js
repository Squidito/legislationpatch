// generate_feed.js — RSS 2.0 feed for "Congress Patch Notes" (the changelog).
//
// WHAT IT DOES
//   Reads the editions ledger in data/digest-state.json (written by
//   generate_digest.js) and emits one <item> per changelog edition — title,
//   permalink, publish date, and a counts-derived description. Purely
//   deterministic: it derives everything from the ledger and adds no state of
//   its own, so re-running with no new editions rewrites an identical file.
//   lastBuildDate is pinned to the newest edition (not "now") so the file does
//   not churn in git on every batch.
//
//   If there is no ledger yet (no digest has run), it prints a notice and exits
//   0 — never blocks a batch.
//
// OUTPUT (repo root)
//   feed.xml   — RSS 2.0, one item per changelog edition (newest first, max 50)
//
// Run:  npm run feed   (or  node scripts/generate_feed.js )
// No new dependencies. Hooks into run-batch --post right after the digest.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const BASE = 'https://legislationpatch.com';
const OUT  = path.join(ROOT, 'feed.xml');
const MAX_ITEMS = 50;

// ── Formatters ─────────────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];

// "2026-07-14" -> "July 14, 2026"
function dateHuman(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(dateStr || '');
  const mo = MONTHS[Number(m[2]) - 1] || m[2];
  return `${mo} ${Number(m[3])}, ${m[1]}`;
}

// "2026-07-14" -> "Tue, 14 Jul 2026 00:00:00 GMT" (RFC-822, what RSS wants).
// Deterministic: fixed UTC midnight, no locale/now dependence.
function rfc822(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).toUTCString();
}

// XML text-content escape.
function xml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// counts:{total, enacted?, advanced?, new?} + kind -> "3 signed into law, 5 advanced a stage"
function summarize(counts, kind) {
  const c = counts || {};
  const bits = [];
  if (c.enacted)  bits.push(`${c.enacted} signed into law`);
  if (c.advanced) bits.push(`${c.advanced} ${kind === 'inaugural' ? 'with recent activity' : 'advanced a stage'}`);
  if (c.new)      bits.push(`${c.new} new to the site`);
  return bits.join(', ') || `${c.total || 0} updates`;
}

// ── Build ────────────────────────────────────────────────────────────────────

function main() {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(path.join(DATA, 'digest-state.json'), 'utf8'));
  } catch (_) {
    console.log('feed: no data/digest-state.json yet (run the digest first) — nothing to build.');
    return;
  }

  const editions = (state && Array.isArray(state.editions) ? state.editions.slice() : [])
    .filter(e => e && e.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, MAX_ITEMS);

  if (!editions.length) {
    console.log('feed: no editions in the ledger yet — nothing to build.');
    return;
  }

  const lastBuild = rfc822(editions[0].date);

  const items = editions.map(e => {
    const url  = `${BASE}${e.url || `/changelog/${e.date}/`}`;
    const desc = summarize(e.counts, e.kind);
    return `    <item>
      <title>${xml(`Congress Patch Notes — ${dateHuman(e.date)}`)}</title>
      <link>${xml(url)}</link>
      <guid isPermaLink="true">${xml(url)}</guid>
      <pubDate>${rfc822(e.date)}</pubDate>
      <description>${xml(desc + '.')}</description>
    </item>`;
  }).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Congress Patch Notes — LegislationPatch</title>
    <link>${BASE}/changelog/</link>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Release notes for Congress: U.S. federal bills that advanced a stage, passed a chamber, or were signed into law — sourced entirely from the bill record.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  fs.writeFileSync(OUT, rss);
  console.log(`feed: feed.xml written — ${editions.length} edition item(s), latest ${editions[0].date}.`);
}

main();
