// article-index.js — scan articles/*.html once and index (a) which bills each
// article references and (b) each article's display title + URL.
//
// Shared by:
//   generate_bill_pages.js — bill -> "Related guides" cross-links
//   article-backlog.js     — bills with NO explainer yet (the complement)
//
// Read-only. Loads articles/ + data/slug-map.json and returns plain data. The
// bill-reference extraction mirrors article-staleness.js (kept in sync by hand).

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..', '..'); // scripts/lib -> repo root
const ARTICLES = path.join(ROOT, 'articles');
const DATA     = path.join(ROOT, 'data');

const CONGRESS = '119';
const CODE_TYPE = {
  HR: 'HR', H: 'HR',
  S: 'S',
  HRES: 'HRES', SRES: 'SRES',
  HJRES: 'HJRES', SJRES: 'SJRES',
  HCONRES: 'HCONRES', SCONRES: 'SCONRES',
};

function normalizeId(rawType, num) {
  const t = CODE_TYPE[String(rawType).toUpperCase().replace(/[^A-Z]/g, '')];
  if (!t || !num) return null;
  return `${CONGRESS}-${t}-${num}`;
}

function loadSlugToId() {
  const map = {};
  try {
    const slugMap = JSON.parse(fs.readFileSync(path.join(DATA, 'slug-map.json'), 'utf8'));
    for (const [id, v] of Object.entries(slugMap)) {
      if (v && v.slug) map[v.slug] = id;
      for (const h of (v && v.history) || []) map[h] = id;
    }
  } catch (_) {}
  return map;
}

// Bill ids an article references: bill.html?id= links, /bill/<slug>/ links, and
// bare text codes ("H.R. 2480", "S. 5"). Callers filter to the cache themselves.
function extractRefs(html, slugToId) {
  const ids = new Set();
  let m;

  const hrefIdRe = /bill\.html\?id=(\d+)-([A-Za-z]+)-(\d+\w*)/g;
  while ((m = hrefIdRe.exec(html)) !== null) {
    const t = CODE_TYPE[m[2].toUpperCase()];
    if (t) ids.add(`${m[1]}-${t}-${m[3]}`);
  }

  const slugRe = /\/bill\/([a-z0-9-]+)\/?/g;
  while ((m = slugRe.exec(html)) !== null) {
    const id = slugToId[m[1]];
    if (id) ids.add(id);
  }

  const codeRe = /\b(H\.?\s?R\.|H\.?\s?J\.?\s?Res\.|H\.?\s?Con\.?\s?Res\.|H\.?\s?Res\.|S\.?\s?J\.?\s?Res\.|S\.?\s?Con\.?\s?Res\.|S\.?\s?Res\.|S\.)\s?(\d{1,5})\b/g;
  while ((m = codeRe.exec(html)) !== null) {
    const id = normalizeId(m[1], m[2]);
    if (id) ids.add(id);
  }

  return [...ids];
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Best display label for an article: its <h1>, else <title> minus the brand
// suffix and any " — subtitle" tail.
function articleTitle(html) {
  let m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m) { const t = stripTags(m[1]); if (t) return t; }
  m = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (m) return stripTags(m[1]).replace(/\s*\|\s*LegislationPatch\s*$/i, '').replace(/\s+—\s+.*$/, '').trim();
  return '';
}

// Returns { byBill: Map(id -> [{title, url, file}]), articles: [{file, url, title, billIds}] }.
function buildArticleIndex() {
  const slugToId = loadSlugToId();

  let files = [];
  try {
    files = fs.readdirSync(ARTICLES).filter(f => f.endsWith('.html') && f !== 'index.html').sort();
  } catch (_) {
    return { byBill: new Map(), articles: [] };
  }

  const byBill = new Map();
  const articles = [];
  for (const f of files) {
    const html = fs.readFileSync(path.join(ARTICLES, f), 'utf8');
    const billIds = extractRefs(html, slugToId);
    const title = articleTitle(html) || f.replace(/\.html$/, '');
    const url = `/articles/${f}`;
    // breadth = how many bills this article references. A focused explainer
    // (few bills) is genuinely "about" them; a 40-bill directory/tracker is not,
    // so callers can rank/threshold on it.
    const breadth = billIds.length;
    articles.push({ file: f, url, title, billIds, breadth });
    for (const id of billIds) {
      if (!byBill.has(id)) byBill.set(id, []);
      byBill.get(id).push({ title, url, file: f, breadth });
    }
  }
  return { byBill, articles };
}

module.exports = { buildArticleIndex, extractRefs, loadSlugToId };
