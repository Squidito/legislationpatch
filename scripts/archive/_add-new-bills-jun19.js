// One-off: add the 6 substantive new bills discovered in the 2026-06-19 fetch.
// STATUS: APPLIED + committed to main @3787181 (LOCAL, NOT pushed). Untracked working file —
//   kept for provenance; safe to delete or move to scripts/archive/. Re-running is idempotent
//   (replaces the 6 entries in place), but qa-adjudications (S-2 $69.55B sum) + votes are separate.
// Content sourced from data/bill-text/<id>.txt (Zone 1) + crsSummary gap-fill.
// CR endpoint was DOWN during fetch (HTTP 524/520) → no Record excerpts → Zone 2 (quotes/criticisms) = [].
//   CR BACKFILL PENDING: run `node scripts/fetch_bill_cr.js --bill <id>` when the endpoint recovers.
// Pipeline that produced the committed state: this script → qa-source-verify → fetch_vote_data → sitemap → validate.
const fs = require('fs');
const path = require('path');
const cachePath = path.join(__dirname, '..', 'data', 'cache.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

const ANALYZED = '2026-06-19';
const PIPELINE = ['Introduced', 'Committee', 'Passed House', 'Passed Senate', 'Signed'];

const entries = [
  // ───────────────────────────── 119-S-2 ─────────────────────────────
  {
    id: '119-S-2', code: 'S.2', title: 'Secure America Act',
    official_title: 'An Act to provide for reconciliation pursuant to title II of S. Con. Res. 33.',
    date: '2026-06-10', version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4, pipeline: PIPELINE,
    sponsor: 'Sen. Graham, Lindsey (R-SC)', sponsor_bioguide: 'G000359', cosponsors: 0,
    pages: 5, analyzed: true, demo: false, billType: 'appropriation',
    stageDate: '2026-06-10', enactedDate: '2026-06-10',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-98 on June 10, 2026. Moved as a budget reconciliation bill under S. Con. Res. 33, which barred a Senate filibuster and limited amendments; sponsored by Sen. Lindsey Graham (R-SC) and passed by the Republican Senate and House majorities.',
    summary: 'Provides about $69.55B in new funding through fiscal year 2029 to U.S. Customs and Border Protection, Immigration and Customs Enforcement, and the Department of Homeland Security for border security, immigration enforcement, and removal operations. It was enacted as a budget reconciliation bill.',
    brief: 'Appropriates roughly $69.55B to CBP, ICE, and DHS through FY2029 for border security and immigration enforcement.',
    top_lines: [
      { headline: 'Border Patrol and CBP Funding', billSection: '101', subs: [
        '$9.55B to hire, train, and equip Border Patrol agents and support staff',
        '$13.02B for CBP agents carrying out immigration enforcement',
        '$3.45B for border technology, including AI inspection and surveillance systems' ] },
      { headline: 'ICE and Removal Operations', billSection: '202', subs: [
        '$31.08B for ICE personnel, removal transport, IT, and facilities',
        '$7.45B for Homeland Security Investigations, including $108.5M for child-exploitation investigators',
        'At least $350M to arrest released aliens in non-cooperating jurisdictions' ] },
      { headline: 'DHS and State Coordination', billSection: '104', subs: [
        '$2.5B in additional DHS funding under Title I and $2.5B under Title II',
        'Funds expanded use of 287(g) agreements with state and local police',
        'All funds remain available through September 30, 2029' ] }
    ],
    sections: [
      { label: 'Title I — Committee on Homeland Security and Governmental Affairs', items: [
        { main: '$9.55B for CBP to hire, pay, train, and equip Border Patrol agents and support personnel for functions other than immigration and customs enforcement (Sec 101).', detail: 'Section 102 provides $7.45B for ICE Homeland Security Investigations agents and support, of which $108.5M is for child-exploitation investigators and forensic analysts at the HSI Victim Identification Laboratory. No funds under Section 101 may be used to recruit or train processing coordinators after October 31, 2028.', comments: [] },
        { main: '$3.45B for border security, technology, and screening (Sec 103).', detail: 'Funds nonintrusive inspection equipment using artificial intelligence and machine learning, air and marine response platforms, border surveillance technology, the biometric entry-and-exit system, and counter-fentanyl efforts. None of the funds may buy surveillance towers that CBP has not tested and accepted as delivering autonomous capabilities.', comments: [] },
        { main: '$2.5B in additional DHS appropriations for the purposes of Title I (Sec 104).', detail: 'Appropriated to the Secretary of Homeland Security for fiscal year 2026, to remain available until September 30, 2029.', comments: [] }
      ] },
      { label: 'Title II — Committee on the Judiciary', items: [
        { main: '$13.02B for CBP to hire, pay, train, and equip agents and support staff to carry out immigration enforcement (Sec 201).', detail: 'Appropriated for fiscal year 2026 and available until September 30, 2029, for immigration-enforcement activities and related mission support and operations.', comments: [] },
        { main: '$31.08B for ICE immigration enforcement and removal operations (Sec 202).', detail: 'Covers ICE personnel and directorates, removal transportation, information technology including body-worn cameras, facility and fleet maintenance, 287(g) agreements with state and local authorities, and attorneys in the Office of the Principal Legal Advisor. At least $350M is set aside to arrest "covered unlawful aliens" released in jurisdictions that are not qualified cooperating jurisdictions; those funds may not be used to release such individuals.', comments: [] },
        { main: '$2.5B in additional DHS appropriations for the purposes of Title II (Sec 203).', detail: 'Available for purposes in this title or in paragraph (3) or (7) of section 100051 of Public Law 119-21, to remain available until September 30, 2029.', comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 102 — $108.5M carve-out', summary: 'Within the $7.45B ICE/HSI appropriation, $108.5M is directed to child-exploitation investigators and forensic analysts at the HSI Victim Identification Laboratory and Special Agent in Charge offices, to support identifying and rescuing victims of child sexual exploitation.', why_unreported: 'The section is captioned "U.S. Immigration and Customs Enforcement," but this line item funds a victim-identification mission distinct from the bill\'s headline immigration-enforcement purpose.' },
      { section: 'Section 103(b) — surveillance tower restriction', summary: 'None of the $3.45B may be used to buy or deploy southwest- or northern-border surveillance towers that CBP has not tested and accepted as delivering autonomous capabilities.', why_unreported: 'The provision narrows what border-surveillance procurement is allowed, conditioning it on an "autonomous" performance standard defined in the same section.' },
      { section: 'Section 202(9) — release limitation', summary: 'The at-least-$350M for arresting "covered unlawful aliens" may not be used to release, parole, place on alternatives to detention, or otherwise facilitate the community release of such individuals, except as required by existing law.', why_unreported: 'The provision appropriates funds to arrest covered unlawful aliens, but its operative effect is also a spending restriction tied to whether a jurisdiction has a 287(g) agreement or an 8 U.S.C. 1373 certification.' }
    ],
    criticisms: [],
    gaps: [
      'The bill funds hiring of CBP and ICE personnel through FY2029 but does not set numeric hiring targets for agents.',
      'Section 101 funds Border Patrol for "functions other than immigration enforcement and customs functions" but does not define which functions those are.',
      'The bill appropriates funds available through September 30, 2029 but specifies no reporting or oversight mechanism on how the funds are spent.',
      'Section 203 makes funds available for purposes in paragraph (3) or (7) of section 100051 of Public Law 119-21 but does not restate what those purposes are.'
    ],
    featured_quotes: [],
    changes: {
      added: [
        '$9.55B CBP Border Patrol personnel appropriation through FY2029 (Sec 101)',
        '$31.08B ICE immigration enforcement and removal appropriation through FY2029 (Sec 202)',
        'At least $350M for ICE to arrest "covered unlawful aliens" released in non-cooperating jurisdictions (Sec 202(9))'
      ],
      modified: [], removed: []
    },
    votes: [],
    budget_accounts: {
      'U.S. Customs and Border Protection — Border Patrol personnel': { agency: '070', currentAmount: 9550000000, note: 'Sec 101, available through FY2029' },
      'U.S. Customs and Border Protection — immigration enforcement': { agency: '070', currentAmount: 13020000000, note: 'Sec 201, available through FY2029' },
      'U.S. Immigration and Customs Enforcement': { agency: '070', currentAmount: 31075000000, note: 'Sec 202, immigration enforcement and removal' },
      'U.S. Immigration and Customs Enforcement — Homeland Security Investigations': { agency: '070', currentAmount: 7450000000, note: 'Sec 102' }
    },
    analyzedAt: ANALYZED
  },

  // ───────────────────────────── 119-S-146 ─────────────────────────────
  {
    id: '119-S-146', code: 'S.146', title: 'TAKE IT DOWN Act',
    official_title: 'An Act to require covered platforms to remove nonconsensual intimate visual depictions, and for other purposes.',
    date: '2025-05-19', version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4, pipeline: PIPELINE,
    sponsor: 'Sen. Cruz, Ted (R-TX)', sponsor_bioguide: 'C001098', cosponsors: 21,
    pages: 9, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2025-05-19', enactedDate: '2025-05-19',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-12 on May 19, 2025. Sponsored by Sen. Ted Cruz (R-TX) with 21 cosponsors; its child-protection and anti-deepfake provisions drew bipartisan support and it passed both chambers before being signed.',
    summary: 'Makes it a federal crime to knowingly publish nonconsensual intimate images of a person online — including AI-generated "deepfake" forgeries — and requires online platforms to remove such images within 48 hours of a valid request.',
    brief: 'Creates federal criminal penalties for nonconsensual intimate-image publication (real or AI-generated) and requires covered platforms to remove flagged images within 48 hours.',
    top_lines: [
      { headline: 'New Federal Crime for Nonconsensual Intimate Images', billSection: '2', subs: [
        'Bans knowingly publishing nonconsensual intimate images of adults that cause harm',
        'Covers AI-generated "digital forgeries" indistinguishable from real images',
        'Up to 2 years in prison for images of adults, 3 years for minors' ] },
      { headline: 'Threats and Forfeiture', billSection: '2', subs: [
        'Threatening to publish such images is also a crime',
        'Courts must order forfeiture of proceeds and equipment used',
        'Mandatory restitution to victims' ] },
      { headline: '48-Hour Platform Takedown', billSection: '3', subs: [
        'Covered platforms must build a removal-request process within 1 year',
        'Must remove flagged images within 48 hours of a valid request',
        'FTC enforces noncompliance as an unfair or deceptive practice' ] }
    ],
    sections: [
      { label: 'Section 2 — Criminal Prohibition on Intentional Disclosure', items: [
        { main: 'Makes it unlawful to knowingly publish, over an interactive computer service, an intimate visual depiction of an identifiable adult where the subject had a reasonable expectation of privacy and publication is intended to or does cause harm.', detail: 'Adds subsection (h) to Section 223 of the Communications Act of 1934. A parallel prohibition covers "digital forgeries" — AI- or computer-generated images indistinguishable from authentic ones. Penalties are up to 2 years for offenses involving adults and up to 3 years for minors. Exceptions cover law-enforcement and intelligence activity, good-faith reporting, legal proceedings, and medical or educational use.', comments: [] },
        { main: 'Threatening to publish such images for intimidation, coercion, or extortion is a separate crime, with mandatory forfeiture and restitution on conviction.', detail: 'Threats involving digital forgeries carry up to 18 months for adults and 30 months for minors. Courts must order forfeiture of any material distributed, proceeds, and equipment used, and must order restitution under section 2264 of title 18.', comments: [] }
      ] },
      { label: 'Section 3 — Notice and Removal of Nonconsensual Intimate Visual Depictions', items: [
        { main: 'Within one year of enactment, covered platforms must establish a process for individuals to request removal of nonconsensual intimate images and must remove valid-request images within 48 hours.', detail: 'Platforms must post a clear, plain-language notice of the process and make reasonable efforts to remove known identical copies. A failure to comply is treated as an unfair or deceptive practice enforced by the Federal Trade Commission. Platforms acting in good faith to remove material claimed to be nonconsensual are shielded from liability even if the image is later found lawful.', comments: [] }
      ] },
      { label: 'Section 4 — Definitions', items: [
        { main: 'Defines "covered platform" as a public website, online service, or application that primarily hosts user-generated content or regularly publishes nonconsensual intimate depictions.', detail: 'Excludes broadband internet access providers, electronic mail, and services that consist primarily of provider-selected (non-user-generated) content where any interactive feature is incidental.', comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 3(a)(4) — good-faith removal shield', summary: 'A covered platform is not liable for good-faith removal of material claimed to be a nonconsensual intimate depiction, "regardless of whether the intimate visual depiction is ultimately determined to be unlawful or not."', why_unreported: 'The section is captioned notice-and-removal, but this clause grants platforms immunity for removing content even when the claim turns out to be unfounded.' },
      { section: 'Section 2 — digital forgery reach', summary: 'The crime applies to "digital forgeries" — images created with software, machine learning, or AI that a reasonable person cannot distinguish from authentic.', why_unreported: 'The prohibition extends beyond real photographs to computer-generated depictions, defining the Act\'s reach over deepfake media.' },
      { section: 'Section 4(3)(B) — platform exclusions', summary: 'Broadband providers, email, and content-curated services with only incidental interactivity are excluded from the "covered platform" definition.', why_unreported: 'The exclusions narrow which services carry the 48-hour takedown duty, separate from the headline platform obligation.' }
    ],
    criticisms: [],
    gaps: [
      'The bill requires covered platforms to remove images within 48 hours but provides no penalty for individual late removals beyond FTC unfair-practice enforcement.',
      'The bill criminalizes publication but does not create a private civil cause of action for victims against the publisher.',
      'The takedown duty applies to platforms hosting user-generated content but does not address search engines that index rather than host such images.',
      'The bill defines consent but does not specify how platforms verify a removal requester\'s identity or resolve a disputed consent claim.'
    ],
    featured_quotes: [],
    changes: {
      added: [
        'New federal crime (47 U.S.C. 223(h)) for nonconsensual publication of intimate images, including AI deepfakes',
        '48-hour platform takedown requirement enforced by the FTC (Sec 3)',
        'Mandatory criminal forfeiture and restitution for violations (Sec 2)'
      ],
      modified: [
        'Amends Section 223 of the Communications Act of 1934 to add the new prohibition and extend its existing defenses to the new subsection'
      ],
      removed: []
    },
    votes: [],
    budget_accounts: {},
    analyzedAt: ANALYZED
  },

  // ───────────────────────────── 119-HR-998 ─────────────────────────────
  {
    id: '119-HR-998', code: 'HR.998', title: 'Internal Revenue Service Math and Taxpayer Help Act',
    official_title: 'An Act to amend the Internal Revenue Code of 1986 to require additional information on math and clerical error notices.',
    date: '2025-11-25', version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4, pipeline: PIPELINE,
    sponsor: 'Rep. Feenstra, Randy (R-IA)', sponsor_bioguide: 'F000446', cosponsors: 1,
    pages: 3, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2025-11-25', enactedDate: '2025-11-25',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-39 on November 25, 2025. Sponsored by Rep. Randy Feenstra (R-IA) with one cosponsor; the taxpayer-service improvements drew no recorded opposition and passed both chambers before being signed.',
    summary: 'Requires the IRS to explain math or clerical-error notices in plain language — naming the type of error, the exact tax-return line, and an itemized recalculation — and to tell taxpayers how and by when they can challenge the assessment.',
    brief: 'Requires IRS math/clerical-error notices to specify the error, the return line, an itemized computation, and the abatement deadline in plain language.',
    top_lines: [
      { headline: 'Clearer IRS Error Notices', billSection: '2', subs: [
        'Notices must name the error type, tax-code section, and exact return line',
        'Must include an itemized computation of every adjustment',
        'Abatement deadline shown in bold, font size 14, on page 1' ] },
      { headline: 'Abatement Process and Notice', billSection: '2', subs: [
        'Taxpayers may request abatement in writing, online, by phone, or in person',
        'IRS must send a plain-language notice when it abates an assessment',
        'Applies to notices sent 12 months after enactment' ] },
      { headline: 'Certified-Mail Pilot Program', billSection: '2', subs: [
        '18-month pilot sends error notices by certified or registered mail',
        'IRS must report the results to Congress' ] }
    ],
    sections: [
      { label: 'Section 2 — Improvement of Notices of Math or Clerical Error', items: [
        { main: 'Amends Section 6213(b)(1) of the Internal Revenue Code to require math or clerical-error notices to describe the error in comprehensive, plain language.', detail: 'Each notice must be sent to the taxpayer\'s last known address and state the type of error, the Code section involved, the nature of the error, and the specific return line; an itemized computation of every adjustment (including to adjusted gross income, taxable income, deductions, credits under sections 24, 25A, 32, 35, or 36B, and tax owed or refunded); the automated transcript phone number; and the abatement-request deadline in bold, font size 14, on page 1. A notice listing multiple alternative possible errors is deemed not specific enough.', comments: [] },
        { main: 'Requires a new abatement notice and an accessible abatement-request process, and creates a certified-mail pilot program.', detail: 'When the IRS abates an assessment, it must send a plain-language notice with an itemized computation. Within 180 days of enactment the IRS must provide procedures to request an abatement in writing, electronically, by phone, or in person. Within 18 months it must run a pilot sending a statistically significant share of error notices by certified or registered mail with e-signature confirmation, then report results to Congress aggregated by error type. The notice requirements apply to notices sent 12 months after enactment.', comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2(a) — no lists of potential errors', summary: 'A notice that lists multiple potential or alternative errors is deemed insufficiently specific; if several specific errors apply, all must be listed.', why_unreported: 'The requirement bars ambiguous multi-error notices, a change to how the IRS may word a notice that is not apparent from the "additional information" caption.' },
      { section: 'Section 2(e) — certified-mail pilot', summary: 'The pilot tests certified or registered mail with e-signature confirmation of receipt and measures effect on taxpayer response and abatements.', why_unreported: 'The pilot changes how notices are delivered and proves receipt, distinct from the bill\'s notice-content headline.' }
    ],
    criticisms: [],
    gaps: [
      'The bill requires an itemized computation but sets no penalty or consequence if the IRS sends a notice that fails the new specificity standard.',
      'The bill requires the abatement deadline to be displayed but does not change the length of the abatement window itself.',
      'The pilot reports to Congress on certified-mail effectiveness but the bill does not require the IRS to adopt certified mail based on the results.'
    ],
    featured_quotes: [],
    changes: {
      added: [
        'Specificity requirements for IRS math/clerical-error notices (new 26 U.S.C. 6213(b)(1)(B))',
        'New IRS notice requirement when an assessment is abated (new 26 U.S.C. 6213(b)(2)(C))',
        '18-month certified-mail pilot program with a report to Congress'
      ],
      modified: [
        'Amends Section 6213(b) of the Internal Revenue Code to require plain-language, itemized error notices'
      ],
      removed: []
    },
    votes: [],
    budget_accounts: {},
    analyzedAt: ANALYZED
  },

  // ───────────────────────────── 119-HR-1316 ─────────────────────────────
  {
    id: '119-HR-1316', code: 'HR.1316', title: 'Maintaining American Superiority by Improving Export Control Transparency Act',
    official_title: 'An Act to amend the Export Control Reform Act of 2018 relating to licensing transparency.',
    date: '2025-08-19', version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4, pipeline: PIPELINE,
    sponsor: 'Rep. Jackson, Ronny (R-TX)', sponsor_bioguide: 'J000304', cosponsors: 2,
    pages: 2, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2025-08-19', enactedDate: '2025-08-19',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-34 on August 19, 2025. Sponsored by Rep. Ronny Jackson (R-TX) with two cosponsors; the export-control oversight measure passed both chambers before being signed.',
    summary: 'Requires the Commerce Department\'s Bureau of Industry and Security to report to Congress every year on export-license decisions and end-use checks for shipments to foreign entities in arms-embargoed countries that are on U.S. export-restriction lists.',
    brief: 'Requires BIS to file an annual report to Congress on export licenses and end-use checks involving covered entities in arms-embargoed countries.',
    top_lines: [
      { headline: 'Annual Export-License Reporting', billSection: '2', subs: [
        'BIS must report to Congress within one year, then at least annually',
        'Covers license applications, authorizations, and end-use checks for covered entities',
        'Each entry lists the applicant, item, end-user, location, value, and decision' ] },
      { headline: 'Covered Entities Defined', billSection: '2', subs: [
        'Applies to entities in Country Group D:5 (arms-embargoed countries)',
        'And on the Entity List or Military End-User List' ] },
      { headline: 'Confidentiality', billSection: '2', subs: [
        'Report details exempt from public disclosure except aggregate statistics',
        'Information that could jeopardize an investigation must be excluded' ] }
    ],
    sections: [
      { label: 'Section 2 — Licensing Transparency', items: [
        { main: 'Amends Section 1756 of the Export Control Reform Act of 2018 to require an annual report on export-license activity involving covered entities.', detail: 'Within one year, and at least annually thereafter, the Secretary must report to the House Foreign Affairs Committee and Senate Banking Committee on end-use checks and on license applications and authorizations for the export, reexport, release, and in-country transfer of controlled items to covered entities. Each entry must give the applicant name, a description of the item (including the Export Control Classification Number), the end-user and location, a value estimate, the decision, and the submission date, plus aggregate statistics.', comments: [] },
        { main: 'Defines covered entities and shields the report details from public disclosure.', detail: 'A covered entity is one located in a Country Group D:5 country (arms-embargoed) that is also on the Entity List or the Military End-User List. The reported information, other than aggregate statistics, is exempt from public disclosure, and the Secretary must exclude anything that could jeopardize an ongoing investigation. The requirement is subject to the availability of appropriations.', comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2 — appropriations condition', summary: 'The annual reporting requirement is "subject to the availability of appropriations."', why_unreported: 'The caption is "Report," but the operative duty is made contingent on funding rather than unconditional.' },
      { section: 'Section 2 — covered-entity intersection', summary: 'A covered entity must be both located in a Country Group D:5 country and listed on the Entity List or Military End-User List.', why_unreported: 'Requiring both conditions narrows the report to a specific intersection of high-risk entities rather than all entities in embargoed countries.' }
    ],
    criticisms: [],
    gaps: [
      'The bill requires annual reporting but sets no penalty or consequence if BIS fails to submit the report.',
      'The report covers covered entities in Country Group D:5 but does not address comparable-risk entities in other country groups.',
      'The bill exempts the report from public disclosure except aggregate statistics but sets no schedule for releasing those statistics publicly.'
    ],
    featured_quotes: [],
    changes: {
      added: [
        'New annual BIS report to Congress on export licensing to covered entities (new 50 U.S.C. 4815(e))'
      ],
      modified: [
        'Amends Section 1756 of the Export Control Reform Act of 2018 to add the reporting requirement'
      ],
      removed: []
    },
    votes: [],
    budget_accounts: {},
    analyzedAt: ANALYZED
  },

  // ───────────────────────────── 119-S-222 ─────────────────────────────
  {
    id: '119-S-222', code: 'S.222', title: 'Whole Milk for Healthy Kids Act of 2025',
    official_title: 'An Act to amend the Richard B. Russell National School Lunch Act to allow schools that participate in the school lunch program to serve whole milk, and for other purposes.',
    date: '2026-01-14', version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4, pipeline: PIPELINE,
    sponsor: 'Sen. Marshall, Roger (R-KS)', sponsor_bioguide: 'M001198', cosponsors: 16,
    pages: 2, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2026-01-14', enactedDate: '2026-01-14',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-69 on January 14, 2026. Sponsored by Sen. Roger Marshall (R-KS) with 16 cosponsors; the measure drew bipartisan, dairy-state support and passed both chambers before being signed.',
    summary: 'Lets schools in the National School Lunch Program serve whole and reduced-fat milk — not just low-fat and fat-free — and stops counting milk fat toward school-meal saturated-fat limits. It also requires food-allergy training for school food-service staff.',
    brief: 'Allows schools to offer whole and reduced-fat milk, excludes milk fat from saturated-fat limits, and adds food-allergy training for school food-service personnel.',
    top_lines: [
      { headline: 'Whole and Reduced-Fat Milk Allowed', billSection: '2', subs: [
        'Schools may offer whole, reduced-fat, low-fat, and fat-free milk',
        'Milk may be organic or non-organic, flavored or unflavored',
        'USDA rules had allowed only fat-free or low-fat milk' ] },
      { headline: 'Saturated-Fat Rule Change', billSection: '2', subs: [
        'Milk fat no longer counts toward the saturated-fat limit for school meals',
        'Removes the requirement to match the latest Dietary Guidelines',
        'Parents or guardians — not only physicians — may request a milk substitute' ] },
      { headline: 'Food-Allergy Training', billSection: '3', subs: [
        'Adds a food-allergy module to required food-service staff training',
        'Covers preventing, recognizing, and responding to allergic reactions' ] }
    ],
    sections: [
      { label: 'Section 2 — Organic or Non-Organic Whole Milk Permissible', items: [
        { main: 'Amends Section 9(a)(2) of the Richard B. Russell National School Lunch Act so schools may offer a variety of fluid milk, including whole, reduced-fat, low-fat, fat-free, and lactose-free milk, organic or non-organic.', detail: 'Schools may also offer nondairy beverages that are nutritionally equivalent to fluid milk and meet USDA standards (including calcium, protein, and vitamin A and D fortification to cow\'s-milk levels). A milk substitute may now be requested by a physician, parent, or legal guardian, where previously only a physician could.', comments: [] },
        { main: 'Excludes milk fat from the saturated-fat content calculation used to judge school-meal compliance.', detail: 'Milk fat in any fluid milk provided under the program is not counted as saturated fat for measuring compliance with the allowable average saturated-fat content under 7 C.F.R. 210.10. Conforming amendments update the nondairy-beverage references in Sections 14(f) and 20(c) of the Act.', comments: [] }
      ] },
      { label: 'Section 3 — Including Food Allergy Information in Existing Training Modules', items: [
        { main: 'Amends the Child Nutrition Act of 1966 to add a food-allergy module to the required training for local school food-service personnel.', detail: 'The module must include best practices to prevent, recognize, and respond to food-related allergic reactions, and personnel must receive annual certification demonstrating competence in it.', comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2(a)(3)(D) — saturated-fat exclusion', summary: 'Milk fat in fluid milk "shall not be considered saturated fat" for purposes of measuring compliance with the school-meal saturated-fat limit.', why_unreported: 'This changes how meal compliance is measured rather than only what milk may be served, and is not apparent from the "whole milk permissible" caption.' },
      { section: 'Section 2 — Dietary Guidelines requirement removed', summary: 'The Act removes the requirement that program milk be consistent with the most recent Dietary Guidelines for Americans.', why_unreported: 'Dropping the Dietary-Guidelines tie is a substantive standard change separate from adding whole milk to the permitted list.' },
      { section: 'Section 2(a)(2) — who may request a substitute', summary: 'The authority to request a milk substitute is expanded from a licensed physician to a physician, parent, or legal guardian.', why_unreported: 'This widens who can authorize a substitution beyond medical providers, a change not signaled by the bill title.' }
    ],
    criticisms: [],
    gaps: [
      'The bill allows whole milk but does not change the program\'s funding or reimbursement rates for the milk served.',
      'The bill excludes milk fat from saturated-fat compliance but does not address other dairy components in the same calculation.',
      'The bill adds food-allergy training but does not specify funding to develop or deliver the training module.',
      'The bill permits nutritionally equivalent nondairy beverages but leaves the specific nutritional standards to the Secretary.'
    ],
    featured_quotes: [],
    changes: {
      added: [
        'Food-allergy training module and annual certification for school food-service personnel (Child Nutrition Act Sec 7(g))'
      ],
      modified: [
        'Section 9(a)(2) of the National School Lunch Act: permissible school milk expanded from fat-free/low-fat only to also include whole and reduced-fat milk',
        'Milk fat excluded from the saturated-fat content calculation for school-meal compliance',
        'Authority to request a milk substitute expanded from a physician to a physician, parent, or legal guardian'
      ],
      removed: [
        'Requirement that program milk be consistent with the most recent Dietary Guidelines for Americans'
      ]
    },
    votes: [],
    budget_accounts: {},
    analyzedAt: ANALYZED
  },

  // ───────────────────────────── 119-S-2585 ─────────────────────────────
  {
    id: '119-S-2585', code: 'S.2585', title: 'MAP for Broadband Funding Act',
    official_title: 'An Act to modernize and improve the Broadband Funding Map in order to promote the most efficient use of Federal funds for broadband deployment, and for other purposes.',
    date: '2026-06-18', version: 'v1.0',
    stage: 'senate', stageLabel: 'Passed Senate', currentStep: 3, pipeline: PIPELINE,
    sponsor: 'Sen. Fischer, Deb (R-NE)', sponsor_bioguide: 'F000463', cosponsors: 1,
    pages: 3, analyzed: true, demo: false, billType: 'study',
    stageDate: '2026-06-18',
    likelihood: 68, likelihoodLabel: 'Likely',
    likelihoodReason: 'Passed the Senate by voice vote on June 18, 2026. Sponsored by Sen. Deb Fischer (R-NE) with bipartisan support (cosponsored by Sen. Catherine Cortez Masto, D-NV). The bill is a narrow, low-cost broadband-mapping measure — an FCC notice of inquiry plus a GAO study with no direct appropriations — the kind of technical oversight bill that commonly clears the House. It now awaits House action.',
    summary: 'Directs the FCC, working with the NTIA, to keep the federal Broadband Funding Map up to date and to seek public input on improving it, and orders a GAO study of how well agencies maintain the map. The map tracks where federal broadband-deployment dollars go to prevent paying twice to wire the same area.',
    brief: 'Requires the FCC to modernize and seek public comment on the Broadband Funding Map and orders a GAO study of how federal agencies maintain it.',
    top_lines: [
      { headline: 'What the Broadband Funding Map Does', billSection: '2', subs: [
        'Federal map showing the location of each federally funded broadband project',
        'Meant to prevent redundant overbuilding with federal funds' ] },
      { headline: 'FCC Map Modernization', billSection: '3', subs: [
        'FCC must collect agency data for the map on a timely basis',
        'Must open a notice of inquiry within 270 days on the map\'s functionality',
        'Must complete the inquiry within 120 days of starting it' ] },
      { headline: 'GAO Study', billSection: '4', subs: [
        'GAO must report within 180 days on agency compliance and map management',
        'Reviews whether the FCC has authority to collect the needed data' ] }
    ],
    sections: [
      { label: 'Section 3 — Broadband Funding Map Modernization', items: [
        { main: 'Directs the FCC, in coordination with the NTIA, to collect data for the Broadband Funding Map on a reasonable and timely basis to promote efficient use of federal funds and prevent redundant overbuilding.', detail: 'Within 270 days the FCC must open a notice of inquiry on the map\'s functionality and transparency, evaluating the adequacy and usability of submitted data, the timeliness of agency updates, whether the scope of reported data should expand, and how the map could be integrated with existing FCC mapping tools. The inquiry must be completed within 120 days of its initiation.', comments: [] }
      ] },
      { label: 'Section 4 — GAO Study and Report', items: [
        { main: 'Requires the Government Accountability Office to study and report within 180 days on the roles, responsibilities, and progress of federal agencies in maintaining the Broadband Funding Map.', detail: 'The study must review each agency\'s data-submission compliance, the FCC\'s management of the map and interagency collaboration, whether the FCC has sufficient authority to collect the necessary data, the NTIA\'s broadband data-collection efforts under existing law, coordination among agencies that fund broadband (including USDA, HHS, Treasury, HUD, and the Institute of Museum and Library Sciences), and how broader use of the map could improve taxpayer savings.', comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 4(b)(3) — FCC authority review', summary: 'The GAO study must assess whether the FCC has sufficient authority to collect the necessary data from federal agencies to populate the map.', why_unreported: 'This flags a potential authority gap in the existing mapping regime, distinct from the bill\'s map-modernization headline.' },
      { section: 'Section 3(a) — overbuilding purpose', summary: 'The FCC\'s data collection is tied to preventing "redundant overbuilding of broadband infrastructure with Federal funding."', why_unreported: 'The operative aim is avoiding duplicate federal spending on the same areas, beyond simply updating a map.' }
    ],
    criticisms: [],
    gaps: [
      'The bill orders an FCC inquiry and a GAO study but does not require the FCC to act on the findings or change the map.',
      'The bill aims to prevent redundant overbuilding but creates no enforcement mechanism to stop duplicative funding.',
      'The bill directs review of FCC data-collection authority but does not itself grant the FCC new authority to compel agency data.',
      'The bill lists agencies whose coordination GAO must review but does not require those agencies to submit data on a fixed schedule.'
    ],
    featured_quotes: [],
    changes: {
      added: [
        'FCC notice of inquiry on the Broadband Funding Map within 270 days (Sec 3)',
        'GAO study and report on agency map compliance within 180 days (Sec 4)'
      ],
      modified: [], removed: []
    },
    votes: [],
    budget_accounts: {},
    analyzedAt: ANALYZED
  }
];

// Merge: replace if id exists, else append.
// NOTE: entries here carry votes:[]; fetch_vote_data.js populates the real votes
// separately into cache.json. PRESERVE any existing votes on replace so re-running
// this script does not wipe fetched roll calls.
const byId = new Map(cache.bills.map((b, i) => [b.id, i]));
let added = 0, replaced = 0;
for (const e of entries) {
  if (byId.has(e.id)) {
    const prev = cache.bills[byId.get(e.id)];
    if (Array.isArray(prev.votes) && prev.votes.length && (!e.votes || !e.votes.length)) e.votes = prev.votes;
    cache.bills[byId.get(e.id)] = e; replaced++;
  } else { cache.bills.push(e); added++; }
}
cache.generated = new Date().toISOString();
fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
console.log(`Done. Added ${added}, replaced ${replaced}. Total bills: ${cache.bills.length}`);
