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
    const voteStages = new Set(['house', 'senate', 'signed']);
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

    const unprocessed = findUnprocessed();

    if (unprocessed.length > 0) {
        console.log('\n' + '═'.repeat(56));
        console.log('  ⏸  MANUAL ANALYSIS REQUIRED');
        console.log('═'.repeat(56));
        console.log('\n  New bills in bills_raw.json that need Claude analysis:\n');
        unprocessed.forEach(b => {
            console.log(`    • ${b.billId} — ${b.title}`);
            if (b.referenceHints?.likelyReferenceDependent) {
                const cites = b.referenceHints.sources.map(s => s.citation).join(', ');
                console.log(`        ↳ reference-dependent? consider fetching: ${cites}  (scripts/fetch-reference.js)`);
            }
        });
        console.log(`
  Instructions:
  1. Open a Claude Code session in this project folder.
  2. Say: "Process bills_raw.json — analyze each bill and write
     entries to cache.json following CLAUDE.md rules."
  3. If cr_raw.json has new dates, say: "Process cr_raw.json —
     extract quotes and add to quotes.json."
  4. Once analysis is complete, run:

       node scripts/run-batch.js --post
`);
        process.exit(0);
    }

    console.log('\n  ✅ No new bills to analyze — continuing to post-analysis steps.');

    if (FETCH_ONLY) process.exit(0);
}

// ── Phase 2: Post-analysis ─────────────────────────────────────────────────

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
run('Regenerate sitemap', ['scripts/generate_sitemap.js'], { optional: true });
run('Validate batch output', ['scripts/validate-batch.js']);

console.log('\n' + '═'.repeat(56));
console.log('  Batch pipeline complete.');
console.log('  Review any warnings above, then push when ready.');
console.log('═'.repeat(56) + '\n');
