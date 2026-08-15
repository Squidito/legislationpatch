// article-ledger.js -- shared reader for ARTICLE claim-ledgers
// (data/qa-ledger/article-<slug>.json), the explainer-lane twin of the per-bill
// ledgers.
//
// Shared by:
//   qa-receipts.js          -- receipt is real source text
//   qa-ledger-regression.js -- verified receipts still resolve (pre-commit gate)
//   qa-provenance-stamp.js  -- what produced the article + the source it read
//
// ONE DIFFERENCE FROM THE BILL LEDGERS, AND IT IS DELIBERATE.
// A bill's receipts are checked against its bill-text PLUS every file in
// data/ref-text/ concatenated, because a bill may legitimately cite any source
// it registered. An article has no bill text, so that pooling would mean an
// article receipt could "verify" against a source the article never cites --
// the check would pass on the wrong document. So an article claim names its
// source (`sourceFile`) and is checked against THAT FILE ONLY. A claim naming
// no source, or naming one the ledger does not register, FAILS. Strictly
// stronger than the bill path, and it is what makes the receipt a binding.
//
// Read-only. No LLM. No network.

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');

/** Article ledgers are discriminated by `kind`, with the id prefix as a fallback. */
function isArticleLedger(l) {
    return !!l && (l.kind === 'article' || /^article-/.test(String(l.id || '')));
}

/** slug of an article ledger: "article-suspension-of-the-rules" -> "suspension-of-the-rules" */
function slugOf(l) {
    return l.slug || String(l.id || '').replace(/^article-/, '');
}

/**
 * Where the article's prose lives right now. A draft that James has published
 * has MOVED, so look in both places and report which one answered. Neither
 * existing is a legitimate state (the draft was discarded), not an error --
 * the receipts still replay from data/ref-text/, which is tracked.
 */
function proseFile(l) {
    const slug = slugOf(l);
    const candidates = [
        l.draftFile || path.posix.join('drafts', slug + '.html'),
        path.posix.join('articles', slug + '.html'),
    ];
    for (const rel of candidates) {
        if (fs.existsSync(path.join(ROOT, rel))) return rel;
    }
    return null;
}

/** Hash of the rendered prose only -- <div class="article-body"> to </div></article>. */
function proseHash(l) {
    const rel = proseFile(l);
    if (!rel) return null;
    const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const start = html.indexOf('class="article-body"');
    const end = html.indexOf('</article>');
    const body = (start >= 0 && end > start) ? html.slice(start, end) : html;
    return crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
}

/**
 * Registered sources, by id. Each entry mirrors a bill's `referencedSources`
 * shape: { id, kind, label, citation, srcUrl, textFile, fetchedAt }.
 */
function sourcesOf(l) {
    const out = {};
    for (const s of (l.sources || [])) if (s && s.id) out[s.id] = s;
    return out;
}

/**
 * Text of the ONE source a claim names.
 * Returns { ok, text, reason } -- never falls back to another file, because a
 * silent fallback is exactly the failure this module exists to prevent.
 * `cache` is an optional object reused across claims to avoid re-reading.
 */
function sourceTextForClaim(l, claim, cache) {
    const registered = sourcesOf(l);
    const id = claim && claim.sourceFile;
    if (!id) return { ok: false, reason: 'claim names no sourceFile' };
    const entry = registered[id];
    if (!entry) return { ok: false, reason: `sourceFile "${id}" is not registered on the ledger` };
    if (!entry.textFile) return { ok: false, reason: `source "${id}" has no textFile` };
    if (cache && cache[id] !== undefined) return { ok: true, text: cache[id], entry };
    const abs = path.join(ROOT, entry.textFile);
    if (!fs.existsSync(abs)) return { ok: false, reason: `stored source missing on disk: ${entry.textFile}` };
    const text = fs.readFileSync(abs, 'utf8');
    if (cache) cache[id] = text;
    return { ok: true, text, entry };
}

/** sha256 of every registered source file, by source id (for the provenance sidecar). */
function sourceShas(l) {
    const out = {};
    for (const s of (l.sources || [])) {
        if (!s || !s.id || !s.textFile) continue;
        try {
            out[s.id] = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, s.textFile))).digest('hex');
        } catch (e) { /* missing file is reported by the receipt check, not here */ }
    }
    return out;
}

module.exports = { isArticleLedger, slugOf, proseFile, proseHash, sourcesOf, sourceTextForClaim, sourceShas, ROOT };
