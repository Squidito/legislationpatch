// patterns.js — shared regex patterns used by multiple pipeline scripts.
// First module of scripts/lib/ (see FABLE-AUDIT.md §B2 for the full extraction plan).

// Passage-context matcher — identifies vote questions / action texts that decide
// a measure itself, as opposed to procedural motions (recommit, commit, table,
// cloture, proceed) which say nothing about stage.
//
// THREE consumers (previously three independently-drifting copies):
//   validate-batch.js   — roll-call vote QUESTION strings ("On Passage", …)
//   refresh_stages.js   — Congress.gov ACTION TEXT strings ("Passed/agreed to in House …")
//   fetch_vote_data.js  — action texts, gating --apply-stage corrections
//
// This is the UNION of the old alternatives, DELIBERATELY TIGHTENED with \b
// anchors (the old refresh_stages/fetch_vote_data copies had none, so "upon
// passage" and "resolutions" matched as substrings — false positives). Known
// consequences of unification, both accepted:
//   • "motion to concur" now counts as passage-context in the ACTION-text
//     domain too (it genuinely decides a measure). Failure detection built on
//     this is guarded by the rank<2 check in refresh_stages/fetch_vote_data —
//     a bill with a canonical "Passed/agreed to" marker cannot be marked dead
//     by a failed procedural sighting alone. Keep that guard.
//   • Substring matches like "upon passage" / "agreeing to the resolutions"
//     no longer count (that is the tightening, not a regression).
// Verified 2026-07-06: all 71 distinct votes[].question strings in cache.json
// classify identically under the old validate-batch regex and this one.
const PASSAGE_CONTEXT = /\b(on passage|suspend the rules and pass|agreeing to the (concurrent )?resolution|motion to concur|passed\/agreed to|failed of passage)\b/i;

// Procedural-motion matcher — action texts that are HOUSEKEEPING, never the
// disposition of the measure itself, however they were decided.
//
// WHY IT EXISTS. fetch_vote_data.js's voice/UC branch classified any action text
// containing ("passed" OR "agreed to") AND ("voice vote" OR "unanimous consent"
// OR "without objection") as a passage, and stored it as
// { question: "On Passage", result: "Passed" }. The line
//
//     "Motion to reconsider laid on the table Agreed to without objection."
//
// satisfies that test and is not a passage of anything — it is the pro-forma
// motion that follows one. It appears on a large share of House measures
// (H. Res. 1175 and ten stored action records in data/ref-text/ carry it).
//
// It did not show up as a visible defect only by luck: the row it produced came
// out byte-identical to the real passage row on the same date, so the voice/UC
// dedupe swallowed it. The moment such a motion falls on a DIFFERENT date from
// the passage — or the passage is a roll call and the motion is not — it becomes
// a phantom second passage in votes[] and in data/votes/<id>.json.
//
// Tested in scripts/test-vote-classify.js against every stored action record.
const PROCEDURAL_MOTION = /\b(motion to reconsider|laid on the table|motion to table|motion to recommit|motion to instruct|motion to proceed|motion to discharge|motion to adjourn|motion to postpone|motion to close portions|held at the desk|previous question|quorum|cloture)\b/i;

// Curly/smart quotes (U+2018/2019/201C/201D). These corrupt anchor ids
// (billSection → bt-sec-N links) and JS template literals silently (the known
// Edit-tool corruption class — see docs/BILL-TEXT-LINKING.md "Watch out").
// Structural fields and source files must stay ASCII-quoted; prose (CR quote
// text) legitimately contains typographic quotes and is exempt.
const SMART_QUOTES = /[‘’“”]/;

module.exports = { PASSAGE_CONTEXT, PROCEDURAL_MOTION, SMART_QUOTES };
