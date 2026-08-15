#!/usr/bin/env node
// dispatch-publish.js -- the only thing that may move a dispatch into the
// published tree, and the only thing that writes the audit trail.
//
// FLOW, and every step of it is a refusal point:
//   generate (staged) -> gate all seven checks -> promote OR delete -> log
//
// FAIL-CLOSED IS THE WHOLE CONTRACT (decision D1: dispatches auto-publish, so
// no human sees one first):
//   * a draft that fails ANY check is DELETED from staging, never published,
//     and never left on disk where a sitemap could find it;
//   * a draft that throws during gating counts as failed, not as skipped;
//   * the state snapshot advances ONLY for dispatches that actually published,
//     so a blocked event stays pending and republishes itself automatically
//     once the underlying data is fixed -- being blocked is not the same as
//     being handled;
//   * there is no --force-publish, no "publish with warnings", and none may be
//     added. If you find yourself wanting one, the answer is to fix the data.
//
// EVERY attempt is appended to data/dispatch-log.json, published or blocked.
// That file is the audit trail and the input to the patch-console review
// panel; it is how James reviews a lane that does not wait for him.
//
// Usage:
//   node scripts/dispatch-publish.js --dry-run      # gate + report, move nothing
//   node scripts/dispatch-publish.js                # gate + publish + log
//   node scripts/dispatch-publish.js --bill <id> --force --published-at <iso>

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const LOG  = path.join(DATA, 'dispatch-log.json');

const { runGate } = require('./dispatch-gate.js');
const gen = require('./generate_dispatch.js');
const { THRESHOLD, detectEvents, eventFor, snapshotStages } = require('./lib/dispatch-events.js');
const { loadPrepared, checkPrepared } = require('./lib/prepared.js');

const args = process.argv.slice(2);
const opt  = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const flag = n => args.includes(`--${n}`);
const DRY  = flag('dry-run');

const cache = JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8'));
const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});

function readJson(f, fallback) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; }
}

/** Stable identity for an event, so a retry is recognised as the same event. */
const eventKey = ev => `${ev.billId}|${ev.kind}|${ev.eventDate}`;

/** Which checks failed, as a stable string -- used to avoid re-logging noise. */
const failSignature = results => results.filter(r => !r.ok).map(r => r.name).sort().join(',');

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function main() {
  const state = gen.loadState();
  if (!state) {
    console.log('dispatch-publish: no dispatch-state.json — run generate_dispatch.js once to seed a baseline.');
    process.exit(1);
  }

  const publishedAt = opt('published-at') || new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const onlyBill = opt('bill');

  let events;
  if (onlyBill) {
    const bill = bills.find(b => String(b.id).toUpperCase() === onlyBill.toUpperCase());
    if (!bill) { console.error(`dispatch-publish: ${onlyBill} not in cache`); process.exit(1); }
    const ev = flag('force')
      ? (THRESHOLD[bill.stage] ? eventFor(bill, { stage: '__forced__', stageLabel: '', stageDate: '' }) : null)
      : eventFor(bill, (state.stages || {})[bill.id]);
    events = ev ? [ev] : [];
  } else {
    events = detectEvents(bills, state);
  }

  if (!events.length) {
    console.log('dispatch-publish: no threshold-crossing events. Nothing to do.');
    return;
  }

  const log = readJson(LOG, { _readme: 'Audit trail for the Dispatch lane. Every attempt, published or blocked. Appended by scripts/dispatch-publish.js; read by the patch-console review panel.', entries: [] });
  if (!Array.isArray(log.entries)) log.entries = [];

  console.log(`dispatch-publish: ${events.length} event(s)${DRY ? ' (DRY RUN — gate only, nothing moved or logged)' : ''}\n`);

  const published = [], blocked = [];

  for (const ev of events) {
    const bill = bills.find(b => b.id === ev.billId);
    // D3(a): the edition is written in the same pass, so this is normally
    // two-way. A dispatch that was blocked, fixed, and published after its
    // edition froze gets a one-way link to the hub instead -- James's ruling,
    // in preference to a frozen-edition patcher. Recorded either way.
    const link = gen.changelogLinkFor(publishedAt.slice(0, 10));
    const changelogUrl = link.url;

    // Build into staging. Even in a dry run the draft is written so the gate
    // reads exactly the bytes that would ship -- gating a string in memory
    // that differs from the file on disk is how a gate becomes decorative.
    let draft;
    try {
      draft = gen.buildOne(bill, ev, publishedAt, changelogUrl, { dry: false });
    } catch (e) {
      blocked.push({ ev, results: [{ name: 'build', ok: false, detail: String(e.message).slice(0, 120) }] });
      console.log(`  BLOCKED  ${ev.billId}  build failed: ${String(e.message).slice(0, 80)}`);
      continue;
    }

    let verdict;
    try {
      verdict = runGate({ html: draft.html, bill, event: ev });
    } catch (e) {
      verdict = { pass: false, results: [{ name: 'gate', ok: false, detail: `gate threw (treated as failure): ${String(e.message).slice(0, 90)}` }] };
    }

    // ── Phase 2: prepared-branch checks ──────────────────────────────────────
    // These run ALONGSIDE the seven-check gate, never inside it -- the gate is
    // corpus-proven at 211/211 with zero false blocks and is not modified here.
    //
    // A bill with no prepared record returns no checks and behaves exactly as
    // it did in Phase 1. A bill WITH one has had a specific set of outcomes
    // drafted and cleared, so an outcome outside that set is precisely the case
    // that must NOT auto-publish: it goes to the log as blocked, flagged for
    // James, and stays pending until he prepares it or the data is fixed.
    let preparedResults = [];
    try {
      preparedResults = checkPrepared({
        rec: loadPrepared(ev.billId), bill, event: ev,
        html: draft.html, today: publishedAt,
      });
    } catch (e) {
      preparedResults = [{ name: 'prepared', ok: false, detail: `prepared check threw (treated as failure): ${String(e.message).slice(0, 80)}` }];
    }
    if (preparedResults.length) {
      verdict = {
        pass: verdict.pass && preparedResults.every(r => r.ok),
        results: [...verdict.results, ...preparedResults],
      };
    }

    const entry = {
      loggedAt: publishedAt,
      billId: ev.billId,
      code: ev.code,
      event: ev.kind,
      eventDate: ev.eventDate,
      slug: draft.slug,
      url: `/dispatch/${draft.slug}/`,
      changelogUrl,
      changelogLink: link.mode,
      vote: ev.vote ? {
        chamber: ev.vote.chamber, result: ev.vote.result,
        yeas: ev.vote.yeas ?? null, nays: ev.vote.nays ?? null,
        rollNumber: ev.vote.rollNumber ?? null,
      } : null,
      gate: verdict.results.map(r => ({ check: r.name, ok: r.ok, detail: r.detail })),
      status: verdict.pass ? 'published' : 'blocked',
    };

    // An event that matched no prepared branch is not a data defect to be fixed
    // by re-running -- it is an outcome nobody drafted. Mark it so the review
    // panel can separate "waiting on data" from "waiting on James".
    const staleBranch = preparedResults.find(r => r.name === 'prepared-branch-matched' && !r.ok);
    if (staleBranch) {
      entry.needsHuman = true;
      entry.flag = `prepared-branch-miss: ${staleBranch.detail}`;
    }

    if (verdict.pass) {
      const target = path.join(gen.PUBLISHED, draft.slug);
      if (!DRY) {
        fs.mkdirSync(gen.PUBLISHED, { recursive: true });
        rmDir(target);
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(path.join(target, 'index.html'), draft.html);
        // read-back assert: a "published" log line with no verified write is
        // the Phase 0 bug class this project has already shipped twice
        const back = fs.readFileSync(path.join(target, 'index.html'), 'utf8');
        if (back !== draft.html) throw new Error(`publish verification FAILED for ${draft.slug}`);
        rmDir(draft.dir);
      }
      published.push({ ev, entry });
      console.log(`  ${(DRY ? 'WOULD PUBLISH' : 'PUBLISHED').padEnd(13)} ${ev.billId.padEnd(15)} ${ev.kind.padEnd(14)} /dispatch/${draft.slug}/`);
    } else {
      // Delete the draft. A blocked dispatch must not exist anywhere the
      // publish path can see it.
      if (!DRY) rmDir(draft.dir);
      blocked.push({ ev, results: verdict.results, entry });
      console.log(`  ${'BLOCKED'.padEnd(13)} ${ev.billId.padEnd(15)} ${ev.kind.padEnd(14)} ${failSignature(verdict.results)}`);
      for (const r of verdict.results.filter(x => !x.ok)) console.log(`             - ${r.check || r.name}: ${r.detail}`);
    }
  }

  if (DRY) {
    console.log(`\n  DRY RUN — ${published.length} would publish, ${blocked.length} blocked. Nothing moved, nothing logged.`);
    // staging is left in place on a dry run so the draft can be inspected
    return { published, blocked };
  }

  // ── Log every attempt ──────────────────────────────────────────────────────
  // A blocked event is retried on the next run (its state does not advance),
  // so re-logging an identical failure every run would bury the signal. Only
  // a NEW failure signature is appended.
  for (const b of blocked) {
    const key = eventKey(b.ev);
    const sig = failSignature(b.results);
    const prior = log.entries.filter(e => `${e.billId}|${e.event}|${e.eventDate}` === key && e.status === 'blocked').pop();
    if (prior && failSignature((prior.gate || []).map(g => ({ ok: g.ok, name: g.check }))) === sig) continue;
    log.entries.push(b.entry);
  }
  for (const p of published) log.entries.push(p.entry);

  fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + '\n');
  const backLog = readJson(LOG, null);
  if (!backLog || backLog.entries.length !== log.entries.length) throw new Error('dispatch-log write verification FAILED');

  // ── Advance state ONLY for what published ─────────────────────────────────
  const nextStages = { ...(state.stages || {}) };
  const fresh = snapshotStages(bills);
  for (const p of published) nextStages[p.ev.billId] = fresh[p.ev.billId];
  fs.writeFileSync(gen.STATE, JSON.stringify({ ...state, stages: nextStages }, null, 2) + '\n');

  console.log(`\n  ${published.length} published, ${blocked.length} blocked (blocked events stay pending and retry once their data is fixed).`);
  console.log(`  audit trail: data/dispatch-log.json (${log.entries.length} entr${log.entries.length === 1 ? 'y' : 'ies'})`);
  if (published.length) {
    console.log('\n  Next: npm run dispatch:publish-path   (sitemap, news sitemap, feed, search index, IndexNow)');
  }
  return { published, blocked };
}

if (require.main === module) main();

module.exports = { main, eventKey, failSignature };
