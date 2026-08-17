// generate_sitemap.js — writes sitemap.xml from cache.json + reps-index.json
// Usage: node scripts/generate_sitemap.js (run from legislationpatch/ directory)

const fs   = require('fs');
const path = require('path');
const { billSlug } = require('../util.js');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://legislationpatch.com';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function toISODate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch (_) {}
  return null;
}

function billLastMod(bill) {
  return toISODate(bill.stageDate) || toISODate(bill.enactedDate) || toISODate(bill.date) || todayStr();
}

function urlEntry(loc, lastmod, changefreq, priority) {
  const lines = ['  <url>', '    <loc>' + loc + '</loc>'];
  if (lastmod) lines.push('    <lastmod>' + lastmod + '</lastmod>');
  lines.push('    <changefreq>' + changefreq + '</changefreq>');
  lines.push('    <priority>' + priority + '</priority>');
  lines.push('  </url>');
  return lines.join('\n');
}

// Load data
const cache     = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache.json'),      'utf8'));
const repsIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'reps-index.json'), 'utf8'));

// Current bill slugs (source of truth = data/slug-map.json, written by
// generate_bill_pages.js which runs immediately before this in the pipeline).
// Fall back to deriving the slug via the shared util.billSlug so a standalone
// `npm run sitemap` before the pages exist still emits the correct URLs.
let slugMap = {};
try { slugMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'slug-map.json'), 'utf8')); } catch (_) {}
const slugFor = bill => (slugMap[bill.id] && slugMap[bill.id].slug) || billSlug(bill);

const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});

// Collect bioguide IDs — deduplicate
const seen = new Set();
const bioguideIds = [];
for (const stateReps of Object.values(repsIndex)) {
  for (const rep of stateReps) {
    if (rep.bioguideId && !seen.has(rep.bioguideId)) {
      seen.add(rep.bioguideId);
      bioguideIds.push(rep.bioguideId);
    }
  }
}

const entries = [];

// Static pages
entries.push(urlEntry(BASE + '/',             todayStr(), 'daily',   '1.0'));
entries.push(urlEntry(BASE + '/floor.html',   todayStr(), 'daily',   '0.8'));
entries.push(urlEntry(BASE + '/reps.html',    todayStr(), 'monthly', '0.6'));
entries.push(urlEntry(BASE + '/privacy.html', null,       'yearly',  '0.3'));
entries.push(urlEntry(BASE + '/terms.html',   null,       'yearly',  '0.3'));
entries.push(urlEntry(BASE + '/about.html',   null,       'yearly',  '0.3'));
entries.push(urlEntry(BASE + '/corrections.html', null,   'yearly',  '0.3'));
// Trust + authorship surfaces. The author page is the canonical Person entity
// for the whole site, so it must be crawlable for the @id references on every
// article and bill page to resolve.
entries.push(urlEntry(BASE + '/editorial-standards.html', null, 'yearly', '0.4'));
entries.push(urlEntry(BASE + '/author/james-shearn', null,  'monthly', '0.4'));

// Bill pages — static /bill/<slug>/ URLs (only current slugs; historical
// redirect stubs are noindex and intentionally excluded).
for (const bill of bills) {
  const isEnacted    = bill.stage === 'signed';
  const changefreq   = isEnacted ? 'monthly' : 'weekly';
  const priority     = isEnacted ? '0.8'     : '0.9';
  entries.push(urlEntry(
    BASE + '/bill/' + slugFor(bill) + '/',
    billLastMod(bill),
    changefreq,
    priority
  ));
}

// Rep pages
for (const id of bioguideIds) {
  entries.push(urlEntry(BASE + '/rep.html?id=' + id, null, 'weekly', '0.7'));
}

// Topic hubs — /topics/<slug>/ pillar pages (Phase 4). Weekly: their bill lists
// move with the corpus.
const topicsDir = path.join(ROOT, 'topics');
let topicCount = 0;
if (fs.existsSync(topicsDir)) {
  if (fs.existsSync(path.join(topicsDir, 'index.html'))) {
    entries.push(urlEntry(BASE + '/topics/', null, 'weekly', '0.7'));
    topicCount++;
  }
  for (const e of fs.readdirSync(topicsDir, { withFileTypes: true })) {
    if (e.isDirectory() && fs.existsSync(path.join(topicsDir, e.name, 'index.html'))) {
      entries.push(urlEntry(BASE + '/topics/' + e.name + '/', null, 'weekly', '0.7'));
      topicCount++;
    }
  }
}

// Articles — published guides/explainers (SEO). Included by default when the folder is present.
const articlesIndex = path.join(ROOT, 'articles', 'index.html');
if (fs.existsSync(articlesIndex)) {
  entries.push(urlEntry(BASE + '/articles/', null, 'weekly', '0.7'));
  // Add individual article files
  const articleFiles = fs.readdirSync(path.join(ROOT, 'articles'))
    .filter(f => f.endsWith('.html') && f !== 'index.html');
  for (const f of articleFiles) {
    entries.push(urlEntry(BASE + '/articles/' + f, null, 'monthly', '0.6'));
  }
}

// Dispatches — event-pegged pages from the Dispatch lane. Only the PUBLISHED
// tree is read (lib/dispatch-meta.js never looks at .dispatch-staging/), so a
// draft blocked by the deterministic gate cannot appear in the sitemap.
const { allDispatches } = require('./lib/dispatch-meta.js');
let dispatchCount = 0;
for (const d of allDispatches()) {
  entries.push(urlEntry(BASE + d.url, d.dateModified || d.datePublished, 'monthly', '0.6'));
  dispatchCount++;
}

// Changelog ("Congress Patch Notes") — hub + one permanent page per edition.
// Editions come from data/digest-state.json (written by generate_digest.js,
// which runs immediately before this in the pipeline). The hub's lastmod is the
// newest edition date; each edition is dated and effectively permanent.
let changelogCount = 0;
const changelogHub = path.join(ROOT, 'changelog', 'index.html');
if (fs.existsSync(changelogHub)) {
  let editions = [];
  try {
    const dstate = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'digest-state.json'), 'utf8'));
    editions = Array.isArray(dstate.editions) ? dstate.editions.slice() : [];
  } catch (_) {}
  editions.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const latest = editions[0] ? editions[0].date : todayStr();
  entries.push(urlEntry(BASE + '/changelog/', latest, 'weekly', '0.7'));
  changelogCount = 1;
  for (const ed of editions) {
    if (!ed || !ed.date) continue;
    entries.push(urlEntry(BASE + '/changelog/' + ed.date + '/', ed.date, 'monthly', '0.5'));
    changelogCount++;
  }
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries,
  '</urlset>',
].join('\n');

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);

console.log('sitemap.xml written — ' + entries.length + ' URLs total');
console.log('  Static pages : 7');
console.log('  Bills        : ' + bills.length);
console.log('  Reps         : ' + bioguideIds.length);
if (fs.existsSync(articlesIndex)) {
  const count = fs.readdirSync(path.join(ROOT, 'articles')).filter(f => f.endsWith('.html')).length;
  console.log('  Articles     : ' + count);
}
if (changelogCount) {
  console.log('  Changelog    : ' + changelogCount + ' (hub + editions)');
}
if (dispatchCount) {
  console.log('  Dispatches   : ' + dispatchCount);
}
