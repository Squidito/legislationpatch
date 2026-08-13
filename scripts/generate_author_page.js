#!/usr/bin/env node
// generate_author_page.js -- build the author page at author/<slug>/index.html.
//
// This page is the canonical anchor for the site's Person entity: it is the ONE
// place that emits the full Person node (with sameAs corroboration points).
// Every article and bill page references it by @id instead of repeating an
// author blob, so search and AI engines resolve one entity rather than 250.
//
// Identity data comes from data/entity.json -- never hardcode it here.
// Recent-articles list comes from scripts/lib/article-meta.js.
//
// Usage:
//   node scripts/generate_author_page.js          # write the page
//   node scripts/generate_author_page.js --check   # verify only, exit 1 if stale

'use strict';

const fs   = require('fs');
const path = require('path');

const entity = require('./lib/entity');
const { allArticles } = require('./lib/article-meta');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const CHECK_ONLY = args.includes('--check');

const RECENT_LIMIT = 12;

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://bioguide.congress.gov https://clerk.house.gov; connect-src 'self' https://ipapi.co https://api.zippopotam.us https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'";

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const mi = parseInt(m, 10) - 1;
  if (mi < 0 || mi > 11) return iso;
  return `${MONTHS[mi]} ${parseInt(d, 10)}, ${y}`;
}

function build() {
  const p    = entity.person();
  const org  = entity.organization();
  const site = entity.site();
  const BASE = site.baseUrl;

  const articles = allArticles();
  const recent = articles.slice(0, RECENT_LIMIT);

  const pageTitle = `${p.name} — ${p.jobTitle}, ${org.name}`;
  const pageDesc  = `${p.name} is the ${p.jobTitle.toLowerCase()} of ${org.name}. Every published figure, date, and statutory citation is checked against the official bill text before it ships.`;

  // --- JSON-LD: the full Person node lives HERE and nowhere else -------------
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        '@id': `${p.url}#profilepage`,
        name: pageTitle,
        url: p.url,
        description: pageDesc,
        mainEntity: { '@id': p.id },
        isPartOf: { '@id': `${BASE}/#website` },
      },
      entity.personNode(),
      entity.organizationNode(),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
          { '@type': 'ListItem', position: 2, name: p.name, item: p.url },
        ],
      },
    ],
  };

  const knowsList = (p.knowsAbout || []).map(k => `<li>${esc(k)}</li>`).join('\n            ');

  const sameAsList = (p.sameAs || []).length
    ? `<p style="margin-top:0.6rem">Elsewhere: ${(p.sameAs || [])
        .map(u => `<a href="${esc(u)}" target="_blank" rel="me noopener noreferrer">${esc(u.replace(/^https?:\/\/(www\.)?/, ''))}</a>`)
        .join(' · ')}</p>`
    : '';

  const recentList = recent.map(a => `          <li style="margin-bottom:0.6rem">
            <a href="/articles/${esc(a.file)}">${esc(a.title)}</a>
            <span class="section-label" style="display:block;font-size:0.78rem;opacity:0.7">Updated ${esc(fmtDate(a.dateModified))}</span>
          </li>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="max-image-preview:large" />
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(pageDesc)}" />
  <link rel="canonical" href="${esc(p.url)}" />

  <!-- Open Graph / Social -->
  <meta property="og:type" content="profile" />
  <meta property="og:url" content="${esc(p.url)}" />
  <meta property="og:title" content="${esc(pageTitle)}" />
  <meta property="og:description" content="${esc(pageDesc)}" />
  <meta property="og:image" content="${esc(org.logo)}" />
  <meta property="profile:first_name" content="${esc(p.givenName)}" />
  <meta property="profile:last_name" content="${esc(p.familyName)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(pageTitle)}" />
  <meta name="twitter:description" content="${esc(pageDesc)}" />
  <meta name="twitter:image" content="${esc(org.logo)}" />

  <!-- Structured data: canonical Person entity for the whole site -->
  <script type="application/ld+json">
${JSON.stringify(graph, null, 2)}
  </script>

  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" href="/favicon-32.png" sizes="32x32" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=IBM+Plex+Mono:wght@500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles-shared.css" />
  <link rel="stylesheet" href="/styles-bills.css" />
  <link rel="stylesheet" href="/styles-pages.css" />
</head>
<body>

  <!-- Apply theme before paint — dark is the default -->
  <script>
    (function(){
      try { if (localStorage.getItem('lpTheme') !== 'light') document.documentElement.setAttribute('data-theme', 'dark'); }
      catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }
    })();
  </script>

  <header class="site-header">
    <div class="header-inner">
      <a href="/index.html" class="logo-block" style="text-decoration:none">
        <img src="/logo.svg" alt="LegislationPatch" class="logo-img" />
      </a>
      <div class="header-track">
        <a href="/search" class="header-search-link" aria-label="Search" title="Search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg></a>
        <a href="/index.html" class="back-btn">← Back to Bills</a>
        <label class="theme-toggle" title="Toggle dark mode">
          <input type="checkbox" id="themeToggle" />
          <svg class="theme-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
    </div>
  </header>
  <script>
    (function() {
      var saved = localStorage.getItem('lpTheme');
      var tog = null;
      function apply(dark) {
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        var logo = document.querySelector('.logo-img'); if (logo) logo.src = dark ? '/logo-dark.svg' : '/logo.svg';
        if (tog) tog.checked = dark;
      }
      apply(saved !== 'light');
      document.addEventListener('DOMContentLoaded', function() {
        tog = document.getElementById('themeToggle');
        if (tog) {
          tog.checked = saved !== 'light';
          tog.addEventListener('change', function() {
            localStorage.setItem('lpTheme', this.checked ? 'dark' : 'light');
            apply(this.checked);
          });
        }
      });
    })();
  </script>

  <main class="main prose" style="max-width:720px">
    <h1 style="font-size:1.6rem;font-weight:700;margin-bottom:0.35rem">${esc(p.name)}</h1>
    <p class="section-label" style="margin-bottom:1.75rem">${esc(p.jobTitle)}, ${esc(org.name)}</p>

    <p>${esc(p.description)}</p>
    ${sameAsList}

    <h2 style="font-size:1rem;font-weight:600;margin:1.75rem 0 0.4rem">How this work is produced</h2>
    <p>Analyses and guides on LegislationPatch are drafted from primary source documents — official bill text from <a href="https://congress.gov" target="_blank" rel="noopener noreferrer">Congress.gov</a> and GovInfo, roll-call records, and the Congressional Record — by an automated research pipeline built for this site. Nothing published here is written from an AI model's background knowledge: every figure, date, and statutory citation must appear in the fetched source text, and a claim that cannot be tied to a source line is removed rather than softened.</p>
    <p>I review, verify, and edit that output before it is published, and I am accountable for what appears on the site. The full process is documented in the <a href="/articles/methodology.html">methodology</a>, and the division of labour between the pipeline and me is set out in the <a href="/editorial-standards.html">editorial standards and AI disclosure</a>.</p>

    <h2 style="font-size:1rem;font-weight:600;margin:1.75rem 0 0.4rem">Areas covered</h2>
    <ul style="margin:0.4rem 0 0 1.1rem;line-height:1.7">
            ${knowsList}
    </ul>

    <h2 style="font-size:1rem;font-weight:600;margin:1.75rem 0 0.4rem">Recent work</h2>
    <ul style="margin:0.4rem 0 0 1.1rem;line-height:1.5;list-style:none;padding-left:0">
${recentList}
    </ul>
    <p style="margin-top:0.9rem"><a href="/articles/">All guides →</a></p>

    <h2 style="font-size:1rem;font-weight:600;margin:1.75rem 0 0.4rem">Corrections</h2>
    <p>If something on the site is factually wrong, report it on the <a href="https://github.com/Squidito/legislationpatch/issues" target="_blank" rel="noopener noreferrer">public issue tracker</a>. Material factual errors are corrected promptly and logged on the <a href="/corrections.html">corrections page</a>.</p>
  </main>

  <footer class="site-footer">
    <p>Data directly sourced <em class="footer-only">only</em> from the <a href="https://api.congress.gov" target="_blank" rel="noopener noreferrer">Congress.gov API</a></p>
    <p class="footer-note">LegislationPatch is nonpartisan and does not endorse any bill or political position.</p>
    <p class="footer-links">
      <a href="/privacy.html">Privacy Policy</a> ·
      <a href="/terms.html">Terms of Service</a> ·
      <a href="/articles/">Guides</a> ·
      <a href="/about.html">About</a> ·
      <a href="/editorial-standards.html">Editorial Standards</a> ·
      <a href="/corrections.html">Corrections</a> ·
      <a href="/changelog/">Changelog</a>
    </p>
  </footer>

  <script src="/search-widget.js" defer></script>
</body>
</html>
`;
}

function main() {
  const p = entity.person();
  const outDir  = path.join(ROOT, 'author', p.slug);
  const outFile = path.join(outDir, 'index.html');
  const html = build();

  if (CHECK_ONLY) {
    if (!fs.existsSync(outFile)) {
      console.error(`author page: MISSING ${path.relative(ROOT, outFile)} — run: node scripts/generate_author_page.js`);
      process.exit(1);
    }
    const current = fs.readFileSync(outFile, 'utf8');
    if (current !== html) {
      console.error(`author page: STALE ${path.relative(ROOT, outFile)} — run: node scripts/generate_author_page.js`);
      process.exit(1);
    }
    console.log(`author page: up to date (${p.name})`);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, html);
  console.log(`author page: wrote ${path.relative(ROOT, outFile)} (${p.name}, ${(p.sameAs || []).length} sameAs, ${Math.min(RECENT_LIMIT, allArticles().length)} recent articles)`);
}

main();
