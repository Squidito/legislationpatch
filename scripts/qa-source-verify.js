// qa-source-verify.js
// Source-anchored QA verifier for the QA Loop Protocol (see CLAUDE.md).
//
// PURPOSE: tie every figure/percentage/year/section cite in a bill's analysis back
// to a QUOTED line of the actual source text (data/bill-text/{id}.txt + any
// referencedSources). It verifies claims against the SOURCE, never against cache
// alone and never against a previous run's output — so it cannot rubber-stamp its
// own prior conclusion. Re-running it on unchanged data is NOT an independent pass;
// the protocol still requires a genuine human/agent fresh read of the quoted source.
//
// Usage:
//   node scripts/qa-source-verify.js                 # all analyzed bills, summary
//   node scripts/qa-source-verify.js --bill 119-HR-1 # one bill
//   node scripts/qa-source-verify.js --quote         # print the source line for EVERY claim (forces a real read)
//   node scripts/qa-source-verify.js --bill 119-HR-1 --quote
//   node scripts/qa-source-verify.js --headings      # figure→account BINDING review: for each dollar
//                                                    # claim, the analysis snippet vs the bill-text
//                                                    # account heading, side by side. This is the fast
//                                                    # path for the "right number, wrong account" check
//                                                    # (QA Loop step 2.5) — scan for pairs that disagree.
//
// Exit code: non-zero if any OPEN claim has no source evidence, or any
// non-statutory editorial adjective is found. Flags a genuine QA read has
// individually verified can be adjudicated with evidence in
// data/qa-adjudications.json (qaSourceVerify entries) — these print as
// "◦ adjudicated" and do not count. Matching is exact on billId+kind+token+path,
// so any edit that moves or changes a claim re-opens its flag.
// Intended to be run once PER PASS, with the --quote output actually read
// against source — not diffed against the last run.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cache.json'), 'utf8')).bills;
const QUOTE = process.argv.includes('--quote');
const HEADINGS = process.argv.includes('--headings');

// Adjudication ledger: flags a human/agent pass has individually verified against
// source (data/qa-adjudications.json). Matching is exact on billId+kind+token+path,
// so any edit that moves or changes the claim re-opens the flag. The ledger records
// PAST human verification — it is not this tool verifying itself (genuine-read rule).
let ADJUDICATIONS = [];
try {
  ADJUDICATIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/qa-adjudications.json'), 'utf8')).qaSourceVerify || [];
} catch { /* no ledger — all flags open */ }
function findAdjudication(billId, kind, token, pathLabel) {
  return ADJUDICATIONS.find(a => a.billId === billId && a.kind === kind && a.token === token && a.path === pathLabel);
}
const billArg = (process.argv.find(a => a.startsWith('--bill')) || '').split('=')[1]
  || (process.argv.includes('--bill') ? process.argv[process.argv.indexOf('--bill') + 1] : null);

// Editorial adjectives banned by RULE 7, minus phrases that are genuine statutory
// terms (these must be quoted from the bill text to be allowed — see verifyEditorial).
const BANNED = /\b(quietly|buried|hidden|concealed|sweeping|significant|notable|troubling|controversial|merely|surprisingly|cleverly|conveniently|ostensibly|framed as|landmark|major|crackdown|sprawling|massive)\b/i;

function readSource(id, refs) {
  const blocks = [];
  const main = path.join(ROOT, 'data/bill-text', `${id}.txt`);
  if (fs.existsSync(main)) blocks.push({ tag: id, lines: fs.readFileSync(main, 'utf8').split('\n') });
  for (const r of (refs || [])) {
    const f = path.join(ROOT, r.textFile || '');
    if (r.textFile && fs.existsSync(f)) blocks.push({ tag: r.id || r.textFile, lines: fs.readFileSync(f, 'utf8').split('\n') });
  }
  return blocks;
}

// Collect every prose string carrying a checkable figure. Walks the top-level fields
// AND every divisions[] block — omnibus bills (e.g. HR-6938's NASA $3.0B, which exists
// ONLY in the division layer) would otherwise go entirely unchecked. underreported is
// handled as either a string or {summary,why_unreported}.
function proseSegments(b) {
  const seg = [];
  const push = (label, s) => { if (s && typeof s === 'string') seg.push({ label, s }); };
  const walk = (o, p) => {
    push(`${p}summary`, o.summary); push(`${p}brief`, o.brief);
    (o.top_lines || []).forEach((t, i) => { push(`${p}top_lines[${i}].headline`, t.headline); (t.subs || []).forEach((s, j) => push(`${p}top_lines[${i}].subs[${j}]`, s)); });
    (o.sections || []).forEach((s, i) => (s.items || []).forEach((it, j) => { push(`${p}sections[${i}].items[${j}].main`, it.main); push(`${p}sections[${i}].items[${j}].detail`, it.detail); }));
    (o.underreported || []).forEach((u, i) => { if (typeof u === 'string') push(`${p}underreported[${i}]`, u); else { push(`${p}underreported[${i}].summary`, u.summary); push(`${p}underreported[${i}].why_unreported`, u.why_unreported); } });
    (o.criticisms || []).forEach((c, i) => push(`${p}criticisms[${i}]`, c));
    (o.gaps || []).forEach((g, i) => push(`${p}gaps[${i}]`, g));
    const ch = o.changes || {};
    ['added', 'modified', 'removed'].forEach(k => (ch[k] || []).forEach((x, i) => push(`${p}changes.${k}[${i}]`, x)));
  };
  walk(b, '');
  (b.divisions || []).forEach(d => walk(d, `div[${d.divisionKey || d.label || '?'}].`));
  return seg;
}

// A figure proves PRESENCE; it does not prove it belongs to the account the analysis
// claims (the "right number, wrong account" class — e.g. $3.0B labelled a fake NASA
// account when it is Safety/Security/Mission Services; or NFS↔Wildland-Fire swapped).
// To let the reader check the BINDING, we surface the enclosing account heading.
// In this corpus account headings are blank-line-delimited; body/proviso lines never
// are. Agency + sub-account headings are stacked with only blanks between them, while
// sibling accounts are separated by a body paragraph — so collecting the contiguous
// heading stack yields "Agency › sub-account" and never grabs a neighbouring account.
function looksLikeHeading(lines, i) {
  const t = (lines[i] || '').trim();
  if (!t) return false;
  if (i > 0 && lines[i - 1].trim() !== '') return false; // headings sit under a blank line
  if (/\$/.test(t)) return false;                         // carries a figure → appropriation/body
  if (/[,:;]$/.test(t)) return false;                     // trailing separator → mid-sentence/proviso
  if (/\.$/.test(t)) return false;                        // ends a sentence → body
  if (/[;]/.test(t)) return false;                        // semicolon → body enumeration, never an account heading
  if (/^[([]/.test(t)) return false;                      // "(including...", "[[Page ...]]"
  if (/^(For\b|Provided\b|In addition\b|Notwithstanding\b|That\b|``)/i.test(t)) return false;
  if (t.length > 70) return false;
  return /[A-Za-z]/.test(t);
}
function enclosingHeading(lines, idx) {
  let i = idx - 1;
  while (i >= 0 && !looksLikeHeading(lines, i)) i--; // walk up through the appropriation body
  const stack = [];
  while (i >= 0 && looksLikeHeading(lines, i) && stack.length < 3) {
    stack.unshift(lines[i].trim());
    for (i--; i >= 0 && lines[i].trim() === ''; i--) { /* skip blanks to next heading */ }
  }
  return stack.join(' › ');
}

// Find the source line that evidences a claim. Returns {tag, lineNo, text, heading} or null.
function findDollar(blocks, value) {
  for (const blk of blocks) {
    for (let i = 0; i < blk.lines.length; i++) {
      const m = blk.lines[i].match(/\$[0-9][0-9,]*(?:\.[0-9]+)?/g); // incl. decimals ($63.51) and short amounts ($50) — value-equality below keeps precision
      if (!m) continue;
      for (const tok of m) {
        const f = +tok.replace(/[$,]/g, '');
        if (!isNaN(f) && Math.abs(f - value) <= Math.max(1, value * 0.006)) return { tag: blk.tag, lineNo: i + 1, text: blk.lines[i].trim(), heading: enclosingHeading(blk.lines, i) };
      }
    }
  }
  return null;
}
// whitespace-tolerant phrase finder (handles figures wrapped across line breaks)
function findPhrase(blocks, ...variants) {
  for (const blk of blocks) {
    for (let i = 0; i < blk.lines.length; i++) {
      const win = (blk.lines[i] + ' ' + (blk.lines[i + 1] || '')).replace(/\s+/g, ' ').toLowerCase();
      for (const v of variants) if (win.includes(v)) return { tag: blk.tag, lineNo: i + 1, text: blk.lines[i].trim(), heading: enclosingHeading(blk.lines, i) };
    }
  }
  return null;
}

function shortToVal(tok) {
  const m = tok.match(/\$([0-9][0-9,.]*)\s*(B|M|K)?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ''));
  const u = (m[2] || '').toUpperCase();
  if (u === 'B') n *= 1e9; else if (u === 'M') n *= 1e6; else if (u === 'K') n *= 1e3;
  return n;
}

function verifyBill(b) {
  const blocks = readSource(b.id, b.referencedSources);
  if (!blocks.length) return { id: b.id, claims: [], flags: [{ kind: 'source', detail: 'no source text file' }] };
  const claims = [], flags = [];
  const seen = new Set();
  for (const { label, s } of proseSegments(b)) {
    // dollars
    for (const tok of (s.match(/\$[0-9][0-9,.]*\s*(?:B|M|K)?/gi) || [])) {
      const key = 'D' + tok.trim(); if (seen.has(key)) continue; seen.add(key);
      const v = shortToVal(tok.trim()); if (v == null || v === 0) continue; // "$0" = a net-cost characterization (fee-offset), not a sourceable appropriation line
      const ev = findDollar(blocks, v);
      // ctx: what the ANALYSIS says around this figure — the claimed binding,
      // for --headings side-by-side comparison against the found heading.
      const at = s.indexOf(tok);
      const ctx = s.slice(Math.max(0, at - 45), at + tok.length + 65).replace(/\s+/g, ' ').trim();
      claims.push({ kind: '$', token: tok.trim(), label, ev, ctx });
      if (!ev) flags.push({ kind: '$', token: tok.trim(), label, detail: `${tok.trim()} (${label})` });
    }
    // percentages
    for (const m of s.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*(?:percent|%)/gi)) {
      const n = m[1]; const key = 'P' + n; if (seen.has(key)) continue; seen.add(key);
      const ev = findPhrase(blocks, n + ' percent', n + 'percent', n + '%', n + ' %');
      claims.push({ kind: '%', token: n + '%', label, ev });
      if (!ev) flags.push({ kind: '%', token: n + '%', label, detail: `${n}% (${label})` });
    }
    // years
    for (const m of s.matchAll(/\b((?:19|20)[0-9]{2})\b/g)) {
      const y = m[1]; const key = 'Y' + y; if (seen.has(key)) continue; seen.add(key);
      const ev = findPhrase(blocks, y);
      claims.push({ kind: 'yr', token: y, label, ev });
      if (!ev) flags.push({ kind: 'yr', token: y, label, detail: `${y} (${label})` });
    }
    // section cites
    for (const m of s.matchAll(/\bsection\s+([0-9]+[A-Za-z]?)/gi)) {
      const sec = m[1].toLowerCase(); const key = 'S' + sec; if (seen.has(key)) continue; seen.add(key);
      const ev = findPhrase(blocks, 'section ' + sec, 'sec. ' + sec, sec + '. ');
      claims.push({ kind: 'sec', token: 'Section ' + sec, label, ev });
      if (!ev) flags.push({ kind: 'sec', token: 'Section ' + sec, label, detail: `Section ${sec} (${label})` });
    }
  }
  // editorial: a banned word is allowed ONLY if it sits inside a phrase quoted from the source
  for (const { label, s } of proseSegments(b)) {
    const m = s.match(BANNED); if (!m) continue;
    const w = m[0].toLowerCase();
    // grab a short window around the word and require it to appear in the source
    const idx = m.index; const window = s.slice(Math.max(0, idx - 12), idx + w.length + 18).replace(/\s+/g, ' ').toLowerCase();
    const ev = findPhrase(blocks, window) || findPhrase(blocks, w + ' '); // statutory term must be in source
    if (!ev) flags.push({ kind: 'editorial', token: m[0], label, detail: `"${m[0]}" (${label}) — not a sourced term` });
  }
  return { id: b.id, claims, flags };
}

const bills = cache.filter(b => b.analyzed && (!billArg || b.id === billArg));
let totalFlags = 0, billsWithFlags = 0, totalAdjudicated = 0;
console.log(`qa-source-verify — ${bills.length} bill(s). Claims are matched to QUOTED source lines; read them, do not diff against a prior run.`);
if (QUOTE) console.log(`A ✓ proves the number is PRESENT, not that it belongs to the named account — check each "under account heading →" against the account the analysis attributes the figure to.`);
console.log('');
for (const b of bills) {
  const r = verifyBill(b);
  if (HEADINGS) {
    // Figure→account binding review: each dollar claim's ANALYSIS context vs the
    // BILL-TEXT heading its number was found under. The mechanical ✓ only proves
    // presence — a human/agent must judge each pair. Disagreeing pairs are the
    // "right number, wrong account" class (NASA $3.0B; NFS↔Wildland-Fire).
    const dollars = r.claims.filter(c => c.kind === '$');
    if (dollars.length) {
      console.log(`\n=== ${b.id} — ${(b.title || '').slice(0, 70)} ===`);
      for (const c of dollars) {
        if (!c.ev) { console.log(`  ✗ ${String(c.token).padEnd(10)} NO SOURCE EVIDENCE — resolve as a flag first`); continue; }
        console.log(`  ${String(c.token).padEnd(10)} analysis: "…${c.ctx}…"`);
        console.log(`  ${' '.repeat(10)} bill txt : ${c.ev.heading || '(no account heading found — likely non-appropriations text)'}   [${c.ev.tag}:${c.ev.lineNo}]`);
      }
    }
    continue; // headings mode replaces the standard per-bill output
  }
  if (QUOTE) {
    console.log(`\n=== ${b.id} — ${b.title || ''} ===`);
    for (const c of r.claims) {
      if (c.ev) {
        console.log(`  ✓ ${c.kind} ${String(c.token).padEnd(14)} ${c.label}\n        └ ${c.ev.tag}:${c.ev.lineNo}  ${c.ev.text.slice(0, 96)}`);
        if (c.ev.heading) console.log(`          under account heading → ${c.ev.heading}   [does this match the account the analysis names?]`);
      } else {
        console.log(`  ✗ ${c.kind} ${String(c.token).padEnd(14)} ${c.label}  — NO SOURCE EVIDENCE`);
      }
    }
  }
  const open = [], adjudicated = [];
  for (const f of r.flags) {
    const a = findAdjudication(b.id, f.kind, f.token, f.label);
    if (a) adjudicated.push({ f, a }); else open.push(f);
  }
  totalAdjudicated += adjudicated.length;
  if (open.length) {
    billsWithFlags++; totalFlags += open.length;
    if (!QUOTE) console.log(`FLAG ${b.id}`);
    for (const f of open) console.log(`     ✗ [${f.kind}] ${f.detail}`);
  } else if (!QUOTE && !adjudicated.length) {
    console.log(`ok   ${b.id}  (${r.claims.length} claims, all source-anchored)`);
  }
  for (const { f, a } of adjudicated) {
    console.log(`     ◦ [${f.kind}] ${f.detail} — adjudicated ${a.verifiedAt}: ${a.reason}`);
  }
}
console.log(`\n${totalFlags} open flag(s) across ${billsWithFlags} bill(s); ${totalAdjudicated} adjudicated (data/qa-adjudications.json).`);
console.log(totalFlags === 0
  ? 'No open mechanical gaps. NOTE: a clean run is NOT a pass by itself — the protocol requires a fresh human/agent read of the quoted source (run with --quote).'
  : 'Resolve open flags against source (fix, fetch the reference, or adjudicate with evidence) before counting this pass.');
process.exit(totalFlags === 0 ? 0 : 1);
