#!/usr/bin/env node
// prepare-dispatch.js -- Phase 2: draft every outcome of a known upcoming event
// in advance, clear it through the fidelity checks while there is no clock
// running, and park it in data/prepared/ until the event fires.
//
// WHY THIS EXISTS. The fast lane's whole tension is speed vs fidelity. Prepared
// Dispatch dissolves it: the QA happens days early, at leisure; the only work
// left at event time is selecting the branch that matches and injecting the
// vote numbers, both of which are mechanical and both of which still pass
// through the unchanged seven-check gate.
//
// WHAT IT WRITES. data/prepared/<bill-id>.json -- one record per bill, holding
// a fingerprint per branch, not stored HTML. See scripts/lib/prepared.js for
// why (stored HTML rots; a fingerprint of the masked render does not).
//
// WHAT IT VERIFIES BEFORE STORING (James's directive: nothing waits in
// data/prepared/ unverified). The five gate checks that do not depend on the
// event run against every branch specimen, and a branch that fails ANY of them
// is NOT stored. The two event-dependent checks (votes-match-record,
// stage-corroborated) cannot exist before the vote does and are run unchanged
// at fire time by dispatch-gate.js.
//
// This script NEVER publishes and never touches the published tree.
//
// Usage:
//   node scripts/prepare-dispatch.js --bill 119-HR-9770               # dry run
//   node scripts/prepare-dispatch.js --bill 119-HR-9770 --apply
//   node scripts/prepare-dispatch.js --bill 119-HR-9770 --apply \
//        --expires 2026-10-05 --note "FY2027 CR; Senate action before Sept 30"
//   node scripts/prepare-dispatch.js --bill 119-HR-9770 --branches passed-senate,failed-floor --apply
//   node scripts/prepare-dispatch.js --list
//   node scripts/prepare-dispatch.js --check      # re-verify all records vs current cache

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const gen = require('./generate_dispatch.js');
const { CHECKS, textOf } = require('./dispatch-gate.js');
const P = require('./lib/prepared.js');
const { displayCode } = require('./lib/bill-code.js');

const args = process.argv.slice(2);
const flag = n => args.includes(`--${n}`);
const opt  = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const APPLY = flag('apply');

const cache = JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8'));
const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});

/**
 * The five checks that do not depend on the event existing yet.
 *
 * Named explicitly rather than derived by exclusion: if someone adds an eighth
 * check to the gate, this list should NOT silently start running it against a
 * specimen with sentinel vote data. Adding it here is a deliberate act.
 */
const PREPARE_TIME_CHECKS = new Set([
  'figures-in-audited-entry',
  'no-unsourced-qualifiers',
  'no-smart-quotes',
  'newsarticle-fields',
  'no-named-parties',
]);

/**
 * Fixed values for the specimen render. Every one of them is masked out of the
 * fingerprint, so they affect nothing except making the page renderable.
 *
 * The publish timestamp is derived from the BILL's own date rather than being a
 * literal like 2000-01-01, because the page prints the publication year as
 * plain text and the figures check reads any 4-digit integer as a figure: a
 * hardcoded sentinel year is a number the audited entry has never contained, so
 * every branch blocked on "figure not present in the audited entry: 2000". The
 * bill's stage date is already in the check's allowed set.
 */
const sentinelPublishedAt = bill => `${bill.stageDate || bill.date || ''}T00:00:00Z`;
const SENTINEL_VOTE = chamber => ({
  chamber, result: 'Passed', yeas: 1, nays: 1, rollNumber: 1,
});

/** Which chamber acts next, for the branches that need one. */
function nextChamber(bill) {
  const s = String(bill.stage || '');
  if (s === 'house')  return 'Senate';
  if (s === 'senate') return 'House';
  return null;
}

/**
 * The branch set to prepare, as {kind, chamber, verb}.
 * Defaults to every threshold kind the bill is not already at.
 */
function branchesFor(bill, requested) {
  const already = P.KIND_FOR_STAGE[String(bill.stage || '')];
  const next = nextChamber(bill);
  const wanted = requested
    ? requested.split(',').map(s => s.trim()).filter(Boolean)
    : P.BRANCH_KINDS.filter(k => k !== already);

  const out = [], skipped = [];
  for (const kind of wanted) {
    if (!P.BRANCH_KINDS.includes(kind)) { skipped.push([kind, 'not a threshold branch kind']); continue; }
    if (kind === 'passed-house')  out.push({ kind, chamber: 'House',  verb: 'passed the House' });
    else if (kind === 'passed-senate') out.push({ kind, chamber: 'Senate', verb: 'passed the Senate' });
    else if (kind === 'signed')   out.push({ kind, chamber: null, verb: 'was signed into law' });
    else if (kind === 'vetoed')   out.push({ kind, chamber: null, verb: 'was vetoed' });
    // Passage in amended form. "in amended form" is true of both real shapes --
    // a chamber amending and passing, and a chamber concurring in the other
    // chamber's amendment -- and both mean the same thing to a reader: what
    // passed is not the text this chamber started with.
    else if (kind === 'amended') {
      const ch = opt('chamber') || next;
      if (!ch) { skipped.push([kind, 'cannot resolve which chamber would amend it -- pass --chamber']); continue; }
      // renderKind, not kind: "amended" is OUR label for the branch, but the
      // event that actually fires is an ordinary passage, and the page's slug
      // and URLs are built from the event kind. Rendering the specimen as
      // "amended" would fingerprint a slug the real page never has.
      out.push({
        kind, chamber: ch, verb: `passed the ${ch} in amended form`,
        renderKind: ch === 'Senate' ? 'passed-senate' : 'passed-house',
      });
    }
    // Manual only: no event ever fires for a pull, so this is a cleared draft
    // sitting ready, not something the lane can publish by itself.
    else if (kind === 'pulled') out.push({ kind, chamber: null, verb: 'was pulled from the floor schedule' });
    else if (kind === 'failed-floor') {
      const ch = opt('chamber') || next;
      // No chamber means no honest verb -- "failed on the floor" of WHERE? The
      // event detector resolves this from the stage label and the failing vote
      // and blocks when they disagree; preparing a chamberless branch would
      // create a draft that can never match a real event.
      if (!ch) { skipped.push([kind, 'cannot resolve which chamber would reject it -- pass --chamber']); continue; }
      out.push({ kind, chamber: ch, verb: `failed on the ${ch} floor` });
    }
  }
  return { branches: out, skipped };
}

/** The synthetic event a specimen is rendered from. */
function specimenEvent(bill, br) {
  const hasVote = br.chamber != null;   // signing/veto have no vote, and must render without one
  return {
    billId: bill.id,
    code: bill.code || bill.id,
    title: bill.title || '',
    kind: br.renderKind || br.kind,
    chamber: br.chamber,
    verb: br.verb,
    toLabel: bill.stageLabel || bill.stage || '',
    // The bill's own stageDate: a real date already allowed by the figures
    // check, and masked out of the fingerprint regardless.
    eventDate: bill.stageDate || bill.date || '',
    stageDate: bill.stageDate || bill.date || '',
    vote: hasVote ? SENTINEL_VOTE(br.chamber) : null,
  };
}

function runPrepareChecks(html, bill, event) {
  const ctx = { html, text: textOf(html), bill, event };
  return CHECKS
    .filter(([name]) => PREPARE_TIME_CHECKS.has(name))
    .map(([name, fn]) => {
      try { const r = fn(ctx); return { check: name, ok: !!r.ok, detail: r.detail }; }
      catch (e) { return { check: name, ok: false, detail: `check threw (treated as failure): ${String(e.message).slice(0, 90)}` }; }
    });
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdList() {
  const recs = P.listPrepared();
  if (!recs.length) { console.log('prepare-dispatch: nothing prepared.'); return; }
  console.log(`\nPrepared dispatches (${recs.length}):\n`);
  for (const r of recs) {
    console.log(`  ${r.billId.padEnd(16)} ${(r.code || '').padEnd(12)} expires ${r.expires || '(never)'}`);
    console.log(`    branches: ${Object.keys(r.branches || {}).join(', ')}`);
    if (r.note) console.log(`    note: ${r.note}`);
  }
  console.log('');
}

/** Re-verify every stored record against the CURRENT cache. Read-only. */
function cmdCheck() {
  const recs = P.listPrepared();
  if (!recs.length) { console.log('prepare-dispatch: nothing prepared.'); return 0; }
  let bad = 0;
  console.log(`\nRe-verifying ${recs.length} prepared record(s) against the current cache:\n`);
  for (const rec of recs) {
    const bill = bills.find(b => b.id === rec.billId);
    if (!bill) { console.log(`  STALE  ${rec.billId} — no longer in cache`); bad++; continue; }
    const fp = P.auditedFingerprint(bill);
    if (fp !== rec.auditedFingerprint) {
      console.log(`  STALE  ${rec.billId} — audited entry changed since QA; re-prepare`);
      bad++; continue;
    }
    // The masked render must still reproduce, or the generator moved under it.
    let drift = 0;
    for (const [kind, br] of Object.entries(rec.branches || {})) {
      const ev = specimenEvent(bill, { kind, renderKind: br.renderKind, chamber: br.chamber, verb: br.verb });
      const html = gen.renderDispatch(bill, ev, {
        publishedAt: sentinelPublishedAt(bill), changelogUrl: '/changelog/',
      });
      if (P.maskedFingerprint(html) !== br.maskedSha) { console.log(`  DRIFT  ${rec.billId} — branch "${kind}" no longer renders as QA'd`); drift++; }
    }
    if (drift) { bad++; continue; }
    console.log(`  ok     ${rec.billId} — ${Object.keys(rec.branches || {}).length} branch(es) intact`);
  }
  console.log(bad ? `\n  ${bad} record(s) need re-preparing.\n` : '\n  All prepared records intact.\n');
  return bad ? 1 : 0;
}

function cmdPrepare(billId) {
  const bill = bills.find(b => String(b.id).toUpperCase() === billId.toUpperCase());
  if (!bill) { console.error(`prepare-dispatch: ${billId} not in cache`); process.exit(1); }

  const { branches, skipped } = branchesFor(bill, opt('branches'));
  if (!branches.length) { console.error('prepare-dispatch: no branches to prepare.'); process.exit(1); }

  console.log(`\nPreparing ${displayCode(bill.id)} — ${bill.title || ''}`);
  console.log(`  current stage: ${bill.stageLabel || bill.stage} (${bill.stageDate || '?'})`);
  console.log(`  branches: ${branches.map(b => b.kind).join(', ')}${APPLY ? '' : '   [DRY RUN — nothing written]'}\n`);
  for (const [kind, why] of skipped) console.log(`  skipped ${kind}: ${why}`);

  const prepared = {};
  let blocked = 0;

  for (const br of branches) {
    const ev = specimenEvent(bill, br);
    const html = gen.renderDispatch(bill, ev, {
      publishedAt: sentinelPublishedAt(bill), changelogUrl: '/changelog/',
    });
    const checks = runPrepareChecks(html, bill, ev);
    const pass = checks.every(c => c.ok);

    console.log(`  ${pass ? 'CLEARED' : 'BLOCKED'}  ${br.kind.padEnd(14)} "${br.verb}"`);
    for (const c of checks.filter(x => !x.ok)) console.log(`             - ${c.check}: ${c.detail}`);

    if (!pass) {
      // A branch that cannot clear the event-independent checks must never sit
      // in data/prepared/ -- that folder is a claim that the QA is already done.
      blocked++;
      continue;
    }
    prepared[br.kind] = {
      verb: br.verb,
      chamber: br.chamber,
      renderKind: br.renderKind || br.kind,
      maskedSha: P.maskedFingerprint(html),
      checks,
      preparedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    };
  }

  if (!Object.keys(prepared).length) {
    console.error('\n  No branch cleared. Nothing prepared.');
    process.exit(1);
  }

  const rec = {
    _readme: 'Prepared Dispatch branches (Phase 2). Written by scripts/prepare-dispatch.js, read by dispatch-publish.js at fire time. maskedSha fingerprints the QA-cleared render with the event-volatile regions masked; see scripts/lib/prepared.js.',
    billId: bill.id,
    code: displayCode(bill.id),
    title: bill.title || '',
    preparedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    preparedFromStage: bill.stage || '',
    auditedFingerprint: P.auditedFingerprint(bill),
    expires: opt('expires') || '',
    note: opt('note') || '',
    branches: prepared,
  };

  if (!APPLY) {
    console.log(`\n  [dry run] would write data/prepared/${bill.id}.json with ${Object.keys(prepared).length} branch(es)${blocked ? `, ${blocked} blocked` : ''}.`);
    console.log('  Re-run with --apply to write it.');
    return;
  }

  const file = P.savePrepared(rec);
  const auto = Object.keys(prepared).filter(k => !P.MANUAL_ONLY.has(k));
  const manual = Object.keys(prepared).filter(k => P.MANUAL_ONLY.has(k));
  console.log(`\n  wrote ${path.relative(ROOT, file)} — ${Object.keys(prepared).length} branch(es) cleared${blocked ? `, ${blocked} blocked` : ''}.`);
  console.log(`  Auto:   ${auto.join(', ')} — these publish when the matching event fires.`);
  if (manual.length) {
    console.log(`  Manual: ${manual.join(', ')} — cleared and ready, but NO event can select them.`);
    console.log('          Publishing one is a deliberate human act and is not wired to anything.');
  }
  console.log('  An event matching NO prepared branch will BLOCK and be flagged for review.');
}

function main() {
  if (flag('list')) return cmdList();
  if (flag('check')) process.exit(cmdCheck());
  const billId = opt('bill');
  if (!billId) {
    console.error('usage: prepare-dispatch.js --bill <119-HR-1234> [--branches a,b] [--chamber Senate] [--expires YYYY-MM-DD] [--note "..."] [--apply]');
    console.error('       prepare-dispatch.js --list');
    console.error('       prepare-dispatch.js --check');
    process.exit(1);
  }
  cmdPrepare(billId);
}

if (require.main === module) main();

module.exports = { branchesFor, specimenEvent, runPrepareChecks, PREPARE_TIME_CHECKS };
