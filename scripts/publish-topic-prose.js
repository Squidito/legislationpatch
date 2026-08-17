#!/usr/bin/env node
// publish-topic-prose.js — move an AUDITED hub-prose draft into its published
// home (data/topics/<slug>-prose.html) and regenerate the hubs that inject it.
//
//   node scripts/publish-topic-prose.js --slug government-spending            (dry run)
//   node scripts/publish-topic-prose.js --slug government-spending --apply
//
// The topic twin of publish-article.js. The draft lives at
// drafts/topic-<slug>.html (a FRAGMENT: <p>/<h2> prose only, no page shell) and
// is audited under ledger data/qa-ledger/article-topic-<slug>.json by the same
// patch-console runner as an explainer. Publishing moves the fragment, then
// generate_topic_hubs.js injects it fail-closed on every future regeneration.
// Never commits, pushes, or pings.

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
    console.error('Usage: node scripts/publish-topic-prose.js --slug <hub-slug> [--apply]');
    process.exit(1);
}

const CFG_REL = `data/topics/${SLUG}.json`;
const DRAFT_REL = `drafts/topic-${SLUG}.html`;
const TARGET_REL = `data/topics/${SLUG}-prose.html`;
const LEDGER_REL = `data/qa-ledger/article-topic-${SLUG}.json`;
const DRAFT = path.join(ROOT, DRAFT_REL);
const TARGET = path.join(ROOT, TARGET_REL);

const fail = (m) => { console.error(`  ❌ ${m}`); process.exit(1); };
const ok = (m) => console.log(`  ✅ ${m}`);
const note = (m) => console.log(`  · ${m}`);

function runNode(script, label, extra = []) {
    const abs = path.join(ROOT, script);
    if (!fs.existsSync(abs)) fail(`missing script ${script}`);
    const r = spawnSync(process.execPath, [abs, ...extra], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    if (r.error) fail(`could not run ${label}: ${r.error.message}`);
    return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

console.log(`\npublish-topic-prose: ${SLUG}${APPLY ? '' : '   (DRY RUN — nothing is written; add --apply)'}\n`);

// ── 1. Preconditions ───────────────────────────────────────────────────────
console.log('── Preconditions');
if (!fs.existsSync(path.join(ROOT, CFG_REL))) fail(`no hub config at ${CFG_REL} — unknown hub`);
ok(`hub config present: ${CFG_REL}`);

if (!fs.existsSync(DRAFT)) fail(`no draft at ${DRAFT_REL}`);
ok(`draft present: ${DRAFT_REL}`);

if (fs.existsSync(TARGET)) fail(`${TARGET_REL} already exists — remove or re-audit deliberately first, never overwrite audited prose silently`);
ok(`${TARGET_REL} is free`);

// Fragment discipline: this file is INJECTED into a generated page. A page
// shell would nest documents; a script tag would be an injection surface.
const frag = fs.readFileSync(DRAFT, 'utf8');
for (const bad of ['<html', '<head', '<body', '<script', 'javascript:']) {
    if (frag.toLowerCase().includes(bad)) fail(`draft contains "${bad}" — hub prose is a fragment (<p>/<h2>/<a> only), not a page`);
}
if (!/<h2[\s>]/.test(frag)) note('draft has no <h2> sections — allowed, but the ruling was intro + question-shaped sections');
ok('fragment discipline holds (no shell, no scripts)');

const ledger = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, LEDGER_REL), 'utf8')); } catch (e) { return null; } })();
if (!ledger) fail(`no audit ledger at ${LEDGER_REL} — unaudited prose is not publishable`);
if (!AL.isArticleLedger(ledger)) fail(`${LEDGER_REL} is not an article-lane ledger`);
if (ledger.status !== 'audited' || ledger.depth !== 'full-claims') fail(`ledger status "${ledger.status}"/"${ledger.depth}" — needs "audited"/"full-claims"`);
const claims = ledger.claims || [];
if (!claims.length) fail('ledger has zero claims');
const open = claims.filter(c => c.status === 'open' && c.verdict !== 'SUPPORTED' && c.verify !== 'REJECTED');
if (open.length) fail(`${open.length} open flag(s) on the ledger — converge first`);
const unbound = claims.filter(c => (c.sourceSpan || '').trim() && !c.sourceFile);
if (unbound.length) fail(`${unbound.length} receipt(s) with no sourceFile binding`);
ok(`ledger audited: ${claims.length} claim(s), 0 open flags, receipts bound`);

const match = AL.proseMatchesLedger(ledger);
if (!match.ok) fail(`ledger does not describe the current draft — ${match.reason}`);
ok('ledger describes the prose on disk (proseSha matches)');

// ── 2. Gates ───────────────────────────────────────────────────────────────
console.log('\n── Gates');
const rec = runNode('scripts/qa-receipts.js', 'qa-receipts');
if (!rec.ok) { console.log(rec.out.slice(-1200)); fail('qa-receipts failed'); }
ok('qa-receipts passed');

if (!APPLY) {
    console.log('\n  Dry run complete. Re-run with --apply to publish.\n');
    process.exit(0);
}

// ── 3. Move + regenerate ───────────────────────────────────────────────────
console.log('\n── Publishing');
fs.writeFileSync(TARGET, frag, 'utf8');
if (fs.readFileSync(TARGET, 'utf8') !== frag) fail('target read-back mismatch');
fs.unlinkSync(DRAFT);
if (fs.existsSync(DRAFT)) fail('draft still present after unlink');
ok(`moved ${DRAFT_REL} -> ${TARGET_REL}`);

// The ledger must still bind now that the prose moved (AL resolves the
// data/topics/ home for topic-* slugs). No stamp = FAIL, never pass.
const match2 = AL.proseMatchesLedger(ledger);
if (!match2.ok) fail(`ledger no longer matches after the move — ${match2.reason}`);
ok('ledger still binds at the published path');

const hub = runNode('scripts/generate_topic_hubs.js', 'topic hubs');
if (!hub.ok) { console.log(hub.out.slice(-1200)); fail('hub regeneration failed — the injection gate refused'); }
ok('hubs regenerated with the audited prose injected');

// Prove the prose is actually IN the page, not just accepted.
const hubPage = fs.readFileSync(path.join(ROOT, 'topics', SLUG, 'index.html'), 'utf8');
const probe = frag.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
if (!hubPage.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').includes(probe)) fail('hub page does not contain the published prose');
ok('hub page carries the prose (read back)');

// Register with the audit-freshness tripwire, scoped to this entry.
const BASELINE = path.join(ROOT, 'data', 'qa-regression-baseline.json');
const baseline = (() => { try { return JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { return null; } })();
if (baseline) {
    const h = AL.proseHash(ledger);
    if (!h) fail('could not hash published prose for the baseline');
    baseline[ledger.id] = h;
    fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
    ok(`qa-regression baseline carries ${ledger.id} @ ${h}`);
} else note('no baseline on disk — gate bootstraps on next run');

console.log(`\n  Published locally. NOT committed, NOT pushed.\n`);
console.log(`  Next: git add -A && git commit -m "Hub prose: ${SLUG}"  (push stays yours)\n`);
