#!/usr/bin/env node
// test-card-summaries.js — hostile-corruption tests for scripts/verify-card-summaries.js.
//
// WHY THIS EXISTS. The card-summary gate was widened on 2026-09-02 so a card
// figure may be satisfied by the live article OR by the draft about to replace
// it (the refresh deadlock: publish-article.js runs preflight BEFORE it writes,
// so a refresh that ADDS a figure to its card was being checked against the
// article that predates it and could not publish — status.md 2026-08-31 records
// a batch publishing under a figure-free interim summary to get past it).
//
// A gate that is widened and not re-proven is a gate nobody can trust again.
// This file is that re-proof: it asserts the deadlock is gone AND that the
// original defect the gate was built for still blocks. The standing bar in this
// repo is "a gate change that is not re-proven is not done".
//
// Method, the same as scripts/test-tracker-gate.js: build fixtures, confirm the
// clean case passes, then corrupt each one and assert the gate reports exactly
// the claim that corruption breaks. A corruption that passes is a hole.
//
// Zero dependencies, no network, no temp files, nothing written:
//   node scripts/test-card-summaries.js        (or: npm run cards:test)

'use strict';

const fs = require('fs');
const path = require('path');
const { unsatisfiedClaims, resolveArticle } = require('./verify-card-summaries.js');

const ROOT = path.join(__dirname, '..');

let passes = 0, failures = 0;
function check(desc, cond, extra) {
    if (cond) { passes++; console.log('  ok    ' + desc); return true; }
    failures++;
    console.error('  FAIL  ' + desc + (extra ? '\n          ' + extra : ''));
    return false;
}
const tokens = (probs) => probs.map(p => `${p.kind} ${p.token}`).sort();

// A minimal page with the shape the extractor reads: visible prose plus JSON-LD.
const page = (body, dateModified) => `<!doctype html><html><head>
<script type="application/ld+json">{"@type":"Article","dateModified":"${dateModified || '2026-09-02'}"}</script>
</head><body><div class="article-body"><p>${body}</p></div></body></html>`;

console.log('\ncard-summary gate — hostile corruption tests\n');

// ── 1. THE ORIGINAL DEFECT. A card claiming "6 signed laws" against an article
// that says 68 is what this gate was built for. It must still block, and it must
// block in every arrangement of live article and draft, or widening the resolver
// re-opened it.
{
    const summary = 'Complete tracker of the 119th Congress: 6 signed laws so far.';
    const article = page('The 119th Congress has produced 68 signed laws so far, across 219 measures.');

    check('original defect blocks — live article only',
        tokens(unsatisfiedClaims(summary, [{ where: 'articles', html: article }])).join('|').includes('6 signed'),
        JSON.stringify(tokens(unsatisfiedClaims(summary, [{ where: 'articles', html: article }]))));

    check('original defect blocks — draft only',
        unsatisfiedClaims(summary, [{ where: 'drafts', html: article }]).length > 0);

    check('original defect blocks — live article AND draft both present',
        unsatisfiedClaims(summary, [
            { where: 'articles', html: article },
            { where: 'drafts', html: article },
        ]).length > 0);
}

// ── 2. THE DEADLOCK ITSELF. A refresh introduces a figure; the card is updated
// to match. Live article = pre-refresh text (no such figure), draft = the audited
// text that has it. Before the fix this was unpublishable.
{
    const summary = 'The Senate confirmed 1,622 nominations in the 119th Congress.';
    const live  = page('The Senate confirmed hundreds of nominations in the 119th Congress.');
    const draft = page('The Senate confirmed 1,622 nominations in the 119th Congress, 1,034 of them by voice vote.');

    check('DEADLOCK REPRODUCED — live article alone rejects the refreshed card',
        unsatisfiedClaims(summary, [{ where: 'articles', html: live }]).length > 0);

    check('DEADLOCK FIXED — live article + draft accepts it',
        unsatisfiedClaims(summary, [
            { where: 'articles', html: live },
            { where: 'drafts', html: draft },
        ]).length === 0,
        JSON.stringify(tokens(unsatisfiedClaims(summary, [
            { where: 'articles', html: live }, { where: 'drafts', html: draft }]))));

    check('the fix is order-independent (draft listed first)',
        unsatisfiedClaims(summary, [
            { where: 'drafts', html: draft },
            { where: 'articles', html: live },
        ]).length === 0);
}

// ── 3. THE FIX MUST NOT BECOME A BYPASS. A figure in NEITHER file still blocks,
// even mid-refresh — otherwise "both exist" would mean "anything goes".
{
    const summary = 'The Senate confirmed 9,999 nominations and rejected 40 percent of them.';
    const live  = page('The Senate confirmed 1,622 nominations in the 119th Congress.');
    const draft = page('The Senate confirmed 1,622 nominations, 1,034 of them by voice vote.');
    const probs = unsatisfiedClaims(summary, [
        { where: 'articles', html: live },
        { where: 'drafts', html: draft },
    ]);
    check('a fabricated figure blocks mid-refresh (number)',
        probs.some(p => p.kind === 'number' && /9999|9,999/.test(p.token)), JSON.stringify(tokens(probs)));
    check('a fabricated figure blocks mid-refresh (percent)',
        probs.some(p => p.kind === 'percent'), JSON.stringify(tokens(probs)));
}

// ── 4. A stale draft must not launder a WRONG figure that the live article
// contradicts... except that it can, and this test pins that concession so it is
// a recorded trade-off rather than a surprise. drafts/ is gitignored and emptied
// by every publish, which is what bounds it.
{
    const summary = 'The tracker covers 6 signed laws.';
    const live  = page('The tracker covers 68 signed laws.');
    const stale = page('The tracker covers 6 signed laws.');
    check('KNOWN CONCESSION: a stale draft satisfies a figure the live article contradicts',
        unsatisfiedClaims(summary, [
            { where: 'articles', html: live },
            { where: 'drafts', html: stale },
        ]).length === 0);
}

// ── 5. The satisfied-by-either rule must not weaken the anchoring that stops a
// bare integer matching anywhere in a long page.
{
    const summary = 'A tracker of 6 signed laws.';
    const roster = page('H.R. 1. H.R. 2. H.R. 3. H.R. 4. H.R. 5. H.R. 6. H.R. 7. 68 signed laws in all.');
    check('anchoring survives — "6 signed" is not satisfied by a bare 6 elsewhere on the page',
        unsatisfiedClaims(summary, [{ where: 'articles', html: roster }]).length > 0);
}

// ── 6. Tallies, money and dates still resolve across the union.
{
    const summary = 'Passed 216-212 on July 22, 2026, carrying $1.2 billion.';
    const live  = page('Passed 216&ndash;212 on July 22, 2026.');
    const draft = page('The measure carried $1.2 billion.');
    check('tally + date come from the live article, money from the draft',
        unsatisfiedClaims(summary, [
            { where: 'articles', html: live },
            { where: 'drafts', html: draft },
        ]).length === 0,
        JSON.stringify(tokens(unsatisfiedClaims(summary, [
            { where: 'articles', html: live }, { where: 'drafts', html: draft }]))));
}

// ── 7. resolveArticle returns a LIST, and a card with no file at all is still a
// hard failure (the shape the caller depends on).
{
    const found = resolveArticle('this-article-does-not-exist-' + Date.now() + '.html');
    check('resolveArticle returns an array', Array.isArray(found));
    check('a card with no article and no draft resolves to nothing', found.length === 0);

    const anyLive = fs.readdirSync(path.join(ROOT, 'articles')).find(f => f.endsWith('.html') && f !== 'index.html');
    if (anyLive) {
        const live = resolveArticle(anyLive);
        check('a live article resolves to at least one page', live.length >= 1 && live.some(p => p.where === 'articles'));
    }
}

// ── 8. The live corpus must be clean right now — the gate's own fixture.
{
    const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'articles-index.json'), 'utf8'));
    let dirty = 0;
    for (const [file, meta] of Object.entries(index.articles || {})) {
        if (!meta || !meta.summary) continue;
        const found = resolveArticle(file);
        if (!found.length) { dirty++; continue; }
        const pages = found.map(f => ({ where: f.where, html: fs.readFileSync(f.abs, 'utf8') }));
        if (unsatisfiedClaims(meta.summary, pages).length) { dirty++; console.error('        dirty fixture: ' + file); }
    }
    check('every live card summary passes the widened gate', dirty === 0, `${dirty} card(s) unsatisfied`);
}

console.log(`\n  ${failures ? '❌' : '✅'} card-summary gate: ${passes} passed, ${failures} failed\n`);
process.exit(failures ? 1 : 0);
