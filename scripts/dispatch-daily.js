#!/usr/bin/env node
// dispatch-daily.js -- the unattended daily pass for the Dispatch lane.
//
// James's trigger decision, 2026-08-14: ONCE DAILY. The measured reason is in
// _personal/PHASE2-SCHEDULE-RESEARCH.md §3.1b -- Congress.gov stamps 99% of
// House votes at exactly +1 calendar day (n=283) but at any hour from 08:00 to
// 23:00 ET, so a single evening run catches ~95% of them the same day and an
// hourly trigger would buy about five hours on top of a ~24h floor.
//
// WHAT IT DOES, in order:
//   1. snapshot every cached bill's stage
//   2. refresh_stages --apply        (Congress.gov actions; the slow part, ~3.4 min)
//   3. diff the snapshot -> the bills that actually moved
//   4. fetch_vote_data --bill <id>   for each mover, so tallies exist before gating
//   5. dispatch-run --no-ping        detect, gate, publish locally, wire distribution
//
// IT DOES NOT PUSH. IT DOES NOT COMMIT. IT DOES NOT PING.
//
// --no-ping is not caution, it is correctness. IndexNow tells search engines to
// come and fetch a URL right now. The site is GitHub Pages serving `main`, so a
// dispatch published by an unattended run exists ONLY in the local working tree
// -- pinging for it would send crawlers to a 404 and spend the one irreversible
// step of the pipeline on a page that is not live. The ping belongs with the
// push, which is James's, so this run leaves it undone and says so.
//
// Not committing is deliberate too: a commit runs six gates, and a gate failing
// inside a task nobody is watching leaves a confusing half-state in a repo that
// is also being worked in by hand. This run leaves its work in the tree and
// reports; James reviews, commits and pushes.
//
// Usage:
//   node scripts/dispatch-daily.js            # dry run: detect + gate, change nothing
//   node scripts/dispatch-daily.js --apply    # the real daily pass (what the task runs)
//
// Exit codes: 0 = ran clean (whether or not anything published)
//             1 = a step failed; the run is incomplete and worth looking at

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT  = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'data', 'cache.json');

const APPLY = process.argv.includes('--apply');

const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

function loadStages() {
  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});
  const out = {};
  for (const b of bills) out[b.id] = `${b.stage || ''}|${b.stageDate || ''}`;
  return out;
}

function run(label, args, { optional = false } = {}) {
  console.log(`\n── ${label}`);
  const r = spawnSync('node', args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`   ${label} exited ${r.status}${optional ? ' (optional — continuing)' : ''}`);
    if (!optional) return false;
  }
  return true;
}

function main() {
  console.log(`Dispatch daily pass — ${stamp()}${APPLY ? '' : '   [DRY RUN — nothing will change]'}`);
  console.log('  never pushes · never commits · never pings IndexNow');

  const before = loadStages();
  let ok = true;

  // 1-2. Advance stages from Congress.gov. Optional: a fetch failure leaves
  // bills unchanged, which is a quiet no-op, not a reason to abandon the pass.
  ok = run('Refresh cached bill stages (Congress.gov actions)',
           ['scripts/refresh_stages.js', ...(APPLY ? ['--apply'] : [])],
           { optional: true }) && ok;

  // 3. What actually moved. Diffing the cache is deterministic; parsing the
  // refresh log for a bill list would break the first time its output changed.
  const after = loadStages();
  const moved = Object.keys(after).filter(id => before[id] !== undefined && before[id] !== after[id]);

  console.log(`\n── Bills that moved: ${moved.length}`);
  for (const id of moved) console.log(`   ${id.padEnd(16)} ${before[id]}  ->  ${after[id]}`);

  // 4. Tallies before gating. The gate corroborates a stage claim against
  // data/votes, so a bill that advanced without its roll call fetched would be
  // blocked for a gap this step exists to close.
  if (APPLY) {
    for (const id of moved) {
      run(`Fetch vote data — ${id}`, ['scripts/fetch_vote_data.js', '--bill', id], { optional: true });
    }
  } else if (moved.length) {
    console.log('   [dry run] would fetch vote data for each of the above');
  }

  // 5. The lane. --no-ping always: see the header.
  ok = run('Dispatch lane',
           ['scripts/dispatch-run.js', '--no-ping', ...(APPLY ? [] : ['--dry-run'])]) && ok;

  console.log('\n' + '─'.repeat(64));
  if (!APPLY) {
    console.log('  DRY RUN complete — nothing changed.');
  } else {
    console.log('  Daily pass complete. Nothing was committed, pushed, or announced.');
    console.log('  If anything published: review data/dispatch-log.json (or the patch-console');
    console.log('  Dispatch panel), then commit, merge to main, push, and THEN ping IndexNow:');
    console.log('    npm run indexnow -- --url <the published URL(s)> --apply');
  }
  process.exit(ok ? 0 : 1);
}

main();
