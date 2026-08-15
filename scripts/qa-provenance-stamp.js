#!/usr/bin/env node
// qa-provenance-stamp.js — stamp what produced each analysis + the source hash it was
// written against, into data/qa-provenance.json. Deterministic, zero LLM cost.
//
//   npm run qa-provenance          → stamp/refresh billTextSha + promptVersion for all bills
//
// This is the "last full pass" enabler: once a bill carries billTextSha, `qa-ledger`
// detects when its source text changed and re-triggers audit for THAT bill only — so future
// re-audits are targeted, never corpus-wide. genModel/genAt are unknown for backfilled bills
// (analysis didn't record them); the analysis step stamps them going forward. Existing
// genModel/genAt/refShas in the sidecar are preserved.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AL = require('./lib/article-ledger');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'data', 'cache.json');
const BILLTEXT = path.join(ROOT, 'data', 'bill-text');
const REFTEXT = path.join(ROOT, 'data', 'ref-text');
const LEDGER_DIR = path.join(ROOT, 'data', 'qa-ledger');
const SIDECAR = path.join(ROOT, 'data', 'qa-provenance.json');

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }
function sha256File(p) { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (e) { return null; } }

// promptVersion = hash of the shipped SYSTEM_PROMPT (the writing rules). Falls back to the
// file bytes if the export shape changes.
function promptVersion() {
    try {
        const P = require(path.join(ROOT, 'scripts', 'prompts.js'));
        if (P && typeof P.SYSTEM_PROMPT === 'string') return crypto.createHash('sha256').update(P.SYSTEM_PROMPT).digest('hex').slice(0, 16);
    } catch (e) { /* fall through */ }
    const b = sha256File(path.join(ROOT, 'scripts', 'prompts.js'));
    return b ? 'file:' + b.slice(0, 16) : null;
}

const cacheRaw = readJson(CACHE, { bills: [] });
const bills = Array.isArray(cacheRaw) ? cacheRaw : (cacheRaw.bills || Object.values(cacheRaw));
const sidecar = readJson(SIDECAR, {});
const pv = promptVersion();
const stampedAt = new Date().toISOString().slice(0, 10);

let stamped = 0, changed = 0;
for (const b of bills) {
    const id = b.id || b.billId;
    const sha = sha256File(path.join(BILLTEXT, id + '.txt'));
    if (!sha) continue;
    const prev = sidecar[id] || {};
    if (prev.billTextSha && prev.billTextSha !== sha) changed++;

    // referenced-source hashes (staleness of cross-bill claims)
    const refShas = {};
    for (const rs of (b.referencedSources || [])) {
        if (rs.textFile) { const rp = path.join(ROOT, rs.textFile); const h = sha256File(rp); if (h) refShas[rs.id || rs.textFile] = h; }
    }

    sidecar[id] = {
        billTextSha: sha,
        refShas: Object.keys(refShas).length ? refShas : (prev.refShas || undefined),
        promptVersion: pv,
        genModel: prev.genModel || null,   // preserved; set by the analysis step going forward
        genAt: prev.genAt || b.analyzedAt || null,
        stampedAt,
    };
    stamped++;
}

// ── Articles ────────────────────────────────────────────────────────────────
// Same contract as a bill: record the source the prose was written against, so
// a later change to that source re-triggers the audit for THAT article only.
// An article has no bill text, so its source hashes are the registered
// referenced sources and `proseSha` stands in for the analysis body.
let stampedArticles = 0, changedArticles = 0;
if (fs.existsSync(LEDGER_DIR)) {
    for (const f of fs.readdirSync(LEDGER_DIR)) {
        if (!f.endsWith('.json') || f.startsWith('_')) continue;
        const l = readJson(path.join(LEDGER_DIR, f), null);
        if (!AL.isArticleLedger(l)) continue;
        const prev = sidecar[l.id] || {};
        const shas = AL.sourceShas(l);
        const proseSha = AL.proseHash(l);
        if (prev.sourceShas && JSON.stringify(prev.sourceShas) !== JSON.stringify(shas)) changedArticles++;
        sidecar[l.id] = {
            kind: 'article',
            sourceShas: shas,
            proseSha,
            proseFile: AL.proseFile(l),
            promptVersion: pv,
            genModel: prev.genModel || l.auditModel || null,
            genAt: prev.genAt || l.auditedAt || null,
            stampedAt,
        };
        stampedArticles++;
    }
}

fs.writeFileSync(SIDECAR, JSON.stringify(sidecar, null, 2) + '\n');
console.log(`qa-provenance: stamped ${stamped} bill(s)` +
    (stampedArticles ? ` + ${stampedArticles} article(s)` : '') +
    ` → data/qa-provenance.json (promptVersion ${pv || 'n/a'})` +
    (changed ? ` · ${changed} bill(s) had a DIFFERENT prior billTextSha (source changed since last stamp)` : '') +
    (changedArticles ? ` · ${changedArticles} article(s) had DIFFERENT prior source hashes` : ''));
