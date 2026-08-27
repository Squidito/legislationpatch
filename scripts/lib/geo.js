// lib/geo.js — shared parsing + naming rules for the Census CD119 district-
// geography pipeline (fetch-district-geography.js writes, qa-geo-verify.js
// re-derives, generate_rep_pages.js renders from the emitted JSON).
//
// SOURCE OF RECORD: the raw files in data/geo-src/ (2020 Census CD119
// relationship files + the state-FIPS reference + PEP place populations),
// fetched from census.gov and committed untouched. Every constant in this
// module describes those files as sampled live on 2026-08-26 — the header
// strings are asserted byte-for-byte at parse time so schema drift is a hard
// fail, never a silent misparse.

'use strict';

const fs   = require('fs');
const path = require('path');

const GEO_SRC = path.join(__dirname, '..', '..', 'data', 'geo-src');

// File names inside data/geo-src/ (the URLs live in fetch-district-geography.js).
const FILES = {
  county: 'tab20_cd11920_county20_natl.txt',
  place:  'tab20_cd11920_place20_natl.txt',
  states: 'state-fips.txt',
  pop:    'sub-est2024.csv',
};

// Expected header rows, byte-for-byte after BOM strip (verified 2026-08-26).
const COUNTY_HEADER = 'OID_CD119_20|GEOID_CD119_20|NAMELSAD_CD119_20|AREALAND_CD119_20|AREAWATER_CD119_20|MTFCC_CD119_20|FUNCSTAT_CD119_20|OID_COUNTY_20|GEOID_COUNTY_20|NAMELSAD_COUNTY_20|AREALAND_COUNTY_20|AREAWATER_COUNTY_20|MTFCC_COUNTY_20|CLASSFP_COUNTY_20|FUNCSTAT_COUNTY_20|AREALAND_PART|AREAWATER_PART';
const PLACE_HEADER  = 'OID_CD119_20|GEOID_CD119_20|NAMELSAD_CD119_20|AREALAND_CD119_20|AREAWATER_CD119_20|MTFCC_CD119_20|FUNCSTAT_CD119_20|OID_PLACE_20|GEOID_PLACE_20|NAMELSAD_PLACE_20|AREALAND_PLACE_20|AREAWATER_PLACE_20|MTFCC_PLACE_20|CLASSFP_PLACE_20|FUNCSTAT_PLACE_20|AREALAND_PART|AREAWATER_PART';
const STATES_HEADER = 'STATE|STUSAB|STATE_NAME|STATENS';
const POP_HEADER    = 'SUMLEV,STATE,COUNTY,PLACE,COUSUB,CONCIT,PRIMGEO_FLAG,FUNCSTAT,NAME,STNAME,ESTIMATESBASE2020,POPESTIMATE2020,POPESTIMATE2021,POPESTIMATE2022,POPESTIMATE2023,POPESTIMATE2024';

function stripBom(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

// Parse a pipe-delimited relationship file into row objects. Asserts the
// header matches `expectedHeader` exactly and every data row has the same
// field count — throws (hard fail) on any mismatch.
function parsePipeFile(filePath, expectedHeader) {
  const lines = stripBom(fs.readFileSync(filePath, 'utf8')).split(/\r?\n/);
  const header = lines[0];
  if (header !== expectedHeader) {
    throw new Error(`SCHEMA DRIFT in ${path.basename(filePath)}:\n  expected: ${expectedHeader}\n  got:      ${header}`);
  }
  const cols = header.split('|');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue; // trailing blank line
    const parts = lines[i].split('|');
    if (parts.length !== cols.length) {
      throw new Error(`${path.basename(filePath)} line ${i + 1}: ${parts.length} fields, expected ${cols.length}`);
    }
    const row = {};
    for (let c = 0; c < cols.length; c++) row[cols[c]] = parts[c];
    rows.push(row);
  }
  return rows;
}

// FIPS code -> postal abbreviation, from the fetched Census state.txt.
function loadStateFips() {
  const lines = stripBom(fs.readFileSync(path.join(GEO_SRC, FILES.states), 'utf8')).split(/\r?\n/);
  if (lines[0] !== STATES_HEADER) {
    throw new Error(`SCHEMA DRIFT in ${FILES.states}: got header "${lines[0]}"`);
  }
  const map = {};
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const [fips, postal] = line.split('|');
    map[fips] = postal;
  }
  return map;
}

// GEOID_CD119_20 ("1212" = FL-12) -> the site's district key ("FL-12").
// At-large codes: "00" (single-district states) and "98" (delegate / resident-
// commissioner districts: DC, AS, GU, MP, PR, VI) both normalize to "<ST>-AL",
// matching rep records where at-large members have district: null.
// "ZZ" ("Congressional Districts not defined" — water-only slivers, all with
// AREALAND_PART = 0 in the county file) returns null: skip the row.
function districtKey(geoid, fipsToPostal) {
  const fips = geoid.slice(0, 2);
  const dist = geoid.slice(2);
  const postal = fipsToPostal[fips];
  if (!postal) throw new Error(`Unknown state FIPS "${fips}" in GEOID ${geoid}`);
  if (dist === 'ZZ') return null;
  if (dist === '00' || dist === '98') return `${postal}-AL`;
  if (!/^\d\d$/.test(dist)) throw new Error(`Unexpected district code "${dist}" in GEOID ${geoid}`);
  return `${postal}-${Number(dist)}`;
}

// LSAD descriptor suffixes stripped from NAMELSAD_PLACE_20 for display.
// Ordered longest-first so compound descriptors win ("Juneau city and borough"
// must not become "Juneau city and"). Case-sensitive on purpose: lowercase
// "city" is the LSAD descriptor; capital "City" is name content ("Carson
// City", "Oklahoma City city"). This list was derived by enumerating the
// trailing descriptors actually present in the fetched place file
// (2026-08-26), not from memory; a name matching no suffix is kept verbatim
// ("Princeton", "Butte-Silver Bow (balance)" → "(balance)" rule below).
const LSAD_SUFFIXES = [
  ' metropolitan government (balance)',
  ' metro government (balance)',
  ' unified government (balance)',
  ' consolidated government (balance)',
  ' city (balance)',
  ' metropolitan government',
  ' unified government',
  ' consolidated government',
  ' city and borough',
  ' urban county',
  ' zona urbana',
  ' comunidad',
  ' municipality',
  ' corporation',
  ' township',
  ' borough',
  ' village',
  ' city',
  ' town',
  ' CDP',
  ' (balance)', // bare consolidated-city balance: "Butte-Silver Bow (balance)"
];

function stripLsad(namelsad) {
  for (const suf of LSAD_SUFFIXES) {
    if (namelsad.endsWith(suf)) {
      const stripped = namelsad.slice(0, -suf.length);
      if (stripped.length >= 2) return stripped;
      break; // degenerate ("City city" class) — keep verbatim
    }
  }
  return namelsad;
}

module.exports = {
  GEO_SRC, FILES,
  COUNTY_HEADER, PLACE_HEADER, STATES_HEADER, POP_HEADER,
  stripBom, parsePipeFile, loadStateFips, districtKey, stripLsad, LSAD_SUFFIXES,
};
