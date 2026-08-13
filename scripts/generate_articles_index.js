#!/usr/bin/env node
// generate_articles_index.js -- render the card list in articles/index.html.
//
// THE GAP THIS CLOSES: articles/index.html was hand-maintained. The sitemap,
// search index and RSS feed all auto-discover a new article via readdirSync, but
// the human-facing index did not -- so a new article was reachable by machines
// and invisible to readers unless someone remembered to hand-add a card.
//
// The page SHELL (head, header, footer, scripts) stays hand-maintained; only the
// cards between the markers are generated, matching how generate_bill_pages.js
// injects the homepage bill list.
//
// Curation lives in data/articles-index.json (label, summary, section, order),
// lifted out of the old hand-written page by extract-articles-index.js. Dates are
// NOT stored there -- "Updated <month year>" is derived from each article's real
// dateModified at render time, so it can never go stale the way the old
// hand-typed "Updated July 2026" labels did.
//
// An article with no curation entry still appears, under an UNSORTED section,
// using its own title and meta description. That is the whole point: a new
// article can never be silently missing again.
//
// Usage:
//   node scripts/generate_articles_index.js           # write
//   node scripts/generate_articles_index.js --check   # exit 1 if stale

'use strict';

const fs   = require('fs');
const path = require('path');

const { allArticles, classify } = require('./lib/article-meta');

const ROOT  = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'articles', 'index.html');
const DATA  = path.join(ROOT, 'data', 'articles-index.json');

const args = process.argv.slice(2);
const CHECK = args.includes('--check');

const START = '<!-- article-cards:start -->';
const END   = '<!-- article-cards:end -->';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function monthYear(iso) {
  if (!iso) return '';
  const [y, m] = iso.split('-');
  const mi = parseInt(m, 10) - 1;
  return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${y}` : '';
}

/** Fallback label for an article that has no curation entry yet. */
function defaultLabel(a) {
  switch (classify(a)) {
    case 'tracker': return 'Bill Tracker';
    case 'meta':    return 'How We Work';
    default:        return 'Explainer';
  }
}

function build() {
  const curation = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const meta = new Map(allArticles().map(a => [a.file, a]));

  // Group by editorial section, preserving the curated running order.
  const sections = [...(curation.sections || [])];
  const grouped = new Map(sections.map(s => [s, []]));
  const UNSORTED = 'UNSORTED';

  for (const [file, article] of meta) {
    const cur = curation.articles[file];
    const section = (cur && cur.section) || UNSORTED;
    if (!grouped.has(section)) { grouped.set(section, []); if (!sections.includes(section)) sections.push(section); }
    grouped.get(section).push({
      file,
      order: cur ? cur.order : 9999,
      label: cur ? cur.label : defaultLabel(article),
      showUpdated: cur ? cur.showUpdated : false,
      title: article.title,
      summary: (cur && cur.summary) || article.description || '',
      dateModified: article.dateModified,
    });
  }

  // Curated entries whose file no longer exists — surfaced, never silently dropped.
  const orphans = Object.keys(curation.articles).filter(f => !meta.has(f));

  const out = [];
  let rendered = 0;
  for (const section of sections) {
    const cards = (grouped.get(section) || []).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    if (!cards.length) continue;
    out.push(`      <!-- ${section} -->`);
    for (const c of cards) {
      rendered++;
      const updated = c.showUpdated && c.dateModified ? ` &middot; Updated ${monthYear(c.dateModified)}` : '';
      out.push(`      <div class="article-card">`);
      out.push(`        <div class="article-card-label">${esc(c.label)}${updated}</div>`);
      out.push(`        <a href="${esc(c.file)}" class="article-card-title">${esc(c.title)}</a>`);
      out.push(`        <p class="article-card-summary">${esc(c.summary)}</p>`);
      out.push(`      </div>`);
    }
    out.push('');
  }

  return { block: out.join('\n').replace(/\s+$/, ''), rendered, orphans, unsorted: (grouped.get(UNSORTED) || []).length };
}

function main() {
  let html = fs.readFileSync(INDEX, 'utf8');
  const si = html.indexOf(START);
  const ei = html.indexOf(END);
  if (si === -1 || ei === -1 || ei < si) {
    console.error(`generate_articles_index: markers not found in articles/index.html`);
    console.error(`  expected ${START} ... ${END}`);
    process.exit(1);
  }

  const { block, rendered, orphans, unsorted } = build();
  const next = html.slice(0, si + START.length) + '\n' + block + '\n' + html.slice(ei);

  if (CHECK) {
    if (next !== html) {
      console.error('articles index: STALE — run: npm run articles:index');
      process.exit(1);
    }
    console.log(`articles index: up to date (${rendered} card(s))`);
    return;
  }

  fs.writeFileSync(INDEX, next);
  console.log(`articles index: ${rendered} card(s) written to articles/index.html`);
  if (unsorted) console.log(`  ${unsorted} article(s) not in data/articles-index.json — rendered under UNSORTED; give them a section/label there`);
  if (orphans.length) console.log(`  ⚠️  ${orphans.length} curation entr(ies) point at missing files: ${orphans.join(', ')}`);
}

main();
