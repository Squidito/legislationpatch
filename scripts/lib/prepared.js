// prepared.js -- Prepared Dispatch (Phase 2): the branch drafts that let a
// dispatch publish minutes after an event whose fidelity gate was cleared days
// earlier, at leisure.
//
// THE IDEA, stolen from newsroom practice (ARTICLE-WRITER-SPEC §4): a bill with
// a known upcoming floor vote gets EVERY outcome drafted in advance -- passed,
// failed, signed, vetoed -- each one QA'd while there is no clock running. When
// the event fires, the pipeline picks the branch that matches, injects the real
// vote numbers, and publishes.
//
// WHAT A PREPARED BRANCH IS NOT: it is not stored HTML that gets shipped. That
// would rot the moment the generator or the audited entry changed, and would
// ship a page nobody re-checked. Instead a branch stores a FINGERPRINT of the
// page it was QA'd as, with everything the event legitimately changes masked
// out. At fire time the page is rendered fresh by the normal generator and the
// same mask is applied; the two fingerprints must match. So:
//
//   * the audited substance (top_lines, title, sponsor, sources) is frozen at
//     QA time and any later drift BLOCKS;
//   * the volatile facts (tally, roll number, dates, stage label, URLs) are
//     free to be whatever actually happened -- they are checked by the existing
//     seven-check gate, which is not modified by this phase.
//
// WHAT IS VERIFIABLE AT PREPARE TIME. Five of the seven gate checks do not
// depend on the event and are run before a branch may sit in data/prepared/
// (James's standing directive: nothing waits in that folder unverified):
// figures-in-audited-entry, no-unsourced-qualifiers, no-smart-quotes,
// newsarticle-fields, no-named-parties. The other two -- votes-match-record and
// stage-corroborated -- cannot be checked before the vote exists, and are run
// unchanged by dispatch-gate.js at fire time. Nothing here weakens either.
//
// OPT-IN, NEVER A NEW BLOCKER. A bill with no prepared record publishes exactly
// as it did in Phase 1. That is deliberate: the corpus simulation (211/211, zero
// false blocks) is the regression bar, and a phase that added a gate to every
// bill would move it.

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT     = path.join(__dirname, '..', '..');
const PREPARED = path.join(ROOT, 'data', 'prepared');

/**
 * The branch kinds that can exist.
 *
 * The first five are the D2 threshold kinds -- the outcomes the event detector
 * can produce on its own. The last two are James's call (2026-08-14) and behave
 * differently on purpose:
 *
 *   "amended" -- AUTO-SELECTABLE, but not a threshold kind of its own. A bill
 *                that passes in amended form fires an ordinary passage event;
 *                what marks it is the vote record's question ("On Motion to
 *                Concur in the Senate Amendment"). When a record carries an
 *                amended branch and the vote says amendment, that branch is
 *                selected instead of the plain passage one and its verb is
 *                used. This is the normal path for a CR, which is exactly why
 *                it is worth having.
 *   "pulled"  -- MANUAL ONLY. A pulled bill's stage does not change, so no
 *                event ever fires, and pulls are not observable from any feed
 *                found (0 of 376 scheduled items across 20 session weeks of the
 *                House floor schedule carried a remove-date). It can be drafted
 *                and cleared so a page is ready; publishing it is a deliberate
 *                human act and is NOT wired to anything automatic.
 *
 * See _personal/PHASE2-SCHEDULE-RESEARCH.md §1.1 and §4.
 */
const BRANCH_KINDS = ['passed-house', 'passed-senate', 'failed-floor', 'signed', 'vetoed', 'amended', 'pulled'];

/** Branches nothing may ever select automatically. */
const MANUAL_ONLY = new Set(['pulled']);

/**
 * Does this vote record describe passage in amended form?
 *
 * Reads the stored question, which is the chamber's own words -- across the
 * corpus that is "On Motion to Concur in the Senate Amendment(s)". Both real
 * shapes (a chamber amending and passing, or concurring in the other chamber's
 * amendment) mean the same thing for the reader: what passed was not the text
 * this chamber started with.
 */
function voteIndicatesAmendment(vote) {
  return !!vote && /amendment/i.test(String(vote.question || ''));
}

/** Stage -> the kind that fires when a bill reaches it (mirrors THRESHOLD). */
const KIND_FOR_STAGE = {
  house: 'passed-house', senate: 'passed-senate',
  signed: 'signed', vetoed: 'vetoed', dead: 'failed-floor',
};

const sha256 = s => 'sha256:' + crypto.createHash('sha256').update(s, 'utf8').digest('hex');

const preparedPath = billId => path.join(PREPARED, `${billId}.json`);

function loadPrepared(billId) {
  try { return JSON.parse(fs.readFileSync(preparedPath(billId), 'utf8')); }
  catch { return null; }
}

/** Every prepared record on disk, in stable id order. */
function listPrepared() {
  if (!fs.existsSync(PREPARED)) return [];
  return fs.readdirSync(PREPARED)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(PREPARED, f), 'utf8')); } catch { return null; } })
    .filter(Boolean);
}

/** Write + read back and assert. A "wrote it" log with no read-back is the bug
 *  class this project has shipped twice. */
function savePrepared(rec) {
  fs.mkdirSync(PREPARED, { recursive: true });
  const file = preparedPath(rec.billId);
  const body = JSON.stringify(rec, null, 2) + '\n';
  fs.writeFileSync(file, body);
  const back = fs.readFileSync(file, 'utf8');
  if (back !== body) throw new Error(`prepared write verification FAILED for ${rec.billId}`);
  return file;
}

/**
 * Fingerprint of the AUDITED substance a dispatch draws on.
 *
 * Deliberately excludes stage/stageLabel/stageDate/enactedDate: those are what
 * the event changes. Includes analyzedAt, so a re-audit voids the prepared QA
 * even in the rare case where the re-audit happened to render identically --
 * the branch was cleared against a specific audited entry, not against a
 * coincidence of output.
 */
function auditedFingerprint(bill) {
  return sha256(JSON.stringify({
    id:        bill.id,
    title:     bill.title || '',
    sponsor:   bill.sponsor || '',
    analyzedAt: bill.analyzedAt || '',
    top_lines: bill.top_lines || [],
    versions:  (bill.versions || []).map(v => ({ type: v && v.type, url: v && v.url })),
  }));
}

// ── The mask ─────────────────────────────────────────────────────────────────
//
// Everything the event legitimately changes between prepare time and fire time,
// replaced by a fixed token. Ordered longest-pattern-first so a timestamp is not
// half-eaten by the date rule.
//
// UNDER-masking causes false blocks on correct pages. OVER-masking makes the
// check decorative. The list below is exactly the set of regions the generator
// derives from the event, the clock, or the post-event stage -- everything else
// (headline verb, bill title, top_lines, sponsor, source links, disclosure,
// schema shape) stays under the fingerprint, which is the point.
const MASK_RULES = [
  // ISO timestamps (datePublished / dateModified) before bare dates
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/g,                      '[[TS]]'],
  // the vote sentence -- tally, roll number, or the voice-vote form
  [/The (?:recorded vote was|question was decided by)[^<]*/g,     '[[VOTE]]'],
  // the post-event stage label
  [/Stage: <strong>[^<]*<\/strong>/g,                             'Stage: <strong>[[STAGE]]</strong>'],
  // the changelog link -- two-way vs one-way depends on when it published
  [/<li><a href="\/changelog\/[^<]*<\/a><\/li>/g,                 '[[CHANGELOG]]'],
  // the description string, in all three places it appears.
  //
  // NOT because its content is uninteresting, but because the generator builds
  // it as `code, title -- verb on DATE. ...` and then .slice(0, 200)s it. The
  // event date sits near the end, so a longer month name shifts the truncation
  // point and can cut the date in half -- after which no date rule matches and
  // a perfectly correct page fails the fingerprint. The title and verb it
  // contains are still protected: both appear unmasked in the h1, og:title,
  // the body paragraph and the JSON-LD about.name.
  [/<meta name="description" content="[^"]*"/g,                   '<meta name="description" content="[[DESC]]"'],
  [/<meta property="og:description" content="[^"]*"/g,            '<meta property="og:description" content="[[DESC]]"'],
  [/"description":"(?:[^"\\]|\\.)*"/g,                            '"description":"[[DESC]]"'],
  // human dates ("September 18, 2026") anywhere -- status line, meta, description
  [/\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/g, '[[DATE]]'],
  // ISO dates anywhere -- including inside the slug in canonical/og/@id URLs
  [/\d{4}-\d{2}-\d{2}/g,                                          '[[D]]'],
];

function maskVolatile(html) {
  return MASK_RULES.reduce((s, [re, tok]) => s.replace(re, tok), String(html));
}

const maskedFingerprint = html => sha256(maskVolatile(html));

// ── Selection at fire time ───────────────────────────────────────────────────

/**
 * Which prepared branch, if any, matches this event?
 *
 * Matching is on kind AND verb. The verb carries the chamber for failed-floor
 * ("failed on the Senate floor"), so a bill prepared for a Senate defeat that
 * instead dies in the House does NOT match -- which is correct: that page was
 * never QA'd.
 */
function selectBranch(rec, event) {
  if (!rec || !rec.branches) return { ok: false, reason: 'no prepared record' };

  // A passage that the record shows was in amended form takes the amended
  // branch, whose verb differs. Checked BEFORE the plain kind lookup, because
  // both branches can legitimately be prepared for the same event kind.
  if (voteIndicatesAmendment(event.vote)) {
    const a = rec.branches.amended;
    if (a) return { ok: true, key: 'amended', branch: a, verbOverride: a.verb };
    // Fail closed. The vote says the text changed; the only cleared draft says
    // it passed unqualified. That is a page a human should see first.
    return { ok: false, reason: `the vote record says this passed in amended form ("${String(event.vote.question || '').slice(0, 48)}") and no amended branch was prepared` };
  }

  const b = rec.branches[event.kind];
  if (!b) {
    const avail = Object.keys(rec.branches).filter(k => !MANUAL_ONLY.has(k));
    return { ok: false, reason: `event "${event.kind}" matches no prepared branch (prepared: ${avail.join(', ') || 'none'})` };
  }
  if (MANUAL_ONLY.has(event.kind)) {
    return { ok: false, reason: `branch "${event.kind}" is manual-only and may never be selected automatically` };
  }
  if (b.verb !== event.verb) {
    return { ok: false, reason: `branch "${event.kind}" was prepared for "${b.verb}" but the event is "${event.verb}"` };
  }
  return { ok: true, key: event.kind, branch: b };
}

/**
 * The fire-time checks, returned in the same {name, ok, detail} shape the gate
 * uses so the publisher can log them together.
 *
 * A bill with NO prepared record returns [] -- Phase 1 behaviour, unchanged.
 * A bill WITH one must satisfy every check or the dispatch is blocked and
 * flagged: having committed to a prepared set is a statement that these are the
 * outcomes we cleared, so an unprepared outcome is exactly the case that must
 * wait for a human.
 */
function checkPrepared({ rec, bill, event, html, today }) {
  if (!rec) return [];
  const out = [];

  const sel = selectBranch(rec, event);
  out.push({ name: 'prepared-branch-matched', ok: sel.ok,
             detail: sel.ok ? `branch "${sel.key}" selected` : sel.reason });

  const day = String(today || '').slice(0, 10);
  const expired = rec.expires && day && day > rec.expires;
  out.push({ name: 'prepared-not-expired', ok: !expired,
             detail: expired ? `prepared set expired ${rec.expires} (today ${day}) -- re-prepare and re-QA`
                             : (rec.expires ? `valid through ${rec.expires}` : 'no expiry set') });

  const fp = auditedFingerprint(bill);
  const fpOk = fp === rec.auditedFingerprint;
  out.push({ name: 'prepared-audited-unchanged', ok: fpOk,
             detail: fpOk ? 'audited entry unchanged since QA'
                          : 'the audited cache entry changed after this branch was QA\'d -- re-prepare' });

  if (sel.ok) {
    const now = maskedFingerprint(html);
    const same = now === sel.branch.maskedSha;
    out.push({ name: 'prepared-render-matches', ok: same,
               detail: same ? 'page matches the QA-cleared draft outside the event facts'
                            : 'the rendered page differs from the QA-cleared draft outside the vote/date fields' });
  } else {
    // No branch -> nothing to compare against. Fail-closed, never a skip.
    out.push({ name: 'prepared-render-matches', ok: false,
               detail: 'no matching prepared branch to compare against' });
  }

  return out;
}

module.exports = {
  PREPARED, BRANCH_KINDS, KIND_FOR_STAGE, MANUAL_ONLY,
  preparedPath, loadPrepared, listPrepared, savePrepared,
  auditedFingerprint, maskVolatile, maskedFingerprint,
  selectBranch, checkPrepared, sha256, voteIndicatesAmendment,
};
