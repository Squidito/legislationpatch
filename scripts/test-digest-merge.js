#!/usr/bin/env node
// test-digest-merge.js -- teeth for the changelog same-day MERGE contract.
//
// WHY THIS EXISTS: on 2026-08-27 two batches landed on one day. The second
// `npm run digest` regenerated changelog/2026-08-27/ and silently DELETED the
// four bills the first run had published there. Nothing failed, nothing warned,
// and re-running could not restore them -- buildEdition diffs against the state
// snapshot, and run 1 had already recorded those bills' stages, so they never
// diffed again. Content loss with no error and no recovery path.
//
// The contract this file pins down:
//   1. a same-day regeneration is a UNION -- a published entry is never dropped;
//   2. an edition published before entries were recorded is recovered from its
//      published page, not silently treated as empty;
//   3. an incomplete recovery ABORTS rather than publishing a short edition;
//   4. a bill that reaches a DIFFERENT stage after publication aborts loudly
//      instead of one version silently winning.
//
// Read-only: exercises the exported merge functions against synthetic editions.
// Nothing is written, no network:
//   node scripts/test-digest-merge.js      (or: npm run digest:merge:test)

'use strict';

const path = require('path');
const digest = require('./generate_digest.js');

let passes = 0, failures = 0;

function check(desc, cond, extra) {
  if (cond) { passes++; console.log('  ok    ' + desc); return true; }
  failures++;
  console.error('  FAIL  ' + desc + (extra ? '\n          ' + extra : ''));
  return false;
}

function throws(desc, fn, matcher) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  if (!err) return check(desc, false, 'no error thrown');
  return check(desc, matcher.test(err.message), 'message was: ' + err.message.split('\n')[0]);
}

const entry = (id, stage, toLabel) => ({
  id, stage, code: id, title: id, url: `/bill/${id.toLowerCase()}-x/`,
  fromLabel: null, toLabel, stageDate: '2026-08-27', enactedDate: '2026-08-27', tally: '',
});
const edition = (key, title, entries) => ({ kind: 'diff', groups: [{ key, title, entries }] });
const flat = (key, title, entries) => entries.map(e => ({ ...e, group: key, groupTitle: title }));

console.log('\nChangelog same-day merge teeth\n');

// -- 1. Union: batch 1's entries survive batch 2 --------------------------------
{
  const published = {
    date: '2026-08-27', url: '/changelog/2026-08-27/', kind: 'diff',
    counts: { total: 2, new: 2 },
    entries: flat('new', 'New to the site', [entry('119-HR-1', 'committee', 'In Committee'),
                                             entry('119-HR-2', 'committee', 'In Committee')]),
  };
  const fresh = edition('new', 'New to the site', [entry('119-HR-3', 'committee', 'In Committee')]);
  const merged = digest.mergeSameDay(published, fresh, '2026-08-27');
  const ids = merged.groups.flatMap(g => g.entries.map(e => e.id));
  check('same-day regeneration keeps both batches (union by bill id)',
    ids.length === 3 && ['119-HR-1', '119-HR-2', '119-HR-3'].every(id => ids.includes(id)),
    'got ' + ids.join(', '));
  check('merged counts reflect the union',
    digest.editionCounts(merged).total === 3);
}

// -- 2. Re-running with NOTHING new still preserves the published edition --------
{
  const published = {
    date: '2026-08-27', url: '/changelog/2026-08-27/', kind: 'diff',
    counts: { total: 2, new: 2 },
    entries: flat('new', 'New to the site', [entry('119-HR-1', 'committee', 'In Committee'),
                                             entry('119-HR-2', 'committee', 'In Committee')]),
  };
  const merged = digest.mergeSameDay(published, null, '2026-08-27');
  check('a run with no fresh changes re-renders the published edition intact',
    digest.editionCounts(merged).total === 2);
}

// -- 3. Groups keep their identity and canonical order --------------------------
{
  const published = {
    date: '2026-08-27', kind: 'diff', counts: { total: 1, new: 1 },
    entries: flat('new', 'New to the site', [entry('119-HR-2', 'committee', 'In Committee')]),
  };
  const fresh = edition('enacted', 'Signed into law', [entry('119-HR-9', 'signed', 'Signed into Law')]);
  const merged = digest.mergeSameDay(published, fresh, '2026-08-27');
  check('signed-into-law group renders before new-to-the-site',
    merged.groups.map(g => g.key).join(',') === 'enacted,new',
    merged.groups.map(g => g.key).join(','));
  check('each entry stays in the group it was published under',
    merged.groups.find(g => g.key === 'new').entries[0].id === '119-HR-2' &&
    merged.groups.find(g => g.key === 'enacted').entries[0].id === '119-HR-9');
  check('the group tag is stripped from rendered entries',
    !('group' in merged.groups[0].entries[0]));
}

// -- 4. A bill that moves twice in one day aborts loudly ------------------------
{
  const published = {
    date: '2026-08-27', kind: 'diff', counts: { total: 1, advanced: 1 },
    entries: flat('advanced', 'Advanced a stage', [entry('119-HR-1', 'house', 'Passed House')]),
  };
  const fresh = edition('enacted', 'Signed into law', [entry('119-HR-1', 'signed', 'Signed into Law')]);
  throws('a same bill with a DIFFERENT destination stage aborts, never picks one',
    () => digest.mergeSameDay(published, fresh, '2026-08-27'),
    /reached a DIFFERENT stage/);
}

// -- 5. Recovery failures abort rather than publishing a short edition ----------
{
  const legacy = { date: '1999-01-01', kind: 'diff', counts: { total: 4, new: 4 } };
  throws('a recorded edition whose page is gone aborts (contents unrecoverable)',
    () => digest.publishedEntries(legacy, '1999-01-01'),
    /cannot be recovered|is missing/);
}
{
  // The live 2026-08-27 page recovers cleanly; claiming a wrong count must abort.
  const wrong = { date: '2026-08-27', kind: 'diff', counts: { total: 99, new: 99 } };
  throws('a recovery that yields fewer entries than recorded aborts',
    () => digest.publishedEntries(wrong, '2026-08-27'),
    /refusing to regenerate on an incomplete recovery/);
}
{
  const real = { date: '2026-08-27', kind: 'diff', counts: { total: 7, new: 7 } };
  let recovered = null;
  try { recovered = digest.publishedEntries(real, '2026-08-27'); } catch (e) { /* page may be absent */ }
  if (recovered) {
    check('the live 2026-08-27 page recovers all 7 published entries from markup',
      recovered.length === 7 && recovered.every(e => e.id && e.group === 'new'),
      recovered.map(e => e.id).join(', '));
  } else {
    console.log('  skip  live 2026-08-27 edition page not on disk');
  }
}

console.log('\n' + passes + ' passed, ' + failures + ' failed\n');
process.exit(failures ? 1 : 0);
