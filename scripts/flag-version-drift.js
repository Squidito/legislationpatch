// flag-version-drift.js — reconcile the re-analysis QUEUE from the version data.
//
// The pipeline already computes `versionChanges` (what the passed text changed vs.
// Introduced) but historically never ACTED on it — so bills that advanced were
// analyzed against superseded text forever. This closes that loop.
//
// FLAG `needsReanalysis` when: the bill advanced (house/senate/signed), its on-disk
// bill text is STILL the Introduced version, and versionChanges shows the passed text
// differs. (Same precise signal as validate-batch's "Version drift" guard — the
// on-disk version marker, NOT analyzedAt, because an analyst can re-stamp analyzedAt
// after a likelihood-prose review without ever re-fetching the text.)
//
// CLEAR the flag only when the bill is genuinely repaired: the on-disk text is no
// longer Introduced (latest version was re-fetched) AND analyzedAt >= stageDate
// (prose was re-analyzed against it).
//
// Runs in run-batch --post (idempotent). Also: `npm run flag-drift`.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '..');
const CACHE     = path.join(ROOT, 'data', 'cache.json');
const BILL_TEXT = path.join(ROOT, 'data', 'bill-text');
const ADV = new Set(['house', 'senate', 'signed']);

const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const bills = cache.bills || [];

function vcCount(b) {
  const v = b.versionChanges || {};
  return (v.modified || []).length + (v.removed || []).length + (v.added || []).length;
}
function introducedOnDisk(id) {
  try { return /Introduced in (House|Senate)|\((?:IH|IS)\)/.test(fs.readFileSync(path.join(BILL_TEXT, `${id}.txt`), 'utf8').slice(0, 500)); }
  catch (e) { return false; }
}

let flagged = 0, cleared = 0;
for (const b of bills) {
  if (!b.analyzed || !ADV.has(b.stage)) continue;
  const onIntro = introducedOnDisk(b.id);
  const drift   = onIntro && vcCount(b) > 0;                                   // on-disk = Introduced but passed text differs
  if (drift && !b.needsReanalysis) { b.needsReanalysis = true; flagged++; }
  else if (b.needsReanalysis && !onIntro && (b.analyzedAt || '') >= (b.stageDate || '')) { delete b.needsReanalysis; cleared++; } // repaired
}

if (flagged || cleared) fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));

const queued = bills.filter(b => b.needsReanalysis).length;
console.log(`flag-version-drift: ${flagged} newly flagged, ${cleared} cleared — ${queued} bill(s) queued for re-analysis against latest text.`);
