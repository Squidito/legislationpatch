#!/usr/bin/env node
// publish-article.js — move an AUDITED explainer draft into articles/ and refresh
// every generated surface that must know about it.
//
//   node scripts/publish-article.js --slug suspension-of-the-rules            (dry run)
//   node scripts/publish-article.js --slug suspension-of-the-rules --apply
//
// THIS IS THE ONLY THING THAT MAKES AN ARTICLE REAL, and it runs only when James
// says so. Drafts live in drafts/ (gitignored) precisely because the repo root
// deploys: anything in articles/ is treated as live by the sitemap, the search
// index, the article index and the staleness checker.
//
// It refuses to publish unless the audit actually converged:
//   - a full-claims ledger exists, status "audited", with zero open flags
//   - every receipt still resolves (npm run qa-receipts)
//   - the structural page gate passes (npm run preflight)
//   - articles/<slug>.html does not already exist (never a silent overwrite)
//
// It does NOT commit, push, or ping IndexNow. The site serves `main` from GitHub
// Pages, so an article published locally does not exist on the web until James
// pushes — telling crawlers to fetch it first would spend the one irreversible
// step in the pipeline on a 404. The follow-up commands are printed instead.

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const AL = require('./lib/article-ledger');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const SLUG = opt('slug');
const APPLY = args.includes('--apply');

if (!SLUG || !/^[a-z0-9-]+$/.test(SLUG)) {
    console.error('Usage: node scripts/publish-article.js --slug <article-slug> [--apply]');
    process.exit(1);
}

const DRAFT_REL = `drafts/${SLUG}.html`;
const TARGET_REL = `articles/${SLUG}.html`;
const LEDGER_REL = `data/qa-ledger/article-${SLUG}.json`;
const DRAFT = path.join(ROOT, DRAFT_REL);
const TARGET = path.join(ROOT, TARGET_REL);
const LEDGER = path.join(ROOT, LEDGER_REL);

const fail = (m) => { console.error(`  ❌ ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✅ ${m}`);
const note = (m) => console.log(`  · ${m}`);

// Local date, deliberately not UTC. The digest dates its editions by local day
// and the two disagreeing by a day at 03:00 UTC has already been a real bug.
function localDate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localMonthYear(d = new Date()) {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function runNode(script, label) {
    const abs = path.join(ROOT, script);
    if (!fs.existsSync(abs)) fail(`missing script ${script}`);
    const r = spawnSync(process.execPath, [abs], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    if (r.error) fail(`could not run ${label}: ${r.error.message}`);
    return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

console.log(`\npublish-article: ${SLUG}${APPLY ? '' : '   (DRY RUN — nothing is written; add --apply)'}\n`);

// ── 1. Preconditions ───────────────────────────────────────────────────────
console.log('── Preconditions');
if (!fs.existsSync(DRAFT)) fail(`no draft at ${DRAFT_REL}`);
ok(`draft present: ${DRAFT_REL}`);

if (fs.existsSync(TARGET)) fail(`${TARGET_REL} already exists — refusing to overwrite a live article. Remove or rename it deliberately first.`);
ok(`${TARGET_REL} is free`);

const ledger = (() => { try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch (e) { return null; } })();
if (!ledger) fail(`no audit ledger at ${LEDGER_REL} — an unaudited draft is not publishable`);
if (!AL.isArticleLedger(ledger)) fail(`${LEDGER_REL} is not an article ledger`);
if (ledger.status !== 'audited' || ledger.depth !== 'full-claims') {
    fail(`ledger status is "${ledger.status}"/"${ledger.depth}" — needs status "audited", depth "full-claims"`);
}
const claims = ledger.claims || [];
if (!claims.length) fail('ledger has zero claims — the audit did not decompose the draft');
const open = claims.filter(c => c.status === 'open' && c.verdict !== 'SUPPORTED' && c.verify !== 'REJECTED');
if (open.length) fail(`${open.length} open flag(s) still on the ledger — converge the audit first`);
ok(`ledger audited: ${claims.length} claim(s), ${claims.filter(c => c.verdict === 'SUPPORTED').length} supported, 0 open flags`);

const unbound = claims.filter(c => (c.sourceSpan || '').trim() && !c.sourceFile);
if (unbound.length) fail(`${unbound.length} claim(s) carry a receipt with no sourceFile binding`);
ok('every receipt names its source');

// ── 2. Gates on the current tree ───────────────────────────────────────────
console.log('\n── Gates');
for (const [script, label] of [['scripts/qa-receipts.js', 'qa-receipts'], ['scripts/preflight.js', 'preflight']]) {
    const r = runNode(script, label);
    if (!r.ok) { console.log(r.out.slice(-1200)); fail(`${label} failed — not publishing`); }
    ok(`${label} passed`);
}

if (!APPLY) {
    console.log('\n  Dry run complete. Everything needed to publish is in place.');
    console.log(`  Run again with --apply to move ${DRAFT_REL} -> ${TARGET_REL}.\n`);
    process.exit(0);
}

// ── 3. Move + re-stamp ─────────────────────────────────────────────────────
// A draft can sit for days between audit and approval, so publication dates are
// stamped HERE, not when the draft was written. Everything else moves byte-for-
// byte: the draft was authored with articles/ relative paths on purpose, so
// publishing rewrites no links.
console.log('\n── Publishing');
let html = fs.readFileSync(DRAFT, 'utf8');
const today = localDate();
const monthYear = localMonthYear();

const before = html;
html = html.replace(/"datePublished":\s*"[^"]*"/, `"datePublished": "${today}"`);
html = html.replace(/"dateModified":\s*"[^"]*"/, `"dateModified": "${today}"`);
html = html.replace(/<span>Published [^<]*<\/span>/, `<span>Published ${monthYear}</span>`);
if (html === before) note('no date fields matched — publishing the draft unchanged');

fs.writeFileSync(TARGET, html, 'utf8');
// Read back and assert (a success log without a read-back is the known bug class).
const written = fs.readFileSync(TARGET, 'utf8');
if (!written.includes(`"datePublished": "${today}"`)) fail('published file does not carry the new datePublished — aborting before the draft is removed');
if (written.length !== html.length) fail('published file does not match what was written');
ok(`wrote ${TARGET_REL} (datePublished ${today})`);

fs.unlinkSync(DRAFT);
if (fs.existsSync(DRAFT)) fail('draft still present after unlink');
ok(`removed ${DRAFT_REL}`);

// ── 4. Regenerate every surface that must know ─────────────────────────────
console.log('\n── Generated surfaces');
for (const [script, label] of [
    ['scripts/generate_articles_index.js', 'articles index'],
    ['scripts/generate_sitemap.js', 'sitemap'],
    ['scripts/generate-search-index.js', 'search index'],
    ['scripts/generate_author_page.js', 'author page'],
    ['scripts/generate_news_sitemap.js', 'news sitemap'],
]) {
    const r = runNode(script, label);
    if (!r.ok) { console.log(r.out.slice(-800)); fail(`${label} generation failed`); }
    ok(label + ' regenerated');
}
note('feed.xml carries changelog editions only — an article publish does not change it (known gap)');

// Prove the article is actually reachable now, rather than trusting the logs.
console.log('\n── Read-back');
const idx = fs.readFileSync(path.join(ROOT, 'articles', 'index.html'), 'utf8');
if (!idx.includes(`${SLUG}.html`)) fail('articles/index.html does not link the new article');
ok('articles/index.html links it');
const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
if (!sm.includes(`/articles/${SLUG}.html`)) fail('sitemap.xml does not list the new article');
ok('sitemap.xml lists it');
const si = fs.readFileSync(path.join(ROOT, 'data', 'search-index.json'), 'utf8');
if (!si.includes(SLUG)) fail('search-index.json does not contain the new article');
ok('search-index.json contains it');

// Stamp provenance so a later source change re-triggers this article's audit.
const pv = runNode('scripts/qa-provenance-stamp.js', 'qa-provenance');
if (pv.ok) ok('qa-provenance stamped'); else note('qa-provenance stamp failed (non-blocking): ' + pv.out.slice(-200));

console.log(`\n  Published locally. NOT committed, NOT pushed, NO IndexNow ping.\n`);
console.log('  Next, when you want it live:');
console.log(`    git add -A && git commit -m "Publish explainer: ${SLUG}"`);
console.log('    (then merge dev -> main and push — your call, as always)');
console.log(`    after it is live:  npm run indexnow -- --url https://legislationpatch.com/articles/${SLUG}.html\n`);
