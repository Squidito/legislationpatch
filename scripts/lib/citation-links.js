// citation-links.js -- shared machinery for the external-citation gate.
//
// WHY THIS EXISTS. preflight checks 65,000 INTERNAL links and passes. It never
// looked at a single EXTERNAL one, and neither does the article audit lane -- so
// congressional-review-act passed the full first-refresh lane while two of its
// "Key Sources" pointed at nothing. The 2026-08 sweep measured 17 dead citations
// sitting live in trust boxes and JSON-LD citation arrays on indexed pages.
//
// THE PART THAT MATTERS: 14 OF THE 17 RETURNED HTTP 200.
//
//   uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title5-section802&num=0
//     -> 200, 4,177 bytes, redirected to docnotfound.xhtml, <title>Document not Found</title>
//   senate.gov/reference/reference_index_subjects/Filibuster_vrd.htm
//     -> 200, 37,523 bytes, redirected to file_not_found.htm, <title>U.S. Senate: 404 Error Page</title>
//
// A status-code link checker passes both. So this one reads the body: the final
// URL after redirects, the <title>, and a short list of exact error strings.
//
// PRECISION OVER RECALL, DELIBERATELY. This gate BLOCKS commits, and a gate that
// cries wolf gets bypassed, which is worse than no gate. So:
//   - Only POSITIVE evidence of death fails: a 404/410, or a 2xx whose final URL
//     or <title> says it is an error page.
//   - 401/403/429 are WALLS, not deaths. congress.gov, cbo.gov, gao.gov and
//     govtrack.us all Cloudflare-challenge scripted clients while serving humans
//     fine. The last sweep nearly deleted live citations over exactly this, so a
//     wall is reported and never blocks.
//   - 5xx and transport errors are UNKNOWN. "fetch failed" is not "page gone"
//     (SCRIPT-CONVENTIONS §7). Unknown warns; it never blocks.
//   - data/link-adjudications.json overrides a verdict with a recorded reason,
//     the same escape hatch data/qa-adjudications.json gives the figure guard.
//
// NETWORK BUDGET. Results are cached in data/link-check-cache.json with a TTL, so
// a preflight run over a corpus whose citations are all cached-and-fresh makes zero
// requests. Fetches happen for URLs that are new, TTL-expired, or previously dead
// (a dead entry is re-checked every run so a fix clears instantly -- so "zero
// requests" holds only while nothing is dead, which is the steady state). Adjudicated
// URLs are exempted from that re-check, or the escape hatch would cost a request
// forever. TTLs are JITTERED per URL: the whole cache was seeded in one day, and
// without jitter all 150 entries would expire on the same day and dump a 150-URL
// fetch into whichever commit came first.
//
// THE CACHE IS TRUSTED STATE, and worth being honest about: nothing distinguishes a
// verdict this tool wrote from one a human typed. Flipping an entry to "live" by
// hand silences the gate for that URL's TTL, with no reason and no trace. The
// sanctioned override is data/link-adjudications.json, which forces a reason and a
// date; the cache is not a second escape hatch so much as an unpoliceable one, and
// a reviewer reading a diff should treat a hand-edited cache entry as they would a
// hand-edited test snapshot.
//
// SCOPE. articles/ and drafts/ only, and within them, <a href> plus JSON-LD
// `citation` URLs. That is where citations live and where the rot accumulated.
// Deliberately OUT of scope, so the boundary is a decision and not an oversight:
//   - Generated bill and rep pages. They emit thousands of congress.gov and
//     bioguide URLs from templates; that is one template's correctness, not 3,000
//     independent editorial claims, and fetching them would make the gate unusable.
//   - JSON-LD `sameAs` (the Wikipedia identifier on an article's `about` node, on
//     ~10 pages). It identifies an entity for a search engine; it is not a source
//     the article rests a claim on, and a reader is never sent there.
//
// No LLM. Reads articles/, drafts/, data/link-check-cache.json and
// data/link-adjudications.json; writes only the cache.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const CACHE_REL = 'data/link-check-cache.json';
const ADJ_REL = 'data/link-adjudications.json';
const CACHE = path.join(ROOT, CACHE_REL);
const ADJ = path.join(ROOT, ADJ_REL);

// Real Chrome. Several .gov hosts serve a challenge page to anything that looks
// like a script, and the previous sweep recorded those as dead links.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Assets, not citations. A Google Fonts stylesheet is not a source claim.
const SKIP_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'schema.org', 'www.w3.org']);
const SELF_HOSTS = new Set(['legislationpatch.com', 'www.legislationpatch.com']);

// dead: 0 -> never fresh, so a dead URL is re-checked every run and a fix clears
// instantly. unknown: 7 -> a chronically-erroring host is retried weekly, not on
// every commit. live/wall: 30 days, PLUS a per-URL jitter (see isFresh) so the
// cache does not expire all at once.
const TTL_DAYS = { live: 30, wall: 30, unknown: 7, dead: 0 };
const TTL_JITTER_DAYS = 14;

// ── Verdict evidence ────────────────────────────────────────────────────────
// Every pattern below was written against a body this repo actually fetched.

/**
 * The server redirected us onto its own error page. Strongest single signal --
 * but ONLY when a redirect actually happened, which classify() enforces.
 *
 * A bare "/404" used to be in this list and was a live landmine: it matches
 * https://www.congress.gov/bill/119th-congress/house-bill/404 -- a real, ordinary
 * bill number -- so citing H.R. 404 would have blocked the commit with a "dead
 * link" that was serving fine. Three-digit bill numbers are common; this would
 * have fired eventually, and intermittently (congress.gov usually walls the
 * fetcher first), which is the worst way for a blocking gate to be wrong. Dropped.
 * A genuine soft-404 that lands on a numeric error path still gets caught by its
 * title or body.
 */
const DEAD_FINAL_URL = /(file_not_found|docnotfound|page[-_]?not[-_]?found|\/not[-_]?found(?:[./?]|$))/i;

/** <title> of an error page. Anchored phrases only -- a bare "404" alone is not enough. */
const DEAD_TITLE = [
    /\b(?:page|document|file|content)\s+not\s+found\b/i,
    /\b404\b[^|]{0,24}\b(?:error|not\s+found)\b/i,
    /\berror\s*404\b/i,
    /^\s*not\s+found\s*$/i,
];

/** Exact strings from real error bodies. Checked in the first 8KB only. */
const DEAD_BODY = [
    'Document not Found',
    'Requested Page Not Found',
    'The page you requested could not be found',
    'The page you are looking for could not be found',
    'This page no longer exists',
    'Sorry, the page you requested was not found',
];

// ── URL collection ──────────────────────────────────────────────────────────

/**
 * Every external URL an article asserts as a source: visible <a href> links plus
 * the `citation[].url` entries in its JSON-LD. Both are collected because they
 * are maintained by hand in two places and can disagree -- and the JSON-LD copy
 * is the one search engines read, so a dead URL there is not cosmetic.
 *
 * Returns Map<url, string[]> (url -> the article files that carry it).
 */
function collectCitationUrls(root = ROOT) {
    const out = new Map();
    const add = (url, file) => {
        let u;
        url = String(url).trim();
        // A protocol-relative //example.com/x is given a scheme rather than being
        // dropped; everything else keeps the URL EXACTLY as the article wrote it,
        // because that string is both the cache key and what a human has to search
        // for when the gate names it. Normalising through URL.href would rewrite
        // https://api.congress.gov to .../ and orphan every cached verdict.
        if (url.startsWith('//')) url = 'https:' + url;
        try { u = new URL(url); } catch (e) { return; }
        if (!/^https?:$/.test(u.protocol)) return;
        const host = u.hostname.toLowerCase();
        if (SKIP_HOSTS.has(host) || SELF_HOSTS.has(host)) return;
        if (!out.has(url)) out.set(url, []);
        if (!out.get(url).includes(file)) out.get(url).push(file);
    };

    for (const dir of ['articles', 'drafts']) {
        const abs = path.join(root, dir);
        if (!fs.existsSync(abs)) continue;
        for (const name of fs.readdirSync(abs)) {
            if (!name.endsWith('.html')) continue;
            const rel = `${dir}/${name}`;
            const html = fs.readFileSync(path.join(abs, name), 'utf8');

            // Case-insensitive and whitespace-tolerant: HREF= and a line-wrapped
            // attribute are both legal HTML, and silently missing one would mean a
            // citation this gate never checks -- the exact shape of the gap it exists
            // to close.
            for (const m of html.matchAll(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
                add(decodeEntities(m[1] !== undefined ? m[1] : m[2]), rel);
            }
            for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
                let parsed;
                try { parsed = JSON.parse(block[1]); } catch (e) { continue; }
                for (const c of citationNodes(parsed)) {
                    // schema.org allows a citation to be a bare URL string as well as
                    // a CreativeWork with a url property. Accept both.
                    if (typeof c === 'string') add(c, rel);
                    else if (c && typeof c.url === 'string') add(c.url, rel);
                }
            }
        }
    }
    return out;
}

/** `citation` may be one object or an array, at the top level or inside @graph. */
function citationNodes(parsed) {
    const nodes = [];
    const visit = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(visit); return; }
        if (n.citation) nodes.push(...[].concat(n.citation));
        if (n['@graph']) visit(n['@graph']);
    };
    visit(parsed);
    return nodes;
}

/** Only the entities that legally appear inside an href. Not a general decoder. */
function decodeEntities(s) {
    return String(s).replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/&quot;/g, '"');
}

// ── Classification ──────────────────────────────────────────────────────────

/**
 * Turn one fetch result into a verdict. Pure -- no network, no clock, no files --
 * so --self-test can prove the soft-404 logic without touching the wire.
 *
 * verdict: 'live' | 'dead' | 'wall' | 'unknown'
 */
function classify(r) {
    if (r.transportError) return { verdict: 'unknown', reason: `fetch failed: ${r.transportError}` };
    const s = r.status;
    if (s === 401 || s === 403 || s === 429) {
        return { verdict: 'wall', reason: `HTTP ${s} — bot wall, live for humans (not treated as dead)` };
    }
    if (s >= 500) return { verdict: 'unknown', reason: `HTTP ${s} — server error, may be transient` };
    if (s === 404 || s === 410) return { verdict: 'dead', reason: `HTTP ${s}` };
    if (s >= 400) return { verdict: 'dead', reason: `HTTP ${s}` };

    // The URL test applies ONLY to a URL we were redirected TO. Judging the URL we
    // asked for would convict a page for its own name -- see DEAD_FINAL_URL above.
    const finalUrl = r.finalUrl || '';
    const redirected = !!(finalUrl && r.requestedUrl && finalUrl !== r.requestedUrl);
    if (redirected && DEAD_FINAL_URL.test(finalUrl)) {
        return { verdict: 'dead', reason: `HTTP ${s} but redirected to an error page: ${finalUrl}` };
    }
    const title = (r.title || '').trim();
    if (title && DEAD_TITLE.some((re) => re.test(title))) {
        return { verdict: 'dead', reason: `HTTP ${s} but the page title is an error page: "${title}"` };
    }
    const head = r.bodyHead || '';
    const hit = DEAD_BODY.find((p) => head.includes(p));
    if (hit) return { verdict: 'dead', reason: `HTTP ${s} but the body carries an error string: "${hit}"` };

    // A 200 with almost nothing in it is not evidence of death (SPAs legitimately
    // ship a small shell), so this stays a note rather than a verdict.
    return { verdict: 'live', reason: `HTTP ${s}${r.bytes ? `, ${r.bytes} bytes` : ''}${title ? ` — "${title.slice(0, 70)}"` : ''}` };
}

// ── Fetching ────────────────────────────────────────────────────────────────

/**
 * GET, not HEAD: the whole point is that the body disagrees with the status.
 * Two attempts, because one connection reset must not fail a commit.
 */
async function fetchUrl(url, { timeoutMs = 20000, attempts = 2 } = {}) {
    let last = null;
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': UA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                redirect: 'follow',
                signal: AbortSignal.timeout(timeoutMs),
            });
            const ct = res.headers.get('content-type') || '';
            let bodyHead = '', bytes = 0, title = '';
            // A MISSING Content-Type is read as text, not as binary. Some of the
            // legacy .gov infrastructure this gate exists to catch is old enough to
            // omit it, and falling to the byte-count branch would skip the title and
            // body scan -- i.e. skip the only checks that catch a soft-404.
            if (!ct.trim() || /text|html|xml|json/i.test(ct)) {
                const text = await res.text();
                bytes = text.length;
                bodyHead = text.slice(0, 8192);
                const m = text.slice(0, 20000).match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
                title = m ? m[1].replace(/\s+/g, ' ').trim() : '';
            } else {
                bytes = (await res.arrayBuffer()).byteLength;   // PDFs: status + size only
            }
            return { status: res.status, requestedUrl: url, finalUrl: res.url, title, bodyHead, bytes, contentType: ct };
        } catch (e) {
            last = e;
            if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 1200));
        }
    }
    return { status: 0, requestedUrl: url, finalUrl: '', title: '', bodyHead: '', bytes: 0, transportError: String(last && last.message || last) };
}

// ── Cache + adjudications ───────────────────────────────────────────────────

const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } };

function loadCache() { const c = readJson(CACHE, null); return (c && c.urls) ? c : { updatedAt: null, urls: {} }; }
function saveCache(cache) {
    cache.updatedAt = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2) + '\n');
}
/** url -> { verdict, reason, adjudicatedAt }. See data/link-adjudications.json's _doc. */
function loadAdjudications() { const a = readJson(ADJ, null); return (a && a.urls) ? a.urls : {}; }

/**
 * Deterministic 0..TTL_JITTER_DAYS spread, keyed on the URL. The whole cache was
 * seeded on one day, so a flat 30-day TTL would expire all 150 entries together and
 * drop a 150-URL fetch into whichever commit happened to be first that morning --
 * a monthly pre-commit stall. Keyed on the URL rather than random so the same URL
 * always gets the same offset and re-runs stay reproducible.
 */
function ttlFor(url, verdict) {
    const base = TTL_DAYS[verdict];
    if (!base) return base;                                  // 0 / undefined: always re-check
    if (verdict === 'unknown') return base;                  // already short; jitter would blur it
    const h = crypto.createHash('sha256').update(String(url)).digest()[0];
    return base + (h % (TTL_JITTER_DAYS + 1));
}

/**
 * Is a cached entry still trusted?
 * A `dead` verdict has TTL 0, so it is NEVER fresh and is re-checked on every
 * non-offline run — that is what makes a fix clear immediately. Every other verdict
 * (including `unknown`, at 7 days) IS cached for its TTL.
 */
function isFresh(entry, today = new Date(), url = '') {
    if (!entry || !entry.checkedAt) return false;
    const ttl = ttlFor(url, entry.verdict);
    if (!ttl) return false;
    const age = (today - new Date(entry.checkedAt + 'T00:00:00Z')) / 86400000;
    return age >= 0 && age < ttl;
}

module.exports = {
    ROOT, CACHE_REL, ADJ_REL, UA, TTL_DAYS,
    collectCitationUrls, citationNodes, decodeEntities,
    classify, fetchUrl,
    loadCache, saveCache, loadAdjudications, isFresh,
    DEAD_FINAL_URL, DEAD_TITLE, DEAD_BODY,
};
