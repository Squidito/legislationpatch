// generate_digest.js — "Congress Patch Notes": an auto-generated changelog of
// what Congress actually shipped, in the site's patch-notes vernacular.
//
// WHAT IT DOES
//   Diffs the current data/cache.json against the last snapshot stored in
//   data/digest-state.json. Bills that ADVANCED a stage, bills NEW to the site,
//   and bills that were SIGNED INTO LAW become the entries of a dated "edition".
//   Bills with no change are omitted. If nothing changed, no edition is emitted
//   (no thin pages) — it prints "no changes, no edition" and exits.
//
//   FIRST RUN (no state file): there is nothing to diff against, so it seeds an
//   inaugural edition from recent activity — every bill whose stageDate falls in
//   the last DAYS_WINDOW days — labelled honestly as "recent activity", NOT a
//   false diff. It then writes the state snapshot so the next run is a real diff.
//
//   EVERY entry is a structural fact drawn from cache.json (title, code, stage
//   transition, vote result, date) plus neutral connective boilerplate. No
//   editorial labels, no invented claims — significance via structural facts.
//
// OUTPUTS (repo root)
//   changelog/index.html              — the hub: latest edition in full + list
//   changelog/<YYYY-MM-DD>/index.html — one permanent page per edition
//   data/digest-state.json            — { lastRun, stages, editions }
//
// Run:  npm run digest   (or  node scripts/generate_digest.js )
// No new dependencies. Hooks into run-batch --post between OG cards and sitemap.

'use strict';

const fs   = require('fs');
const path = require('path');

const { escHtml } = require('../util.js');
const entity = require('./lib/entity.js');

const ROOT      = path.join(__dirname, '..');
const DATA      = path.join(ROOT, 'data');
const CHANGELOG = path.join(ROOT, 'changelog');
const BASE      = 'https://legislationpatch.com';
const OG_IMAGE  = BASE + '/og-image.png';

// How far back the inaugural seed edition reaches (calendar days).
const DAYS_WINDOW = 14;

// Copied VERBATIM from privacy.html <head> — the security-check gate (E3/E4)
// asserts this exact policy shape (default-src 'self', only the Cloudflare
// analytics script host allowlisted). Do not weaken.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://bioguide.congress.gov https://clerk.house.gov; connect-src 'self' https://ipapi.co https://api.zippopotam.us https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'";

// ── Small formatters ─────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];

// "2026-07-14" -> "July 14, 2026"
function dateHuman(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(dateStr || '');
  const mo = MONTHS[Number(m[2]) - 1] || m[2];
  return `${mo} ${Number(m[3])}, ${m[1]}`;
}

// Local calendar date as YYYY-MM-DD (toISOString would drift a day near midnight UTC).
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Bill id -> human bill code. Derived from the id (canonical) rather than the
// stored `code`, which is "HR.6644"/"S.5" and occasionally mis-stored as "H.xxxx".
// Shared with the dispatch lane -- both publish bill codes to readers and must
// render them identically. See scripts/lib/bill-code.js.
const { displayCode } = require('./lib/bill-code.js');

// Escape a value for safe embedding inside a <script type="application/ld+json">.
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// ── Load data ────────────────────────────────────────────────────────────────

const cache   = JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8'));
const bills   = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});

let slugMap = {};
try { slugMap = JSON.parse(fs.readFileSync(path.join(DATA, 'slug-map.json'), 'utf8')); } catch (_) {}
function slugFor(id) { return (slugMap[id] && slugMap[id].slug) || null; }
function billUrl(id) { const s = slugFor(id); return s ? `/bill/${s}/` : null; }

const STATE_PATH = path.join(DATA, 'digest-state.json');
let state = null;
try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (_) { state = null; }

// ── Vote selection (structural) ───────────────────────────────────────────────
// Pick the roll-call that corresponds to the stage being reported, so the tally
// shown next to "Passed House" is the House passage vote (not a later ping-pong
// motion). Only a recorded yea/nay tally is shown; suspension/voice votes with
// no tally render as a bare date.

function stageVote(bill) {
  const votes = Array.isArray(bill.votes) ? bill.votes.slice() : [];
  if (!votes.length) return null;
  votes.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const chamber = bill.stage === 'house' ? 'House' : bill.stage === 'senate' ? 'Senate' : null;
  if (bill.stage === 'dead') {
    return votes.find(v => /fail|reject|not agreed|not passed/i.test(v.result || '')) || votes[0];
  }
  if (chamber) {
    return votes.find(v => v.chamber === chamber && /pass|agreed/i.test(v.result || ''))
        || votes.find(v => v.chamber === chamber)
        || null;
  }
  return null; // signed / committee — no chamber vote to attach
}

function voteTally(v) {
  if (!v) return '';
  return (Number.isFinite(v.yeas) && Number.isFinite(v.nays)) ? `${v.yeas}-${v.nays}` : '';
}

// ── Build one entry object from a bill ─────────────────────────────────────────

function buildEntry(bill, fromLabel) {
  const v = stageVote(bill);
  return {
    id: bill.id,
    code: displayCode(bill.id),
    title: bill.title || bill.code || bill.id,
    url: billUrl(bill.id),
    fromLabel: fromLabel || null,
    toLabel: bill.stageLabel || bill.stage || '',
    stageDate: bill.stageDate || bill.date || '',
    enactedDate: bill.enactedDate || bill.stageDate || bill.date || '',
    tally: voteTally(v),
  };
}

const byStageDateDesc = (a, b) =>
  (String(b.stageDate).localeCompare(String(a.stageDate))) || String(a.id).localeCompare(String(b.id));

// ── Diff / seed → edition groups ───────────────────────────────────────────────
// Returns { kind, groups:[{key,title,entries}] } with only non-empty groups,
// or null when there is nothing to report.

function buildEdition() {
  const enacted = [], advanced = [], newly = [];

  if (!state || !state.stages) {
    // FIRST RUN — seed from recent activity (no false diff).
    const cutoff = new Date(Date.now() - DAYS_WINDOW * 86400000);
    for (const b of bills) {
      const sd = b.stageDate || b.date;
      if (!sd || new Date(sd) < cutoff) continue;
      if (b.stage === 'signed') enacted.push(buildEntry(b, null));
      else advanced.push(buildEntry(b, null)); // "recent activity", no from->to
    }
    enacted.sort(byStageDateDesc); advanced.sort(byStageDateDesc);
    const groups = [];
    if (enacted.length)  groups.push({ key: 'enacted',  title: 'Signed into law',   entries: enacted });
    if (advanced.length) groups.push({ key: 'advanced', title: 'Recent activity',    entries: advanced });
    if (!groups.length) return null;
    return { kind: 'inaugural', groups };
  }

  // DIFF RUN — compare each bill against the stored snapshot.
  const prior = state.stages;
  for (const b of bills) {
    const p = prior[b.id];
    const nowSigned = b.stage === 'signed';
    if (nowSigned && (!p || p.stage !== 'signed')) {
      enacted.push(buildEntry(b, p ? (p.stageLabel || null) : null));
    } else if (!p) {
      newly.push(buildEntry(b, null));
    } else if (p.stage !== b.stage) {
      advanced.push(buildEntry(b, p.stageLabel || null));
    }
    // same stage, no new id -> no change, omit
  }
  enacted.sort(byStageDateDesc); advanced.sort(byStageDateDesc); newly.sort(byStageDateDesc);
  const groups = [];
  if (enacted.length)  groups.push({ key: 'enacted',  title: 'Signed into law',  entries: enacted });
  if (advanced.length) groups.push({ key: 'advanced', title: 'Advanced a stage', entries: advanced });
  if (newly.length)    groups.push({ key: 'new',      title: 'New to the site',  entries: newly });
  if (!groups.length) return null;
  return { kind: 'diff', groups };
}

// ── HTML rendering ─────────────────────────────────────────────────────────────

function head({ title, desc, canonical, structured }) {
  const t = escHtml(title), d = escHtml(desc), c = escHtml(canonical);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="max-image-preview:large" />
  <title>${t}</title>
  <meta name="description" content="${d}" />
  <link rel="canonical" href="${c}" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" href="/favicon-32.png" sizes="32x32" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="alternate" type="application/rss+xml" title="Congress Patch Notes" href="/feed.xml" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="${c}" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="LegislationPatch" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />

  <script type="application/ld+json">${jsonLd(structured)}</script>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=IBM+Plex+Mono:wght@500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles-shared.css" />
  <link rel="stylesheet" href="/styles-bills.css" />
  <link rel="stylesheet" href="/styles-pages.css" />
  <style>
    .cl-lede { color: var(--text-muted, #8a94a6); max-width: 640px; margin: 0 0 2rem; }
    .cl-edition { margin-bottom: 2.5rem; }
    .cl-edition-date { font-size: 1.15rem; font-weight: 700; margin: 0 0 0.15rem; }
    .cl-edition-sub { font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted, #8a94a6); margin: 0 0 1.25rem; }
    .cl-group { margin: 1.75rem 0; }
    .cl-group-title { font-size: 0.95rem; font-weight: 700; margin: 0 0 0.75rem; display: flex; align-items: baseline; gap: 0.5rem; }
    .cl-group-count { font-family: 'IBM Plex Mono', monospace; font-size: 0.72rem; font-weight: 600; color: var(--text-muted, #8a94a6); }
    .cl-entries { list-style: none; margin: 0; padding: 0; }
    .cl-entry { padding: 0.55rem 0; border-top: 1px solid var(--border, rgba(255,255,255,0.08)); line-height: 1.5; }
    .cl-entry:first-child { border-top: none; }
    .cl-code { font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: 0.85rem; white-space: nowrap; }
    a.cl-code { text-decoration: none; }
    a.cl-code:hover { text-decoration: underline; }
    .cl-title { font-weight: 500; }
    .cl-transition { font-weight: 600; }
    .cl-arrow { color: var(--text-muted, #8a94a6); }
    .cl-meta { font-family: 'IBM Plex Mono', monospace; font-size: 0.75rem; color: var(--text-muted, #8a94a6); white-space: nowrap; }
    .cl-earlier { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border, rgba(255,255,255,0.08)); }
    .cl-earlier h2 { font-size: 0.95rem; font-weight: 700; margin: 0 0 0.85rem; }
    .cl-earlier ul { list-style: none; margin: 0; padding: 0; }
    .cl-earlier li { padding: 0.45rem 0; }
    .cl-earlier a { font-weight: 600; text-decoration: none; }
    .cl-earlier a:hover { text-decoration: underline; }
    .cl-earlier .cl-meta { margin-left: 0.5rem; }
    .cl-backlink { display: inline-block; margin-top: 2rem; font-weight: 600; text-decoration: none; }
    .cl-backlink:hover { text-decoration: underline; }
  </style>
</head>`;
}

// Header + theme scripts, adapted from the static-page pattern (privacy.html)
// with absolute asset paths for the /changelog/ subdirectory depth.
const HEADER = `<body>

  <script>
    (function(){
      try { if (localStorage.getItem('lpTheme') !== 'light') document.documentElement.setAttribute('data-theme', 'dark'); }
      catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }
    })();
  </script>

  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="logo-block" style="text-decoration:none">
        <img src="/logo.svg" alt="LegislationPatch" class="logo-img" />
      </a>
      <div class="header-track">
        <a href="/" class="back-btn">&larr; Back to Bills</a>
        <a href="/search" class="header-search-link" aria-label="Search" title="Search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg></a>
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
  </script>`;

const FOOTER = `  <footer class="site-footer">
    <p>Data directly sourced <em class="footer-only">only</em> from the <a href="https://api.congress.gov" target="_blank" rel="noopener noreferrer">Congress.gov API</a></p>
    <p class="footer-note">LegislationPatch is nonpartisan and does not endorse any bill or political position.</p>
    <p class="footer-links">
      <a href="/privacy.html">Privacy Policy</a> &middot;
      <a href="/terms.html">Terms of Service</a> &middot;
      <a href="/articles/">Guides</a> &middot;
      <a href="/about.html">About</a> &middot;
      <a href="/editorial-standards.html">Editorial Standards</a> &middot;
      <a href="/corrections.html">Corrections</a> &middot;
      <a href="/changelog/">Changelog</a>
    </p>
  </footer>

  <script src="/search-widget.js" defer></script>
</body>
</html>`;

function renderEntry(e) {
  const codeCell = e.url
    ? `<a class="cl-code" href="${escHtml(e.url)}">${escHtml(e.code)}</a>`
    : `<span class="cl-code">${escHtml(e.code)}</span>`;
  const transition = e.fromLabel
    ? `${escHtml(e.fromLabel)} <span class="cl-arrow">&rarr;</span> ${escHtml(e.toLabel)}`
    : escHtml(e.toLabel);
  const when = e.toLabel && /signed/i.test(e.toLabel) ? e.enactedDate : e.stageDate;
  const metaBits = [dateHuman(when)];
  if (e.tally) metaBits.push(escHtml(e.tally));
  return `      <li class="cl-entry">${codeCell} &mdash; <span class="cl-title">${escHtml(e.title)}</span>: `
       + `<span class="cl-transition">${transition}</span> `
       + `<span class="cl-meta">(${metaBits.join(', ')})</span>${dispatchLinkFor(e)}</li>`;
}

// ── The changelog side of the dispatch link (decision D3 = LINK, impl. (a)) ──
//
// A dispatch and a changelog entry record the SAME event at different depths.
// They link to each other rather than duplicating or replacing one another --
// two unlinked artifacts about one event is the near-duplicate pattern
// ARTICLE-WRITER-SPEC §9.1 warns against.
//
// Written at GENERATION TIME, in this same pipeline pass: dispatch-publish.js
// runs first and appends to data/dispatch-log.json, so by the time an edition
// renders, the dispatch URL for each event is already known. There is
// deliberately NO frozen-edition patcher -- a published edition is never
// rewritten, so a late dispatch simply keeps a one-way link and says so in the
// log.
const dispatchByEvent = (() => {
  const map = new Map();
  try {
    const log = JSON.parse(fs.readFileSync(path.join(DATA, 'dispatch-log.json'), 'utf8'));
    for (const e of (log.entries || [])) {
      if (e.status !== 'published') continue;
      map.set(`${e.billId}|${e.eventDate}`, e.url);
    }
  } catch { /* no dispatches yet — the changelog simply carries no links */ }
  return map;
})();

function dispatchLinkFor(entry) {
  const url = dispatchByEvent.get(`${entry.id}|${entry.stageDate}`)
           || dispatchByEvent.get(`${entry.id}|${entry.enactedDate}`);
  return url ? ` <a class="cl-dispatch" href="${escHtml(url)}">dispatch</a>` : '';
}

function renderGroup(g) {
  return `    <section class="cl-group">
      <h3 class="cl-group-title">${escHtml(g.title)} <span class="cl-group-count">${g.entries.length}</span></h3>
      <ul class="cl-entries">
${g.entries.map(renderEntry).join('\n')}
      </ul>
    </section>`;
}

function editionCounts(edition) {
  const c = { total: 0 };
  for (const g of edition.groups) { c[g.key] = g.entries.length; c.total += g.entries.length; }
  return c;
}

function editionSubline(edition) {
  const parts = edition.groups.map(g => `${g.entries.length} ${g.title.toLowerCase()}`);
  const scope = edition.kind === 'inaugural'
    ? `Inaugural edition &middot; recent activity from the last ${DAYS_WINDOW} days`
    : 'Changes since the previous edition';
  return `${scope} &middot; ${parts.join(' &middot; ')}`;
}

// Full edition block (date heading + subline + groups).
function renderEditionBlock(edition, dateISO) {
  return `  <section class="cl-edition">
    <h2 class="cl-edition-date">${dateHuman(dateISO)}</h2>
    <p class="cl-edition-sub">${editionSubline(edition)}</p>
${edition.groups.map(renderGroup).join('\n')}
  </section>`;
}

function renderEarlierList(earlier) {
  if (!earlier.length) return '';
  const items = earlier.map(ed => {
    const bits = [];
    if (ed.counts.enacted)  bits.push(`${ed.counts.enacted} signed`);
    if (ed.counts.advanced) bits.push(`${ed.counts.advanced} advanced`);
    if (ed.counts.new)      bits.push(`${ed.counts.new} new`);
    return `        <li><a href="${escHtml(ed.url)}">${dateHuman(ed.date)}</a>`
         + `<span class="cl-meta">${bits.join(', ') || ed.counts.total + ' updates'}</span></li>`;
  }).join('\n');
  return `    <section class="cl-earlier">
      <h2>Earlier editions</h2>
      <ul>
${items}
      </ul>
    </section>`;
}

// The hub page: latest edition in full + earlier-editions list.
function renderHub(edition, dateISO, earlier) {
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${BASE}/changelog/#webpage`,
    name: 'Congress Patch Notes — LegislationPatch Changelog',
    url: `${BASE}/changelog/`,
    description: 'A running changelog of U.S. federal bills that advanced, passed, or were signed into law — release notes for Congress, sourced from the bill record.',
    datePublished: dateISO,
    dateModified: dateISO,
    isPartOf: entity.websiteRef(),
    publisher: entity.organizationRef(),
  };
  const title = 'Congress Patch Notes — Changelog | LegislationPatch';
  const desc  = 'Release notes for Congress: a running changelog of the bills that advanced, passed a chamber, or were signed into law — every entry sourced from the bill record.';
  return head({ title, desc, canonical: `${BASE}/changelog/`, structured })
    + '\n' + HEADER + `

  <main class="main" style="max-width:760px">
    <h1 style="font-size:1.6rem;font-weight:700;margin-bottom:0.4rem">Congress Patch Notes</h1>
    <p class="cl-lede">Release notes for Congress. Every time a bill advances a stage, passes a chamber, or is signed into law, it lands here — sourced entirely from the bill record, no editorializing.</p>
${renderEditionBlock(edition, dateISO)}
${renderEarlierList(earlier)}
  </main>

` + FOOTER + '\n';
}

// A permanent per-edition page.
function renderEditionPage(edition, dateISO) {
  const counts = editionCounts(edition);
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Congress Patch Notes — ${dateHuman(dateISO)}`,
    url: `${BASE}/changelog/${dateISO}/`,
    datePublished: dateISO,
    dateModified: dateISO,
    author: entity.personRef(),
    publisher: entity.organizationRef(),
    description: `${counts.total} legislative updates recorded for ${dateHuman(dateISO)}.`,
  };
  const title = `Congress Patch Notes — ${dateHuman(dateISO)} | LegislationPatch`;
  const desc  = `${counts.total} U.S. federal bills advanced, passed, or were signed into law — the LegislationPatch changelog edition for ${dateHuman(dateISO)}.`;
  return head({ title, desc, canonical: `${BASE}/changelog/${dateISO}/`, structured })
    + '\n' + HEADER + `

  <main class="main" style="max-width:760px">
    <h1 style="font-size:1.5rem;font-weight:700;margin-bottom:0.4rem">Congress Patch Notes</h1>
    <p class="cl-lede">Release notes for Congress — this edition covers what changed on the bill record. Sourced entirely from the record, no editorializing.</p>
${renderEditionBlock(edition, dateISO)}
    <a class="cl-backlink" href="/changelog/">&larr; All editions</a>
  </main>

` + FOOTER + '\n';
}

// ── Write the current full-cache snapshot (deterministic key order) ────────────

function currentSnapshot() {
  const stages = {};
  for (const b of bills.slice().sort((a, b2) => String(a.id).localeCompare(String(b2.id)))) {
    stages[b.id] = { stage: b.stage || '', stageLabel: b.stageLabel || '', stageDate: b.stageDate || b.date || '' };
  }
  return stages;
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  const edition = buildEdition();

  if (!edition) {
    console.log('digest: no changes, no edition.');
    return;
  }

  const dateISO = todayISO();
  const counts  = editionCounts(edition);

  // Assemble the editions ledger (metadata only — full entries live on the page).
  const priorEditions = (state && Array.isArray(state.editions)) ? state.editions.slice() : [];
  const record = {
    date: dateISO,
    url: `/changelog/${dateISO}/`,
    kind: edition.kind,
    counts,
  };
  // Replace a same-day edition if this run is re-generating today.
  const editions = priorEditions.filter(e => e.date !== dateISO);
  editions.push(record);
  editions.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const earlier = editions.filter(e => e.date !== dateISO);

  // Write the permanent per-edition page.
  fs.mkdirSync(path.join(CHANGELOG, dateISO), { recursive: true });
  fs.writeFileSync(path.join(CHANGELOG, dateISO, 'index.html'), renderEditionPage(edition, dateISO));

  // (Re)write the hub with this edition in full + earlier list.
  fs.mkdirSync(CHANGELOG, { recursive: true });
  fs.writeFileSync(path.join(CHANGELOG, 'index.html'), renderHub(edition, dateISO, earlier));

  // Persist the new state snapshot.
  const nextState = {
    lastRun: new Date().toISOString(),
    stages: currentSnapshot(),
    editions,
  };
  fs.writeFileSync(STATE_PATH, JSON.stringify(nextState, null, 2) + '\n');

  const summary = edition.groups.map(g => `${g.entries.length} ${g.title.toLowerCase()}`).join(', ');
  console.log(`digest: ${edition.kind} edition ${dateISO} written — ${counts.total} entr${counts.total === 1 ? 'y' : 'ies'} (${summary}).`);
  console.log(`  hub      : changelog/index.html`);
  console.log(`  edition  : changelog/${dateISO}/index.html`);
  console.log(`  state    : data/digest-state.json (${Object.keys(nextState.stages).length} bills tracked, ${editions.length} edition(s))`);
}

main();
