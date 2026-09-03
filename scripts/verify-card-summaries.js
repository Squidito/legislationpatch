#!/usr/bin/env node
// verify-card-summaries.js -- every figure in an articles/index.html card summary
// must still appear in the article that card links to.
//
// WHY: card summaries live in data/articles-index.json and are hand-written; the
// article they describe is refreshed by publish-article.js. Nothing tied the two
// together, so the refresh lane twice shipped a card whose numbers had been
// overtaken by the article it links to (status.md 2026-08-27 part 2, finding 1:
// the 119th-congress-tracker card still said "6 signed laws" long after the
// article said 68). The card is what a reader sees first on /articles/, so a
// stale card is a wrong claim on a live page.
//
// SCOPE: deliberately mechanical. It compares FIGURES only -- vote tallies,
// numbers, dollar amounts, percentages, and dates -- because those are the
// claims that go stale and can be checked without judging prose. It does not
// try to detect a summary that is merely out of date in tone or emphasis.
//
// A figure is satisfied if it appears in the article's visible text OR its
// metadata (a month-year also matches the ISO form, so "August 2026" is
// satisfied by a 2026-08-27 dateModified).
//
// Usage:
//   node scripts/verify-card-summaries.js            # exit 1 on any mismatch
//   node scripts/verify-card-summaries.js --verbose  # list every figure checked

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const INDEX    = path.join(ROOT, 'data', 'articles-index.json');
const ARTICLES = path.join(ROOT, 'articles');
const DRAFTS   = path.join(ROOT, 'drafts');

const VERBOSE = process.argv.includes('--verbose');

// A card whose article has not been published YET is a draft, not a defect.
// publish-article.js requires the curated card entry to exist BEFORE it will
// publish, and runs preflight (which runs this script) as a blocking gate
// BEFORE it moves drafts/<slug>.html into articles/. Checking articles/ only
// therefore deadlocked every FIRST publish: card-then-publish failed here, and
// publish-then-card failed publish-article's own curated-entry check. So look
// in drafts/ too -- the same convention preflight.js already uses (isArticle()
// counts drafts/ as articles, because a draft is written with the exact paths
// it will have once published) and article-ledger.js's proseFile(). A card with
// neither a published article nor a draft is still a hard failure.
//
// THE SECOND DEADLOCK, and why this returns a LIST (fixed 2026-09-02).
// Resolving articles/ FIRST and stopping there fixed the first-publish case and
// left the REFRESH case broken, because on a refresh BOTH files exist: the live
// article is the pre-refresh text and drafts/<slug>.html is the audited text
// about to replace it. A refresh whose card summary gains a figure the refresh
// itself introduced was therefore checked against the article that predates it
// and failed -- with no way out, since publish-article.js runs preflight BEFORE
// it writes. The House-procedure batch (status.md 2026-08-31) had to publish
// under a figure-free interim summary and restore the real one afterwards, which
// means the gate was bypassed by hand on exactly the publish it was guarding.
//
// So a card figure is now satisfied by EITHER the live article or the draft that
// is about to become it -- the union of what the page says now and what it is
// about to say. This does not open the hole the gate was built to close: the
// original defect (a card reading "6 signed laws" against an article saying 68)
// is absent from both files and still blocks, which the corruption tests in
// scripts/test-card-summaries.js assert directly. What it does concede is a card
// figure supported ONLY by a stale draft left in the gitignored drafts/; that is
// bounded (drafts/ is emptied by every publish) and is the smaller risk than a
// gate operators route around.
function resolveArticle(file) {
    const found = [];
    const published = path.join(ARTICLES, file);
    if (fs.existsSync(published)) found.push({ abs: published, where: 'articles' });
    const draft = path.join(DRAFTS, file);
    if (fs.existsSync(draft)) found.push({ abs: draft, where: 'drafts' });
    return found;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
                'august', 'september', 'october', 'november', 'december'];

// Small numbers are NOT exempt. The defect this gate was built for was a card
// reading "6 signed laws" against an article saying 68 -- an ignore-list for
// single digits would have let exactly that through (proved by the seeded-teeth
// run before this list was removed). Numbers spelled as words are already
// skipped, because only digits are extracted.

function visibleText(html) {
    return html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        // Named dash entities. normalize() already folds every literal dash
        // character to a hyphen, and &#8211;-style numeric entities decode on the
        // next line, but "216&ndash;212" stayed an entity and never matched the
        // "216-212" in a card summary -- the exact case this function's own
        // comment claimed to handle. Found by scripts/test-card-summaries.js.
        .replace(/&(?:ndash|mdash|minus|hyphen);/g, '-')
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
        .replace(/\s+/g, ' ');
}

// Everything a claim may legitimately be verified against: the visible prose,
// plus the raw markup so JSON-LD dates and attribute-borne figures count.
function haystack(html) {
    return (visibleText(html) + ' ' + html.replace(/\s+/g, ' ')).toLowerCase();
}

// Normalize the digit-grouping and dash variants that separate "216-212" in a
// summary from "216&ndash;212" or "216 - 212" in an article.
function normalize(s) {
    return s
        .replace(/[‐-―−]/g, '-')  // every dash form -> hyphen
        .replace(/(\d),(?=\d{3}\b)/g, '$1');     // 10,000 -> 10000
}

/**
 * Pull the checkable claims out of a card summary.
 * Order matters: tallies and dollar amounts are consumed before bare numbers so
 * their digits are not re-reported as separate claims.
 */
function extractClaims(summary) {
    const claims = [];
    const seen = new Set();
    // variantRe (optional) satisfies a claim by pattern rather than literal text
    // -- a month-precision date is supported by any day in that month.
    const add = (kind, token, variants, variantRe) => {
        const key = kind + '|' + token;
        if (seen.has(key)) return;
        seen.add(key);
        claims.push({ kind, token, variants, variantRe });
    };

    let rest = normalize(summary);
    const consume = (re, fn) => {
        rest = rest.replace(re, (...a) => { fn(...a); return ' '.repeat(a[0].length); });
    };

    // Vote tallies: 216-212, 77-20
    consume(/\b(\d{1,3})-(\d{1,3})\b/g, (m, a, b) => {
        add('tally', `${a}-${b}`, [`${a}-${b}`, `${a} - ${b}`, `${a} to ${b}`]);
    });

    // Dollar amounts, in house short form or written out
    consume(/\$\d[\d,.]*\s*(?:billion|million|trillion|thousand|[BMK])?/gi, (m) => {
        const t = m.trim();
        add('money', t, [t, t.replace(/\s+/g, ''), t.replace(/,/g, '')]);
    });

    // Percentages
    consume(/\b\d[\d.]*\s*(?:percent|%)/gi, (m) => {
        const n = m.match(/[\d.]+/)[0];
        add('percent', m.trim(), [`${n}%`, `${n} percent`]);
    });

    // Full dates: July 22, 2026
    const monthRe = new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2}),\\s*(\\d{4})\\b`, 'gi');
    consume(monthRe, (m, mon, day, yr) => {
        const iso = `${yr}-${String(MONTHS.indexOf(mon.toLowerCase()) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        add('date', m.trim(), [m.trim().toLowerCase(), iso]);
    });

    // Month-year: August 2026. Satisfied by the literal, by the ISO year-month,
    // or by any day-precision date inside that month -- a card that says
    // "July 2024" is supported by an article that says "July 25, 2024".
    const monthYearRe = new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{4})\\b`, 'gi');
    consume(monthYearRe, (m, mon, yr) => {
        const mm = String(MONTHS.indexOf(mon.toLowerCase()) + 1).padStart(2, '0');
        add('date', m.trim(), [m.trim().toLowerCase(), `${yr}-${mm}`],
            new RegExp(`${mon.toLowerCase()}\\s+\\d{1,2},?\\s*${yr}`, 'i'));
    });

    // Bare numbers left over: counts, bill numbers, years.
    //
    // Bare PRESENCE is not a real check here -- an article carrying a 212-bill
    // roster contains virtually every small integer somewhere, so "6 signed
    // laws" would pass against an article saying 68 (proved by the seeded-teeth
    // run). So each number is anchored to the noun it modifies in the summary
    // and must co-occur with that word inside a short window in the article.
    const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and', 'or',
                               'for', 'by', 'its', 'was', 'were', 'is', 'are', 'as', 'that']);
    // The lookahead stops at sentence punctuation: "its first lapse since 2008.
    // Complete tracker of..." must not anchor 2008 to "complete".
    for (const m of rest.matchAll(/\b(\d[\d,]*)\b([^.;!?]{0,40})/g)) {
        const t = m[1].replace(/,/g, '');
        const anchor = (m[2].toLowerCase().match(/[a-z]{3,}/g) || [])
            .find(w => !STOPWORDS.has(w));
        if (anchor) {
            // number and its noun within a short window, in either order
            add('number', `${t} ${anchor}`, [],
                new RegExp(`(\\b${t}\\b[^.]{0,60}?\\b${anchor}\\b)|(\\b${anchor}\\b[^.]{0,60}?\\b${t}\\b)`, 'i'));
        } else {
            add('number', t, [t, m[1]]);
        }
    }

    return claims;
}

function main() {
    let index;
    try { index = JSON.parse(fs.readFileSync(INDEX, 'utf8')); }
    catch (e) { console.error(`❌ cannot read ${path.relative(ROOT, INDEX)}: ${e.message}`); process.exit(1); }

    const entries = Object.entries(index.articles || {});
    if (!entries.length) { console.error('❌ articles-index.json has no articles'); process.exit(1); }

    let problems = 0, checkedCards = 0, checkedClaims = 0;

    for (const [file, meta] of entries) {
        const summary = meta && meta.summary;
        if (!summary) continue;

        const found = resolveArticle(file);
        if (!found.length) {
            console.log(`  ❌ ${file}: card summary present but the article file does not exist (looked in articles/ and drafts/)`);
            problems++;
            continue;
        }
        if (VERBOSE && found.length > 1) console.log(`     ..  ${file}  refresh in flight — checked against the live article AND the draft`);
        else if (VERBOSE && found[0].where === 'drafts') console.log(`     ..  ${file}  checked against the unpublished draft`);

        const hays = found.map(f => ({ where: f.where, hay: normalize(haystack(fs.readFileSync(f.abs, 'utf8'))) }));
        const claims = extractClaims(summary);
        checkedCards++;

        for (const c of claims) {
            checkedClaims++;
            const hit = hays.find(h =>
                c.variants.some(v => h.hay.includes(normalize(String(v)).toLowerCase()))
                || (c.variantRe && c.variantRe.test(h.hay)));
            if (hit) {
                if (VERBOSE) console.log(`     ok  ${file}  ${c.kind} ${c.token}  (${hit.where})`);
                continue;
            }
            const where = found.map(f => f.where).join(' or ');
            console.log(`  ❌ ${file}: card summary ${c.kind} "${c.token}" does not appear in the article it links to (${where})`);
            problems++;
        }
    }

    console.log('');
    if (problems) {
        console.log(`❌ ${problems} problem(s) across ${checkedCards} card summaries (${checkedClaims} figures checked)`);
        console.log('   Fix the card summary in data/articles-index.json, or refresh the article it describes.');
        process.exit(1);
    }
    console.log(`✅ ${checkedCards} card summaries consistent with their articles (${checkedClaims} figures checked)`);
}

/**
 * The gate's decision for ONE card, made against ready HTML strings rather than
 * paths — this is what scripts/test-card-summaries.js corrupts and re-runs.
 * `pages` is [{ where, html }] in the same order resolveArticle() returns.
 * Returns [{ kind, token }] for every unsatisfied claim; empty means clean.
 */
function unsatisfiedClaims(summary, pages) {
    const hays = pages.map(p => ({ where: p.where, hay: normalize(haystack(p.html)) }));
    return extractClaims(summary).filter(c =>
        !hays.some(h => c.variants.some(v => h.hay.includes(normalize(String(v)).toLowerCase()))
                     || (c.variantRe && c.variantRe.test(h.hay))));
}

module.exports = { extractClaims, resolveArticle, unsatisfiedClaims, haystack, normalize };

if (require.main === module) main();
