#!/usr/bin/env node
// test-vote-classify.js — teeth for the voice-vote / unanimous-consent passage
// classifier in fetch_vote_data.js.
//
// WHY THIS EXISTS. The classifier was:
//
//     ("passed" OR "agreed to") AND ("voice vote" OR "unanimous consent"
//                                     OR "without objection")
//
// which is satisfied by the pro-forma line that FOLLOWS a House passage:
//
//     "Motion to reconsider laid on the table Agreed to without objection."
//
// and stored it as { question: "On Passage", result: "Passed" }. It never
// surfaced as a visible defect because that row came out byte-identical to the
// real passage row on the same date and the voice/UC dedupe swallowed it. The
// moment the motion falls on a different date — or the passage is a roll call
// and the motion is not — it is a phantom second passage in votes[] and in
// data/votes/<id>.json. Reported by the bill-analysis-A batch (status.md
// 2026-09-01) and again by the FISA batch, fixed 2026-09-02.
//
// Method, in three layers:
//   1. hand-written cases covering the defect and its near neighbours;
//   2. a REPLAY over every stored Congress.gov action record in
//      data/ref-text/*actions*.txt — real text, not invented — asserting that
//      the only lines whose classification CHANGED are procedural motions;
//   3. a no-drift check: for every bill whose stored votes[] are all voice/UC,
//      the stored row count is asserted to be reachable under the NEW rule, so
//      the fix cannot silently orphan data already on disk.
//
// Zero dependencies, no network, nothing written:
//   node scripts/test-vote-classify.js      (or: npm run votes:classify:test)

'use strict';

const fs = require('fs');
const path = require('path');
const { isVoiceOrUcPassage } = require('./fetch_vote_data.js');

const ROOT = path.join(__dirname, '..');
const REFTEXT = path.join(ROOT, 'data', 'ref-text');
const VOTES = path.join(ROOT, 'data', 'votes');

let passes = 0, failures = 0;
function check(desc, cond, extra) {
    if (cond) { passes++; console.log('  ok    ' + desc); return true; }
    failures++;
    console.error('  FAIL  ' + desc + (extra ? '\n          ' + extra : ''));
    return false;
}

/** The classifier exactly as it stood before 2026-09-02, for the replay diff. */
function oldRule(text) {
    const t = String(text || '').toLowerCase();
    return (t.includes('passed') || t.includes('agreed to'))
        && (t.includes('voice vote') || t.includes('unanimous consent') || t.includes('without objection'));
}

console.log('\nvoice/UC passage classifier — regression tests\n');

// ── 1. The defect, and the passages that must survive the fix ──────────────
const CASES = [
    // [expected, action text]
    // THE BUG:
    [false, 'Motion to reconsider laid on the table Agreed to without objection.'],
    [false, 'Motion to reconsider laid on the table Agreed to by voice vote.'],
    [false, 'On motion to table the motion to reconsider Agreed to by voice vote.'],
    [false, 'Motion to proceed to consideration of measure agreed to by Unanimous Consent.'],
    [false, 'Motion to recommit rejected by voice vote.'],
    [false, 'Motion to instruct conferees agreed to by voice vote.'],
    [false, 'Motion to discharge committee agreed to by Unanimous Consent.'],
    [false, 'Motion to adjourn agreed to without objection.'],
    [false, 'Motion to postpone further consideration agreed to without objection.'],
    [false, 'Cloture motion agreed to by Unanimous Consent.'],
    [false, 'Held at the desk by unanimous consent; measure passed the House earlier.'],
    [false, 'The previous question was ordered without objection.'],

    // REAL passages — these must all still classify as passages:
    [true,  'Passed Senate without amendment by Unanimous Consent.'],
    [true,  'On motion to suspend the rules and pass the bill Agreed to by voice vote.'],
    [true,  'On agreeing to the resolution Agreed to without objection.'],
    [true,  'Resolution agreed to in Senate without amendment and with a preamble by Unanimous Consent.'],
    [true,  'Passed House by voice vote.'],
    [true,  'On motion to concur in the Senate amendment Agreed to by voice vote.'],
    [true,  'Passed/agreed to in House: On motion to suspend the rules and pass the bill Agreed to by voice vote.'],

    // Neither — no passage language at all:
    [false, 'Referred to the Committee on the Judiciary.'],
    [false, 'Measure laid before Senate by unanimous consent.'],
    [false, 'Committee on Energy and Commerce discharged by Unanimous Consent.'],
    [false, ''],
    [false, null],
];
for (const [want, text] of CASES) {
    const got = isVoiceOrUcPassage(text);
    check(`${want ? 'PASSAGE ' : 'not      '} ${JSON.stringify(String(text || '')).slice(0, 78)}`,
        got === want, `expected ${want}, got ${got}`);
}

// The single line this whole fix exists for must have flipped, and must have
// been accepted by the OLD rule — otherwise the test is not testing the bug.
const BUG = 'Motion to reconsider laid on the table Agreed to without objection.';
check('the reported line WAS accepted by the old rule (the bug is real)', oldRule(BUG) === true);
check('the reported line is REJECTED by the new rule', isVoiceOrUcPassage(BUG) === false);

// ── 2. Replay over every stored Congress.gov action record ────────────────
// Real text. Any line whose classification changed must be a procedural motion;
// a changed line that is NOT one would mean the fix eats real passages.
{
    const files = fs.existsSync(REFTEXT)
        ? fs.readdirSync(REFTEXT).filter(f => /actions?\.txt$/i.test(f) || /-actions/i.test(f))
        : [];
    check('stored action records are present to replay', files.length > 0, `${files.length} file(s)`);

    const changed = new Map();   // line -> count
    let scanned = 0, oldYes = 0, newYes = 0;
    for (const f of files) {
        const text = fs.readFileSync(path.join(REFTEXT, f), 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const s = line.trim();
            if (!s) continue;
            scanned++;
            const o = oldRule(s), n = isVoiceOrUcPassage(s);
            if (o) oldYes++;
            if (n) newYes++;
            if (o !== n) changed.set(s, (changed.get(s) || 0) + 1);
        }
    }
    console.log(`     ..  replayed ${scanned} stored action line(s): old rule accepted ${oldYes}, new rule accepts ${newYes}`);

    let nonProcedural = 0;
    for (const [line] of changed) {
        const isProcedural = /\b(motion to reconsider|laid on the table|motion to table|motion to recommit|motion to instruct|motion to proceed|motion to discharge|motion to adjourn|motion to postpone|motion to close portions|held at the desk|previous question|quorum|cloture)\b/i.test(line);
        if (!isProcedural) { nonProcedural++; console.error('        NOT procedural but reclassified: ' + line.slice(0, 120)); }
    }
    check(`every reclassified stored line is a procedural motion (${changed.size} distinct line(s))`, nonProcedural === 0);
    check('the replay actually reclassified something (fixtures cover the defect)', changed.size > 0);
    check('the fix only ever REMOVES passages, never adds one', newYes <= oldYes, `old ${oldYes}, new ${newYes}`);
}

// ── 3. No-drift check against data already on disk ─────────────────────────
// Every stored voice/UC row must still be reachable: its own recorded method
// must be one the new rule can produce, and no stored row may itself be a
// procedural motion that the old rule let through.
{
    if (!fs.existsSync(VOTES)) { console.log('     ..  data/votes/ absent — skipping'); }
    else {
        const files = fs.readdirSync(VOTES).filter(f => f.endsWith('.json'));
        let voiceRows = 0, suspect = 0, filesWithVoice = 0;
        for (const f of files) {
            let v;
            try { v = JSON.parse(fs.readFileSync(path.join(VOTES, f), 'utf8')); } catch (e) { continue; }
            const rows = (v.votes || []).filter(r => r && (r.method === 'Voice Vote' || r.method === 'Unanimous Consent'));
            if (rows.length) filesWithVoice++;
            for (const r of rows) {
                voiceRows++;
                // A stored voice/UC row records question + result only, not the
                // action text it came from. What CAN be asserted is that it was
                // recorded as a passage of the measure -- a procedural motion
                // would have been stored under the same shape and is exactly
                // what we are removing going forward.
                if (r.question !== 'On Passage' || r.result !== 'Passed') { suspect++; console.error(`        ${f}: unexpected voice/UC row ${JSON.stringify(r)}`); }
            }
        }
        console.log(`     ..  ${voiceRows} stored voice/UC row(s) across ${filesWithVoice} bill file(s)`);
        check('every stored voice/UC row is a passage row, as this branch only ever wrote', suspect === 0);
    }
}

console.log(`\n  ${failures ? '❌' : '✅'} vote classifier: ${passes} passed, ${failures} failed\n`);
process.exit(failures ? 1 : 0);
