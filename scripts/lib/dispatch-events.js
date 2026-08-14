// dispatch-events.js -- decide whether a bill's movement earns a Dispatch.
//
// The Dispatch lane is event-triggered, never corpus-swept. That distinction is
// the whole defence against scaled content abuse (ARTICLE-WRITER-SPEC §9.1):
// "194 bills moved, publish 194 pages" is exactly the pattern Google penalises,
// and it is what this module exists to make structurally impossible. Nothing
// here can produce an event for a bill that did not actually move.
//
// THRESHOLD (decision D2, James, 2026-08-13): floor votes and above ONLY --
// chamber passage, failed floor votes, signing, veto. NO committee-stage
// dispatches. A bill reaching a calendar, being reported, or being referred
// produces nothing. Widening this is a new decision, not a code change made in
// passing: WIDENING IT IS THE SINGLE EASIEST WAY TO TURN THIS SITE INTO A
// CONTENT FARM, so the threshold lives here, in one table, stated out loud.
//
// Pure and offline: it compares a stage snapshot against the current cache and
// reads stored vote data. No network, no clock, no LLM -- so a past event can
// be replayed exactly for testing.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT  = path.join(__dirname, '..', '..');
const VOTES = path.join(ROOT, 'data', 'votes');

/**
 * The D2 threshold, as data. A destination stage that is not a key here can
 * never produce a dispatch, whatever else changed about the bill.
 */
const THRESHOLD = {
  house:  { kind: 'passed-house',  chamber: 'House',  verb: 'passed the House'  },
  senate: { kind: 'passed-senate', chamber: 'Senate', verb: 'passed the Senate' },
  signed: { kind: 'signed',        chamber: null,     verb: 'was signed into law' },
  vetoed: { kind: 'vetoed',        chamber: null,     verb: 'was vetoed' },
  dead:   { kind: 'failed-floor',  chamber: null,     verb: 'failed on the floor' },
};

/** Stages that are explicitly below the threshold. Present for readability. */
const SUB_THRESHOLD = new Set(['introduced', 'committee']);

function loadVotes(billId) {
  const f = path.join(VOTES, `${billId}.json`);
  if (!fs.existsSync(f)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return Array.isArray(j.votes) ? j.votes : [];
  } catch { return []; }
}

/**
 * The vote that corroborates this event.
 *
 * A dispatch says "the House passed it" -- something in the record has to SAY
 * so, or the dispatch is an unsourced claim. Returns null when nothing
 * corroborates, and the gate turns that into a block rather than a page.
 * Signing has no vote and is corroborated by the stage itself.
 */
function corroboratingVote(votes, ev) {
  if (!ev.chamber) return null;
  const inChamber = votes.filter(v => String(v.chamber || '').toLowerCase() === ev.chamber.toLowerCase());
  if (!inChamber.length) return null;

  const wantFailed = ev.kind === 'failed-floor';
  const matching = inChamber.filter(v => {
    const passed = /^(passed|agreed to)/i.test(String(v.result || ''));
    const failed = /^(failed|rejected)/i.test(String(v.result || ''));
    return wantFailed ? failed : passed;
  });
  if (!matching.length) return null;

  // latest by date -- a bill can pass the same chamber more than once
  return matching.reduce((best, v) =>
    (!best || String(v.date || '') > String(best.date || '')) ? v : best, null);
}

/**
 * Did this bill cross the threshold since the snapshot?
 *
 * `prev` is the bill's entry in data/dispatch-state.json ({stage, stageDate})
 * or undefined for a bill the lane has never seen. A bill first seen ALREADY
 * past the threshold produces NO event: it did not move on our watch, and
 * back-filling dispatches for the existing corpus is precisely the corpus
 * sweep this lane refuses to do.
 */
function eventFor(bill, prev) {
  if (!prev) return null;                                   // never seen -> no backfill
  const stage = String(bill.stage || '');
  if (SUB_THRESHOLD.has(stage)) return null;
  const t = THRESHOLD[stage];
  if (!t) return null;

  const moved = prev.stage !== stage
             || (bill.stageDate && prev.stageDate && bill.stageDate > prev.stageDate && prev.stage !== stage);
  if (!moved) return null;

  const votes = loadVotes(bill.id);
  const vote  = corroboratingVote(votes, t);

  // THE EVENT DATE IS THE VOTE'S DATE, NOT stageDate.
  //
  // stageDate is the bill's LATEST ACTION date, which routinely runs days
  // after the passage it supposedly marks -- H.R. 5625 passed the House on
  // 2026-05-14 and carries stageDate 2026-05-18 ("Received in the Senate").
  // Using stageDate made the dispatch assert "passed the House on May 18",
  // which is simply false. This is the HCONRES-40 stage/vote drift class
  // (CLAUDE.md) reappearing in a new surface: stage fields and vote records
  // are maintained by different code paths and drift apart silently.
  // Signing has no vote, so it keeps the stage date.
  const eventDate = (vote && vote.date) || bill.stageDate || bill.date || '';

  return {
    billId:     bill.id,
    code:       bill.code || bill.id,
    title:      bill.title || '',
    kind:       t.kind,
    chamber:    t.chamber,
    verb:       t.verb,
    fromStage:  prev.stage,
    fromLabel:  prev.stageLabel || prev.stage,
    toStage:    stage,
    toLabel:    bill.stageLabel || stage,
    eventDate,
    stageDate:  bill.stageDate || bill.date || '',
    vote,
  };
}

/**
 * Every threshold-crossing event between a snapshot and the current cache.
 * Deterministic: same inputs, same output, in stable bill-id order.
 */
function detectEvents(bills, snapshot) {
  const prev = (snapshot && snapshot.stages) || {};
  const out = [];
  for (const b of bills.slice().sort((a, b2) => String(a.id).localeCompare(String(b2.id)))) {
    const ev = eventFor(b, prev[b.id]);
    if (ev) out.push(ev);
  }
  return out;
}

/** Snapshot of every bill's stage, for the next comparison. Stable key order. */
function snapshotStages(bills) {
  const stages = {};
  for (const b of bills.slice().sort((a, b2) => String(a.id).localeCompare(String(b2.id)))) {
    stages[b.id] = {
      stage: b.stage || '',
      stageLabel: b.stageLabel || '',
      stageDate: b.stageDate || b.date || '',
    };
  }
  return stages;
}

module.exports = {
  THRESHOLD,
  SUB_THRESHOLD,
  detectEvents,
  eventFor,
  snapshotStages,
  corroboratingVote,
  loadVotes,
};
