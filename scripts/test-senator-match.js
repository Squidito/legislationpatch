#!/usr/bin/env node
// test-senator-match.js — unit tests for scripts/lib/senator-match.js.
//
//   node scripts/test-senator-match.js
//
// Every case below is one of the five real failures the old flat lookup shipped
// (compound surname, generational suffix, diacritic), the collision case
// articles/how-we-track-voting.html claimed was handled, or a guard against the
// obvious over-correction: matching somebody who is not on the roll.
//
// The last block runs the matcher over the ACTUAL data/reps-index.json and the
// ACTUAL stored Senate roll calls, so the test fails if the real data regresses.

'use strict';

const fs = require('fs');
const path = require('path');
const SM = require('./lib/senator-match');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const eq = (label, actual, expected) => {
    if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; return; }
    fail++;
    console.log(`  ❌ ${label}\n       expected: ${JSON.stringify(expected)}\n       actual:   ${JSON.stringify(actual)}`);
};

// ── surnameKeys ─────────────────────────────────────────────────────────────
eq('suffix dropped', SM.surnameKeys('Angus S. King Jr.'), ['angusking', 'king']);
eq('bare surname', SM.surnameKeys('King'), ['king']);
eq('compound surname, full name', SM.surnameKeys('Chris Van Hollen'), ['chrisvanhollen', 'vanhollen', 'hollen']);
eq('compound surname, XML field', SM.surnameKeys('Van Hollen'), ['vanhollen', 'hollen']);
eq('diacritic folded', SM.surnameKeys('Ben Ray Luján'), ['benraylujan', 'raylujan', 'lujan']);
eq('initial dropped', SM.surnameKeys('Edward J. Markey'), ['edwardmarkey', 'markey']);
eq('given name never becomes a key', SM.surnameKeys('Catherine Cortez Masto').includes('catherine'), false);

// ── the five real production failures ───────────────────────────────────────
const fixture = {
    ME: [{ bioguideId: 'K000383', name: 'Angus S. King Jr.', party: 'I', state: 'ME', role: 'Senator' },
         { bioguideId: 'C001035', name: 'Susan M. Collins', party: 'R', state: 'ME', role: 'Senator' }],
    MD: [{ bioguideId: 'V000128', name: 'Chris Van Hollen', party: 'D', state: 'MD', role: 'Senator' },
         { bioguideId: 'A000382', name: 'Angela D. Alsobrooks', party: 'D', state: 'MD', role: 'Senator' }],
    NM: [{ bioguideId: 'L000570', name: 'Ben Ray Luján', party: 'D', state: 'NM', role: 'Senator' }],
    NV: [{ bioguideId: 'C001113', name: 'Catherine Cortez Masto', party: 'D', state: 'NV', role: 'Senator' }],
    DE: [{ bioguideId: 'B001303', name: 'Lisa Blunt Rochester', party: 'D', state: 'DE', role: 'Senator' }],
    // Same state, same surname — the collision the page claimed was handled.
    XX: [{ bioguideId: 'T000001', name: 'Pat Twin', party: 'D', state: 'XX', role: 'Senator' },
         { bioguideId: 'T000002', name: 'Sam Twin', party: 'R', state: 'XX', role: 'Senator' }],
    // A representative must never be matched by the Senate resolver.
    ZZ: [{ bioguideId: 'R000001', name: 'Dana Rep', party: 'D', state: 'ZZ', role: 'Representative' }],
};
const idx = SM.buildSenatorIndex(fixture);
const id = (row) => SM.resolveSenator(idx, row).bioguideId;

eq('King, Angus (suffix in the profile name)', id({ lastName: 'King', firstName: 'Angus', state: 'ME' }), 'K000383');
eq('Van Hollen (two-word XML surname)', id({ lastName: 'Van Hollen', firstName: 'Chris', state: 'MD' }), 'V000128');
eq('Lujan (unaccented XML spelling)', id({ lastName: 'Lujan', firstName: 'Ben', state: 'NM' }), 'L000570');
eq('Cortez Masto', id({ lastName: 'Cortez Masto', firstName: 'Catherine', state: 'NV' }), 'C001113');
eq('Blunt Rochester', id({ lastName: 'Blunt Rochester', firstName: 'Lisa', state: 'DE' }), 'B001303');
eq('unaffected senator still resolves', id({ lastName: 'Collins', firstName: 'Susan', state: 'ME' }), 'C001035');

// ── the collision case ──────────────────────────────────────────────────────
eq('collision resolved by given name', id({ lastName: 'Twin', firstName: 'Sam', state: 'XX' }), 'T000002');
eq('collision resolved by party when the given name is absent', id({ lastName: 'Twin', state: 'XX', party: 'D' }), 'T000001');
const amb = SM.resolveSenator(idx, { lastName: 'Twin', state: 'XX' });
eq('collision with nothing to break the tie returns no id', amb.bioguideId, '');
eq('...and says why', /^ambiguous/.test(amb.reason), true);

// ── guards against over-matching ────────────────────────────────────────────
eq('wrong state does not match', id({ lastName: 'Collins', firstName: 'Susan', state: 'MD' }), '');
eq('unknown surname does not match', id({ lastName: 'Nobody', firstName: 'A', state: 'ME' }), '');
eq('a Representative is not in the Senate index', id({ lastName: 'Rep', firstName: 'Dana', state: 'ZZ' }), '');
eq('a missing state does not match', id({ lastName: 'Collins', firstName: 'Susan' }), '');

// ── against the real repository data ────────────────────────────────────────
const realIndex = SM.buildSenatorIndex(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/reps-index.json'), 'utf8')));
const VOTES = path.join(ROOT, 'data/votes');
let rows = 0, unresolved = 0;
const stillBroken = {};
if (fs.existsSync(VOTES)) {
    for (const f of fs.readdirSync(VOTES)) {
        if (!f.endsWith('.json')) continue;
        const rec = JSON.parse(fs.readFileSync(path.join(VOTES, f), 'utf8'));
        for (const v of (rec.votes || [])) {
            if (v.chamber !== 'Senate') continue;
            for (const m of (v.members || [])) {
                rows++;
                // Stored rows carry "Last, First"; split it the way the XML does.
                const [last, first] = String(m.name || '').split(',');
                const r = SM.resolveSenator(realIndex, { lastName: last, firstName: first, state: m.state, party: m.party });
                if (!r.bioguideId) { unresolved++; stillBroken[m.name] = (stillBroken[m.name] || 0) + 1; }
                else if (m.bioguideId && m.bioguideId !== r.bioguideId) {
                    fail++;
                    console.log(`  ❌ real data: ${m.name} (${m.state}) resolves to ${r.bioguideId} but is stored as ${m.bioguideId}`);
                }
            }
        }
    }
    eq(`every stored Senate roll-call row resolves (${rows} rows)`, unresolved, 0);
    if (unresolved) console.log('       unresolved:', JSON.stringify(stillBroken));
} else {
    console.log('  · no data/votes directory — skipped the real-data check');
}

console.log(`\n  senator-match: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
