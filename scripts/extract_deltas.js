#!/usr/bin/env node
/**
 * extract_deltas.js
 *
 * Two extraction buckets, three verification sources, one cross-reference.
 *
 * BUCKET 2 — Explicit "from $X to $Y" deltas stated in the bill text.
 *   Cross-reference: GovInfo US Code (checks the "from" amount against statute).
 *
 * BUCKET 3 — Inferred deltas: bill states current-year amount, we find prior year.
 *   Source A: USASpending.gov (FY prior-year enacted, filtered by agency)
 *   Source B: Claude-tagged budget_accounts in cache.json (TAS → USASpending)
 *   Source C: GovInfo enrolled bill search (find same program in prior-year bill text)
 *   Cross-reference: 2+ sources agree within TOLERANCE → publishable
 *
 * Confidence levels (both buckets):
 *   high    — 2+ independent sources agree within TOLERANCE
 *   medium  — 1 source with plausible corroboration (e.g. US Code within 15%)
 *   low     — only 1 source, no corroboration
 *   mismatch— sources found but disagree beyond TOLERANCE (suppressed)
 *   stated  — Bucket 2 only: bill itself states the prior amount; US Code lags
 *
 * Usage:
 *   node scripts/extract_deltas.js              — all bills
 *   node scripts/extract_deltas.js 119-HR-7148  — one bill
 *   node scripts/extract_deltas.js --bucket=2   — explicit deltas only
 *   node scripts/extract_deltas.js --bucket=3   — inferred deltas only
 */

'use strict';

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const https = require('https');

// ─── Config ──────────────────────────────────────────────────────────────────

const CACHE_PATH     = path.join(__dirname, '../data/cache.json');
const MAP_PATH       = path.join(__dirname, 'program-account-map.json');
const DELTAS_DIR     = path.join(__dirname, '../data/deltas');
const GOVINFO_KEY    = process.env.GOVINFO_API_KEY; // was a hardcoded literal — rotated + moved to .env 2026-07-06
const TOLERANCE      = 0.05;   // 5% — sources must agree within this
const LAG_THRESHOLD  = 0.15;   // 15% — US Code lag range (not a real mismatch)
const DELAY_MS       = 400;
const PRIOR_FY       = 2025;
const CURRENT_FY     = 2026;
const USA_BASE       = 'https://api.usaspending.gov/api/v2';
const GOVINFO_BASE   = 'https://api.govinfo.gov';

// ─── HTTP ─────────────────────────────────────────────────────────────────────

function httpGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const sep = url.includes('?') ? '&' : '?';
    const full = url.includes('govinfo') ? url + sep + 'api_key=' + GOVINFO_KEY : url;
    https.get(full, { headers: { 'User-Agent': 'LegislationPatch/1.0', ...extraHeaders } }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 300, status: res.statusCode, data: JSON.parse(buf), raw: null }); }
        catch { resolve({ ok: res.statusCode < 300, status: res.statusCode, data: null, raw: buf }); }
      });
    }).on('error', e => resolve({ ok: false, error: e.message }));
  });
}

function httpPost(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const b = JSON.stringify(body);
    const sep = url.includes('?') ? '&' : '?';
    const full = url.includes('govinfo') ? url + sep + 'api_key=' + GOVINFO_KEY : url;
    const u = new URL(full);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'LegislationPatch/1.0', 'Content-Length': Buffer.byteLength(b), ...extraHeaders },
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 300, status: res.statusCode, data: JSON.parse(buf) }); }
        catch { resolve({ ok: res.statusCode < 300, status: res.statusCode, data: null }); }
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(b); req.end();
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Amount helpers ──────────────────────────────────────────────────────────

const UNITS = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 };

function parseDollar(num, unit) {
  const n = parseFloat((num || '').replace(/,/g, ''));
  if (isNaN(n)) return null;
  const u = (unit || '').toUpperCase().replace(/^([TBMK])B?$/, '$1');
  return n * (UNITS[u] || 1);
}

function fmt(n) {
  if (n == null) return 'null';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n/1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n/1e9).toFixed(3)}B`;
  if (abs >= 1e6)  return `$${(n/1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function withinTol(a, b, tol = TOLERANCE) {
  if (a == null || b == null) return false;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) <= tol;
}

function diffPct(a, b) {
  if (a == null || b == null) return null;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) * 100;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Extract all dollar amounts >= $100M from plain text (after HTML strip)
function extractAmountsFromText(text) {
  const plain = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const amounts = new Set();
  // Full integer: $1,403,000,000
  for (const m of plain.matchAll(/\$([\d,]{4,})/g)) {
    const n = parseDollar(m[1], '');
    if (n >= 1e8) amounts.add(n);
  }
  // Compact with unit: $1.40B, $350M
  for (const m of plain.matchAll(/\$([\d,.]+)\s*([TBMK]B?)/g)) {
    const n = parseDollar(m[1], m[2]);
    if (n && n >= 1e8) amounts.add(n);
  }
  return [...amounts];
}

// ─── Cross-reference consensus ───────────────────────────────────────────────

/**
 * Given source amounts (null = not available), compute consensus confidence.
 * Returns { confidence, priorYear, sourceCount, agreeCount }
 */
function crossReference(sourceMap) {
  const available = Object.entries(sourceMap)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ({ key: k, val: v }));

  if (!available.length) return { confidence: 'none', priorYear: null, sourceCount: 0, agreeCount: 0 };

  // Find all agreeing pairs
  const agreements = [];
  for (let i = 0; i < available.length; i++) {
    for (let j = i + 1; j < available.length; j++) {
      if (withinTol(available[i].val, available[j].val)) {
        agreements.push([available[i].key, available[j].key]);
      }
    }
  }

  const priorYear = median(available.map(x => x.val));

  if (available.length >= 2 && agreements.length >= 1) {
    return {
      confidence:  available.length === 3 && agreements.length === 3 ? 'high' : 'high',
      priorYear,
      sourceCount: available.length,
      agreeCount:  agreements.length,
      agreements,
    };
  }
  if (available.length === 1) {
    return { confidence: 'low', priorYear, sourceCount: 1, agreeCount: 0 };
  }
  // Multiple sources but none agree
  return { confidence: 'mismatch', priorYear: null, sourceCount: available.length, agreeCount: 0 };
}

// ══════════════════════════════════════════════════════════════════════════════
// BUCKET 2 — Explicit "from $X to $Y" deltas
// ══════════════════════════════════════════════════════════════════════════════

const RE_FROM_TO = /from\s+\$([0-9,.]+)\s*([TBMK]B?)\s+to\s+\$([0-9,.]+)\s*([TBMK]B?)/gi;
const RE_AMT_INC = /\$([0-9,.]+)\s*([TBMK]B?)\s+increased?\s+to\s+\$([0-9,.]+)\s*([TBMK]B?)/gi;
const RE_AMT_DEC = /\$([0-9,.]+)\s*([TBMK]B?)\s+decreased?\s+to\s+\$([0-9,.]+)\s*([TBMK]B?)/gi;
const RE_B2_QUICK = /from\s+\$[\d,.]+\s*[TBMK]B?\s+to\s+\$|\$[\d,.]+\s*[TBMK]B?\s+increased?\s+to\s+\$/i;

function extractProgramName(text, matchStart) {
  const before  = text.slice(0, matchStart).trim();
  const cleaned = before.replace(/\s+(increased?|decreased?|raised?|reduced?|set|from)\s*:?\s*$/i, '').trim();
  return cleaned.split(/[,;]/).pop().trim().replace(/:$/, '').trim();
}

function extractB2Deltas(text, label) {
  const out = [];
  const run = (re, dir) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const from = parseDollar(m[1], m[2]);
      const to   = parseDollar(m[3], m[4]);
      if (!from || !to || from === to) continue;
      out.push({
        bucket: 2,
        program:     extractProgramName(text, m.index),
        from, to,
        delta:        to - from,
        deltaPercent: Math.round(((to - from) / from) * 1000) / 10,
        direction:    dir || (to >= from ? 'increase' : 'decrease'),
        sourceText:   label,
        rawMatch:     m[0],
      });
    }
  };
  run(RE_FROM_TO, null);
  run(RE_AMT_INC, 'increase');
  run(RE_AMT_DEC, 'decrease');
  return out;
}

// GovInfo US Code cross-reference (Bucket 2 verification)
async function verifyB2WithUSCode(delta) {
  const res = await httpPost(`${GOVINFO_BASE}/search`, {
    query: delta.program, pageSize: 5, offsetMark: '*',
    sorts: [{ field: 'score', sortOrder: 'DESC' }],
    filters: { collection: ['USCODE'] },
  });
  if (!res.ok || !res.data?.results?.length) {
    delta.confidence = 'low'; delta.verified = false; return;
  }
  for (const result of res.data.results) {
    const htmLink = result.download?.txtLink || result.download?.htmLink;
    if (!htmLink) continue;
    await delay(DELAY_MS);
    const txt = await httpGet(htmLink);
    if (!txt.ok) continue;
    const raw   = txt.raw || '';
    const amts  = extractAmountsFromText(raw);
    if (!amts.length) continue;

    const closest = amts.reduce((best, a) => Math.abs(a - delta.from) < Math.abs(best - delta.from) ? a : best, amts[0]);
    const diff    = diffPct(closest, delta.from);

    delta.usCode = {
      title:       result.title,
      packageId:   result.packageId,
      dateIssued:  result.dateIssued,
      amountsFound: amts.map(fmt),
      closest,
      diffPercent: Math.round(diff * 10) / 10,
    };

    if (withinTol(closest, delta.from)) {
      delta.confidence = 'high'; delta.verified = true;
    } else if (diff <= LAG_THRESHOLD * 100) {
      delta.confidence = 'stated'; delta.verified = false;
      delta.note = 'US Code lags — likely intermediate appropriation';
    } else {
      delta.confidence = 'mismatch'; delta.verified = false;
    }
    console.log(`      US Code ${result.title?.slice(0, 45)} (${result.dateIssued}): closest ${fmt(closest)} vs ${fmt(delta.from)} → ${diff.toFixed(1)}% → ${delta.confidence}`);
    return;
  }
  delta.confidence = 'low'; delta.verified = false;
}

// ══════════════════════════════════════════════════════════════════════════════
// BUCKET 3 — Inferred deltas (current-year amount → find prior year)
// ══════════════════════════════════════════════════════════════════════════════

// Patterns for "Program Name: $X" and "Program at $X" in bill change text
const RE_COLON  = /([A-Z][^:;\n]{4,60}):\s*\$([0-9,.]+)\s*([TBMK]B?)/g;
const RE_AT     = /([A-Z][^,;\n]{4,50})\s+(?:set at|reauthorized at|appropriated at|designated at|funded at|of)\s+\$([0-9,.]+)\s*([TBMK]B?)/g;
const RE_PARENS = /([A-Z][A-Za-z &-]{3,40})\s+\(\$([0-9,.]+)\s*([TBMK]B?)\)/g;
// Comma-list: "Taxpayer Services $3.04B, Enforcement $5.00B"
// Note: char class includes uppercase to capture "Taxpayer Services", "Operations Support"
const RE_INLINE = /([A-Z][a-zA-Z &-]{3,40})\s+\$([0-9,.]+)\s*([TBMK]B?)/g;

// Fragment words that indicate the extracted "name" is actually a clause fragment
const PROGRAM_FRAGMENT_RE = /\b(increased?|decreased?|reduced?|raised?|reauthorized?|extended?|rescinded?|designated|authorized|set at|from|through)\s*$/i;

function isValidProgramName(name) {
  if (!name || name.length < 4) return false;
  if (PROGRAM_FRAGMENT_RE.test(name.trim())) return false; // ends with a verb/preposition
  if (name.split(/\s+/).length > 8) return false;          // too many words
  return true;
}

function extractB3Candidates(text, label) {
  const out = [];
  const seen = new Set();

  const add = (program, n, raw) => {
    const clean = program.trim().replace(/:$/, '').trim();
    if (!n || n < 1e8) return;
    if (!isValidProgramName(clean)) return;
    const key = clean.toLowerCase().replace(/\W+/g,'') + '|' + Math.round(n/1e8);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ program: clean, current: n, sourceText: label, rawMatch: raw });
  };

  for (const re of [RE_COLON, RE_AT, RE_PARENS, RE_INLINE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      add(m[1], parseDollar(m[2], m[3]), m[0]);
    }
  }
  return out;
}

// ─── Source A: USASpending by agency ─────────────────────────────────────────

let usaCache = null; // cache the spending response for the session

async function getUSASpendingAccounts(agencyCode) {
  if (!usaCache) usaCache = {};
  if (usaCache[agencyCode]) return usaCache[agencyCode];

  const res = await httpPost(`${USA_BASE}/spending/`, {
    type: 'federal_account',
    filters: { fy: String(PRIOR_FY), period: 12 },
    limit: 100,
  });

  if (!res.ok || !res.data?.results) { usaCache[agencyCode] = []; return []; }

  // Filter by agency code prefix in account_number
  const accounts = res.data.results.filter(a =>
    (a.account_number || '').startsWith(agencyCode + '-')
  );
  usaCache[agencyCode] = accounts;
  return accounts;
}

function fuzzyMatch(needle, haystack) {
  const n = needle.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const h = haystack.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const nWords = n.split(' ').filter(w => w.length > 2);
  const hWords = h.split(' ').filter(w => w.length > 2);
  const nSet   = new Set(nWords);
  const hSet   = new Set(hWords);

  // Word-level containment — require the shorter to be at least 70% of the longer's word count
  // This prevents "Medicare" (1 word) from matching "Medicare Improvement Fund" (3 words)
  const nInH = nWords.every(w => hSet.has(w)) && nWords.length >= hWords.length * 0.7;
  const hInN = hWords.every(w => nSet.has(w)) && hWords.length >= nWords.length * 0.7;
  if (nInH || hInN) return 1.0;

  // Word overlap score
  const overlap = nWords.filter(w => hSet.has(w)).length;
  return overlap / Math.max(nSet.size, hSet.size, 1);
}

async function sourceA(program, mapEntry, currentAmt) {
  if (!mapEntry || mapEntry._skip) return null;
  try {
    await delay(DELAY_MS);
    const accounts = await getUSASpendingAccounts(mapEntry.agency);
    if (!accounts.length) return null;

    // Score each account against the search term
    const scored = accounts.map(a => ({
      ...a,
      score: fuzzyMatch(mapEntry.accountSearch, a.name || ''),
    })).sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best.score < 0.3) return null;

    // Inflation guard: if USASpending amount is >2.5× the current enacted amount,
    // the account likely includes supplemental funding (IRA, emergency, etc.)
    // and cannot be used as an annual appropriation comparator.
    if (currentAmt && best.amount / currentAmt > 1.25) {
      console.log(`      [A] USASpending: "${best.name}" amount=${fmt(best.amount)} — SKIPPED (${(best.amount/currentAmt).toFixed(1)}× current; likely includes supplementals or multi-stream funding)`);
      return null;
    }

    console.log(`      [A] USASpending: "${best.name}" score=${best.score.toFixed(2)} amount=${fmt(best.amount)}`);
    return { amount: best.amount, account: best.name, score: best.score, fy: PRIOR_FY };
  } catch(e) {
    return null;
  }
}

// ─── Source B: Claude-tagged budget_accounts from cache.json ─────────────────

async function sourceB(program, bill) {
  const accounts = bill.budget_accounts;
  if (!accounts) return null;

  // Try exact match first, then fuzzy
  const exactKey = Object.keys(accounts).find(k => k.toLowerCase() === program.toLowerCase());
  const fuzzyKey = exactKey || Object.keys(accounts).find(k => {
    const score = fuzzyMatch(program, k);
    return score >= 0.7;
  });
  if (!fuzzyKey) return null;

  const entry = accounts[fuzzyKey];
  if (!entry?.tas && !entry?.amount) return null;

  // If Claude gave us a TAS, query USASpending for the prior-year amount
  if (entry.tas) {
    await delay(DELAY_MS);
    const res = await httpPost(`${USA_BASE}/spending/`, {
      type: 'federal_account',
      filters: { fy: String(PRIOR_FY), period: 12, federal_account: entry.tas },
      limit: 1,
    });
    if (res.ok && res.data?.results?.[0]?.amount) {
      const amount = res.data.results[0].amount;
      console.log(`      [B] Claude TAS ${entry.tas}: ${fmt(amount)}`);
      return { amount, tas: entry.tas, fy: PRIOR_FY };
    }
  }

  // Claude may have stored the prior-year amount directly
  if (entry.priorAmount) {
    console.log(`      [B] Claude direct prior: ${fmt(entry.priorAmount)}`);
    return { amount: entry.priorAmount, fy: PRIOR_FY };
  }

  return null;
}

// ─── Source C: Targeted prior-year omnibus bill search ───────────────────────

const billTextCache = {}; // packageId → plain text, cached for the session

async function fetchBillText(packageId) {
  if (billTextCache[packageId]) return billTextCache[packageId];
  await delay(DELAY_MS);
  const res = await httpGet(`${GOVINFO_BASE}/packages/${packageId}/htm`);
  if (!res.ok || !res.raw) return null;
  const plain = res.raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  billTextCache[packageId] = plain;
  console.log(`      [C] Fetched ${packageId} (${(plain.length / 1024).toFixed(0)} KB)`);
  return plain;
}

function searchBillForAmount(plain, searchPattern, minAmount) {
  const RE_BILL_AMT = /\$([\d,]{4,})/g;
  const re = new RegExp(searchPattern, 'gi');
  let m;
  while ((m = re.exec(plain)) !== null) {
    const ctx = plain.slice(Math.max(0, m.index - 100), m.index + 1000);
    let am;
    RE_BILL_AMT.lastIndex = 0;
    while ((am = RE_BILL_AMT.exec(ctx)) !== null) {
      const n = parseFloat(am[1].replace(/,/g, ''));
      if (n >= (minAmount || 1e8)) return n; // return first qualifying amount
    }
  }
  return null;
}

async function sourceC(program, currentAmt, mapEntry) {
  if (!mapEntry?.priorBills?.length || !mapEntry.searchPattern) return null;

  for (const packageId of mapEntry.priorBills) {
    const plain = await fetchBillText(packageId);
    if (!plain) continue;

    const amount = searchBillForAmount(plain, mapEntry.searchPattern, mapEntry.minAmount);
    if (!amount) {
      console.log(`      [C] ${packageId}: pattern not found for "${program}"`);
      continue;
    }

    // Sanity: prior-year amount shouldn't be >3× current (wrong section hit)
    if (amount / currentAmt > 3) {
      console.log(`      [C] ${packageId}: ${fmt(amount)} is >3× current — skipping (wrong section)`);
      continue;
    }

    console.log(`      [C] ${packageId}: ${fmt(amount)} for "${program}"`);
    return { amount, packageId, fy: PRIOR_FY - 1 }; // FY2024 for most cases
  }

  console.log(`      [C] No prior-year amount found for "${program}"`);
  return null;
}

// ─── Bucket 3 main verifier ───────────────────────────────────────────────────

async function verifyB3(candidate, bill, programMap) {
  const mapEntry = Object.entries(programMap).find(([k]) => {
    const score = fuzzyMatch(candidate.program, k);
    return score >= 0.5;
  });

  // Map is the allowlist — skip anything not in it
  if (!mapEntry) {
    candidate.confidence = 'skipped';
    candidate.skipReason = 'not in program-account-map.json';
    return;
  }
  if (mapEntry[1]._skip) {
    candidate.confidence = 'skipped';
    candidate.skipReason = mapEntry[1].reason;
    return;
  }

  console.log(`\n  Bucket 3 • "${candidate.program}" [map: "${mapEntry[0]}"] (current FY${CURRENT_FY}: ${fmt(candidate.current)})`);

  // Run sources sequentially to keep delays orderly and logs readable
  const resA = await sourceA(candidate.program, mapEntry[1], candidate.current);
  const resB = await sourceB(candidate.program, bill);
  const resC = await sourceC(candidate.program, candidate.current, mapEntry[1]);

  const sourceMap = {
    a: resA?.amount ?? null,
    b: resB?.amount ?? null,
    c: resC?.amount ?? null,
  };

  const xref = crossReference(sourceMap);

  candidate.priorFY      = PRIOR_FY;
  candidate.prior        = xref.priorYear;
  candidate.delta        = xref.priorYear != null ? candidate.current - xref.priorYear : null;
  candidate.deltaPercent = xref.priorYear != null ? Math.round(((candidate.current - xref.priorYear) / xref.priorYear) * 1000) / 10 : null;
  candidate.confidence   = xref.confidence;

  // Single-source large-delta guard: if only 1 source and |delta| > 60%, suppress.
  // Legitimate 60%+ swings should be corroborated by a second source before publishing.
  if (xref.sourceCount === 1 && candidate.deltaPercent != null && Math.abs(candidate.deltaPercent) > 60) {
    candidate.confidence = 'mismatch';
    candidate.suppressReason = `Single-source delta of ${candidate.deltaPercent}% exceeds 60% threshold — needs corroboration`;
    console.log(`      → SUPPRESSED: single-source delta ${candidate.deltaPercent}% too large without corroboration`);
  }
  candidate.sourceCount  = xref.sourceCount;
  candidate.agreeCount   = xref.agreeCount;
  candidate.sources      = {
    a: resA ? { amount: resA.amount, account: resA.account, score: resA.score } : null,
    b: resB ? { amount: resB.amount, tas: resB.tas } : null,
    c: resC ? { amount: resC.amount, document: resC.document, dateIssued: resC.dateIssued } : null,
  };

  const dir = candidate.delta != null ? (candidate.delta >= 0 ? '+' : '') + candidate.deltaPercent + '%' : 'n/a';
  console.log(`      → prior=${fmt(xref.priorYear)} delta=${dir} sources=${xref.sourceCount} agree=${xref.agreeCount} confidence=${xref.confidence}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Bill processing
// ══════════════════════════════════════════════════════════════════════════════

function getBillSources(bill) {
  return [
    ...(bill.changes?.modified || []).map(t => ({ text: t, label: 'changes.modified' })),
    ...(bill.changes?.added    || []).map(t => ({ text: t, label: 'changes.added'    })),
    ...(bill.divisions || []).flatMap(div => [
      ...(div.changes?.modified || []).map(t => ({ text: t, label: `${div.label} [mod]` })),
      ...(div.changes?.added    || []).map(t => ({ text: t, label: `${div.label} [add]` })),
    ]),
  ];
}

async function processBill(bill, programMap, bucket) {
  const sources = getBillSources(bill);
  const output  = { billId: bill.id, generatedAt: new Date().toISOString(), bucket2: [], bucket3: [] };

  // ─── Bucket 2 ─────────────────────────────────────────────────────────────

  if (bucket !== 3) {
    const raw2 = sources.flatMap(s => extractB2Deltas(s.text, s.label));

    // Bill-level dedup (same program + same amounts rounded to $10M)
    const seen2 = new Set();
    const b2 = raw2.filter(d => {
      const key = `${d.program.toLowerCase().replace(/\W+/g,'')}|${Math.round(d.from/1e7)}|${Math.round(d.to/1e7)}`;
      if (seen2.has(key)) return false;
      seen2.add(key); return true;
    });

    if (b2.length) {
      console.log(`\n  Bucket 2: ${b2.length} explicit delta(s)`);
      for (const d of b2) {
        console.log(`    • "${d.program}" ${fmt(d.from)} → ${fmt(d.to)} (${d.deltaPercent > 0 ? '+' : ''}${d.deltaPercent}%)`);
        await delay(DELAY_MS);
        await verifyB2WithUSCode(d);
      }
    }
    output.bucket2 = b2;
  }

  // ─── Bucket 3 ─────────────────────────────────────────────────────────────

  if (bucket !== 2) {
    const raw3 = sources.flatMap(s => extractB3Candidates(s.text, s.label));

    // Bill-level dedup
    const seen3 = new Set();
    const b3Candidates = raw3.filter(d => {
      const key = `${d.program.toLowerCase().replace(/\W+/g,'')}|${Math.round(d.current/1e8)}`;
      if (seen3.has(key)) return false;
      seen3.add(key); return true;
    });

    // Skip programs that already appear in Bucket 2 (we already have the explicit delta)
    const b2Programs = new Set(output.bucket2.map(d => d.program.toLowerCase().replace(/\W+/g,'')));
    // Also deduplicate by map entry — two candidates matching the same map key = same program
    const usedMapKeys = new Set();
    const b3 = b3Candidates.filter(d => {
      if (b2Programs.has(d.program.toLowerCase().replace(/\W+/g,''))) return false;
      // Find matching map key
      const mapKey = Object.keys(programMap).find(k => fuzzyMatch(d.program, k) >= 0.5);
      if (mapKey) {
        if (usedMapKeys.has(mapKey)) return false; // same map entry already queued
        usedMapKeys.add(mapKey);
      }
      return true;
    });

    if (b3.length) {
      console.log(`\n  Bucket 3: ${b3.length} current-amount candidate(s) (after dedup with B2)`);
      for (const d of b3) {
        await verifyB3(d, bill, programMap);
      }
    }
    output.bucket3 = b3.filter(d => d.confidence !== 'skipped' && d.confidence !== 'none');
  }

  return output;
}

// ══════════════════════════════════════════════════════════════════════════════
// Summary + main
// ══════════════════════════════════════════════════════════════════════════════

function printSummary(results) {
  console.log('\n' + '═'.repeat(64));
  console.log('SUMMARY');
  console.log('═'.repeat(64));

  let b2Total = 0, b3Total = 0;
  const confCounts = {};

  for (const r of results) {
    const all = [...r.output.bucket2, ...r.output.bucket3];
    if (!all.length) continue;

    console.log(`\n${r.billId}:`);
    for (const d of all) {
      const bkt  = d.bucket === 2 ? 'B2' : 'B3';
      const conf = d.confidence || '-';
      confCounts[conf] = (confCounts[conf] || 0) + 1;
      if (d.bucket === 2) b2Total++; else b3Total++;

      const publish = ['high','medium','stated'].includes(conf);
      const tag = publish ? '✓' : (conf === 'mismatch' ? '✗' : '?');
      const delta = d.bucket === 2
        ? `${fmt(d.from)} → ${fmt(d.to)}`
        : `prior=${fmt(d.prior)} → current=${fmt(d.current)}`;
      const pct = d.deltaPercent != null ? ` (${d.deltaPercent > 0 ? '+' : ''}${d.deltaPercent}%)` : '';
      console.log(`  [${tag}][${bkt}][${conf.padEnd(8)}] ${d.program}: ${delta}${pct}`);
      if (d.sources) {
        const srcStr = Object.entries(d.sources).filter(([,v])=>v).map(([k,v])=>`${k}=${fmt(v.amount)}`).join(' ');
        if (srcStr) console.log(`              Sources: ${srcStr}`);
      }
    }
  }

  const publishable = (confCounts.high || 0) + (confCounts.medium || 0) + (confCounts.stated || 0);
  const suppressed  = (confCounts.mismatch || 0);
  const uncertain   = (confCounts.low || 0);

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`Bucket 2 (explicit): ${b2Total} | Bucket 3 (inferred): ${b3Total}`);
  console.log(`Publishable: ${publishable} | Uncertain (low): ${uncertain} | Suppressed (mismatch): ${suppressed}`);
  console.log(`Confidence breakdown: ${JSON.stringify(confCounts)}`);
}

async function main() {
  const args     = process.argv.slice(2);
  const targetId = args.find(a => !a.startsWith('--')) || null;
  const bucketArg = (args.find(a => a.startsWith('--bucket=')) || '').replace('--bucket=', '');
  const bucket   = bucketArg === '2' ? 2 : bucketArg === '3' ? 3 : 0; // 0 = both

  if (!fs.existsSync(DELTAS_DIR)) fs.mkdirSync(DELTAS_DIR, { recursive: true });

  const cache      = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  const programMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  let   bills      = cache.bills;

  if (targetId) {
    bills = bills.filter(b => b.id === targetId);
    if (!bills.length) { console.error(`Bill ${targetId} not found`); process.exit(1); }
  }

  // Pre-filter: only bills that have any dollar amounts in change text
  const AMT_RE = /\$[\d,.]+\s*[TBMK]B?/i;
  const candidates = bills.filter(bill => {
    const texts = [
      ...(bill.changes?.modified || []),
      ...(bill.changes?.added    || []),
      ...(bill.divisions || []).flatMap(d => [...(d.changes?.modified || []), ...(d.changes?.added || [])]),
    ];
    return texts.some(t => AMT_RE.test(t));
  });

  console.log(`\nProcessing ${candidates.length} bill(s) with dollar amounts in change text`);
  console.log(`Buckets: ${bucket === 0 ? 'both 2+3' : 'bucket ' + bucket} | Prior FY: ${PRIOR_FY}`);

  const results = [];

  for (const bill of candidates) {
    console.log(`\n${'─'.repeat(64)}`);
    console.log(`${bill.id} — ${(bill.title||'').slice(0,55)}`);
    console.log('─'.repeat(64));

    const output = await processBill(bill, programMap, bucket);
    const outPath = path.join(DELTAS_DIR, `${bill.id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

    const b2pub = output.bucket2.filter(d => ['high','medium','stated'].includes(d.confidence)).length;
    const b3pub = output.bucket3.filter(d => ['high','medium'].includes(d.confidence)).length;
    console.log(`\n  Saved → data/deltas/${bill.id}.json (B2: ${output.bucket2.length} | B3: ${output.bucket3.length} | Publishable: ${b2pub + b3pub})`);

    results.push({ billId: bill.id, output });
  }

  printSummary(results);
}

main().catch(e => { console.error(e); process.exit(1); });
