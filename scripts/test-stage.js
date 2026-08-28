#!/usr/bin/env node
// test-stage.js -- teeth for stage derivation (lib/stage.js).
//
// WHY THIS EXISTS: detectStage read a bill's stage from ONE line of text — whatever
// Congress.gov reports as `latestAction`. That line is routinely housekeeping, and
// housekeeping masked a passage that had already happened: S. 2296 (NDAA FY2026
// Senate vehicle) passed the Senate 77-20 on 2025-10-09 and its latest action is the
// bare line "Held at the desk.", so the bill filed as "Introduced", step 0, and had
// to be corrected by hand. The same string was ALSO in fetch_bills_data's
// dead-on-arrival skip list, so the bill was dropped from the corpus before
// detectStage ever ran.
//
// A stage misread is not a cosmetic bug. The analyst writes likelihood and status
// prose against the stage shown at analysis time, and validate-batch's stage checks
// are built on it.
//
// Method: replay the REAL stored action histories in data/ref-text/*-actions.txt —
// the same records the analyses were audited against — through the derivation, and
// assert the passage-marker path gets each one right. Plus latest-action-string
// cases for the fallback path, including the exclusion-first check that the desk
// rule cannot promote a bill that never passed anything.
//
// Zero dependencies, no network, nothing written:
//   node scripts/test-stage.js      (or: npm run stage:test)

'use strict';

const fs   = require('fs');
const path = require('path');
const { detectStage, stageFromLatestAction } = require('./lib/stage.js');

const ROOT = path.join(__dirname, '..');
let passes = 0, failures = 0, skipped = 0;

function check(desc, cond, extra) {
  if (cond) { passes++; console.log('  ok    ' + desc); return true; }
  failures++;
  console.error('  FAIL  ' + desc + (extra ? '\n          ' + extra : ''));
  return false;
}

/**
 * Parse a stored action record back into the { text, actionDate } shape the API
 * returns. Lines look like:
 *   2025-10-09 | Floor | Passed/agreed to in Senate: Passed Senate under the ...
 */
function loadActions(file) {
  const p = path.join(ROOT, 'data', 'ref-text', file);
  if (!fs.existsSync(p)) return null;
  const out = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]*)\|\s*(.+)$/);
    if (m) out.push({ actionDate: m[1], type: m[2].trim(), text: m[3].trim() });
  }
  return out.length ? out : null;
}

console.log('\nStage derivation teeth\n');

// -- The defect, from the real record --------------------------------------------
console.log('  -- passage markers beat housekeeping (real stored histories) --');
{
  const actions = loadActions('record-congress-s-2296-actions.txt');
  if (!actions) { console.log('  skip  S-2296 action record not on disk'); skipped++; }
  else {
    const latest = actions.reduce((a, b) => (b.actionDate >= a.actionDate ? b : a));
    check('fixture: S-2296 latest action really is the desk hold',
      /held at the desk/i.test(latest.text) || actions.some(a => a.actionDate === '2025-11-12' && /held at the desk/i.test(a.text)),
      'latest was: ' + latest.text.slice(0, 60));

    const s = detectStage('Held at the desk.', 'S', actions);
    check('S-2296 classifies as Passed Senate from its stored history (no hand correction)',
      s.key === 'senate' && s.label === 'Passed Senate' && s.step === 3 && s.from === 'actions',
      JSON.stringify(s));

    const old = stageFromLatestAction('Held at the desk.', null);
    check('the OLD latest-action-only read still reproduces "Introduced" (bug fixture)',
      old.key === 'introduced' && old.step === 0, JSON.stringify(old));
  }
}
{
  // A House bill in committee must NOT be promoted by anything here.
  const actions = loadActions('record-congress-hr-7296-actions.txt');
  if (!actions) { console.log('  skip  HR-7296 action record not on disk'); skipped++; }
  else {
    const s = detectStage('Referred to the House Committee on House Administration.', 'HR', actions);
    check('HR-7296 (3 referral actions, no passage) stays In Committee',
      s.step <= 1 && s.key !== 'house' && s.key !== 'senate', JSON.stringify(s));
  }
}
{
  const actions = loadActions('record-congress-hr-139-actions.txt');
  if (!actions) { console.log('  skip  HR-139 action record not on disk'); skipped++; }
  else {
    const s = detectStage('Received in the Senate.', 'HR', actions);
    check('HR-139 (passed House 308-117) classifies as Passed House',
      s.key === 'house' && s.step === 2, JSON.stringify(s));
  }
}

// -- Controls: a failed bill and a signed bill still classify correctly ------------
console.log('\n  -- controls: failure and enactment are not disturbed --');
{
  // HCONRES-40 failed on the House floor: a passage-context action that FAILED and
  // NO "Passed/agreed to in" marker. Derivation must not read it as passed.
  const failedHistory = [
    { actionDate: '2026-04-14', type: 'IntroReferral', text: 'Introduced in House' },
    { actionDate: '2026-04-16', type: 'Floor', text: 'Considered as privileged matter.' },
    { actionDate: '2026-04-16', type: 'Floor', text: 'On agreeing to the resolution Failed by the Yeas and Nays: 213 - 214.' },
    { actionDate: '2026-04-17', type: 'Floor', text: 'Motion to reconsider laid on the table Agreed to without objection.' },
  ];
  const s = detectStage('Motion to reconsider laid on the table Agreed to without objection.', 'HCONRES', failedHistory);
  check('a failed resolution is never read as passed',
    s.key !== 'house' && s.key !== 'senate' && s.step === 0, JSON.stringify(s));
  check('the failure itself is still surfaced to the caller',
    require('./lib/stage.js').deriveProgress(failedHistory, true).failed !== null);
  // Without the history, that same latest-action string DOES read as Passed House —
  // which is exactly why the history path exists and is preferred.
  check('the latest-action string alone would have mis-read it (why history wins)',
    stageFromLatestAction('Motion to reconsider laid on the table Agreed to without objection.', 'HCONRES').key === 'house');
}
{
  const signedHistory = [
    { actionDate: '2025-01-22', type: 'IntroReferral', text: 'Introduced in Senate' },
    { actionDate: '2025-01-20', type: 'Floor', text: 'Passed/agreed to in Senate: Passed Senate with an amendment by Yea-Nay Vote. 64 - 35.' },
    { actionDate: '2025-01-22', type: 'Floor', text: 'Passed/agreed to in House: On passage Passed by recorded vote: 263 - 156.' },
    { actionDate: '2025-01-29', type: 'President', text: 'Signed by President.' },
    { actionDate: '2025-01-29', type: 'BecameLaw', text: 'Became Public Law No: 119-1.' },
  ];
  const s = detectStage('Became Public Law No: 119-1.', 'S', signedHistory);
  check('a signed bill classifies as Signed into Law, step 4',
    s.key === 'signed' && s.step === 4, JSON.stringify(s));
}

// -- The fallback path, and what the desk rule is allowed to let in ----------------
console.log('\n  -- latest-action fallback (no history available) --');
const f = (t, type) => stageFromLatestAction(t, type);

check('desk hold on a SENATE bill => Passed Senate (the House is holding it)',
  f('Held at the desk.', 'S').key === 'senate' && f('Held at the desk.', 'S').step === 3);
check('desk hold on a HOUSE bill => Passed House (the Senate is holding it)',
  f('Held at the desk.', 'HR').key === 'house' && f('Held at the desk.', 'HR').step === 2);
check('desk hold with NO bill type does not guess a chamber',
  f('Held at the desk.', null).key === 'introduced' && f('Held at the desk.', '').key === 'introduced');
check('"Received in the House and Held at the Desk" still reads from the named chamber',
  f('Received in the House and Held at the Desk.', 'S').key === 'senate');

console.log('\n  -- exclusion-first: what the desk rule must NOT promote --');
check('a plain referral is untouched',
  f('Referred to the Committee on Armed Services.', 'S').key === 'committee');
check('an introduction is untouched',
  f('Introduced in Senate', 'S').key === 'introduced');
check('a calendar placement is untouched',
  f('Placed on Senate Legislative Calendar under General Orders. Calendar No. 115.', 'S').key === 'committee');
check('a hearing is untouched',
  f('Committee on Armed Services. Hearings held.', 'S').step <= 1);
check('"desk" alone is not a desk hold',
  f('Sponsor introductory remarks on measure. (CR S123) desk copy', 'S').key === 'introduced');
check('enactment still outranks every other marker',
  f('Became Public Law No: 119-60. Held at the desk.', 'S').key === 'signed');

console.log('\n' + passes + ' passed, ' + failures + ' failed, ' + skipped + ' skipped\n');
process.exit(failures ? 1 : 0);
