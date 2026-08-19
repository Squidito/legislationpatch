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
    // Topic-hub prose (slug "topic-<hub>"): its published home is a tracked
    // fragment injected by generate_topic_hubs.js, not a page in articles/.
    if (/^topic-/.test(slug)) {
        candidates.push(path.posix.join('data', 'topics', slug.replace(/^topic-/, '') + '-prose.html'));
    }
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

/**
 * Is the ledger describing the prose that is on disk RIGHT NOW?
 *
 * The receipts prove ledger->source. Nothing proved ledger->draft, so an edit
 * made after the audit left a ledger that still described the old text -- it
 * carried a claim for a paragraph that had been deleted, and the pass still
 * scored clean. A ledger that describes prose which no longer exists must never
 * bless a publish, so the audit stamps the draft hash it read and everything
 * downstream compares against it.
 *
 * Returns { ok, reason, stamped, actual }. A ledger with no stamp is NOT ok:
 * absence of the field cannot be allowed to mean "fine" (that is the silent-skip
 * bug class this repo keeps re-learning).
 */
function proseMatchesLedger(l) {
    const actual = proseHash(l);
    const stamped = l.proseSha || null;
    if (!actual) return { ok: false, reason: 'no prose file on disk to compare', stamped, actual };
    if (!stamped) return { ok: false, reason: 'ledger carries no proseSha — re-audit to stamp it', stamped, actual };
    if (stamped !== actual) return { ok: false, reason: `prose changed since the audit (ledger ${stamped}, draft ${actual})`, stamped, actual };
    return { ok: true, reason: 'ledger matches the prose on disk', stamped, actual };
}

/**
 * D4 SUBSTANCE FINGERPRINT — the "did the audited facts change" signal that
 * decides whether a refresh bumps dateModified (D4, decided 2026-08-19).
 *
 * Deliberately FACTS-ONLY: the sorted, de-duplicated set of every live SUPPORTED
 * claim's { sourceFile, normalized sourceSpan } — the source-bound receipts the
 * article currently asserts. It is INSENSITIVE to prose wording, claim
 * paraphrase, row order, field/section labels, typos, link weaving and
 * metadata; and SENSITIVE to a fact added, corrected, removed, or a figure
 * refreshed (each moves the receipt set). That is exactly the D4 line: bump on
 * substance, never on style / link / metadata / typos.
 *
 * NOT the same primitive as patch-console's article-audit ledgerSubstanceHash():
 * that one drives PASS CONVERGENCE and must catch any edit (it folds in proseSha,
 * field, verdict, severity, status). This one drives the PUBLISHED-DATE decision
 * and must ignore everything that is not a sourced fact. Two questions, two hashes.
 *
 * "Live" = status !== 'fixed' (a fixed row is a removed/superseded claim kept as
 * audit history) and verdict === 'SUPPORTED' (only asserted facts count; a
 * REJECTED flag or an open UNSUPPORTED row asserts nothing). Returns null when a
 * ledger carries no receipted SUPPORTED claim — the caller treats null as
 * "cannot prove unchanged" and bumps, the honest fail-safe.
 */
function ledgerSubstanceHash(l) {
    if (!l || !Array.isArray(l.claims)) return null;
    const facts = [];
    for (const c of l.claims) {
        if (!c || c.status === 'fixed' || c.verdict !== 'SUPPORTED') continue;
        const span = String(c.sourceSpan || '').replace(/\s+/g, ' ').trim();
        if (!span) continue;
        // JSON tuple, not a delimiter join: no separator can collide with span text.
        facts.push(JSON.stringify([c.sourceFile || '', span]));
    }
    if (!facts.length) return null;
    const uniq = [...new Set(facts)].sort();
    return crypto.createHash('sha256').update(JSON.stringify(uniq)).digest('hex').slice(0, 16);
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

module.exports = { isArticleLedger, slugOf, proseFile, proseHash, proseMatchesLedger, ledgerSubstanceHash, sourcesOf, sourceTextForClaim, sourceShas, ROOT };
