const fs = require('fs');
const path = require('path');

const cache = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cache.json'), 'utf8'));

const newBills = [
  {
    id: '119-HR-2815',
    title: 'Cape Fox Land Entitlement Finalization Act of 2025',
    official_title: 'An Act to provide equitable treatment for the people of the Village Corporation established for the Native Village of Saxman, Alaska, and for other purposes.',
    code: 'HR.2815',
    date: 'May 19, 2026',
    stageDate: 'May 19, 2026',
    version: 'v1.0',
    stage: 'signed',
    stageLabel: 'Signed into Law',
    currentStep: 4,
    pipeline: ['Introduced','Committee','Passed House','Passed Senate','Signed'],
    sponsor: 'Rep. Begich, Nicholas J. (R-AK)',
    sponsor_bioguide: 'B001323',
    cosponsors: 0,
    pages: null,
    analyzed: true,
    live: false,
    demo: false,
    summary: 'The Cape Fox Corporation, an Alaska Native village corporation for the village of Saxman, Alaska, is allowed to select approximately 180 acres of Tongass National Forest land instead of a previously required 185-acre township parcel, satisfying its remaining entitlement under the Alaska Native Claims Settlement Act. The subsurface estate of the conveyed land goes to Sealaska Corporation, and a public access easement is reserved.',
    brief: 'Allows Cape Fox Corporation to fulfill its Alaska Native land entitlement by selecting 180 acres in Tongass National Forest rather than the originally required township parcel.',
    top_lines: [
      {
        headline: 'Land Selection Change',
        subs: [
          'Cape Fox may select approximately 180 acres in Tongass National Forest instead of ~185 acres in the Saxman township',
          'Cape Fox has 90 days from enactment to submit written notice of selection to the Secretary of the Interior'
        ]
      },
      {
        headline: 'Conveyance Deadlines',
        subs: [
          'Interior must convey surface estate to Cape Fox within 180 days of receiving the selection notice',
          'Subsurface estate of the same land conveyed simultaneously to Sealaska Corporation'
        ]
      },
      {
        headline: 'Public Access Preserved',
        subs: [
          'Easement reserved under ANCSA Section 17(b) to allow public access to National Forest land via George Inlet on Revillagigedo Island'
        ]
      }
    ],
    likelihood: 100,
    likelihoodReason: 'Signed into law on May 19, 2026 as Public Law 119-93. Passed the House on December 15, 2025 and the Senate on February 26, 2026.',
    sections: [
      {
        label: 'Section 3 — Waiver of Core Township Requirement',
        items: [
          {
            main: 'Removes the obligation for Cape Fox to select or receive conveyance of approximately 185 acres located within the township containing the Native Village of Saxman.',
            detail: 'The waiver overrides the core township selection requirement in Section 16(b) of ANCSA (43 U.S.C. 1615(b)). The specific parcels waived are approximately 40 acres in T. 74 S., R.90 E., sec. 10, and approximately 144.57 acres in T. 75 S., R.91 E., sec. 1.',
            comments: []
          }
        ]
      },
      {
        label: 'Section 4 — Selection Outside Exterior Selection Boundary',
        items: [
          {
            main: 'Cape Fox may select approximately 180 acres of surface land in Tongass National Forest and receive conveyance upon submitting written notice within 90 days of enactment.',
            detail: "Interior must convey the surface estate to Cape Fox and, simultaneously, convey the subsurface estate to Sealaska Corporation. Congress intends completion within 180 days of receiving the selection notice. The conveyance fulfills both Cape Fox's Section 16 ANCSA entitlement and Sealaska's subsurface entitlement under Section 14(f).",
            comments: []
          }
        ]
      },
      {
        label: 'Section 5 — Public Access Easement',
        items: [
          {
            main: 'The conveyance of federal land to Cape Fox is subject to a public easement under ANCSA Section 17(b) allowing access to inland National Forest land from George Inlet.',
            detail: "The easement runs with the land and is reserved regardless of Cape Fox's ownership. It preserves public ingress and egress to National Forest System land further inland on Revillagigedo Island.",
            comments: []
          }
        ]
      }
    ],
    underreported: [
      {
        section: 'Section 4(d)',
        summary: "The conveyance to both Cape Fox and Sealaska Corporation is deemed to fulfill their respective entitlements under ANCSA in full — Cape Fox under Section 16 and Sealaska under Section 14(f). No further land claims by either entity against the federal government remain after this transaction.",
        why_unreported: "The bill title and summary focus on Cape Fox's selection flexibility, but the simultaneous full discharge of both corporations' outstanding ANCSA entitlements is a separate legal consequence not apparent from the bill's name."
      }
    ],
    criticisms: [],
    gaps: [
      "The bill does not specify what happens to Cape Fox's entitlement if no written selection notice is submitted within the 90-day window.",
      "The bill conveys the subsurface estate to Sealaska upon Cape Fox surface conveyance but does not address the disposition of existing mineral rights or subsurface claims at the time of conveyance.",
      "Section 6 subjects the conveyances to valid existing rights but does not require Interior to disclose known third-party claims to Cape Fox prior to the selection deadline."
    ],
    featured_quotes: [],
    changes: {
      added: [
        'Cape Fox authority to select approximately 180 acres of Tongass National Forest land outside its current exterior selection boundary',
        'Obligation for Interior to convey the subsurface estate of the selected land to Sealaska Corporation upon surface conveyance to Cape Fox'
      ],
      modified: [
        "Cape Fox land entitlement fulfillment mechanism — from required core township selection (~185 acres) to Tongass National Forest parcel selection (~180 acres)"
      ],
      removed: [
        "Core township selection requirement for Cape Fox's remaining ANCSA land entitlement under Section 16(b) (43 U.S.C. 1615(b))"
      ]
    },
    budget_accounts: {}
  },
  {
    id: '119-HR-2066',
    title: 'Investing in All of America Act of 2025',
    official_title: 'An Act to amend the Small Business Investment Act of 1958 to exclude from the limit on leverage certain amounts invested in smaller enterprises located in rural or low-income areas and small businesses in critical technology areas, and for other purposes.',
    code: 'HR.2066',
    date: 'May 19, 2026',
    stageDate: 'May 19, 2026',
    version: 'v1.0',
    stage: 'signed',
    stageLabel: 'Signed into Law',
    currentStep: 4,
    pipeline: ['Introduced','Committee','Passed House','Passed Senate','Signed'],
    sponsor: 'Rep. Meuser, Daniel (R-PA-9)',
    sponsor_bioguide: 'M001204',
    cosponsors: 8,
    pages: null,
    analyzed: true,
    live: false,
    demo: false,
    summary: "Reduces the maximum leverage an SBIC can obtain from the SBA from 300% to 200% of its private capital, while adding a new exclusion from the leverage calculation for investments in rural areas, covered technology categories, or small manufacturers — up to the lesser of 50% of private capital or $125,000,000. Also expands what counts as private capital to include college and university endowments and foundations.",
    brief: "Lowers the SBIC leverage ceiling from 300% to 200% of private capital and creates a new $125,000,000 exclusion for investments in rural areas, critical technologies, and small manufacturers.",
    top_lines: [
      {
        headline: 'Leverage Cap Reduced',
        subs: [
          'Individual SBIC leverage ceiling reduced from 300% to 200% of private capital',
          'Dollar cap for quarterly/semiannual interest-paying SBICs: $250,000,000; all other SBICs: $175,000,000'
        ]
      },
      {
        headline: 'Common Control Limits',
        subs: [
          'Commonly controlled SBICs making quarterly/semiannual payments: $475,000,000 aggregate cap',
          'All other commonly controlled SBICs: $350,000,000 aggregate cap'
        ]
      },
      {
        headline: 'Rural and Technology Investment Exclusion',
        subs: [
          'Investments in rural areas, covered technology categories (10 U.S.C. 149(e)), or small manufacturers excluded from leverage calculation',
          "Exclusion capped at lesser of 50% of the SBIC's private capital or $125,000,000",
          'Only investments made after the date of enactment qualify for the exclusion'
        ]
      },
      {
        headline: 'Private Capital Definition Expanded',
        subs: [
          'Funds from college or university foundations, endowments, and trusts now qualify as private capital',
          'New explicit exclusion for funds obtained directly or indirectly from government sources (with exceptions for pension plans and college/university trusts)'
        ]
      }
    ],
    likelihood: 100,
    likelihoodReason: 'Signed into law on May 19, 2026 as Public Law 119-92. Passed the House on December 1, 2025 and the Senate on April 15, 2026.',
    sections: [
      {
        label: 'Section 2 — Small Business Investment Company Maximum Leverage Exclusion',
        items: [
          {
            main: 'Reduces individual SBIC leverage ceilings and restructures dollar caps by company type.',
            detail: 'Individual caps become 200% of private capital, not to exceed $250,000,000 for quarterly/semiannual interest payers or $175,000,000 for other companies. Commonly controlled caps become $475,000,000 or $350,000,000 respectively. A new subparagraph (C) explicitly excludes government-sourced funds from the private capital definition.',
            comments: []
          },
          {
            main: 'Creates a new exclusion from the outstanding leverage calculation for investments in rural areas, covered technology categories, or small manufacturers.',
            detail: 'The exclusion is capped at the lesser of 50% of the SBIC\'s private capital or $125,000,000. Only investments made after enactment qualify. Rural areas are defined under 7 U.S.C. 1991(a)(13); covered technology categories under 10 U.S.C. 149(e); small manufacturers under Section 501(e)(6) of the Small Business Investment Act.',
            comments: []
          }
        ]
      }
    ],
    underreported: [
      {
        section: 'Section 2(a)(3)',
        summary: 'A new subparagraph (C) added to the private capital definition explicitly excludes any funds obtained directly or indirectly from any federal, state, or local government or government agency, with limited exceptions for pension plan funds and college/university trust/endowment funds.',
        why_unreported: "The bill is framed as expanding private capital to include university endowments, but Section 2(a)(3) simultaneously adds a government-funds exclusion that could disqualify capital sources previously counted under the prior definition's silence on the issue."
      }
    ],
    criticisms: [],
    gaps: [
      'The bill expands the exclusion to cover investments in "covered technology categories" as defined in 10 U.S.C. 149(e) but does not reproduce that definition, requiring SBICs and SBA to cross-reference a separate statute.',
      'The bill caps the combined exclusion at the lesser of 50% of private capital or $125,000,000 but does not specify how to allocate the cap if an SBIC invests across multiple qualifying categories simultaneously.',
      'The bill reduces the individual leverage ceiling from 300% to 200% but does not address transition treatment for SBICs currently leveraged between 200% and 300% of private capital.'
    ],
    featured_quotes: [],
    changes: {
      added: [
        'New investment exclusion from leverage calculation for SBIC investments in rural areas, covered technology categories, or small manufacturers — up to lesser of 50% of private capital or $125,000,000',
        'New government-funds exclusion from private capital definition (new subparagraph C to Section 103(9))'
      ],
      modified: [
        'Individual SBIC leverage ceiling — from 300% to 200% of private capital',
        'Dollar cap for commonly controlled quarterly/semiannual-paying SBICs — from $350,000,000 to $475,000,000',
        'Private capital definition — expanded to include college/university foundation, endowment, or trust'
      ],
      removed: []
    },
    budget_accounts: {}
  },
  {
    id: '119-HR-972',
    title: 'Sloan Canyon Conservation and Lateral Pipeline Act',
    official_title: 'An Act to amend the Sloan Canyon National Conservation Area Act to adjust the boundary of the Sloan Canyon National Conservation Area, and for other purposes.',
    code: 'HR.972',
    date: 'May 19, 2026',
    stageDate: 'May 19, 2026',
    version: 'v1.0',
    stage: 'signed',
    stageLabel: 'Signed into Law',
    currentStep: 4,
    pipeline: ['Introduced','Committee','Passed House','Passed Senate','Signed'],
    sponsor: 'Rep. Titus, Dina (D-NV-1)',
    sponsor_bioguide: 'T000468',
    cosponsors: 0,
    pages: null,
    analyzed: true,
    live: false,
    demo: false,
    summary: 'Expands the Sloan Canyon National Conservation Area in Clark County, Nevada from 48,438 to 57,728 acres and grants the Southern Nevada Water Authority mandatory rights-of-way through BLM land at no charge to construct and operate a water transmission pipeline, with BLM required to complete the rights-of-way grant within one year of enactment.',
    brief: 'Adds 9,290 acres to Sloan Canyon National Conservation Area and requires BLM to grant the Southern Nevada Water Authority free pipeline rights-of-way within one year.',
    top_lines: [
      {
        headline: 'Conservation Area Expansion',
        subs: [
          'Boundary increases from 48,438 to 57,728 acres, adding approximately 9,290 acres',
          'Expansion subject to valid existing rights and does not restrict authorized activities within existing utility corridors'
        ]
      },
      {
        headline: 'Pipeline Rights-of-Way',
        subs: [
          'BLM must grant SNWA temporary and permanent water pipeline, powerline, facility, and access road rights-of-way within 1 year at no charge',
          'Pipeline may not be routed through or under any designated wilderness area',
          'Construction may not permanently adversely affect conservation area surface resources'
        ]
      },
      {
        headline: 'Excavation and Disposal',
        subs: [
          'SNWA may excavate and dispose of sand, gravel, minerals, and other materials from pipeline tunneling without payment',
          'BLM must identify federal disposal sites via MOU with SNWA within 30 days of granting rights-of-way'
        ]
      }
    ],
    likelihood: 100,
    likelihoodReason: 'Signed into law on May 19, 2026 as Public Law 119-91. Passed the House on December 15, 2025 and the Senate on February 26, 2026.',
    sections: [
      {
        label: 'Section 3 — Sloan Canyon National Conservation Area Boundary Adjustment',
        items: [
          {
            main: 'Expands the conservation area boundary from 48,438 to 57,728 acres by updating the reference map to one dated May 20, 2024.',
            detail: 'The expansion is subject to valid existing rights, including utility transmission corridor designations and right-of-way grants approved before enactment. The expansion does not modify the existing management framework of the conservation area.',
            comments: []
          },
          {
            main: 'Requires BLM to grant SNWA mandatory rights-of-way for the Horizon Lateral Pipeline through the conservation area and adjacent BLM land within 1 year at no charge.',
            detail: "Rights-of-way cover temporary and permanent water pipeline, powerline, facility, and access road routes. SNWA may excavate and dispose of tunneling materials without consideration. BLM must enter a disposal MOU with SNWA within 30 days of granting rights-of-way. The Secretary may impose conditions necessary to protect conservation area resources under FLPMA Section 505.",
            comments: []
          }
        ]
      }
    ],
    underreported: [
      {
        section: 'Section 3(c)(2)(B)',
        summary: "The boundary expansion does not prevent the Secretary from authorizing new utility facility rights-of-way within existing designated transportation and utility corridors inside the newly protected land, subject to NEPA review.",
        why_unreported: "The bill expands the conservation area boundary, which typically restricts new development, but Section 3(c)(2)(B) explicitly preserves the Secretary's authority to authorize new utility infrastructure within existing corridors inside the expanded boundary."
      }
    ],
    criticisms: [],
    gaps: [
      "The bill requires rights-of-way 'not subject to the payment of rents or other charges' but does not address long-term maintenance obligations or liability allocation between BLM and SNWA once the pipeline is operational.",
      'The bill defines the expansion using a map dated May 20, 2024 but does not specify which document controls if the map and the stated acreage figure of 57,728 acres are inconsistent.',
      'The bill requires BLM to grant rights-of-way within 1 year but does not specify a remedy if BLM fails to meet the deadline.'
    ],
    featured_quotes: [],
    changes: {
      added: [
        'Horizon Lateral Pipeline rights-of-way for SNWA through and adjacent to the conservation area, including temporary and permanent water pipeline, powerline, facility, and access road routes',
        'SNWA authority to excavate and dispose of tunneling materials from federal land without payment',
        'BLM obligation to enter into a disposal MOU with SNWA within 30 days of granting rights-of-way'
      ],
      modified: [
        'Sloan Canyon National Conservation Area boundary — from 48,438 to 57,728 acres, updated to the May 20, 2024 reference map'
      ],
      removed: []
    },
    budget_accounts: {}
  },
  {
    id: '119-S-1020',
    title: 'A bill to require the Federal Energy Regulatory Commission to extend the time period during which licensees are required to commence construction of certain hydropower projects.',
    official_title: 'An Act to require the Federal Energy Regulatory Commission to extend the time period during which licensees are required to commence construction of certain hydropower projects.',
    code: 'S.1020',
    date: 'May 11, 2026',
    stageDate: 'May 11, 2026',
    version: 'v1.0',
    stage: 'signed',
    stageLabel: 'Signed into Law',
    currentStep: 4,
    pipeline: ['Introduced','Committee','Passed Senate','Passed House','Signed'],
    sponsor: 'Sen. Daines, Steve (R-MT)',
    sponsor_bioguide: 'D000618',
    cosponsors: 7,
    pages: null,
    analyzed: true,
    live: false,
    demo: false,
    summary: 'Gives FERC authority to grant hydropower project licensees up to 6 additional years to begin construction, beyond the existing 8-year extension allowed under the Federal Power Act, for projects that received their license before March 13, 2020. FERC may also retroactively reinstate licenses that expired after December 31, 2023 and before enactment.',
    brief: 'Extends available FERC hydropower construction deadlines by up to 6 additional years for pre-2020 licensed projects and allows reinstatement of licenses that lapsed after January 1, 2024.',
    top_lines: [
      {
        headline: 'Construction Deadline Extension',
        subs: [
          'Up to 6 additional years beyond the existing 8-year Federal Power Act extension for projects licensed before March 13, 2020',
          'Extension structured as no more than 3 consecutive 2-year periods, beginning after the existing maximum extension expires',
          'FERC must provide reasonable notice and good cause must be shown before granting an extension'
        ]
      },
      {
        headline: 'License Reinstatement',
        subs: [
          'FERC may reinstate licenses for covered projects that expired after December 31, 2023 and before enactment, effective retroactively as of the expiration date',
          'Reinstated licenses become eligible for the 6-year extension under this bill'
        ]
      }
    ],
    likelihood: 100,
    likelihoodReason: 'Signed into law on May 11, 2026 as Public Law 119-90. Passed the Senate on July 29, 2025 and the House on April 21, 2026.',
    sections: [
      {
        label: 'Section 1 — Extension of Time to Commence Construction of Certain Hydropower Projects',
        items: [
          {
            main: 'FERC may extend the construction commencement deadline for covered projects (licensed before March 13, 2020) by up to 6 additional years, in no more than 3 consecutive 2-year increments, upon licensee request and for good cause.',
            detail: 'The extension supplements — not replaces — the existing 8-year authority under Section 13 of the Federal Power Act (16 U.S.C. 806). The 6-year period begins only after the current maximum extension is exhausted. FERC must provide reasonable notice before granting an extension.',
            comments: []
          },
          {
            main: 'FERC may reinstate licenses for covered projects whose construction deadlines expired after December 31, 2023 and before enactment, effective as of the expiration date.',
            detail: "Reinstatement is retroactive to the license expiration date, and the new 6-year extension authority under this bill attaches from that date. This applies to licenses that already lapsed under the prior 8-year deadline framework.",
            comments: []
          }
        ]
      }
    ],
    underreported: [
      {
        section: 'Section 1(d)',
        summary: 'FERC may reinstate expired licenses retroactively and grant the new 6-year extension starting from the expiration date. A project whose license lapsed in early 2024 could receive full retroactive reinstatement plus up to 6 years of new construction time.',
        why_unreported: "The bill's title describes a forward-looking deadline extension, but Section 1(d) creates a retroactive reinstatement mechanism that restores federal authorization to projects that had already lost it before enactment."
      }
    ],
    criticisms: [],
    gaps: [
      'The bill requires "good cause shown" for an extension but does not define good cause or establish criteria, leaving the standard entirely to FERC discretion.',
      'The bill applies only to projects licensed before March 13, 2020 but does not explain the significance of that date or address treatment of projects licensed on that date.',
      'The bill does not address whether environmental conditions attached to the original license remain binding during the extended construction period or whether updated environmental reviews are required.'
    ],
    featured_quotes: [],
    changes: {
      added: [
        'FERC authority to grant up to 6 additional years of construction deadline extensions for hydropower projects licensed before March 13, 2020, in no more than 3 consecutive 2-year periods',
        'FERC authority to reinstate expired licenses for covered projects whose deadlines lapsed after December 31, 2023, effective retroactively as of the expiration date'
      ],
      modified: [
        'Maximum construction commencement window for covered projects — from up to 8 years (Federal Power Act Section 13) to up to 14 years total from license issuance'
      ],
      removed: []
    },
    budget_accounts: {}
  },
  {
    id: '119-S-98',
    title: 'Rural Broadband Protection Act of 2025',
    official_title: 'An Act to require the Federal Communications Commission to establish a vetting process for prospective applicants for high-cost universal service program funding.',
    code: 'S.98',
    date: 'May 11, 2026',
    stageDate: 'May 11, 2026',
    version: 'v1.0',
    stage: 'signed',
    stageLabel: 'Signed into Law',
    currentStep: 4,
    pipeline: ['Introduced','Committee','Passed Senate','Passed House','Signed'],
    sponsor: 'Sen. Capito, Shelley Moore (R-WV)',
    sponsor_bioguide: 'C001047',
    cosponsors: 4,
    pages: null,
    analyzed: true,
    live: false,
    demo: false,
    summary: 'Requires the FCC to establish within 180 days a formal vetting process for applicants seeking high-cost universal service fund grants to deploy rural broadband networks. Applicants must document technical, financial, and operational capabilities and submit a business plan; the FCC must evaluate compliance history with other government broadband programs and set a minimum $9,000 per-violation penalty for pre-authorization defaults.',
    brief: 'Mandates FCC applicant vetting for rural broadband funding within 180 days and sets a minimum $9,000 penalty for pre-authorization defaults.',
    top_lines: [
      {
        headline: 'FCC Vetting Rulemaking',
        subs: [
          'FCC must initiate rulemaking within 180 days to establish a vetting process for high-cost universal service fund applicants',
          'Funds may only be awarded to applicants that satisfy standards established in the final rules'
        ]
      },
      {
        headline: 'Application Requirements',
        subs: [
          'Applicants must document technical, financial, and operational capabilities and submit a reasonable business plan',
          'FCC must evaluate proposals against well-established technical and financial standards, including standards from its Digital Opportunity Data Collection orders',
          "FCC must consider each applicant's compliance history with FCC and other government broadband deployment programs"
        ]
      },
      {
        headline: 'Default Penalties',
        subs: [
          'Minimum $9,000 per violation for pre-authorization defaults',
          "Base forfeiture may not fall below 30% of the applicant's total support unless FCC demonstrates the need for lower penalties in a specific instance"
        ]
      }
    ],
    likelihood: 100,
    likelihoodReason: 'Signed into law on May 11, 2026 as Public Law 119-89. Passed the Senate on June 26, 2025 and the House on April 20, 2026.',
    sections: [
      {
        label: 'Section 2 — Vetting Process for Prospective High-Cost Universal Service Fund Applicants',
        items: [
          {
            main: 'Amends Section 254 of the Communications Act of 1934 to require FCC to initiate rulemaking within 180 days establishing a vetting process for high-cost USF applicants.',
            detail: 'Applies to any new high-cost USF funding for broadband deployment, including reverse competitive bidding. Applications submitted after rules are promulgated must meet the new standards. The FCC must evaluate applicants against its Digital Opportunity Data Collection technical standards and against each applicant\'s history of compliance with FCC and other government broadband funding programs.',
            comments: []
          },
          {
            main: "Sets a minimum pre-authorization default penalty of $9,000 per violation, with a base forfeiture floor of 30% of the applicant's total support.",
            detail: 'The FCC may set the base forfeiture below 30% only by demonstrating in writing that lower penalties are warranted in a particular instance. The penalty applies during the evaluation and pre-award phase, before an applicant begins receiving support.',
            comments: []
          }
        ]
      }
    ],
    underreported: [
      {
        section: 'Section 2 (new 254(m)(3)(B)(ii))',
        summary: "The FCC must evaluate applicants against their history of compliance with not only FCC programs but also other government broadband deployment funding programs, including programs administered by USDA and Treasury.",
        why_unreported: 'The bill is framed as FCC vetting, but the compliance history requirement extends to programs run by other federal agencies. An applicant with unresolved compliance issues in a USDA or Treasury broadband program could be disqualified from FCC funding under this provision.'
      }
    ],
    criticisms: [],
    gaps: [
      'The bill requires FCC to initiate rulemaking within 180 days but sets no deadline for completing or finalizing the rulemaking, leaving the vetting process potentially pending indefinitely.',
      'The vetting requirements apply only to applications submitted after rules are promulgated, leaving all pending applications and existing funding commitments outside the new standards.',
      'The bill does not define what constitutes a pre-authorization default or how the $9,000 minimum penalty interacts with existing FCC forfeiture guidelines and statutory caps.'
    ],
    featured_quotes: [],
    changes: {
      added: [
        'FCC obligation to initiate rulemaking within 180 days to establish applicant vetting for high-cost USF broadband funding',
        'Applicant documentation requirements: technical, financial, and operational capability evidence plus a reasonable business plan',
        'Compliance history review requirement covering FCC and other government broadband funding programs',
        'Minimum $9,000 per-violation penalty for pre-authorization defaults with a 30% of total support base forfeiture floor'
      ],
      modified: [
        'High-cost USF award process — funds may only be awarded after applicants satisfy FCC-established vetting standards (applies to new applications after rules are finalized)'
      ],
      removed: []
    },
    budget_accounts: {}
  }
];

// Check for duplicates
const existingIds = new Set(cache.bills.map(b => b.id));
const toAdd = newBills.filter(b => !existingIds.has(b.id));

if (toAdd.length === 0) {
  console.log('All bills already in cache.');
  process.exit(0);
}

cache.bills.push(...toAdd);
cache.generated = new Date().toISOString();

fs.writeFileSync(path.join(__dirname, '../data/cache.json'), JSON.stringify(cache, null, 2));
console.log(`Done. Added ${toAdd.length} bills. Cache now has ${cache.bills.length} total.`);
toAdd.forEach(b => console.log(' +', b.id, '-', b.title.slice(0, 65)));
