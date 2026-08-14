#!/usr/bin/env node
// dispatch-correct.js -- the correction path for an auto-published dispatch.
//
// WHY A SCRIPT AND NOT "JUST EDIT IT": dispatches publish without a human
// reading them first (decision D1). The corresponding obligation is that when
// one turns out to be wrong, the fix is VISIBLE and LOGGED -- never a silent
// edit, and never a deletion. Quietly correcting an auto-published page is how
// a site that brands itself on accuracy loses the right to.
//
// This tool:
//   1. stamps a dated correction notice ON the dispatch page, above the body,
//      so anyone who returns to the URL sees what changed;
//   2. moves dateModified (and only dateModified -- datePublished is history);
//   3. appends a "corrected" entry to data/dispatch-log.json;
//   4. prints the corrections.html entry to add, because that prose is written
//      by a human in house style, not generated.
//
// It deliberately CANNOT delete a dispatch. If a dispatch should never have
// existed, that is still a correction: the page stays, says so, and explains.
//
// Usage:
//   node scripts/dispatch-correct.js --slug <dispatch-slug> \
//        --what "what was wrong" --now "what it says instead"

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOG  = path.join(ROOT, 'data', 'dispatch-log.json');

const args = process.argv.slice(2);
const opt  = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };

const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
const dateHuman = d => {
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : String(d);
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function main() {
  const slug = opt('slug');
  const what = opt('what');
  const now  = opt('now');
  const at   = opt('at') || new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  if (!slug || !what) {
    console.error('usage: dispatch-correct.js --slug <slug> --what "<what was wrong>" [--now "<what it says now>"]');
    process.exit(1);
  }

  const file = path.join(ROOT, 'dispatch', slug, 'index.html');
  if (!fs.existsSync(file)) {
    console.error(`dispatch-correct: no published dispatch at dispatch/${slug}/`);
    process.exit(1);
  }

  let html = fs.readFileSync(file, 'utf8');

  if (html.includes('class="dispatch-correction"')) {
    console.error('dispatch-correct: this dispatch already carries a correction notice.');
    console.error('  Corrections accumulate rather than replace — edit the existing notice by hand,');
    console.error('  and add a second dated line rather than overwriting the first.');
    process.exit(1);
  }

  const notice = `        <p class="dispatch-correction" style="border-left:3px solid var(--accent,#5F52DD);padding:0.6rem 0.9rem;margin:0 0 1.25rem;background:rgba(95,82,221,0.07)"><strong>Correction (${esc(dateHuman(at))}):</strong> ${esc(what)}${now ? ` ${esc(now)}` : ''}</p>\n`;

  const anchor = '      <div class="article-body">\n';
  if (!html.includes(anchor)) {
    console.error('dispatch-correct: could not find the article body anchor — page structure changed.');
    process.exit(1);
  }
  html = html.replace(anchor, anchor + '\n' + notice);

  // dateModified moves; datePublished never does -- it is when the event was
  // reported, and rewriting it would misrepresent the record.
  html = html.replace(/("dateModified":")[^"]*(")/, `$1${at}$2`);

  fs.writeFileSync(file, html);
  const back = fs.readFileSync(file, 'utf8');
  if (back !== html) { console.error('dispatch-correct: write verification FAILED'); process.exit(1); }
  if (!back.includes('class="dispatch-correction"')) {
    console.error('dispatch-correct: notice not present after write — aborting');
    process.exit(1);
  }

  // Log it.
  const log = JSON.parse(fs.readFileSync(LOG, 'utf8'));
  const original = (log.entries || []).filter(e => e.slug === slug).pop();
  log.entries.push({
    loggedAt: at,
    billId: original ? original.billId : null,
    code: original ? original.code : null,
    event: original ? original.event : null,
    eventDate: original ? original.eventDate : null,
    slug,
    url: `/dispatch/${slug}/`,
    status: 'corrected',
    correction: { what, now: now || null },
  });
  fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + '\n');

  console.log(`dispatch-correct: correction stamped on /dispatch/${slug}/ and logged.\n`);
  console.log('Now add this to the corrections log on corrections.html (human prose, house style):\n');
  console.log(`  <li><strong>${dateHuman(at)}</strong> &mdash; Dispatch: ${original ? original.code : slug}.`);
  console.log(`      ${what}${now ? ` ${now}` : ''}`);
  console.log(`      The dispatch page carries a dated correction notice; it was not removed.</li>\n`);
  console.log('  Then: npm run preflight  (the corrections page is a checked surface)');
}

main();
