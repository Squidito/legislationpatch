// generate_sitemap.js — writes sitemap.xml from cache.json + reps-index.json
// Usage: node scripts/generate_sitemap.js (run from legislationpatch/ directory)

const fs   = require('fs');
const path = require('path');

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

// Bill pages
for (const bill of bills) {
  const isEnacted    = bill.stage === 'signed';
  const changefreq   = isEnacted ? 'monthly' : 'weekly';
  const priority     = isEnacted ? '0.8'     : '0.9';
  entries.push(urlEntry(
    BASE + '/bill.html?id=' + encodeURIComponent(bill.id),
    billLastMod(bill),
    changefreq,
    priority
  ));
}

// Rep pages
for (const id of bioguideIds) {
  entries.push(urlEntry(BASE + '/rep.html?id=' + id, null, 'weekly', '0.7'));
}

// Articles index — only include when passing --articles flag (articles are not yet deployed)
const articlesIndex = path.join(ROOT, 'articles', 'index.html');
if (process.argv.includes('--articles') && fs.existsSync(articlesIndex)) {
  entries.push(urlEntry(BASE + '/articles/', null, 'weekly', '0.7'));
  // Add individual article files
  const articleFiles = fs.readdirSync(path.join(ROOT, 'articles'))
    .filter(f => f.endsWith('.html') && f !== 'index.html');
  for (const f of articleFiles) {
    entries.push(urlEntry(BASE + '/articles/' + f, null, 'monthly', '0.6'));
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
console.log('  Static pages : 5');
console.log('  Bills        : ' + bills.length);
console.log('  Reps         : ' + bioguideIds.length);
if (process.argv.includes('--articles') && fs.existsSync(articlesIndex)) {
  const count = fs.readdirSync(path.join(ROOT, 'articles')).filter(f => f.endsWith('.html')).length;
  console.log('  Articles     : ' + count);
} else if (fs.existsSync(articlesIndex)) {
  const count = fs.readdirSync(path.join(ROOT, 'articles')).filter(f => f.endsWith('.html')).length;
  console.log('  Articles     : ' + count + ' local (not included — pass --articles to add)');
}
