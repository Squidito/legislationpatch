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
// --refresh re-stamps an ALREADY-LIVE article (Phase 6 living-article loop).
// It re-stamps dateModified ONLY, and only when the audited claim substance
// actually changed (D4, 2026-08-19) — never datePublished. Plain publish stays
// the first-publish path: it refuses to overwrite a live article.
const REFRESH = args.includes('--refresh');
// --reason correction force-bumps dateModified even when the substance hash is
// unchanged: a logged correction is a D4 bump trigger in its own right.
const REASON = opt('reason');

if (!SLUG || !/^[a-z0-9-]+$/.test(SLUG)) {
    console.error('Usage: node scripts/publish-article.js --slug <article-slug> [--apply]');
    console.error('       node scripts/publish-article.js --slug <slug> --refresh [--apply] [--reason correction]');
    process.exit(1);
}

const DRAFT_REL = `drafts/${SLUG}.html`;
const TARGET_REL = `articles/${SLUG}.html`;
const LEDGER_REL = `data/qa-ledger/article-${SLUG}.json`;
const DRAFT = path.join(ROOT, DRAFT_REL);
const TARGET = path.join(ROOT, TARGET_REL);
const LEDGER = path.join(ROOT, LEDGER_REL);
// D4 date-state sidecar: slug -> { datePublished, dateModified, substanceHash,
// refreshedAt }. The stored substanceHash is what a later refresh compares
// against to decide bump-or-not. Not consumed by the mobile app (no parity
// impact — it is publish-time bookkeeping, not article data).
const DATE_STATE_REL = 'data/article-date-state.json';
const DATE_STATE = path.join(ROOT, DATE_STATE_REL);
const readJsonSafe = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } };

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

function runNode(script, label, args = []) {
    const abs = path.join(ROOT, script);
    if (!fs.existsSync(abs)) fail(`missing script ${script}`);
    const r = spawnSync(process.execPath, [abs, ...args], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    if (r.error) fail(`could not run ${label}: ${r.error.message}`);
    return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

console.log(`\npublish-article${REFRESH ? ' --refresh' : ''}: ${SLUG}${APPLY ? '' : '   (DRY RUN — nothing is written; add --apply)'}\n`);

// ── 1. Preconditions ───────────────────────────────────────────────────────
console.log('── Preconditions');
if (!fs.existsSync(DRAFT)) fail(`no draft at ${DRAFT_REL}`);
ok(`draft present: ${DRAFT_REL}`);

if (REFRESH) {
    if (!fs.existsSync(TARGET)) fail(`${TARGET_REL} is not live — --refresh re-stamps an EXISTING article; use a plain publish for the first publish`);
    ok(`${TARGET_REL} is live (refresh target — overwritten in place)`);
} else {
    if (fs.existsSync(TARGET)) fail(`${TARGET_REL} already exists — refusing to overwrite a live article. Use --refresh to re-stamp it, or remove/rename it deliberately first.`);
    ok(`${TARGET_REL} is free`);
}

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

// The receipts prove ledger->source. THIS proves ledger->prose: an edit made
// after the audit would otherwise ship text that no ledger row describes.
const match = AL.proseMatchesLedger(ledger);
if (!match.ok) fail(`ledger does not describe the current draft — ${match.reason}. Re-run the audit.`);
ok('ledger describes the prose on disk (proseSha matches)');

// ── 1b. Publish-surface preconditions ──────────────────────────────────────
// Added 2026-08-17 after the first explainer shipped without any of these and
// each had to be caught by hand in the pre-ping scrutiny pass. All three are
// deterministic, so they live here rather than in a checklist.

// The curated index entry. generate_articles_index only ADVISES on a missing
// entry (the card renders under UNSORTED) — advice printed mid-publish gets
// missed, so a missing entry now blocks.
const curated = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'articles-index.json'), 'utf8')); } catch (e) { return null; }
})();
if (!curated || !curated.articles) fail('cannot read data/articles-index.json');
if (!curated.articles[`${SLUG}.html`]) {
    fail(`no curated entry for ${SLUG}.html in data/articles-index.json — add section/label/summary there first (otherwise the card renders under UNSORTED)`);
}
ok('curated articles-index entry present');

// Schema completeness. The template now carries breadcrumb + about + citation;
// a draft missing breadcrumb or citation stripped something it should not have.
const draftHtml = fs.readFileSync(DRAFT, 'utf8');
const ldMatch = draftHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!ldMatch) fail('draft carries no JSON-LD block');
let ld = null;
try { ld = JSON.parse(ldMatch[1]); } catch (e) { fail('draft JSON-LD does not parse: ' + e.message); }
if (!ld.breadcrumb) fail('draft JSON-LD has no breadcrumb (BreadcrumbList) — the template provides it; do not strip it');
if (!ld.citation) fail('draft JSON-LD has no citation node — cite the primary source the article was drafted from');
if (!ld.about) note('JSON-LD has no "about" entity — fine to omit, better to name the subject (verified sameAs)');
ok('JSON-LD carries breadcrumb + citation' + (ld.about ? ' + about' : ''));

// Inbound links. A new page nothing links to is invisible to crawl discovery
// and gets no internal authority. Advisory, not blocking: the first article of
// a genuinely new topic cluster can legitimately start unlinked.
const linkRe = new RegExp(`href="${SLUG}\\.html"`);
const inbound = fs.readdirSync(path.join(ROOT, 'articles'))
    .filter(f => f.endsWith('.html') && f !== 'index.html' && f !== `${SLUG}.html`)
    .filter(f => linkRe.test(fs.readFileSync(path.join(ROOT, 'articles', f), 'utf8')));
if (inbound.length) ok(`${inbound.length} article(s) link to it: ${inbound.slice(0, 5).join(', ')}${inbound.length > 5 ? ', …' : ''}`);
else note('⚠ NO other article links to this one — weave it in from related live pages (link-only edits do not bump dateModified)');

// ── 2. Gates on the current tree ───────────────────────────────────────────
console.log('\n── Gates');
for (const [script, label] of [['scripts/qa-receipts.js', 'qa-receipts'], ['scripts/preflight.js', 'preflight']]) {
    const r = runNode(script, label);
    if (!r.ok) { console.log(r.out.slice(-1200)); fail(`${label} failed — not publishing`); }
    ok(`${label} passed`);
}

// ── 2b. D4 date decision (refresh only) ─────────────────────────────────────
// Decide bump-or-not BEFORE writing anything, so a dry run reports the same
// decision an --apply would take. dateModified moves only when the audited claim
// SUBSTANCE moved (or a correction is logged) — never on style / link / metadata
// / typo edits, and datePublished never moves at all (D4, 2026-08-19).
let refreshPlan = null;
if (REFRESH) {
    const newHash = AL.ledgerSubstanceHash(ledger);
    const state = readJsonSafe(DATE_STATE, {});
    const prior = state[SLUG] || null;
    const liveHtml = fs.readFileSync(TARGET, 'utf8');
    const curDM = (liveHtml.match(/"dateModified":\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1] || null;
    const curDP = (liveHtml.match(/"datePublished":\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1] || null;
    const forceCorrection = REASON === 'correction';
    // First refresh (no stored baseline) UNFREEZES the article -> bump (D4
    // companion ruling). A null new hash (no receipted SUPPORTED claim) cannot
    // prove "unchanged" -> bump, the honest fail-safe. Otherwise bump iff the
    // sourced-fact set moved.
    const substanceChanged = !prior || !prior.substanceHash || newHash === null || newHash !== prior.substanceHash;
    const bump = substanceChanged || forceCorrection;
    refreshPlan = {
        newHash, curDM, curDP, bump,
        newDM: bump ? localDate() : (curDM || localDate()),
        why: forceCorrection ? 'correction logged (--reason correction)'
            : !prior ? 'first refresh — no prior baseline (unfreezes the article)'
            : !prior.substanceHash ? 'prior baseline carries no substance hash'
            : newHash === null ? 'ledger has no receipted SUPPORTED claim — cannot prove unchanged'
            : newHash !== prior.substanceHash ? 'audited claim substance changed'
            : 'audited claim substance unchanged',
    };
    console.log('\n── D4 date decision');
    note(`substance hash: ${prior && prior.substanceHash ? prior.substanceHash : '(none)'} -> ${newHash || '(null)'}`);
    console.log(`  ${bump ? '✅ BUMP dateModified -> ' + refreshPlan.newDM : '· NO BUMP — dateModified stays ' + (curDM || 'unset')}  (${refreshPlan.why})`);
    if (curDP) note(`datePublished stays ${curDP} (never changes on refresh)`);
}

if (!APPLY) {
    console.log('\n  Dry run complete. Everything needed to publish is in place.');
    const verb = REFRESH ? `re-stamp ${TARGET_REL} in place` : `move ${DRAFT_REL} -> ${TARGET_REL}`;
    console.log(`  Run again with --apply to ${verb}.\n`);
    process.exit(0);
}

// ── 3. Move + re-stamp ─────────────────────────────────────────────────────
console.log('\n── Publishing');
let html = fs.readFileSync(DRAFT, 'utf8');
let written;
const today = localDate();

if (REFRESH) {
    // Re-stamp dateModified ONLY. datePublished and the visible "Published ..."
    // line are LEFT ALONE (D4: datePublished never changes). The visible
    // "Updated <Month Year>" line is set to match; a frozen pre-lane article may
    // carry none yet, so insert one after "Published ..." when it is missing.
    const newDM = refreshPlan.newDM;
    const updMonthYear = localMonthYear(new Date(newDM + 'T12:00:00'));
    // Check FIELD presence, not whether html changed: on a NO-BUMP refresh newDM
    // equals the current date, so the re-stamp is a no-op even though the fields
    // are present. Only a genuinely absent dateModified is worth flagging.
    const hadDM = /"dateModified":\s*"[^"]*"/.test(html);
    html = html.replace(/"dateModified":\s*"[^"]*"/, `"dateModified": "${newDM}"`);
    if (/<span>Updated [^<]*<\/span>/.test(html)) {
        html = html.replace(/<span>Updated [^<]*<\/span>/, `<span>Updated ${updMonthYear}</span>`);
    } else {
        html = html.replace(/(<span>Published [^<]*<\/span>)/, `$1<span>Updated ${updMonthYear}</span>`);
    }
    if (!hadDM) note('draft carried no JSON-LD dateModified field to re-stamp');

    fs.writeFileSync(TARGET, html, 'utf8');
    written = fs.readFileSync(TARGET, 'utf8');
    if (!written.includes(`"dateModified": "${newDM}"`)) fail('re-stamped file does not carry the new dateModified — aborting before the draft is removed');
    if (written.length !== html.length) fail('re-stamped file does not match what was written');
    // datePublished is the D4 invariant: it must survive the refresh untouched.
    if (refreshPlan.curDP && !written.includes(`"datePublished": "${refreshPlan.curDP}"`)) {
        fail(`datePublished changed on refresh (was ${refreshPlan.curDP}) — REFUSING; refresh must never move it`);
    }
    ok(`re-stamped ${TARGET_REL} (dateModified ${newDM}${refreshPlan.bump ? '' : ' — unchanged'}; datePublished ${refreshPlan.curDP || 'n/a'} untouched)`);

    fs.unlinkSync(DRAFT);
    if (fs.existsSync(DRAFT)) fail('draft still present after unlink');
    ok(`removed ${DRAFT_REL}`);
} else {
    // A draft can sit for days between audit and approval, so publication dates
    // are stamped HERE, not when the draft was written. Everything else moves
    // byte-for-byte: the draft was authored with articles/ relative paths on
    // purpose, so publishing rewrites no links.
    const monthYear = localMonthYear();
    const before = html;
    html = html.replace(/"datePublished":\s*"[^"]*"/, `"datePublished": "${today}"`);
    html = html.replace(/"dateModified":\s*"[^"]*"/, `"dateModified": "${today}"`);
    html = html.replace(/<span>Published [^<]*<\/span>/, `<span>Published ${monthYear}</span>`);
    if (html === before) note('no date fields matched — publishing the draft unchanged');

    fs.writeFileSync(TARGET, html, 'utf8');
    // Read back and assert (a success log without a read-back is the known bug class).
    written = fs.readFileSync(TARGET, 'utf8');
    if (!written.includes(`"datePublished": "${today}"`)) fail('published file does not carry the new datePublished — aborting before the draft is removed');
    if (written.length !== html.length) fail('published file does not match what was written');
    ok(`wrote ${TARGET_REL} (datePublished ${today})`);

    fs.unlinkSync(DRAFT);
    if (fs.existsSync(DRAFT)) fail('draft still present after unlink');
    ok(`removed ${DRAFT_REL}`);
}

// ── 4. Regenerate every surface that must know ─────────────────────────────
console.log('\n── Generated surfaces');

// Re-promotion (refresh + bump): flip showUpdated so the article's index card
// reads "· Updated <Month Year>". The date itself is derived from the article's
// real dateModified at render time (generate_articles_index.js), so this is a
// pure on/off flag — no date is ever typed. Done BEFORE the index regenerates.
if (REFRESH && refreshPlan.bump) {
    const idxPath = path.join(ROOT, 'data', 'articles-index.json');
    const curated = readJsonSafe(idxPath, null);
    if (curated && curated.articles && curated.articles[`${SLUG}.html`]) {
        if (curated.articles[`${SLUG}.html`].showUpdated !== true) {
            curated.articles[`${SLUG}.html`].showUpdated = true;
            fs.writeFileSync(idxPath, JSON.stringify(curated, null, 2) + '\n');
            const back = readJsonSafe(idxPath, null);
            if (!back || back.articles[`${SLUG}.html`].showUpdated !== true) fail('showUpdated flag did not read back in data/articles-index.json');
            ok('re-promotion: showUpdated flag set on the index card');
        } else {
            note('showUpdated already set on the index card');
        }
    } else {
        note('no curated index entry to flag for re-promotion (card renders under UNSORTED)');
    }
}

// The news sitemap is regenerated on a FIRST publish only. An evergreen
// explainer refresh must never enter the Google News feed (ruling @901ad6da):
// datePublished does not move, and the generator keys off NewsArticle schema +
// datePublished anyway, so this is belt-and-suspenders — the refresh does not
// even ask it to run.
const surfaces = [
    ['scripts/generate_articles_index.js', 'articles index'],
    ['scripts/generate_sitemap.js', 'sitemap'],
    ['scripts/generate-search-index.js', 'search index'],
    ['scripts/generate_author_page.js', 'author page'],
];
if (!REFRESH) surfaces.push(['scripts/generate_news_sitemap.js', 'news sitemap']);
else note('news sitemap NOT regenerated — evergreen explainers stay out of the Google News feed (ruling @901ad6da)');
for (const [script, label] of surfaces) {
    const r = runNode(script, label);
    if (!r.ok) { console.log(r.out.slice(-800)); fail(`${label} generation failed`); }
    ok(label + ' regenerated');
}

// Per-article OG card (added 2026-08-17): the template's og:image points at
// og/articles/<slug>.png, so the card must exist the moment the page does — a
// published head referencing a 404 image is the same bug class as the IndexNow
// premature ping. The generator is manifest-gated, so re-publishing is cheap.
const ogRun = runNode('scripts/generate_brand_assets.js', 'article OG card', ['--articles', `--article=${SLUG}`]);
if (!ogRun.ok) { console.log(ogRun.out.slice(-800)); fail('article OG card generation failed'); }
const ogPng = path.join(ROOT, 'og', 'articles', `${SLUG}.png`);
if (!fs.existsSync(ogPng)) fail(`og/articles/${SLUG}.png missing after generation`);
ok(`article OG card generated (og/articles/${SLUG}.png)`);
if (!written.includes(`/og/articles/${SLUG}.png`)) {
    note(`⚠ the article's og:image does not reference its own card — it will share whatever it points at instead`);
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

// Register the article with the audit-freshness tripwire (qa-ledger-regression's
// baseline), SCOPED to this one entry. A blanket `--update` here would silently
// re-baseline every drifted bill in the same stroke — the opposite of a tripwire.
// Doing it inside publish removes a remembered step: nobody runs --update by hand.
const BASELINE = path.join(ROOT, 'data', 'qa-regression-baseline.json');
const baseline = (() => { try { return JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { return null; } })();
if (!baseline) {
    note('no qa-regression baseline on disk — skipped (the gate bootstraps it on its next run)');
} else {
    const h = AL.proseHash(ledger);
    if (!h) fail('could not hash the published prose for the regression baseline');
    baseline[ledger.id] = h;
    fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
    const back = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    if (back[ledger.id] !== h) fail('baseline read-back does not carry the new hash');
    ok(`qa-regression baseline carries ${ledger.id} @ ${h} (scoped — no other entry touched)`);
}

// D4 date-state baseline. On a FIRST publish it records today's dates + the
// substance hash so the FIRST refresh has a baseline to compare against; on a
// refresh it records the (possibly unchanged) dateModified and the current hash,
// so the NEXT refresh compares against this one. Read the FINAL file back rather
// than trusting the in-memory values.
{
    const state = readJsonSafe(DATE_STATE, {});
    const finalHtml = fs.readFileSync(TARGET, 'utf8');
    const dp = (finalHtml.match(/"datePublished":\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1] || null;
    const dm = (finalHtml.match(/"dateModified":\s*"(\d{4}-\d{2}-\d{2})"/) || [])[1] || null;
    state[SLUG] = { datePublished: dp, dateModified: dm, substanceHash: AL.ledgerSubstanceHash(ledger), refreshedAt: today };
    const ordered = {};
    for (const k of Object.keys(state).sort()) ordered[k] = state[k];
    fs.writeFileSync(DATE_STATE, JSON.stringify(ordered, null, 2) + '\n');
    const back = readJsonSafe(DATE_STATE, {});
    if (!back[SLUG] || back[SLUG].dateModified !== dm) fail('date-state read-back does not carry this article');
    ok(`D4 date-state recorded (${DATE_STATE_REL}): dateModified ${dm}, substanceHash ${state[SLUG].substanceHash || '(null)'}`);
}

const bumped = !REFRESH || refreshPlan.bump;
console.log(`\n  ${REFRESH ? 'Refreshed' : 'Published'} locally. NOT committed, NOT pushed, NO IndexNow ping.\n`);
console.log('  Next, when you want it live:');
console.log(`    git add -A && git commit -m "${REFRESH ? 'Refresh' : 'Publish'} explainer: ${SLUG}"`);
console.log('    (then merge dev -> main and push — your call, as always)');
if (bumped) {
    console.log(`    after it is live:  npm run indexnow -- --url https://legislationpatch.com/articles/${SLUG}.html`);
} else {
    console.log('    (no IndexNow ping — dateModified did not move, so there is nothing new to announce)');
}
console.log('');
