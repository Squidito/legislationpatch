// generate_rep_pages.js — emit a real, server-rendered static HTML page per rep.
//
// WHY: every rep used to render client-side at rep.html?id=<bioguide> off ONE
// shared shell with a generic <head> and an id-less canonical — so all 551 rep
// URLs in the sitemap reported as "alternate page with proper canonical" in
// Search Console (they all canonicalized to bare rep.html) and none could rank,
// while rep-name queries dominated the site's early impressions. This mirrors
// the /bill/<slug>/ migration (generate_bill_pages.js): a static page at
// rep/<slug>/index.html per member, each with a unique <title>/description/
// canonical, Person JSON-LD, and body content readable with JavaScript OFF.
// rep.js still loads and progressively upgrades the page (star tracking,
// show-more collapse). rep.html itself becomes a noindex ?id= redirector,
// exactly like bill.html.
//
// Outputs (all under the repo root):
//   rep/<slug>/index.html          — one per member (current slug)
//   rep/<old-slug>/index.html      — redirect stub for every historical slug
//   data/rep-slug-map.json         — { <bioguideId>: { slug, history:[] } }
//   data/rep-slug-index.json       — { <bioguideId>: <current-slug> }  (client lookup)
//   reps.html                      — static member directory injected between markers
//
// Run:  npm run rep-pages   (or  node scripts/generate_rep_pages.js )
// No new dependencies. Slug logic is shared with the client via util.repSlug so
// the generated URLs and the client's internal links can never drift.
//
// CONTENT RULE: every string on the page is copied from data/reps/<id>.json
// (Congress.gov roll-call + Congressional Record + Wikipedia-bio ingestion) or
// data/reps-index.json. Connective boilerplate only — never a new claim.

'use strict';

const fs   = require('fs');
const path = require('path');

const { escHtml, repSlug, portraitUrl, safeBioId } = require('../util.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const BASE = 'https://legislationpatch.com';
const OG_IMAGE = BASE + '/og-image.png';

// Same policy as the generated bill pages (single source: keep in sync there).
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://bioguide.congress.gov https://clerk.house.gov; connect-src 'self' https://ipapi.co https://api.zippopotam.us https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'";

// ── Load data ───────────────────────────────────────────────────────────────

const repsIndex = JSON.parse(fs.readFileSync(path.join(DATA, 'reps-index.json'), 'utf8'));

// Bill slug lookup for crawlable cross-links from vote/statement rows to
// /bill/<slug>/ pages. Written by generate_bill_pages.js, which runs before
// this script in the pipeline; missing file just means home-anchor fallbacks.
let billSlugIndex = {};
try { billSlugIndex = JSON.parse(fs.readFileSync(path.join(DATA, 'slug-index.json'), 'utf8')); } catch (_) {}

const PARTY_FULL = { D: 'Democrat', R: 'Republican', I: 'Independent' };
const STATE_NAMES = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado',
  CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho',
  IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana',
  ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan', MN:'Minnesota',
  MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada',
  NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico', NY:'New York',
  NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma', OR:'Oregon',
  PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota',
  TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington',
  WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
  DC:'District of Columbia', PR:'Puerto Rico', GU:'Guam', VI:'U.S. Virgin Islands',
  AS:'American Samoa', MP:'Northern Mariana Islands',
};

// ── Small formatters ─────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
function dateHuman(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(dateStr || '');
  const mo = MONTHS[Number(m[2]) - 1] || m[2];
  return `${mo} ${Number(m[3])}, ${m[1]}`;
}

function ordinal(n) {
  return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
}

// "119-HR-1479" -> "H.R. 1479" (same table as rep.js formatBillId).
function formatBillId(billId) {
  if (!billId) return '';
  return String(billId).replace(/^\d+-/, '')
    .replace(/^HR-/, 'H.R. ')
    .replace(/^S-/, 'S. ')
    .replace(/^HCONRES-/, 'H.Con.Res. ')
    .replace(/^SCONRES-/, 'S.Con.Res. ')
    .replace(/^HJRES-/, 'H.J.Res. ')
    .replace(/^SJRES-/, 'S.J.Res. ')
    .replace(/^HRES-/, 'H.Res. ')
    .replace(/^SRES-/, 'S.Res. ');
}

// Crawlable link target for a bill referenced by a vote/statement row: the
// static /bill/<slug>/ page when the bill is in the analyzed corpus, else the
// home view anchored to the card (client behavior for uncached bills).
function billHref(billId) {
  const slug = billSlugIndex[billId];
  return slug ? `/bill/${slug}/` : `/?scrollTo=${encodeURIComponent(billId)}`;
}

function jsonLd(obj) {
  return JSON.stringify(obj, null, 0).replace(/</g, '\\u003c');
}

// ── Server-rendered body (readable with JS OFF) ──────────────────────────────
// Mirrors rep.html's #repMain structure with the SAME element ids, pre-filled.
// rep.js re-renders these containers from the same JSON on load (idempotent)
// and wires the interactive bits (star tracking, show-more collapse).

function voteBreakdownHtml(rep) {
  const history = Array.isArray(rep.voteHistory) ? rep.voteHistory : [];
  if (!history.length) return '';
  let yeas = 0, nays = 0, nvs = 0;
  for (const v of history) {
    const lv = String(v.vote || '').toLowerCase();
    if (lv === 'yea' || lv === 'yes' || lv === 'aye') yeas++;
    else if (lv === 'nay' || lv === 'no') nays++;
    else nvs++;
  }
  const total  = history.length;
  const yeaPct = Math.round(yeas / total * 100);
  const nayPct = Math.round(nays / total * 100);
  const nvPct  = 100 - yeaPct - nayPct;
  return `<div class="rep-vote-profile-label">On the Record <span class="rep-vote-profile-count">${total} tracked vote${total !== 1 ? 's' : ''}</span></div>`
    + '<div class="rep-vote-bar-row">'
    + (yeas > 0 ? `<div class="rep-vote-bar-seg seg-yea" style="width:${yeaPct}%" title="Yea: ${yeas}"></div>` : '')
    + (nays > 0 ? `<div class="rep-vote-bar-seg seg-nay" style="width:${nayPct}%" title="Nay: ${nays}"></div>` : '')
    + (nvs  > 0 ? `<div class="rep-vote-bar-seg seg-nv" style="width:${nvPct}%" title="Not Voting: ${nvs}"></div>` : '')
    + '</div>'
    + '<div class="rep-vote-bar-legend">'
    + (yeas > 0 ? `<span class="legend-yea">Yea ${yeas}</span>` : '')
    + (nays > 0 ? `<span class="legend-nay">Nay ${nays}</span>` : '')
    + (nvs  > 0 ? `<span class="legend-nv">Not Voting ${nvs}</span>` : '')
    + '</div>';
}

function commentsHtml(rep) {
  const comments = Array.isArray(rep.comments) ? rep.comments.slice() : [];
  if (!comments.length) return '<div class="empty-state">No recorded floor statements.</div>';
  comments.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return comments.map((c, idx) => {
    const stanceCls   = c.stance === 'support' ? 'stance-support' : 'stance-oppose';
    const stanceLabel = c.stance === 'support' ? 'SUPPORT' : 'OPPOSE';
    const billLabel   = c.billTitle || formatBillId(c.billId) || 'Floor Statement';
    const titleEl     = c.billId
      ? `<a href="${escHtml(billHref(c.billId))}" class="rep-bill-link">${escHtml(billLabel)}</a>`
      : `<span class="rep-bill-link" style="cursor:default">${escHtml(billLabel)}</span>`;
    return `<div class="rep-show-item" data-idx="${idx}">`
      + '<div class="quote-card rep-comment-card">'
      + `<div class="rep-comment-title">${titleEl}${c.stance ? `<span class="quote-stance ${stanceCls}">${stanceLabel}</span>` : ''}</div>`
      + `<div class="quote-text">&ldquo;${escHtml(c.text || '')}&rdquo;</div>`
      + `<div style="font-size:0.7rem;color:var(--text-3);font-family:var(--font-mono);margin-top:10px">${escHtml(dateHuman(c.date))}</div>`
      + '</div>'
      + '</div>';
  }).join('\n');
}

function voteHistoryHtml(rep) {
  const history = Array.isArray(rep.voteHistory) ? rep.voteHistory : [];
  if (!history.length) return '';
  return history.map((v, i) => {
    const billLabel = v.billTitle ? escHtml(v.billTitle) : escHtml(formatBillId(v.billId) || v.billId || '');
    const billIdFmt = escHtml(formatBillId(v.billId));
    const rawVote   = String(v.vote || '').toLowerCase();
    const voteDisplay = rawVote.includes('yea') || rawVote.includes('yes') ? 'Yea'
                      : rawVote.includes('nay') || rawVote.includes('no')  ? 'Nay'
                      : rawVote.includes('not')                            ? 'Not Voting'
                      : (v.vote || '');
    const badgeCls = voteDisplay === 'Yea' ? 'rv-yea' : voteDisplay === 'Nay' ? 'rv-nay' : 'rv-nv';
    return `<div class="rep-show-item" data-idx="${i}">`
      + '<div class="rep-vote-row">'
      + '<div class="rep-vote-bill">'
      + `<a href="${escHtml(billHref(v.billId))}" class="rep-vote-bill-link">${billLabel}</a>`
      + (billIdFmt ? `<span class="rep-vote-bill-id">${billIdFmt}</span>` : '')
      + '</div>'
      + `<span class="rep-vote-badge ${badgeCls}">${escHtml(voteDisplay)}</span>`
      + `<span class="rep-vote-date">${escHtml(dateHuman(v.date))}</span>`
      + '</div>'
      + '</div>';
  }).join('\n');
}

function staticBody(rep) {
  const partyKey  = String(rep.party || 'I').toUpperCase()[0];
  const partyLow  = partyKey === 'D' ? 'd' : partyKey === 'R' ? 'r' : 'i';
  const partyFull = PARTY_FULL[partyKey] || rep.party || 'Independent';
  const stateFull = STATE_NAMES[rep.state] || rep.state || '';
  const chamber   = rep.role === 'Senator' ? 'Senate' : 'House';
  const districtTx = rep.district ? ` · District ${rep.district}` : '';

  const httpsPhoto = (typeof rep.photo === 'string' && /^https:\/\//i.test(rep.photo)) ? rep.photo : null;
  const portrait   = httpsPhoto || portraitUrl(rep.bioguideId);

  const stats = [
    { label: 'Chamber', value: chamber },
    { label: 'Party',   value: partyFull },
    { label: 'State',   value: stateFull || '—' },
  ];
  if (rep.district) stats.push({ label: 'District', value: ordinal(rep.district) });
  const statCells = stats.map(s =>
    `<div class="rep-stat-cell"><span class="rep-stat-label">${escHtml(s.label)}</span><span class="rep-stat-value">${escHtml(String(s.value))}</span></div>`
  ).join('');

  const voteProfile = voteBreakdownHtml(rep);

  // Bio + attribution — same >120-char condition and https-only link rule as rep.js.
  let bioHtml = '';
  if (rep.bio && String(rep.bio).length > 120) {
    let bioLink = '';
    try {
      const u = new URL(rep.bioUrl);
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        bioLink = `<a href="${escHtml(u.href)}" target="_blank" rel="noopener noreferrer" class="rep-bio-source">Wikipedia</a>`;
      }
    } catch (_) { /* not a valid URL — skip the link */ }
    bioHtml = `<div class="rep-bio-block" id="repBioBlock">
        <div class="rep-bio-label">Biography</div>
        <p class="rep-bio-text" id="repBio">${escHtml(rep.bio)}</p>${bioLink}
      </div>`;
  } else {
    bioHtml = `<div class="rep-bio-block" id="repBioBlock" style="display:none;">
        <div class="rep-bio-label">Biography</div>
        <p class="rep-bio-text" id="repBio"></p>
      </div>`;
  }

  const history = Array.isArray(rep.voteHistory) ? rep.voteHistory : [];

  return `<div id="repProfile">

      <!-- Profile card -->
      <div class="rep-profile-card party-${partyLow}" id="repProfileCard">
        <div class="rep-portrait-wrap">
          <img id="repPortrait" class="rep-portrait-xl" src="${escHtml(portrait)}" alt="Portrait of ${escHtml(rep.name || 'this member')}" />
        </div>
        <div class="rep-card-info">
          <div class="rep-card-eyebrow" id="repEyebrow">${escHtml(rep.role || '')} · ${escHtml(stateFull)}${escHtml(districtTx)}</div>
          <h1 class="rep-card-name" id="repName">${escHtml(rep.name || '')}</h1>
          <div class="rep-card-actions">
            <span id="repPartyChip"><span class="chip chip-${partyLow}">${escHtml(rep.party || 'I')}</span></span>
            <button class="star-btn rep-star-btn" id="repStarBtn" onclick="toggleRepStar()" title="Track this representative">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="rep-card-stat-panel" id="repStatGrid">${statCells}</div>
      </div>

      <!-- Plain-language seat sentence (structural facts only) — the on-page
           match for the geographic query shapes the title targets. -->
      <p class="rep-static-intro" style="margin:0.85rem 0 0;font-size:0.95rem">${escHtml(rep.name || '')} is ${rep.role === 'Senator' ? 'a' : 'the'} ${escHtml(seatPhrase(rep))}${rep.role === 'Senator' ? '' : rep.district ? ' (' + escHtml(String(rep.state)) + '-' + rep.district + ')' : ''}.</p>

      <!-- Vote breakdown -->
      <div class="rep-vote-profile" id="repVoteProfile"${voteProfile ? '' : ' style="display:none;"'}>${voteProfile}</div>

      <!-- Bio -->
      ${bioHtml}

      <!-- Floor Statements -->
      <div class="section-label rep-floor-label" style="margin-top:1.5rem;">Floor Statements</div>
      <div class="rep-comments-list" id="repComments">${commentsHtml(rep)}</div>

      <!-- Voting Record -->
      <div class="section-label rep-vote-history-label" style="margin-top:1.5rem;${history.length ? '' : 'display:none;'}" id="repVoteHistoryLabel">Voting Record</div>
      <div class="rep-vote-history" id="repVoteHistory">${voteHistoryHtml(rep)}</div>

    </div>
    <noscript><p class="static-bill-index__note">You are viewing the full server-rendered profile. Enable JavaScript to track this member and collapse long lists.</p></noscript>`;
}

// ── JSON-LD graph ────────────────────────────────────────────────────────────

// Latest tracked activity for this member — the newest vote or floor-statement
// date in the profile data. Used as schema dateModified: it moves only when the
// member's record actually changed (never a fake freshness stamp).
function latestActivity(rep) {
  let max = '';
  for (const v of (Array.isArray(rep.voteHistory) ? rep.voteHistory : [])) {
    const d = String(v.date || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(d) && d > max) max = d;
  }
  for (const c of (Array.isArray(rep.comments) ? rep.comments : [])) {
    const d = String(c.date || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(d) && d > max) max = d;
  }
  return max ? max.slice(0, 10) : '';
}

function structuredData(rep, url) {
  const chamberOrg = rep.role === 'Senator' ? 'United States Senate' : 'United States House of Representatives';
  const person = {
    '@type': 'Person',
    name: rep.name,
    jobTitle: rep.role || 'Member of Congress',
    // Bioguide id — the stable federal identifier for the member (recommended
    // Person property; already the site's canonical rep key).
    identifier: rep.bioguideId,
    memberOf: {
      '@type': 'GovernmentOrganization',
      name: chamberOrg,
      parentOrganization: { '@type': 'GovernmentOrganization', name: 'United States Congress' },
    },
    image: (typeof rep.photo === 'string' && /^https:\/\//i.test(rep.photo)) ? rep.photo : portraitUrl(rep.bioguideId),
    url,
  };
  // Entity disambiguation: link the Person to their Wikipedia article when the
  // ingestion recorded one (rep.bioUrl, https-validated — a stored source, not
  // model memory). Strongest practitioner-consensus signal for entity association.
  try {
    const u = new URL(rep.bioUrl);
    if (u.protocol === 'https:') person.sameAs = [u.href];
  } catch (_) { /* no valid bio URL — omit sameAs */ }
  const profilePage = {
    '@type': 'ProfilePage',
    mainEntity: person,
    url,
    '@id': url,
  };
  const modified = latestActivity(rep);
  if (modified) profilePage.dateModified = modified;
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Representatives', item: BASE + '/reps.html' },
      { '@type': 'ListItem', position: 3, name: rep.name, item: url },
    ],
  };
  return { '@context': 'https://schema.org', '@graph': [profilePage, breadcrumb] };
}

// ── Full page document ───────────────────────────────────────────────────────

// Display names appearing on MORE than one member (rare, but two members can
// share a name). Populated in main(); repPage() appends the bioguide id to
// colliding titles only, so every <title> is unique (preflight gate 8b).
const DUP_TITLE_NAMES = new Set();

// Plain-language seat phrase, matching how people actually search ("representative
// for florida's 12th district", "arizona senator" — the GSC-observed query shapes)
// rather than the insider "R-FL-12" code. Also varies the title tail per page,
// avoiding Google's "boilerplate duplication" title-rewrite trigger (2026-08-26
// research memo). All structural facts from the rep record — no geography beyond
// state/district is asserted (county/city composition needs Census data; banked).
function seatPhrase(rep) {
  const stateFull = STATE_NAMES[rep.state] || rep.state || '';
  if (rep.role === 'Senator') return `U.S. Senator for ${stateFull}`;
  return rep.district
    ? `U.S. Representative for ${stateFull}'s ${ordinal(rep.district)} District`
    : `U.S. Representative for ${stateFull}`;
}

function titleFor(rep) {
  const rolePrefix = rep.role === 'Senator' ? 'Sen.' : 'Rep.';
  const seat = rep.district ? `${rep.party}-${rep.state}-${rep.district}` : `${rep.party}-${rep.state}`;
  const disamb = DUP_TITLE_NAMES.has(`${rep.name}|${seat}`) ? ` [${rep.bioguideId}]` : '';
  return `${rolePrefix} ${rep.name} (${rep.party})${disamb} — ${seatPhrase(rep)} | LegislationPatch`;
}

function descFor(rep) {
  const partyKey  = String(rep.party || 'I').toUpperCase()[0];
  const partyFull = PARTY_FULL[partyKey] || rep.party || 'Independent';
  const stateFull = STATE_NAMES[rep.state] || rep.state || '';
  const seat = rep.district ? `${stateFull}, ${ordinal(rep.district)} District` : stateFull;
  const votes = Array.isArray(rep.voteHistory) ? rep.voteHistory.length : 0;
  const stmts = Array.isArray(rep.comments) ? rep.comments.length : 0;
  const counts = [
    votes ? `${votes} tracked roll-call vote${votes !== 1 ? 's' : ''}` : '',
    stmts ? `${stmts} floor statement${stmts !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(' and ');
  const tail = counts ? `${counts}, sourced from Congress.gov and the Congressional Record.` : 'profile sourced from Congress.gov.';
  return `${rep.role || 'Member of Congress'} ${rep.name} (${partyFull}, ${seat}): ${tail}`;
}

function repPage(rep, slug) {
  const url = `${BASE}/rep/${slug}/`;
  const titleAttr = escHtml(titleFor(rep));
  const descAttr  = escHtml(descFor(rep));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${titleAttr}</title>
  <meta name="description" content="${descAttr}" />
  <meta name="rep-id" content="${escHtml(rep.bioguideId)}" />
  <link rel="canonical" href="${url}" />
  <meta name="robots" content="max-image-preview:large" />

  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" href="/favicon-32.png" sizes="32x32" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <!-- Open Graph / Social -->
  <meta property="og:type" content="profile" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${titleAttr}" />
  <meta property="og:description" content="${descAttr}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="LegislationPatch" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${titleAttr}" />
  <meta name="twitter:description" content="${descAttr}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />

  <!-- Structured data (rep.js leaves the static copy in place) -->
  <script type="application/ld+json" id="rep-schema">${jsonLd(structuredData(rep, url))}</script>

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

  <!-- HEADER -->
  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="logo-block" style="text-decoration:none" aria-label="Return to home">
        <img src="/logo.svg" alt="LegislationPatch" class="logo-img" />
      </a>
      <div class="header-cta">
        <span class="header-cta__label">Apps coming soon</span>
      </div>
    </div>
  </header>

  <!-- TRUST BAR -->
  <div class="trust-bar">
    <div class="trust-bar-badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Data sourced direct from Congress.gov
    </div>
  </div>

  <!-- CONTROLS -->
  <div class="controls-bar">
    <div class="controls-inner">
      <a id="backBtn" href="/reps.html" class="back-btn">&larr; Reps</a>
      <nav class="site-nav">
        <a href="/" class="nav-link">Home</a>
        <a href="/bills.html" class="nav-link">Bills</a>
        <a href="/reps.html" class="nav-link">Reps</a>
        <a href="/floor.html" class="nav-link">Floor<span class="nav-hide-mobile"> Quotes</span></a>
      </nav>
      <div class="header-track">
        <a href="/search" class="header-search-link" aria-label="Search" title="Search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg></a>
        <a href="/favorites.html" class="fav-btn" title="Favorites &amp; tracked reps">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
          </svg>
        </a>
        <label class="theme-toggle" title="Toggle dark mode">
          <input type="checkbox" id="themeToggle" onchange="toggleTheme(this.checked)" />
          <svg class="theme-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
    </div>
  </div>

  <!-- MAIN CONTENT (server-rendered; rep.js hydrates the same containers) -->
  <main class="main" id="repMain">
    <div class="loading-state" id="loadingState" style="display:none">
      <div class="loading-spinner"></div>
      <p>Loading profile...</p>
    </div>

    <div class="error-state" id="errorState" style="display:none">
      <p id="errorMsg">Profile not yet available for this representative.</p>
      <p style="font-size:0.82rem;margin-top:0.4rem">We're adding profiles continuously — check back after the next data update.</p>
      <button onclick="window.location.href='/'" style="margin-top:0.75rem">← Back to Bills</button>
    </div>

    ${staticBody(rep)}
  </main>

  <!-- FOOTER -->
  <footer class="site-footer">
    <p>Data directly sourced <em class="footer-only">only</em> from the <a href="https://api.congress.gov" target="_blank" rel="noopener noreferrer">Congress.gov API</a></p>
    <p class="footer-note">LegislationPatch is nonpartisan and does not endorse any bill or political position.</p>
    <p class="footer-links">
      <a href="/privacy.html">Privacy Policy</a> ·
      <a href="/terms.html">Terms of Service</a> ·
      <a href="/articles/">Guides</a> ·
      <a href="/topics/">Topics</a> ·
      <a href="/about.html">About</a> ·
      <a href="/editorial-standards.html">Editorial Standards</a> ·
      <a href="/corrections.html">Corrections</a> ·
      <a href="/changelog/">Changelog</a>
    </p>
  </footer>

  <script src="/util.js"></script>
  <script src="/rep.js"></script>
  <script src="/share-highlight.js"></script>
  <script src="/search-widget.js" defer></script>
</body>
</html>
`;
}

// ── Redirect stub for a historical slug (name change) ────────────────────────

function redirectStub(currentSlug) {
  const target = `/rep/${currentSlug}/`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="noindex" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redirecting — LegislationPatch</title>
  <link rel="canonical" href="${BASE}${target}" />
  <meta http-equiv="refresh" content="0; url=${target}" />
  <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
  <p>This profile has moved. <a href="${target}">Continue to the current page →</a></p>
</body>
</html>
`;
}

// ── reps.html static member directory (crawlable, injected between markers) ──

function repsStaticList(records) {
  // Group by state (reps-index order), Senators first then House by district —
  // structural ordering, mirrors the client library's state sections.
  const byState = new Map();
  for (const { rep, slug } of records) {
    const st = rep.state || '??';
    if (!byState.has(st)) byState.set(st, []);
    byState.get(st).push({ rep, slug });
  }
  const states = [...byState.keys()].sort();
  const sections = states.map(st => {
    const members = byState.get(st).slice().sort((a, b) => {
      const aSen = a.rep.role === 'Senator' ? 0 : 1;
      const bSen = b.rep.role === 'Senator' ? 0 : 1;
      if (aSen !== bSen) return aSen - bSen;
      return (a.rep.district || 0) - (b.rep.district || 0);
    });
    const links = members.map(({ rep, slug }) => {
      const seat = rep.role === 'Senator'
        ? 'Senator'
        : `District ${rep.district || '—'}`;
      return `      <a class="static-bill-index__item" href="/rep/${slug}/">` +
        `<span class="static-bill-index__title">${escHtml(rep.name)} (${escHtml(rep.party || 'I')})</span>` +
        `<span class="static-bill-index__stage">${escHtml(seat)}</span></a>`;
    }).join('\n');
    const stateName = STATE_NAMES[st] || st;
    return `    <h3 class="static-bill-index__heading">${escHtml(stateName)}</h3>\n    <div class="static-bill-index">\n${links}\n    </div>`;
  }).join('\n');
  return `\n    <h2 class="static-bill-index__heading">All members of Congress</h2>\n${sections}\n    <noscript><p class="static-bill-index__note">Showing a text-only list of every tracked member. Enable JavaScript for portraits, chamber carousels, and rep tracking.</p></noscript>\n    `;
}

function injectRepsPage(records) {
  const repsPath = path.join(ROOT, 'reps.html');
  let html;
  try { html = fs.readFileSync(repsPath, 'utf8'); }
  catch (e) { console.warn('  ! reps.html not found — skipping directory injection'); return false; }

  const START = '<!-- static-rep-list:start -->';
  const END   = '<!-- static-rep-list:end -->';
  const si = html.indexOf(START);
  const ei = html.indexOf(END);
  if (si === -1 || ei === -1 || ei < si) {
    console.warn('  ! reps.html markers not found (' + START + ' ... ' + END + ') — skipping injection');
    return false;
  }
  const next = html.slice(0, si + START.length) + repsStaticList(records) + html.slice(ei);
  if (next !== html) fs.writeFileSync(repsPath, next);
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // 1. Collect unique members from the index; load each profile JSON.
  const seen = new Set();
  const records = [];
  let missing = 0;
  for (const stateReps of Object.values(repsIndex)) {
    for (const idxRep of stateReps) {
      const id = safeBioId(idxRep.bioguideId);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const profilePath = path.join(DATA, 'reps', `${id}.json`);
      let rep;
      try { rep = JSON.parse(fs.readFileSync(profilePath, 'utf8')); }
      catch (_) { missing++; continue; }              // no profile JSON — no page
      const slug = repSlug(rep);
      if (!slug) { missing++; continue; }
      records.push({ rep, slug });
    }
  }

  // Title-collision guard: two members sharing name AND seat string (vanishingly
  // rare) get the bioguide id appended by titleFor().
  const keyCount = new Map();
  for (const { rep } of records) {
    const seat = rep.district ? `${rep.party}-${rep.state}-${rep.district}` : `${rep.party}-${rep.state}`;
    const key = `${rep.name}|${seat}`;
    keyCount.set(key, (keyCount.get(key) || 0) + 1);
  }
  for (const [key, n] of keyCount) if (n > 1) DUP_TITLE_NAMES.add(key);

  // Slug-collision guard: bioguide prefix makes collisions impossible; fail loud anyway.
  const bySlug = new Map();
  for (const r of records) {
    if (bySlug.has(r.slug)) console.error(`  ! SLUG COLLISION: ${r.slug}  (${bySlug.get(r.slug)} vs ${r.rep.bioguideId})`);
    bySlug.set(r.slug, r.rep.bioguideId);
  }
  const currentSlugs = new Set(records.map(r => r.slug));

  // 2. Load + update the slug map (history of past slugs per member — a member
  //    name change moves the page and leaves a redirect stub behind).
  const mapPath = path.join(DATA, 'rep-slug-map.json');
  let slugMap = {};
  try { slugMap = JSON.parse(fs.readFileSync(mapPath, 'utf8')); } catch (_) {}

  for (const { rep, slug } of records) {
    const id = rep.bioguideId;
    const prev = slugMap[id];
    if (prev && prev.slug && prev.slug !== slug) {
      const history = Array.isArray(prev.history) ? prev.history.slice() : [];
      if (!history.includes(prev.slug)) history.push(prev.slug);
      slugMap[id] = { slug, history: history.filter(h => h !== slug) };
    } else {
      slugMap[id] = { slug, history: (prev && Array.isArray(prev.history) ? prev.history : []).filter(h => h !== slug) };
    }
  }

  // 3. Clean + rebuild rep/ deterministically.
  const repDir = path.join(ROOT, 'rep');
  fs.rmSync(repDir, { recursive: true, force: true });
  fs.mkdirSync(repDir, { recursive: true });

  let pageCount = 0;
  for (const { rep, slug } of records) {
    const dir = path.join(repDir, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), repPage(rep, slug));
    pageCount++;
  }

  // 4. Redirect stubs for historical slugs.
  let stubCount = 0;
  for (const [, entry] of Object.entries(slugMap)) {
    for (const old of (entry.history || [])) {
      if (currentSlugs.has(old)) continue;
      const dir = path.join(repDir, old);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), redirectStub(entry.slug));
      stubCount++;
    }
  }

  // 5. Emit the maps.
  const slugIndex = {};
  for (const { rep, slug } of records) slugIndex[rep.bioguideId] = slug;
  fs.writeFileSync(mapPath, JSON.stringify(slugMap, null, 2) + '\n');
  fs.writeFileSync(path.join(DATA, 'rep-slug-index.json'), JSON.stringify(slugIndex, null, 0) + '\n');

  // 6. Inject the crawlable member directory into reps.html.
  const injected = injectRepsPage(records);

  console.log(`generate_rep_pages: ${pageCount} rep pages, ${stubCount} redirect stub(s)`);
  if (missing) console.log(`  ${missing} index entr${missing === 1 ? 'y' : 'ies'} skipped (no profile JSON)`);
  console.log(`  data/rep-slug-map.json + data/rep-slug-index.json written (${Object.keys(slugIndex).length} ids)`);
  console.log(`  reps.html static member directory: ${injected ? 'injected' : 'SKIPPED (markers missing)'}`);
}

main();
