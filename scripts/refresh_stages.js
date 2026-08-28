// refresh_stages.js — re-check already-cached bills for status progress.
//
// The fetch pipeline only fetches bills NOT already in cache, so a cached bill
// that advances between chambers (or gets signed/fails) goes stale: it keeps its
// old stage and old stageDate, so it never resurfaces. This script closes that gap.
//
// For every cached NON-FINAL bill (not signed/vetoed/dead), it re-fetches the
// Congress.gov actions and:
//   • RESURFACES it — bumps stageDate to the latest action date — if it had ANY
//     new activity since we last looked (this is what moves it back to the top,
//     since the home list sorts by stageDate descending).
//   • ADVANCES the stage (stage/stageLabel/currentStep) when a confident passage
//     marker shows it moved forward (passed a chamber, passed both, signed) or
//     died on the floor.
//
// Stage is derived from Congress.gov's canonical "Passed/agreed to in [Chamber]"
// markers — NOT the latest-action string — so the "Received in the Senate" = Passed
// House trap (which mislabels via detectStage) is avoided.
//
// likelihood / likelihoodReason PROSE is never auto-edited (it is written at
// analysis time and drifts). Any bill whose stage advances is printed in a
// RE-REVIEW list, and bumping stageDate past analyzedAt makes validate-batch's
// freshness guard flag it too.
//
// Usage:
//   node scripts/refresh_stages.js                 dry run, all cached non-final bills
//   node scripts/refresh_stages.js --apply         write the changes
//   node scripts/refresh_stages.js --bill 119-HR-4238 [--apply]   one bill (any stage)

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { fetchBillActions } = require('./lib/congress-api.js');

const KEY   = process.env.CONGRESS_API_KEY;
const CACHE = path.join(__dirname, '../data/cache.json');
const APPLY = process.argv.includes('--apply');
const ONE   = (() => { const i = process.argv.indexOf('--bill'); return i >= 0 ? process.argv[i + 1] : null; })();

const FINAL = new Set(['signed', 'vetoed', 'dead']);

// Unified + paginated in scripts/lib/congress-api.js (fixes the old 250-action
// single-page cap). Same contract: Array on success, [] on 404, null on failure.
const fetchActions = (congress, type, number) => fetchBillActions(congress, type, number, { pace: 1500 });

// Furthest milestone reached, from the full actions list. Shared with
// fetch_bills_data.js since 2026-08-27 -- it used to guess the stage from the
// latest-action STRING alone, which is how a Senate-passed bill whose latest
// action is "Held at the desk." read as Introduced. See lib/stage.js.
const { deriveProgress } = require('./lib/stage.js');

const latestActionDate = actions => actions.reduce((d, a) => ((a.actionDate || '') > d ? a.actionDate : d), '');

function cachedRank(b) {
  if (b.stage === 'signed') return 4;
  if (b.stage === 'dead' || b.stage === 'vetoed') return -1;
  return typeof b.currentStep === 'number' ? b.currentStep : 0;
}

(async () => {
  if (!KEY) { console.error('Missing CONGRESS_API_KEY in .env'); process.exit(1); }
  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));

  let bills = cache.bills.filter(b => !ONE || b.id === ONE);
  if (!ONE) bills = bills.filter(b => !FINAL.has(b.stage)); // skip terminal bills unless one is named
  if (ONE && !bills.length) { console.error(`Bill ${ONE} not in cache.`); process.exit(1); }

  console.log(`\n=== REFRESH STAGES — ${bills.length} bill(s) ${APPLY ? '(APPLY — writing changes)' : '(dry run — no changes)'} ===\n`);

  const advanced = [], resurfaced = [], died = [], failedFetch = [];

  for (const b of bills) {
    const [congress, type, number] = b.id.split('-');
    if (!number) continue;
    const originHouse = /^H/i.test(type);

    const actions = await fetchActions(congress, type, number);
    if (actions === null) { failedFetch.push(b.id); console.log(`  ?  ${b.id.padEnd(15)} fetch failed — left unchanged`); continue; }
    if (!actions.length) continue;

    const p       = deriveProgress(actions, originHouse);
    const newDate = latestActionDate(actions);
    const rank    = cachedRank(b);

    // Died on the floor (failed, no passage) — only if not already terminal
    if (p.failed && !p.signed && p.rank < 2 && !FINAL.has(b.stage)) {
      died.push({ id: b.id, from: b.stageLabel || b.stage, text: (p.failed.text || '').slice(0, 70) });
      if (APPLY) {
        b.stage = 'dead';
        b.stageLabel = p.failed.chamber === 'Senate' ? 'Failed in Senate' : 'Failed in House';
        b.currentStep = 1;
        if (newDate) b.stageDate = newDate;
      }
      continue;
    }

    if (p.rank > rank) {
      advanced.push({ id: b.id, from: b.stageLabel || b.stage, to: p.label, date: newDate, signed: !!p.signed });
      if (APPLY) {
        b.stage = p.stage; b.stageLabel = p.label; b.currentStep = p.step;
        if (newDate) b.stageDate = newDate;
        if (p.signed && !b.enactedDate) b.enactedDate = newDate;
        // The bill advanced past the version it was analyzed against — its text on
        // disk and its prose are now stale. Queue it for re-fetch-latest + re-analysis
        // (surfaced by run-batch; cleared when analyzedAt is re-stamped past stageDate).
        b.needsReanalysis = true;
      }
    } else if (newDate && newDate > (b.stageDate || '')) {
      resurfaced.push({ id: b.id, stage: b.stageLabel || b.stage, from: b.stageDate || '(none)', to: newDate });
      if (APPLY) b.stageDate = newDate;
    }
  }

  // ---- Report ----
  const line = '─'.repeat(60);
  if (advanced.length) {
    console.log(`\n▲ ADVANCED (${advanced.length}) — stage moved forward:`);
    advanced.forEach(a => console.log(`   ${a.id.padEnd(15)} ${a.from}  →  ${a.to}   (${a.date})${a.signed ? '  ★ ENACTED' : ''}`));
  }
  if (died.length) {
    console.log(`\n✖ DIED (${died.length}) — failed on the floor:`);
    died.forEach(d => console.log(`   ${d.id.padEnd(15)} ${d.from}  →  failed   "${d.text}"`));
  }
  if (resurfaced.length) {
    console.log(`\n↑ RESURFACED (${resurfaced.length}) — new activity, same stage (stageDate bumped → moves to top):`);
    resurfaced.forEach(r => console.log(`   ${r.id.padEnd(15)} ${r.stage}   stageDate ${r.from} → ${r.to}`));
  }
  if (failedFetch.length) console.log(`\n?  FETCH FAILED (${failedFetch.length}): ${failedFetch.join(', ')}`);
  if (!advanced.length && !died.length && !resurfaced.length) console.log('  No changes — every cached bill is up to date.');

  if (advanced.length || died.length) {
    console.log(`\n${line}\n  ⚠️  RE-REVIEW NEEDED — the ${advanced.length + died.length} bill(s) above changed stage.`);
    console.log('  likelihood / likelihoodReason prose is NOT auto-edited and is now stale.');
    console.log('  The bill TEXT on disk is ALSO stale (still the older version). For each:');
    console.log('    node scripts/fetch_bills_data.js --bill <id>   (overwrites bill-text with the LATEST version)');
    console.log('  then re-derive pages (billText.length/2200) and re-analyze the prose against it,');
    console.log('  re-stamp "analyzedAt", and (for newly-enacted bills) backfill CR quotes if available.');
    console.log('  Tracked via the needsReanalysis flag + validate-batch "Version drift" / freshness warnings.');
    console.log(line);
  }

  if (APPLY && (advanced.length || died.length || resurfaced.length)) {
    cache.generated = new Date().toISOString();
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n');
    console.log(`\n  ✅ Wrote ${advanced.length + died.length + resurfaced.length} update(s) to cache.json.`);
    if (advanced.length || died.length) console.log('  ↳ Run fetch_vote_data.js for the changed bills, then re-review prose.');
  } else if (!APPLY && (advanced.length || died.length || resurfaced.length)) {
    console.log('\n  (dry run — re-run with --apply to write these changes.)');
  }
})();
