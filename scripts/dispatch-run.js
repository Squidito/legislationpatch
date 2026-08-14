#!/usr/bin/env node
// dispatch-run.js -- the whole Dispatch lane as one command.
//
//   detect -> stage -> GATE -> publish (or block) -> log
//     -> digest (changelog entry links to the dispatch, D3(a))
//     -> sitemap -> news sitemap -> feed -> search index -> IndexNow
//
// ORDER IS LOAD-BEARING, twice over:
//   * dispatch-publish runs BEFORE generate_digest so the edition rendered in
//     this pass can read data/dispatch-log.json and link back to the dispatch
//     it just published. That is decision D3, implementation (a) -- links
//     written at generation time, no frozen-edition patcher.
//   * every distribution step runs AFTER publishing, so a blocked dispatch is
//     never announced anywhere. IndexNow is last because it is the only
//     irreversible step: it tells search engines to come and fetch.
//
// If nothing published, the distribution steps are skipped entirely -- there
// is nothing new to announce and rewriting a sitemap for no reason only
// creates diff noise.
//
// Usage:
//   node scripts/dispatch-run.js --dry-run    # detect + gate, publish nothing
//   node scripts/dispatch-run.js              # the real thing
//   node scripts/dispatch-run.js --no-ping    # publish + wire, skip IndexNow

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const DRY  = args.includes('--dry-run');
const PING = !args.includes('--no-ping') && !DRY;

function run(label, script, extra = []) {
  console.log(`\n── ${label}`);
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, script), ...extra], {
      cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
    });
    process.stdout.write(out);
    return { ok: true, out };
  } catch (e) {
    process.stdout.write(String(e.stdout || ''));
    process.stderr.write(String(e.stderr || ''));
    return { ok: false, out: String(e.stdout || '') };
  }
}

/** URLs published in this pass, read back from the audit trail. */
function publishedUrls(runAt) {
  try {
    const log = JSON.parse(require('fs').readFileSync(path.join(ROOT, 'data', 'dispatch-log.json'), 'utf8'));
    return (log.entries || [])
      .filter(e => e.status === 'published' && e.loggedAt === runAt)
      .map(e => e.url);
  } catch { return []; }
}

function main() {
  console.log(`Dispatch lane${DRY ? ' (DRY RUN)' : ''}`);

  const passthrough = args.filter(a => !['--dry-run', '--no-ping'].includes(a));

  // ONE stamp for the whole run, handed to every step that needs to identify
  // "what this pass published". Each step deriving its own "now" is how the
  // publish step and the relink step ended up on different calendar days.
  const RUN_AT = passthrough.includes('--published-at')
    ? passthrough[passthrough.indexOf('--published-at') + 1]
    : new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const stamped = passthrough.includes('--published-at')
    ? passthrough
    : [...passthrough, '--published-at', RUN_AT];

  const pub = run('Publish (gate every draft, fail-closed)', 'dispatch-publish.js',
    DRY ? ['--dry-run', ...stamped] : stamped);
  if (!pub.ok) {
    console.error('\ndispatch-run: publishing step failed — stopping before any distribution.');
    process.exit(1);
  }

  const publishedSomething = /^\s*PUBLISHED\s/m.test(pub.out);
  if (DRY) {
    console.log('\nDRY RUN complete — nothing published, nothing distributed.');
    return;
  }
  if (!publishedSomething) {
    console.log('\nNothing published. Skipping distribution (no new URLs to announce).');
    return;
  }

  // The changelog edition for this pass, which links back to what just published.
  run('Changelog edition (links back to the dispatch)', 'generate_digest.js');
  // ...and now close the loop the other way. The dispatch published before the
  // edition existed, so it could only link to the hub; if an edition landed,
  // point it at that instead. Only our own just-published pages are touched.
  run('Relink dispatches to the edition', 'dispatch-relink.js', ['--logged-at', RUN_AT]);
  run('Sitemap',           'generate_sitemap.js');
  run('News sitemap (48h)', 'generate_news_sitemap.js');
  run('RSS feed',          'generate_feed.js');
  run('Search index',      'generate-search-index.js');
  run('Articles index',    'generate_articles_index.js');

  // IndexNow LAST, because it is the only irreversible step -- it tells search
  // engines to come and fetch. It also needs to be told WHAT to fetch: the
  // first version called indexnow-ping.js with no arguments, which just
  // printed its usage line and exited 1, so the publish path's final step
  // silently submitted nothing on every run. The URLs come from what this pass
  // actually published, read back out of the log.
  if (PING) {
    const urls = publishedUrls(RUN_AT);
    if (!urls.length) {
      console.log('\n── IndexNow ping\n  nothing published in this run to submit');
    } else {
      run('IndexNow ping', 'indexnow-ping.js', ['--url', urls.join(','), '--apply']);
    }
  } else {
    console.log('\n── IndexNow ping\n  skipped (--no-ping)');
  }

  console.log('\nDispatch lane complete.');
  console.log('  Review: data/dispatch-log.json  (or the patch-console Dispatch panel)');
}

main();
