// scripts/build_hr7148_analysis.js
// Assembles the complete cache.json entry for 119-HR-7148 with all divisions.
// Run: node scripts/build_hr7148_analysis.js

const fs = require('fs');
const path = require('path');

const entry = {
  "id": "119-HR-7148",
  "isOmnibus": true,
  "title": "Consolidated Appropriations Act, 2026",
  "official_title": "Making further consolidated appropriations for the fiscal year ending September 30, 2026, and for other purposes.",
  "code": "H.R.7148",
  "date": "Jan 19, 2026",
  "version": "v1.0",
  "stage": "signed",
  "stageLabel": "Signed into Law",
  "currentStep": 4,
  "pipeline": ["Introduced","Committee","Passed House","Passed Senate","Signed"],
  "sponsor": "Rep. Cole, Tom (R-OK-4)",
  "sponsor_bioguide": "C001053",
  "cosponsors": 0,
  "pages": 700,
  "analyzed": true,
  "live": false,
  "demo": false,
  "enactedDate": "Feb 3, 2026",
  "stageDate": "Feb 3, 2026",
  "summary": "The Consolidated Appropriations Act, 2026 funds five of the twelve regular FY2026 appropriations packages — Defense, Labor/HHS/Education, Transportation/Housing, Financial Services/Treasury, and National Security/State — while extending DHS funding at FY2025 rates through February 13, 2026, and extending over a dozen expiring programs including the National Flood Insurance Program, TANF, E-Verify, and trade preferences for Africa and Haiti. It also contains a health care extenders division adding Medicare coverage for multi-cancer early detection tests and extending telehealth flexibilities, hospital payment adjustments, and community health center funding.",
  "brief": "Funds defense, health care entitlements, education, housing, and foreign assistance for FY2026 while extending DHS under a short-term CR and adding Medicare coverage for multi-cancer early detection screening.",
  "top_lines": [
    {
      "headline": "Defense Personnel and Operations",
      "billSection": "8001",
      "subs": [
        "$54.54B Army military personnel; $40.54B Navy; $38.77B Air Force; $16.99B Marine Corps; $1.49B Space Force",
        "$58.25B Army operations and maintenance; $74.72B Navy/Marine Corps; $61.54B Air Force; $56.09B Defense-Wide",
        "Title II O&M reduced by $2.8B for efficiency savings, excess working capital, and bulk fuel savings"
      ]
    },
    {
      "headline": "Defense Procurement and Shipbuilding",
      "billSection": "8001",
      "subs": [
        "Columbia Class Submarine: $3.93B plus $5.35B advance; Virginia Class: $2.74B plus $3.13B advance",
        "CVN-81 carrier: $1.62B; DDG-51 Destroyer advance: $1.75B; new FF(X)-Frigate: $242M initial procurement",
        "$500M for Israeli Cooperative Programs (Iron Dome, Arrow 3, SRBMD); Defense Health Program: $41.77B"
      ]
    },
    {
      "headline": "Medicare and Medicaid",
      "billSection": "529",
      "subs": [
        "$593.82B for Medicare benefits and administration under the Social Security Act",
        "$508.15B for Medicaid; $316.51B advance appropriation for first quarter of FY2027",
        "$11.66B rescission of unobligated Inflation Reduction Act education program funds (Sec. 529)"
      ]
    },
    {
      "headline": "Education Funding",
      "billSection": "529",
      "subs": [
        "$24.62B Pell Grants; $19.13B Title I grants to local education agencies",
        "$15.49B for special education (IDEA); $4.65B vocational rehabilitation"
      ]
    },
    {
      "headline": "Housing Assistance",
      "billSection": "401",
      "subs": [
        "$34.44B for Section 8 housing choice vouchers; $8.32B Public Housing Operating Fund",
        "$4.42B homeless assistance; $1.25B HOME Investment Partnerships"
      ]
    },
    {
      "headline": "Foreign Assistance and Military Aid",
      "billSection": "7001",
      "subs": [
        "$6.16B Foreign Military Financing; $3.3B of which is grants-only for Israel",
        "$5.88B for global HIV/AIDS programs (PEPFAR); $6.77B SEED Act assistance for Ukraine/East Europe",
        "Jordan: $1.65B minimum; Egypt: $1.43B minimum; America First Opportunity Fund: up to $850M redirectable"
      ]
    },
    {
      "headline": "DHS Continuing Resolution",
      "billSection": "101",
      "subs": [
        "DHS funded at FY2025 enacted levels through February 13, 2026 under the Further Continuing Appropriations Act",
        "Covers all DHS components (ICE, Border Patrol, TSA, Coast Guard, FEMA) at prior-year rates"
      ]
    },
    {
      "headline": "Health Care Extenders",
      "billSection": "6221",
      "subs": [
        "New: Medicare coverage added for multi-cancer early detection (MCED) screening tests (Sec. 6221)",
        "Telehealth flexibilities, acute hospital care at home, and ambulance add-on payments extended",
        "Medicare Improvement Fund increased from $1.403B to $2.062B; PBM accountability requirements added"
      ]
    },
    {
      "headline": "Program Extensions",
      "billSection": "5004",
      "subs": [
        "National Flood Insurance Program extended through September 30, 2026 (effective retroactively to January 30, 2026)",
        "TANF extended through December 31, 2026; E-Verify extended through September 30, 2026",
        "AGOA and Haiti HELP Act extended to December 31, 2026 with retroactive application; U.S. Parole Commission extended to January 30, 2031"
      ]
    }
  ],
  "likelihood": 100,
  "likelihoodLabel": "Enacted",
  "likelihoodReason": "Signed into law by the President on February 3, 2026 as Public Law 119-75. House passed 217-214 on concurrence; Senate passed 71-29 on January 30, 2026.",
  "sections": [
    {
      "label": "Division A — Department of Defense Appropriations Act, 2026",
      "items": [{
        "main": "Appropriates approximately $895B for military personnel pay, operations and maintenance, weapons procurement, research and development, and the $41.77B Defense Health Program across all active, reserve, and National Guard components.",
        "detail": "Military personnel totals approximately $180B led by Army ($54.54B), Navy ($40.54B), Air Force ($38.77B), and Marine Corps ($16.99B). Shipbuilding includes Columbia Class Submarine ($3.93B plus $5.35B advance) and Virginia Class ($2.74B plus $3.13B advance). $500M is designated for Israeli Cooperative Programs including Iron Dome, Arrow 3, and SRBMD.",
        "comments": []
      }]
    },
    {
      "label": "Division B — Departments of Labor, HHS, and Education Appropriations Act, 2026",
      "items": [{
        "main": "Appropriates mandatory entitlement payments of $593.82B for Medicare and $508.15B for Medicaid, plus $24.62B for Pell Grants, $19.13B for Title I education, $15.49B for IDEA, and rescinds $11.66B in unobligated Inflation Reduction Act education funds.",
        "detail": "HHS programs include $8.83B for Child Care Block Grant, $7.35B for NCI, $6.59B for NIAID. Department of Labor receives $3.98B for WIOA workforce training. An $11.66B rescission of unobligated IRA education funds is included in Sec. 529.",
        "comments": []
      }]
    },
    {
      "label": "Division D — Transportation, Housing and Urban Development, and Related Agencies Appropriations Act, 2026",
      "items": [{
        "main": "Appropriates $34.44B for Section 8 housing choice vouchers, $63.4B from the Highway Trust Fund for federal-aid highways, $13.71B for the FAA, $14.64B for public transit, and $4.42B for homeless assistance.",
        "detail": "HUD programs include $8.32B for public housing operations, $1.25B for HOME. HUD loan guarantee ceilings: $400B single-family mortgage insurance, $550B Ginnie Mae MBS. Amtrak receives $850M for Northeast Corridor and $1.577B for National Network.",
        "comments": []
      }]
    },
    {
      "label": "Division E — Financial Services and General Government Appropriations Act, 2026",
      "items": [{
        "main": "Appropriates $3.04B for IRS taxpayer services and $5.00B for IRS enforcement, sets SBA 7(a) loan guarantee authority at $35.5B, and funds the federal judiciary at $6.13B.",
        "detail": "IRS also receives $3.16B for operations support. GSA Federal Buildings Fund: $9.69B. SBA disaster loan ceiling: $15B. CFIUS: $21M, fully offset by filing fees.",
        "comments": []
      }]
    },
    {
      "label": "Division F — National Security, Department of State, and Related Programs Appropriations Act, 2026",
      "items": [{
        "main": "Appropriates $9.36B for State Department operations, $6.16B for Foreign Military Financing (with $3.3B grants-only for Israel), $5.88B for PEPFAR, $6.77B for Ukraine and East European democracy, and permanently rescinds $900M from prior-year State/Foreign Ops funds.",
        "detail": "Jordan: $1.65B minimum; Egypt: $1.43B minimum. USAID Economic Support Fund: $5.4B. Global Fund: $1.25B; IDA: $1.07B. America First Opportunity Fund: up to $850M transfer authority (Sec. 7045).",
        "comments": []
      }]
    },
    {
      "label": "Division G — Other Matters",
      "items": [{
        "main": "Prohibits all U.S. funds — including prior-year appropriations — from being contributed to UNRWA for FY2024, FY2025, FY2026, or FY2027 amounts prior to March 25, 2027.",
        "detail": "Covers funds from Division F and all other State/Foreign Ops appropriations including supplementals. Applies retroactively to prior-year funds not yet transferred. No waiver authorized by any other provision of law.",
        "comments": []
      }]
    },
    {
      "label": "Division H — Further Continuing Appropriations Act, 2026",
      "items": [{
        "main": "Retroactively extends the DHS continuing resolution to February 13, 2026, ratifies obligations incurred during a brief lapse in appropriations, and authorizes back pay for affected federal employees.",
        "detail": "Amends Public Law 119-37 CR expiration to February 13, 2026. Sec. 102 ratifies the lapse period. Sec. 103 authorizes employee pay under 31 U.S.C. § 1341(c). Sec. 105 repeals a legislative branch provision from the prior CR.",
        "comments": []
      }]
    },
    {
      "label": "Division I — Authorizing Extenders and Technical Corrections",
      "items": [{
        "main": "Extends 20 expiring authorizations including the National Flood Insurance Program, AGOA, Haiti HELP Act, E-Verify, the U.S. Parole Commission (to January 30, 2031), and makes the sex offense special assessment permanent, while exempting all Division J health costs from PAYGO scoring.",
        "detail": "NFIP extended to September 30, 2026, retroactive to January 30, 2026. AGOA and Haiti extended to December 31, 2026 with retroactive application. Parole Commission: January 30, 2031. Sex offense assessment: expiration date removed. Sec. 5021 exempts all I and J costs from PAYGO scorecards.",
        "comments": []
      }]
    },
    {
      "label": "Division J — Health Care Extenders",
      "items": [{
        "main": "Adds Medicare coverage for multi-cancer early detection (MCED) screening tests, extends telehealth flexibilities and Medicare payment adjustments, increases the Medicare Improvement Fund from $1.403B to $2.062B, extends TANF through December 31, 2026, and establishes an Abraham Accords Office within the FDA.",
        "detail": "New Medicare benefits: MCED tests, external infusion pumps, home infusion drugs. Medicaid: age restrictions removed for working disabled adults. PBM accountability (Sec. 6224): fiduciary and spread pricing requirements. Special Diabetes Programs: $350M FY2026. No Surprises Act: $188M. FDA Abraham Accords Office created (Sec. 6611).",
        "comments": []
      }]
    }
  ],
  "underreported": [
    {
      "section": "Sec. 6 — Payment to Widows and Heirs of Deceased Members of Congress",
      "summary": "Appropriates $174,000 to Jill Marie LaMalfa, widow of the late Representative Douglas L. LaMalfa of California, from the general fund of the Treasury.",
      "why_unreported": "Section 6 appears before Division A, outside any division or subject-matter title. The bill title identifies this as a government appropriations act; Sec. 6 directly appropriates a named payment to a private individual."
    },
    {
      "section": "Sec. 529 — IRA Education Fund Rescission",
      "summary": "Rescinds $11,661,000,000 in unobligated balances from section 10301(1)(A)(iii) of Public Law 117-169 (the Inflation Reduction Act), eliminating previously enacted education spending authority.",
      "why_unreported": "Located in Division B Title V General Provisions, labeled as a rescission provision. Reduces previously enacted education spending by $11.66B without modifying the program's eligibility rules or structure."
    },
    {
      "section": "Sec. 5021 — PAYGO Exemption for Health Extenders",
      "summary": "Excludes all budgetary effects of Divisions I and J from both statutory PAYGO scorecards and the Senate PAYGO scorecard, removing the requirement for spending offsets for all new or extended Medicare, Medicaid, and TANF spending in those divisions.",
      "why_unreported": "Placed in Division I, Sec. 5021 determines the fiscal treatment of all Division J health spending. The exemption covers the Medicare Improvement Fund increase, new MCED coverage, and all health extender costs — but this is not disclosed in any Division J provision."
    },
    {
      "section": "Division G — UNRWA Funding Prohibition",
      "summary": "Bars all U.S. funds, including from prior fiscal years, from being contributed to UNRWA through March 25, 2027 — a retroactive restriction on already-enacted spending authority for prior years.",
      "why_unreported": "Division G is a single provision with no appropriations amounts. The retroactive application to prior-year funds makes it a clawback on previously enacted spending authority, not merely a prospective restriction — an effect not indicated by the division label 'Other Matters.'"
    }
  ],
  "criticisms": [
    {
      "who": "Ms. Baldwin (D-WI)",
      "why": "This amendment would completely eliminate funding for an office that helps some of the most vulnerable in our country. This office helps shelter and care for children who are seeking safety. It makes sure that these children aren't being trafficked. It makes sure these children aren't stuck in cages in Border Patrol facilities for extended periods of time."
    },
    {
      "who": "Mrs. Capito (R-WV)",
      "why": "This amendment would eliminate HHS funding provided in the bill — which the Trump administration actually requested in their budget — that will allow the Agency to drastically improve sponsor vetting for unaccompanied children, ensuring that they are no longer released to human traffickers."
    }
  ],
  "gaps": [
    "The bill funds five of twelve FY2026 appropriations packages but does not include Agriculture, Commerce/Justice/Science, Energy/Water, Interior/Environment, full-year Homeland Security, or the Legislative Branch.",
    "The DHS continuing resolution runs only through February 13, 2026, leaving border security and immigration enforcement funding unresolved within days of enactment.",
    "Division G bars UNRWA contributions but does not specify alternative humanitarian delivery mechanisms for Palestinian refugees who rely on UNRWA for food, education, and health services."
  ],
  "featured_quotes": [
    {
      "name": "Ms. Baldwin",
      "party": "D",
      "state": "WI",
      "bioguideId": "B001230",
      "text": "This amendment would completely eliminate funding for an office that helps some of the most vulnerable in our country. This office helps shelter and care for children who are seeking safety. It makes sure that these children aren't being trafficked. It makes sure these children aren't stuck in cages in Border Patrol facilities for extended periods of time.",
      "stance": "oppose"
    },
    {
      "name": "Mrs. Capito",
      "party": "R",
      "state": "WV",
      "bioguideId": "C001047",
      "text": "This amendment would eliminate HHS funding provided in the bill — which the Trump administration actually requested in their budget — that will allow the Agency to drastically improve sponsor vetting for unaccompanied children, ensuring that they are no longer released to human traffickers.",
      "stance": "oppose"
    }
  ],
  "changes": {
    "added": [
      "Medicare coverage for multi-cancer early detection (MCED) screening tests (Sec. 6221)",
      "Abraham Accords Office established within the Food and Drug Administration (Sec. 6611)",
      "America First Opportunity Fund: up to $850M transfer authority from existing foreign assistance accounts (Sec. 7045)",
      "FF(X)-Frigate: $242M initial procurement appropriation in Division A",
      "Medicare coverage for external infusion pumps and non-self-administrable home infusion drugs (Sec. 6222)"
    ],
    "modified": [
      "Medicare Improvement Fund increased from $1,403,000,000 to $2,062,000,000 (Sec. 6228)",
      "National Flood Insurance Program extended to September 30, 2026 (Sec. 5004)",
      "TANF extended through December 31, 2026 (Sec. 6304)",
      "AGOA extended to December 31, 2026 with retroactive application (Sec. 5019)",
      "Haiti HELP Act extended to December 31, 2026 (Sec. 5020)",
      "E-Verify extended to September 30, 2026 (Sec. 5014)",
      "U.S. Parole Commission extended to January 30, 2031 (Sec. 5011)",
      "FMF grants for Israel set at $3.3B minimum out of $6.16B total FMF (Division F)",
      "Jordan bilateral assistance floor: $1.65B minimum (Division F)",
      "Cybersecurity authorities (NCPS, CISA, State/Local Grant) extended to September 30, 2026 (Secs. 5007-5009)"
    ],
    "removed": [
      "$11.66B in unobligated Inflation Reduction Act education funds rescinded (Sec. 529)",
      "$900M permanently rescinded from prior-year State and Foreign Operations appropriations (Sec. 7006)",
      "Expiration date removed from sex offense special assessment (18 U.S.C. § 3014) — making it permanent (Sec. 5012)",
      "Age restrictions removed for working adults with disabilities seeking Medicaid eligibility (Sec. 6102)"
    ]
  },
  "votes": [
    { "chamber": "House", "date": "2026-02-03", "question": "On Motion to Concur in the Senate Amendments", "result": "Passed", "yeas": 217, "nays": 214, "present": 0, "notVoting": 1, "crossoverCount": 42 },
    { "chamber": "Senate", "date": "2026-01-30", "question": "On Passage of the Bill H.R. 7148", "result": "Bill Passed", "yeas": 71, "nays": 29, "present": 0, "notVoting": 0, "crossoverCount": 0 },
    { "chamber": "Senate", "date": "2026-01-29", "question": "On Cloture on the Motion to Proceed H.R. 7148", "result": "Cloture on the Motion to Proceed Rejected", "yeas": 45, "nays": 55, "present": 0, "notVoting": 0, "crossoverCount": 8 },
    { "chamber": "House", "date": "2026-01-22", "question": "On Passage", "result": "Passed", "yeas": 341, "nays": 88, "present": 0, "notVoting": 2, "crossoverCount": 0 }
  ],
  "divisions": [
    {
      "label": "Division A — Department of Defense Appropriations Act, 2026",
      "divisionKey": "A",
      "summary": "Division A appropriates funds for the Department of Defense for FY2026, covering pay and benefits for all active, reserve, and National Guard components; operations and maintenance; weapons procurement including submarines and carrier vessels; research and development; the Defense Health Program; and related intelligence agencies.",
      "brief": "Funds all DoD military personnel pay, operations, procurement, and the $41.77B Defense Health Program, with $500M designated for Israeli missile defense cooperation.",
      "top_lines": [
        { "headline": "Military Personnel Pay", "subs": ["Army: $54.54B; Navy: $40.54B; Air Force: $38.77B; Marine Corps: $16.99B; Space Force: $1.49B", "National Guard: Army $10.48B, Air Force $5.47B; Reserve components: Army $5.73B, Navy $2.71B, Marine Corps $1.00B, Air Force $2.70B"] },
        { "headline": "Operations and Maintenance", "subs": ["Navy and Marine Corps: $74.72B; Army: $58.25B; Air Force: $61.54B; Defense-Wide: $56.09B; Space Force: $5.69B", "Title II O&M reduced by $1.2B for efficiency, $1.05B for excess working capital cash, and $550M for bulk fuel savings"] },
        { "headline": "Shipbuilding", "subs": ["Columbia Class Submarine: $3.93B plus $5.35B advance procurement; Virginia Class: $2.74B plus $3.13B advance", "CVN-81 carrier: $1.62B; CVN Refueling Overhauls: $1.58B; DDG-51 Destroyer advance: $1.75B", "FF(X)-Frigate: $242M initial procurement; Medium Landing Ship: $800M"] },
        { "headline": "Defense Health Program", "subs": ["$41.77B for the Defense Health Program covering all military healthcare; $1.27B minimum for health research", "$165M of Defense Health O&M may transfer to the Joint DoD-VA Medical Facility"] },
        { "headline": "Israeli Defense Cooperation", "subs": ["$500M from O&M and RDT&E for Israeli Cooperative Programs: Arrow 3 ($173M), SRBMD ($127M), Arrow upper-tier co-production ($100M)", "$150M minimum for Jordan from operation and maintenance funds"] },
        { "headline": "Counter-Narcotics and Overseas Security", "subs": ["$678.7M DoD counter-narcotics; $305M National Guard counter-drug; $134.9M drug demand reduction", "$342.5M Counter-ISIS Train and Equip Fund; $282.8M Cooperative Threat Reduction (nuclear security)"] },
        { "headline": "Intelligence Community", "subs": ["CIA Retirement and Disability System: $514M; Intelligence Community Management Account: $629.1M", "DoD Inspector General: $517.6M"] }
      ],
      "sections": [
        {
          "label": "Title I — Military Personnel",
          "items": [{
            "main": "Appropriates pay, allowances, clothing, subsistence, travel, and retirement fund contributions for all active-duty, reserve, and National Guard components of the Army, Navy, Marine Corps, Air Force, Space Force, and ROTC.",
            "detail": "Active component: Army $54.54B, Navy $40.54B, Air Force $38.77B, Marine Corps $16.99B, Space Force $1.49B. National Guard: Army $10.48B, Air Force $5.47B. Reserve components: Army $5.73B, Navy $2.71B, Marine Corps $1.00B, Air Force $2.70B.",
            "comments": []
          }]
        },
        {
          "label": "Title II — Operation and Maintenance",
          "items": [{
            "main": "Appropriates funds for day-to-day operations including facilities, training, and intelligence, with legislated reductions totaling $2.8B for efficiency, excess working capital, and bulk fuel savings.",
            "detail": "Navy and Marine Corps combined: $74.72B; Army: $58.25B; Air Force: $61.54B; Defense-Wide: $56.09B; Space Force: $5.69B. Three separate reductions: $1,204,617,000 for efficiency; $1,050,000,000 for excess working capital cash; $550,000,000 for bulk fuel savings.",
            "comments": []
          }]
        },
        {
          "label": "Title III — Procurement",
          "items": [{
            "main": "Appropriates funds for shipbuilding, aircraft, missiles, and other weapons systems including Columbia Class and Virginia Class submarines, CVN carriers, DDG destroyers, and the first procurement for the FF(X)-Frigate.",
            "detail": "Columbia Class: $3.93B + $5.35B advance. Virginia Class: $2.74B + $3.13B advance. CVN-81: $1.62B. CVN Refueling Overhauls: $1.58B. DDG-51 advance: $1.75B. FF(X)-Frigate: $242M. Medium Landing Ship: $800M. Professional technical services capped at $2.886B.",
            "comments": []
          }]
        },
        {
          "label": "Title VI — Other Department of Defense Programs",
          "items": [{
            "main": "Appropriates $41.77B for the Defense Health Program, plus counter-narcotics, drug demand reduction, chemical weapons destruction, and overseas security cooperation funds.",
            "detail": "Defense Health Program: $41.77B total ($38.94B O&M; $1.27B minimum research). Counter-narcotics: $678.7M; National Guard counter-drug: $305M; drug demand reduction: $134.9M. Chemical agents/munitions destruction: $213.3M. ISIS Train and Equip Fund: $342.5M. Cooperative Threat Reduction: $282.8M.",
            "comments": []
          }]
        },
        {
          "label": "Title VIII — General Provisions",
          "items": [{
            "main": "Sets transfer authorities, designates $500M for Israeli cooperative missile defense programs, limits professional technical services to $2.886B, and authorizes $650M for contingency contracts.",
            "detail": "Sec. 8021: $500M for Israeli Cooperative Programs — Arrow 3 ($173M), SRBMD ($127M), Arrow upper-tier co-production ($100M). $150M minimum for Jordan. Defense Security Cooperation Agency: $1.5B and $1.0B in separate security assistance tranches. Sec. 8001 prohibits use of funds for propaganda within the United States.",
            "comments": []
          }]
        }
      ],
      "underreported": [
        {
          "section": "Title VIII — O&M Efficiency and Fuel Savings Reductions",
          "summary": "Three separate provisions in Title VIII reduce Title II O&M appropriations by a total of $2,804,617,000: $1,204,617,000 for efficiency measures, $1,050,000,000 for excess cash in working capital funds, and $550,000,000 for bulk fuel savings.",
          "why_unreported": "Title II headline appropriation amounts appear larger than actual net funding because these mandatory reductions are embedded in general provisions and not reflected in the per-account appropriation lines."
        },
        {
          "section": "Sec. 8034 — Chemical Agents and Munitions Destruction",
          "summary": "$213.3M for destruction of chemical warfare agents and munitions under the Chemical Weapons Convention; $210.04M must be used for the Assembled Chemical Weapons Alternatives program.",
          "why_unreported": "Labeled under 'Other Defense Programs,' this funding fulfills a treaty obligation under the Chemical Weapons Convention rather than a traditional military spending purpose. The section label does not describe the treaty compliance function."
        },
        {
          "section": "Sec. 8120 — Counter-ISIS Train and Equip Fund",
          "summary": "$342.5M for the Counter-Islamic State of Iraq and Syria Train and Equip Fund, supporting partner forces fighting ISIS; available until September 30, 2027.",
          "why_unreported": "Categorized in general provisions rather than in a named appropriations heading, the fund continues a theater-specific counterterrorism mission not referenced in any division title or major appropriations label."
        }
      ],
      "criticisms": [],
      "gaps": [
        "The Defense Health Program is funded at $41.77B but the division does not address pending changes to the TRICARE fee structure, which is under separate authorization review.",
        "The $500M Israeli cooperative designation does not specify distribution of the balance remaining after the named sub-allocations for Arrow 3, SRBMD, and co-production activities.",
        "Shipbuilding funds Columbia and Virginia class submarines but does not include a production rate increase provision despite the Navy's stated goal of higher submarine construction throughput."
      ],
      "featured_quotes": [],
      "changes": {
        "added": ["FF(X)-Frigate: initial $242M procurement appropriation for a new frigate class", "Up to $500M additional military readiness funding in Sec. 8153"],
        "modified": ["Title II O&M reduced by $2,804,617,000 through three legislated efficiency cuts", "Israeli Cooperative Program designated at $500M with specific sub-allocations for Arrow 3, SRBMD, and upper-tier co-production", "Counter-ISIS Train and Equip Fund reauthorized at $342.5M", "Title IV RDT&E reduced by $1B for expired program authorizations"],
        "removed": []
      }
    },
    {
      "label": "Division B — Departments of Labor, Health and Human Services, and Education, and Related Agencies Appropriations Act, 2026",
      "divisionKey": "B",
      "summary": "Division B appropriates FY2026 funds for the Departments of Labor, HHS, and Education, dominated by mandatory entitlement payments of $593.82B for Medicare and $508.15B for Medicaid, plus $24.62B for Pell Grants, $19.13B for Title I education grants, $15.49B for special education, and a $11.66B rescission of unobligated Inflation Reduction Act education funds.",
      "brief": "Medicare ($593.82B) and Medicaid ($508.15B) dominate this division, which also funds Pell Grants, Title I, IDEA, NIH research, and child care, while rescinding $11.66B in IRA education funds.",
      "top_lines": [
        { "headline": "Medicare", "subs": ["$593.82B for Medicare benefits and administrative expenses", "$49.45B for CMS Medicare administrative expenses; $23.5B advance for SSI benefits in Q1 FY2027"] },
        { "headline": "Medicaid", "subs": ["$508.15B for Medicaid; $316.51B advance for first quarter of FY2027", "$12.36B for adoption assistance payments; $6.84B for foster care and adoption under Title IV-E"] },
        { "headline": "K-12 Education", "subs": ["Title I education grants: $19.13B ($8.20B available July 1, 2026)", "Special Education (IDEA): $15.49B ($5.91B available July 1, 2026)", "Finance Incentive Grants: $5.30B; Targeted Grants: $5.30B"] },
        { "headline": "Higher Education", "subs": ["Pell Grants: $24.62B; $22.48B for basic grants (Subpart 1)", "Vocational Rehabilitation: $4.65B; $4.50B for state rehabilitation grants"] },
        { "headline": "NIH Research Institutes", "subs": ["National Cancer Institute: $7.35B; NIAID: $6.59B; National Institute on Aging: $4.52B", "NHLBI (cardiovascular, lung, blood): $3.99B; SAMHSA substance abuse and mental health: $4.09B"] },
        { "headline": "Child Care and Social Services", "subs": ["Child Care and Development Block Grant: $8.83B", "Social Services Block Grant (Title XX): $14.92B"] },
        { "headline": "Department of Labor", "subs": ["WIOA workforce training grants: $3.98B including $875.6M adult, $948.1M youth, $1.10B dislocated workers", "Unemployment Insurance administration: $4.00B from Employment Security Administration fund"] },
        { "headline": "IRA Rescission", "subs": ["$11.66B rescission of unobligated balances from section 10301(1)(A)(iii) of Public Law 117-169 (Sec. 529)"] }
      ],
      "sections": [
        {
          "label": "Title I — Department of Labor",
          "items": [{
            "main": "Appropriates $3.98B for WIOA workforce training grants, $4.00B for unemployment insurance administration, and related employment programs.",
            "detail": "WIOA grants: $875.6M adult employment, $948.1M youth activities, $1.10B dislocated workers. National programs: $1.06B including $300.9M dislocated workers national reserve. Unemployment Insurance: $4.00B from Employment Security Administration trust fund.",
            "comments": []
          }]
        },
        {
          "label": "Title II — Department of Health and Human Services",
          "items": [{
            "main": "Appropriates $593.82B for Medicare, $508.15B for Medicaid (plus $316.51B Q1 FY2027 advance), $8.83B for Child Care Block Grant, $7.35B for NCI, $6.59B for NIAID, and $14.92B for Social Services Block Grant.",
            "detail": "SSI advance: $23.5B for Q1 FY2027. Foster care/adoption: $6.84B Title IV-E. SAMHSA: $4.09B. CMS administrative expenses: $14.67B not to exceed. Global health/HIV-AIDS: $5.16B. Child support and self-sufficiency programs also funded.",
            "comments": []
          }]
        },
        {
          "label": "Title III — Department of Education",
          "items": [{
            "main": "Appropriates $24.62B for Pell Grants, $19.13B for Title I education grants, $15.49B for IDEA special education, and includes a $11.66B rescission of unobligated Inflation Reduction Act education funds (Sec. 529).",
            "detail": "Title I: $6.46B basic grants, $5.30B targeted grants, $5.30B finance incentive grants, $862M concentration grants. Pell: $22.48B basic grants. Vocational Rehabilitation: $4.65B. Sec. 529 rescinds $11,661,000,000 from Public Law 117-169 unobligated balances.",
            "comments": []
          }]
        }
      ],
      "underreported": [
        {
          "section": "Sec. 529 — Rescission of IRA Education Funds",
          "summary": "Rescinds the unobligated balance of $11,661,000,000 from section 10301(1)(A)(iii) of Public Law 117-169, eliminating previously enacted education spending authority without modifying program eligibility rules.",
          "why_unreported": "Located in Title V General Provisions, the provision permanently eliminates $11.66B in previously enacted spending authority. It is a rescission section rather than a programmatic education change."
        },
        {
          "section": "Title II — CHIP Advance Unavailability Designation",
          "summary": "$12,340,000,000 in CHIP state matching payments is appropriated but simultaneously designated as unavailable for obligation — functioning as a spending ceiling rather than an immediate outlay.",
          "why_unreported": "The appropriation and simultaneous unavailability designation appear in the same paragraph. The $12.34B appears in appropriation totals but cannot be obligated until a future triggering event."
        }
      ],
      "criticisms": [],
      "gaps": [
        "Medicare and Medicaid are funded at open-ended levels based on program formulas; the division does not set caps, block grant amounts, or per-capita limits on either program.",
        "The $11.66B IRA education rescission eliminates spending authority without identifying which specific activities or grantees are affected by the removed unobligated balances."
      ],
      "featured_quotes": [],
      "changes": {
        "added": [],
        "modified": ["FY2026 levels set for Medicare ($593.82B), Medicaid ($508.15B), NIH institutes, WIOA, Pell Grants, and other programs", "Title I and IDEA availability dates structured with July 1, 2026 release schedules"],
        "removed": ["$11,661,000,000 in unobligated Inflation Reduction Act education funds rescinded (Sec. 529)"]
      }
    },
    {
      "label": "Division D — Transportation, Housing and Urban Development, and Related Agencies Appropriations Act, 2026",
      "divisionKey": "D",
      "summary": "Division D appropriates FY2026 funds for the Department of Transportation and HUD, covering $34.44B for Section 8 housing vouchers, $63.4B in highway trust fund obligations, $13.71B for the FAA, $14.64B for public transit, $4.42B for homeless assistance, and loan guarantee ceilings of $400B for single-family mortgages and $550B for Ginnie Mae MBS.",
      "brief": "Section 8 housing vouchers ($34.44B) and highway trust fund authorizations ($63.4B) dominate this division, alongside $13.71B for FAA operations and $4.42B for homeless assistance.",
      "top_lines": [
        { "headline": "Section 8 Housing Vouchers", "subs": ["$34.44B for housing choice vouchers; $34.96B available for contract renewals", "$8.32B for Public Housing Operating Fund"] },
        { "headline": "Federal Highway Programs", "subs": ["$63,396,105,821 from the Highway Trust Fund for federal-aid highway and safety construction", "Obligation ceiling capped at $62,657,105,821 for FY2026"] },
        { "headline": "Federal Aviation Administration", "subs": ["$13.71B total; $13.04B from Airport and Airway Trust Fund", "Air traffic organization: $10.34B; aviation safety: $1.84B"] },
        { "headline": "Public Transit", "subs": ["$14.64B from the Mass Transit Account for transit programs and infrastructure"] },
        { "headline": "Community Development and Homelessness", "subs": ["CDBG: $6.995B for community and economic development", "Homeless Assistance Grants: $4.42B; Continuum of Care: $4.01B; HOME Investment Partnerships: $1.25B"] },
        { "headline": "Amtrak", "subs": ["Northeast Corridor grants: $850M; National Network grants: $1.577B", "No funds may be used by Amtrak to discontinue long-distance routes on lines without positive train control"] },
        { "headline": "HUD Loan Guarantee Ceilings", "subs": ["Single-family mortgage insurance ceiling: $400B; Ginnie Mae MBS ceiling: $550B", "HECM reverse mortgage insurance ceiling: $35B"] }
      ],
      "sections": [
        {
          "label": "Title I — Department of Transportation",
          "items": [{
            "main": "Appropriates $63.4B from the Highway Trust Fund for federal-aid highways, $13.71B for the FAA, $14.64B for transit from the Mass Transit Account, $850M and $1.577B for Amtrak, and funds for FHWA, FRA, and other modal agencies.",
            "detail": "FAA: $13.71B total, $13.04B from Airport/Airway Trust Fund; air traffic $10.34B, safety $1.84B. FAA research: $74.5M including $9M for the new ARPA-I office. Amtrak national network: $1.577B available until expended. Transit: $14.64B from Mass Transit Account.",
            "comments": []
          }]
        },
        {
          "label": "Title II — Department of Housing and Urban Development",
          "items": [{
            "main": "Appropriates $34.44B for housing choice vouchers, $8.32B for public housing operations, $6.995B for CDBG, $4.42B for homeless assistance, and $1.25B for HOME; sets loan guarantee ceilings of $400B (single-family) and $550B (Ginnie Mae).",
            "detail": "Section 8 renewals: $34.96B. Public Housing Capital Fund: $3.30B. HOME: $1.25B, available until September 30, 2029. Continuum of Care: $4.01B. Loan guarantee ceilings are contingent liability caps, not direct appropriations.",
            "comments": []
          }]
        }
      ],
      "underreported": [
        {
          "section": "HUD Loan Guarantee Ceilings",
          "summary": "Sets the single-family mortgage insurance ceiling at $400B, the Ginnie Mae MBS ceiling at $550B, and the HECM reverse mortgage ceiling at $35B — authorizing up to $985B in combined contingent federal liabilities.",
          "why_unreported": "These ceilings authorize contingent liabilities far exceeding any direct appropriation in the division. They are statutory borrowing authorizations that only convert to actual obligations when defaults occur and do not appear in budget authority totals."
        },
        {
          "section": "Title I — ARPA-I Funding",
          "summary": "$9M of FAA Research and Technology funds is earmarked for the Advanced Research Projects Agency-Infrastructure (ARPA-I), established by the FAA Reauthorization Act of 2024 as a new transportation research agency.",
          "why_unreported": "ARPA-I funding appears as a sub-allocation within the FAA Research and Technology account, not as a separate appropriations heading, despite funding an entirely new federal agency."
        }
      ],
      "criticisms": [],
      "gaps": [
        "Housing voucher funding is set at $34.44B but the division does not include emergency voucher funding for tenants at risk of displacement from expiring pandemic-era tenant protections.",
        "Federal highway programs are funded through trust fund obligation ceilings but no additional appropriation is provided for emergency road and bridge repair outside the ceiling."
      ],
      "featured_quotes": [],
      "changes": {
        "added": ["ARPA-I receives $9M from FAA Research and Technology — first appropriation for this new infrastructure research agency"],
        "modified": ["Ginnie Mae MBS guarantee ceiling: $550B; single-family mortgage insurance ceiling: $400B; HECM ceiling: $35B", "Highway obligation ceiling set at $62,657,105,821 for FY2026", "Amtrak National Network grants: $1.577B"],
        "removed": []
      }
    },
    {
      "label": "Division E — Financial Services and General Government Appropriations Act, 2026",
      "divisionKey": "E",
      "summary": "Division E appropriates FY2026 funds for the Department of the Treasury, the Judiciary, the Executive Office of the President, the District of Columbia, and independent agencies, with the IRS receiving $3.04B for taxpayer services, $5.00B for enforcement, and $3.16B for operations support, and the SBA receiving authority for $35.5B in 7(a) loan guarantees.",
      "brief": "The IRS receives approximately $11.2B across three accounts, the SBA is authorized for $35.5B in business loan guarantees and $15B in disaster loans, and the federal judiciary receives $6.13B.",
      "top_lines": [
        { "headline": "IRS Operations", "subs": ["Taxpayer Services: $3.04B; Enforcement: $5.00B; Operations Support: $3.16B", "Business Systems Modernization: $271.2M; combined IRS appropriation: approximately $11.47B"] },
        { "headline": "Small Business Lending", "subs": ["SBA 7(a) loan guarantee ceiling: $35.5B; disaster loan ceiling: $15B", "SBIC debenture guarantee ceiling: $6B; SBIC equity guarantee ceiling: $16.5B"] },
        { "headline": "Federal Buildings", "subs": ["GSA Federal Buildings Fund: $9.69B for installment purchases and contracts", "Rental of space: $5.57B; building operations: $3.01B"] },
        { "headline": "Judiciary", "subs": ["Courts and Probation Services: $6.13B; Defender Services: $1.77B"] },
        { "headline": "Treasury National Security", "subs": ["Office of Terrorism and Financial Intelligence: $237.7M (includes $3M minimum for human rights/Magnitsky sanctions)", "CFIUS: $21M, fully offset by filing fees"] }
      ],
      "sections": [
        {
          "label": "Title I — Department of the Treasury",
          "items": [{
            "main": "Appropriates $3.04B for IRS taxpayer services, $5.00B for IRS enforcement, $3.16B for operations support, $271.2M for business systems modernization, $237.7M for terrorism and financial intelligence, and $21M for CFIUS (offset by fees).",
            "detail": "IRS taxpayer services: $3.04B; up to $186M remains available until September 30, 2027. IRS enforcement covers tax collection, legal support, and criminal investigation. CFIUS: $21M general fund reduced to $0 as filing fee collections are received. Treasury Office of Intelligence: $185.2M.",
            "comments": []
          }]
        },
        {
          "label": "Title III — The Judiciary",
          "items": [{
            "main": "Appropriates $6.13B for courts, probation, and pretrial services; $1.77B for defender services; and $892M for court operations.",
            "detail": "The $6.13B judiciary account includes firearms for Probation and Pretrial Services staff. Defender services cover federal public defenders under the Criminal Justice Act. Operations funded across district courts, circuit courts, Supreme Court, and Court of International Trade.",
            "comments": []
          }]
        },
        {
          "label": "Title V — Independent Agencies",
          "items": [{
            "main": "Funds the SBA's loan guarantee programs ($35.5B 7(a), $15B disaster, $6B SBIC debentures), the General Services Administration, OPM, SEC, and other independent agencies.",
            "detail": "GSA Federal Buildings Fund: $9.69B installment purchases, $5.57B rental, $3.01B building operations. SBA administrative expenses within Title V. SEC operations primarily offset by transaction fees under the Securities Exchange Act.",
            "comments": []
          }]
        }
      ],
      "underreported": [
        {
          "section": "IRS Enforcement vs. Taxpayer Services Funding Split",
          "summary": "The IRS Enforcement account ($5.00B) is funded at 64% more than the Taxpayer Services account ($3.04B), with the combined $11.47B appearing across three separate accounts none of which shows the total IRS appropriation.",
          "why_unreported": "The three IRS accounts appear as separate appropriations headings; the relative weight between enforcement and taxpayer services is not visible from any single appropriations line."
        },
        {
          "section": "CFIUS Zero-Net Appropriation",
          "summary": "The CFIUS fund is appropriated at $21M but simultaneously reduced to $0 as filing fee collections are received; if collections fall short of $21M, Treasury must absorb the shortfall.",
          "why_unreported": "The provision appears to appropriate $21M but the offset mechanism makes the net general fund cost $0 under the assumption of full fee recovery — an assumption not guaranteed in the bill text."
        }
      ],
      "criticisms": [],
      "gaps": [
        "Division funds Treasury operations but does not address the statutory debt limit ceiling, which requires separate legislative action.",
        "SBA disaster loan ceiling of $15B provides no emergency supplemental authority for declared disasters occurring after enactment."
      ],
      "featured_quotes": [],
      "changes": {
        "added": [],
        "modified": ["IRS FY2026 levels: Taxpayer Services $3.04B, Enforcement $5.00B, Operations Support $3.16B", "SBA 7(a) guarantee ceiling: $35.5B; disaster loan ceiling: $15B"],
        "removed": []
      }
    },
    {
      "label": "Division F — National Security, Department of State, and Related Programs Appropriations Act, 2026",
      "divisionKey": "F",
      "summary": "Division F appropriates FY2026 funds for the Department of State, USAID, and foreign assistance, including $9.36B for State Department operations, $6.16B in Foreign Military Financing with $3.3B grants-only for Israel, $5.88B for PEPFAR, $6.77B for East European democracy programs, bilateral floors for Jordan ($1.65B) and Egypt ($1.43B), and permanently rescinds $900M from prior-year State/Foreign Ops appropriations.",
      "brief": "Foreign Military Financing totals $6.16B with $3.3B grants-only for Israel; PEPFAR receives $5.88B; SEED Act assistance for Ukraine and East Europe receives $6.77B; and $900M in prior-year funds are permanently rescinded.",
      "top_lines": [
        { "headline": "State Department Operations", "subs": ["Administration of Foreign Affairs: $9.36B; Worldwide Security Protection: $3.03B", "Diplomatic policy and support: $1.44B; Harry S Truman Building renovation: $812.8M", "Embassy security construction: $1.2B"] },
        { "headline": "Foreign Military Financing", "subs": ["$6.16B for Foreign Military Financing under the Arms Export Control Act", "$3.3B designated as grants-only for Israel; $900M may be used for Special Defense Acquisition Fund"] },
        { "headline": "Global HIV/AIDS Programs", "subs": ["$5.88B for PEPFAR: prevention, treatment, and control of HIV/AIDS", "Available until September 30, 2030"] },
        { "headline": "Ukraine and East European Democracy", "subs": ["$6.77B for SEED Act assistance; 15% minimum for Ukraine", "$2.175B recommended for democracy programs across USAID, Democracy Fund, and INCLE"] },
        { "headline": "Bilateral Assistance Floors", "subs": ["Jordan: $1.65B minimum; $845.1M minimum for budget support", "Egypt: $1.43B minimum; Israel: $3.3B FMF grants plus additional bilateral assistance"] },
        { "headline": "Multilateral Programs", "subs": ["Global Fund (AIDS/TB/Malaria): $1.25B; IDA (World Bank): $1.07B", "AIIB capital subscription: up to $8.66B; IMF: $7.8B authorized"] },
        { "headline": "America First Opportunity Fund", "subs": ["Up to $850M may be redirected from Peacekeeping, Economic Support Fund, and FMF for 'America First' projects (Sec. 7045)"] },
        { "headline": "Permanent Rescission", "subs": ["$900M permanently rescinded from prior-year State and Foreign Operations appropriations (Sec. 7006)"] }
      ],
      "sections": [
        {
          "label": "Title I — Department of State and Related Programs",
          "items": [{
            "main": "Appropriates $9.36B for Administration of Foreign Affairs including Worldwide Security Protection ($3.03B), embassy operations, the Truman Building renovation ($812.8M), and international broadcasting ($3.99B).",
            "detail": "Diplomatic policy: $1.44B. Embassy security construction: $1.2B. Educational and cultural exchange: $983.3M from consular fees. Permanent rescission of $900M in prior-year State/Foreign Ops funds in Sec. 7006. Public diplomacy and international media: $3.99B.",
            "comments": []
          }]
        },
        {
          "label": "Title III — Bilateral Economic Assistance",
          "items": [{
            "main": "Appropriates $6.77B for SEED Act East European democracy programs, $5.88B for PEPFAR HIV/AIDS, $3.53B for global health, $1.65B minimum for Jordan, and $1.43B minimum for Egypt.",
            "detail": "SEED Act: 15% minimum for Ukraine. Global health: $3.53B in addition to PEPFAR. Jordan: $1.65B minimum, $845.1M minimum budget support. Egypt: $1.43B minimum. Democracy programs: $2.175B recommended across multiple accounts.",
            "comments": []
          }]
        },
        {
          "label": "Title IV — International Security Assistance",
          "items": [{
            "main": "Appropriates $6.16B for Foreign Military Financing; $3.3B designated as grants-only for Israel; $1.4B for International Narcotics Control and Law Enforcement.",
            "detail": "FMF: $6.16B total, $3.3B of which must be grants for Israel. International Narcotics Control: $1.4B for counter-narcotics and rule-of-law programs. IMET and other security assistance within Title IV.",
            "comments": []
          }]
        },
        {
          "label": "Title VII — General Provisions",
          "items": [{
            "main": "Establishes the America First Opportunity Fund (up to $850M transfer authority), permanently rescinds $900M from prior-year funds, and sets conditions on aid to specific countries.",
            "detail": "Sec. 7045: up to $850M from Peacekeeping Operations, ESF, and FMF may be redirected for 'America First' purposes. Sec. 7006: $900M permanent rescission. Country-specific conditions and certifications in Secs. 7029-7071.",
            "comments": []
          }]
        }
      ],
      "underreported": [
        {
          "section": "Sec. 7045 — America First Opportunity Fund",
          "summary": "Allows up to $850M from Peacekeeping Operations, Economic Support Fund, and Foreign Military Financing to be redirected for 'America First' priorities without a specified project list.",
          "why_unreported": "Embedded in general provisions as a transfer authority, the provision allows $850M to be moved away from its appropriated purpose without separate authorization for each reallocation or a defined criteria for 'America First' projects."
        },
        {
          "section": "Sec. 7006 — Permanent Rescission",
          "summary": "Permanently rescinds $900,000,000 from prior-year State and Foreign Operations appropriations previously enacted by Congress.",
          "why_unreported": "A rescission of previously enacted foreign assistance appears as a general provision in Title VII, reducing total foreign assistance authority by $900M beyond the headline appropriation levels without listing the specific accounts affected."
        }
      ],
      "criticisms": [],
      "gaps": [
        "SEED Act assistance provides $6.77B with a 15% Ukraine minimum but specifies no floor for direct Ukrainian government budget support, leaving distribution to State Department discretion.",
        "FMF designates $3.3B in grants for Israel but provides no equivalent minimum floor for any other ally or partner country beyond Jordan and Egypt."
      ],
      "featured_quotes": [],
      "changes": {
        "added": ["America First Opportunity Fund: up to $850M transfer authority from Peacekeeping, ESF, and FMF (Sec. 7045)"],
        "modified": ["FMF Israel grants floor: $3.3B minimum out of $6.16B total", "Jordan assistance floor: $1.65B minimum including $845.1M budget support", "AIIB capital subscription authorized up to $8.66B", "PEPFAR: $5.88B, available until September 30, 2030"],
        "removed": ["$900M permanently rescinded from prior-year State/Foreign Ops (Sec. 7006)"]
      }
    },
    {
      "label": "Division G — Other Matters",
      "divisionKey": "G",
      "summary": "Division G consists of a single provision prohibiting all U.S. funds — from this Act and from prior fiscal years — from being contributed, granted, or paid to UNRWA through March 25, 2027, notwithstanding any other provision of law.",
      "brief": "Bars all U.S. contributions to UNRWA for FY2024, FY2025, FY2026, and FY2027 amounts prior to March 25, 2027, applying the prohibition retroactively to previously appropriated funds.",
      "top_lines": [
        { "headline": "UNRWA Funding Prohibition", "subs": ["No U.S. funds may be contributed to UNRWA for prior fiscal years, FY2026, or FY2027 amounts prior to March 25, 2027", "Prohibition applies notwithstanding any other provision of law; covers all State/Foreign Ops appropriations including supplementals"] }
      ],
      "sections": [
        {
          "label": "Sec. 101 — Funding Limitation",
          "items": [{
            "main": "Prohibits use of any Division F funds or other State/Foreign Ops appropriations for any contribution, grant, or payment to UNRWA for prior fiscal year, FY2026, or FY2027 amounts prior to March 25, 2027.",
            "detail": "The prohibition covers funds from Division F and any other Acts making appropriations for State, foreign operations, and related programs, including supplemental appropriations. It applies retroactively to prior-year funds not yet transferred to UNRWA.",
            "comments": []
          }]
        }
      ],
      "underreported": [],
      "criticisms": [],
      "gaps": ["Division G bars UNRWA contributions but specifies no alternative humanitarian delivery mechanism for Palestinian refugees reliant on UNRWA for food, education, and health services."],
      "featured_quotes": [],
      "changes": {
        "added": [],
        "modified": ["UNRWA prohibition extended to cover FY2027 amounts through March 25, 2027; retroactive application to prior-year unobligated amounts clarified"],
        "removed": []
      }
    },
    {
      "label": "Division H — Further Continuing Appropriations Act, 2026",
      "divisionKey": "H",
      "summary": "Division H retroactively extends the DHS continuing resolution to February 13, 2026, ratifies obligations incurred during a brief lapse in appropriations, authorizes back pay for affected federal employees, and repeals a prior legislative branch provision.",
      "brief": "Extends the DHS CR to February 13, 2026, ratifies the lapse period as covered by the continuing resolution, and provides back pay to employees who continued working or were owed pay during the government shutdown period.",
      "top_lines": [
        { "headline": "DHS CR Extension", "subs": ["CR expiration date amended to February 13, 2026 under Public Law 119-37", "All DHS components funded at FY2025 enacted rates through this date"] },
        { "headline": "Lapse Period Ratification", "subs": ["Sec. 102 treats the lapse period (beginning approximately January 31, 2026) as covered by the CR", "Obligations incurred for essential activities are ratified and approved"] },
        { "headline": "Employee Pay Authorization", "subs": ["Pay, allowances, and benefits during the lapse authorized under 31 U.S.C. § 1341(c)"] }
      ],
      "sections": [
        {
          "label": "Secs. 101–105 — CR Extension and Ratification",
          "items": [{
            "main": "Amends Public Law 119-37 CR expiration to February 13, 2026, ratifies all lapse-period obligations as valid, authorizes employee back pay, and repeals Section 213 of the prior CR.",
            "detail": "Sec. 101: amends date in Sec. 106(3) of Public Law 119-37 to February 13, 2026. Sec. 102: lapse period treated as covered by the CR. Sec. 103: personnel pay authorized under 31 U.S.C. § 1341(c). Sec. 104: obligations for essential activity and orderly termination ratified. Sec. 105: repeals Section 213 of the prior CR affecting legislative branch operations.",
            "comments": []
          }]
        }
      ],
      "underreported": [],
      "criticisms": [],
      "gaps": ["Division H extends DHS funding only through February 13, 2026, and does not provide full-year appropriations for DHS, leaving border security and immigration enforcement funding subject to another deadline."],
      "featured_quotes": [],
      "changes": {
        "added": [],
        "modified": ["CR expiration date extended to February 13, 2026", "Section 213 of the prior CR repealed"],
        "removed": []
      }
    },
    {
      "label": "Division I — Authorizing Extenders and Technical Corrections",
      "divisionKey": "I",
      "summary": "Division I extends 20 expiring authorizations through 2026 or later, including the National Flood Insurance Program (retroactively to January 30, 2026), E-Verify, AGOA, the Haiti HELP Act, the U.S. Parole Commission (to January 30, 2031), multiple cybersecurity authorities, and immigration programs, while making the sex offense special assessment permanent and exempting all Division I and J costs from PAYGO scoring.",
      "brief": "Extends the National Flood Insurance Program and 19 other expiring authorities, makes the sex offense special assessment permanent, and exempts all Division J health extender costs from PAYGO budget scoring.",
      "top_lines": [
        { "headline": "National Flood Insurance Program", "subs": ["Extended to September 30, 2026; effective retroactively to January 30, 2026 if enacted after that date", "Both financing authority (42 U.S.C. 4016(a)) and program expiration (42 U.S.C. 4026) amended"] },
        { "headline": "Trade Program Extensions", "subs": ["AGOA extended to December 31, 2026; retroactive for entries made after September 30, 2025", "Haiti HELP Act extended to December 31, 2026 with retroactive application; customs user fees extended to December 31, 2031"] },
        { "headline": "Immigration Authority Extensions", "subs": ["E-Verify: September 30, 2026; Non-minister Religious Workers visas: September 30, 2026", "Rural Healthcare Workers immigration exception: September 30, 2026; H-2B returning worker exemption authorized for FY2026"] },
        { "headline": "Cybersecurity Extensions", "subs": ["NCPS, Cybersecurity Information Sharing Act, and State/Local Cybersecurity Grant Program extended to September 30, 2026"] },
        { "headline": "Justice and Government Operations", "subs": ["U.S. Parole Commission extended to January 30, 2031; sex offense special assessment made permanent (expiration date removed)", "Sentencing Commission must promulgate drone-related sentencing guidelines by December 31, 2026"] },
        { "headline": "PAYGO Exemption", "subs": ["All budgetary effects of Divisions I and J excluded from statutory PAYGO and Senate PAYGO scorecards (Sec. 5021)", "Costs of all Division J health extenders require no offsetting savings"] }
      ],
      "sections": [
        {
          "label": "Secs. 5001–5003 — Agriculture and Commodity Extenders",
          "items": [{
            "main": "Extends U.S. Grain Standards Act through September 30, 2026, CFTC Whistleblower Program through September 30, 2026, and Forest Service ACES Program through October 1, 2026.",
            "detail": "Grain Standards: Secs. 7(j)(5), 7A(l)(4), 21(e) amended. CFTC Whistleblower: Public Law 117-25 paragraphs (3) and (4) amended. Forest Service ACES: Agricultural Act of 2014 Sec. 8302(b) amended to October 1, 2026.",
            "comments": []
          }]
        },
        {
          "label": "Secs. 5004–5009 — Homeland Security and Cybersecurity Extenders",
          "items": [{
            "main": "Extends NFIP through September 30, 2026 (retroactive to January 30, 2026), TSA Reimbursable Screening through 2026, Motor Carrier Safety Advisory Committee through September 30, 2026, and three cybersecurity authorities.",
            "detail": "NFIP: 42 U.S.C. 4016(a) and 42 U.S.C. 4026 both amended; retroactive effective date applies if Act enacted after January 30, 2026. Cybersecurity: NCPS (6 U.S.C. 1525(a)), CISA Act (6 U.S.C. 1510(a)), State/Local Grant (6 U.S.C. 665g(s)(1)) each extended one year.",
            "comments": []
          }]
        },
        {
          "label": "Secs. 5010–5018 — Government Operations and Justice Extenders",
          "items": [{
            "main": "Extends Technology Modernization Fund through September 30, 2026, Parole Commission to January 30, 2031, makes sex offense special assessment permanent, and modifies bankruptcy fee provisions.",
            "detail": "Technology Modernization Fund: 40 U.S.C. 11301 note amended. Parole Commission: 18 U.S.C. 3551 note extended to January 30, 2031. Sex offense assessment: 18 U.S.C. 3014(a) expiration date removed — now permanent. Sentencing Commission: drone guidelines due December 31, 2026.",
            "comments": []
          }]
        },
        {
          "label": "Secs. 5019–5021 — Trade Extenders and PAYGO Exemption",
          "items": [{
            "main": "Extends AGOA and Haiti HELP Act to December 31, 2026 with retroactive application, and exempts all Division I and J budgetary costs from both PAYGO scorecards.",
            "detail": "AGOA: Trade Act Sec. 506B and AGOA Sec. 112(g) each amended to December 31, 2026; retroactive liquidation of entries after September 30, 2025 allowed within 180 days. Haiti HELP: extended to December 31, 2026. Sec. 5021: excludes I and J effects from statutory PAYGO, Senate PAYGO, and CBO allocation scoring.",
            "comments": []
          }]
        }
      ],
      "underreported": [
        {
          "section": "Sec. 5012 — Sex Offense Special Assessment Made Permanent",
          "summary": "Section 3014(a) of title 18 is amended to remove the September 30, 2025 expiration date from the special assessment on nonindigent persons convicted of federal sex offenses and human trafficking — converting it to a permanent statutory fee with no future reauthorization required.",
          "why_unreported": "The provision is drafted as a deletion of a termination clause rather than a new program creation. Its effect — making a previously temporary assessment permanent — is not indicated in the section heading."
        },
        {
          "section": "Sec. 5021 — PAYGO Exemption Covers All Division J Health Spending",
          "summary": "Exempts all budgetary costs of Divisions I and J from PAYGO — covering the Medicare Improvement Fund increase, new MCED coverage, TANF extension, and all health extender spending — without requiring any offsetting savings.",
          "why_unreported": "Located in Division I, this provision determines the fiscal treatment of all Division J spending. Readers reviewing Division J health extenders find no indication that the costs require no budget offsets — the disclosure appears only in Division I."
        }
      ],
      "criticisms": [],
      "gaps": [
        "NFIP is extended through September 30, 2026 but the division does not address the program's actuarial deficit, flood map update requirements, or premium rate structure.",
        "H-2B supplemental visa authority is granted for FY2026 at the Secretary's discretion with no numerical cap specified in the bill text."
      ],
      "featured_quotes": [],
      "changes": {
        "added": [],
        "modified": [
          "NFIP extended to September 30, 2026 (retroactive to January 30, 2026)",
          "AGOA extended to December 31, 2026 with retroactive application",
          "Haiti HELP Act extended to December 31, 2026",
          "Parole Commission extended to January 30, 2031",
          "E-Verify extended to September 30, 2026",
          "Non-minister Religious Workers extended to September 30, 2026",
          "H-2B returning worker exemption authorized for FY2026",
          "Cybersecurity authorities (NCPS, CISA, State/Local Grant) extended to September 30, 2026",
          "Technology Modernization Fund extended to September 30, 2026",
          "CFTC Whistleblower Program extended to September 30, 2026"
        ],
        "removed": ["Expiration date removed from 18 U.S.C. § 3014 sex offense special assessment — making it permanent"]
      }
    },
    {
      "label": "Division J — Health Care Extenders",
      "divisionKey": "J",
      "summary": "Division J extends and modifies Medicare, Medicaid, and public health programs, adding new Medicare coverage for multi-cancer early detection tests, extending telehealth flexibilities and hospital payment adjustments, increasing the Medicare Improvement Fund from $1.403B to $2.062B, extending TANF through December 31, 2026, adding PBM accountability requirements, and establishing an Abraham Accords Office within the FDA.",
      "brief": "Adds Medicare coverage for multi-cancer early detection tests, extends telehealth and dozens of expiring Medicare payment policies, increases the Medicare Improvement Fund by $659M, and creates an FDA office for Abraham Accords implementation.",
      "top_lines": [
        { "headline": "New Medicare Coverage", "subs": ["Sec. 6221: Multi-cancer early detection (MCED) tests added as a Medicare covered benefit under Social Security Act Section 1861", "Sec. 6222: External infusion pumps and non-self-administrable home infusion drugs added as covered Part D items", "Sec. 6217: Oral antiviral drugs extended as covered Part D drugs"] },
        { "headline": "Medicare Payment Extensions", "subs": ["Low-volume hospital add-on extended (Sec. 6201); Medicare-Dependent Hospital program extended (Sec. 6202)", "Ambulance add-on payments extended (Sec. 6203); APM incentive payments extended (Sec. 6204)", "Work geographic index floor extended (Sec. 6208); Medicare sequestration adjustments (Sec. 6227)"] },
        { "headline": "Telehealth Flexibilities", "subs": ["Medicare telehealth flexibilities extended (Sec. 6209); Acute Hospital Care at Home waiver extended (Sec. 6210)", "In-home cardiopulmonary rehabilitation flexibility added (Sec. 6211)"] },
        { "headline": "Medicare Improvement Fund", "subs": ["Sec. 6228: increased from $1,403,000,000 to $2,062,000,000 — a net increase of $659M"] },
        { "headline": "Medicaid Modifications", "subs": ["Sec. 6102: Age restrictions removed for working adults with disabilities seeking Medicaid eligibility", "Sec. 6101: Streamlined enrollment for out-of-state Medicaid and CHIP providers", "Sec. 6103: Military family residency rules standardized for Medicaid coverage"] },
        { "headline": "TANF and Human Services", "subs": ["Sec. 6304: TANF extended through December 31, 2026", "Secs. 6301-6302: Sexual risk avoidance and personal responsibility education programs extended", "Sec. 6303: Family-to-family health information centers extended"] },
        { "headline": "Community Health and Diabetes", "subs": ["Sec. 6401: Community Health Centers, NHSC, and Teaching Health Centers extended", "Sec. 6402: Special Diabetes Programs extended; $350M for FY2026", "Sec. 6404: No Surprises Act implementation: $188M appropriated for FY2026"] },
        { "headline": "Pharmacy Benefit Managers", "subs": ["Sec. 6224: PBM accountability (MEPA) — fiduciary duties, spread pricing restrictions, and reporting mandates", "Sec. 6701: PBM oversight; Sec. 6703: Transparency in generic drug applications"] },
        { "headline": "FDA and Drug Policy", "subs": ["Sec. 6604: Rare Pediatric Disease priority review voucher program extended", "Sec. 6611: Abraham Accords Office established within the FDA", "Sec. 6605: Orphan drug exclusivity limitations modified to prevent dual-use abuse"] }
      ],
      "sections": [
        {
          "label": "Title I — Medicaid",
          "items": [{
            "main": "Streamlines multi-state provider enrollment (Sec. 6101), removes age restrictions for working disabled adults (Sec. 6102), standardizes military family Medicaid coverage (Sec. 6103), and modifies DSH allotments (Secs. 6105-6106).",
            "detail": "Sec. 6101: out-of-state providers use streamlined enrollment without duplicating in-state requirements. Sec. 6102: removes age cap for working adults with disabilities. Sec. 6103: military relocation cannot cause Medicaid coverage loss. DSH modifications in Secs. 6105-6106 adjust hospital payment calculations.",
            "comments": []
          }]
        },
        {
          "label": "Title II — Medicare",
          "items": [{
            "main": "Extends low-volume hospital payments, Medicare-Dependent Hospital program, ambulance add-ons, APM incentives, telehealth, and hospital-at-home; adds MCED screening and infusion pump coverage; and increases the Medicare Improvement Fund from $1.403B to $2.062B.",
            "detail": "Telehealth (Sec. 6209) continues COVID-19 era flexibilities. Acute Hospital Care at Home (Sec. 6210) extends CMS waiver for hospital-level home care. MCED (Sec. 6221) amends Section 1861 of the Social Security Act. PBM accountability (Sec. 6224): fiduciary requirements and spread pricing restrictions for Part D PBMs.",
            "comments": []
          }]
        },
        {
          "label": "Title III — Human Services",
          "items": [{
            "main": "Extends TANF through December 31, 2026 (Sec. 6304), sexual risk avoidance and personal responsibility education programs (Secs. 6301-6302), and family-to-family health information centers (Sec. 6303).",
            "detail": "TANF extension: 'such sums as may be necessary' appropriation language; continues FY2025 program terms. Sexual risk avoidance and personal responsibility education extended under the same mechanism — no new conditions added.",
            "comments": []
          }]
        },
        {
          "label": "Title IV — Public Health and Other Extenders",
          "items": [{
            "main": "Extends community health centers, NHSC, and teaching health center GME programs (Sec. 6401); Special Diabetes Programs at $350M for FY2026 (Sec. 6402); and appropriates $188M for No Surprises Act implementation (Sec. 6404).",
            "detail": "Community health centers: continued funding through extension period. Special Diabetes Programs: $350M for type 1 and type 2 programs. No Surprises Act (Sec. 6404): $188M to CMS Program Management Account, available until expended, for independent dispute resolution and consumer protection administration.",
            "comments": []
          }]
        },
        {
          "label": "Title VI — Food and Drug Administration",
          "items": [{
            "main": "Extends rare pediatric disease priority review vouchers (Sec. 6604), modifies orphan drug exclusivity (Sec. 6605), and establishes an Abraham Accords Office within the FDA (Sec. 6611).",
            "detail": "Sec. 6604: rare pediatric disease voucher program extended. Sec. 6605: limits 30-month orphan drug exclusivity to prevent dual-use abuse. Sec. 6611: new FDA office for Abraham Accords implementation including regulatory cooperation with Israel and signatory states on pharmaceutical approvals.",
            "comments": []
          }]
        },
        {
          "label": "Title VII — Lowering Prescription Drug Costs",
          "items": [{
            "main": "Adds PBM oversight requirements (Sec. 6701), remittance transparency rules (Sec. 6702), and generic drug application transparency (Sec. 6703).",
            "detail": "Sec. 6701: PBMs providing Medicare Part D services must comply with new reporting and oversight requirements. Sec. 6702: PBM remittance and pass-through structures in drug pricing made transparent. Sec. 6703: generic drug application transparency reduces barriers to market entry.",
            "comments": []
          }]
        }
      ],
      "underreported": [
        {
          "section": "Sec. 6611 — Abraham Accords Office within FDA",
          "summary": "Creates a permanent new office within the Food and Drug Administration designated specifically for implementing the Abraham Accords — diplomatic normalization agreements between Israel and Arab states — including pharmaceutical regulatory cooperation.",
          "why_unreported": "The FDA is a public health regulatory agency; creating an office within it for diplomatic implementation of a foreign policy agreement is a novel use of the agency's structure. The section appears in a Title VI FDA heading alongside drug review provisions with no indication of its diplomatic function."
        },
        {
          "section": "Sec. 6219 — Part D Cost-Sharing Adjustments",
          "summary": "Modifies cost-sharing reduction schedules for low-income Medicare Part D beneficiaries, adjusting subsidy amounts originally established by the Inflation Reduction Act's drug pricing provisions.",
          "why_unreported": "Titled as an 'adjustment,' the provision modifies IRA-created Part D subsidy schedules for low-income enrollees. The connection to the Inflation Reduction Act's drug pricing architecture is not indicated in the section title."
        },
        {
          "section": "Sec. 5021 (Division I) — PAYGO Exemption Covers All Division J Costs",
          "summary": "All new Medicare and Medicaid spending in Division J is exempted from PAYGO offset requirements by Sec. 5021 of Division I — meaning the Medicare Improvement Fund increase, MCED coverage, and all other health extender costs require no offsets.",
          "why_unreported": "The exemption is in Division I. Readers reviewing Division J health extenders find no indication in Division J that the costs require no budget offsets — the disclosure appears only in the prior division."
        }
      ],
      "criticisms": [],
      "gaps": [
        "Telehealth flexibilities are extended (Sec. 6209) but not made permanent, requiring future legislative action at the next expiration.",
        "Sec. 6221 adds MCED screening to Medicare coverage but specifies no effective date, reimbursement rate, or coverage criteria — leaving all implementation to CMS rulemaking.",
        "PBM accountability requirements (Sec. 6224) apply to Medicare Part D PBMs but do not address commercial insurance or Medicaid PBMs, which operate under separate regulatory frameworks."
      ],
      "featured_quotes": [],
      "changes": {
        "added": [
          "Medicare coverage for multi-cancer early detection (MCED) screening tests (Sec. 6221)",
          "Medicare coverage for external infusion pumps and non-self-administrable home infusion drugs (Sec. 6222)",
          "Abraham Accords Office established within the FDA (Sec. 6611)",
          "In-home cardiopulmonary rehabilitation flexibility for Medicare beneficiaries (Sec. 6211)"
        ],
        "modified": [
          "Medicare Improvement Fund: $1,403,000,000 increased to $2,062,000,000 (Sec. 6228)",
          "Rare Pediatric Disease priority review voucher program extended (Sec. 6604)",
          "APM incentive payments extended (Sec. 6204); telehealth extended (Sec. 6209); hospital-at-home extended (Sec. 6210)",
          "Special Diabetes Programs extended at $350M for FY2026 (Sec. 6402)",
          "TANF extended through December 31, 2026 (Sec. 6304)",
          "DSH allotments modified (Secs. 6105-6106); Part D cost-sharing for low-income adjusted (Sec. 6219)",
          "PBM accountability requirements added to Medicare Part D (Secs. 6224, 6701)",
          "Orphan drug exclusivity limitations modified (Sec. 6605)"
        ],
        "removed": ["Age restrictions for working adults with disabilities removed from Medicaid eligibility (Sec. 6102)"]
      }
    }
  ]
};

// Write to temp file
const outPath = path.join(__dirname, '../data/hr7148_analysis_draft.json');
fs.writeFileSync(outPath, JSON.stringify(entry, null, 2), 'utf8');
console.log('Written to:', outPath);
console.log('Size:', JSON.stringify(entry).length.toLocaleString(), 'chars');
console.log('Divisions:', entry.divisions.map(d => d.divisionKey).join(', '));

// Validate
try {
  JSON.parse(fs.readFileSync(outPath, 'utf8'));
  console.log('JSON is valid');
} catch(e) {
  console.log('JSON INVALID:', e.message);
}
