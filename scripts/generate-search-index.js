#!/usr/bin/env node
// generate-search-index.js — derive data/search-index.json from local data.
//
// Usage:
//   node scripts/generate-search-index.js
//
// Reads:  data/cache.json, data/slug-map.json, data/reps-index.json,
//         data/quotes.json, articles/*.html
// Writes: data/search-index.json — slim records for the client-side search
//         page (search.html) and the mobile app. One record per bill, rep,
//         standalone floor quote, and guide article.
//
// Runs in `run-batch.js --post` (after sitemap) so the index tracks every batch.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'search-index.json');

// Canonical bill-code form: "119-HR-40" / "H.R. 40" / "hconres 40" -> "hr40".
// Must stay in sync with normalizeBillCodeQuery() in search-lib.js.
function codeNorm(str) {
  const m = String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    .match(/^(?:\d{2,3})?(hconres|sconres|hjres|sjres|hres|sres|hr|s)(\d+)$/);
  return m ? m[1] + m[2] : null;
}

function trim(str, max) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)) + '…';
}

const records = [];

// ---- Bills ----
const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache.json'), 'utf8'));
const slugMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'slug-map.json'), 'utf8'));
let noSlug = 0;
for (const b of cache.bills || []) {
  const slug = slugMap[b.id] && slugMap[b.id].slug;
  if (!slug) { noSlug++; console.log(`  ⚠️ no slug for ${b.id} — skipped`); continue; }
  records.push({
    t: 'bill',
    id: b.id,
    url: `/bill/${slug}/`,
    title: b.title || b.official_title || b.id,
    sub: [b.code, b.stageLabel, b.sponsor ? String(b.sponsor).split(',')[0] : null]
      .filter(Boolean).join(' · '),
    text: trim([b.official_title, b.sponsor, b.brief || b.summary].filter(Boolean).join(' '), 260),
    code: codeNorm(b.id),
  });
}

// ---- Representatives ----
const repsIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'reps-index.json'), 'utf8'));
const repGroups = Array.isArray(repsIndex) ? repsIndex : Object.values(repsIndex);
let repCount = 0;
for (const group of repGroups) {
  for (const r of (Array.isArray(group) ? group : [])) {
    if (!r || !r.bioguideId) continue;
    records.push({
      t: 'rep',
      id: r.bioguideId,
      url: `/rep?id=${encodeURIComponent(r.bioguideId)}`,
      title: r.name,
      sub: [r.role, `${r.party}-${r.state}`, r.district != null ? `District ${r.district}` : null]
        .filter(Boolean).join(' · '),
      text: '',
    });
    repCount++;
  }
}

// ---- Floor quotes ----
const quotesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'quotes.json'), 'utf8'));
for (const q of quotesData.quotes || []) {
  if (!q || !q.text) continue;
  const slug = q.billId && slugMap[q.billId] && slugMap[q.billId].slug;
  records.push({
    t: 'quote',
    id: q.bioguideId || q.name,
    url: slug ? `/bill/${slug}/` : '/floor.html',
    billId: q.billId || null, // the app routes by bill id, not slug URL
    title: q.name,
    sub: [q.party && q.state ? `${q.party}-${q.state}` : null, q.billTitle ? `on ${trim(q.billTitle, 60)}` : null]
      .filter(Boolean).join(' · '),
    text: trim(q.text, 280),
  });
}

// ---- Guide articles ----
const articlesDir = path.join(ROOT, 'articles');
let articleCount = 0;
for (const file of fs.readdirSync(articlesDir).sort()) {
  if (!file.endsWith('.html') || file === 'index.html') continue;
  const html = fs.readFileSync(path.join(articlesDir, file), 'utf8');
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!title) { console.log(`  ⚠️ no <title> in articles/${file} — skipped`); continue; }
  records.push({
    t: 'article',
    id: file.replace(/\.html$/, ''),
    url: `/articles/${file}`,
    title: title.trim(),
    sub: 'Guide',
    text: trim(desc || '', 260),
  });
  articleCount++;
}

// ---- Dispatches ----
// Event-pegged pages from the Dispatch lane. Only PUBLISHED ones are visible
// here: lib/dispatch-meta.js reads dispatch/ and never .dispatch-staging/, so
// a draft that failed the deterministic gate cannot reach the search index.
const { allDispatches } = require('./lib/dispatch-meta.js');
let dispatchCount = 0;
for (const d of allDispatches()) {
  if (!d.title) { console.log(`  ⚠️ no headline in ${d.url} — skipped`); continue; }
  records.push({
    t: 'article',
    id: d.slug,
    url: d.url,
    title: d.title,
    sub: 'Dispatch',
    text: trim(d.description || '', 260),
  });
  dispatchCount++;
}

const counts = {
  bill: records.filter(r => r.t === 'bill').length,
  rep: repCount,
  quote: records.filter(r => r.t === 'quote').length,
  article: articleCount,
  dispatch: dispatchCount,
};

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), counts, records }, null, 2) + '\n');
console.log(`search-index: ${records.length} records (${counts.bill} bills, ${counts.rep} reps, ${counts.quote} quotes, ${counts.article} articles, ${counts.dispatch} dispatches)${noSlug ? ` — ${noSlug} bills skipped (no slug)` : ''}`);
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
