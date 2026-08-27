#!/usr/bin/env node
// generate-tracker-roster.js — derive the 119th-congress-tracker article's
// complete bill roster from data/cache.json, plus the stored source sheet its
// audit receipts bind to.
//
// Usage:
//   node scripts/generate-tracker-roster.js                    (dry run: summary only)
//   node scripts/generate-tracker-roster.js --apply [--file <article.html>]
//   node scripts/generate-tracker-roster.js --check [--file <article.html>]
//
// Reads:  data/cache.json, data/slug-index.json
// Writes (--apply):
//   - the HTML between <!-- lp-roster:start --> / <!-- lp-roster:end --> in the
//     target file (default articles/119th-congress-tracker.html; pass the draft
//     while one is in flight)
//   - data/ref-text/record-lp-corpus-119-snapshot.txt — the corpus snapshot the
//     article ledger's receipts resolve against (same role as the committed
//     Census county files: provenance for generated claims)
// --check regenerates both and exits 1 if either differs from what is on disk.
//
// Every rendered fact (counts, group labels, titles, links, order) is derived
// from the cache — nothing countable is typed here (docs/TOPIC-HUBS.md rule 1).
// Fail-closed: an unknown stage, a bill with no slug, or missing markers is an
// error, never a skip.

'use strict';

const fs = require('fs');
const path = require('path');
const { escHtml } = require('../util.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };

const APPLY = flag('apply');
const CHECK = flag('check');
const FILE = path.resolve(ROOT, opt('file') || 'articles/119th-congress-tracker.html');
const SNAPSHOT = path.join(ROOT, 'data/ref-text/record-lp-corpus-119-snapshot.txt');

const START = '<!-- lp-roster:start -->';
const END = '<!-- lp-roster:end -->';

// Display order of the stage groups. The heading text is NOT typed here — it is
// each group's stageLabel taken from the cache, asserted unanimous per stage.
const STAGE_ORDER = ['signed', 'senate', 'house', 'committee', 'dead'];

function fail(msg) { console.error(`  ❌ ${msg}`); process.exit(1); }

const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cache.json'), 'utf8'));
const slugIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/slug-index.json'), 'utf8'));
const bills = (cache.bills || []).filter((b) => b && typeof b.id === 'string' && b.id.startsWith('119-'));
if (!bills.length) fail('no 119-* bills found in data/cache.json');

// ── Group by stage, fail-closed on anything unexpected ────────────────────────
const groups = new Map(STAGE_ORDER.map((s) => [s, []]));
for (const b of bills) {
    if (!groups.has(b.stage)) fail(`${b.id}: unknown stage "${b.stage}" — extend STAGE_ORDER deliberately`);
    if (!b.code) fail(`${b.id}: missing code`);
    if (!b.title) fail(`${b.id}: missing title`);
    if (!b.stageLabel) fail(`${b.id}: missing stageLabel`);
    if (!slugIndex[b.id]) fail(`${b.id}: no slug in data/slug-index.json — run npm run pages first`);
    groups.get(b.stage).push(b);
}

// Newest movement first within each group; id tiebreak keeps the order stable.
for (const arr of groups.values()) {
    arr.sort((a, b) => String(b.stageDate || '').localeCompare(String(a.stageDate || '')) || a.id.localeCompare(b.id));
}

function groupLabel(stage, arr) {
    const labels = [...new Set(arr.map((b) => b.stageLabel))];
    if (labels.length !== 1) fail(`stage "${stage}" has mixed stageLabels: ${labels.join(' / ')}`);
    return labels[0];
}

// ── Roster HTML ───────────────────────────────────────────────────────────────
// Display form of a stored code ("HR.6644" -> "H.R. 6644"), matching the prose
// and congress.gov convention. Presentation only — the snapshot keeps the raw code.
const CODE_PREFIX = { HR: 'H.R.', S: 'S.', HRES: 'H.Res.', SRES: 'S.Res.', HJRES: 'H.J.Res.', SJRES: 'S.J.Res.', HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.' };
function codeDisplay(code) {
    // Cache codes are inconsistent ("HR.1" vs "H.R.7148") — strip dots/spaces first.
    const m = /^([A-Z]+)(\d+)$/.exec(String(code).replace(/[.\s]+/g, ''));
    if (!m || !CODE_PREFIX[m[1]]) fail(`unrecognized bill code "${code}" — extend CODE_PREFIX deliberately`);
    return `${CODE_PREFIX[m[1]]} ${m[2]}`;
}

function rosterHtml() {
    const parts = [];
    for (const stage of STAGE_ORDER) {
        const arr = groups.get(stage);
        if (!arr.length) continue;
        parts.push(`        <h3>${escHtml(groupLabel(stage, arr))} (${arr.length})</h3>`);
        parts.push('        <ul class="tracker-roster">');
        for (const b of arr) {
            parts.push(`          <li><a href="/bill/${escHtml(slugIndex[b.id])}/">${escHtml(codeDisplay(b.code))} — ${escHtml(b.title)}</a></li>`);
        }
        parts.push('        </ul>');
    }
    return `${START}\n${parts.join('\n')}\n        ${END}`;
}

// ── Snapshot sheet (the receipts' source of truth, committed) ─────────────────
function uniqueVotes(b) {
    const seen = new Set();
    const out = [];
    for (const v of b.votes || []) {
        const key = [v.chamber, v.date, v.question, v.result, v.rollNumber ?? '', v.yeas ?? '', v.nays ?? ''].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        const tally = (v.yeas != null && v.nays != null) ? ` ${v.yeas}-${v.nays}` : ` (${v.method || 'no tally'})`;
        const roll = v.rollNumber != null ? ` (Roll ${v.rollNumber})` : '';
        out.push(`${v.chamber} ${v.date} "${v.question}" ${v.result}${tally}${roll}`);
    }
    return out;
}

function snapshotText(today) {
    const lines = [];
    lines.push('LegislationPatch corpus snapshot - 119th Congress bills in data/cache.json');
    lines.push(`Source: data/cache.json (audited corpus; per-bill ledgers in data/qa-ledger/), generated ${today} by scripts/generate-tracker-roster.js`);
    lines.push(`Total bills: ${bills.length}`);
    lines.push('');
    for (const stage of STAGE_ORDER) {
        const arr = groups.get(stage);
        if (!arr.length) continue;
        lines.push(`## ${groupLabel(stage, arr)} (${arr.length})`);
        for (const b of arr) {
            lines.push(`${b.id} | ${b.code} | ${b.title} | stage: ${b.stage} | stageDate: ${b.stageDate || '-'} | enacted: ${b.enactedDate || '-'}`);
            for (const v of uniqueVotes(b)) lines.push(`    vote: ${v}`);
        }
        lines.push('');
    }
    return lines.join('\n') + '\n';
}

// ── Inject / compare ──────────────────────────────────────────────────────────
const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
const html = rosterHtml();

if (!fs.existsSync(FILE)) fail(`target file not found: ${FILE}`);
const doc = fs.readFileSync(FILE, 'utf8');
const si = doc.indexOf(START);
const ei = doc.indexOf(END);
if (si < 0 || ei < 0 || ei < si) fail(`markers ${START} / ${END} not found (in order) in ${path.relative(ROOT, FILE)}`);
const updated = doc.slice(0, si) + html + doc.slice(ei + END.length);

const counts = STAGE_ORDER.map((s) => `${s}:${groups.get(s).length}`).join('  ');
console.log(`  roster derived from ${bills.length} bills — ${counts}`);

if (CHECK) {
    let bad = 0;
    if (doc.slice(si, ei + END.length) !== html) { console.error('  ❌ roster block in file differs from regeneration'); bad = 1; }
    const onDisk = fs.existsSync(SNAPSHOT) ? fs.readFileSync(SNAPSHOT, 'utf8') : '';
    // Compare snapshot ignoring its generated-date line (line 2).
    const strip = (t) => t.split('\n').filter((_, i) => i !== 1).join('\n');
    if (strip(onDisk) !== strip(snapshotText(today))) { console.error('  ❌ snapshot sheet differs from regeneration'); bad = 1; }
    if (!bad) console.log('  ✅ roster block and snapshot sheet both match the cache');
    process.exit(bad);
}

if (!APPLY) {
    console.log(`  [dry-run] would write roster block into ${path.relative(ROOT, FILE)} and ${path.relative(ROOT, SNAPSHOT)}`);
    process.exit(0);
}

fs.writeFileSync(FILE, updated);
fs.writeFileSync(SNAPSHOT, snapshotText(today));
// Read back and assert (verify-every-write rule).
const back = fs.readFileSync(FILE, 'utf8');
if (!back.includes(html)) fail('read-back failed: roster block not present after write');
if (!fs.readFileSync(SNAPSHOT, 'utf8').includes(`Total bills: ${bills.length}`)) fail('read-back failed: snapshot sheet');
console.log(`  ✅ wrote roster into ${path.relative(ROOT, FILE)} and ${path.relative(ROOT, SNAPSHOT)}`);
