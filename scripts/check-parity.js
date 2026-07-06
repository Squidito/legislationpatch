// scripts/check-parity.js
//
// WEB side of the cross-platform parity check (#3).
// Verifies legislationpatch/util.js honors the shared contract in
// shared/parity-fixtures.json. The MOBILE side runs the same fixture against
// legislationpatch-app/lib/format.ts (see that repo's `npm run parity`).
//
// If this fails, web's util.js has drifted from the agreed shared behavior —
// the exact failure mode behind the past date-ordering bugs.
//
// Run: node scripts/check-parity.js   (or `npm run parity`)

'use strict';
const path = require('path');
const fs   = require('fs');

const util     = require('../util.js');
const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../shared/parity-fixtures.json'), 'utf8')
);
// Web-only regression lock (helpers deduped into util.js 2026-07-06) — same
// schema, checked here only; the mobile runner does not read this file.
try {
    Object.assign(fixtures, JSON.parse(
        fs.readFileSync(path.join(__dirname, '../shared/parity-fixtures-web.json'), 'utf8')
    ));
} catch { /* web-only fixture absent — fine */ }

let failures = 0;
let checked  = 0;

for (const [fnName, cases] of Object.entries(fixtures)) {
    if (fnName.startsWith('_')) continue;               // skip _comment
    const fn = util[fnName];
    if (typeof fn !== 'function') {
        console.error(`  ✗ util.js does not export "${fnName}"`);
        failures++;
        continue;
    }
    for (const { in: input, out: expected } of cases) {
        checked++;
        const actual = fn(input);
        if (actual !== expected) {
            failures++;
            console.error(`  ✗ ${fnName}(${JSON.stringify(input)}) => ${JSON.stringify(actual)}  (expected ${JSON.stringify(expected)})`);
        }
    }
}

if (failures) {
    console.error(`\n❌ Parity (web): ${failures} mismatch(es) across ${checked} case(s). util.js has drifted from shared/parity-fixtures.json.`);
    process.exit(1);
}
console.log(`✅ Parity (web): util.js matches the shared contract (${checked} case(s)).`);
