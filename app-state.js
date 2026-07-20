// app-state.js — shared page state & constants (split from app.js 2026-07-06).
// LOAD FIRST of the app-*.js files. Top-level let/const share one global lexical
// scope across classic scripts; every other app-*.js file reads these at runtime.

// © 2026 Squidito. All rights reserved. Not open source — see LICENSE.
// =============================================
//  app.js — UI rendering and interactions
// =============================================

let allBills      = [];
let openCards        = new Map(); // id -> 'minor' | 'full'
let openDetails      = {};
let aiOutputs        = {};
let activeMainFilter  = 'recent';
let favoritesView          = false;
const collapsedFavSections = new Set();
let selectedRepIds    = new Set();
let standaloneQuotes  = [];
let repsIndex         = {};

// ---- Bill list pager (home + bills pages) ----
// 24-card initial render keeps the footer reachable; "Show 24 more" pages in,
// "Enable endless scroll" arms an IntersectionObserver for the rest of the
// session (sessionStorage, so a fresh visit always starts button-gated).
const BILL_PAGE_SIZE = 24;
let billRenderCap    = BILL_PAGE_SIZE;
let endlessScrollOn  = false;
let _billPagerObserver = null;
try {
  billRenderCap   = parseInt(sessionStorage.getItem('lpBillCap'), 10) || BILL_PAGE_SIZE;
  endlessScrollOn = sessionStorage.getItem('lpEndless') === '1';
} catch (e) {}

// Placeholder shock quotes — replace with live Congressional Record feed when available
const SHOCK_QUOTES = [
  {
    name: 'Rep. Marjorie Taylor Greene', party: 'R', state: 'GA', bioguideId: 'G000596',
    text: 'This spending bill is socialism with a bow on it. We are looting our grandchildren to buy votes today.',
    source: 'House Floor, Apr 22, 2026', billId: '119-HR-1'
  },
  {
    name: 'Rep. Jasmine Crockett', party: 'D', state: 'TX', bioguideId: 'C001127',
    text: 'They cut food stamps for hungry kids and then stood up and applauded themselves. I cannot do this job without screaming sometimes.',
    source: 'House Floor, Apr 21, 2026', billId: '119-HR-1'
  },
  {
    name: 'Sen. Tommy Tuberville', party: 'R', state: 'AL', bioguideId: 'T000278',
    text: 'I do not think we need to be funding mental health programs for people who just do not want to work.',
    source: 'Senate Floor, Apr 20, 2026', billId: '119-HR-1'
  },
  {
    name: 'Rep. Rashida Tlaib', party: 'D', state: 'MI', bioguideId: 'T000481',
    text: 'Every single one of them knew what was in Section 223 and every single one of them voted yes anyway. Remember their names.',
    source: 'House Floor, Apr 23, 2026', billId: '119-HR-1'
  }
];

const STORAGE_KEYS = {
  trackedState:   'lpTrackedState',
  trackedReps:    'lpTrackedReps',
  watchedBills:   'lpWatchedBills',
  trackedZip:     'lpTrackedZip',
};

let watchedBills = new Set();

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

// Demo reps — shown when no Congress API key is configured
const DEMO_REPS = [
  { bioguideId: 'K000367', name: 'Sen. Klobuchar', party: 'D', state: 'MN' },
  { bioguideId: 'C001047', name: 'Sen. Capito',    party: 'R', state: 'WV' },
  { bioguideId: 'W000437', name: 'Sen. Wicker',    party: 'R', state: 'MS' },
  { bioguideId: 'P000034', name: 'Rep. Pallone',   party: 'D', state: 'NJ' },
  { bioguideId: 'B001261', name: 'Sen. Barrasso',  party: 'R', state: 'WY' },
  { bioguideId: 'M001163', name: 'Rep. Matsui',    party: 'D', state: 'CA' },
];

// NOTE: quotes inside this data-URI MUST stay URL-encoded as %27 — it is embedded
// in onerror="this.src='...'", so a raw ' would close the JS string early and throw
// "Unexpected identifier 'http'" when a portrait 404s. Browsers decode %27 → ' fine.
// (deduped into util.js 2026-07-06) FALLBACK_PORTRAIT lives in util.js

let trackedState = 'TX';
let trackedReps  = [];

// ---- Boot ----
