#!/usr/bin/env node
// qa-injection-generate.js — build labeled error-injection FIXTURES (the "fire drill").
// Deterministic, ZERO LLM cost. Plants ONE known error per fixture into a currently-clean
// bill's analysis, so the hostile auditor's catch-rate (recall) can later be measured.
//
//   npm run qa-inject               → write fixtures to data/qa-injection/
//   npm run qa-inject -- --n 4        → up to 4 fixtures per error type
//
// Flow: (1) generate fixtures here [free] → (2) run the hostile auditor on each fixture's
// mutated analysis vs its unchanged source, recording flags in data/qa-injection/_results.json
// [one scoped LLM pass] → (3) `npm run qa-inject:score` computes recall per error class [free].
// A class the audit misses = a hole in the rubric.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEDGER_DIR = path.join(ROOT, 'data', 'qa-ledger');
const CACHE = path.join(ROOT, 'data', 'cache.json');
const OUT = path.join(ROOT, 'data', 'qa-injection');
const N = (() => { const i = process.argv.indexOf('--n'); return i >= 0 ? parseInt(process.argv[i + 1], 10) || 3 : 3; })();

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }

// opposite-word pairs for a direction inversion (each side maps to the other)
const FLIPS = [['increase', 'decrease'], ['increases', 'decreases'], ['increased', 'decreased'],
  ['expand', 'restrict'], ['expands', 'restricts'], ['broadens', 'narrows'], ['broaden', 'narrow'],
  ['permanent', 'temporary'], ['mandatory', 'discretionary'], ['raise', 'lower'], ['raises', 'lowers'],
  ['extend', 'shorten'], ['extends', 'shortens'], ['adds', 'removes'], ['repeals', 'enacts'],
  ['more', 'fewer'], ['maximum', 'minimum'], ['prohibits', 'requires'], ['expanding', 'restricting']];
const QUALIFIERS = [['not less than', 'not more than'], ['at least', 'at most'], ['no later than', 'no earlier than'],
  ['may not', 'may'], [' shall ', ' may '], [' must ', ' may ']];

// walk the audited prose fields → [{path, text}] (only substantive string fields)
function strings(bill) {
  const out = [];
  const push = (p, t) => { if (typeof t === 'string' && t.length > 20) out.push({ path: p, text: t }); };
  push('summary', bill.summary); push('brief', bill.brief); push('likelihoodReason', bill.likelihoodReason);
  (bill.top_lines || []).forEach((tl, i) => (tl.subs || []).forEach((s, j) => push(`top_lines[${i}].subs[${j}]`, s)));
  (bill.sections || []).forEach((sec, i) => (sec.items || []).forEach((it, j) => { push(`sections[${i}].items[${j}].main`, it.main); push(`sections[${i}].items[${j}].detail`, it.detail); }));
  ['added', 'modified', 'removed'].forEach(k => (bill.changes && bill.changes[k] || []).forEach((c, i) => push(`changes.${k}[${i}]`, c)));
  return out;
}

// find the first viable mutation of a given type in a bill; return {path, before, after} or null
function mutate(bill, type) {
  const ss = strings(bill);
  if (type === 'direction') {
    for (const { path: p, text } of ss) for (const [a, b] of FLIPS) {
      const re = new RegExp('\\b' + a + '\\b', 'i');
      if (re.test(text)) return { path: p, before: text.match(re)[0], after: b };
    }
  } else if (type === 'qualifier') {
    for (const { path: p, text } of ss) for (const [a, b] of QUALIFIERS) {
      const idx = text.toLowerCase().indexOf(a.toLowerCase());
      if (idx >= 0) return { path: p, before: text.substr(idx, a.length), after: b.trim() === '' ? b : (text.substr(idx, a.length).length === a.length ? b : b) };
    }
  } else if (type === 'figure') {
    for (const { path: p, text } of ss) {
      // $ amounts, percentages, day/year counts, standalone integers
      let m = text.match(/\$\d[\d,]*(?:\.\d+)?[MB]?/);
      if (m) { const v = m[0]; const bumped = v.replace(/(\d[\d,]*(?:\.\d+)?)/, n => (Math.round((parseFloat(n.replace(/,/g, '')) || 1) * 2.5) || 7).toString()); return { path: p, before: v, after: bumped }; }
      m = text.match(/\b(\d{1,3})\s?(percent|%)/i);
      if (m) { const bumped = (parseInt(m[1], 10) + 15) + m[0].slice(m[1].length); return { path: p, before: m[0], after: bumped }; }
      m = text.match(/\b(19|20)\d{2}\b/);
      if (m) { return { path: p, before: m[0], after: (parseInt(m[0], 10) - 3).toString() }; }
      m = text.match(/\b(\d{1,4})\s?(days?|months?|years?)\b/i);
      if (m) { const bumped = (parseInt(m[1], 10) * 2) + m[0].slice(m[1].length); return { path: p, before: m[0], after: bumped }; }
    }
  }
  return null;
}

// candidate clean bills: full-claims ledgers with 0 material errors
const cacheRaw = readJson(CACHE, { bills: [] });
const cacheBills = Array.isArray(cacheRaw) ? cacheRaw : (cacheRaw.bills || []);
const byId = {}; for (const b of cacheBills) byId[b.id || b.billId] = b;
const clean = [];
for (const f of fs.readdirSync(LEDGER_DIR)) {
  if (!f.endsWith('.json') || f.startsWith('_')) continue;
  const l = readJson(path.join(LEDGER_DIR, f), null);
  if (l && l.depth === 'full-claims' && l.status === 'audited' && l.counts && l.counts.material === 0 && byId[l.id]) clean.push(l.id);
}
clean.sort();

if (fs.existsSync(OUT)) {
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.json')) fs.unlinkSync(path.join(OUT, f));
} else {
  fs.mkdirSync(OUT, { recursive: true });
}

const manifest = [];
for (const type of ['direction', 'figure', 'qualifier']) {
  let made = 0;
  for (const id of clean) {
    if (made >= N) break;
    if (manifest.some(m => m.billId === id)) continue;   // one injection per bill, keeps fixtures independent
    const mut = mutate(byId[id], type);
    if (!mut || mut.before === mut.after) continue;
    const fixtureId = `${type}-${id}`;
    const fx = { fixtureId, billId: id, injectedType: type, path: mut.path, before: mut.before, after: mut.after,
      note: `Reconstruct: in ${id}'s analysis field ${mut.path}, replace "${mut.before}" with "${mut.after}", then audit vs source. The auditor SHOULD flag ${mut.path} as a ${type} error.` };
    fs.writeFileSync(path.join(OUT, fixtureId + '.json'), JSON.stringify(fx, null, 2) + '\n');
    manifest.push(fx); made++;
  }
}
fs.writeFileSync(path.join(OUT, '_manifest.json'), JSON.stringify({ generatedFrom: clean.length + ' clean bills', count: manifest.length, fixtures: manifest }, null, 2) + '\n');

console.log(`\n  qa-injection: wrote ${manifest.length} fixture(s) to data/qa-injection/ (from ${clean.length} clean bills)`);
const byType = {}; manifest.forEach(m => byType[m.injectedType] = (byType[m.injectedType] || 0) + 1);
console.log('  by type: ' + Object.entries(byType).map(([t, n]) => `${t}=${n}`).join('  '));
manifest.forEach(m => console.log(`    ${m.fixtureId}: ${m.path}  "${m.before}" → "${m.after}"`));
console.log('\n  NEXT: run the hostile auditor on each fixture (mutated analysis vs unchanged source), record');
console.log('  which it flagged in data/qa-injection/_results.json as {"<fixtureId>": {"caught": true|false}}, then: npm run qa-inject:score\n');
