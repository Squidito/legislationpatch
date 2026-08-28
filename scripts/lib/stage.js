// stage.js -- how far a bill has actually got, derived once.
//
// TWO derivations used to live in two files and disagree:
//   refresh_stages.js  deriveProgress()  -- reads the FULL action history and keys
//                                           on Congress.gov's canonical
//                                           "Passed/agreed to in [Chamber]" markers.
//   fetch_bills_data.js detectStage()    -- reads only the LATEST action STRING.
// The first is right. The second is a guess made from one line of text, and it is
// where the misreads come from.
//
// THE 2026-08-27 DEFECT. S. 2296 (NDAA FY2026 Senate vehicle) passed the Senate
// 77-20 on 2025-10-09, was messaged to the House on 11-10 and received there on
// 11-12. Congress.gov's `latestAction` for it is the bare housekeeping line
// "Held at the desk." -- which matched none of detectStage's branches, so the bill
// read as "Introduced", step 0, and had to be corrected by hand. Worse, "held at
// the desk" was ALSO in fetch_bills_data's DOA_ACTIONS skip list, so a bill in
// that state was dropped from the corpus before detectStage ever ran. A desk hold
// is the opposite of dead-on-arrival: nothing reaches the other chamber's desk
// without having passed its own.
//
// THE RULE, and the project's matcher lesson (exclusion-first -- before widening a
// match, check what the widening lets IN):
//   1. If the action HISTORY is available, derive from passage markers and stop.
//      Housekeeping actions (desk holds, referrals, calendar placements, messages)
//      cannot mask an earlier passage, because they are not what is being read.
//   2. Only when there is no history -- the bill-LIST screen has just one action
//      string per bill -- fall back to the string heuristic.
//   3. In that fallback, a transmission or desk-hold marker is mapped back to the
//      chamber that must have passed the measure, and NEVER guessed: if the origin
//      chamber cannot be established from the bill type, the stage is left alone.
//      A wrong stage is worse than an unadvanced one.

'use strict';

const { PASSAGE_CONTEXT } = require('./patterns.js');

// House-originated bill types. "S. 2296 held at the desk" means the HOUSE is
// holding a bill the SENATE passed, and vice versa.
const HOUSE_ORIGIN_RE = /^H(R|JRES|CONRES|RES)$/i;
const isHouseOrigin = billType => HOUSE_ORIGIN_RE.test(String(billType || ''));

/**
 * Furthest milestone reached, from the FULL actions list. Uses Congress.gov's
 * canonical "Passed/agreed to in [Chamber]" markers -- these carry an actual
 * passage verb, so "Received in the Senate", "Placed on Calendar" and "Held at
 * the desk" never match, and equally can never mask a passage that did happen.
 */
function deriveProgress(actions, originHouse) {
  const signed       = actions.some(a => /became public law|signed by president/i.test(a.text || ''));
  const passedHouse  = actions.some(a => /^passed\/agreed to in house/i.test(a.text || ''));
  const passedSenate = actions.some(a => /^passed\/agreed to in senate/i.test(a.text || ''));
  const onCalendar   = actions.some(a => /placed on the .*calendar|calendar no\./i.test(a.text || ''));

  // failed on the floor (a passage-context action that FAILED), latest by date
  let failed = null;
  for (const a of actions) {
    const t = a.text || '';
    if (!PASSAGE_CONTEXT.test(t)) continue; // shared with validate-batch.js — scripts/lib/patterns.js
    if (/\bfailed\b/i.test(t) && (!failed || String(a.actionDate || '') > failed.date)) {
      failed = { date: a.actionDate || '', text: t, chamber: a.chamber || (/senate/i.test(t) ? 'Senate' : 'House') };
    }
  }

  if (signed) return { rank: 4, stage: 'signed', label: 'Signed into Law', step: 4, signed: true, failed };
  if (passedHouse && passedSenate) {
    return originHouse
      ? { rank: 3, stage: 'senate', label: 'Passed Senate', step: 3, failed }
      : { rank: 3, stage: 'house',  label: 'Passed House',  step: 3, failed };
  }
  if (passedHouse || passedSenate) {
    // `rank` is the monotonic advancement comparator (one chamber = 2, both = 3).
    // `step` is something different: an INDEX into the fixed pipeline every bill
    // renders against — ["Introduced","Committee","Passed House","Passed Senate",
    // "Signed"] — so "Passed Senate" is 3 whether or not the House has acted.
    // This branch used to return step 2 for a Senate-only passage, which disagrees
    // with all 13 such bills in the cache and would light "Passed House" on the
    // strip for a bill the House has not touched. Surfaced 2026-08-27 when the two
    // derivations were merged; latent until then because refresh_stages only writes
    // step on an ADVANCE, and no Senate bill had advanced into that state yet.
    return passedHouse
      ? { rank: 2, stage: 'house',  label: 'Passed House',  step: 2, failed }
      : { rank: 2, stage: 'senate', label: 'Passed Senate', step: 3, failed };
  }
  if (onCalendar) return { rank: 1, stage: 'committee', label: originHouse ? 'On House Calendar' : 'On Senate Calendar', step: 1, failed };
  return { rank: 0, stage: 'introduced', label: 'Introduced', step: 0, failed };
}

// Latest-action-string fallback, used ONLY where no action history is available.
function stageFromLatestAction(latestActionText, billType) {
  const t = (latestActionText || '').toLowerCase();
  const houseOrigin = isHouseOrigin(billType);

  if (t.includes('signed by president') || t.includes('became public law') || t.includes('enacted'))
    return { key: 'signed', label: 'Signed into Law', step: 4 };

  // TRANSMISSION markers, not passage: the bill passed the OTHER chamber and was
  // sent here. Matched BEFORE the "passed …" lines so a House bill "Received in
  // the Senate" reads as Passed House, not Passed Senate.
  if (t.includes('received in the senate'))            // a House bill cleared the House
    return { key: 'house', label: 'Passed House', step: 2 };
  if (t.includes('received in the house'))             // a Senate bill cleared the Senate
    return { key: 'senate', label: 'Passed Senate', step: 3 };

  if (t.includes('passed senate') || t.includes('senate agreed'))
    return { key: 'senate', label: 'Passed Senate', step: 3 };
  if (t.includes('passed house') || t.includes('passed the house') || t.includes('house agreed') || t.includes('on passage') || t.includes('motion to reconsider laid on the table agreed to'))
    return { key: 'house', label: 'Passed House', step: 2 };

  // DESK HOLD — post-transmission housekeeping, and the S-2296 miss. A measure is
  // only ever "held at the desk" by the chamber that RECEIVED it, so the ORIGIN
  // chamber has passed it. The receiving chamber is not named in the string, so
  // the origin is taken from the bill type; with no bill type there is nothing to
  // infer from and the stage is deliberately NOT advanced.
  // (What this widening lets in: only measures already transmitted between
  // chambers. It cannot promote a committee-stage or introduced bill, because
  // neither ever reaches a desk.)
  if (t.includes('held at the desk')) {
    if (!billType) return { key: 'introduced', label: 'Introduced', step: 0 };
    return houseOrigin
      ? { key: 'house',  label: 'Passed House',  step: 2 }   // Senate holds a House bill
      : { key: 'senate', label: 'Passed Senate', step: 3 };  // House holds a Senate bill
  }

  if (t.includes('union calendar') || t.includes('house calendar') || t.includes('senate calendar') || t.includes('placed on the calendar') || t.includes('calendar no'))
    return { key: 'committee', label: 'On House Calendar', step: 1 };

  if (t.includes('reported by') || t.includes('ordered to be reported') || t.includes('referred to')) {
    // House-originated bills only receive Senate committee actions after passing the
    // House. Senate markup starts with the committee name ("Committee on X. Ordered
    // to be reported…"); House markup says "Ordered to be Reported by…".
    const senateSide = t.startsWith('committee on') || (t.includes('senate') && !t.includes('referred to the house'));
    if (houseOrigin && senateSide)
      return { key: 'house', label: 'Passed House', step: 2 };
    return { key: 'committee', label: 'In Committee', step: 1 };
  }

  return { key: 'introduced', label: 'Introduced', step: 0 };
}

/**
 * The stage of a bill. Pass `actions` (the full history) whenever it is available —
 * passage markers are authoritative and no housekeeping action can mask them.
 * Without it, falls back to reading the latest-action string.
 * Returns { key, label, step } (deriveProgress's `stage` is normalised to `key`).
 */
function detectStage(latestActionText, billType, actions) {
  if (Array.isArray(actions) && actions.length) {
    const p = deriveProgress(actions, isHouseOrigin(billType));
    return { key: p.stage, label: p.label, step: p.step, from: 'actions' };
  }
  return { ...stageFromLatestAction(latestActionText, billType), from: 'latestAction' };
}

module.exports = { deriveProgress, detectStage, stageFromLatestAction, isHouseOrigin };
