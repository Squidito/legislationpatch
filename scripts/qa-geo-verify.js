#!/usr/bin/env node
// qa-geo-verify.js — sourcing guard for the rep-page district composition
// blocks. Mirrors the figure-sourcing guard pattern (validate-batch.js): every
// geographic claim on a page must trace to the fetched source files, never to
// anything remembered.
//
// Usage:
//   node scripts/qa-geo-verify.js            # exit 1 on any failure
//   node scripts/qa-geo-verify.js --verbose  # per-page detail
//
// What it verifies, independently RE-DERIVED from the raw Census files in
// data/geo-src/ (NOT from data/district-geography.json — checking the derived
// JSON against pages generated from that same JSON would prove nothing):
//   1. Every county/place name in a block exists in the raw relationship file
//      rows FOR THAT MEMBER'S DISTRICT (member resolved via the page's
//      bioguide meta -> data/reps/<id>.json — the page's own claims are not
//      trusted for the district either). Place names may be LSAD-stripped
//      (shared rule in lib/geo.js) or verbatim.
//   2. The whole/partial marking on each name matches the AREALAND_PART
//      equality test recomputed from the raw row ("all of" requires equality,
//      "part of" requires strict less-than).
//   3. Sentence structure: each name's nearest preceding marker is the one its
//      whole-flag demands ("all of" / "part of" / "including") — the §5
//      two-branch rule, checked positionally, not on trust.
//   4. Every block carries the visible vintage line.
//   5. Senator pages carry no block; every House page whose district exists in
//      data/district-geography.json carries one (a silently-vanished block is
//      a regression, not a pass).
//
// If data/district-geography.json does not exist, there is nothing to verify
// (pre-feature state) — reports and exits 0.

'use strict';

const fs   = require('fs');
const path = require('path');
const geo  = require('./lib/geo.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const args    = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');

function unescHtml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// ── Re-derive district composition from the RAW files ───────────────────────

function buildRawIndex() {
  const fips = geo.loadStateFips();
  const districts = new Map(); // key -> { counties: Map(name->whole), places: Map(name->whole) }
  const get = key => {
    if (!districts.has(key)) districts.set(key, { counties: new Map(), places: new Map() });
    return districts.get(key);
  };

  for (const r of geo.parsePipeFile(path.join(geo.GEO_SRC, geo.FILES.county), geo.COUNTY_HEADER)) {
    const key = geo.districtKey(r.GEOID_CD119_20, fips);
    if (key === null || Number(r.AREALAND_PART) === 0) continue;
    get(key).counties.set(r.NAMELSAD_COUNTY_20, new Set([Number(r.AREALAND_PART) === Number(r.AREALAND_COUNTY_20)]));
  }
  for (const r of geo.parsePipeFile(path.join(geo.GEO_SRC, geo.FILES.place), geo.PLACE_HEADER)) {
    const key = geo.districtKey(r.GEOID_CD119_20, fips);
    if (key === null || !r.GEOID_PLACE_20 || Number(r.AREALAND_PART) === 0) continue;
    const whole = Number(r.AREALAND_PART) === Number(r.AREALAND_PLACE_20);
    const m = get(key).places;
    // A name is acceptable under its raw or LSAD-stripped form. Two same-named
    // places in one district (rare): keep the set of observed whole-flags and
    // accept a page claim matching ANY row of that name.
    for (const name of new Set([r.NAMELSAD_PLACE_20, geo.stripLsad(r.NAMELSAD_PLACE_20)])) {
      if (!m.has(name)) m.set(name, new Set());
      m.get(name).add(whole);
    }
  }
  return districts;
}

// ── Page checks ─────────────────────────────────────────────────────────────

const SPAN_RE = /<span class="geo-name" data-geo="(county|place)" data-whole="([01])">([^<]*)<\/span>/g;

function main() {
  if (!fs.existsSync(path.join(DATA, 'district-geography.json'))) {
    console.log('qa-geo-verify: data/district-geography.json absent — no geography shipped, nothing to verify.');
    return 0;
  }
  const derived = JSON.parse(fs.readFileSync(path.join(DATA, 'district-geography.json'), 'utf8'));
  const raw = buildRawIndex();

  const repDir = path.join(ROOT, 'rep');
  const pages = fs.readdirSync(repDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => path.join('rep', e.name, 'index.html'))
    .filter(p => fs.existsSync(path.join(ROOT, p)));

  let failures = 0, blocks = 0, senatorPages = 0, spansChecked = 0;
  const fail = (page, msg) => { console.log(`  ❌ ${page}: ${msg}`); failures++; };

  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    if (/http-equiv=["']refresh["']/i.test(html)) continue; // slug-change redirect stub

    const bioId = (html.match(/<meta name="rep-id" content="([^"]+)"/) || [])[1];
    if (!bioId) { fail(page, 'no rep-id meta — cannot resolve the member'); continue; }
    let rep;
    try { rep = JSON.parse(fs.readFileSync(path.join(DATA, 'reps', `${bioId}.json`), 'utf8')); }
    catch (_) { fail(page, `no profile JSON for ${bioId}`); continue; }

    const hasBlock = html.includes('id="repDistrictBlock"');

    if (rep.role === 'Senator') {
      senatorPages++;
      if (hasBlock) fail(page, 'senator page carries a district composition block');
      continue;
    }

    const key = rep.district ? `${rep.state}-${rep.district}` : `${rep.state}-AL`;
    if (!hasBlock) {
      if (derived[key]) fail(page, `House page missing its composition block (district ${key} has data)`);
      continue; // district genuinely absent from the derived JSON — allowed
    }
    blocks++;

    const block = (html.match(/<div class="rep-bio-block" id="repDistrictBlock">[\s\S]*?<\/div>\s*<\/div>/) || [])[0];
    if (!block) { fail(page, 'block present but unextractable — markup drifted from the expected shape'); continue; }

    // 4. Visible vintage line.
    if (!/District boundaries: 119th Congress/.test(block) || !/U\.S\. Census Bureau relationship files/.test(block)) {
      fail(page, 'missing the visible vintage line');
    }

    const rawDist = raw.get(key);
    if (!rawDist) { fail(page, `district ${key} not present in the raw Census files`); continue; }

    // Marker positions for the positional two-branch check (3).
    const markers = [];
    for (const re of [/all of/g, /part of/g, /including/g]) {
      let m; while ((m = re.exec(block))) markers.push({ pos: m.index, word: m[0] });
    }
    markers.sort((a, b) => a.pos - b.pos);

    let m;
    SPAN_RE.lastIndex = 0;
    while ((m = SPAN_RE.exec(block))) {
      spansChecked++;
      const [, kind, wholeFlag, escName] = m;
      const name = unescHtml(escName);
      const whole = wholeFlag === '1';

      // 1 + 2: the name and its whole-flag, re-derived from the raw file rows.
      const lookup = kind === 'county' ? rawDist.counties : rawDist.places;
      if (!lookup.has(name)) {
        fail(page, `${kind} "${name}" not found in the raw Census rows for ${key} — untraceable claim`);
      } else if (!lookup.get(name).has(whole)) {
        fail(page, `${kind} "${name}" marked ${whole ? 'whole' : 'partial'} but the raw AREALAND test says ${!whole ? 'whole' : 'partial'}`);
      }

      // 3: nearest preceding marker must be the one the whole-flag demands.
      let nearest = null;
      for (const mk of markers) { if (mk.pos < m.index) nearest = mk.word; else break; }
      const expected = !whole ? 'part of' : (kind === 'county' ? 'all of' : 'including');
      if (nearest !== expected) {
        fail(page, `${kind} "${name}" (${whole ? 'whole' : 'partial'}) follows "${nearest}" — expected "${expected}"`);
      }
    }
  }

  console.log(`qa-geo-verify: ${pages.length} rep page(s) — ${blocks} composition block(s), ${spansChecked} name(s) checked against raw Census rows, ${senatorPages} senator page(s) block-free.`);
  if (failures) { console.log(`  ❌ ${failures} failure(s)`); return 1; }
  console.log('  ✅ every geographic claim traces to data/geo-src/ with the correct whole/partial marking');
  return 0;
}

process.exit(main());
