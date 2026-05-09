// Restructures 119-HR-7148 top-level sections[] and top_lines[] per the new omnibus format:
// - top_lines: one headline per division
// - sections: full per-title breakdown pulled from divisions[].sections[]
const fs = require('fs');
const path = require('path');

const cachePath = path.join(__dirname, '../data/cache.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const entry = cache.bills.find(x => x.id === '119-HR-7148');

// ── 1. top_lines: one per division ───────────────────────────────────────────

entry.top_lines = [
  {
    "headline": "Division A — Defense",
    "billSection": "8001",
    "subs": [
      "$54.54B Army military personnel; $40.54B Navy; $38.77B Air Force; $16.99B Marine Corps; $1.49B Space Force",
      "$74.72B Navy/Marine Corps O&M; $58.25B Army; $61.54B Air Force — Title II reduced $2.8B for efficiency and fuel savings",
      "Columbia Class Submarine: $3.93B + $5.35B advance; Virginia Class: $2.74B + $3.13B advance; $500M Israeli Cooperative Programs"
    ]
  },
  {
    "headline": "Division B — Labor, HHS, and Education",
    "billSection": "529",
    "subs": [
      "$593.82B for Medicare; $508.15B for Medicaid plus $316.51B advance for Q1 FY2027",
      "$24.62B Pell Grants; $19.13B Title I K-12 grants; $15.49B special education (IDEA)",
      "$11.66B rescission of unobligated Inflation Reduction Act education funds (Sec. 529)"
    ]
  },
  {
    "headline": "Division D — Transportation and Housing",
    "billSection": "401",
    "subs": [
      "$34.44B Section 8 housing choice vouchers; $8.32B Public Housing Operating Fund",
      "$63.4B Highway Trust Fund for federal-aid highways; $13.71B FAA; $14.64B public transit",
      "$4.42B homeless assistance; Amtrak: $850M Northeast Corridor + $1.577B National Network"
    ]
  },
  {
    "headline": "Division E — Financial Services and General Government",
    "billSection": "601",
    "subs": [
      "IRS: $3.04B taxpayer services; $5.00B enforcement; $3.16B operations support",
      "SBA 7(a) loan guarantee ceiling: $35.5B; disaster loan ceiling: $15B",
      "Federal judiciary: $6.13B; GSA Federal Buildings Fund: $9.69B"
    ]
  },
  {
    "headline": "Division F — National Security and State",
    "billSection": "7001",
    "subs": [
      "Foreign Military Financing: $6.16B — $3.3B grants-only for Israel; PEPFAR HIV/AIDS: $5.88B",
      "SEED Act (Ukraine and East Europe): $6.77B; Jordan: $1.65B minimum; Egypt: $1.43B minimum",
      "State Department operations: $9.36B; $900M permanently rescinded from prior-year funds (Sec. 7006)"
    ]
  },
  {
    "headline": "Division G — UNRWA Prohibition",
    "billSection": "101",
    "subs": [
      "Bars all U.S. funds from being contributed to UNRWA for FY2024–FY2026 and FY2027 amounts prior to March 25, 2027",
      "Applies notwithstanding any other provision of law; covers prior-year appropriations not yet transferred"
    ]
  },
  {
    "headline": "Division H — DHS Continuing Resolution",
    "billSection": "101",
    "subs": [
      "DHS funded at FY2025 enacted levels through February 13, 2026 under Public Law 119-37",
      "Ratifies obligations incurred during appropriations lapse; authorizes back pay for affected employees"
    ]
  },
  {
    "headline": "Division I — Authorizing Extenders",
    "billSection": "5004",
    "subs": [
      "National Flood Insurance Program extended to September 30, 2026 (retroactive to January 30, 2026)",
      "AGOA and Haiti HELP Act extended to December 31, 2026 with retroactive application; E-Verify to September 30, 2026",
      "U.S. Parole Commission extended to January 30, 2031; sex offense special assessment made permanent (Sec. 5012)"
    ]
  },
  {
    "headline": "Division J — Health Care Extenders",
    "billSection": "6221",
    "subs": [
      "Medicare coverage added for multi-cancer early detection (MCED) screening tests (Sec. 6221)",
      "Medicare Improvement Fund: $1.403B → $2.062B; telehealth, hospital-at-home, and ambulance add-ons extended",
      "TANF extended through December 31, 2026; PBM accountability requirements added; Abraham Accords FDA office created"
    ]
  }
];

// ── 2. sections: per-title breakdown from each division's sections[] ─────────

entry.sections = entry.divisions.flatMap(div =>
  (div.sections || []).map(sec => ({ ...sec }))
);

console.log('top_lines count:', entry.top_lines.length);
console.log('sections count:', entry.sections.length);
entry.sections.forEach(s => console.log('  sec:', s.label));

fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
console.log('cache.json updated');
