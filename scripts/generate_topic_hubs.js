#!/usr/bin/env node
// generate_topic_hubs.js — Phase 4 pillar pages: /topics/<slug>/ topic hubs.
//
//   node scripts/generate_topic_hubs.js          (regenerate hubs + spoke links)
//
// A hub aggregates the site's OWN corpus on one topic: its member guides
// (curated list in data/topics/<slug>.json) and its member bills (selected by
// billType and/or explicit ids). EVERY RENDERED FACT IS GENERATED — counts,
// stage labels, dates, links all come from cache.json / slug-map.json /
// articles-index.json / the member articles themselves at build time. Nothing
// countable is typed into the config (see CLAUDE.md: counts belong in generated
// output).
//
// Bidirectional linking is a MAINTAINED SYSTEM, and this script is the
// maintainer: each run also rewrites the "Part of the topic hub" line in every
// member article (marker class `topic-hub-link`, idempotent, inserted after the
// breadcrumb nav — OUTSIDE the article-body region that qa-ledger prose hashes
// cover, so a hub-line change never invalidates an audit). Articles that leave
// a hub lose the line on the next run. Hub links on BILL pages are emitted by
// generate_bill_pages.js, which reads the same configs.
//
// Hub prose: a tracked audited fragment (data/topics/<slug>-prose.html, ledger
// article-topic-<slug>, published there by publish-topic-prose.js) is injected
// fail-closed; a hub with no fragment opens with a structural counts-only line.
// No free-text claim ships unaudited.
//
// dateModified is DERIVED: max of member-article dateModified and member-bill
// stageDate. Never typed, so it cannot go stale.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TOPICS_DIR = path.join(ROOT, 'data', 'topics');
const OUT_DIR = path.join(ROOT, 'topics');
const BASE = 'https://legislationpatch.com';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);

const fail = (m) => { console.error(`  ❌ ${m}`); process.exit(1); };

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// 119-HR-3944 -> "H.R. 3944"
const CODE_STYLE = { HR: 'H.R.', S: 'S.', HRES: 'H.Res.', SRES: 'S.Res.', HJRES: 'H.J.Res.', SJRES: 'S.J.Res.', HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.' };
function displayCode(id) {
  const parts = String(id).split('-');
  if (parts.length < 3) return id;
  return `${CODE_STYLE[parts[1].toUpperCase()] || parts[1]} ${parts[parts.length - 1]}`;
}

function monthYear(iso) {
  if (!/^\d{4}-\d{2}/.test(String(iso))) return '';
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ---- Load corpus -----------------------------------------------------------------
const configs = fs.readdirSync(TOPICS_DIR).filter(f => f.endsWith('.json')).map(f => readJson(path.join(TOPICS_DIR, f)));
if (!configs.length) fail('no hub configs in data/topics/');

const cacheRaw = readJson(path.join(ROOT, 'data', 'cache.json'));
const bills = Array.isArray(cacheRaw.bills) ? cacheRaw.bills : Object.values(cacheRaw.bills || cacheRaw);
const slugMap = readJson(path.join(ROOT, 'data', 'slug-map.json'));
const curation = readJson(path.join(ROOT, 'data', 'articles-index.json')).articles || {};

function articleMeta(file) {
  const p = path.join(ROOT, 'articles', file);
  if (!fs.existsSync(p)) return null;
  const html = fs.readFileSync(p, 'utf8');
  const h1 = html.match(/<h1 class="article-title">([\s\S]*?)<\/h1>/);
  // No h1 = a malformed member, and a silent filename fallback would hide it
  // (exactly how the v1 truncation bug survived a second run unnoticed).
  if (!h1) fail(`${file}: no <h1 class="article-title"> — malformed member article`);
  const dm = html.match(/"dateModified":\s*"(\d{4}-\d{2}-\d{2})"/);
  return {
    file,
    title: h1[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    summary: (curation[file] || {}).summary || '',
    label: (curation[file] || {}).label || 'Guide',
    dateModified: dm ? dm[1] : null,
  };
}

function billTypesOf(b) {
  const bt = b.billType;
  return (Array.isArray(bt) ? bt : [bt]).filter(Boolean);
}

function membersOf(cfg) {
  const guides = cfg.guides.map(articleMeta).filter(Boolean);
  const missing = cfg.guides.filter(f => !fs.existsSync(path.join(ROOT, 'articles', f)));
  if (missing.length) fail(`${cfg.slug}: member article(s) not on disk: ${missing.join(', ')}`);
  const wantTypes = new Set((cfg.bills && cfg.bills.billTypes) || []);
  const wantIds = new Set((cfg.bills && cfg.bills.ids) || []);
  const hubBills = bills
    .filter(b => wantIds.has(b.id) || billTypesOf(b).some(t => wantTypes.has(t)))
    .filter(b => slugMap[b.id] && slugMap[b.id].slug)
    .sort((a, b) => String(b.stageDate || '').localeCompare(String(a.stageDate || '')));
  return { guides, hubBills };
}

function derivedModified(guides, hubBills) {
  const dates = [
    ...guides.map(g => g.dateModified).filter(Boolean),
    ...hubBills.map(b => b.stageDate).filter(Boolean),
  ].sort();
  return dates.length ? dates[dates.length - 1] : null;
}

// ---- Page ------------------------------------------------------------------------
function hubJsonLd(cfg, guides, hubBills, modified, ogUrl) {
  const url = `${BASE}/topics/${cfg.slug}/`;
  const items = [
    ...guides.map(g => `${BASE}/articles/${g.file}`),
    ...hubBills.map(b => `${BASE}/bill/${slugMap[b.id].slug}/`),
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: cfg.title,
    description: cfg.description,
    url,
    ...(modified ? { dateModified: modified } : {}),
    publisher: { '@id': `${BASE}/#organization` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: ogUrl,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: 'Articles', item: `${BASE}/articles/` },
        { '@type': 'ListItem', position: 3, name: cfg.breadcrumb },
      ],
    },
    about: cfg.about,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((u, i) => ({ '@type': 'ListItem', position: i + 1, url: u })),
    },
  };
}

// Audited hub prose: a tracked fragment at data/topics/<slug>-prose.html that
// cleared the article lane (ledger article-topic-<slug>). Injection is
// FAIL-CLOSED: a fragment on disk with no clean, current ledger kills the run —
// silently falling back would ship a page missing prose someone audited, and
// silently injecting would ship prose nobody audited. Structural fallback is
// only for hubs with no fragment at all.
const AL = require('./lib/article-ledger.js');
function proseHtml(cfg, guides, hubBills) {
  const fragRel = `data/topics/${cfg.slug}-prose.html`;
  const fragAbs = path.join(ROOT, fragRel);
  if (fs.existsSync(fragAbs)) {
    const ledger = (() => { try { return readJson(path.join(ROOT, 'data', 'qa-ledger', `article-topic-${cfg.slug}.json`)); } catch (e) { return null; } })();
    if (!ledger) fail(`${cfg.slug}: prose fragment exists but no ledger article-topic-${cfg.slug} — audit it or remove it`);
    if (ledger.status !== 'audited' || ledger.depth !== 'full-claims') fail(`${cfg.slug}: prose ledger is not a completed audit`);
    const open = (ledger.claims || []).filter(c => c.status === 'open' && c.verdict !== 'SUPPORTED' && c.verify !== 'REJECTED');
    if (open.length) fail(`${cfg.slug}: prose ledger carries ${open.length} open flag(s)`);
    const match = AL.proseMatchesLedger(ledger);
    if (!match.ok) fail(`${cfg.slug}: prose fragment does not match its audit — ${match.reason}`);
    return fs.readFileSync(fragAbs, 'utf8').trim();
  }
  // Structural fallback: generated counts only — no free-text claims.
  const billPart = hubBills.length
    ? ` and <strong>${hubBills.length} tracked bill${hubBills.length === 1 ? '' : 's'}</strong>, each linking to a full plain-English analysis sourced from the bill text`
    : '';
  return `<p>This hub collects <strong>${guides.length} plain-English guide${guides.length === 1 ? '' : 's'}</strong>${billPart}. It is regenerated from the tracked corpus, so the lists and stages below are always current as of the latest site update.</p>`;
}

function buildHubHtml(cfg, guides, hubBills, modified) {
  const url = `${BASE}/topics/${cfg.slug}/`;
  // Per-hub OG card (rendered by generate_brand_assets --articles, manifest-gated
  // under og/topics/). Warn-not-fail when absent: on a fresh clone the hub page
  // legitimately renders before the first card batch.
  const ogCard = `og/topics/${cfg.slug}.png`;
  if (!fs.existsSync(path.join(ROOT, ogCard))) {
    console.log(`  ⚠️  ${cfg.slug}: no OG card at ${ogCard} — run: node scripts/generate_brand_assets.js --articles`);
  }
  const ogUrl = `${BASE}/${ogCard}`;
  const ld = JSON.stringify(hubJsonLd(cfg, guides, hubBills, modified, ogUrl), null, 2);

  const guideCards = guides.map(g => `
        <a class="hub-card" href="/articles/${escHtml(g.file)}" style="display:block;padding:16px 18px;border:1px solid var(--border,rgba(128,128,128,.25));border-radius:12px;text-decoration:none;color:inherit">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.5px;opacity:.65;text-transform:uppercase">${escHtml(g.label)}${g.dateModified ? ` · Updated ${escHtml(monthYear(g.dateModified))}` : ''}</div>
          <div style="font-weight:700;margin:6px 0 4px">${escHtml(g.title)}</div>
          <div style="font-size:.88rem;opacity:.8">${escHtml(g.summary)}</div>
        </a>`).join('\n');

  const billRows = hubBills.map(b => `
        <li style="margin:0 0 10px"><a href="/bill/${escHtml(slugMap[b.id].slug)}/"><strong>${escHtml(displayCode(b.id))}</strong> — ${escHtml(b.title || b.id)}</a>
          <span style="font-size:.85rem;opacity:.75"> · ${escHtml(b.stageLabel || '')}${b.stageDate ? ` · ${escHtml(b.stageDate)}` : ''}</span></li>`).join('\n');

  const related = (cfg.related || []).map(slug => {
    const rc = configs.find(c => c.slug === slug);
    return rc ? `<a href="/topics/${escHtml(rc.slug)}/">${escHtml(rc.title)}</a>` : '';
  }).filter(Boolean).join(' · ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://bioguide.congress.gov https://clerk.house.gov; connect-src 'self' https://ipapi.co https://api.zippopotam.us; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="max-image-preview:large" />
  <title>${escHtml(cfg.title)}</title>
  <meta name="description" content="${escHtml(cfg.description)}" />
  <link rel="canonical" href="${url}" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${escHtml(cfg.title)}" />
  <meta property="og:description" content="${escHtml(cfg.description)}" />
  <meta property="og:image" content="${ogUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${ogUrl}" />

  <script type="application/ld+json">
  ${ld.replace(/\n/g, '\n  ')}
  </script>

  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles-shared.css" />
  <link rel="stylesheet" href="/styles-bills.css" />
  <link rel="stylesheet" href="/styles-pages.css" />
  <link rel="stylesheet" href="/articles/articles.css" />
</head>
<body>

  <script>
    (function() {
      var t = localStorage.getItem('lpTheme');
      if (t !== 'light') document.documentElement.setAttribute('data-theme', 'dark');
    })();
  </script>

  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="logo-block" style="text-decoration:none" aria-label="Return to home">
        <img src="/logo.svg" alt="LegislationPatch" class="logo-img" id="articleLogo" />
      </a>
      <a href="/search" class="header-search-link header-search-link--solo" aria-label="Search" title="Search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg></a>
    </div>
  </header>

  <div class="trust-bar">
    <div class="trust-bar-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Sourced directly from bill text. No editorial spin.
    </div>
  </div>

  <main class="main">
    <article class="article-container">

      <nav class="article-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span class="sep">/</span>
        <a href="/articles/">Articles</a>
        <span class="sep">/</span>
        ${escHtml(cfg.breadcrumb)}
      </nav>

      <h1 class="article-title">${escHtml(cfg.title)}</h1>

      <div class="article-meta">
        <span>Topic hub</span>
        ${modified ? `<span>Updated ${escHtml(monthYear(modified))}</span>` : ''}
      </div>

      <div class="article-body">

        ${proseHtml(cfg, guides, hubBills)}

        <h2>Guides</h2>
        <div class="hub-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:14px 0 8px">
${guideCards}
        </div>
${hubBills.length ? `
        <h2>Tracked bills (${hubBills.length})</h2>
        <ul style="list-style:none;padding:0;margin:14px 0 0">
${billRows}
        </ul>` : ''}
${related ? `
        <p style="margin-top:2rem;font-size:.9rem;opacity:.85">Related topic hub${(cfg.related || []).length === 1 ? '' : 's'}: ${related}</p>` : ''}

        <p class="article-disclosure" style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border, rgba(128,128,128,0.25));font-size:0.85rem;opacity:0.8">This hub page is generated from LegislationPatch's tracked corpus — the guides and bill analyses it links to carry their own sources. See our <a href="/editorial-standards.html">editorial standards and AI disclosure</a>.</p>
      </div>
    </article>
  </main>

  <script>
    (function() {
      var isDark = localStorage.getItem('lpTheme') !== 'light';
      var logo = document.getElementById('articleLogo');
      if (logo) logo.src = isDark ? '/logo-dark.svg' : '/logo.svg';
    })();
  </script>

  <script src="/search-widget.js" defer></script>
</body>
</html>
`;
}

// ---- Spoke links in member articles ----------------------------------------------
// One managed line per member article, after the breadcrumb nav (outside the
// prose-hash region). Rewritten whole every run; removed if the article left.
function hubsForArticle(file) {
  return configs.filter(c => c.guides.includes(file));
}

function maintainSpokeLinks() {
  let touched = 0;
  const allArticleFiles = fs.readdirSync(path.join(ROOT, 'articles')).filter(f => f.endsWith('.html') && f !== 'index.html');
  for (const file of allArticleFiles) {
    const p = path.join(ROOT, 'articles', file);
    let html = fs.readFileSync(p, 'utf8');
    const before = html;
    // Strip any existing managed line INCLUDING the blank line the insertion
    // adds before it — strip(insert(x)) must equal x exactly, or every run
    // accretes whitespace and "touched" never reaches zero.
    html = html.replace(/\n[ \t]*<div class="topic-hub-link"[\s\S]*?<\/div>\n/g, '');
    const hubs = hubsForArticle(file);
    if (hubs.length) {
      const links = hubs.map(h => `<a href="/topics/${escHtml(h.slug)}/">${escHtml(h.title)}</a>`).join(' · ');
      const line = `      <div class="topic-hub-link" style="margin:-4px 0 16px;font-size:0.85rem;opacity:0.85">Part of the topic hub: ${links}</div>\n`;
      const navEnd = html.indexOf('</nav>');
      if (navEnd >= 0) {
        const insertAt = html.indexOf('\n', navEnd) + 1;
        html = html.slice(0, insertAt) + '\n' + line + html.slice(insertAt);
      }
    }
    if (html !== before) {
      // A spoke edit may only ever ADD OR REMOVE THE ONE MANAGED LINE. Anything
      // that shrinks the body or loses the document tail is corruption — refuse
      // to write it. (v1 of this function truncated 22 articles at the nav; the
      // qa-regression prose-hash tripwire caught it. This guard makes the same
      // mistake impossible to write to disk at all.)
      if (!html.trimEnd().endsWith('</html>')) fail(`${file}: spoke edit lost the document tail — not written`);
      if (!html.includes('class="article-body"')) fail(`${file}: spoke edit lost the article body — not written`);
      const bodyOf = (s) => { const a = s.indexOf('class="article-body"'); const b = s.indexOf('</article>'); return a >= 0 && b > a ? s.slice(a, b) : null; };
      if (bodyOf(html) !== bodyOf(before)) fail(`${file}: spoke edit reached inside the article body — not written`);
      fs.writeFileSync(p, html, 'utf8'); touched++;
    }
  }
  return touched;
}

// ---- Run -------------------------------------------------------------------------
let pages = 0;
const hubMetaAll = [];
for (const cfg of configs) {
  if (!/^[a-z0-9-]+$/.test(cfg.slug)) fail(`bad hub slug: ${cfg.slug}`);
  const { guides, hubBills } = membersOf(cfg);
  const modified = derivedModified(guides, hubBills);
  hubMetaAll.push({ cfg, guides, hubBills, modified });
  const dir = path.join(OUT_DIR, cfg.slug);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'index.html');
  fs.writeFileSync(out, buildHubHtml(cfg, guides, hubBills, modified), 'utf8');

  // Read back and assert the essentials actually rendered.
  const back = fs.readFileSync(out, 'utf8');
  const ldm = back.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!ldm) fail(`${cfg.slug}: no JSON-LD in output`);
  const ld = JSON.parse(ldm[1]);
  if (ld['@type'] !== 'CollectionPage') fail(`${cfg.slug}: JSON-LD is not a CollectionPage`);
  if (ld.mainEntity.numberOfItems !== guides.length + hubBills.length) fail(`${cfg.slug}: ItemList count mismatch`);
  for (const g of guides) if (!back.includes(`/articles/${g.file}`)) fail(`${cfg.slug}: missing guide link ${g.file}`);
  console.log(`  ✅ topics/${cfg.slug}/index.html — ${guides.length} guide(s), ${hubBills.length} bill(s)${modified ? `, updated ${modified}` : ''}`);
  pages++;
}

// ---- /topics/ index (hub-of-hubs) -------------------------------------------------
// The stable footer target: individual hubs come and go; /topics/ is forever.
function buildTopicsIndexHtml(hubMeta) {
  const url = `${BASE}/topics/`;
  const modified = hubMeta.map(h => h.modified).filter(Boolean).sort().pop() || null;
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Topic Hubs — Congress, Explained by Subject',
    description: 'LegislationPatch topic hubs: every guide and tracked bill on a subject, gathered on one page.',
    url,
    ...(modified ? { dateModified: modified } : {}),
    publisher: { '@id': `${BASE}/#organization` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: `${BASE}/og-image.png`,
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: 'Topics' },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: hubMeta.length,
      itemListElement: hubMeta.map((h, i) => ({ '@type': 'ListItem', position: i + 1, url: `${BASE}/topics/${h.cfg.slug}/` })),
    },
  }, null, 2);

  const cards = hubMeta.map(({ cfg, guides, hubBills }) => `
        <a class="hub-card" href="/topics/${escHtml(cfg.slug)}/" style="display:block;padding:16px 18px;border:1px solid var(--border,rgba(128,128,128,.25));border-radius:12px;text-decoration:none;color:inherit">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.5px;opacity:.65;text-transform:uppercase">Topic hub · ${guides.length} guides${hubBills.length ? ` · ${hubBills.length} bills` : ''}</div>
          <div style="font-weight:700;margin:6px 0 4px">${escHtml(cfg.title)}</div>
          <div style="font-size:.88rem;opacity:.8">${escHtml(cfg.description)}</div>
        </a>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://bioguide.congress.gov https://clerk.house.gov; connect-src 'self' https://ipapi.co https://api.zippopotam.us; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="max-image-preview:large" />
  <title>Topic Hubs — Congress, Explained by Subject</title>
  <meta name="description" content="LegislationPatch topic hubs: every guide and tracked bill on a subject, gathered on one page." />
  <link rel="canonical" href="${url}" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="Topic Hubs — Congress, Explained by Subject" />
  <meta property="og:description" content="LegislationPatch topic hubs: every guide and tracked bill on a subject, gathered on one page." />
  <meta property="og:image" content="${BASE}/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${BASE}/og-image.png" />

  <script type="application/ld+json">
  ${ld.replace(/\n/g, '\n  ')}
  </script>

  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles-shared.css" />
  <link rel="stylesheet" href="/styles-bills.css" />
  <link rel="stylesheet" href="/styles-pages.css" />
  <link rel="stylesheet" href="/articles/articles.css" />
</head>
<body>

  <script>
    (function() {
      var t = localStorage.getItem('lpTheme');
      if (t !== 'light') document.documentElement.setAttribute('data-theme', 'dark');
    })();
  </script>

  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="logo-block" style="text-decoration:none" aria-label="Return to home">
        <img src="/logo.svg" alt="LegislationPatch" class="logo-img" id="articleLogo" />
      </a>
      <a href="/search" class="header-search-link header-search-link--solo" aria-label="Search" title="Search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg></a>
    </div>
  </header>

  <div class="trust-bar">
    <div class="trust-bar-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Sourced directly from bill text. No editorial spin.
    </div>
  </div>

  <main class="main">
    <article class="article-container">

      <nav class="article-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span class="sep">/</span>
        Topics
      </nav>

      <h1 class="article-title">Topic Hubs</h1>

      <div class="article-meta">
        <span>Congress, explained by subject</span>
        ${modified ? `<span>Updated ${escHtml(monthYear(modified))}</span>` : ''}
      </div>

      <div class="article-body">
        <div class="hub-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:14px 0 8px">
${cards}
        </div>
        <p style="margin-top:1.6rem;font-size:.9rem;opacity:.85">Looking for a single guide instead? Browse <a href="/articles/">all guides &amp; explainers</a>.</p>
        <p class="article-disclosure" style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border, rgba(128,128,128,0.25));font-size:0.85rem;opacity:0.8">Hub pages are generated from LegislationPatch's tracked corpus — the guides and bill analyses they link to carry their own sources. See our <a href="/editorial-standards.html">editorial standards and AI disclosure</a>.</p>
      </div>
    </article>
  </main>

  <script>
    (function() {
      var isDark = localStorage.getItem('lpTheme') !== 'light';
      var logo = document.getElementById('articleLogo');
      if (logo) logo.src = isDark ? '/logo-dark.svg' : '/logo.svg';
    })();
  </script>

  <script src="/search-widget.js" defer></script>
</body>
</html>
`;
}

const indexOut = path.join(OUT_DIR, 'index.html');
fs.writeFileSync(indexOut, buildTopicsIndexHtml(hubMetaAll), 'utf8');
const idxBack = fs.readFileSync(indexOut, 'utf8');
if (!idxBack.includes('</html>')) fail('topics/index.html write incomplete');
for (const h of hubMetaAll) if (!idxBack.includes(`/topics/${h.cfg.slug}/`)) fail(`topics index missing hub ${h.cfg.slug}`);
console.log(`  ✅ topics/index.html — ${hubMetaAll.length} hub(s) listed`);

const touched = maintainSpokeLinks();
console.log(`\n  topic hubs: ${pages} page(s) + index written · spoke links maintained in ${touched} article(s)\n`);
