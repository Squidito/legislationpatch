#!/usr/bin/env node
// test-quote-link.js -- teeth for the SECOND quote linker (lib/quote-link.js).
//
// WHY THIS EXISTS: attributeQuotesToBills re-runs over the whole quote corpus on
// every `npm run reps` / `npm run batch:post`. When it was a keyword scorer it
// silently re-created mislinks that a human had already reverted to null -- twice
// (2026-08-12 "kids" -> KIDS Act; 2026-08-27 Grassley-on-socialism -> RESULTS Act).
// A regression here does not fail loudly; it publishes a false attribution.
//
// Method: carry the OLD keyword scorer as a frozen fixture, run BOTH linkers over
// the real stored inputs (data/quotes.json + data/cache.json, read-only), and
// assert the old one still reproduces the Grassley mislink while the new one
// refuses it. Plus unit cases for each accept/reject branch of the new rule.
//
// Zero dependencies, no network, nothing written:
//   node scripts/test-quote-link.js      (or: npm run quotes:link:test)

'use strict';

const fs   = require('fs');
const path = require('path');
const { attributeQuotesToBills } = require('./lib/quote-link');

const ROOT = path.join(__dirname, '..');
let passes = 0, failures = 0, skipped = 0;

function check(desc, cond, extra) {
  if (cond) { passes++; console.log('  ok    ' + desc); return true; }
  failures++;
  console.error('  FAIL  ' + desc + (extra ? '\n          ' + extra : ''));
  return false;
}

// -- The OLD scorer, frozen verbatim as it stood at commit d87966f7 -------------
// Not dead code: it is the reproduction. If it ever stops re-creating the mislink
// the fixture has drifted and the "new code refuses it" result proves nothing.
const OLD_STOP_WORDS = new Set([
  'the','a','an','of','in','to','and','or','is','are','was','were','for','that','this',
  'with','from','has','have','be','will','by','on','at','as','not','but','its','it',
  'we','our','their','they','he','she','who','which','all','any','can','do','did','if',
  'so','no','up','out','more','been','had','than','when','what','how','also','each',
  'some','other','these','those','into','would','should','could','may','must','about',
  'after','before','between','through','during','over','under','same','both','such',
  'own','new','per','just','very','now','only','then','them','her','his','him','said',
  'get','got','one','two','three','four','five','six','seven','eight','nine','ten',
  'american','america','national','federal','government','congress','congressional',
  'senate','house','senator','representative','member','members','legislation',
  'bill','bills','act','acts','law','laws','section','title','provides','provided',
  'united','states','people','public','policy','political','president','administration',
  'security','services','program','programs','funding','funds','fund','million','billion',
  'percent','under','year','years','fiscal','budget','appropriations','appropriation',
  'department','agency','agencies','office','committee','floor','statement','vote',
  'republican','republicans','democrat','democrats','bipartisan','majority','minority',
]);
const oldKeywords = text => !text ? [] : text.toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
  .filter(w => w.length >= 4 && !OLD_STOP_WORDS.has(w));
function oldBillKeywords(bill) {
  const kw = new Map();
  const add = (t, w) => oldKeywords(t).forEach(x => kw.set(x, Math.max(kw.get(x) || 0, w)));
  add(bill.title, 4); add(bill.summary, 2); add(bill.brief, 2);
  (bill.top_lines || []).forEach(tl => {
    add(typeof tl === 'string' ? tl : tl.headline, 2);
    (tl.subs || []).forEach(s => add(s, 1));
  });
  (bill.sections || []).forEach(s => {
    add(s.label, 1); (s.items || []).forEach(i => add(i.main, 1));
  });
  return kw;
}
function oldAttribute(quotes, bills) {
  const index = bills.map(b => ({ id: b.id, title: b.title, kw: oldBillKeywords(b) }));
  const linked = [];
  for (const q of quotes) {
    if (q.billId) continue;
    const words = new Set(oldKeywords(q.text));
    let best = null, bestScore = 0;
    for (const b of index) {
      let score = 0;
      for (const [term, weight] of b.kw) if (words.has(term)) score += weight;
      if (score > bestScore) { bestScore = score; best = b; }
    }
    const matchCount = best ? [...best.kw.keys()].filter(k => words.has(k)).length : 0;
    if (bestScore >= 6 && matchCount >= 2 && best) linked.push({ q, id: best.id, score: bestScore });
  }
  return linked;
}

// -- Fixture: the real stored corpus, loaded read-only and deep-copied ----------
console.log('\nQuote-linker teeth\n');

const cachePath  = path.join(ROOT, 'data/cache.json');
const quotesPath = path.join(ROOT, 'data/quotes.json');
let bills = null, storedQuotes = null;
try {
  const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  bills = Array.isArray(raw.bills) ? raw.bills : Object.values(raw.bills || {});
  storedQuotes = JSON.parse(fs.readFileSync(quotesPath, 'utf8')).quotes || [];
} catch (e) {
  console.log('  skip  corpus fixture unavailable (' + e.message + ')');
  skipped++;
}

// The 2026-08-27 defect, by its stored identity. Grassley's 2026-07-21 Senate
// floor statement on socialism must stay unlinked: it names no bill by number.
const GRASSLEY_KEY = 'With recent political victories in Democrat primaries';

if (bills && storedQuotes) {
  const target = storedQuotes.find(q => (q.text || '').startsWith(GRASSLEY_KEY));
  // Skip, never fail, when the fixture is gone or has been deliberately linked by
  // a human -- a live data file must not be able to break an unrelated commit
  // (same live-fixture reasoning that kept tracker:gate:test out of pre-commit).
  // The unit cases below still exercise every branch of the rule with no corpus.
  if (!target) {
    console.log('  skip  Grassley 2026-07-21 fixture quote not in data/quotes.json');
    skipped++;
  } else if (target.billId) {
    console.log('  skip  Grassley fixture now carries billId ' + target.billId +
                ' — verify that link is deliberate, then update this fixture');
    skipped++;
  } else {
    // 1. The OLD code still reproduces the mislink from stored inputs.
    const oldLinks = oldAttribute(JSON.parse(JSON.stringify(storedQuotes)), bills);
    const oldHit = oldLinks.find(l => (l.q.text || '').startsWith(GRASSLEY_KEY));
    check('OLD keyword scorer re-creates the Grassley -> 119-HR-5269 mislink',
      !!oldHit && oldHit.id === '119-HR-5269',
      oldHit ? 'linked to ' + oldHit.id : 'old scorer produced no link -- fixture drifted');

    // 2. The NEW rule refuses it.
    const copy = JSON.parse(JSON.stringify(storedQuotes));
    const added = attributeQuotesToBills(copy, bills, '119', null);
    const newHit = copy.find(q => (q.text || '').startsWith(GRASSLEY_KEY));
    check('NEW explicit-citation rule refuses the Grassley quote (stays null)',
      !newHit.billId, 'linked to ' + newHit.billId);

    // 3. Nothing already linked is ever re-pointed, and every NEW link the rule
    //    makes is backed by an explicit citation in the record it read.
    const repointed = copy.filter((q, i) => storedQuotes[i].billId && q.billId !== storedQuotes[i].billId);
    check('no existing attribution is re-pointed', repointed.length === 0,
      repointed.length + ' quote(s) changed');
    const fresh = copy.filter((q, i) => !storedQuotes[i].billId && q.billId);
    check('every new link cites its bill by number in heading or quote text',
      fresh.every(q => {
        const num = q.billId.split('-').pop();
        return new RegExp('\\b' + num + '\\b').test((q.granuleTitle || '') + ' ' + (q.text || ''));
      }),
      fresh.map(q => q.billId).join(', '));
    const unlinked = storedQuotes.filter(q => !q.billId).length;
    console.log('        (new rule attributed ' + added + ' of ' + unlinked + ' unlinked quotes)');
  }
}

// -- Unit cases: each branch of the rule, no corpus needed ----------------------
const B = [
  { id: '119-HR-5269', title: 'RESULTS Act' },
  { id: '119-S-1748',  title: 'Kids Online Safety Act' },
];
const run = q => { const a = [q]; attributeQuotesToBills(a, B, '119', null); return a[0].billId || null; };

check('links on a sole explicit citation in the quote text',
  run({ text: 'I rise in support of H.R. 5269, the RESULTS Act.' }) === '119-HR-5269');
check('links on a sole explicit citation in the debate heading',
  run({ text: 'I yield back.', granuleTitle: 'RESULTS ACT--H.R. 5269' }) === '119-HR-5269');
check('heading outranks the quote text when both cite',
  run({ text: 'as with S. 1748 last week', granuleTitle: 'H.R. 5269' }) === '119-HR-5269');
check('refuses when two cached bills are cited (ambiguous)',
  run({ text: 'H.R. 5269 and S. 1748 both matter here.' }) === null);
check('refuses on thematic overlap alone -- the Grassley class',
  run({ text: 'socialism has produced the failed results that we have witnessed for decades' }) === null);
check('refuses on a title-word match with no number -- the KIDS Act class',
  run({ text: 'our kids deserve better online safety than this' }) === null);
check('refuses a citation to a bill that is not cached',
  run({ text: 'I support H.R. 99999, a fine bill.' }) === null);
check('never overwrites an existing billId',
  run({ text: 'H.R. 5269 is the subject', billId: '119-S-1748' }) === '119-S-1748');
check('"U.S. 50" is not read as S. 50 (lookbehind guard)',
  run({ text: 'along U.S. 50 in my district' }) === null);

console.log('\n' + passes + ' passed, ' + failures + ' failed, ' + skipped + ' skipped\n');
process.exit(failures ? 1 : 0);
