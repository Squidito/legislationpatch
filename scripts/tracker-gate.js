#!/usr/bin/env node
// tracker-gate.js -- the scripted both-sides gate for TRACKER articles (Phase 5).
//
// WHY THIS EXISTS: a tracker's "who supports it, who opposes it, and why" section
// is the highest-risk content on the site (the defamation class -- a contested
// position attributed to a named organization or person). docs/BOTH-SIDES.md and
// ARTICLE-WRITER-SPEC Sec 6.4 govern it. Three of the six QC checks are mechanical
// and MUST be scripted rather than left to judgement; the other three are
// adversarial AI passes whose sign-offs this gate confirms were recorded.
//
// NO LLM IN THE CRITICAL PATH. Every check decides in milliseconds from the
// article HTML + the article ledger + the STORED source files. It fails closed:
// a check that throws is a FAILURE, never a skip, and a tracker with no both-sides
// section is a clean pass (a consensus bill legitimately has none).
//
// The checks:
//   1. supporters-first        -- the supporter heading precedes the opponent one
//   2. verb-symmetry           -- no notes/points out/claims/alleges/acknowledges/admits
//   3. quotes-stored           -- every quoted span resolves verbatim to a STORED source
//   4. named-holders-stored    -- every named org/person attributed a position resolves
//                                 to a stored source (unsourced position => BLOCK => omit)
//   5. staleness               -- no referenced cached bill has moved past the article date
//   6. dual-lens-recorded      -- supporter-lens + opponent-lens sign-offs, strip test,
//                                 vehicle-bill note, and a cross-model verifyModel on the ledger
//   7. eligibility-recorded    -- a non-false-balance eligibility rationale on the ledger
//
// Usage:
//   node scripts/tracker-gate.js --slug save-america-act [--file <path>] [--json]
//                                [--as-of YYYY-MM-DD]
//
// --as-of overrides the date the STALENESS check measures bill movement against.
// publish-article passes the date it is ABOUT TO STAMP, because a --refresh whose
// whole purpose is catching a bill advance would otherwise be judged against the
// stale date it is replacing (fixed 2026-08-27). It can never be a future date.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const ARTICLES = path.join(ROOT, 'articles');
const DRAFTS   = path.join(ROOT, 'drafts');
const REFTEXT  = path.join(ROOT, 'data', 'ref-text');
const LEDGERS  = path.join(ROOT, 'data', 'qa-ledger');
const CACHE    = path.join(ROOT, 'data', 'cache.json');

const args = process.argv.slice(2);
const opt  = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const flag = n => args.includes(`--${n}`);

const norm = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

// ── Banned asymmetric verbs (docs/BOTH-SIDES.md verb-symmetry rule) ────────────
// Written out (not curly) so the file itself carries no smart quotes.
const ASYMMETRIC_VERBS = /\b(notes?|points?\s+out|acknowledges?|admits?|concedes?|claims?|alleges?)\b/i;

// ── Quote extraction (straight OR curly double quotes) ────────────────────────
// Curly quotes written as \u escapes so this file carries none of the characters
// it hunts (validate-batch ERRORs on curly quotes in JS source) — same technique
// as dispatch-gate.js.
//
// PAIRING RULE (fixed 2026-08-27). Quote marks pair sequentially inside a block,
// so the scan must CONSUME every quoted span and let the length floor decide only
// which spans get CHECKED. The old pattern baked the floor into the span itself
// ({12,}), so a real short quoted term (MIRV, shell game) was never consumed: the
// regex then paired that short span's CLOSING mark with the NEXT quote's OPENING
// mark and flagged the innocent prose between them as an unsourced quote. The
// NDAA FY2027 refresh worked around it by restyling short terms with single
// quotes; this is the real fix.
const QUOTE_RE      = /["\u201C]([^"\u201C\u201D]*)["\u201D]/g;  // consumes ALL spans
const QUOTE_MARK_RE = /["\u201C\u201D]/g;
const QUOTE_MIN     = 12;   // CHECK floor -- never a consume floor (see above)

// ── Named-holder extraction inside attribution constructions ──────────────────
const PERSON_RE = /\b(?:Sen\.|Senator|Rep\.|Representative|Congressman|Congresswoman|Gov\.|Governor|President|Secretary)\s+([A-Z][a-z]+)/g;
const ORG_RE    = /\bthe\s+((?:[A-Z][A-Za-z.&]+\s+){0,4}(?:Center|Union|Foundation|Institute|Project|Committee|Association|Coalition|League|Council|Fund|Society|Alliance|Network))\b/g;
const ACRONYM_ORG_RE = /\bthe\s+(EFF|ACLU|CDT|NAACP|APA|AAP|NRA|AARP|NCPA|APC|ASBM|GLAAD|HRC|PFLAG)\b/g;

// ── Small helpers ──────────────────────────────────────────────────────────────
// Entity decoding, &amp; LAST so an escaped entity (&amp;quot;) is not decoded
// twice into a real quote mark.
function decodeEntities(s) {
  return s
    .replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
}

function textOf(html) {
  return decodeEntities(stripTags(html)).replace(/\s+/g, ' ').trim();
}

/** The section split into BLOCKS (paragraphs, headings, list items, cells).
 *  Quote pairing is only sound inside a block: an unclosed quote in one
 *  paragraph must never pair with the opening mark of the next. Tags are
 *  stripped first so HTML attribute quotes (href="...") can never be read as
 *  prose quotes, and entities are decoded so &quot;-written quotes are seen. */
const BLOCK_END_RE = /<\/(?:p|h[1-6]|li|blockquote|div|section|article|td|th|tr|dd|dt|figcaption)\s*>|<(?:br|hr)\s*\/?>/gi;
function blocksOf(html) {
  // script/style go FIRST, before the block sentinel: a </div> inside a script
  // string would otherwise punch a fake block boundary into the text.
  return decodeEntities(
    stripTags(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(new RegExp(BLOCK_END_RE.source, 'gi'), '\u0000')
    )
  )
    .split('\u0000')
    .map(t => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** The both-sides section of the article: from the "Who Supports/Supported..." h2
 *  to the end of the article body. Returns { html, present, supIdx, oppIdx }. */
function bothSidesSection(html) {
  const h2 = html.search(/<h2[^>]*>\s*Who\s+Support(?:s|ed)?\b[^<]*<\/h2>/i);
  if (h2 < 0) return { present: false };
  const endBox = html.indexOf('article-source-box', h2);
  const endArt = html.indexOf('</article>', h2);
  let end = endBox > 0 ? endBox : (endArt > 0 ? endArt : html.length);
  // Cut at the START of the tag carrying the marker, never mid-attribute: slicing
  // inside a `<div class="` left a dangling quote mark in the section and made the
  // block quote-mark parity odd (see the balance check in quotes-stored).
  if (endBox > 0) { const lt = html.lastIndexOf('<', endBox); if (lt > h2) end = lt; }
  const section = html.slice(h2, end);
  // Heading order: which side is asked first.
  const supIdx = section.search(/<h3[^>]*>[^<]*\b(support|back|voted for|for the bill)/i);
  const oppIdx = section.search(/<h3[^>]*>[^<]*\b(oppos|object|voted no|against|vote no)/i);
  return { present: true, html: section, text: textOf(section), supIdx, oppIdx };
}

function storedSources(ledger) {
  const out = [];
  for (const s of (ledger.sources || [])) {
    if (!s || !s.textFile) continue;
    const abs = path.join(ROOT, s.textFile);
    let text = '';
    try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { text = ''; }
    out.push({ ...s, text, textNorm: norm(text) });
  }
  return out;
}

/** Does a span appear (verbatim, whitespace/case-tolerant) in ANY stored source? */
function spanInSources(span, sources) {
  const n = norm(span);
  return sources.some(s => s.text.indexOf(span) >= 0 || s.textNorm.includes(n));
}

/** Does a holder token appear in any stored source's TEXT, or a source's org/label/citation? */
function holderSourced(token, sources) {
  const t = norm(token);
  if (!t) return true;
  return sources.some(s =>
    s.textNorm.includes(t) ||
    norm(s.org || '').includes(t) ||
    norm(s.label || '').includes(t) ||
    norm(s.citation || '').includes(t));
}

// ── Reference extraction for the staleness check (mirrors article-staleness) ──
const CODE_TYPE = { HR: 'HR', H: 'HR', S: 'S', HRES: 'HRES', SRES: 'SRES', HJRES: 'HJRES', SJRES: 'SJRES', HCONRES: 'HCONRES', SCONRES: 'SCONRES' };
function refsIn(html) {
  const ids = new Set();
  const codeRe = /\b(H\.?\s?R\.|H\.?\s?J\.?\s?Res\.|H\.?\s?Con\.?\s?Res\.|H\.?\s?Res\.|S\.?\s?J\.?\s?Res\.|S\.?\s?Con\.?\s?Res\.|S\.?\s?Res\.|S\.)\s?(\d{1,5})\b/g;
  let m;
  while ((m = codeRe.exec(html)) !== null) {
    const t = CODE_TYPE[m[1].toUpperCase().replace(/[^A-Z]/g, '')];
    if (t) ids.add(`119-${t}-${m[2]}`);
  }
  return [...ids];
}
function articleDate(html) {
  let m = html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  if (m) return m[1];
  m = html.match(/"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/);
  return m ? m[1] : null;
}

// ── The checks ─────────────────────────────────────────────────────────────────
function checkSupportersFirst(ctx) {
  const s = ctx.section;
  if (s.supIdx < 0 || s.oppIdx < 0) {
    return { ok: true, detail: 'one-sided section (only one of support/oppose headings present) — order N/A' };
  }
  return s.supIdx < s.oppIdx
    ? { ok: true, detail: 'supporter heading precedes opponent heading' }
    : { ok: false, detail: 'OPPONENT heading precedes supporter heading — supporters must come first (BOTH-SIDES.md)' };
}

function checkVerbSymmetry(ctx) {
  const allowed = new Set((ctx.ledger.bothSidesReview && ctx.ledger.bothSidesReview.verbAdjudications || []).map(norm));
  const hits = [];
  const re = new RegExp(ASYMMETRIC_VERBS.source, 'gi');
  let m;
  while ((m = re.exec(ctx.section.text)) !== null) {
    const around = ctx.section.text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ').trim();
    if (allowed.has(norm(around))) continue;
    hits.push(`"${m[0]}" in: ...${around}...`);
  }
  return hits.length
    ? { ok: false, detail: `asymmetric/doubting verb(s) in the both-sides section: ${hits.slice(0, 4).join(' | ')}` }
    : { ok: true, detail: 'only neutral symmetric verbs (says/argues/contends) used' };
}

function checkQuotesStored(ctx) {
  const bad = [];
  const shortSpans = [];
  const unbalanced = [];
  for (const block of blocksOf(ctx.section.html)) {
    // Parity guard: an odd number of quote marks in a block means the gate cannot
    // know where a quoted span ends, so it cannot verify it. Fail closed rather
    // than guess a pairing.
    const marks = (block.match(new RegExp(QUOTE_MARK_RE.source, 'g')) || []).length;
    if (marks % 2 === 1) unbalanced.push(block.slice(0, 70) + (block.length > 70 ? '\u2026' : ''));
    const re = new RegExp(QUOTE_RE.source, 'g');
    let m;
    while ((m = re.exec(block)) !== null) {
      // Strip sentence punctuation the ARTICLE adds inside the closing quote
      // (American style: "...citizens.") that the verbatim SOURCE does not carry
      // where the quote ends mid-sentence ("...citizens, and I am proud..."). Matching
      // the trimmed phrase against source is still a true verbatim check.
      const q = m[1].replace(/^[\s.,;:]+/, '').replace(/[\s.,;:]+$/, '');
      if (!q) continue;
      // Below the floor: consumed (so the pairing stays honest) but not checked --
      // a span this short matches almost any source, so checking it proves nothing.
      if (q.length < QUOTE_MIN) { shortSpans.push(q); continue; }
      if (!spanInSources(q, ctx.sources)) bad.push('"' + q.slice(0, 60) + (q.length > 60 ? '\u2026' : '') + '"');
    }
  }
  if (unbalanced.length) {
    return { ok: false, detail: 'unbalanced quote mark(s) -- a block carries an odd number of double-quote marks, so no pairing can be trusted: ' + unbalanced.slice(0, 3).map(b => '...' + b + '...').join(' | ') };
  }
  if (bad.length) {
    return { ok: false, detail: 'quoted position(s) NOT found verbatim in any stored source (misquote or unsourced -> must be omitted): ' + bad.slice(0, 4).join(' | ') };
  }
  const skipped = shortSpans.length
    ? ' (' + shortSpans.length + ' span(s) under ' + QUOTE_MIN + ' chars consumed for pairing, not source-checked: ' + shortSpans.slice(0, 6).map(s => '"' + s + '"').join(', ') + ')'
    : '';
  return { ok: true, detail: 'every quoted position resolves verbatim to a stored source' + skipped };
}

function checkNamedHoldersStored(ctx) {
  const holders = new Set();
  for (const [re] of [[PERSON_RE], [ORG_RE], [ACRONYM_ORG_RE]]) {
    const r = new RegExp(re.source, 'g');
    let m;
    while ((m = r.exec(ctx.section.text)) !== null) holders.add(m[1].trim());
  }
  const unsourced = [];
  for (const h of holders) {
    // For an org phrase, the distinctive token is its first capitalised word.
    const token = h.split(/\s+/)[0];
    if (!holderSourced(token, ctx.sources) && !holderSourced(h, ctx.sources)) unsourced.push(h);
  }
  return unsourced.length
    ? { ok: false, detail: `named holder(s) with NO stored source (position must be omitted, not softened): ${unsourced.join(', ')}` }
    : { ok: true, detail: `every named holder resolves to a stored source (${holders.size} holder(s) checked)` };
}

function checkStaleness(ctx) {
  let cache;
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { return { ok: false, detail: 'cannot read cache.json' }; }
  const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});
  const byId = new Map();
  for (const b of bills) byId.set(b.id, { stageLabel: b.stageLabel || b.stage || '', stageDate: b.stageDate || b.date || '' });

  // The comparison date is the date the article WILL carry, not the one it
  // currently carries. On a --refresh the whole point is that a bill moved, so
  // measuring against the pre-stamp dateModified failed every refresh that was
  // doing its job (fixed 2026-08-27). publish-article passes --as-of with the
  // date it is about to stamp; a standalone run still defaults to the file date.
  const fileDate = articleDate(ctx.html);
  const adate = ctx.asOf || fileDate;
  if (!adate) return { ok: false, detail: 'no parseable article date to compare bill movement against' };

  const stale = [];
  for (const id of refsIn(ctx.html)) {
    const b = byId.get(id);
    if (b && b.stageDate && b.stageDate > adate) stale.push(id + ' now "' + b.stageLabel + '" @ ' + b.stageDate + ' (newer than article ' + adate + ')');
  }
  const asOfNote = ctx.asOf
    ? ' [--as-of ' + ctx.asOf + (fileDate && fileDate !== ctx.asOf ? ', file carries ' + fileDate + ' pre-stamp' : '') + ']'
    : '';
  return stale.length
    ? { ok: false, detail: 'referenced bill(s) moved past the article date: ' + stale.join('; ') + asOfNote }
    : { ok: true, detail: 'no referenced cached bill has moved past the article date (' + adate + ')' + asOfNote };
}

function checkDualLensRecorded(ctx) {
  const r = ctx.ledger.bothSidesReview;
  if (!r) return { ok: false, detail: 'ledger has no bothSidesReview block — dual-lens QC not recorded' };
  const missing = [];
  const signed = v => v && (v.signOff === true || /^(yes|true|pass)/i.test(String(v.signOff || v)));
  if (!signed(r.supporterLens)) missing.push('supporter-lens sign-off');
  if (!signed(r.opponentLens)) missing.push('opponent-lens sign-off');
  if (!r.stripTest) missing.push('strip-test record');
  if (!r.vehicleBill) missing.push('vehicle-bill verification');
  if (!ctx.ledger.verifyModel) missing.push('cross-model verifyModel');
  return missing.length
    ? { ok: false, detail: `dual-lens QC incomplete on the ledger: missing ${missing.join(', ')}` }
    : { ok: true, detail: 'supporter + opponent lens sign-offs, strip test, vehicle-bill check, and cross-model verify all recorded' };
}

function checkEligibilityRecorded(ctx) {
  const r = ctx.ledger.bothSidesReview;
  return (r && r.eligibility && String(r.eligibility).trim().length > 10)
    ? { ok: true, detail: 'eligibility rationale recorded (guards against false balance)' }
    : { ok: false, detail: 'no eligibility rationale on the ledger — a both-sides section needs an on-record trigger, not false balance' };
}

const CHECKS = [
  ['supporters-first',      checkSupportersFirst],
  ['verb-symmetry',         checkVerbSymmetry],
  ['quotes-stored',         checkQuotesStored],
  ['named-holders-stored',  checkNamedHoldersStored],
  ['staleness',             checkStaleness],
  ['dual-lens-recorded',    checkDualLensRecorded],
  ['eligibility-recorded',  checkEligibilityRecorded],
];

function runGate({ html, ledger, asOf }) {
  const section = bothSidesSection(html);
  if (!section.present) {
    return { pass: true, na: true, results: [{ name: 'both-sides-section', ok: true, detail: 'no both-sides section (consensus bill / one-sided record) — gate N/A' }] };
  }
  const sources = storedSources(ledger);
  const ctx = { html, ledger, section, sources, asOf: asOf || null };
  const results = CHECKS.map(([name, fn]) => {
    try { const r = fn(ctx); return { name, ok: !!r.ok, detail: r.detail }; }
    catch (e) { return { name, ok: false, detail: `check threw (treated as failure): ${String(e.message).slice(0, 90)}` }; }
  });
  return { pass: results.every(r => r.ok), results };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main() {
  const slug = opt('slug');
  if (!slug) { console.error('usage: tracker-gate.js --slug <article-slug> [--file <path>] [--json]'); process.exit(2); }

  const fileArg = opt('file');
  const candidate = fileArg
    ? (path.isAbsolute(fileArg) ? fileArg : path.join(ROOT, fileArg))
    : (fs.existsSync(path.join(DRAFTS, `${slug}.html`)) ? path.join(DRAFTS, `${slug}.html`) : path.join(ARTICLES, `${slug}.html`));
  if (!fs.existsSync(candidate)) { console.error(`tracker-gate: no article at ${candidate}`); process.exit(2); }
  const html = fs.readFileSync(candidate, 'utf8');

  const ledgerPath = path.join(LEDGERS, `article-${slug}.json`);
  let ledger;
  try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); }
  catch (e) { console.error(`tracker-gate: no article ledger at ${path.relative(ROOT, ledgerPath)} — a tracker cannot publish unaudited`); process.exit(1); }

  // --as-of: the date staleness is measured against. Bounded to today or earlier,
  // so it can only ever assert currency as of a date that has actually happened --
  // it can never be used to silence a bill advance by claiming a future date.
  const asOf = opt('as-of');
  if (asOf !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) { console.error(`tracker-gate: --as-of must be YYYY-MM-DD (got ${asOf})`); process.exit(2); }
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (asOf > today) { console.error(`tracker-gate: --as-of ${asOf} is in the future (today is ${today}) -- refusing`); process.exit(2); }
  }

  const { pass, na, results } = runGate({ html, ledger, asOf });

  if (flag('json')) { console.log(JSON.stringify({ slug, pass, na: !!na, results }, null, 2)); process.exit(pass ? 0 : 1); }

  console.log(`\ntracker gate — ${slug} (${path.relative(ROOT, candidate)})\n`);
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(22)} ${r.detail}`);
  console.log('\n' + '─'.repeat(64));
  console.log(pass ? (na ? '  GATE N/A — no both-sides section (clean pass)' : '  TRACKER GATE PASSED') : '  TRACKER GATE FAILED — BLOCKED (fail-closed; fix or omit the unsourced position)');
  process.exit(pass ? 0 : 1);
}

if (require.main === module) main();

module.exports = { runGate, bothSidesSection, blocksOf, CHECKS };
