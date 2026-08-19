// scripts/fetch-reference.js
//
// Fetches a REFERENCED source (another bill, a public law, or a U.S. Code
// statute section) so its text can back cross-referenced figures in an analysis
// — and so the figure-sourcing guard can verify those figures against it.
//
// This supports the cross-bill / referenced-source practice (see CLAUDE.md):
// when a bill references another bill/act, the substantive figures live in the
// referenced source. We fetch + STORE that source so provenance is recorded and
// every cross-sourced figure stays verifiable. Training data is NEVER a source.
//
// It does NOT mutate cache.json. It saves the source text to data/ref-text/ and
// prints the `referencedSources` entry for you to paste into the bill's cache
// entry (analysis is written in-conversation). Then tag the cross-sourced items
// with  "source": "<id>"  and run validate-batch.
//
// Usage:
//   node scripts/fetch-reference.js --bill 119-HR-1234
//   node scripts/fetch-reference.js --usc "50:1881a"        (50 U.S.C. 1881a)
//   node scripts/fetch-reference.js --usc "50:1881a" --label "FISA Section 702"
//   node scripts/fetch-reference.js --rule "house:XV"       (House Rule XV, current Congress)
//
// --rule pulls a standing chamber rule from the House Rules and Manual (govinfo HMAN),
// which prints the rule text AND the parliamentary annotations under it. Explainer
// articles are sourced from these exactly as bill analyses are sourced from bill text.
// House only: govinfo's modern Senate Manual packages are not published under SMAN the
// way HMAN is, so --rule senate is deliberately unimplemented rather than guessed at.

'use strict';
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { fetchBillText, cleanHTML } = require('./batch_processor');

const GOVINFO_API_KEY = process.env.GOVINFO_API_KEY || '';
const REF_DIR = path.join(__dirname, '../data/ref-text');

function arg(flag) {
    const i = process.argv.indexOf(flag);
    return i !== -1 ? process.argv[i + 1] : null;
}
const today = () => new Date().toISOString().slice(0, 10);

function ensureDir() { fs.mkdirSync(REF_DIR, { recursive: true }); }

function save(slug, text) {
    ensureDir();
    const file = path.join(REF_DIR, `${slug}.txt`);
    fs.writeFileSync(file, text, 'utf8');
    return path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
}

// Registry of every source ever fetched, keyed by id. A bill records its own
// referencedSources inline in cache.json, but an ARTICLE ledger only stores the
// id -- so without this the label, citation and srcUrl of a fetched source would
// exist nowhere except the terminal output of the run that fetched it. Upsert,
// so re-fetching refreshes fetchedAt without duplicating.
const REGISTRY = path.join(__dirname, '../data/ref-sources.json');
function registerSource(entry) {
    let reg = {};
    try { reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch (e) { reg = {}; }
    reg[entry.id] = entry;
    const ordered = {};
    for (const k of Object.keys(reg).sort()) ordered[k] = reg[k];
    fs.writeFileSync(REGISTRY, JSON.stringify(ordered, null, 2) + '\n');
    const back = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    if (!back[entry.id]) throw new Error('source registry write did not read back');
    console.log(`  ↳ registered in data/ref-sources.json (${Object.keys(back).length} source(s))`);
}

function emitEntry(entry) {
    registerSource(entry);
    console.log('\n  ✅ Saved referenced source text. Paste this into the bill\'s "referencedSources": [ ... ]');
    console.log('     and tag each cross-sourced item with  "source": "' + entry.id + '"\n');
    console.log(JSON.stringify(entry, null, 2).split('\n').map(l => '  ' + l).join('\n'));
    console.log('');
}

// ── Referenced BILL / public law (Congress.gov) ─────────────────────────────
async function fetchReferencedBill(billId) {
    const m = billId.match(/^(\d+)-([A-Za-z]+)-(\d+)$/);
    if (!m) { console.error(`  ❌ --bill must look like 119-HR-1234 (got "${billId}")`); process.exit(1); }
    const [, congress, type, number] = m;
    console.log(`  Fetching referenced bill ${billId} from Congress.gov…`);
    const { text } = await fetchBillText({ congress, type, number });
    if (!text || text.trim().length < 200) {
        console.error('  ❌ No usable text returned for that bill (no text version on Congress.gov?).');
        process.exit(1);
    }
    const slug = `bill-${congress}-${type.toLowerCase()}-${number}`;
    const textFile = save(slug, text);
    emitEntry({
        id: slug,
        kind: 'bill',
        label: arg('--label') || `${type.toUpperCase()} ${number} (${congress}th Congress)`,
        citation: `${type.toUpperCase()} ${number}`,
        srcUrl: `https://www.congress.gov/bill/${congress}th-congress/${/^s/i.test(type) ? 'senate' : 'house'}-bill/${number}/text`,
        textFile,
        fetchedAt: today(),
    });
}

// ── Referenced U.S. CODE section (GovInfo USCODE) ───────────────────────────
async function fetchReferencedUSC(spec) {
    if (!GOVINFO_API_KEY) { console.error('  ❌ GOVINFO_API_KEY missing in .env'); process.exit(1); }
    const m = spec.match(/^(\d+)\s*[:\s]\s*([0-9]+[A-Za-z0-9\-]*)$/);
    if (!m) { console.error(`  ❌ --usc must look like "50:1881a" (title:section). Got "${spec}"`); process.exit(1); }
    const title = m[1], section = m[2];

    // 1. Resolve the latest USCODE-{year}-title{N} package.
    console.log(`  Resolving latest USCODE package for title ${title}…`);
    let pkg = null;
    for (let year = new Date().getFullYear(); year >= 2018 && !pkg; year--) {
        const id = `USCODE-${year}-title${title}`;
        const r = await fetch(`https://api.govinfo.gov/packages/${id}/summary?api_key=${GOVINFO_API_KEY}`);
        if (r.ok) pkg = id;
    }
    if (!pkg) { console.error(`  ❌ Could not find a USCODE package for title ${title}.`); process.exit(1); }
    console.log(`  Using ${pkg}. Locating section ${section}…`);

    // 2. Page through the title's granules to find the one for this section.
    const want = `-sec${section}`.toLowerCase();
    let mark = '*', granuleId = null;
    for (let page = 0; page < 12 && !granuleId; page++) {
        const r = await fetch(`https://api.govinfo.gov/packages/${pkg}/granules?api_key=${GOVINFO_API_KEY}&pageSize=1000&offsetMark=${encodeURIComponent(mark)}`);
        if (!r.ok) break;
        const j = await r.json();
        const hit = (j.granules || []).find(g => (g.granuleId || '').toLowerCase().endsWith(want));
        if (hit) granuleId = hit.granuleId;
        if (!j.nextPage) break;
        mark = new URL(j.nextPage).searchParams.get('offsetMark') || mark;
    }
    if (!granuleId) { console.error(`  ❌ Could not find section ${section} in ${pkg}.`); process.exit(1); }

    // 3. Fetch + clean the section text.
    const htmBase = `https://api.govinfo.gov/packages/${pkg}/granules/${granuleId}/htm`;
    const tr = await fetch(`${htmBase}?api_key=${GOVINFO_API_KEY}`);
    if (!tr.ok) { console.error(`  ❌ Section text fetch failed (HTTP ${tr.status}).`); process.exit(1); }
    const text = cleanHTML(await tr.text());
    if (text.length < 200) { console.error('  ❌ Section text suspiciously short — aborting.'); process.exit(1); }

    const slug = `usc-${title}-${section.toLowerCase()}`;
    const textFile = save(slug, text);
    emitEntry({
        id: slug,
        kind: 'statute',
        label: arg('--label') || `${title} U.S.C. ${section}`,
        citation: `${title} U.S.C. ${section}`,
        srcUrl: htmBase,
        textFile,
        fetchedAt: today(),
    });
}

// ── Standing chamber RULE (govinfo HMAN — House Rules and Manual) ───────────
async function fetchReferencedRule(spec) {
    if (!GOVINFO_API_KEY) { console.error('  ❌ GOVINFO_API_KEY missing in .env'); process.exit(1); }
    const m = spec.match(/^\s*(house)\s*[:\s]\s*([IVXLC]+)\s*$/i);
    if (!m) {
        console.error(`  ❌ --rule must look like "house:XV" (chamber:roman numeral). Got "${spec}"`);
        console.error('     Senate rules are not available through this path — see the header note.');
        process.exit(1);
    }
    const numeral = m[2].toUpperCase();

    // 1. Newest HMAN package = the current Congress's rules. Walk back so an
    //    un-republished Congress falls through to the last one actually published.
    console.log('  Resolving the newest House Rules and Manual package…');
    let pkg = null;
    for (let c = 130; c >= 115 && !pkg; c--) {
        const r = await fetch(`https://api.govinfo.gov/packages/HMAN-${c}/summary?api_key=${GOVINFO_API_KEY}`);
        if (r.ok) pkg = `HMAN-${c}`;
    }
    if (!pkg) { console.error('  ❌ Could not find any HMAN package.'); process.exit(1); }
    console.log(`  Using ${pkg}. Locating Rule ${numeral}…`);

    // 2. The granule list carries no rule heading, so scan the HOUSERULES granules
    //    and match each one's summary heading. ~30 lookups, worst case.
    const granules = [];
    for (let off = 0; ; off += 100) {
        const r = await fetch(`https://api.govinfo.gov/packages/${pkg}/granules?offset=${off}&pageSize=100&api_key=${GOVINFO_API_KEY}`);
        if (!r.ok) break;
        const j = await r.json();
        granules.push(...(j.granules || []));
        if (!(j.granules || []).length || granules.length >= (j.count || 0)) break;
    }
    let hit = null;
    for (const g of granules.filter(g => g.granuleClass === 'HOUSERULES')) {
        const r = await fetch(`https://api.govinfo.gov/packages/${pkg}/granules/${g.granuleId}/summary?api_key=${GOVINFO_API_KEY}`);
        if (!r.ok) continue;
        const s = await r.json();
        if (String(s.heading || '').trim().toUpperCase() === `RULE ${numeral}`) { hit = { ...g, ...s }; break; }
    }
    if (!hit) { console.error(`  ❌ Could not find Rule ${numeral} in ${pkg}.`); process.exit(1); }

    // 3. Fetch + clean the rule text (rule + annotations).
    const htmBase = `https://api.govinfo.gov/packages/${pkg}/granules/${hit.granuleId}/htm`;
    const tr = await fetch(`${htmBase}?api_key=${GOVINFO_API_KEY}`);
    if (!tr.ok) { console.error(`  ❌ Rule text fetch failed (HTTP ${tr.status}).`); process.exit(1); }
    const text = cleanHTML(await tr.text());
    if (text.length < 500) { console.error('  ❌ Rule text suspiciously short — aborting.'); process.exit(1); }

    const congress = pkg.split('-')[1];
    const slug = `hman-${congress}-rule-${numeral.toLowerCase()}`;
    const textFile = save(slug, text);
    emitEntry({
        id: slug,
        kind: 'rule',
        label: arg('--label') || `House Rule ${numeral} — ${hit.title} (${congress}th Congress)`,
        citation: `House Rule ${numeral}`,
        srcUrl: `https://www.govinfo.gov/app/details/${pkg}/${hit.granuleId}`,
        textFile,
        fetchedAt: today(),
    });
}

// ── ORG STATEMENT / letter / SAP / member statement / Congressional Record ──
//
// Phase 5 (both-sides module). A tracker's "who supports / who opposes" section
// attributes each position to a NAMED organization or person, and §6.4 requires
// that statement resolve to a FETCHED, STORED primary source — the org's own
// press release/letter, a Statement of Administration Policy, a member's
// statement, or the Congressional Record — never a linked-and-trusted URL. This
// is the same provenance model as referencedSources for bills, extended to the
// arbitrary web pages those statements live on.
//
// Two things the other modes do not need:
//   • a BROWSER User-Agent. Advocacy-org and Senate/House press pages 403 the
//     default Node UA; a real browser UA gets 200 (verified across brennancenter
//     .org, eff.org, aclu.org, *.senate.gov, *.house.gov).
//   • a PDF→text path. Opposition letters are frequently PDF-only. We shell out
//     to `pdftotext` when it is on PATH (poppler; no npm dependency), and fall
//     back to a zlib-based FlateDecode text extractor when it is not. If neither
//     yields usable text the fetch FAILS — and a failed fetch means the position
//     is OMITTED, never softened (enforced downstream by tracker-gate.js).
//
// Usage:
//   node scripts/fetch-reference.js --org "https://www.brennancenter.org/..." \
//        --org-name "Brennan Center for Justice" --kind statement \
//        --slug org-brennan-center-photo-id --date 2026-02-15 \
//        --label "Brennan Center: New SAVE Act bills would still block millions"
//
// --kind is one of: statement | letter | sap | member-statement | record | press-release
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ORG_KINDS = new Set(['statement', 'letter', 'sap', 'member-statement', 'record', 'press-release']);

/** Fetch a URL with a browser UA, following redirects. Returns { buf, contentType }. */
async function fetchBrowser(url) {
    const r = await fetch(url, {
        redirect: 'follow',
        headers: {
            'User-Agent': BROWSER_UA,
            'Accept': 'text/html,application/xhtml+xml,application/pdf,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    });
    if (!r.ok) {
        // Drain the body before throwing. An unconsumed response body keeps a
        // libuv handle open, and a later process.exit(1) then trips an assertion
        // on Windows ("UV_HANDLE_CLOSING") — the caller would see a crash code
        // instead of a clean non-zero exit, breaking fail-closed detection.
        try { await r.body?.cancel(); } catch (e) { /* already closed */ }
        throw new Error(`HTTP ${r.status} ${r.statusText}`);
    }
    const buf = Buffer.from(await r.arrayBuffer());
    return { buf, contentType: (r.headers.get('content-type') || '').toLowerCase() };
}

/** Is this response a PDF? Trust the magic bytes over the header. */
function isPdf(buf, contentType) {
    return buf.slice(0, 5).toString('latin1') === '%PDF-' || /application\/pdf/.test(contentType);
}

/**
 * PDF → text. Prefer poppler's `pdftotext` (already on this machine's PATH, no
 * npm dependency); if it is absent, fall back to a built-in zlib extractor that
 * inflates FlateDecode content streams and pulls the text-showing operators.
 * The fallback is best-effort (it does not handle every PDF encoding), so it is
 * only a safety net — when it yields too little the caller treats the source as
 * unfetchable and the position is omitted.
 */
function pdfToText(buf) {
    // 1. pdftotext, if present.
    const { spawnSync } = require('child_process');
    const tmp = path.join(REF_DIR, `.tmp-${process.pid}.pdf`);
    try {
        ensureDir();
        fs.writeFileSync(tmp, buf);
        const res = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', tmp, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        if (!res.error && res.status === 0 && res.stdout && res.stdout.trim().length > 200) {
            return res.stdout.replace(/\r\n/g, '\n');
        }
    } catch (e) { /* fall through to zlib */ }
    finally { try { fs.unlinkSync(tmp); } catch (e) {} }

    // 2. zlib fallback: inflate FlateDecode streams, extract (...)Tj / [..]TJ text.
    const zlib = require('zlib');
    const raw = buf.latin1Slice ? buf.latin1Slice(0) : buf.toString('latin1');
    const out = [];
    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m;
    while ((m = streamRe.exec(raw)) !== null) {
        let content = null;
        try { content = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); }
        catch (e) { content = m[1]; }              // maybe an uncompressed stream
        // (literal string) Tj   and   [ (a) -3 (b) ] TJ
        for (const t of content.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) out.push(unescapePdf(t[1]));
        for (const t of content.matchAll(/\[((?:[^\][]|\\.)*)\]\s*TJ/g)) {
            for (const s of t[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g)) out.push(unescapePdf(s[1]));
        }
    }
    return out.join(' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function unescapePdf(s) {
    return String(s)
        .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[c]))
        .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
}

async function fetchOrgStatement(url) {
    const slug    = arg('--slug');
    const orgName = arg('--org-name');
    const kind    = (arg('--kind') || 'statement').toLowerCase();
    if (!/^https?:\/\//i.test(url)) { console.error(`  ❌ --org must be an http(s) URL (got "${url}")`); process.exit(1); }
    if (!slug)    { console.error('  ❌ --slug is required for --org (e.g. --slug org-brennan-center-photo-id)'); process.exit(1); }
    if (!orgName) { console.error('  ❌ --org-name is required for --org (the named holder of the position)'); process.exit(1); }
    if (!ORG_KINDS.has(kind)) { console.error(`  ❌ --kind must be one of: ${[...ORG_KINDS].join(', ')}`); process.exit(1); }

    console.log(`  Fetching org statement (${orgName}) with a browser UA…`);
    let resp;
    try { resp = await fetchBrowser(url); }
    catch (e) {
        // An unfetchable source is a HARD stop here, by design: the caller must
        // then OMIT the position, never soften-and-keep it (§6.4 / BOTH-SIDES.md).
        // Set exitCode + return rather than process.exit() — a hard exit while
        // Node's built-in fetch (undici) still holds a socket trips a libuv
        // assertion on Windows and returns a crash code, defeating the very
        // fail-closed contract this path exists to signal.
        console.error(`  ❌ Could not fetch the source (${e.message}). Per §6.4 the position it backs must be OMITTED, not softened.`);
        process.exitCode = 1;
        return;
    }

    let text;
    if (isPdf(resp.buf, resp.contentType)) {
        console.log('  Detected PDF; extracting text…');
        text = pdfToText(resp.buf);
    } else {
        text = cleanHTML(resp.buf.toString('utf8'));
    }
    if (!text || text.trim().length < 200) {
        console.error(`  ❌ Extracted text is too short (${(text || '').trim().length} chars) — treat as unfetchable and OMIT the position.`);
        process.exitCode = 1;
        return;
    }

    const textFile = save(slug, text);
    emitEntry({
        id: slug,
        kind,
        org: orgName,
        date: arg('--date') || null,
        label: arg('--label') || `${orgName} — ${kind}`,
        citation: arg('--citation') || orgName,
        srcUrl: url,
        textFile,
        fetchedAt: today(),
    });
}

(async () => {
    const bill = arg('--bill'), usc = arg('--usc'), rule = arg('--rule'), org = arg('--org');
    if (bill)      await fetchReferencedBill(bill);
    else if (usc)  await fetchReferencedUSC(usc);
    else if (rule) await fetchReferencedRule(rule);
    else if (org)  await fetchOrgStatement(org);
    else {
        console.error('Usage:\n  node scripts/fetch-reference.js --bill 119-HR-1234\n  node scripts/fetch-reference.js --usc "50:1881a" [--label "FISA Section 702"]\n  node scripts/fetch-reference.js --rule "house:XV"\n  node scripts/fetch-reference.js --org "<url>" --org-name "Brennan Center" --kind statement --slug org-... [--date YYYY-MM-DD] [--label "..."]');
        process.exit(1);
    }
})();
