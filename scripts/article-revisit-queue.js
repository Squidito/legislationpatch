#!/usr/bin/env node
// article-revisit-queue.js — rank explainer articles by how much they need a
// refresh (Phase 6 living-article loop). ADVISORY. Ranks; never schedules.
//
//   node scripts/article-revisit-queue.js            # human table
//   node scripts/article-revisit-queue.js --json      # machine-readable (patch-console)
//   node scripts/article-revisit-queue.js --limit 12  # cap the rows shown
//
// PILOT-STATION RULE (James, Phase 6): the queue exists so James PICKS what to
// refresh from a ranked shortlist — nothing here self-selects, self-schedules or
// self-refreshes. It reads only committed data and always exits 0.
//
// The signal, in order of weight:
//   1. movedBills  — a bill the article cites has a stageDate NEWER than the
//                    article's dateModified: the prose may now describe a state
//                    the bill has moved on from. The strongest staleness signal.
//                    (Same extraction as article-staleness.js / article-index.js.)
//   2. frozen      — dateModified is still the 2026-07-17 bulk-freeze sentinel AND
//                    no audited ledger exists: a PRE-LANE article never genuinely
//                    reviewed. It unfreezes only via a refresh (D4 companion).
//   3. ageDays     — days since dateModified. Freshness compounds (the ~3.2× AI-
//                    citation multiplier rewards <30-day content), so age is the
//                    tiebreaker once staleness and frozen-ness are equal.
//
// Dispatches (NewsArticle) and topic hubs (/topics/, not articles/) are out of
// scope — this is the slow evergreen lane.

'use strict';

const fs   = require('fs');
const path = require('path');

const { allArticles, classify } = require('./lib/article-meta');
const { extractRefs, loadSlugToId } = require('./lib/article-index');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const ARTICLES = path.join(ROOT, 'articles');
const LEDGER_DIR = path.join(DATA, 'qa-ledger');

const args  = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : null; })();

const FREEZE_SENTINEL = '2026-07-17';   // the bulk dateModified every pre-lane article carries

function readJsonSafe(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }

// cache -> id : stageDate/stageLabel (same source article-staleness reads)
function loadCache() {
    const cache = readJsonSafe(path.join(DATA, 'cache.json'), { bills: [] });
    const bills = Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});
    const byId = new Map();
    for (const b of bills) byId.set(b.id, { stageLabel: b.stageLabel || b.stage || '', stageDate: b.stageDate || b.date || '' });
    return byId;
}

function daysBetween(fromIso, toDate) {
    const d = new Date(fromIso + 'T12:00:00');
    if (isNaN(d)) return null;
    return Math.round((toDate - d) / 86400000);
}

function hasAuditedLedger(slug) {
    const l = readJsonSafe(path.join(LEDGER_DIR, `article-${slug}.json`), null);
    return !!(l && l.status === 'audited' && l.depth === 'full-claims');
}

function main() {
    const byId = loadCache();
    const slugToId = loadSlugToId();
    const dateState = readJsonSafe(path.join(DATA, 'article-date-state.json'), {});
    const now = new Date();

    const rows = [];
    for (const a of allArticles()) {
        if (a.schemaType === 'NewsArticle') continue;          // dispatches: fast lane, not this loop
        const kind = classify(a);                              // explainer | tracker | meta

        const html = fs.readFileSync(path.join(ARTICLES, a.file), 'utf8');
        const refs = extractRefs(html, slugToId).filter(id => byId.has(id));

        // movedBills: cited bills whose stage advanced past the article's own date.
        const artDate = a.dateModified || a.datePublished || null;
        const moved = [];
        for (const id of refs) {
            const b = byId.get(id);
            if (artDate && b.stageDate && b.stageDate > artDate) moved.push({ id, stageLabel: b.stageLabel, stageDate: b.stageDate });
        }

        const audited = hasAuditedLedger(a.slug);
        const frozen = a.dateModified === FREEZE_SENTINEL && !audited;
        const ageDays = artDate ? daysBetween(artDate, now) : null;
        const lastRefresh = (dateState[a.slug] && dateState[a.slug].refreshedAt) || null;

        // Transparent additive score — every component is shown, no black box.
        const score =
            moved.length * 100 +
            (frozen ? 50 : 0) +
            (artDate ? Math.min(ageDays || 0, 365) * 0.2 : 80);   // no-date treated as very stale

        rows.push({
            slug: a.slug, file: a.file, title: a.title, kind,
            dateModified: a.dateModified, datePublished: a.datePublished,
            ageDays, frozen, audited, lastRefresh,
            movedBills: moved,
            movedCount: moved.length,
            score: Math.round(score * 10) / 10,
            // Phase 5 is built, so this flag now ROUTES rather than blocks: a
            // tracker refresh goes through the both-sides path (org-statement
            // fetch/store + tracker-gate.js + dual-lens), not the Phase 6 explainer
            // refresh. `route` names the path a picked article should take.
            route: kind === 'tracker' ? 'tracker' : 'explainer',
            phase5Only: kind === 'tracker',
        });
    }

    rows.sort((x, y) => y.score - x.score
        || y.movedCount - x.movedCount
        || (y.ageDays || 0) - (x.ageDays || 0)
        || x.slug.localeCompare(y.slug));

    const limited = LIMIT ? rows.slice(0, LIMIT) : rows;

    if (JSON_OUT) {
        process.stdout.write(JSON.stringify({
            generatedFor: now.toISOString().slice(0, 10),
            freezeSentinel: FREEZE_SENTINEL,
            total: rows.length,
            queue: limited,
        }, null, 2) + '\n');
        return;
    }

    console.log('─'.repeat(72));
    console.log('  Article revisit queue (advisory) — ranked refresh candidates');
    console.log('─'.repeat(72));
    console.log(`  ${rows.length} evergreen article(s). James picks; nothing here self-schedules.\n`);
    console.log('  score  moved  age   flags                    article');
    console.log('  ' + '-'.repeat(68));
    for (const r of limited) {
        const flags = [
            r.frozen ? 'FROZEN' : (r.audited ? 'audited' : 'unaudited'),
            r.route === 'tracker' ? 'tracker→P5' : '',
        ].filter(Boolean).join(' ');
        const age = r.ageDays == null ? 'n/a' : `${r.ageDays}d`;
        console.log(`  ${String(r.score).padStart(5)}  ${String(r.movedCount).padStart(5)}  ${age.padStart(4)}  ${flags.padEnd(24)} ${r.slug}`);
        for (const m of r.movedBills.slice(0, 3)) {
            console.log(`                                                  ↳ ${m.id} now "${m.stageLabel}" (${m.stageDate})`);
        }
    }
    console.log('');
    console.log('  Legend: score = movedBills×100 + frozen×50 + min(age,365)×0.2 (no-date = 80).');
    console.log('  Routes (both end at publish-article --slug <slug> --refresh --apply after a converged audit):');
    console.log('    explainer → Phase 6 refresh path (full ledger audit to convergence)');
    console.log('    tracker→P5 → Phase 5 both-sides path: fetch+store every named position');
    console.log('                 (fetch-reference.js --org), audit, dual-lens, then tracker-gate.js.');
    console.log('');
}

main();
