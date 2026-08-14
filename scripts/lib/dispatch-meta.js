// dispatch-meta.js -- read published dispatch pages back into metadata records.
//
// Deliberately mirrors the record shape of lib/article-meta.js (url, title,
// description, datePublished, datePublishedAt, image) so the sitemap, news
// sitemap, feed and search index can treat dispatches and articles alike
// without either one growing a special case.
//
// Reads only dispatch/ -- the PUBLISHED tree. Staged drafts in
// .dispatch-staging/ are invisible here by construction, so a draft that never
// passed the gate can never leak into a sitemap or the search index.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIR  = path.join(ROOT, 'dispatch');

function jsonLdNodes(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].trim();
    if (!raw) continue;
    let parsed; try { parsed = JSON.parse(raw); } catch { continue; }
    const nodes = parsed['@graph'] || (Array.isArray(parsed) ? parsed : [parsed]);
    out.push(...nodes);
  }
  return out;
}

function readDispatch(slug) {
  const file = path.join(DIR, slug, 'index.html');
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, 'utf8');
  const node = jsonLdNodes(html).find(n => n && n['@type'] === 'NewsArticle');
  if (!node) return null;

  const publishedAt = String(node.datePublished || '');
  return {
    slug,
    file,
    url: `/dispatch/${slug}/`,
    title: String(node.headline || ''),
    description: String(node.description || ''),
    datePublished: publishedAt.slice(0, 10),
    datePublishedAt: publishedAt,
    dateModified: String(node.dateModified || publishedAt).slice(0, 10),
    image: node.image || null,
    billId: node.about && node.about.legislationIdentifier ? String(node.about.legislationIdentifier) : null,
  };
}

/** Every published dispatch, newest first. */
function allDispatches() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => readDispatch(e.name))
    .filter(Boolean)
    .sort((a, b) => String(b.datePublishedAt).localeCompare(String(a.datePublishedAt)));
}

module.exports = { allDispatches, readDispatch, DIR };
