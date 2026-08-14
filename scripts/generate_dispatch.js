#!/usr/bin/env node
// generate_dispatch.js -- the Dispatch lane: an event-pegged page when a bill
// crosses the D2 threshold (floor votes and above).
//
// WHAT MAKES THIS SAFE ENOUGH TO AUTO-PUBLISH (decision D1):
// a dispatch makes almost no new claims. Every substantive sentence is either
// (a) copied verbatim from the bill's already hostile-audited cache entry, or
// (b) a structural fact from data/votes -- chamber, result, tally, roll number.
// The generator writes only connective tissue, and the connective tissue is
// fixed strings, not model prose. Risk profile of a changelog entry, not of an
// article.
//
// NOTHING HERE DECIDES TO PUBLISH. This writes a page and hands it to
// dispatch-gate.js. The publisher (dispatch-publish.js) refuses to move
// anything the gate did not pass, and logs every attempt either way.
//
// Pages live at  dispatch/<slug>/index.html  -- deliberately NOT in articles/:
//   - articles/ is a hand-curated index (data/articles-index.json carries an
//     order, section and label per article); dispatches arrive at event pace
//     and would land in it as an ever-growing UNSORTED pile.
//   - npm run stale walks articles/ and would flag every dispatch forever. A
//     dispatch is a frozen record of a moment, like a changelog edition -- it
//     is not a living page and being "old" is not a defect.
//
// Usage:
//   node scripts/generate_dispatch.js --bill 119-HR-2069 --dry-run
//   node scripts/generate_dispatch.js --all --dry-run     # every pending event

'use strict';

const fs   = require('fs');
const path = require('path');

const { escHtml } = require('../util.js');
const entity = require('./lib/entity.js');
const { displayCode } = require('./lib/bill-code.js');
const { THRESHOLD, detectEvents, eventFor, snapshotStages } = require('./lib/dispatch-events.js');

const ROOT  = path.join(__dirname, '..');
const DATA  = path.join(ROOT, 'data');
const BASE  = 'https://legislationpatch.com';
const STATE = path.join(DATA, 'dispatch-state.json');

// Drafts are built into a STAGING directory, never straight into dispatch/.
//
// The first version of this wrote the page into the published tree and gated
// it afterwards -- so a dispatch that FAILED the gate still existed on disk,
// where the sitemap and search index would happily find it. Under D1
// (auto-publish, no human in the loop) that is the whole failure mode in one
// bug. Staging is gitignored; dispatch-publish.js promotes a draft only after
// all seven checks pass, and deletes it otherwise.
const STAGING   = path.join(ROOT, '.dispatch-staging');
const PUBLISHED = path.join(ROOT, 'dispatch');

const args   = process.argv.slice(2);
const opt    = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const flag   = n => args.includes(`--${n}`);
const DRY    = flag('dry-run');

// Copied VERBATIM from privacy.html <head> -- the security-check gate asserts
// this exact policy shape. Do not weaken. (Same constant as generate_digest.js.)
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://bioguide.congress.gov https://clerk.house.gov; connect-src 'self' https://ipapi.co https://api.zippopotam.us https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'";

const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];

function dateHuman(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : String(d || '');
}

const cache = JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8'));
const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});

const slugMap = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, 'slug-map.json'), 'utf8')); }
  catch { return {}; }
})();

function billUrl(bill) {
  const s = slugMap[bill.id] && slugMap[bill.id].slug;
  return s ? `/bill/${s}/` : `/bill-pending.html?id=${encodeURIComponent(bill.id)}`;
}

/** dispatch/<slug>/ -- bill slug plus the event, so re-passage never collides. */
function dispatchSlug(bill, event) {
  const base = (slugMap[bill.id] && slugMap[bill.id].slug) || String(bill.id).toLowerCase();
  return `${base}-${event.kind}-${event.eventDate}`;
}

// ── The prose ────────────────────────────────────────────────────────────────
// Every string below is either a fixed template or verbatim audited text.
// There is no free-form sentence generation anywhere in this file.

// Always the official display code ("H.R. 5625"), never the cache's compact
// key ("HR.5625") -- that is a lookup key, not how a bill is written in prose,
// and the changelog already publishes the official form.
function headlineFor(bill, event) {
  return `${displayCode(bill.id)} ${event.verb}`;
}

function statusLine(bill, event) {
  const when = dateHuman(event.eventDate);
  return `${escHtml(displayCode(bill.id))} ${escHtml(event.verb)} on ${escHtml(when)}.`;
}

/** The vote sentence -- structural facts only, straight from data/votes. */
function voteLine(event) {
  const v = event.vote;
  if (!v) return '';
  const roll = v.rollNumber != null
    ? ` (${escHtml(v.chamber)} roll call ${v.rollNumber})`
    : '';
  if (v.yeas != null && v.nays != null) {
    const extra = [];
    if (v.present)   extra.push(`${v.present} present`);
    if (v.notVoting) extra.push(`${v.notVoting} not voting`);
    return `The recorded vote was ${v.yeas}-${v.nays}${extra.length ? `, ${escHtml(extra.join(', '))}` : ''}${roll}.`;
  }
  return `The question was decided by ${escHtml(String(v.method || 'voice vote').toLowerCase())}${roll}.`;
}

/** What the bill does -- top_lines, verbatim from the audited entry. */
function whatItDoes(bill) {
  const lines = Array.isArray(bill.top_lines) ? bill.top_lines : [];
  if (!lines.length) return '';
  const items = lines.map(l => {
    const subs = (l.subs || []).map(s => `        <li>${escHtml(s)}</li>`).join('\n');
    return `      <li><strong>${escHtml(l.headline || '')}</strong>${subs ? `\n      <ul>\n${subs}\n      </ul>` : ''}</li>`;
  }).join('\n');
  return `      <h2>What does the bill do?</h2>
      <p>Drawn from this site's source-verified analysis of the bill text.</p>
      <ul>
${items}
      </ul>`;
}

function sourcesBox(bill, event, changelogUrl) {
  const items = [];
  items.push(`<li><a href="${escHtml(billUrl(bill))}">Full LegislationPatch analysis of ${escHtml(displayCode(bill.id))}</a></li>`);
  for (const v of (bill.versions || []).slice(-2)) {
    if (v && v.url) items.push(`<li><a href="${escHtml(v.url)}" target="_blank" rel="noopener">${escHtml(v.type || 'Bill text')} (Congress.gov)</a></li>`);
  }
  if (changelogUrl) {
    // Label the link by where it actually GOES. A one-way fallback points at
    // the changelog hub, so calling it "the edition for <date>" would promise
    // a page the reader will not land on.
    const isEdition = /^\/changelog\/\d{4}-\d{2}-\d{2}\//.test(changelogUrl);
    const label = isEdition
      ? `Congress Patch Notes edition for ${escHtml(dateHuman(changelogUrl.slice(11, 21)))}`
      : 'Congress Patch Notes (changelog)';
    items.push(`<li><a href="${escHtml(changelogUrl)}">${label}</a></li>`);
  }
  return `      <div class="article-source-box">
        <div class="article-source-box-label">Primary Sources</div>
        <ul>
          ${items.join('\n          ')}
        </ul>
      </div>`;
}

// ── The page ─────────────────────────────────────────────────────────────────

function renderDispatch(bill, event, { publishedAt, changelogUrl }) {
  const slug     = dispatchSlug(bill, event);
  const url      = `${BASE}/dispatch/${slug}/`;
  const headline = headlineFor(bill, event);
  const title    = `${headline} — LegislationPatch`;
  const desc     = `${displayCode(bill.id)}, ${bill.title || ''} — ${event.verb} on ${dateHuman(event.eventDate)}. Source-verified record of the action.`.slice(0, 200);
  const ogImage  = `${BASE}/og/bills/${bill.id}.png`;
  const person   = entity.person();

  const structured = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${url}#newsarticle`,
    headline,
    description: desc,
    url,
    datePublished: publishedAt,
    dateModified: publishedAt,
    author: entity.personRef(),
    publisher: entity.organizationRef(),
    image: ogImage,
    isPartOf: entity.websiteRef(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    about: {
      '@type': 'Legislation',
      name: bill.title || displayCode(bill.id),
      legislationIdentifier: displayCode(bill.id),
    },
  };

  const body = [
    `      <p><strong>${statusLine(bill, event)}</strong> ${voteLine(event)}</p>`,
    // Em-dash apposition, not "X is <title>": bill titles vary wildly in shape
    // ("Cashless Bail Reporting Act", "A bill to amend...", "21st Century ROAD
    // to Housing Act") and no single article reads correctly in front of all of
    // them. The changelog uses the same construction.
    `      <p>${escHtml(displayCode(bill.id))} &mdash; ${escHtml(bill.title || '')}. This page records the action only; the source-verified analysis of what the bill contains is on <a href="${escHtml(billUrl(bill))}">the bill's page</a>.</p>`,
    whatItDoes(bill),
    `      <h2>Where does it stand now?</h2>
      <p>Stage: <strong>${escHtml(bill.stageLabel || bill.stage || '')}</strong>, as of ${escHtml(dateHuman(bill.stageDate || event.eventDate))}. Sponsored by ${escHtml(bill.sponsor || 'a member of Congress')}.</p>`,
    sourcesBox(bill, event, changelogUrl),
  ].filter(Boolean).join('\n\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="max-image-preview:large" />
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(desc)}" />
  <link rel="canonical" href="${url}" />

  <meta property="og:type" content="article" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${escHtml(headline)}" />
  <meta property="og:description" content="${escHtml(desc)}" />
  <meta property="og:image" content="${ogImage}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${ogImage}" />

  <script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>

  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" href="/favicon-32.png" sizes="32x32" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=IBM+Plex+Mono:wght@500;600;700&display=swap" rel="stylesheet" />
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

  <div class="controls-bar">
    <div class="controls-inner">
      <a href="/changelog/" class="back-btn">&larr; Congress Patch Notes</a>
    </div>
  </div>

  <main class="main">
    <article class="article-container">

      <nav class="article-breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span class="sep">/</span>
        <a href="/changelog/">Congress Patch Notes</a>
        <span class="sep">/</span>
        ${escHtml(displayCode(bill.id))}
      </nav>

      <h1 class="article-title">${escHtml(headline)}</h1>

      <div class="article-meta">
        <span>By <a href="${escHtml(person.url)}" rel="author">${escHtml(person.name)}</a>, ${escHtml(person.jobTitle)}</span>
        <span>Published ${escHtml(dateHuman(publishedAt.slice(0, 10)))}</span>
      </div>

      <div class="article-body">

${body}

        <p class="article-disclosure">${entity.disclosureHtml()}</p>

      </div>
    </article>
  </main>

  <footer class="site-footer">
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
</html>
`;
}

// ── State ────────────────────────────────────────────────────────────────────

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch { return null; }
}

/**
 * First run has no snapshot. It seeds one and emits NOTHING -- a lane that
 * back-filled the existing corpus on its first run would publish 212 pages in
 * one burst, which is the textbook definition of the abuse this design exists
 * to avoid.
 */
function ensureState() {
  const s = loadState();
  if (s) return s;
  const seeded = { seededAt: null, stages: snapshotStages(bills) };
  if (!DRY) fs.writeFileSync(STATE, JSON.stringify(seeded, null, 2) + '\n');
  console.log(`dispatch: no prior state — seeded a baseline for ${Object.keys(seeded.stages).length} bill(s). No dispatches emitted (by design).`);
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function buildOne(bill, event, publishedAt, changelogUrl, { dry = DRY } = {}) {
  const slug = dispatchSlug(bill, event);
  const dir  = path.join(STAGING, slug);
  const file = path.join(dir, 'index.html');
  const html = renderDispatch(bill, event, { publishedAt, changelogUrl });

  if (!dry) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, html);
    // Verify the write. A "wrote it" log with no read-back is the Phase 0 bug
    // class that shipped twice; every write in this lane reads itself back.
    const back = fs.readFileSync(file, 'utf8');
    if (back !== html) throw new Error(`dispatch write verification FAILED for ${slug}`);
  }
  return { slug, dir, file, html, url: `${BASE}/dispatch/${slug}/` };
}

/**
 * The changelog link (decision D3 = LINK, implementation (a)).
 *
 * The dated edition is written by generate_digest.js in the SAME pipeline
 * pass, so under normal operation it exists and the link is two-way: the
 * dispatch points at the edition, and the edition points back (generate_digest
 * reads data/dispatch-log.json to add its side).
 *
 * When it does NOT exist -- a dispatch that was blocked, had its data fixed,
 * and published after its edition had already frozen -- James's ruling is to
 * accept a ONE-WAY link and note it, rather than build a frozen-edition
 * patcher. So the dispatch falls back to the changelog hub and the publisher
 * records changelogLink: "one-way" in the audit trail.
 */
function changelogLinkFor(dateISO) {
  const edition = path.join(ROOT, 'changelog', dateISO, 'index.html');
  return fs.existsSync(edition)
    ? { url: `/changelog/${dateISO}/`, mode: 'two-way' }
    : { url: '/changelog/', mode: 'one-way' };
}

function main() {
  const state = ensureState();
  if (!state) return;

  const publishedAt = opt('published-at') || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const onlyBill = opt('bill');

  let events;
  if (onlyBill) {
    const bill = bills.find(b => String(b.id).toUpperCase() === onlyBill.toUpperCase());
    if (!bill) { console.error(`dispatch: ${onlyBill} not in cache`); process.exit(1); }
    const forced = flag('force')
      ? (THRESHOLD[bill.stage] ? eventFor(bill, { stage: '__forced__', stageLabel: '', stageDate: '' }) : null)
      : eventFor(bill, (state.stages || {})[bill.id]);
    events = forced ? [forced] : [];
  } else {
    events = detectEvents(bills, state);
  }

  if (!events.length) {
    console.log('dispatch: no threshold-crossing events. Nothing to write.');
    return;
  }

  console.log(`dispatch: ${events.length} event(s) at or above the D2 threshold${DRY ? ' (DRY RUN — nothing written)' : ''}\n`);
  const built = [];
  for (const ev of events) {
    const bill = bills.find(b => b.id === ev.billId);
    const link = changelogLinkFor(publishedAt.slice(0, 10));
    const r = buildOne(bill, ev, publishedAt, link.url);
    built.push({ event: ev, bill, ...r });
    console.log(`  ${ev.billId.padEnd(16)} ${ev.kind.padEnd(14)} -> .dispatch-staging/${r.slug}/  (staged, NOT published)`);
  }
  console.log('\n  Staged only. Nothing is published until dispatch-publish.js runs the gate.');
  return built;
}

if (require.main === module) main();

module.exports = {
  renderDispatch, dispatchSlug, buildOne, billUrl, loadState, changelogLinkFor,
  STATE, STAGING, PUBLISHED, bills, snapshotStages,
};
