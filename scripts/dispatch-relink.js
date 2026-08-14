#!/usr/bin/env node
// dispatch-relink.js -- upgrade a just-published dispatch's changelog link from
// the hub to that day's edition, once the edition exists.
//
// WHY THIS STEP HAS TO EXIST. The two links point at each other, so whichever
// artifact is generated first cannot know the other's URL:
//
//   dispatch first -> the edition does not exist yet, so the dispatch can only
//                     link to the hub  (this was happening on EVERY run)
//   digest first   -> the dispatch does not exist yet, so the edition carries
//                     no back-link
//
// The order is fixed as dispatch-then-digest, because the edition must be able
// to link forward. This step then closes the loop from the other side.
//
// WHAT IT MAY REWRITE: only a dispatch published in THIS pass, seconds ago, by
// us. It never touches a changelog edition -- James's D3 ruling was explicitly
// "no frozen-edition patcher", and that stands: a published edition is a dated
// record and is never rewritten.
//
// FAIL-SAFE: if the edition does not exist (the digest emitted nothing because
// nothing else changed), the dispatch keeps its hub link and the log keeps
// saying "one-way". Nothing is forced.
//
// NO DATE GUESSING. The first version computed "today" with toISOString()
// (UTC) while generate_digest.js dates editions by LOCAL calendar day -- it
// has a comment saying exactly why -- so near midnight UTC they disagreed by a
// day and the relink silently found no edition. Same date-drift family as
// stageDate-vs-vote-date. Both inputs are now READ rather than derived: the
// edition date comes from digest-state.json (the edition the digest just
// wrote) and the run is identified by the exact loggedAt stamp dispatch-run
// hands to both steps.
//
// Usage: node scripts/dispatch-relink.js --logged-at 2026-08-14T03:11:49Z

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOG  = path.join(ROOT, 'data', 'dispatch-log.json');

const args = process.argv.slice(2);
const opt  = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };

/** The edition the digest most recently wrote, straight from its own state. */
function newestEditionDate() {
  try {
    const st = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'digest-state.json'), 'utf8'));
    const eds = (st.editions || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return eds.length ? eds[0].date : null;
  } catch { return null; }
}

function main() {
  const loggedAt = opt('logged-at');
  const date = opt('date') || newestEditionDate();
  if (!date) {
    console.log('dispatch-relink: no changelog edition on record — nothing to relink.');
    return;
  }
  const editionRel  = `/changelog/${date}/`;
  const editionFile = path.join(ROOT, 'changelog', date, 'index.html');

  if (!fs.existsSync(editionFile)) {
    console.log(`dispatch-relink: no edition at ${editionRel} — dispatches keep their hub link (one-way, by design).`);
    return;
  }

  let log;
  try { log = JSON.parse(fs.readFileSync(LOG, 'utf8')); }
  catch { console.log('dispatch-relink: no dispatch log; nothing to do.'); return; }

  // Only entries published in THIS pass, still marked one-way. Identified by
  // the exact run stamp, never by a recomputed date.
  const targets = (log.entries || []).filter(e =>
    e.status === 'published' && e.changelogLink === 'one-way' &&
    (loggedAt ? e.loggedAt === loggedAt : String(e.loggedAt || '').slice(0, 10) === date));

  if (!targets.length) {
    console.log('dispatch-relink: nothing to relink.');
    return;
  }

  let changed = 0;
  for (const entry of targets) {
    const file = path.join(ROOT, 'dispatch', entry.slug, 'index.html');
    if (!fs.existsSync(file)) {
      console.log(`  skip ${entry.slug} — page not found`);
      continue;
    }
    const before = fs.readFileSync(file, 'utf8');
    // The generator emits exactly this anchor when it falls back to the hub.
    const hubAnchor = '<a href="/changelog/">Congress Patch Notes (changelog)</a>';
    if (!before.includes(hubAnchor)) {
      console.log(`  skip ${entry.slug} — no hub fallback anchor present`);
      continue;
    }
    const label = editionLabel(date);
    const after = before.replace(hubAnchor, `<a href="${editionRel}">${label}</a>`);

    fs.writeFileSync(file, after);
    const back = fs.readFileSync(file, 'utf8');
    if (back !== after || !back.includes(editionRel)) {
      console.error(`dispatch-relink: write verification FAILED for ${entry.slug}`);
      process.exit(1);
    }

    entry.changelogUrl  = editionRel;
    entry.changelogLink = 'two-way';
    changed++;
    console.log(`  ${entry.slug} -> ${editionRel}`);
  }

  if (changed) {
    fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + '\n');
    const verify = JSON.parse(fs.readFileSync(LOG, 'utf8'));
    const stillOneWay = verify.entries.filter(e =>
      e.status === 'published' && String(e.loggedAt || '').slice(0, 10) === date && e.changelogLink === 'one-way').length;
    console.log(`dispatch-relink: ${changed} dispatch(es) now link to ${editionRel} (two-way); ${stillOneWay} still one-way.`);
  }
}

const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
function editionLabel(date) {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const human = m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : date;
  return `Congress Patch Notes edition for ${human}`;
}

main();
