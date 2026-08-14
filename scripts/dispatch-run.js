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

function main() {
  console.log(`Dispatch lane${DRY ? ' (DRY RUN)' : ''}`);

  const passthrough = args.filter(a => !['--dry-run', '--no-ping'].includes(a));

  const pub = run('Publish (gate every draft, fail-closed)', 'dispatch-publish.js',
    DRY ? ['--dry-run', ...passthrough] : passthrough);
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
  run('Sitemap',           'generate_sitemap.js');
  run('News sitemap (48h)', 'generate_news_sitemap.js');
  run('RSS feed',          'generate_feed.js');
  run('Search index',      'generate-search-index.js');
  run('Articles index',    'generate_articles_index.js');

  if (PING) {
    run('IndexNow ping', 'indexnow-ping.js');
  } else {
    console.log('\n── IndexNow ping\n  skipped (--no-ping)');
  }

  console.log('\nDispatch lane complete.');
  console.log('  Review: data/dispatch-log.json  (or the patch-console Dispatch panel)');
}

main();
