#!/usr/bin/env node
// qa-citation-links.js -- the external-citation gate (D5, adopted 2026-08-30).
//
//   npm run link-check                 cache-first: fetch only what is new, expired
//                                      or previously dead; exit 1 on any dead URL
//   npm run link-check -- --refresh    re-fetch every citation, ignoring the cache
//   npm run link-check -- --offline    judge from the cache only, never touch the
//                                      network (unchecked URLs are reported, not failed)
//   npm run link-check -- --url <u>    check one URL and print the full evidence
//   npm run link-check -- --self-test  deterministic classifier proof, no network
//   npm run link-check -- --preflight  terse mode, called by scripts/preflight.js
//   ... --verbose                      list every URL, not just the problems
//
// Reads:  articles/*.html, drafts/*.html, data/link-adjudications.json
// Writes: data/link-check-cache.json (the fetch results; committed on purpose --
//         it is what keeps preflight off the network)
// Exit:   0 clean · 1 at least one dead, unadjudicated citation
//
// WHY IT BLOCKS. The 2026-08 sweep found 17 dead citations sitting in live "Key
// Sources" boxes, and 14 of them answered HTTP 200 with an error page in the body.
// Nothing in preflight or the article audit lane looked at external URLs at all,
// which is why they accumulated silently for months. Detection without a blocking
// gate does not change outcomes -- that lesson is already written on
// articles/methodology.html's own drift, and this is the same shape of problem.
//
// WHAT IT REFUSES TO DO. It does not fail on a 403. congress.gov, cbo.gov, gao.gov
// and govtrack.us serve a Cloudflare challenge to scripted clients and a normal
// page to humans; the previous sweep nearly recorded live citations as dead over
// exactly that. Walls, 5xx and transport errors are reported and never block. Only
// positive evidence of death -- a 404/410, or a 2xx that redirected to an error
// page or titled itself one -- fails the run. See scripts/lib/citation-links.js
// for the evidence patterns and the reasoning behind each.
//
// ── PROOF OF TEETH ──────────────────────────────────────────────────────────
// --self-test replays ten recorded responses through the classifier with no
// network, including the two real soft-404 bodies that started this, and two
// regressions a hostile review found (a bill numbered 404; an error-looking path
// we were not redirected to):
//
//     $ node scripts/qa-citation-links.js --self-test
//       ✅ 200 + docnotfound.xhtml redirect (uscode.house.gov)  -> dead
//       ✅ 200 + "U.S. Senate: 404 Error Page" title            -> dead
//       ✅ 200 + "Document not Found" in body                   -> dead
//       ✅ 404 (epa.gov retired page)                           -> dead
//       ✅ 403 Cloudflare challenge (congress.gov)              -> wall
//       ✅ 200 real statute page                                -> live
//       ✅ H.R. 404 is a bill number, not an error page         -> live
//       ✅ error-looking path we were NOT redirected to         -> live
//       ✅ transport failure is UNKNOWN, never dead             -> unknown
//       ✅ 500 is UNKNOWN, never dead                           -> unknown
//       self-test: 10/10 passed
//
// The last two matter as much as the first four: they are what stops a flaky
// network from failing a commit, which is how a blocking gate earns the right to
// block.
//
// And live, against the corpus: corrupting one character of a real citation in
// articles/congressional-oversight.html (section192 -> section19X) made the run
// exit 1 with
//     ❌ DEAD  https://uscode.house.gov/...section19X&num=0&edition=prelim
//              HTTP 200 but redirected to an error page: .../docnotfound.xhtml
//              cited by: articles/congressional-oversight.html
// while the same run on the restored file exited 0 over all 150 URLs. The corrupt
// URL answered HTTP 200 with 4KB of nothing — a status-code checker would have
// passed it, which is the entire reason this gate reads bodies. Verified 2026-08-31.
//
// Proven five more ways the same day:
//   - through preflight: breaking government-shutdown's OMB citation made
//     `npm run preflight` print the dead URL and exit 1 (not just warn).
//   - offline is not a bypass: PREFLIGHT_SKIP_LINKS=1 still failed on that URL,
//     because the cache already knew it was dead. The skip only declines to
//     FETCH; it never forgives a finding.
//   - offline does not let a NEW citation through either. Adding an unfetchable
//     URL to unanimous-consent failed --offline with "1 citation URL(s) have
//     never been checked" and failed online as a 404. An unchecked URL BLOCKS:
//     "I could not check it" is not "it is fine", and warning there would have
//     made --offline a way to ship an unverified dead link.
//   - a crash is not reported as a citation problem. Injecting a throw into this
//     script made preflight say "the external-citation checker did not complete
//     (crashed) — this is a TOOLING failure, not a citation failure", instead of
//     sending the reader off to check links that were fine.
//   - cost: 0.14s and zero requests over a warm cache of 150 URLs, which is what
//     makes it safe to sit in the pre-commit hook.

'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./lib/citation-links.js');

const args = process.argv.slice(2);
const has = (n) => args.includes('--' + n);
const opt = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };

const REFRESH = has('refresh');
const OFFLINE = has('offline');
const PREFLIGHT = has('preflight');
const SELF_TEST = has('self-test');
const VERBOSE = has('verbose');
const ONE_URL = opt('url');

const today = new Date().toISOString().slice(0, 10);

// ── Self-test: the classifier, proven without the wire ──────────────────────
// Every fixture below is a real response this repo recorded on 2026-08-31.
if (SELF_TEST) {
    const cases = [
        {
            name: '200 + docnotfound.xhtml redirect (uscode.house.gov)',
            r: { status: 200, finalUrl: 'https://uscode.house.gov/docnotfound.xhtml', title: 'Document not Found', bodyHead: '', bytes: 4177 },
            want: 'dead',
        },
        {
            name: '200 + "U.S. Senate: 404 Error Page" title',
            r: { status: 200, finalUrl: 'https://www.senate.gov/somewhere/else.htm', title: 'U.S. Senate: 404 Error Page', bodyHead: '', bytes: 37523 },
            want: 'dead',
        },
        {
            name: '200 + "Document not Found" in body',
            r: { status: 200, finalUrl: 'https://example.gov/ok.htm', title: '', bodyHead: '<h1>Document not Found</h1>', bytes: 900 },
            want: 'dead',
        },
        {
            name: '404 (epa.gov retired page)',
            r: { status: 404, finalUrl: 'https://www.epa.gov/air-quality-analysis/exceptional-events-rule', title: 'Page Not Found | US EPA', bodyHead: '', bytes: 6518 },
            want: 'dead',
        },
        {
            name: '403 Cloudflare challenge (congress.gov)',
            r: { status: 403, finalUrl: 'https://www.congress.gov/crs-product/R48444', title: 'Just a moment...', bodyHead: '', bytes: 5845 },
            want: 'wall',
        },
        {
            name: '200 real statute page',
            r: { status: 200, finalUrl: 'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title5-section802&num=0&edition=prelim', title: '5 USC 802: Congressional disapproval procedure', bodyHead: '', bytes: 148098 },
            want: 'live',
        },
        {
            // REGRESSION. A bare "/404" in DEAD_FINAL_URL matched this real bill
            // number and would have blocked a commit over a page serving fine.
            name: 'H.R. 404 is a bill number, not an error page',
            r: {
                status: 200,
                requestedUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/404',
                finalUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/404',
                title: 'H.R.404 - 119th Congress (2025-2026)', bodyHead: '', bytes: 90000,
            },
            want: 'live',
        },
        {
            // REGRESSION. The URL test must judge only a URL we were REDIRECTED to.
            name: 'error-looking path we were NOT redirected to stays live',
            r: {
                status: 200,
                requestedUrl: 'https://example.gov/reports/page-not-found-analysis',
                finalUrl: 'https://example.gov/reports/page-not-found-analysis',
                title: 'Report on missing pages', bodyHead: '', bytes: 50000,
            },
            want: 'live',
        },
        {
            name: 'transport failure is UNKNOWN, never dead',
            r: { status: 0, transportError: 'ENOTFOUND', finalUrl: '', title: '', bodyHead: '', bytes: 0 },
            want: 'unknown',
        },
        {
            name: '500 is UNKNOWN, never dead',
            r: { status: 503, finalUrl: 'https://example.gov/x', title: '', bodyHead: '', bytes: 100 },
            want: 'unknown',
        },
    ];
    let ok = 0;
    for (const c of cases) {
        const got = L.classify(c.r).verdict;
        const good = got === c.want;
        if (good) ok++;
        console.log(`  ${good ? '✅' : '❌'} ${c.name.padEnd(52)} -> ${got}${good ? '' : ` (expected ${c.want})`}`);
    }
    console.log(`\n  self-test: ${ok}/${cases.length} passed`);
    process.exitCode = ok === cases.length ? 0 : 1;
    return;
}

// ── One-off URL check ───────────────────────────────────────────────────────
if (ONE_URL) {
    (async () => {
        const r = await L.fetchUrl(ONE_URL);
        const v = L.classify(r);
        console.log(`\n  ${v.verdict.toUpperCase()}  ${ONE_URL}`);
        console.log(`    ${v.reason}`);
        if (r.finalUrl && r.finalUrl !== ONE_URL) console.log(`    final: ${r.finalUrl}`);
        if (r.title) console.log(`    title: ${r.title}`);
        process.exitCode = v.verdict === 'dead' ? 1 : 0;
    })();
    return;
}

// ── The gate ────────────────────────────────────────────────────────────────
(async () => {
    const urls = L.collectCitationUrls();
    const cache = L.loadCache();
    const adj = L.loadAdjudications();
    const now = new Date();

    let fetched = false;
    const toFetch = [];
    for (const url of urls.keys()) {
        const e = cache.urls[url];
        // An adjudicated URL is exempt from the dead-verdict re-check. Without this
        // the escape hatch costs one request on every single run, forever, because
        // `dead` deliberately has TTL 0.
        if (!REFRESH && adj[url] && e) continue;
        if (REFRESH || !L.isFresh(e, now, url)) toFetch.push(url);
    }

    if (OFFLINE && toFetch.length) {
        if (!PREFLIGHT) console.log(`  · --offline: ${toFetch.length} URL(s) not fetched (no cache entry, or expired)`);
    } else if (toFetch.length) {
        if (!PREFLIGHT) console.log(`  · fetching ${toFetch.length} of ${urls.size} citation URL(s)…`);
        const CONCURRENCY = 6;
        let i = 0;
        // Per-URL try/catch, not a bare Promise.all. A throw anywhere in a worker
        // would otherwise reject the whole gather, skip the save below, and discard
        // every verdict this run had already paid for — turning one odd response
        // into a crash that also loses the work.
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }, async () => {
            while (i < toFetch.length) {
                const url = toFetch[i++];
                let entry;
                try {
                    const r = await L.fetchUrl(url);
                    const v = L.classify(r);
                    entry = {
                        verdict: v.verdict, reason: v.reason, status: r.status,
                        finalUrl: r.finalUrl && r.finalUrl !== url ? r.finalUrl : undefined,
                        title: r.title || undefined, bytes: r.bytes || undefined,
                        checkedAt: today,
                    };
                } catch (e) {
                    // A checker that crashed did not observe a dead page.
                    entry = { verdict: 'unknown', reason: `checker error: ${e && e.message || e}`, status: 0, checkedAt: today };
                }
                cache.urls[url] = entry;
                if (VERBOSE && !PREFLIGHT) console.log(`    ${entry.verdict.padEnd(7)} ${url}`);
            }
        }));
        fetched = true;
    }

    // Prune entries for URLs the corpus no longer cites. This runs on EVERY
    // non-offline pass, not only when something was fetched: a run that fixes a
    // dead URL fetches the replacement and leaves the old entry behind, and a
    // later run has nothing to fetch — so pruning inside the fetch branch would
    // keep a retired dead link in the cache indefinitely, describing a citation
    // that no longer exists. (Caught while proving the teeth, 2026-08-31.)
    let pruned = 0;
    if (!OFFLINE) {
        for (const url of Object.keys(cache.urls)) if (!urls.has(url)) { delete cache.urls[url]; pruned++; }
        // --preflight NEVER writes. preflight runs inside the pre-commit hook, and a
        // hook writes to the working tree AFTER the index is built — so persisting
        // here left data/link-check-cache.json dirty and uncommitted immediately
        // after every "clean" commit that happened to fetch something, with nothing
        // to re-stage it. The results are still used for THIS run's verdict; they
        // are simply not saved. `npm run link-check` is what persists them.
        if ((fetched || pruned) && !PREFLIGHT) L.saveCache(cache);
        else if ((fetched || pruned) && PREFLIGHT) {
            console.log(`  · ${fetched ? 'fetched new result(s)' : 'pruned stale entries'} — not saved (preflight is read-only); run \`npm run link-check\` to persist`);
        }
    }

    const dead = [], walls = [], unknown = [], unchecked = [], adjudicated = [];
    for (const [url, files] of urls) {
        const e = cache.urls[url];
        if (!e) { unchecked.push({ url, files }); continue; }
        const a = adj[url];
        if (a && e.verdict === 'dead') { adjudicated.push({ url, files, e, a }); continue; }
        if (e.verdict === 'dead') dead.push({ url, files, e });
        else if (e.verdict === 'wall') walls.push({ url, files, e });
        else if (e.verdict === 'unknown') unknown.push({ url, files, e });
    }

    for (const d of dead) {
        console.log(`  ❌ DEAD  ${d.url}`);
        console.log(`           ${d.e.reason}`);
        if (d.e.finalUrl) console.log(`           final: ${d.e.finalUrl}`);
        console.log(`           cited by: ${d.files.join(', ')}`);
    }
    for (const u of unknown) console.log(`  ⚠️  UNKNOWN ${u.url} — ${u.e.reason} (not blocking)`);
    // An UNCHECKED URL BLOCKS. It can only happen offline, and offline it means a
    // citation nobody has ever verified — most likely one just added to a new
    // article. Warning here would have made --offline a way to ship an unverified
    // dead link with no block at all, which is precisely the hole this gate exists
    // to close. "I could not check it" is not "it is fine".
    if (unchecked.length) {
        console.log(`  ❌ ${unchecked.length} citation URL(s) have never been checked:`);
        unchecked.slice(0, 10).forEach((u) => console.log(`         ${u.url}\n           cited by: ${u.files.join(', ')}`));
        if (unchecked.length > 10) console.log(`         … and ${unchecked.length - 10} more`);
    }
    if (VERBOSE && walls.length) walls.forEach((w) => console.log(`  ◦ wall  ${w.url} — ${w.e.reason}`));
    if (VERBOSE && adjudicated.length) adjudicated.forEach((x) => console.log(`  ◦ adjudicated ${x.url} — ${x.a.reason}`));

    // process.exitCode, never process.exit(): on Windows, exiting while undici
    // still holds a keep-alive socket trips a libuv assertion in async.c and the
    // process dies with 127 instead of 1 — which would hand a BLOCKING gate a
    // meaningless exit code. Observed while proving these teeth, 2026-08-31.
    if (dead.length || unchecked.length) {
        const bits = [];
        if (dead.length) bits.push(`${dead.length} dead citation(s) — fix the URL, or record why it is acceptable in ${L.ADJ_REL}`);
        if (unchecked.length) bits.push(`${unchecked.length} unverified citation(s) — run \`npm run link-check\` with a network connection`);
        // GATE-VERDICT is the marker preflight looks for to tell a real finding from
        // a crash in this script. Do not remove it without updating preflight.
        console.log(`\n  ❌ GATE-VERDICT: ${bits.join('; ')}.`);
        process.exitCode = 1;
        return;
    }
    const walled = walls.length ? `, ${walls.length} bot-walled (live for humans)` : '';
    const unk = unknown.length ? `, ${unknown.length} unknown` : '';
    console.log(`  ✅ All ${urls.size} external citation URL(s) resolve${walled}${unk}.`);
})();
