// run-batch.js
// Master pipeline for processing new bills and CR quotes end-to-end.
//
// Usage:
//   node scripts/run-batch.js              — full pipeline (fetch + pause for analysis + post)
//   node scripts/run-batch.js --post       — skip fetch, run post-analysis steps only
//   node scripts/run-batch.js --fetch-only — fetch raw data and stop
//   node scripts/run-batch.js --days=N     — override CR lookback window (default 7)
//   node scripts/run-batch.js --validate   — run validation only

require('dotenv').config();
const { spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const DATA     = path.join(ROOT, 'data');
const SCRIPTS  = __dirname;

const POST_ONLY   = process.argv.includes('--post');
const FETCH_ONLY  = process.argv.includes('--fetch-only');
const VALIDATE    = process.argv.includes('--validate');
const CR_DAYS     = (process.argv.find(a => a.startsWith('--days=')) || '--days=7').split('=')[1];

// ── Helpers ────────────────────────────────────────────────────────────────

function header(msg) {
    console.log('\n' + '─'.repeat(56));
    console.log(`  ${msg}`);
    console.log('─'.repeat(56));
}

function run(label, scriptArgs, { optional = false } = {}) {
    header(label);
    const result = spawnSync('node', scriptArgs, { stdio: 'inherit', cwd: ROOT });
    if (result.status !== 0) {
        if (optional) {
            console.warn(`  ⚠️  ${label} exited with code ${result.status} — continuing.`);
        } else {
            console.error(`\n❌ Step failed: ${label}`);
            process.exit(result.status || 1);
        }
    }
}

function loadCache() {
    return JSON.parse(fs.readFileSync(path.join(DATA, 'cache.json'), 'utf8'));
}

function loadRaw() {
    try { return JSON.parse(fs.readFileSync(path.join(DATA, 'bills_raw.json'), 'utf8')); }
    catch (e) { return []; }
}

function findUnprocessed() {
    const raw       = loadRaw();
    const cachedIds = new Set(loadCache().bills.map(b => b.id));
    return raw.filter(b => !cachedIds.has(b.billId));
}

function findBillsNeedingVotes() {
    // 'dead' included: a bill that died ON THE FLOOR has a roll call too
    // (HCONRES-108 failed 189-235 but was skipped here; QA had to backfill it).
    const voteStages = new Set(['house', 'senate', 'signed', 'dead']);
    return loadCache().bills.filter(b =>
        b.analyzed &&
        voteStages.has(b.stage) &&
        (!b.votes || b.votes.length === 0)
    );
}

// ── Validate-only shortcut ─────────────────────────────────────────────────

if (VALIDATE) {
    run('Validate batch output', ['scripts/validate-batch.js']);
    process.exit(0);
}

// ── Main ───────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(56));
console.log('  LegislationPatch Batch Pipeline');
console.log('═'.repeat(56));

// ── Phase 1: Fetch ─────────────────────────────────────────────────────────

if (!POST_ONLY) {
    run('Fetch new bill data', ['scripts/fetch_bills_data.js']);
    run(`Fetch Congressional Record (last ${CR_DAYS} days)`, ['scripts/fetch_cr_data.js', `--days=${CR_DAYS}`]);
    // Auto-extract general (non-bill) floor statements from the cr_raw.json the
    // step above produced — "spicy filter" (oppose/support only, ranked by
    // shock, capped per day). Replaces hand-writing add_cr_quotes.js.
    run('Extract floor statements', ['scripts/extract_floor_quotes.js'], { optional: true });

    const unprocessed = findUnprocessed();
    // Cached bills that advanced past the version they were analyzed against
    // (refresh_stages sets needsReanalysis) — need latest-text re-fetch + re-analysis.
    const needReanalysis = loadCache().bills.filter(b => b.needsReanalysis && (b.stageDate || '') > (b.analyzedAt || ''));

    if (unprocessed.length > 0 || needReanalysis.length > 0) {
        console.log('\n' + '═'.repeat(56));
        console.log('  ⏸  MANUAL ANALYSIS REQUIRED');
        console.log('═'.repeat(56));
        if (unprocessed.length) {
            console.log('\n  New bills in bills_raw.json that need Claude analysis:\n');
            unprocessed.forEach(b => {
                console.log(`    • ${b.billId} — ${b.title}`);
                if (b.referenceHints?.likelyReferenceDependent) {
                    const cites = b.referenceHints.sources.map(s => s.citation).join(', ');
                    console.log(`        ↳ reference-dependent? consider fetching: ${cites}  (scripts/fetch-reference.js)`);
                }
            });
        }
        if (needReanalysis.length) {
            console.log('\n  Cached bills that ADVANCED and need RE-ANALYSIS against the LATEST text (version drift):\n');
            needReanalysis.forEach(b => console.log(`    • ${b.billId} — ${b.title || ''}  [now ${b.stageLabel || b.stage}]  → node scripts/fetch_bills_data.js --bill ${b.billId}, re-derive pages, re-analyze, clear needsReanalysis`));
        }
        console.log(`
  Instructions (per-bill checklist — see CLAUDE.md "Bill Analysis"):
  1. Open a Claude Code session in this project folder.
  2. For EACH bill, in order:
       a. npm run facts -- --bill <id>          (figures are COPIED from this
          sheet — add --sums for appropriations; never from memory)
       b. Clear every reference hint above: fetch it (fetch-reference.js),
          register + tag it, or explicitly note why it is not needed.
       c. Write the analysis per scripts/prompts.js SYSTEM_PROMPT,
          including "analyzedAt": today's date.
       d. npm run qa-verify -- --bill <id> --quote   — resolve every open
          flag NOW (fix, fetch, or adjudicate in data/qa-adjudications.json).
  3. If cr_raw.json has new dates, say: "Process cr_raw.json —
     extract quotes and add to quotes.json."
  4. ONE fresh-read pass over the new entries (genuine re-read of each
     bill's source vs its analysis — the only defense against semantic
     errors; see CLAUDE.md QA Loop Protocol).
  5. Once analysis is complete, run:

       node scripts/run-batch.js --post
`);
        process.exit(0);
    }

    console.log('\n  ✅ No new bills to analyze — continuing to post-analysis steps.');

    if (FETCH_ONLY) process.exit(0);
}

// ── Phase 2: Post-analysis ─────────────────────────────────────────────────

// Normalize authored-analysis formatting BEFORE any page generation or the
// validate gate: shorten raw dollar amounts ($7,500,000 -> $7.5M) and strip
// billSection annotations ("2(c) [amending 49 U.S.C. §109(h)]" -> "2(c)") the
// headless analysis may have written. Mechanical, idempotent, and quote-safe
// (skips verbatim CR fields) — kills the recurring "raw dollar amount" /
// "billSection non-ASCII" validate failures at the source instead of halting
// the whole run over one bill's misformatting.
run('Normalize analysis formatting', ['scripts/normalize-analysis.js', '--all'], { optional: true });

// Resilient run: triage the batch and pull any NEW bill whose analysis still
// fails a content check OUT of cache into data/analysis-quarantine.json, so one
// bad bill does not sink the whole batch. Runs BEFORE page/sitemap/search
// generation so those artifacts never include a quarantined bill. NOT optional:
// a non-zero exit means the failure could not be safely isolated (structural
// error, a live-bill regression, or too many failures) and the run must stop —
// exactly the old behaviour, now only for the cases that truly warrant it.
run('Quarantine failed bills (resilient run)', ['scripts/quarantine.js']);

// Refresh already-cached bills: resurface any that had new activity (bump
// stageDate → moves to top) and advance the stage on confident passage markers.
// Prints a RE-REVIEW list for any bill whose stage changed (prose is not auto-edited).
run('Refresh cached bill stages', ['scripts/refresh_stages.js', '--apply'], { optional: true });
// Reconcile the re-analysis queue from versionChanges — flag advanced bills whose
// text changed and whose analysis predates the advance (and clear re-analyzed ones).
// This makes the pipeline ACT on the version-diff data, not just warn about it.
run('Flag version drift for re-analysis', ['scripts/flag-version-drift.js'], { optional: true });

// Votes — only for bills missing them
const needVotes = findBillsNeedingVotes();
if (needVotes.length > 0) {
    header(`Fetch vote data (${needVotes.length} bill(s))`);
    for (const bill of needVotes) {
        console.log(`\n  → ${bill.id}`);
        const result = spawnSync('node', ['scripts/fetch_vote_data.js', `--bill`, bill.id], {
            stdio: 'inherit', cwd: ROOT
        });
        if (result.status !== 0) console.warn(`  ⚠️  Vote fetch failed for ${bill.id}`);
    }
} else {
    console.log('\n  ✅ All eligible bills already have vote data.');
}

run('Update rep profiles', ['scripts/generate_reps.js'], { optional: true });
// Record every text version per bill (Introduced -> ... -> Enrolled) for the
// Version Timeline. Re-run each batch so bills that advanced pick up new versions.
run('Fetch bill text versions', ['scripts/fetch_versions.js', '--apply'], { optional: true });
// Backfill CR floor quotes for any cached bill still missing featured_quotes.
// The fetch pipeline only fetches NOT-yet-cached bills, so a bill whose CR
// quotes were unavailable at analysis time (API down / recess / not yet posted)
// would otherwise stay quote-less forever. --all is regex-based (no LLM),
// idempotent (skips bills that already have quotes), and re-checks quote-less
// bills cheaply each run. Runs BEFORE the chamber backfill so new quotes get
// their chamber set in the same pass. (Resolves the May→June quote backlog.)
run('Backfill missing CR quotes', ['scripts/fetch_bill_cr.js', '--all'], { optional: true });
// Backfill chamber onto featured/standalone quotes from the (just-refreshed)
// reps-index, so quoteTagline() can render "House/Senate floor …" consistently.
run('Backfill quote chamber', ['scripts/backfill_quote_chamber.js', '--apply'], { optional: true });
// Emit the per-bill static SEO pages + slug map/index and inject the crawlable
// homepage bill list. Runs BEFORE the sitemap so the sitemap reflects the slugs.
run('Generate static bill pages', ['scripts/generate_bill_pages.js'], { optional: true });
// Emit the per-member static SEO pages + rep slug map/index and inject the
// crawlable member directory into reps.html. Runs AFTER bill pages (reads
// data/slug-index.json for the crawlable vote/statement cross-links) and
// BEFORE the sitemap so the sitemap reflects the rep slugs.
run('Generate static rep pages', ['scripts/generate_rep_pages.js'], { optional: true });
// Render per-bill social cards (og/bills/<id>.png). Runs AFTER the pages (which
// reference og/bills/<id>.png) and BEFORE the sitemap (which lists no images).
// Manifest-gated: only bills whose card inputs changed re-render.
run('Generate per-bill + article + hub OG cards', ['scripts/generate_brand_assets.js', '--bills', '--articles'], { optional: true });
// "Congress Patch Notes" changelog: diff cache.json against data/digest-state.json
// and emit a dated edition for whatever advanced / passed / was signed. Emits
// nothing when nothing changed. Runs AFTER the OG cards and BEFORE the sitemap
// so the sitemap picks up any new changelog/ pages this run produced.
run('Generate changelog digest', ['scripts/generate_digest.js'], { optional: true });
// Topic hubs (/topics/<slug>/) aggregate the corpus, so they re-render whenever
// bills or articles moved. Runs AFTER bill pages (reads the slug map) and BEFORE
// the sitemap (which lists hub URLs). Also maintains the spoke links in member
// articles — bidirectional linking is a system, not a cleanup task.
run('Generate topic hubs', ['scripts/generate_topic_hubs.js'], { optional: true });
// RSS 2.0 feed of the changelog editions. Runs AFTER the digest (reads the
// editions ledger it writes); does not affect the sitemap.
run('Generate RSS feed', ['scripts/generate_feed.js'], { optional: true });
run('Regenerate sitemap', ['scripts/generate_sitemap.js'], { optional: true });
run('Regenerate search index', ['scripts/generate-search-index.js'], { optional: true });
// Advisory: flag any article whose referenced bill has moved past the article's
// "last updated" date. Prints only — never blocks (a parallel process owns articles/).
run('Article staleness (advisory)', ['scripts/article-staleness.js'], { optional: true });
run('Validate batch output', ['scripts/validate-batch.js']);

console.log('\n' + '═'.repeat(56));
console.log('  Batch pipeline complete.');
console.log('  Review any warnings above, then push when ready.');
console.log('═'.repeat(56) + '\n');
