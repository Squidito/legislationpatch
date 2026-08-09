#!/usr/bin/env node
// qa-ledger-seed.js — import already-completed audits into the claim-ledger as HISTORICAL
// records so corpus coverage is accurate without re-auditing bills we already did.
//
//   node scripts/qa-ledger-seed.js          → create imported entries that don't exist yet
//   node scripts/qa-ledger-seed.js --force  → overwrite existing imported entries
//
// HONESTY RULES (learned from the v1 review):
//   • These are seeded from the OLD gold-set/Wave-1 work — NOT the v1 rubric. They carry
//     no receipts/bindings/SUPPORTED baseline, so they are marked depth:"imported",
//     status:"imported", auditVersion:null — the report treats them as historical, never
//     as live-accuracy or as "audited to rubric depth."
//   • NEVER fabricate cross-model provenance: verify/verifyModel stay null (per-claim
//     verification was not retained). Gold-set files are STILL candidate-status (not
//     human-adjudicated); their error rows are AI-proposed history, not confirmed truth.
//   • NEVER downgrade a real full-claims audit — those are skipped unless --force.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GOLD_DIR = path.join(ROOT, 'data', 'gold-set');
const LEDGER_DIR = path.join(ROOT, 'data', 'qa-ledger');
const CACHE = path.join(ROOT, 'data', 'cache.json');
const FORCE = process.argv.includes('--force');

// Wave-1 hostile audit (2026-08-08): fixes applied where flagged; structured error rows
// were not retained, so these seed as imported coverage-markers (distinct from clean).
const WAVE1 = ['119-HR-8029', '119-HR-7147', '119-HR-1968', '119-S-331',
    '119-HR-22', '119-HR-36', '119-S-146', '119-HR-1262'];

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } }

const cacheRaw = readJson(CACHE, { bills: [] });
const cacheBills = Array.isArray(cacheRaw) ? cacheRaw : (cacheRaw.bills || Object.values(cacheRaw));
const meta = {};
for (const b of cacheBills) meta[b.id || b.billId] = { title: b.title || '', billType: b.billType || '' };

function verdictFor(type) {
    if (type === 'omission') return 'OMISSION';
    if (type === 'unsupported') return 'UNSUPPORTED';
    return 'CONTRADICTED';
}
function normType(t) { return t === 'direction-inversion' ? 'direction' : (t || 'other'); }

if (!fs.existsSync(LEDGER_DIR)) fs.mkdirSync(LEDGER_DIR, { recursive: true });

function shouldSkip(id) {
    const p = path.join(LEDGER_DIR, id + '.json');
    if (!fs.existsSync(p)) return false;
    const e = readJson(p, null);
    if (e && e.depth === 'full-claims') return true;   // never clobber a real audit
    return !FORCE;                                      // imported seed already present
}

let created = 0, skipped = 0;

// 1) gold-set → imported ledger
for (const f of fs.readdirSync(GOLD_DIR)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    const g = readJson(path.join(GOLD_DIR, f), null);
    if (!g || !g.id) continue;
    if (shouldSkip(g.id)) { skipped++; continue; }

    const claims = (g.errors || []).map(e => ({
        field: e.field || '',
        claim: e.claim || '',
        verdict: verdictFor(e.type),
        type: normType(e.type),
        severity: e.severity || 'material',
        sourceSpan: e.sourceTruth || '',   // may contain "…" elision — not guaranteed verbatim
        sourceStart: null, sourceEnd: null,
        section: null,                     // binding not captured pre-v1; filled on any real re-audit
        note: e.problem || '',
        status: g.resolution ? 'fixed' : 'open',   // bill-level resolution = the material issues were fixed
        verify: null, verifyModel: null,   // per-claim cross-model verdict was NOT retained — do not fabricate
    }));
    const material = claims.filter(c => c.severity === 'material').length;
    const ledger = {
        id: g.id, title: g.title || meta[g.id]?.title || '', billType: g.billType || meta[g.id]?.billType || '',
        auditVersion: null, status: 'imported', depth: 'imported',
        sourceReadDepth: g.sourceReadDepth || 'partial',
        auditedAt: g.labeledAt || null, auditModel: 'gold-set-import', verifyModel: null,
        importedFrom: 'data/gold-set/' + f, goldStatus: g.status || null,
        claims,
        counts: { claims: claims.length, material, minor: claims.length - material, omissions: claims.filter(c => c.verdict === 'OMISSION').length },
        resolution: g.resolution || '',
        notes: 'Imported historical record (gold-set candidate flags, NOT the v1 rubric). No receipts/bindings/SUPPORTED baseline. Upgrade to full-claims on re-audit.',
    };
    fs.writeFileSync(path.join(LEDGER_DIR, g.id + '.json'), JSON.stringify(ledger, null, 2) + '\n');
    created++;
}

// 2) Wave-1 → imported coverage marker (no retained error rows)
for (const id of WAVE1) {
    if (shouldSkip(id)) { skipped++; continue; }
    const ledger = {
        id, title: meta[id]?.title || '', billType: meta[id]?.billType || '',
        auditVersion: null, status: 'imported', depth: 'imported',
        sourceReadDepth: 'full', auditedAt: '2026-08-08', auditModel: 'wave1-import', verifyModel: null,
        importedFrom: 'memory:project-goldset-labeling (Wave-1)', goldStatus: null,
        claims: [],
        counts: { claims: 0, material: 0, minor: 0, omissions: 0 },
        resolution: '',
        notes: 'Wave-1 hostile audit 2026-08-08 (fixes applied where flagged; structured rows not retained). Coverage-marker only — NOT verified-clean; re-audit to capture full claims.',
    };
    fs.writeFileSync(path.join(LEDGER_DIR, id + '.json'), JSON.stringify(ledger, null, 2) + '\n');
    created++;
}

console.log(`qa-ledger-seed: ${created} imported entr(ies) written, ${skipped} skipped (already present).`);
