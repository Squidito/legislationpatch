#!/usr/bin/env node
// test-tracker-gate.js -- hostile-corruption tests for scripts/tracker-gate.js.
//
// WHY THIS EXISTS: the tracker gate guards the highest-risk content on the site
// (a contested position attributed to a named organization or person). Every
// change to it carries the same risk -- that a fix aimed at a false POSITIVE
// quietly opens a false NEGATIVE. The standing bar is "a gate change that is not
// re-proven is not done"; this file is that re-proof, scripted so it can be re-run
// in a second instead of reconstructed by hand each time.
//
// Method: take the LIVE audited tracker articles as clean fixtures, confirm they
// pass, then corrupt each one in memory -- fabricate a quote, flip the heading
// order, delete a sign-off, unbalance a quote mark, backdate the staleness
// horizon -- and assert the gate BLOCKS on the specific check that owns that
// corruption. A corruption that passes is a hole in the gate.
//
// Zero dependencies, no network, no temp files, nothing written:
//   node scripts/test-tracker-gate.js            (or: npm run tracker:gate:test)
//
// Fixtures are skipped (with a printed note) when an article or its ledger is
// absent -- a missing fixture is not a weakened gate. Everything else fails hard.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { runGate, bothSidesSection } = require('./tracker-gate.js');

const ROOT = path.join(__dirname, '..');
const FIXTURES = ['ndaa-fy2027', 'save-america-act'];

// A sentence that appears in no stored source, by construction.
const FABRICATED = 'this sentence was never spoken by anyone and appears in no stored source at all';

let passes = 0;
let failures = 0;
let skipped = 0;

function check(desc, cond, extra) {
  if (cond) { passes++; console.log('  ok    ' + desc); return true; }
  failures++;
  console.error('  FAIL  ' + desc + (extra ? '\n          ' + extra : ''));
  return false;
}

function load(slug) {
  const htmlPath = path.join(ROOT, 'articles', slug + '.html');
  const ledgerPath = path.join(ROOT, 'data', 'qa-ledger', 'article-' + slug + '.json');
  if (!fs.existsSync(htmlPath) || !fs.existsSync(ledgerPath)) return null;
  return {
    slug,
    html: fs.readFileSync(htmlPath, 'utf8'),
    ledger: JSON.parse(fs.readFileSync(ledgerPath, 'utf8')),
  };
}

const clone = o => JSON.parse(JSON.stringify(o));

/** Splice a rewritten both-sides section back into the full article html. */
function withSection(html, newSection) {
  const s = bothSidesSection(html);
  if (!s.present) throw new Error('fixture has no both-sides section');
  return html.replace(s.html, () => newSection);
}

/** Assert the gate blocks, and that the named check is the one that failed. */
function blocks(desc, res, checkName) {
  const r = res.results.find(x => x.name === checkName);
  const detail = res.results.filter(x => !x.ok).map(x => x.name).join(', ') || '(nothing failed)';
  return check(desc, res.pass === false && r && r.ok === false, 'gate pass=' + res.pass + '; failing checks: ' + detail);
}

// ---------------------------------------------------------------------------
console.log('\ntracker-gate hostile-corruption tests\n');

for (const slug of FIXTURES) {
  const fx = load(slug);
  if (!fx) { skipped++; console.log('SKIP ' + slug + ' (article or ledger absent)\n'); continue; }

  const section = bothSidesSection(fx.html);
  console.log(slug + ':');

  // -- baseline -------------------------------------------------------------
  const base = runGate({ html: fx.html, ledger: fx.ledger });
  const baseOk = check('clean fixture passes all ' + base.results.length + ' checks', base.pass === true,
    base.results.filter(r => !r.ok).map(r => r.name + ': ' + r.detail).join(' | '));
  if (!baseOk) { console.log(''); continue; }

  // -- 1. fabricated quote --------------------------------------------------
  // Replace the inner text of the first long quoted span with words no source carries.
  {
    const m = section.html.match(/(["\u201C])([^"\u201C\u201D]{20,})(["\u201D])/);
    if (!check('fixture has a long quoted span to corrupt', !!m)) { console.log(''); continue; }
    const corrupt = section.html.replace(m[0], () => m[1] + FABRICATED + m[3]);
    blocks('fabricated quote is BLOCKED', runGate({ html: withSection(fx.html, corrupt), ledger: fx.ledger }), 'quotes-stored');
  }

  // -- 2. fabricated quote sitting next to a SHORT quoted term ---------------
  // The pairing fix consumes sub-floor spans without checking them. This proves
  // a short term cannot be used to launder a fabricated quote beside it.
  {
    const inject = '<p>Rep. Rogers called it a "MIRV" and said "' + FABRICATED + '."</p>';
    const corrupt = section.html.replace('</p>', () => '</p>' + inject);
    blocks('fabricated quote adjacent to a short quoted term is BLOCKED',
      runGate({ html: withSection(fx.html, corrupt), ledger: fx.ledger }), 'quotes-stored');
  }

  // -- 3. quote laundered across a paragraph boundary ------------------------
  // An opening mark in one block and a closing mark in the next must never pair.
  {
    const inject = '<p>He said "' + FABRICATED + '</p><p>and that was that."</p>';
    const corrupt = section.html.replace('</p>', () => '</p>' + inject);
    blocks('quote spanning a paragraph boundary is BLOCKED',
      runGate({ html: withSection(fx.html, corrupt), ledger: fx.ledger }), 'quotes-stored');
  }

  // -- 4. unbalanced quote mark ---------------------------------------------
  {
    const m = section.html.match(/(["\u201C])([^"\u201C\u201D]{20,})(["\u201D])/);
    const corrupt = section.html.replace(m[0], () => m[1] + m[2]);   // closing mark deleted
    blocks('unbalanced quote mark is BLOCKED',
      runGate({ html: withSection(fx.html, corrupt), ledger: fx.ledger }), 'quotes-stored');
  }

  // -- 5. flipped heading order (opponents first) ---------------------------
  {
    const h3s = [...section.html.matchAll(/<h3[^>]*>[\s\S]*?<\/h3>/g)].map(x => x[0]);
    const sup = h3s.find(h => /\b(support|back|voted for|for the bill)/i.test(h));
    const opp = h3s.find(h => /\b(oppos|object|voted no|against|vote no)/i.test(h));
    if (check('fixture has both a supporter and an opponent heading', !!sup && !!opp)) {
      const corrupt = section.html.replace(sup, () => '@@SUP@@').replace(opp, () => sup).replace('@@SUP@@', () => opp);
      blocks('opponent heading placed first is BLOCKED',
        runGate({ html: withSection(fx.html, corrupt), ledger: fx.ledger }), 'supporters-first');
    }
  }

  // -- 6. asymmetric / doubting verb ----------------------------------------
  {
    const corrupt = section.html.replace('</p>', () => '</p><p>Rep. Rogers acknowledges the criticism.</p>');
    blocks('asymmetric verb (acknowledges) is BLOCKED',
      runGate({ html: withSection(fx.html, corrupt), ledger: fx.ledger }), 'verb-symmetry');
  }

  // -- 7. named position-holder with no stored source ------------------------
  {
    const corrupt = section.html.replace('</p>', () => '</p><p>Sen. Zzyzxby argued the measure went too far.</p>');
    blocks('unsourced named holder is BLOCKED',
      runGate({ html: withSection(fx.html, corrupt), ledger: fx.ledger }), 'named-holders-stored');
  }

  // -- 8. deleted ledger sign-offs ------------------------------------------
  for (const field of ['supporterLens', 'opponentLens', 'stripTest', 'vehicleBill']) {
    const led = clone(fx.ledger);
    delete led.bothSidesReview[field];
    blocks('deleted ' + field + ' sign-off is BLOCKED',
      runGate({ html: fx.html, ledger: led }), 'dual-lens-recorded');
  }
  {
    const led = clone(fx.ledger);
    delete led.verifyModel;
    blocks('deleted cross-model verifyModel is BLOCKED', runGate({ html: fx.html, ledger: led }), 'dual-lens-recorded');
  }
  {
    const led = clone(fx.ledger);
    delete led.bothSidesReview.eligibility;
    blocks('deleted eligibility rationale is BLOCKED', runGate({ html: fx.html, ledger: led }), 'eligibility-recorded');
  }
  {
    const led = clone(fx.ledger);
    delete led.bothSidesReview;
    blocks('deleted bothSidesReview block entirely is BLOCKED', runGate({ html: fx.html, ledger: led }), 'dual-lens-recorded');
  }

  // -- 9. staleness horizon --------------------------------------------------
  // Backdate the as-of horizon behind a referenced bill's movement: the gate must
  // block. Then move it to the movement date itself: it must clear. This is the
  // check the --refresh ordering fix depends on, so it is proven in both directions.
  {
    const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache.json'), 'utf8'));
    const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});
    const byId = new Map(bills.map(b => [b.id, b.stageDate || b.date || '']));
    const CODE_TYPE = { HR: 'HR', H: 'HR', S: 'S', HRES: 'HRES', SRES: 'SRES', HJRES: 'HJRES', SJRES: 'SJRES', HCONRES: 'HCONRES', SCONRES: 'SCONRES' };
    const codeRe = /\b(H\.?\s?R\.|H\.?\s?J\.?\s?Res\.|H\.?\s?Con\.?\s?Res\.|H\.?\s?Res\.|S\.?\s?J\.?\s?Res\.|S\.?\s?Con\.?\s?Res\.|S\.?\s?Res\.|S\.)\s?(\d{1,5})\b/g;
    const dates = [];
    let mm;
    while ((mm = codeRe.exec(fx.html)) !== null) {
      const t = CODE_TYPE[mm[1].toUpperCase().replace(/[^A-Z]/g, '')];
      const d = t ? byId.get('119-' + t + '-' + mm[2]) : null;
      if (d) dates.push(d);
    }
    const latest = dates.sort().pop();
    if (!latest) {
      skipped++;
      console.log('  skip  staleness (no referenced bill is in cache.json for this article)');
    } else {
      const dayBefore = new Date(new Date(latest + 'T12:00:00').getTime() - 86400000).toISOString().slice(0, 10);
      blocks('as-of behind a referenced bill movement (' + dayBefore + ' vs ' + latest + ') is BLOCKED',
        runGate({ html: fx.html, ledger: fx.ledger, asOf: dayBefore }), 'staleness');
      const onDay = runGate({ html: fx.html, ledger: fx.ledger, asOf: latest });
      check('as-of ON the movement date (' + latest + ') clears staleness -- the --refresh case',
        onDay.results.find(r => r.name === 'staleness').ok === true,
        onDay.results.find(r => r.name === 'staleness').detail);
    }
  }

  console.log('');
}

// -- 10. short quoted terms do NOT produce false positives -------------------
// The regression that motivated the pairing fix: a sub-floor quoted term used to
// leave its closing mark to pair with the NEXT quote's opening mark, flagging the
// innocent prose between them. Rebuild that exact shape and require a clean pass.
{
  console.log('pairing regression (short quoted terms must not false-positive):');
  const fx = load('ndaa-fy2027');
  if (!fx) { skipped++; console.log('  skip  (ndaa-fy2027 fixture absent)\n'); }
  else {
    const s = bothSidesSection(fx.html);
    // Restore the natural double-quoted style for the two short terms the NDAA
    // refresh had to restyle with single quotes as a workaround.
    let corrupt = s.html
      .replace("called a 'MIRV'", () => 'called a "MIRV"')
      .replace("a 'shell game'", () => 'a "shell game"');
    const changed = corrupt !== s.html;
    check('workaround-free short terms found in the fixture', changed,
      'the single-quote workaround is gone from the article -- update this test to build the shape synthetically');
    if (!changed) {
      // Fall back to a synthetic shape so the regression is still proven.
      corrupt = s.html.replace('</p>', () => '</p><p>He called it a "MIRV" and Rogers said "We must take action to address these problems before American deterrence erodes any further," afterward.</p>');
    }
    const res = runGate({ html: withSection(fx.html, corrupt), ledger: fx.ledger });
    check('short quoted terms next to long sourced quotes still PASS',
      res.pass === true,
      res.results.filter(r => !r.ok).map(r => r.name + ': ' + r.detail).join(' | '));
    const q = res.results.find(r => r.name === 'quotes-stored');
    check('the short spans are reported as consumed-but-not-checked',
      /consumed for pairing, not source-checked/.test(q.detail), q.detail);
    console.log('');
  }
}

// -- 11. CLI bounds on --as-of ----------------------------------------------
// --as-of can only ever assert currency as of a date that has happened. A future
// date would silence a real bill advance, so the CLI must refuse it outright.
{
  console.log('--as-of CLI bounds:');
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'tracker-gate.js'), '--slug', 'ndaa-fy2027', ...a],
    { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  const future = run('--as-of', '2099-01-01');
  check('future --as-of is refused (exit 2)', future.status === 2, 'exit=' + future.status + ' ' + (future.stderr || '').trim());
  const junk = run('--as-of', 'yesterday');
  check('malformed --as-of is refused (exit 2)', junk.status === 2, 'exit=' + junk.status + ' ' + (junk.stderr || '').trim());
  const good = run('--as-of', '2026-08-26');
  check('valid past --as-of runs the gate', good.status === 0 || good.status === 1, 'exit=' + good.status);
  console.log('');
}

// ---------------------------------------------------------------------------
console.log('-'.repeat(64));
console.log('  ' + passes + ' passed, ' + failures + ' failed' + (skipped ? ', ' + skipped + ' skipped' : ''));
if (failures) {
  console.error('\n  TRACKER-GATE TEETH TEST FAILED -- a corruption the gate is supposed to block got through.\n');
  process.exit(1);
}
console.log('  tracker-gate teeth confirmed\n');
