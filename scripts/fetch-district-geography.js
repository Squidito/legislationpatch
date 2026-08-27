#!/usr/bin/env node
// fetch-district-geography.js — download the Census CD119 relationship files
// and derive data/district-geography.json (county + place composition per
// congressional district, with whole/partial flags and population ranking).
//
// Usage:
//   node scripts/fetch-district-geography.js            # download missing, parse
//   node scripts/fetch-district-geography.js --force    # re-download everything
//   node scripts/fetch-district-geography.js --verbose  # per-district detail
//
// Reads   (fetching into data/geo-src/ if absent — committed raw as provenance):
//   tab20_cd11920_county20_natl.txt   Census 2020 CD119→County relationship
//   tab20_cd11920_place20_natl.txt    Census 2020 CD119→Place  relationship
//   state-fips.txt                    Census state FIPS↔postal reference
//   sub-est2024.csv                   Census PEP sub-county population estimates
// Writes:
//   data/geo-src/FETCH-MANIFEST.json  url + fetchedAt + bytes per raw file
//   data/district-geography.json      one entry per district ("FL-12", "AK-AL")
//
// Run manually / rarely — district lines change once per redistricting cycle,
// not per batch. On 120th-Congress seating (Jan 2027): verify CD120 files exist
// and refetch before regenerating rep pages (see _personal/CENSUS-GEOGRAPHY-SPEC.md §6).
//
// HARD RULE (site-wide): every geographic claim on a page traces to these
// fetched files. Model memory is never a source. Verified live 2026-08-26:
// header schemas asserted byte-for-byte below (via lib/geo.js); the Census
// Data API population endpoint from the spec now REQUIRES an api key (302 →
// missing_key.html), so populations come from the keyless PEP file instead —
// its ESTIMATESBASE2020 column is the 2020 Census base, vintage-coherent with
// the 2020 tabulation the relationship files use. The PEP file carries NO
// rows for CDPs, Puerto Rico, or the island territories: those places keep
// pop: null and rank by overlap land area, labeled per district ("ranking").

'use strict';

const fs   = require('fs');
const path = require('path');

const { fetchWithRetry } = require('./lib/fetch-helpers.js');
const geo = require('./lib/geo.js');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'data', 'district-geography.json');
const MANIFEST = path.join(geo.GEO_SRC, 'FETCH-MANIFEST.json');

const URLS = {
  county: 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld/tab20_cd11920_county20_natl.txt',
  place:  'https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld/tab20_cd11920_place20_natl.txt',
  states: 'https://www2.census.gov/geo/docs/reference/state.txt',
  pop:    'https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv',
};

const VINTAGE = 'CD119 / 2020 Census tabulation';
const POP_SOURCE_NOTE = 'ESTIMATESBASE2020 (2020 Census base), Census PEP sub-est2024.csv';

const args    = process.argv.slice(2);
const FORCE   = args.includes('--force');
const VERBOSE = args.includes('--verbose');

// ── Download ────────────────────────────────────────────────────────────────

async function download() {
  fs.mkdirSync(geo.GEO_SRC, { recursive: true });
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (_) {}

  for (const [key, url] of Object.entries(URLS)) {
    const file = geo.FILES[key];
    const dest = path.join(geo.GEO_SRC, file);
    if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`  = ${file} already present (${fs.statSync(dest).size} bytes) — skipping (--force to refetch)`);
      continue;
    }
    const res = await fetchWithRetry(url, { label: file });
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status} from ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    manifest[file] = { url, fetchedAt: new Date().toISOString().slice(0, 10), bytes: buf.length };
    console.log(`  ✓ ${file} — ${buf.length} bytes`);
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

// ── Population join (PEP sub-est2024.csv) ───────────────────────────────────

// Minimal CSV field splitter with quote handling — place NAMEs contain commas
// ("Islamorada, Village of Islands village").
function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// GEOID (state FIPS + 5-digit place FIPS) -> 2020 estimates-base population.
// State-level place records only (COUNTY=000: SUMLEV 157 county-parts would
// double-join); incorporated places (162) preferred over consolidated-city
// balance (172) over consolidated city (170) when a GEOID appears at several
// summary levels.
function loadPlacePops() {
  const lines = geo.stripBom(fs.readFileSync(path.join(geo.GEO_SRC, geo.FILES.pop), 'utf8')).split(/\r?\n/);
  if (lines[0].trim() !== geo.POP_HEADER) {
    throw new Error(`SCHEMA DRIFT in ${geo.FILES.pop}:\n  expected: ${geo.POP_HEADER}\n  got:      ${lines[0].trim()}`);
  }
  const PREF = { '162': 3, '172': 2, '170': 1 };
  const best = new Map(); // geoid -> { pref, pop }
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = splitCsvLine(line);
    const [sumlev, state, county, place] = f;
    const pref = PREF[sumlev];
    if (!pref || county !== '000' || place === '00000') continue;
    const pop = Number(f[10]); // ESTIMATESBASE2020
    if (!Number.isFinite(pop)) continue;
    const key = state + place;
    const prev = best.get(key);
    if (!prev || pref > prev.pref) best.set(key, { pref, pop });
  }
  return best;
}

// ── Parse + emit ────────────────────────────────────────────────────────────

function parse(manifest) {
  const fips = geo.loadStateFips();
  const fetchedAt = (manifest[geo.FILES.county] || {}).fetchedAt || new Date().toISOString().slice(0, 10);
  const sources = [URLS.county, URLS.place];

  const districts = {}; // key -> { counties: [], places: [] }
  const get = key => (districts[key] ||= { counties: [], places: [] });
  const skipped = { zz: 0, waterOnlyCounty: 0, remainder: 0, waterOnlyPlace: 0 };

  // Counties
  const countyRows = geo.parsePipeFile(path.join(geo.GEO_SRC, geo.FILES.county), geo.COUNTY_HEADER);
  if (countyRows.length < 3000) throw new Error(`county file: only ${countyRows.length} rows — expected ~3,857`);
  for (const r of countyRows) {
    const key = geo.districtKey(r.GEOID_CD119_20, fips);
    if (key === null) { skipped.zz++; continue; }                    // "ZZ" not-defined
    if (Number(r.AREALAND_PART) === 0) { skipped.waterOnlyCounty++; continue; } // water-only overlap
    get(key).counties.push({
      name:  r.NAMELSAD_COUNTY_20,        // county NAMELSADs display verbatim
      geoid: r.GEOID_COUNTY_20,
      whole: Number(r.AREALAND_PART) === Number(r.AREALAND_COUNTY_20),
    });
  }

  // Places
  const pops = loadPlacePops();
  const placeRows = geo.parsePipeFile(path.join(geo.GEO_SRC, geo.FILES.place), geo.PLACE_HEADER);
  if (placeRows.length < 30000) throw new Error(`place file: only ${placeRows.length} rows — expected ~34,070`);
  let popMatched = 0, popMissing = 0;
  for (const r of placeRows) {
    const key = geo.districtKey(r.GEOID_CD119_20, fips);
    if (key === null) { skipped.zz++; continue; }
    if (!r.GEOID_PLACE_20) { skipped.remainder++; continue; }        // unincorporated remainder of the district
    if (Number(r.AREALAND_PART) === 0) { skipped.waterOnlyPlace++; continue; }
    const hit = pops.get(r.GEOID_PLACE_20);
    if (hit) popMatched++; else popMissing++;
    get(key).places.push({
      name:  geo.stripLsad(r.NAMELSAD_PLACE_20),
      raw:   r.NAMELSAD_PLACE_20,
      geoid: r.GEOID_PLACE_20,
      whole: Number(r.AREALAND_PART) === Number(r.AREALAND_PLACE_20),
      pop:   hit ? hit.pop : null,
      areaPart: Number(r.AREALAND_PART),
    });
  }

  // Strip-audit: a residue like "Juneau city and" means the suffix list is
  // wrong for a name that actually occurs — hard fail, never ship a mangled name.
  for (const d of Object.values(districts)) {
    for (const p of d.places) {
      if (!p.name || /\s(and|urban|zona)$/.test(p.name) || /\($/.test(p.name)) {
        throw new Error(`LSAD strip produced a mangled display name: "${p.name}" from "${p.raw}"`);
      }
    }
  }

  // Order + rank, then assemble the spec-shaped output.
  const out = {};
  for (const key of Object.keys(districts).sort()) {
    const d = districts[key];
    d.counties.sort((a, b) => a.name.localeCompare(b.name));
    d.places.sort((a, b) => {
      if (a.pop !== null && b.pop !== null) return b.pop - a.pop;
      if (a.pop !== null) return -1;
      if (b.pop !== null) return 1;
      return b.areaPart - a.areaPart;
    });
    // Districts with NO population match at all (CDP/PR/territory-only place
    // lists) keep area order HERE — it is the only sourced selection signal
    // for which places matter — but the generator alphabetizes the displayed
    // subset for these districts, so no fake salience ranking is ever shown
    // (area put Mountain View CDP ahead of Hilo on HI-2). James ratified the
    // display rule 2026-08-26; full-list alphabetization was rejected because
    // the display cap would then show an A-names sample and drop Hilo entirely.
    const ranking = d.places.some(p => p.pop !== null) ? 'population' : 'area';
    out[key] = {
      counties: d.counties,
      places:   d.places.map(({ areaPart, ...p }) => p),
      ranking,                              // 'area' = no-population-join fallback (display alphabetizes)
      ...(ranking === 'population' ? { popSource: POP_SOURCE_NOTE } : {}),
      vintage: VINTAGE,
      source: sources,
      fetchedAt,
    };
    if (VERBOSE) {
      const c = out[key].counties, p = out[key].places;
      console.log(`  ${key}: ${c.length} counties (${c.filter(x => x.whole).length} whole), ${p.length} places, ranking=${ranking}`);
    }
  }

  const nDistricts = Object.keys(out).length;
  if (nDistricts < 435 || nDistricts > 460) {
    throw new Error(`district count ${nDistricts} outside sanity range 435–460`);
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');

  console.log(`\nfetch-district-geography: ${nDistricts} districts → data/district-geography.json`);
  console.log(`  counties: ${countyRows.length} rows (${skipped.zz} ZZ, ${skipped.waterOnlyCounty} water-only skipped)`);
  console.log(`  places:   ${placeRows.length} rows (${skipped.remainder} remainder, ${skipped.waterOnlyPlace} water-only skipped)`);
  console.log(`  place population join: ${popMatched} matched, ${popMissing} without (CDPs/PR/territories — area-ranked fallback)`);
  const areaRanked = Object.entries(out).filter(([, d]) => d.ranking === 'area').map(([k]) => k);
  if (areaRanked.length) console.log(`  area-selected districts (no population match; display alphabetizes): ${areaRanked.join(', ')}`);

  // Informative cross-check: every House member in reps-index should resolve
  // to a district entry. Missing = that page silently renders no block.
  try {
    const repsIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'reps-index.json'), 'utf8'));
    const missing = [];
    for (const stateReps of Object.values(repsIndex)) {
      for (const r of stateReps) {
        if (r.role === 'Senator') continue;
        const key = r.district ? `${r.state}-${r.district}` : `${r.state}-AL`;
        if (!out[key]) missing.push(`${r.name} (${key})`);
      }
    }
    if (missing.length) console.log(`  ⚠️  ${missing.length} House member(s) with no district entry: ${missing.slice(0, 8).join('; ')}`);
    else console.log('  every House member in reps-index resolves to a district entry');
  } catch (_) { /* reps-index unavailable — skip the cross-check */ }

  console.log('Next: npm run rep-pages && node scripts/qa-geo-verify.js');
}

(async () => {
  const manifest = await download();
  parse(manifest);
})().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1); });
