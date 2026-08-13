// article-meta.js -- read articles/*.html once and pull the metadata every
// downstream generator needs: title, description, dates, section, image.
//
// Shared by:
//   generate_articles_index.js -- articles/index.html (was hand-maintained)
//   generate_author_page.js    -- "recent articles" list on the author page
//   generate_news_sitemap.js   -- the 48-hour Google News sitemap
//   migrate-article-schema.js  -- one-time schema rewrite
//
// Dates come from the JSON-LD block (the canonical source) and fall back to the
// <meta> tags, then to file mtime. Read-only.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..', '..');
const ARTICLES = path.join(ROOT, 'articles');

// Files in articles/ that are not articles.
const NOT_ARTICLES = new Set(['index.html']);

function stripTags(s) {
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

function metaContent(html, attr, name) {
  const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  if (m) return stripTags(m[1]);
  // attribute order may be reversed
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${name}["']`, 'i');
  const m2 = html.match(re2);
  return m2 ? stripTags(m2[1]) : null;
}

/** Extract every JSON-LD block from a page, parsed. Malformed blocks are skipped. */
function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      /* a page with hand-broken JSON-LD should not take the whole build down */
    }
  }
  return out;
}

/** Find the Article-ish node inside any JSON-LD block (handles @graph). */
function findArticleNode(blocks) {
  const ARTICLE_TYPES = new Set(['Article', 'NewsArticle', 'BlogPosting', 'ReportageNewsArticle']);
  for (const block of blocks) {
    const candidates = Array.isArray(block['@graph']) ? block['@graph']
                     : Array.isArray(block) ? block
                     : [block];
    for (const node of candidates) {
      if (node && ARTICLE_TYPES.has(node['@type'])) return node;
    }
  }
  return null;
}

function isoDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * The publish value at FULL precision, time included if the source carried one.
 *
 * isoDate() truncates to the day, which is right for display and sorting but
 * destroys the only information the 48-hour news window can be measured from:
 * a dispatch published at 20:00 came back as "that date", the news sitemap
 * re-read it as 00:00Z, and the item aged out up to 24 hours early. Dispatches
 * (ARTICLE-WRITER-SPEC Phase 1) are exactly the pages that need the window.
 */
function isoDateTime(v) {
  if (!v) return null;
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(s) ? s : null;
}

/**
 * Read one article file into a metadata record.
 * Returns null for non-article files.
 */
function readArticle(file) {
  if (!file.endsWith('.html') || NOT_ARTICLES.has(file)) return null;

  const full = path.join(ARTICLES, file);
  const html = fs.readFileSync(full, 'utf8');
  const blocks = jsonLdBlocks(html);
  const node = findArticleNode(blocks) || {};

  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i);
  const h1 = html.match(/<h1[^>]*class=["'][^"']*article-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);

  const publishedAt = isoDateTime(node.datePublished)
                   || isoDateTime(metaContent(html, 'property', 'article:published_time'));
  const published = isoDate(publishedAt);
  const modified  = isoDate(node.dateModified)  || isoDate(metaContent(html, 'property', 'article:modified_time')) || published;

  return {
    file,
    slug: file.replace(/\.html$/, ''),
    url: `/articles/${file}`,
    title: stripTags(node.headline || (h1 && h1[1]) || (titleTag && titleTag[1]) || file),
    // The <title> tag carries the SEO-shaped version; headline/h1 is the display one.
    seoTitle: stripTags(titleTag ? titleTag[1] : ''),
    description: stripTags(node.description || metaContent(html, 'name', 'description') || ''),
    datePublished: published,
    // Full precision, time included when the page carried one. Day-precision
    // pages return the same value as datePublished. Only the news sitemap
    // needs this; everything else sorts and displays by the day.
    datePublishedAt: publishedAt,
    dateModified: modified,
    image: node.image || metaContent(html, 'property', 'og:image') || null,
    schemaType: node['@type'] || null,
    // "about" identifies bill trackers -- they carry a LegislativeAction node.
    aboutBill: node.about && node.about.identifier ? String(node.about.identifier) : null,
    hasArticleNode: Boolean(node['@type']),
    mtime: fs.statSync(full).mtime,
  };
}

/** Every article, newest-modified first. */
function allArticles() {
  return fs.readdirSync(ARTICLES)
    .map(readArticle)
    .filter(Boolean)
    .sort((a, b) => {
      const am = a.dateModified || '', bm = b.dateModified || '';
      if (am !== bm) return bm.localeCompare(am);
      return a.title.localeCompare(b.title);
    });
}

/**
 * Classify an article. Drives sectioning on the index page and decides which
 * articles belong in the news sitemap.
 *   tracker  -- about a specific bill (has a LegislativeAction "about")
 *   meta     -- how the site works (methodology, sourcing, neutrality)
 *   explainer-- evergreen civics/process guide (the default)
 */
function classify(a) {
  if (a.aboutBill) return 'tracker';
  const METse = /^(methodology|how-we-|no-editorial-spin|what-is-legislationpatch|legislationpatch-and-ai|plain-english-government)/;
  if (METse.test(a.slug)) return 'meta';
  return 'explainer';
}

module.exports = { allArticles, readArticle, classify, stripTags, jsonLdBlocks, ARTICLES };
