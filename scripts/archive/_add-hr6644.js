// One-off merge: add HR-6644 (21st Century ROAD to Housing Act) ENROLLED text to cache.json.
// Sourced only from data/bill-text/119-HR-6644.txt (Enrolled Bill — the version that cleared both chambers).
const fs = require('fs');
const path = require('path');
const cachePath = path.join(__dirname, '..', 'data', 'cache.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

const entry = {
  id: '119-HR-6644',
  code: 'HR.6644',
  title: '21st Century ROAD to Housing Act',
  official_title: 'To address housing supply through reforms to housing, community-development, manufactured-housing, rural-housing, and veterans-housing programs, with provisions on community banks, institutional single-family-home ownership, and central bank digital currency.',
  date: '2026-06-23',
  version: 'v1.0',
  stage: 'senate', stageLabel: 'Passed Senate', currentStep: 3,
  pipeline: ['Introduced', 'Committee', 'Passed House', 'Passed Senate', 'Signed'],
  sponsor: 'Rep. Hill, J. French (R-AR)', sponsor_bioguide: 'H001072', cosponsors: 31,
  pages: 174, analyzed: true, demo: false, billType: 'amendment',
  stageDate: '2026-06-23',
  likelihood: 92, likelihoodLabel: 'Very Likely',
  likelihoodReason: 'Introduced by Rep. French Hill (R-AR) with 31 cosponsors. The Senate broadened the House housing bill into a 12-title package that drew strong bipartisan support in both chambers (House 358-32, Senate 89-10); having cleared both chambers in identical form, it awaits the President, and a veto of a bill with this margin would be unlikely to stand.',
  summary: 'A 12-title package built around increasing the housing supply. It pushes states and localities to ease zoning, streamlines federal environmental reviews for housing, reforms HOME, CDBG, rural, manufactured, and veterans housing programs, and creates new grant and pilot programs. It also includes non-housing provisions: easing rules for small and new community banks, barring large investors from buying single-family homes, and prohibiting the Federal Reserve from issuing a central bank digital currency.',
  brief: 'A broad housing-supply and program-reform package that also eases community-bank rules, bars large institutional investors from buying single-family homes, and prohibits a Federal Reserve digital dollar.',
  top_lines: [
    { headline: 'Zoning and Housing-Supply Reform', billSection: '107', subs: [
      'HUD must publish state and local zoning best-practice guidelines within 3 years',
      'Abolishes the Regulatory Barriers Clearinghouse',
      'Single-stair building guidelines for residential buildings up to 6 stories' ] },
    { headline: 'Streamlined Reviews and Loan Limits', billSection: '206', subs: [
      'Reclassifies many HUD housing activities as exempt from NEPA environmental review',
      'Raises FHA per-unit multifamily mortgage limits (e.g. $38,025 to $167,310)',
      'USDA rural infill housing exempted from environmental study' ] },
    { headline: 'New Grant and Pilot Programs', billSection: '208', subs: [
      'Innovation Fund authorizes $200M/year FY2027-2031 for high-supply localities',
      'RESIDE pilot converts vacant commercial buildings into housing',
      'Family Self-Sufficiency escrow pilot for up to 5,000 families' ] },
    { headline: 'Program Reforms', billSection: '501', subs: [
      'Reauthorizes and reforms the HOME program; income limit set at 100% of area median',
      'Permanently authorizes CDBG long-term disaster recovery with a dedicated fund',
      'Rental Assistance Demonstration cap raised from 455,000 to 555,000 units and made permanent' ] },
    { headline: 'Manufactured Housing and Veterans', billSection: '301', subs: [
      'Allows HUD-code manufactured homes built without a permanent chassis',
      'Excludes VA disability benefits from income for HUD-VASH eligibility',
      'Adds a VA Home Loan disclosure to the Uniform Residential Loan Application' ] },
    { headline: 'Community Banks', billSection: '901', subs: [
      'Lets small banks treat custodial deposits up to 20% of liabilities as non-brokered',
      'Raises the bank "public welfare investment" cap from 15% to 20%',
      'Eases capital and application rules for newly formed community banks' ] },
    { headline: 'Institutional Investors and Digital Currency', billSection: '1001', subs: [
      'Bars large investors (350+ single-family homes) from buying more single-family homes',
      'Penalty up to $1M per violation, with proceeds funding the HOME program',
      'Prohibits the Federal Reserve from issuing a central bank digital currency' ] }
  ],
  sections: [
    { label: 'Title I — Opportunities for Housing', items: [
      { main: 'Reforms housing counseling, directs HUD to issue single-stair ("point-access block") building guidelines for buildings up to 6 stories, establishes an FHA small-dollar mortgage pilot and a temperature-sensor pilot, and directs HUD to publish state and local zoning best-practice guidelines within 3 years.',
        detail: 'The zoning guidelines (Sec 107) recommend reducing parking minimums, allowing accessory dwelling units, and permitting by-right duplex-through-quadplex housing, and the section abolishes the Regulatory Barriers Clearinghouse (repealing 42 U.S.C. 12705d). The FHA small-dollar pilot (Sec 105) covers mortgages of $100,000 or less and sunsets after 4 years. USDA may skip environmental study for rural infill housing (Sec 103). "Affordable housing" is defined as costing no more than 30 percent of household income.',
        comments: [] }
    ] },
    { label: 'Title II — Building More in America', items: [
      { main: 'Creates and expands housing-supply grant programs, streamlines HUD environmental review, and adjusts CDBG allocations to reward jurisdictions that build more housing.',
        detail: 'An Innovation Fund (Sec 208) authorizes $200M per year for FY2027-2031 in competitive grants ($250,000 to $10M each, at least 25 per year) to localities that increased housing supply. The RESIDE pilot (Sec 210) funds converting vacant commercial buildings into attainable housing ($1M to $10M grants). Sec 206 reclassifies many HUD activities as NEPA-exempt or categorically excluded, including office-to-residential conversions with no more than a 20 percent size change. The Build Now Act (Sec 213) gives bonus CDBG funds to high-housing-growth jurisdictions and cuts allocations 10 percent for those below the median. Sec 203 (Community Investment and Prosperity Act) raises the bank "public welfare investment" cap from 15 to 20 percent of capital and surplus.',
        comments: [] }
    ] },
    { label: 'Title III — Manufactured Housing for America', items: [
      { main: 'Allows HUD-code manufactured homes to be built "with or without a permanent chassis," requires HUD to set minimum energy-efficiency standards, and modernizes FHA manufactured-home and modular-home financing.',
        detail: 'States must certify within 1 to 2 years that they treat chassis-less manufactured homes in parity with other manufactured homes; a state that does not certify must prohibit their manufacture, installation, or sale. Sec 302 (Modular Housing Production Act) directs an FHA review of barriers to modular construction financing, and Sec 304 (PRICE Act) adds a Preservation and Reinvestment Initiative for Community Enhancement to preserve manufactured-housing communities under CDBG.',
        comments: [] }
    ] },
    { label: 'Title IV — Accessing the American Dream', items: [
      { main: 'Studies and reforms small-dollar mortgage lending, overhauls FHA appraisal requirements, creates a Family Self-Sufficiency escrow pilot, and deems certain inspected units to meet Section 8 standards.',
        detail: 'The Helping More Families Save Act (Sec 404) lets HUD select up to 25 entities to run escrow accounts for up to 5,000 assisted families earning no more than 80 percent of area median income, escrowing rent increases from earned income, with a 10-year sunset. The Appraisal Industry Improvement Act (Sec 403) revises FHA appraiser certification and competency rules and adds state credentialed trainee appraisers to the national registry. Units inspected under the Low-Income Housing Tax Credit, HOME, or Rural Housing Service programs in the prior 12 months are deemed to meet Section 8 inspection requirements (Sec 405).',
        comments: [] }
    ] },
    { label: 'Title V — Program Reform', items: [
      { main: 'Reauthorizes and reforms the HOME program, reforms Rural Housing Service programs, permanently authorizes CDBG long-term disaster recovery, and adds a new Moving to Work cohort.',
        detail: 'The HOME reauthorization (Sec 501) sets income eligibility at 100 percent of area median income in places and makes structural reforms. The Rural Housing Service Reform Act (Sec 502) preserves rental-assistance contracts through foreclosure on USDA multifamily properties. The Reforming Disaster Recovery Act (Sec 504) permanently authorizes HUD long-term disaster recovery block grants and establishes a Long-Term Disaster Recovery Fund. Sec 505 lets HUD add up to 25 high-performing public housing agencies to the Moving to Work demonstration.',
        comments: [] }
    ] },
    { label: 'Title VI — Veterans and Housing', items: [
      { main: 'Excludes veterans’ disability benefits from income for HUD-VASH eligibility and adds VA Home Loan information to mortgage application forms.',
        detail: 'The Housing Unhoused Disabled Veterans Act (Sec 602) excludes chapter 11 and 15 (title 38) disability benefits from income for the HUD-VASH supported-housing program, though not from adjusted income. Sec 601 requires a disclosure below the military-service question on the Uniform Residential Loan Application stating a "yes" may mean VA Home Loan eligibility, and the VALID Act (Sec 603) adds VA loan information to FHA disclosures and a "Prefer Not To Answer" option to the military-service question.',
        comments: [] }
    ] },
    { label: 'Title VII — Oversight and Accountability', items: [
      { main: 'Requires annual HUD testimony to Congress, monthly FHA capital-ratio reporting, U.S. Interagency Council on Homelessness reporting, and a study on a public appraisal database.',
        detail: 'Sec 701 requires the HUD Secretary to testify annually on program operations, assisted-housing conditions, and FHA fund health. Sec 702 requires monthly reports on the FHA Mutual Mortgage Insurance Fund capital ratio. The Appraisal Modernization Act (Sec 704) requires a consumer reconsideration-of-value procedure for federally backed mortgages and a GAO feasibility study on a public appraisal database.',
        comments: [] }
    ] },
    { label: 'Title VIII — Accountability, Coordination, Studies, and Reporting', items: [
      { main: 'Establishes HUD-USDA-VA and HUD-USDA coordination agreements, directs several GAO studies, and strengthens accountability for public housing agencies under a receiver or federal monitor.',
        detail: 'GAO studies (Sec 804) cover workforce (middle-income, 80-120 percent of area median) housing, housing for the elderly or disabled, public housing within 1 mile of a Superfund National Priorities List site, and residential heirs property. Sec 805 requires public housing agencies with an appointed receiver or federal monitor to disclose contracts publicly and have those monitors report and testify to Congress; the IG must review compliance on request.',
        comments: [] }
    ] },
    { label: 'Title IX — Strengthening Community Banks’ Role in Housing', items: [
      { main: 'Eases deposit, capital, and formation rules for small and newly chartered community banks and credit unions.',
        detail: 'Sec 901 lets banks under $10B in assets treat custodial deposits up to 20 percent of total liabilities as not "brokered" under the Federal Deposit Insurance Act. The American Access to Banking Act (Sec 907) directs regulators to streamline de novo bank and credit union applications with caseworkers and mentor programs, and the Promoting New Bank Formation Act (Sec 908) allows a 2-year capital-requirement phase-in for qualifying community banks (under $10B) chartered between January 1, 2026 and December 31, 2028. Other sections address reciprocal deposits, supervisory testing, credit union boards, and systemic-risk-authority transparency.',
        comments: [] }
    ] },
    { label: 'Title X — Home-Ownership for Main Street America', items: [
      { main: 'Prohibits large institutional investors from buying single-family homes, with civil penalties of up to $1M per violation and many exceptions.',
        detail: 'A "large institutional investor" is a for-profit entity controlling at least 350 single-family homes (structures of 2 or fewer units, excluding manufactured homes). Exceptions cover build-to-rent, renovate-to-rent (improvements of at least 15 percent of purchase price), homeownership programs, foreclosure and loss mitigation, and 55-and-older communities. Penalties are the greater of $1M per violation or 3 times the purchase price, with proceeds transferred to HUD for the HOME program and first-time homebuyer assistance. The prohibition does not require divesting homes owned before enactment, takes effect 180 days after enactment, and is repealed 15 years later.',
        comments: [] }
    ] },
    { label: 'Title XI — Central Bank Digital Currency', items: [
      { main: 'Prohibits the Federal Reserve from issuing a central bank digital currency, directly or indirectly, without authorization by an Act of Congress.',
        detail: 'A new section 16A of the Federal Reserve Act bars the Board of Governors or a Federal reserve bank from issuing a central bank digital currency or a substantially similar digital asset through any intermediary. An exception preserves dollar-denominated currency that is open, permissionless, and private and that preserves the privacy protections of physical cash. The provision sunsets December 31, 2030.',
        comments: [] }
    ] },
    { label: 'Title XII — Miscellaneous', items: [
      { main: 'Provides for severability and states that no additional funds are authorized to be appropriated to carry out the Act.',
        detail: 'Sec 1201 preserves the remainder of the Act if any provision is held invalid. Sec 1202 states that no additional funds are authorized to be appropriated to carry out the requirements of the Act or its amendments.',
        comments: [] }
    ] }
  ],
  underreported: [
    { section: 'Title XI, Section 1101 — central bank digital currency ban',
      summary: 'The Act bars the Federal Reserve from issuing a central bank digital currency or substantially similar digital asset, directly or indirectly, without an Act of Congress, sunsetting December 31, 2030.',
      why_unreported: 'A prohibition on a Federal Reserve digital dollar is carried inside a housing-supply bill, unrelated to the bill’s housing-and-community-development subject matter.' },
    { section: 'Title X, Section 1001 — institutional single-family-home purchase ban',
      summary: 'Large institutional investors controlling 350 or more single-family homes are barred from purchasing additional single-family homes, with civil penalties up to $1M per violation.',
      why_unreported: 'A nationwide restriction on corporate single-family-home buying, with its own penalty regime and 15-year sunset, sits beside the bill’s grant-and-zoning provisions.' },
    { section: 'Title IX — community bank deregulation',
      summary: 'Banks under $10B in assets may treat custodial deposits up to 20 percent of liabilities as non-brokered, and newly chartered community banks get a 2-year capital phase-in.',
      why_unreported: 'These are bank-regulatory changes to the Federal Deposit Insurance Act and capital rules, distinct from the bill’s housing-program subject, grouped under a housing title.' },
    { section: 'Title XII, Section 1202 — no additional funds authorized',
      summary: 'The Act states that no additional funds are authorized to be appropriated to carry out its requirements, even as Sec 208 authorizes $200M per year for the Innovation Fund.',
      why_unreported: 'A blanket no-new-funding clause sits alongside specific grant authorizations, so the new programs largely depend on existing or future appropriations.' }
  ],
  criticisms: [],
  gaps: [
    'The Act creates numerous grant and pilot programs but Sec 1202 states no additional funds are authorized to carry them out, leaving most dependent on existing or future appropriations.',
    'The institutional-investor ban (Sec 1001) does not require divesting single-family homes already owned before enactment, so it limits new purchases without reducing current holdings.',
    'The central bank digital currency prohibition (Sec 1101) sunsets December 31, 2030, but the Act does not address what governs a Federal Reserve digital currency after that date.'
  ],
  changes: { added: [
      'Innovation Fund authorizing $200M/year FY2027-2031 for high-supply localities (Sec 208)',
      'RESIDE pilot to convert vacant commercial buildings into housing (Sec 210)',
      'Family Self-Sufficiency escrow pilot for up to 5,000 families (Sec 404)',
      'Long-Term Disaster Recovery Fund and permanent CDBG disaster-recovery authority (Sec 504)',
      'Prohibition on single-family-home purchases by large institutional investors (Sec 1001)',
      'Prohibition on a Federal Reserve central bank digital currency (Sec 1101)',
      'Custodial-deposit and de novo bank formation easements for community banks (Title IX)' ],
    modified: [
      'FHA per-unit multifamily mortgage limits raised (e.g. $38,025 to $167,310) and indexing re-based (Sec 211)',
      'Rental Assistance Demonstration unit cap raised from 455,000 to 555,000 and made permanent (Sec 212)',
      'Bank public-welfare investment cap raised from 15% to 20% of capital and surplus (Sec 203)',
      'HOME program income eligibility set at 100% of area median income in places (Sec 501)',
      'Manufactured-home definition changed to allow homes with or without a permanent chassis (Sec 301)' ],
    removed: [
      'Abolishes the Regulatory Barriers Clearinghouse and repeals 42 U.S.C. 12705d (Sec 107)',
      'Strikes the $17,460-per-space cap from FHA multifamily loan limits (Sec 211)' ] },
  featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
};

const idx = cache.bills.findIndex(b => b.id === entry.id);
if (idx >= 0) { cache.bills[idx] = entry; console.log('replaced HR-6644'); }
else { cache.bills.push(entry); console.log('added HR-6644'); }
fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
console.log('Cache now', cache.bills.length, 'bills.');
