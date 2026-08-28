// attribution.js — deterministic "right number, wrong account" guard.
//
// For each dollar figure in a bill analysis, locate it in the source text and derive
// the enclosing appropriations account heading (blank-line-delimited heading stack,
// same logic proven in qa-source-verify.js). If the account LABEL the analysis binds
// the figure to shares NO distinctive word with that source heading, flag it — the
// NFS↔Wildland-Fire swap / NASA-$3.0B fabrication / SBA-"$15B disaster" class, where
// the number is right but bound to the wrong account.
//
// Advisory/heuristic (WARN, not ERROR): appropriations account names are paraphrased
// in prose, so a zero-overlap result is a strong signal, not proof. Compares the label
// against the HEADING only (never the body line — appropriations lines routinely name
// neighbouring programs, which would mask a real swap).

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Source loading (mirrors qa-source-verify.js readSource; ROOT-contained) ──────
function readSource(ROOT, id, refs) {
  const blocks = [];
  const main = path.join(ROOT, 'data/bill-text', `${id}.txt`);
  if (fs.existsSync(main)) blocks.push({ tag: id, lines: fs.readFileSync(main, 'utf8').split('\n') });
  for (const r of (refs || [])) {
    if (!r || !r.textFile) continue;
    const f = path.resolve(ROOT, r.textFile);
    if (f !== ROOT && !f.startsWith(ROOT + path.sep)) continue;
    if (fs.existsSync(f)) blocks.push({ tag: r.id || r.textFile, lines: fs.readFileSync(f, 'utf8').split('\n') });
  }
  return blocks;
}

// ── Heading stack (ported verbatim from qa-source-verify.js) ─────────────────────
function looksLikeHeading(lines, i) {
  const t = (lines[i] || '').trim();
  if (!t) return false;
  if (i > 0 && lines[i - 1].trim() !== '') return false;
  if (/\$/.test(t)) return false;
  if (/[,:;]$/.test(t)) return false;
  if (/\.$/.test(t)) return false;
  if (/[;]/.test(t)) return false;
  if (/^[([]/.test(t)) return false;
  if (/^(For\b|Provided\b|In addition\b|Notwithstanding\b|That\b|``)/i.test(t)) return false;
  if (t.length > 70) return false;
  return /[A-Za-z]/.test(t);
}
function enclosingHeading(lines, idx) {
  let i = idx - 1;
  while (i >= 0 && !looksLikeHeading(lines, i)) i--;
  const stack = [];
  while (i >= 0 && looksLikeHeading(lines, i) && stack.length < 3) {
    stack.unshift(lines[i].trim());
    for (i--; i >= 0 && lines[i].trim() === ''; i--) { /* skip blanks */ }
  }
  return stack.join(' › ');
}
function findDollar(blocks, value) {
  for (const blk of blocks) {
    for (let i = 0; i < blk.lines.length; i++) {
      const m = blk.lines[i].match(/\$[0-9][0-9,]*(?:\.[0-9]+)?/g);
      if (!m) continue;
      for (const tok of m) {
        const f = +tok.replace(/[$,]/g, '');
        if (!isNaN(f) && Math.abs(f - value) <= Math.max(1, value * 0.006))
          return { tag: blk.tag, lineNo: i + 1, text: blk.lines[i].trim(), heading: enclosingHeading(blk.lines, i) };
      }
    }
  }
  return null;
}
// Dollar tokenization is shared with qa-source-verify.js — this file carried an
// independent copy of the same unit-boundary bug ("$15,000 base" valued as $15
// trillion, "$400 monthly" as $400M). See lib/figures.js.
const { DOLLAR_TOKEN_RE, shortToVal } = require('./figures.js');

// ── Prose walker (ported from qa-source-verify.js proseSegments) ─────────────────
function proseSegments(b) {
  const seg = [];
  const push = (label, s) => { if (s && typeof s === 'string') seg.push({ label, s }); };
  const walk = (o, p) => {
    push(`${p}summary`, o.summary); push(`${p}brief`, o.brief);
    (o.top_lines || []).forEach((t, i) => { push(`${p}top_lines[${i}].headline`, t.headline); (t.subs || []).forEach((s, j) => push(`${p}top_lines[${i}].subs[${j}]`, s)); });
    (o.sections || []).forEach((s, i) => (s.items || []).forEach((it, j) => { push(`${p}sections[${i}].items[${j}].main`, it.main); push(`${p}sections[${i}].items[${j}].detail`, it.detail); }));
    (o.underreported || []).forEach((u, i) => { if (typeof u === 'string') push(`${p}underreported[${i}]`, u); else if (u) { push(`${p}underreported[${i}].summary`, u.summary); push(`${p}underreported[${i}].why_unreported`, u.why_unreported); } });
    (o.criticisms || []).forEach((c, i) => push(`${p}criticisms[${i}]`, c));
    (o.gaps || []).forEach((g, i) => push(`${p}gaps[${i}]`, g));
    const ch = o.changes || {};
    ['added', 'modified', 'removed'].forEach(k => (ch[k] || []).forEach((x, i) => push(`${p}changes.${k}[${i}]`, x)));
  };
  walk(b, '');
  (b.divisions || []).forEach(d => walk(d, `div[${d.divisionKey || d.label || '?'}].`));
  return seg;
}

// ── Tokenization ─────────────────────────────────────────────────────────────────
const STOP = new Set('the a an of for to in and or on at by with from under into per plus its this that these those shall may not more less than up no any all each which also other such is are be as it also both'.split(' '));
// Generic appropriations boilerplate that must NOT count as account-identifying.
const FILLER = new Set('management operations operation expenses expense account accounts program programs fund funds funding service services activities activity salaries necessary appropriation appropriations appropriated ceiling reserve receives provides provided funded total amounts amount authority allocation allocated budget spending level levels line items combined separate remaining balances unobligated general provision provisions'.split(' '));
function tokens(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9/ ]/g, ' ').split(/[\s/]+/)
    .filter(w => w.length >= 3 && !STOP.has(w) && !FILLER.has(w) && !/^\d+$/.test(w));
}

// The account label the analysis binds a figure to — ONLY a clean single-account
// binding: "$X for <Account>" or "<Account>: $X". Returns null (no guess) otherwise,
// which is what keeps precision high (compact "$A x; $B y; $C z" lists produce no
// reliable per-figure label and are skipped upstream anyway).
function accountLabel(s, at, tok) {
  const post = s.slice(at + tok.length, at + tok.length + 60);
  const pre  = s.slice(Math.max(0, at - 60), at);
  let m;
  if ((m = post.match(/^\s*(?:for|to)\s+(?:the\s+)?([A-Za-z][A-Za-z '&/-]{4,}?)(?:\s+and\b|[;:,.(]|$)/i))) return m[1].trim();
  if ((m = pre.match(/(?:^|[;.]|\band\b)\s*([A-Z][A-Za-z '&/-]{4,}?)\s*[:—–-]\s*$/)))                       return m[1].trim();
  return null;
}

// The figure's enclosing heading must be a real APPROPRIATIONS ACCOUNT — not a
// section/title marker, proviso, or citation (those are structural, not accounts).
function plausibleHeading(h) {
  if (!h) return false;
  const last = h.split('›').pop().trim();
  if (/^(sec\.?\b|section\b|title\b|subtitle\b|this act|none of|notwithstanding|in addition|of the|of division|for the|for necessary|provided)/i.test(last)) return false;
  if (/public law|may be cited|amounts made available|of this act|shall be used|available under/i.test(h)) return false;
  return /[a-z]/i.test(last) && last.length >= 4;
}

// How many source lines carry (within tolerance) this dollar value — used to skip
// ambiguous figures that appear under multiple accounts (can't judge which heading).
function dollarCount(blocks, value) {
  let c = 0;
  for (const blk of blocks) for (const line of blk.lines) {
    const m = line.match(/\$[0-9][0-9,]*(?:\.[0-9]+)?/g); if (!m) continue;
    for (const tok of m) { const f = +tok.replace(/[$,]/g, ''); if (!isNaN(f) && Math.abs(f - value) <= Math.max(1, value * 0.006)) c++; }
  }
  return c;
}

// Returns [{token, label(path), account, heading, tag, lineNo}] — high-precision
// suspected wrong-account bindings (advisory; legitimate program-vs-account naming
// is adjudicated once in the ledger, after which only NEW bindings warn).
function attributionFlags(bill, ROOT) {
  const blocks = readSource(ROOT, bill.id, bill.referencedSources);
  if (!blocks.length) return [];
  const out = [], seen = new Set();
  for (const { label, s } of proseSegments(bill)) {
    for (const raw of (s.match(DOLLAR_TOKEN_RE) || [])) {
      const tok = raw.trim();
      const v = shortToVal(tok);
      if (v == null || v < 1e6) continue;                 // account-bound figures are ≥ $1M
      const at = s.indexOf(tok);
      const near = s.slice(Math.max(0, at - 28), at + tok.length + 28);
      if ((near.match(/\$/g) || []).length > 1) continue; // compact list → no reliable per-figure label
      const lab = accountLabel(s, at, tok);
      if (!lab) continue;                                 // no clean single-account binding
      const labTok = tokens(lab);
      if (labTok.length < 2) continue;                    // need a real multi-word account name
      if (dollarCount(blocks, v) !== 1) continue;         // value not unique → can't pin the account
      const ev = findDollar(blocks, v);
      if (!ev || !plausibleHeading(ev.heading)) continue; // must sit under a real account heading
      const headTok = new Set(tokens(ev.heading));
      if (labTok.some(t => headTok.has(t))) continue;     // shares a distinctive word → consistent
      const key = bill.id + '|' + tok + '|' + ev.heading;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ token: tok, label, account: lab.replace(/\s+/g, ' ').trim(), heading: ev.heading, tag: ev.tag, lineNo: ev.lineNo });
    }
  }
  return out;
}

module.exports = { attributionFlags, tokens, accountLabel, plausibleHeading };
