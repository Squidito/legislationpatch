#!/usr/bin/env node
// extract-articles-index.js -- ONE-TIME lift of the hand-authored curation out of
// articles/index.html and into data/articles-index.json.
//
// WHY THIS EXISTS: articles/index.html was maintained by hand -- 46 cards, each
// with an editorially-chosen label ("Explainer", "Bill Tracker", "Bill Analysis
// · Pub. L. 119-83") and a hand-written summary that differs from the page's
// meta description. A new article added to articles/ never appeared here, so it
// was orphaned from human navigation even though the sitemap and search index
// picked it up automatically.
//
// Naively regenerating the page from article metadata would have destroyed 46
// editorial decisions. So: extract first, generate from the extraction second.
//
// ONE DELIBERATE TRANSFORM: labels of the form "Bill Tracker · Updated July 2026"
// bake a date into hand-written text, which goes stale silently -- the same
// failure class as the methodology page. The date suffix is stripped here and
// re-derived at render time from the article's real dateModified. Editorial part
// preserved, dynamic part generated.
//
// Run once; after that data/articles-index.json is the source of truth.
//
// Usage: node scripts/extract-articles-index.js [--apply]

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT  = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'articles', 'index.html');
const OUT   = path.join(ROOT, 'data', 'articles-index.json');

const APPLY = process.argv.slice(2).includes('--apply');

function decode(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Bill Tracker · Updated July 2026" -> { label: "Bill Tracker", hadDate: true }
function splitLabel(raw) {
  const m = raw.match(/^(.*?)\s*[·|]\s*Updated\s+[A-Z][a-z]+\s+\d{4}\s*$/);
  if (m) return { label: m[1].trim(), showUpdated: true };
  return { label: raw.trim(), showUpdated: false };
}

function main() {
  const html = fs.readFileSync(INDEX, 'utf8');

  // Walk comments and cards in document order so each card inherits the
  // section heading comment above it -- those groupings are editorial too.
  const cards = [];
  const sections = [];
  let currentSection = '';

  // A card ends at the </div> that follows its summary <p> -- matching lazily to
  // the FIRST </div> would stop at the label's own closing tag and lose the link.
  const cardRe = /<div class="article-card">([\s\S]*?<\/p>)\s*<\/div>/g;
  const commentRe = /<!--\s*([A-Z][A-Z0-9 &'\-]*?)\s*-->/g;

  // Build an ordered list of (index, type) events.
  const events = [];
  let m;
  while ((m = commentRe.exec(html)) !== null) events.push({ i: m.index, type: 'section', value: m[1].trim() });
  while ((m = cardRe.exec(html)) !== null)    events.push({ i: m.index, type: 'card', value: m[1] });
  events.sort((a, b) => a.i - b.i);

  for (const ev of events) {
    if (ev.type === 'section') {
      currentSection = ev.value;
      if (!sections.includes(currentSection)) sections.push(currentSection);
      continue;
    }
    const chunk = ev.value;
    const labelM = chunk.match(/<div class="article-card-label">([\s\S]*?)<\/div>/);
    const linkM  = chunk.match(/<a href="([^"]+)"[^>]*class="article-card-title"[^>]*>([\s\S]*?)<\/a>/);
    const sumM   = chunk.match(/<p class="article-card-summary">([\s\S]*?)<\/p>/);
    if (!linkM) continue;

    const rawLabel = decode(labelM ? labelM[1] : '');
    const { label, showUpdated } = splitLabel(rawLabel);

    cards.push({
      file: linkM[1].split('#')[0].split('?')[0],
      section: currentSection,
      label,
      showUpdated,
      title: decode(linkM[2]),
      summary: decode(sumM ? sumM[1] : ''),
    });
  }

  // Preserve the curated order explicitly -- it is an editorial choice, not
  // alphabetical or chronological.
  const out = {
    _readme: 'Curated index for articles/index.html, lifted out of the hand-maintained page on 2026-08-13. `sections` is the editorial running order of card groups; per article, `label` is the card eyebrow and `summary` is the hand-written card blurb (deliberately NOT the meta description). `showUpdated: true` appends a live "Updated <month year>" derived from the article dateModified -- the date is never stored here, so it cannot go stale. Rendered by scripts/generate_articles_index.js (npm run articles:index) into articles/index.html between the article-cards markers; the surrounding page shell stays hand-maintained. An article with no entry here still appears, under UNSORTED, using its own title/description.',
    sections,
    articles: {},
  };
  cards.forEach((c, i) => {
    out.articles[c.file] = {
      order: i + 1,
      section: c.section,
      label: c.label,
      showUpdated: c.showUpdated,
      summary: c.summary,
    };
  });

  const labels = {};
  cards.forEach(c => { labels[c.label] = (labels[c.label] || 0) + 1; });

  console.log(`extracted ${cards.length} card(s) from articles/index.html`);
  console.log('labels preserved:');
  Object.entries(labels).sort((a, b) => b[1] - a[1]).forEach(([l, n]) => console.log(`  ${String(n).padStart(3)}  ${l}`));
  const dated = cards.filter(c => c.showUpdated).length;
  console.log(`\n${dated} label(s) had a baked-in "Updated <month year>" -- now derived at render time`);

  const missingSummary = cards.filter(c => !c.summary);
  if (missingSummary.length) console.log(`⚠️  ${missingSummary.length} card(s) had no summary: ${missingSummary.map(c=>c.file).join(', ')}`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write data/articles-index.json');
    return;
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nwrote ${path.relative(ROOT, OUT)}`);
}

main();
