// generate_bill_pages.js — emit a real, server-rendered static HTML page per bill.
//
// WHY: every bill used to render client-side at bill.html?id=<id> off ONE shared
// shell with a generic <head> and an id-less canonical — so search engines and
// AI crawlers saw a single page with no per-bill title/description/canonical and
// no readable content without JavaScript. This script fixes the core SEO defect
// by writing a static page at  bill/<slug>/index.html  for every cached bill,
// each with a unique <title>/description/canonical, JSON-LD, and body content
// that is complete and readable with JavaScript OFF. The existing client scripts
// still load and progressively upgrade the page to the full interactive view.
//
// Outputs (all under the repo root):
//   bill/<slug>/index.html         — one per bill (current slug)
//   bill/<old-slug>/index.html     — redirect stub for every historical slug
//   data/slug-map.json             — { <id>: { slug, history:[] } }  (source of truth)
//   data/slug-index.json           — { <id>: <current-slug> }        (client lookup)
//   index.html                     — static bill index injected between markers
//
// Run:  npm run pages   (or  node scripts/generate_bill_pages.js )
// No new dependencies. Slug logic is shared with the client via util.js so the
// generated URLs and the client's internal links can never drift.

'use strict';

const fs   = require('fs');
const path = require('path');

const { billSlug, escHtml } = require('../util.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const BASE = 'https://legislationpatch.com';
const OG_IMAGE = BASE + '/og-image.png';

// Per-bill social card. The path is keyed on bill.id (NOT the slug) on purpose:
// a bill rename changes the slug/URL but never the image path, so shared links
// keep working. Rendered by scripts/generate_brand_assets.js --bills into
// og/bills/<id>.png. The site-wide OG_IMAGE is still used for the publisher logo.
function billOgImage(bill) { return `${BASE}/og/bills/${bill.id}.png`; }

// ── Load data ───────────────────────────────────────────────────────────────

const cache = JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8'));
const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});

// ── Small formatters ─────────────────────────────────────────────────────────

// mm-dd-yy for compact metadata rows (mirrors util.formatDateCompact behavior;
// re-implemented tiny so the generator has no DOM/browser assumptions).
function dateCompact(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}-${m[3]}-${m[1].slice(-2)}`;
  return String(dateStr);
}

const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
// "2026-06-10" -> "June 10, 2026" for the human-facing "Last updated" line.
function dateHuman(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(dateStr || '');
  const mo = MONTHS[Number(m[2]) - 1] || m[2];
  return `${mo} ${Number(m[3])}, ${m[1]}`;
}

// Collapse whitespace, truncate at a word boundary near `max`, add an ellipsis.
function truncate(str, max) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  let cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  if (sp > max * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[\s.,;:—-]+$/, '') + '…';
}

// Latest vote (most recent by date) from bill.votes[].
function latestVote(bill) {
  const votes = Array.isArray(bill.votes) ? bill.votes : [];
  if (!votes.length) return null;
  return votes.slice().sort((a, b) =>
    new Date(b.date || 0) - new Date(a.date || 0))[0];
}

// Authoritative full-text link on Congress.gov, built from the bill id parts.
const CG_TYPE = {
  HR: 'house-bill', S: 'senate-bill',
  HRES: 'house-resolution', SRES: 'senate-resolution',
  HJRES: 'house-joint-resolution', SJRES: 'senate-joint-resolution',
  HCONRES: 'house-concurrent-resolution', SCONRES: 'senate-concurrent-resolution',
};
function congressGovUrl(bill) {
  const parts = String(bill.id || '').split('-');
  if (parts.length < 3) return '';
  const congress = parts[0];
  const type = parts[1].toUpperCase();
  const num = parts[parts.length - 1];
  const seg = CG_TYPE[type];
  if (!seg || !/^\d+$/.test(congress) || !/^\d+$/.test(num)) return '';
  return `https://www.congress.gov/bill/${congress}th-congress/${seg}/${num}`;
}

// "Sen. Britt, Katie Boyd (R-AL)" -> "Katie Boyd Britt" for schema.org Person.
function sponsorPersonName(raw) {
  let s = String(raw || '').replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^(Sen\.|Rep\.|Dr\.|Mr\.|Ms\.)\s+/, '').trim();
  if (s.includes(',')) {
    const [last, first] = s.split(',').map(x => x.trim());
    s = `${first} ${last}`.trim();
  }
  return s;
}

// ── v1.1 answer-layer helpers (structured-field templating only) ─────────────
// These assemble the visible "answer" passages. HARD RULE: prose content is
// verbatim from existing cache fields (brief, summary, stageLabel, votes[], …);
// only connective boilerplate and ordering are added — never a new claim.

// Generation date, stamped visibly ("As of <GEN_DATE>") so answer passages
// carry a freshness signal. Computed at run time from the local clock.
const _NOW = new Date();
const _pad = n => String(n).padStart(2, '0');
const TODAY_ISO = `${_NOW.getFullYear()}-${_pad(_NOW.getMonth() + 1)}-${_pad(_NOW.getDate())}`;
const GEN_DATE  = dateHuman(TODAY_ISO);

// Bill type code (e.g. "HR", "S", "HJRES") from the id "119-HR-6955".
function billTypeCode(bill) {
  const parts = String(bill.id || '').split('-');
  return (parts[1] || '').toUpperCase();
}

// Bill code spaced from the id ("119-HR-6955" -> "HR 6955") — matches the
// question-heading examples and is stable regardless of code punctuation.
function codeSpaced(bill) {
  const parts = String(bill.id || '').split('-');
  if (parts.length < 3) return String(bill.code || bill.id || '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  return `${parts[1].toUpperCase()} ${parts[parts.length - 1]}`;
}

// Origin chamber + measure noun — structural facts derived from the bill type.
function chamberOf(bill) {
  const t = billTypeCode(bill);
  if (/^H/.test(t)) return 'House';
  if (/^S/.test(t)) return 'Senate';
  return '';
}
function measureNoun(bill) {
  const t = billTypeCode(bill);
  if (t === 'HJRES' || t === 'SJRES') return 'joint resolution';
  if (t === 'HCONRES' || t === 'SCONRES') return 'concurrent resolution';
  if (t === 'HRES' || t === 'SRES') return 'resolution';
  return 'bill';
}

// "Sen. Britt, Katie Boyd (R-AL)" -> "Sen. Katie Boyd Britt (R-AL)" for prose.
function sponsorInline(bill) {
  const raw = String(bill.sponsor || '').trim();
  if (!raw) return '';
  const hon = (raw.match(/^(Sen\.|Rep\.|Del\.|Com\.|Resident Commissioner)\s+/) || [])[1] || '';
  const party = (raw.match(/\(([^)]*)\)\s*$/) || [])[1] || '';
  const name = sponsorPersonName(raw);
  return `${hon ? hon + ' ' : ''}${name}${party ? ` (${party})` : ''}`.trim();
}

// Short, human title for the "What does <X> do?" heading. Uses the bill's short
// title when it reads like an Act name; falls back to the spaced code for the
// long descriptive "To amend..." titles.
function shortTitle(bill) {
  const t = String(bill.title || '').trim();
  if (t && t.length <= 60 &&
      !/^(To\b|An Act\b|A bill\b|Providing for\b|Making\b|Designating\b|A resolution\b|A concurrent\b|A joint\b|Recognizing\b|Expressing\b|Directing\b|Authorizing\b|Proposing\b|Condemning\b|Honoring\b|Supporting\b)/i.test(t)) {
    return t;
  }
  return codeSpaced(bill);
}

// Ensure a fragment ends with sentence punctuation so pieces join cleanly.
function endStop(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : t + '.';
}

// Structured lead: names the bill, its chamber, measure type, and sponsor
// (party+state) — all from structured fields, no substantive claim added.
function leadSentence(bill) {
  const code = codeSpaced(bill);
  const chamberNoun = [chamberOf(bill), measureNoun(bill)].filter(Boolean).join(' ');
  const sp = sponsorInline(bill);
  if (sp && chamberNoun) return `${code} is a ${chamberNoun} sponsored by ${sp}.`;
  if (chamberNoun)        return `${code} is a ${chamberNoun}.`;
  if (sp)                 return `${code} is sponsored by ${sp}.`;
  return '';
}

// Content-token overlap test: the brief is dropped only when it is essentially
// a restatement of the summary (>=60% of its content words already appear), so
// the answer passage never repeats itself — but a brief that adds specifics
// (e.g. dollar thresholds) is kept.
const _STOP = new Set(['the','a','an','and','or','to','of','in','on','for','with','that','which','by','is','are','be','it','its','as','at','from','this','these','those','their','they','also','any','who','has','have','had','been','will','would','under','over','new','into','than','when','while','such','including','include','other','most','each','all']);
function contentTokens(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9$%.\- ]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !_STOP.has(w));
}
function briefIsRedundant(brief, summary) {
  const bt = contentTokens(brief);
  if (!bt.length) return true;
  const ss = new Set(contentTokens(summary));
  const covered = bt.filter(t => ss.has(t)).length;
  return covered / bt.length >= 0.6;
}

// Abbreviation-aware sentence splitter. A word ends a sentence when it ends in
// . ! ? (with an optional closing quote/paren), is NOT a known abbreviation, and
// the next word starts with a capital/digit/quote (or the text ends).
const _ABBR = new Set(['u.s.','u.s.c.','no.','nos.','sec.','secs.','st.','mr.','mrs.','ms.','dr.','e.g.','i.e.','vs.','inc.','corp.','co.','jr.','sr.','ph.d.','fig.','approx.','dept.','cir.','art.','pt.']);
function splitSentences(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return [];
  const words = s.split(' ');
  const out = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur += (cur ? ' ' : '') + w;
    if (/[.!?][")']?$/.test(w)) {
      const lastWord = w.toLowerCase().replace(/[")']+$/, '');
      const next = words[i + 1];
      const boundary = next === undefined || /^[A-Z0-9"('$]/.test(next);
      if (!_ABBR.has(lastWord) && boundary) { out.push(cur); cur = ''; }
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Bound an over-long answer to whole sentences near `softMax` words, so every
// passage stays a self-contained ~130–170-word answer (the format AI answer
// engines favor). Only excerpts — never rewrites — and always keeps at least the
// opening two sentences (the structured lead + the summary's whole-bill purpose
// statement), so an excerpt is faithful, not a partial claim. Answers already
// at/under the target are returned unchanged.
function capAnswer(text, softMax) {
  if (wordCount(text) <= softMax) return text;
  const sents = splitSentences(text);
  const kept = [];
  let count = 0;
  for (const sent of sents) {
    const w = wordCount(sent);
    if (kept.length >= 2 && count + w > softMax) break;
    kept.push(sent);
    count += w;
  }
  return (kept.length ? kept : sents.slice(0, 2)).join(' ').replace(/\s+/g, ' ').trim();
}

// The self-contained answer paragraph: structured lead + summary (+ brief when
// it is not redundant), bounded to a ~130–170-word answer passage. Prose is
// verbatim from cache fields; only the lead, ordering, and length bound are
// templated. Never invents claims.
const ANSWER_MAX_WORDS = 170;
function answerParagraph(bill) {
  const brief   = String(bill.brief || '').trim();
  const summary = String(bill.summary || '').trim();
  const lead    = leadSentence(bill);
  const parts = [];
  if (lead) parts.push(lead);
  if (summary) parts.push(endStop(summary));
  if (brief && (!summary || !briefIsRedundant(brief, summary))) parts.push(endStop(brief));
  const assembled = parts.join(' ').replace(/\s+/g, ' ').trim();
  return capAnswer(assembled, ANSWER_MAX_WORDS);
}

// Word count (for the generator's own report line).
function wordCount(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

// Detailed latest-vote line: chamber, result, tally or method, date.
function voteLineDetailed(v) {
  if (!v) return '';
  let s = [v.chamber || '', v.result || ''].filter(Boolean).join(' ');
  const hasTally = typeof v.yeas === 'number' && typeof v.nays === 'number';
  if (hasTally) s += ` ${v.yeas}–${v.nays}`;
  else if (v.method) s += ` by ${String(v.method).toLowerCase()}`;
  if (hasTally && v.method) s += ` (${v.method})`;
  if (v.date) s += ` on ${dateHuman(v.date)}`;
  return s.trim();
}

// stageLabel -> natural-language phrase for the machine-friendly status sentence.
function stagePhrase(bill) {
  const s = bill.stageLabel || '';
  const map = {
    'Signed into Law': 'been signed into law' + (bill.enactedDate ? ' on ' + dateHuman(bill.enactedDate) : ''),
    'Passed House':  'passed the House',
    'Passed Senate': 'passed the Senate',
    'Failed in House':  'failed in the House',
    'Failed in Senate': 'failed in the Senate',
    'House Calendar':    'been placed on the House calendar and is awaiting a floor vote',
    'On House Calendar': 'been placed on the House calendar and is awaiting a floor vote',
    'Senate Calendar':    'been placed on the Senate calendar and is awaiting a floor vote',
    'On Senate Calendar': 'been placed on the Senate calendar and is awaiting a floor vote',
  };
  if (map[s]) return map[s];
  if (!s) return 'not yet advanced past introduction';
  return `reached the ${s} stage`;
}
function statusSentence(bill) {
  return `As of ${GEN_DATE}, ${codeSpaced(bill)} has ${stagePhrase(bill)}.`;
}

// JSON-LD embedded safely inside a <script> (guard against "</script>" in data).
function jsonLd(obj) {
  return JSON.stringify(obj, null, 0).replace(/</g, '\\u003c');
}

// ── Server-rendered body (readable with JS OFF) ──────────────────────────────

function staticBody(bill) {
  const codeLine = [
    bill.code ? bill.code.replace('.', ' ') : '',
    bill.stageLabel || '',
    dateCompact(bill.stageDate || bill.enactedDate || bill.date),
  ].filter(Boolean).map(escHtml).join(' · ');

  const cosponsors = bill.cosponsors || 0;
  const metaLine = [
    bill.sponsor ? escHtml(bill.sponsor) : '',
    cosponsors ? `${cosponsors} cosponsor${cosponsors === 1 ? '' : 's'}` : '',
    bill.pages ? `${bill.pages} page${bill.pages === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ');

  // ── Answer section: "What does <short title> do?" (self-contained passage) ──
  const answer = answerParagraph(bill);
  const answerHtml = answer
    ? `<section class="bp-section bp-answer-block">
      <h2 class="bp-label">What does the ${escHtml(shortTitle(bill))} do?</h2>
      <p class="bp-answer">${escHtml(answer)}</p>
    </section>`
    : '';

  // ── Status section: "Did <CODE> pass? Where it stands" ──
  const code = codeSpaced(bill);
  const v = latestVote(bill);
  const statusRows = [
    bill.stageLabel ? `<p class="bs-row"><span class="bs-key">Status:</span> ${escHtml(bill.stageLabel)}</p>` : '',
    v ? `<p class="bs-row"><span class="bs-key">Latest vote:</span> ${escHtml(voteLineDetailed(v))}</p>` : '',
    bill.likelihoodLabel ? `<p class="bs-row"><span class="bs-key">Outlook:</span> ${escHtml(bill.likelihoodLabel)}</p>` : '',
    bill.enactedDate ? `<p class="bs-row"><span class="bs-key">Enacted:</span> Signed into law on ${escHtml(dateHuman(bill.enactedDate))}</p>` : '',
  ].filter(Boolean).join('\n        ');

  const statusHtml = `<section class="bp-section bp-status-block">
      <h2 class="bp-label">Did ${escHtml(code)} pass? Where it stands</h2>
      <p class="bp-status-sentence">${escHtml(statusSentence(bill))}</p>
      <div class="bill-static-status">
        ${statusRows}
      </div>
    </section>`;

  const topLines = Array.isArray(bill.top_lines) ? bill.top_lines : [];
  const topLinesHtml = topLines.length ? `
    <section class="bp-section">
      <h2 class="bp-label">Key provisions</h2>
      <ul class="bill-static-toplines">
        ${topLines.map(tl => {
          const subs = Array.isArray(tl.subs) ? tl.subs : [];
          const subList = subs.length
            ? `<ul>${subs.map(s => `<li>${escHtml(s)}</li>`).join('')}</ul>`
            : '';
          return `<li><strong>${escHtml(tl.headline || '')}</strong>${subList}</li>`;
        }).join('\n        ')}
      </ul>
    </section>` : '';

  const cgUrl = congressGovUrl(bill);
  const fullTextHtml = cgUrl
    ? `<p class="bill-static-fulltext"><a href="${escHtml(cgUrl)}" rel="noopener noreferrer" target="_blank">Read the full bill text on Congress.gov →</a></p>`
    : '';

  const updated = bill.analyzedAt || bill.stageDate || bill.date;
  const updatedHtml = updated
    ? `<p class="bill-static-updated">Last updated ${escHtml(dateHuman(updated))}</p>`
    : '';

  return `<article class="bill-static" data-server-rendered="1">
    ${codeLine ? `<div class="bp-code">${codeLine}</div>` : ''}
    <h1 class="bp-title">${escHtml(bill.title || bill.code || bill.id)}</h1>
    ${metaLine ? `<div class="bp-meta">${metaLine}</div>` : ''}
    ${answerHtml}
    ${statusHtml}
    ${topLinesHtml}
    ${updatedHtml}
    ${fullTextHtml}
    <noscript><p class="bill-static-note">You are viewing a condensed, text-only summary. Enable JavaScript for the full section-by-section analysis and annotated bill text.</p></noscript>
  </article>`;
}

// ── JSON-LD graph ────────────────────────────────────────────────────────────

function structuredData(bill, url) {
  // Keep the schema description consistent with the visible answer passage.
  const desc = truncate(answerParagraph(bill) || bill.brief || bill.summary || '', 300);
  const article = {
    '@type': 'Article',
    headline: bill.title || bill.code || bill.id,
    description: desc,
    image: billOgImage(bill),
    url,
    datePublished: bill.date || undefined,
    dateModified: bill.analyzedAt || bill.stageDate || bill.date || undefined,
    publisher: {
      '@type': 'Organization',
      name: 'LegislationPatch',
      url: BASE + '/',
      logo: { '@type': 'ImageObject', url: OG_IMAGE },
    },
  };
  const legislation = {
    '@type': 'Legislation',
    name: bill.title || bill.code || bill.id,
    legislationIdentifier: bill.code || bill.id,
    legislationDate: bill.date || undefined,
    url,
  };
  if (bill.billType) legislation.legislationType = bill.billType;
  if (bill.sponsor) {
    legislation.legislationSponsor = { '@type': 'Person', name: sponsorPersonName(bill.sponsor) };
    legislation.sponsor = { '@type': 'Person', name: sponsorPersonName(bill.sponsor) };
  }
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',  item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Bills', item: BASE + '/bills.html' },
      { '@type': 'ListItem', position: 3, name: bill.title || bill.code || bill.id, item: url },
    ],
  };
  return { '@context': 'https://schema.org', '@graph': [article, legislation, breadcrumb] };
}

// ── Full page document ───────────────────────────────────────────────────────

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://bioguide.congress.gov https://clerk.house.gov; connect-src 'self' https://ipapi.co https://api.zippopotam.us https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'";

function billPage(bill, slug) {
  const url    = `${BASE}/bill/${slug}/`;
  const title  = `${bill.title || bill.code || bill.id} — Plain-English Summary | LegislationPatch`;
  const desc   = truncate(bill.brief || bill.summary || '', 155);
  const descAttr = escHtml(desc);
  const titleAttr = escHtml(title);
  const billImg = billOgImage(bill);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${titleAttr}</title>
  <meta name="description" content="${descAttr}" />
  <meta name="bill-id" content="${escHtml(bill.id)}" />
  <link rel="canonical" href="${url}" />
  <meta name="robots" content="max-image-preview:large" />

  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" href="/favicon-32.png" sizes="32x32" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <!-- Open Graph / Social -->
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${titleAttr}" />
  <meta property="og:description" content="${descAttr}" />
  <meta property="og:image" content="${billImg}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="LegislationPatch" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${titleAttr}" />
  <meta name="twitter:description" content="${descAttr}" />
  <meta name="twitter:image" content="${billImg}" />

  <!-- Structured data (bill.js leaves this in place — it is the richer copy) -->
  <script type="application/ld+json" id="bill-schema">${jsonLd(structuredData(bill, url))}</script>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=IBM+Plex+Mono:wght@500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles-shared.css" />
  <link rel="stylesheet" href="/styles-bills.css" />
  <link rel="stylesheet" href="/styles-pages.css" />
</head>
<body>

  <!-- Apply saved theme before paint -->
  <script>
    (function() {
      var t = localStorage.getItem('lpTheme');
      if (t !== 'light') document.documentElement.setAttribute('data-theme', 'dark');
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
      Sourced direct from bill text
    </div>
  </div>

  <!-- CONTROLS -->
  <div class="controls-bar">
    <div class="controls-inner">
      <a id="backBtn" href="/" class="back-btn">&larr; Bills</a>
      <div class="header-track">
        <a href="/search" class="header-search-link" aria-label="Search" title="Search"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg></a>
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

  <!-- MAIN CONTENT -->
  <main class="main">
    <div id="bill-loading" class="loading-state" style="display:none">
      <div class="loading-spinner"></div>
      <p>Loading bill...</p>
    </div>

    <!-- Server-rendered summary (replaced by the richer client render when JS loads;
         preserved as-is if the client data fetch fails). -->
    <div class="bills-list" id="bill-card-mount">${staticBody(bill)}</div>
    <div id="analysis-toggle-row"></div>
    <div class="bills-list" id="bill-text-mount"></div>
  </main>

  <!-- FOOTER -->
  <footer class="site-footer">
    <p>Data directly sourced <em class="footer-only">only</em> from the <a href="https://api.congress.gov" target="_blank" rel="noopener noreferrer">Congress.gov API</a></p>
    <p class="footer-note">LegislationPatch is nonpartisan and does not endorse any bill or political position.</p>
    <p class="footer-links">
      <a href="/privacy.html">Privacy Policy</a> ·
      <a href="/terms.html">Terms of Service</a> ·
      <a href="/articles/">Guides</a> ·
      <a href="/about.html">About</a> ·
      <a href="/corrections.html">Corrections</a> ·
      <a href="/changelog/">Changelog</a>
    </p>
  </footer>

  <script src="/util.js?v=4"></script>
  <script src="/api.js?v=4"></script>
  <script src="/app-state.js"></script>
  <script src="/app-settings.js"></script>
  <script src="/app-reps.js"></script>
  <script src="/app-render.js"></script>
  <script src="/app-carousel.js"></script>
  <script src="/app-favorites.js"></script>
  <script src="/app-boot.js"></script>
  <script src="/acronyms.js"></script>
  <script src="/bill.js?v=4"></script>
  <script src="/share-highlight.js"></script>

</body>
</html>
`;
}

// ── Redirect stub for a historical slug ──────────────────────────────────────

function redirectStub(currentSlug) {
  const target = `/bill/${currentSlug}/`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="robots" content="noindex" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redirecting — LegislationPatch</title>
  <link rel="canonical" href="${BASE}${target}" />
  <meta http-equiv="refresh" content="0; url=${target}" />
  <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
  <p>This bill has moved. <a href="${target}">Continue to the current page →</a></p>
</body>
</html>
`;
}

// ── Homepage static bill index (crawlable list, replaced at runtime by JS) ────

function homepageStaticList(records) {
  // Recency order = default homepage sort (stageDate desc), so the static list
  // matches what the client renders first.
  const sorted = records.slice().sort((a, b) => {
    const da = new Date(a.bill.stageDate || a.bill.enactedDate || a.bill.date || 0);
    const db = new Date(b.bill.stageDate || b.bill.enactedDate || b.bill.date || 0);
    return db - da;
  });
  const items = sorted.map(({ bill, slug }) =>
    `      <a class="static-bill-index__item" href="/bill/${slug}/">` +
    `<span class="static-bill-index__title">${escHtml(bill.title || bill.code || bill.id)}</span>` +
    `<span class="static-bill-index__stage">${escHtml(bill.stageLabel || '')}</span></a>`
  ).join('\n');
  return `\n    <h2 class="static-bill-index__heading">All tracked bills</h2>\n    <div class="static-bill-index">\n${items}\n    </div>\n    `;
}

function injectHomepage(records) {
  const idxPath = path.join(ROOT, 'index.html');
  let html;
  try { html = fs.readFileSync(idxPath, 'utf8'); }
  catch (e) { console.warn('  ! index.html not found — skipping homepage injection'); return false; }

  const START = '<!-- static-bill-list:start -->';
  const END   = '<!-- static-bill-list:end -->';
  const si = html.indexOf(START);
  const ei = html.indexOf(END);
  if (si === -1 || ei === -1 || ei < si) {
    console.warn('  ! homepage markers not found (' + START + ' ... ' + END + ') — skipping injection');
    return false;
  }
  const before = html.slice(0, si + START.length);
  const after  = html.slice(ei);
  const next   = before + homepageStaticList(records) + after;
  if (next !== html) fs.writeFileSync(idxPath, next);
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // 1. Compute current slug for every bill (shared billSlug — never drifts).
  const records = bills.map(bill => ({ bill, slug: billSlug(bill) }));

  // Collision guard: ids are unique so slugs should be unique, but fail loud if not.
  const bySlug = new Map();
  for (const r of records) {
    if (bySlug.has(r.slug)) {
      console.error(`  ! SLUG COLLISION: ${r.slug}  (${bySlug.get(r.slug)} vs ${r.bill.id})`);
    }
    bySlug.set(r.slug, r.bill.id);
  }
  const currentSlugs = new Set(records.map(r => r.slug));

  // 2. Load + update the slug map (history of past slugs per bill).
  const mapPath = path.join(DATA, 'slug-map.json');
  let slugMap = {};
  try { slugMap = JSON.parse(fs.readFileSync(mapPath, 'utf8')); } catch (_) {}

  for (const { bill, slug } of records) {
    const prev = slugMap[bill.id];
    if (prev && prev.slug && prev.slug !== slug) {
      const history = Array.isArray(prev.history) ? prev.history.slice() : [];
      if (!history.includes(prev.slug)) history.push(prev.slug);
      slugMap[bill.id] = { slug, history: history.filter(h => h !== slug) };
    } else {
      slugMap[bill.id] = { slug, history: (prev && Array.isArray(prev.history) ? prev.history : []).filter(h => h !== slug) };
    }
  }

  // 3. Clean + rebuild the bill/ directory deterministically (current pages +
  //    redirect stubs re-emitted from the slug map's history each run).
  const billDir = path.join(ROOT, 'bill');
  fs.rmSync(billDir, { recursive: true, force: true });
  fs.mkdirSync(billDir, { recursive: true });

  let pageCount = 0;
  for (const { bill, slug } of records) {
    const dir = path.join(billDir, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), billPage(bill, slug));
    pageCount++;
  }

  // 4. Redirect stubs for historical slugs (skip any that collide with a current slug).
  let stubCount = 0;
  for (const [, entry] of Object.entries(slugMap)) {
    for (const old of (entry.history || [])) {
      if (currentSlugs.has(old)) continue;
      const dir = path.join(billDir, old);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), redirectStub(entry.slug));
      stubCount++;
    }
  }

  // 5. Emit the maps.
  const slugIndex = {};
  for (const { bill, slug } of records) slugIndex[bill.id] = slug;
  fs.writeFileSync(mapPath, JSON.stringify(slugMap, null, 2) + '\n');
  fs.writeFileSync(path.join(DATA, 'slug-index.json'), JSON.stringify(slugIndex, null, 0) + '\n');

  // 5b. Per-bill JSON split — one record per file so a bill page fetches only
  //     its own data (~a few KB) instead of the full ~2 MB cache.json. bill.js
  //     prefers /data/bills/<id>.json and falls back to /data/cache.json on 404
  //     (stale deploy). Rebuilt deterministically each run, like bill/.
  const billsJsonDir = path.join(DATA, 'bills');
  fs.rmSync(billsJsonDir, { recursive: true, force: true });
  fs.mkdirSync(billsJsonDir, { recursive: true });
  let jsonCount = 0;
  for (const { bill } of records) {
    fs.writeFileSync(path.join(billsJsonDir, `${bill.id}.json`), JSON.stringify(bill));
    jsonCount++;
  }

  // 6. Inject the crawlable homepage bill index.
  const injected = injectHomepage(records);

  console.log(`generate_bill_pages: ${pageCount} bill pages, ${stubCount} redirect stub(s)`);
  console.log(`  data/slug-map.json + data/slug-index.json written (${Object.keys(slugIndex).length} ids)`);
  console.log(`  data/bills/<id>.json written (${jsonCount} per-bill records)`);
  console.log(`  homepage static bill index: ${injected ? 'injected' : 'SKIPPED (markers missing)'}`);
}

main();
