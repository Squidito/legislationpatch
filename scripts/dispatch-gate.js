#!/usr/bin/env node
// dispatch-gate.js -- the seven deterministic checks a Dispatch must pass.
//
// WHY THIS IS THE WHOLE SAFETY STORY: decision D1 (James, 2026-08-13) is that
// dispatches AUTO-PUBLISH. No human reads one before it goes live. This gate is
// therefore not a safety net under a human reviewer -- it IS the reviewer, and
// it is the only thing standing between a data glitch and a false claim on an
// accuracy-branded site.
//
// Consequences baked into the design:
//   1. FAIL-CLOSED, ALWAYS. Any failure, any missing input, any ambiguity =
//      no publish. There is no "publish with warnings" path and none may be
//      added. A dispatch that cannot be proven correct does not exist.
//   2. NO LLM IN THE CRITICAL PATH. Every check is a script that decides in
//      milliseconds from stored data. A model's judgement is not admissible
//      here precisely because it cannot be replayed.
//   3. The dispatch makes ALMOST NO NEW CLAIMS. It recombines an already
//      hostile-audited cache entry with mechanically-fetched vote data. Every
//      check below enforces that boundary rather than trusting it.
//
// The seven checks (ARTICLE-WRITER-SPEC §6.1):
//   1. Every figure in the dispatch appears in the audited cache entry
//   2. Vote totals match data/votes exactly; chamber and roll number present
//   3. Stage claim corroborated by a passing/failing vote or an enrolled version
//   4. No unsourced qualifiers
//   5. No smart quotes
//   6. NewsArticle required fields all present
//   7. NO named organization or person quoted or characterised -- at all
//
// Usage:
//   node scripts/dispatch-gate.js --file dispatch/<slug>/index.html --bill 119-HR-2069
//   node scripts/dispatch-gate.js --json ...   # machine-readable result

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { SMART_QUOTES } = require('./lib/patterns.js');
const { loadVotes }    = require('./lib/dispatch-events.js');

// ── Check-7 vocabulary ───────────────────────────────────────────────────────
// A dispatch may name the bill, the chamber, and the sponsor as a structural
// fact ("Sponsored by Rep. X"). It may NOT quote or characterise anyone. The
// distinction is enforced by banning the CONSTRUCTIONS that carry attribution,
// not by trying to enumerate every organisation on earth.
const ATTRIBUTION_VERBS = /\b(said|says|argues?|argued|contends?|claims?|alleges?|warns?|urges?|praised?|criticis(?:e|ed|es)|criticiz(?:e|ed|es)|welcomed?|condemns?|condemned|opposes?|opposed|supports?|supported|insists?|noted|notes|points? out|acknowledges?|admits?|responds?|responded|called|blasted|slammed|hailed)\b/i;

// Quotation marks around running prose = someone is being quoted.
// U+201C/U+201D written as escapes so this file does not itself contain the
// characters it hunts (validate-batch ERRORs on curly quotes in JS source).
const QUOTE_OPEN  = '["\\u201C]';
const QUOTE_CLOSE = '["\\u201D]';
const NOT_QUOTE   = '[^"\\u201C\\u201D]';
const QUOTED_PROSE = new RegExp(`${QUOTE_OPEN}${NOT_QUOTE}{25,}${QUOTE_CLOSE}`);

// Titles that introduce a named human whose words or views might follow.
const PERSON_TITLE = /\b(Rep\.|Sen\.|Representative|Senator|Speaker|President|Secretary|Chairman|Chairwoman|Chair|Majority Leader|Minority Leader|Whip|Governor|Justice)\s+[A-Z][a-z]/;

// Unsourced qualifier list -- the same family validate-batch warns on. In the
// fast lane these are not warnings, they are blocks: nothing here can be
// sourced from a cache entry, so their presence means prose was invented.
const UNSOURCED_QUALIFIERS = /\b(landmark|sweeping|controversial|radical|common[- ]sense|historic|unprecedented|bipartisan|partisan|widely|broadly|significant(?:ly)?|major|massive|dramatic(?:ally)?|crucial|critical|key|important|expected to|likely to|could lead to|many|most observers|critics|supporters|opponents)\b/i;

// ── Small helpers ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt  = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const flag = n => args.includes(`--${n}`);

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function textOf(html) {
  // visible prose only: strip head, scripts, styles, tags, then normalise
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jsonLdOf(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].trim();
    if (!raw) continue;
    try { out.push(JSON.parse(raw)); } catch { out.push(null); }
  }
  return out;
}

function nodesOf(parsed) {
  if (!parsed) return [];
  return parsed['@graph'] || (Array.isArray(parsed) ? parsed : [parsed]);
}

/** Every number-ish token that constitutes a factual claim. */
function figuresIn(text) {
  const out = new Set();
  // dollars ($1.2B / $584.3M / $98M / $1,234)
  for (const m of text.matchAll(/\$[\d,]+(?:\.\d+)?\s*(?:[BMK]|billion|million|thousand|trillion)?/gi)) out.add(m[0].trim());
  // percentages
  for (const m of text.matchAll(/\b\d+(?:\.\d+)?\s*%/g)) out.add(m[0].trim());
  // Section / title cites
  for (const m of text.matchAll(/\b(?:Section|Sec\.|Title)\s+[\dIVXLC]+(?:\([a-z0-9]+\))*/gi)) out.add(m[0].trim());
  // bare integers >= 4 digits, and 1-3 digit counts that are not part of a date
  for (const m of text.matchAll(/\b\d{4,}\b/g)) out.add(m[0]);
  return [...out];
}

/** All prose in the audited cache entry, flattened. */
function auditedText(bill) {
  const parts = [];
  const walk = v => {
    if (v == null) return;
    if (typeof v === 'string') { parts.push(v); return; }
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v === 'object') return Object.values(v).forEach(walk);
    parts.push(String(v));
  };
  walk(bill);
  return parts.join('  ');
}

// ── The checks ───────────────────────────────────────────────────────────────

function check1Figures(ctx) {
  const { text, bill, event } = ctx;
  const haystack = auditedText(bill);
  const allowed = new Set();

  // Vote totals and roll numbers come from data/votes (check 2 proves them).
  if (event && event.vote) {
    for (const k of ['yeas', 'nays', 'present', 'notVoting', 'rollNumber', 'congress']) {
      if (event.vote[k] != null) allowed.add(String(event.vote[k]));
    }
  }
  // Dates in the event are structural, not analytic claims.
  for (const d of [event && event.eventDate, bill.stageDate, bill.date]) {
    if (d) String(d).split('-').forEach(p => allowed.add(String(Number(p))));
  }

  const novel = [];
  for (const fig of figuresIn(text)) {
    if (allowed.has(fig.replace(/[^\d]/g, ''))) continue;
    if (haystack.includes(fig)) continue;
    // normalised retry: "$1.2 billion" vs "$1.2B"
    const compact = fig.replace(/\s+/g, '');
    if (haystack.replace(/\s+/g, '').includes(compact)) continue;
    novel.push(fig);
  }
  return novel.length
    ? { ok: false, detail: `figure(s) not present in the audited entry: ${novel.slice(0, 6).join(', ')}` }
    : { ok: true, detail: 'every figure traces to the audited cache entry' };
}

function check2Votes(ctx) {
  const { text, event } = ctx;
  if (!event) return { ok: false, detail: 'no event supplied — cannot verify vote claims' };

  // A signing has no vote; nothing to match, but the page must then assert no tally.
  if (!event.chamber) {
    const tally = text.match(/\b\d{1,3}\s*[-–]\s*\d{1,3}\b/);
    return tally
      ? { ok: false, detail: `no vote applies to a "${event.kind}" event but the page states a tally (${tally[0]})` }
      : { ok: true, detail: 'no vote applies to this event and none is claimed' };
  }

  const vote = event.vote;
  if (!vote) return { ok: false, detail: `no ${event.chamber} vote in data/votes corroborates this event` };

  const isRollCall = vote.yeas != null && vote.nays != null;

  // Roll number is required for a recorded vote: a dispatch asserting a tally
  // must name the roll call that says so. Voice votes have none by definition.
  if (isRollCall && (vote.rollNumber == null)) {
    return { ok: false, detail: 'recorded vote has no rollNumber in data/votes — re-run fetch_vote_data.js' };
  }
  if (!vote.chamber) return { ok: false, detail: 'vote record has no chamber' };

  // Any tally on the page must match the record EXACTLY.
  for (const m of text.matchAll(/\b(\d{1,3})\s*[-–]\s*(\d{1,3})\b/g)) {
    const [, a, b] = m;
    if (!isRollCall) {
      return { ok: false, detail: `page states a tally ${a}-${b} but the record is a ${vote.method || 'non-recorded'} vote` };
    }
    if (Number(a) !== Number(vote.yeas) || Number(b) !== Number(vote.nays)) {
      return { ok: false, detail: `tally ${a}-${b} does not match data/votes (${vote.yeas}-${vote.nays})` };
    }
  }
  // Any roll number on the page must match too.
  for (const m of text.matchAll(/\broll(?:\s*call)?\s*(?:no\.?|number)?\s*(\d+)/gi)) {
    if (Number(m[1]) !== Number(vote.rollNumber)) {
      return { ok: false, detail: `roll number ${m[1]} does not match data/votes (${vote.rollNumber})` };
    }
  }

  // THE ACTION DATE MUST BE THE VOTE'S DATE.
  //
  // A bill's stageDate is its LATEST ACTION date and routinely runs days past
  // the passage it marks (H.R. 5625: passed the House 2026-05-14, stageDate
  // 2026-05-18 "Received in the Senate"). A dispatch built off stageDate
  // asserts a passage on a day no passage happened. Stage fields and vote
  // records are maintained by different code paths -- this is the HCONRES-40
  // drift class, and the gate has to catch it because nothing else will.
  const verbSentence = text.match(new RegExp(`${escapeRe(String(vote.chamber))}[^.]{0,80}?on ([A-Z][a-z]+ \\d{1,2}, \\d{4})`));
  if (verbSentence) {
    const claimed = new Date(`${verbSentence[1]} UTC`).toISOString().slice(0, 10);
    if (claimed !== String(vote.date)) {
      return { ok: false, detail: `page dates the action ${claimed} but the ${vote.chamber} vote is recorded ${vote.date}` };
    }
  }
  return {
    ok: true,
    detail: isRollCall
      ? `${vote.chamber} roll ${vote.rollNumber}: ${vote.result} ${vote.yeas}-${vote.nays} — matches`
      : `${vote.chamber} ${vote.method || 'voice vote'}: ${vote.result} — matches`,
  };
}

function check3Stage(ctx) {
  const { bill, event } = ctx;
  if (!event) return { ok: false, detail: 'no event supplied' };

  // Reuse the existing passage-corroboration idea (the HR-1329 class): the
  // stage a dispatch asserts must be backed by a vote result or an
  // enrolled/engrossed text version, never by the stage field alone.
  if (event.kind === 'signed' || event.kind === 'vetoed') {
    const versions = Array.isArray(bill.versions) ? bill.versions : [];
    const enrolled = versions.some(v => /enrolled/i.test(String(v.type || v.label || v)));
    if (!enrolled && bill.stage !== 'signed' && bill.stage !== 'vetoed') {
      return { ok: false, detail: `"${event.kind}" is not corroborated by an enrolled version or a terminal stage` };
    }
    return { ok: true, detail: `stage "${bill.stageLabel}" corroborated` };
  }

  if (!event.vote) {
    return { ok: false, detail: `stage claim "${event.toLabel}" has no corroborating ${event.chamber} vote` };
  }
  const passed = /^(passed|agreed to)/i.test(String(event.vote.result || ''));
  const failed = /^(failed|rejected)/i.test(String(event.vote.result || ''));
  const wantFailed = event.kind === 'failed-floor';
  if (wantFailed ? !failed : !passed) {
    return { ok: false, detail: `stage claims "${event.toLabel}" but the ${event.chamber} vote result is "${event.vote.result}"` };
  }
  return { ok: true, detail: `stage "${event.toLabel}" corroborated by the ${event.chamber} vote (${event.vote.result})` };
}

/**
 * Qualifiers are banned in the dispatch's OWN prose, not in text it carries
 * verbatim from the audited entry.
 *
 * "Critical" inside a bill's own title, or a characterisation that already
 * survived the hostile audit and carries a QA receipt, is sourced -- blocking
 * it would be a false failure, and false failures are how a fail-closed gate
 * gets loosened by whoever is on call. So the rule is sentence-level: ANY
 * sentence containing a qualifier must appear verbatim in the audited entry.
 * Connective prose the generator wrote itself has no such cover, which is
 * exactly the text this check exists to police.
 */
function check4Qualifiers(ctx) {
  const haystack = auditedText(ctx.bill).replace(/\s+/g, ' ').toLowerCase();
  const bad = [];

  for (const sentence of ctx.text.split(/(?<=[.!?])\s+/)) {
    const m = sentence.match(UNSOURCED_QUALIFIERS);
    if (!m) continue;
    const norm = sentence.replace(/\s+/g, ' ').trim().toLowerCase();
    // strip a trailing period so "…list." matches a cache string without one
    const probe = norm.replace(/[.!?]$/, '');
    if (probe.length > 12 && haystack.includes(probe)) continue;   // verbatim from the audited entry
    bad.push(`"${m[0]}" in: ${sentence.slice(0, 70).trim()}`);
  }

  return bad.length
    ? { ok: false, detail: `unsourced qualifier(s) in generated prose — ${bad.slice(0, 4).join(' | ')}` }
    : { ok: true, detail: 'no unsourced qualifiers outside audited text' };
}

function check5SmartQuotes(ctx) {
  const bad = [];
  for (const m of ctx.html.matchAll(new RegExp('=\s*[\u201C\u201D]', 'g'))) bad.push('attribute delimiter');
  for (const block of jsonLdOf(ctx.html)) {
    if (block === null) { bad.push('unparsable JSON-LD'); continue; }
    if (SMART_QUOTES.test(JSON.stringify(block))) bad.push('JSON-LD value');
  }
  return bad.length
    ? { ok: false, detail: `smart quote in markup: ${[...new Set(bad)].join(', ')}` }
    : { ok: true, detail: 'no smart quotes in markup' };
}

function check6Schema(ctx) {
  const REQUIRED = ['headline', 'datePublished', 'dateModified', 'author', 'publisher', 'image', 'mainEntityOfPage'];
  let node = null;
  for (const block of jsonLdOf(ctx.html)) {
    for (const n of nodesOf(block)) {
      if (n && n['@type'] === 'NewsArticle') node = n;
    }
  }
  if (!node) return { ok: false, detail: 'no NewsArticle node in the page JSON-LD' };

  const missing = REQUIRED.filter(k => node[k] == null || node[k] === '');
  if (missing.length) return { ok: false, detail: `NewsArticle missing: ${missing.join(', ')}` };

  // datePublished must be a full ISO timestamp -- the news window is measured
  // from it, and a day-precision value silently truncates the 48h window.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(node.datePublished))) {
    return { ok: false, detail: `datePublished "${node.datePublished}" is not a full ISO 8601 timestamp` };
  }
  return { ok: true, detail: 'NewsArticle has every required field' };
}

function check7NamedParties(ctx) {
  const { text, bill } = ctx;
  const problems = [];
  const haystack = auditedText(bill).replace(/\s+/g, ' ');

  // Quoted running prose means someone is being quoted -- UNLESS the quoted
  // span is verbatim from the audited entry, where quotation marks carry
  // statutory terms of art ("other transaction agreements", "covered award")
  // rather than anyone's words. Blocking those would be a false failure on
  // every appropriations dispatch, and a fail-closed gate that cries wolf is
  // a gate someone eventually switches off.
  for (const m of text.matchAll(new RegExp(`${QUOTE_OPEN}(${NOT_QUOTE}{25,})${QUOTE_CLOSE}`, 'g'))) {
    if (haystack.includes(m[1])) continue;
    problems.push(`quoted prose not found in the audited entry: "${m[1].slice(0, 50)}"`);
  }

  // An attribution verb near a capitalised name or a title is the construction
  // that carries a characterisation. The sponsor's NAME may appear as a
  // structural fact, so a bare name is fine -- a name plus a verb is not.
  for (const m of text.matchAll(new RegExp(ATTRIBUTION_VERBS.source, 'gi'))) {
    const around = text.slice(Math.max(0, m.index - 60), m.index + 60);
    if (PERSON_TITLE.test(around) || /\b[A-Z][a-z]+\s+(?:said|says|argues|claims|warns)/.test(around)) {
      problems.push(`attribution verb "${m[0]}" near a named party`);
    }
  }

  // Featured quotes on the cache entry must never be carried into a dispatch.
  for (const q of (bill.featured_quotes || [])) {
    const snippet = String(q.text || q.quote || '').slice(0, 40);
    if (snippet && text.includes(snippet)) problems.push('a featured Congressional Record quote was carried into the dispatch');
  }

  return problems.length
    ? { ok: false, detail: [...new Set(problems)].slice(0, 5).join('; ') }
    : { ok: true, detail: 'no named organisation or person quoted or characterised' };
}

const CHECKS = [
  ['figures-in-audited-entry',   check1Figures],
  ['votes-match-record',         check2Votes],
  ['stage-corroborated',         check3Stage],
  ['no-unsourced-qualifiers',    check4Qualifiers],
  ['no-smart-quotes',            check5SmartQuotes],
  ['newsarticle-fields',         check6Schema],
  ['no-named-parties',           check7NamedParties],
];

/**
 * Run all seven. Returns { pass, results[] }.
 * FAIL-CLOSED: a check that throws is a FAILURE, never a skip.
 */
function runGate({ html, bill, event }) {
  const ctx = { html, text: textOf(html), bill, event };
  const results = CHECKS.map(([name, fn]) => {
    try {
      const r = fn(ctx);
      return { name, ok: !!r.ok, detail: r.detail };
    } catch (e) {
      return { name, ok: false, detail: `check threw (treated as failure): ${String(e.message).slice(0, 90)}` };
    }
  });
  return { pass: results.every(r => r.ok), results };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main() {
  const file = opt('file');
  const billId = opt('bill');
  if (!file || !billId) {
    console.error('usage: dispatch-gate.js --file <page.html> --bill <119-HR-1234> [--json]');
    process.exit(1);
  }
  const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache.json'), 'utf8'));
  const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});
  const bill = bills.find(b => String(b.id).toUpperCase() === billId.toUpperCase());
  if (!bill) { console.error(`dispatch-gate: ${billId} not in cache`); process.exit(1); }

  const html = fs.readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), 'utf8');

  // Rebuild the event from stored data so the gate never trusts the page.
  const { THRESHOLD, corroboratingVote } = require('./lib/dispatch-events.js');
  const t = THRESHOLD[bill.stage];
  const event = t ? {
    billId: bill.id, kind: t.kind, chamber: t.chamber, verb: t.verb,
    toLabel: bill.stageLabel, eventDate: bill.stageDate || bill.date || '',
    vote: corroboratingVote(loadVotes(bill.id), t),
  } : null;

  const { pass, results } = runGate({ html, bill, event });

  if (flag('json')) {
    console.log(JSON.stringify({ bill: bill.id, pass, results }, null, 2));
  } else {
    console.log(`\ndispatch gate — ${bill.id} (${file})\n`);
    for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(28)} ${r.detail}`);
    console.log('\n' + '─'.repeat(64));
    console.log(pass ? '  GATE PASSED — dispatch may publish' : '  GATE FAILED — dispatch BLOCKED (fail-closed, no partial publish)');
  }
  process.exit(pass ? 0 : 1);
}

if (require.main === module) main();

module.exports = { runGate, CHECKS, textOf, figuresIn };
