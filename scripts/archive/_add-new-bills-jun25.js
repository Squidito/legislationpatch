// One-off merge: add the Jun-25 2026 batch of newly-fetched bills to cache.json.
// In-conversation analysis per CLAUDE.md (sourced only from data/bill-text/*.txt).
// Votes are filled afterward by fetch_vote_data.js. Run: node scripts/_add-new-bills-jun25.js
const fs = require('fs');
const path = require('path');
const cachePath = path.join(__dirname, '..', 'data', 'cache.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

const entries = [
  {
    id: '119-HR-4',
    code: 'HR.4',
    title: 'Rescissions Act of 2025',
    official_title: 'To rescind certain budget authority proposed to be rescinded in special messages transmitted to the Congress by the President on June 3, 2025, in accordance with section 1012(a) of the Congressional Budget and Impoundment Control Act of 1974.',
    date: '2025-07-24',
    version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4,
    pipeline: ['Introduced', 'Committee', 'Passed House', 'Passed Senate', 'Signed'],
    sponsor: 'Rep. Scalise, Steve (R-LA)', sponsor_bioguide: 'S001176', cosponsors: 5,
    pages: 4, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2025-07-24', enactedDate: '2025-07-24',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-28 on July 24, 2025. Introduced by Rep. Steve Scalise (R-LA) with 5 cosponsors; it carried out a presidential rescissions request under the Impoundment Control Act, which allows passage by simple majority, and cleared both chambers before being signed.',
    summary: 'Cancels $7.90B in previously approved but unspent foreign-aid funding and eliminates all federal funding for the Corporation for Public Broadcasting. The money had already been appropriated; this bill takes back the unobligated balances.',
    brief: 'Rescinds $7.90B in unobligated foreign-assistance funds and all funding for the Corporation for Public Broadcasting.',
    top_lines: [
      { headline: 'Foreign Aid Rescissions', billSection: '2', subs: [
        '$2.50B in Development Assistance unobligated funds rescinded',
        '$1.65B from the Economic Support Fund rescinded',
        '$800M from Migration and Refugee Assistance rescinded' ] },
      { headline: 'Global Health and International Organizations', billSection: '2', subs: [
        '$500M in Global Health Programs rescinded, with disease programs protected',
        '$436.92M from International Organizations and Programs rescinded',
        '$125M from the Clean Technology Fund rescinded' ] },
      { headline: 'Public Broadcasting', billSection: '2', subs: [
        'All FY2026 and FY2027 Corporation for Public Broadcasting funds rescinded',
        'Dollar amount not specified in the bill text' ] }
    ],
    sections: [
      { label: 'Section 2 — Rescissions of Budget Authority', items: [
        { main: 'Rescinds the unobligated balances of 19 specified foreign-assistance accounts totaling $7.90B, effective immediately on enactment.',
          detail: 'The rescissions carry out a special message the President transmitted to Congress on June 3, 2025 under the Impoundment Control Act of 1974. The largest single items are $2.50B from Development Assistance and $1.65B from the Economic Support Fund. Several accounts carry carve-outs: Development Assistance rescissions may not draw from Feed the Future Innovation Labs or the Countering PRC Influence Fund, and Economic Support Fund rescissions may not draw from assistance to Jordan, Egypt, or the Countering PRC Influence Fund.',
          comments: [] },
        { main: 'Rescinds all amounts made available for the Corporation for Public Broadcasting for fiscal years 2026 and 2027.',
          detail: 'FY2026 CPB funds provided by Public Law 118-47 and FY2027 funds provided by Public Law 119-4 are both rescinded. The bill text does not state a dollar figure for these amounts.',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2(b)(5) — Global Health Programs carve-out',
        summary: 'The $500M Global Health rescission may not be drawn from HIV/AIDS, tuberculosis, malaria, nutrition, or maternal and child health balances, and that protection does not extend to family planning and reproductive health programs.',
        why_unreported: 'The line rescinds Global Health funds, but its provisos route the cut away from named disease programs while leaving family planning and reproductive health unprotected — the operative effect turns on the carve-outs, not the headline account.' },
      { section: 'Section 2(b)(12) and (14) — food-aid protection',
        summary: 'Development Assistance and International Disaster Assistance rescissions may not affect U.S. commodity-based food aid, including the Food for Peace program and the McGovern-Dole International Food for Education and Child Nutrition Program.',
        why_unreported: 'The rescissions target broad assistance accounts but expressly shield specific food-aid programs administered within them.' }
    ],
    criticisms: [],
    gaps: [
      'The bill rescinds Corporation for Public Broadcasting funding but does not state the dollar amount being canceled, unlike the itemized foreign-aid rescissions.',
      'The bill cancels unobligated balances but does not address whether the underlying programs continue with other funds after the rescission.'
    ],
    changes: { added: [],
      modified: ['Cancels unobligated balances across 19 foreign-assistance accounts funded by the FY2024 State-Foreign Operations Act (PL 118-47) and the Full-Year Continuing Appropriations Act, 2025 (PL 119-4)'],
      removed: ['Eliminates Corporation for Public Broadcasting funding for fiscal years 2026 (PL 118-47) and 2027 (PL 119-4)'] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
  },

  {
    id: '119-S-3424',
    code: 'S.3424',
    title: 'Bankruptcy Administration Improvement Act of 2025',
    official_title: 'To amend titles 11 and 28, United States Code, to modify the compensation payable to trustees serving in cases under chapter 7 of title 11, United States Code, to extend the term of certain temporary offices of bankruptcy judges, and for other purposes.',
    date: '2026-02-06',
    version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4,
    pipeline: ['Introduced', 'Committee', 'Passed Senate', 'Passed House', 'Signed'],
    sponsor: 'Sen. Coons, Christopher A. (D-DE)', sponsor_bioguide: 'C001088', cosponsors: 3,
    pages: 5, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2026-02-06', enactedDate: '2026-02-06',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-76 on February 6, 2026. Introduced by Sen. Chris Coons (D-DE) with 3 cosponsors; its trustee-pay increase is funded entirely by bankruptcy-system fees rather than taxpayer appropriations, which limited cost objections, and it cleared both chambers before being signed.',
    summary: 'Raises the pay of Chapter 7 bankruptcy trustees, who administer most consumer bankruptcies, from $60 to $120 per case, and pays for it by raising bankruptcy fees. It also extends the terms of several temporary bankruptcy judgeships from 5 to 10 years.',
    brief: 'Doubles per-case Chapter 7 trustee compensation to $120, funded by higher bankruptcy fees, and extends temporary bankruptcy judgeships to 10-year terms.',
    top_lines: [
      { headline: 'Trustee Compensation', billSection: '3', subs: [
        'Per-case Chapter 7 trustee pay raised from $60 to $120',
        'Base statutory payment raised from $45 to $105 (plus the existing $15)',
        'Applies to cases filed on or after the first October 1 after enactment' ] },
      { headline: 'Bankruptcy Fees and Fund Allocation', billSection: '4', subs: [
        'Quarterly-fee lookback extended from 5 years to 10 years',
        'Upper quarterly-fee rate raised from 0.8% to 0.9% of disbursements',
        '$5.4M of fees redirected to the general Treasury each year, FY2026-2031' ] },
      { headline: 'Temporary Bankruptcy Judgeships', billSection: '5', subs: [
        'Terms of specified temporary judgeships extended from 5 to 10 years',
        'Covers judgeships under the 2020 and 2017 bankruptcy judgeship acts' ] }
    ],
    sections: [
      { label: 'Section 3 — Trustee Compensation', items: [
        { main: 'Raises the base statutory compensation for Chapter 7 trustees under 11 U.S.C. 330(b)(1) from $45 to $105 per case, bringing total per-case compensation to $120.',
          detail: 'The findings state that trustee pay had stayed at $60 per case (a $45 component plus a $15 component) since 1994. The bill strikes subsection 330(e) and reallocates the remainder of fees collected under 28 U.S.C. 1930(a)(1)(A): $63.51 to the section 1931 Treasury fund, $25.00 to a Deficit Reduction Act of 2005 fund, and $51.49 to the United States Trustee System Fund. The United States Trustee System Fund deposit formula in 28 U.S.C. 589a is changed from "40.46 percent of the fees collected" to a flat "$51.49 of the fees collected in each case."',
          comments: [] }
      ] },
      { label: 'Section 4 — Bankruptcy Fees', items: [
        { main: 'Adjusts the Chapter 11 quarterly fee structure and redirects $5.4M of collected fees per year to the general Treasury through fiscal year 2031.',
          detail: 'The quarterly-fee measurement period in 28 U.S.C. 1930(a)(6)(B) is extended from 5 years to 10 years, the upper rate is raised from 0.8 percent to 0.9 percent of disbursements, and a "greater of" floor is added to the 0.4 percent alternative. For each of fiscal years 2026 through 2031, $5,400,000 of the quarterly fees collected is deposited in the general fund of the Treasury, with the remainder deposited as specified in section 589a(f).',
          comments: [] }
      ] },
      { label: 'Section 5 — Extension of Temporary Bankruptcy Judgeships', items: [
        { main: 'Extends the terms of certain temporary bankruptcy judge offices from 5 years to 10 years.',
          detail: 'The change applies to temporary judgeships authorized under Section 4 of the Bankruptcy Administration Improvement Act of 2020 and Section 1003(b)(2)(A) of the Bankruptcy Judgeship Act of 2017, each amended to replace "5 years" with "10 years."',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 4(c) — fees diverted to the general fund',
        summary: 'For each of fiscal years 2026 through 2031, $5.4M of the quarterly fees collected is deposited into the general fund of the Treasury rather than the bankruptcy-system funds.',
        why_unreported: 'The bill is framed around keeping the bankruptcy system self-funding, but this provision routes a fixed slice of fee revenue to the general Treasury, away from the trustee and court funds the other provisions support.' },
      { section: 'Section 3(a)(2) — repeal of subsection 330(e)',
        summary: 'The bill strikes subsection (e) of 11 U.S.C. 330 in the course of raising trustee pay.',
        why_unreported: 'The compensation increase is the headline, but it is paired with the removal of an existing subsection of the trustee-compensation statute.' }
    ],
    criticisms: [],
    gaps: [
      'The findings note trustees receive no compensation for cases in which the filing fee is waived, but the bill does not provide compensation for those waived-fee cases.',
      'The bill raises per-case trustee pay to $120 but does not index that amount for future inflation, the same gap the findings identify with the 1994 figure.'
    ],
    changes: { added: ['Adds a fixed $5.4M annual deposit of bankruptcy fees to the general Treasury for fiscal years 2026-2031'],
      modified: ['Chapter 7 trustee base compensation raised from $45 to $105 per case (11 U.S.C. 330(b)(1))',
        'Chapter 11 upper quarterly-fee rate raised from 0.8% to 0.9% of disbursements (28 U.S.C. 1930(a)(6)(B))',
        'Quarterly-fee measurement period extended from 5 years to 10 years',
        'Terms of specified temporary bankruptcy judgeships extended from 5 years to 10 years'],
      removed: ['Strikes subsection (e) of 11 U.S.C. 330'] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
  },

  {
    id: '119-S-269',
    code: 'S.269',
    title: 'Ending Improper Payments to Deceased People Act',
    official_title: 'To improve coordination between Federal and State agencies and the Do Not Pay working system.',
    date: '2026-02-10',
    version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4,
    pipeline: ['Introduced', 'Committee', 'Passed Senate', 'Passed House', 'Signed'],
    sponsor: 'Sen. Kennedy, John (R-LA)', sponsor_bioguide: 'K000393', cosponsors: 5,
    pages: 2, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2026-02-10', enactedDate: '2026-02-10',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-77 on February 10, 2026. Introduced by Sen. John Kennedy (R-LA) with 5 cosponsors; its aim of curbing payments to deceased people drew bipartisan support, and it cleared both chambers before being signed.',
    summary: 'Directs the Social Security Administration to share its death records with the federal "Do Not Pay" system so agencies can stop sending benefits and payments to people who have died. It also requires strong evidence before SSA marks someone as deceased.',
    brief: 'Requires the Social Security Administration to share death data with the Do Not Pay system to prevent improper payments to deceased people.',
    top_lines: [
      { headline: 'Death Data Sharing', billSection: '2', subs: [
        'SSA must, to the extent feasible, send death information to the Do Not Pay system',
        'Agencies use it to prevent and recover improper payments',
        'A cost-share agreement covers each side’s portion of state death-data costs' ] },
      { headline: 'Accuracy Safeguards', billSection: '2', subs: [
        'SSA may not record a death without clear and convincing evidence',
        'Agencies must be notified when someone is wrongly listed as deceased' ] }
    ],
    sections: [
      { label: 'Section 2 — Coordination With the Do Not Pay Working System', items: [
        { main: 'Requires the Commissioner of Social Security to provide death information to the agency operating the Do Not Pay working system, under a cost-sharing agreement, to help prevent and recover improper payments.',
          detail: 'The provision amends Section 205(r) of the Social Security Act (42 U.S.C. 405(r)). SSA and the Do Not Pay operator must enter an agreement based on an agreed methodology covering the proportional share of state death-data costs, subject to periodic review. The amendments take effect on December 27, 2026.',
          comments: [] },
        { main: 'Bars SSA from recording a death on a shareable record unless it has clear and convincing evidence the individual should be presumed deceased, and requires notice when a living person is wrongly listed.',
          detail: 'A new paragraph requires that any agency with a cooperative arrangement under the statute be notified of an error when an individual is incorrectly identified as deceased.',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2 — clear-and-convincing evidence standard',
        summary: 'SSA may not record a death to a shareable record for any individual unless it has clear and convincing evidence supporting a presumption of death.',
        why_unreported: 'The bill is framed around stopping payments to the deceased, but this clause sets an evidentiary floor that constrains when SSA can flag someone as dead, guarding against living people being cut off in error.' }
    ],
    criticisms: [],
    gaps: [
      'The bill requires notifying agencies when someone is incorrectly listed as deceased but does not set a deadline for issuing that correction.',
      'The data-sharing requirement applies "to the extent feasible," but the bill does not define what makes sharing infeasible.'
    ],
    changes: { added: ['New requirement that agencies be notified when an individual is incorrectly identified as deceased (42 U.S.C. 405(r)(7)(C))',
        'New evidentiary standard barring SSA from recording a death without clear and convincing evidence'],
      modified: ['Directs SSA to share death data with the Do Not Pay working system under a cost-share agreement (42 U.S.C. 405(r)(11))'],
      removed: [] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
  },

  {
    id: '119-S-254',
    code: 'S.254',
    title: 'ARTIST Act',
    official_title: 'To amend the Marine Mammal Protection Act of 1972 to protect the cultural practices and livelihoods of producers of Alaska Native handicrafts and marine mammal ivory products, and for other purposes.',
    date: '2026-06-12',
    version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4,
    pipeline: ['Introduced', 'Committee', 'Passed Senate', 'Passed House', 'Signed'],
    sponsor: 'Sen. Sullivan, Dan (R-AK)', sponsor_bioguide: 'S001198', cosponsors: 1,
    pages: 3, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2026-06-12', enactedDate: '2026-06-12',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-99 on June 12, 2026. Introduced by Sen. Dan Sullivan (R-AK) with 1 cosponsor; the Alaska Native handicraft and ivory provisions are regionally focused with limited organized opposition, and the bill cleared both chambers before being signed.',
    summary: 'Rewrites the Alaska Native exemption in the Marine Mammal Protection Act to protect the right of coastal Alaska Natives to harvest marine mammals for subsistence and to make and sell authentic handicrafts, including items made from walrus and whale ivory. It also bars states from blocking interstate sale of those handicrafts.',
    brief: 'Strengthens and rewrites the Marine Mammal Protection Act exemption for Alaska Native subsistence harvest and the sale of authentic ivory and marine-mammal handicrafts.',
    top_lines: [
      { headline: 'Alaska Native Harvest Exemption', billSection: '2', subs: [
        'Coastal Alaska Natives may take marine mammals for subsistence or to make and sell authentic handicrafts',
        'Harvest must not be done in a wasteful manner',
        'Defines "marine mammal ivory" as walrus or cetacean tooth or tusk' ] },
      { headline: 'Sale and Interstate Commerce', billSection: '2', subs: [
        'No state may prohibit interstate sale, trade, or possession of qualifying Alaska Native handicrafts',
        'Authentic items may be sold in interstate commerce only if they meet the handicraft definition',
        'Edible portions may be sold for native consumption in Alaska native villages' ] },
      { headline: 'Depletion Safeguards', billSection: '2', subs: [
        'If a species is found depleted, the Secretary may regulate Alaska Native taking',
        'Such regulations require notice, hearing, and substantial evidence including Indigenous knowledge',
        'Regulations must be removed once the need disappears' ] }
    ],
    sections: [
      { label: 'Section 2 — Alaska Native Handicrafts', items: [
        { main: 'Replaces the Alaska Native exemption in Section 101(b) of the Marine Mammal Protection Act (16 U.S.C. 1371(b)) with a rewritten exemption covering subsistence taking and the creation and sale of authentic Alaska Native handicrafts and clothing.',
          detail: 'The exemption applies to Alaska Natives who reside in Alaska and dwell on the coast of the North Pacific or Arctic Ocean. "Authentic Alaska Native article of handicrafts and clothing" must be made of natural materials, fashioned in traditional handicrafts (weaving, carving, stitching, sewing, lacing, beading, drawing, painting), and made without a pantograph, multiple carvers, or other mass-copying device. Taking must not be wasteful.',
          comments: [] },
        { main: 'Prohibits any state from blocking the interstate commerce, sale, transfer, or possession of marine mammal ivory, bone, or baleen incorporated by an Alaska Native into an authentic handicraft.',
          detail: 'Authentic items may be sold in interstate commerce only if they meet the statutory handicraft definition. Edible portions of a marine mammal taken for handicraft purposes may be sold for native consumption or in a native village or town in Alaska.',
          comments: [] },
        { main: 'Allows the Secretary to regulate Alaska Native taking of a species found to be depleted, subject to notice-and-hearing and a substantial-evidence requirement.',
          detail: 'Regulations may be set by species or stock, geographic area, or season, must be supported by substantial evidence considering the whole record including Indigenous knowledge, and must be removed once the need disappears. The substantial-evidence requirement applies only in an action brought by one or more Alaska Native organizations.',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2 — substantial-evidence requirement limited to Native-brought actions',
        summary: 'The requirement that the Secretary demonstrate depletion findings and regulations are supported by substantial evidence (including Indigenous knowledge) applies only in an action brought by one or more Alaska Native organizations.',
        why_unreported: 'The substantial-evidence standard reads as a general constraint on the Secretary, but its applicability clause limits it to litigation initiated by Alaska Native organizations.' },
      { section: 'Section 2(b)(4) — state preemption',
        summary: 'No state may prohibit interstate commerce, importation, sale, possession, or barter of marine mammal ivory, bone, or baleen incorporated by an Alaska Native into an authentic handicraft.',
        why_unreported: 'Several states restrict ivory sales; this clause overrides those restrictions for qualifying Alaska Native handicrafts, a federal preemption beyond the headline subsistence exemption.' }
    ],
    criticisms: [],
    gaps: [
      'The bill protects interstate sale of authentic handicrafts but does not establish how a buyer or state verifies that an item meets the "authentic" definition.',
      'The exemption covers Natives who dwell on the North Pacific or Arctic coast but does not address Alaska Natives who reside inland.'
    ],
    changes: { added: ['New federal bar on state restrictions of interstate commerce in qualifying Alaska Native ivory handicrafts',
        'Definitions for "authentic Alaska Native article of handicrafts and clothing," "marine mammal ivory," and "traditional Alaska Native handicrafts"'],
      modified: ['Rewrites the Alaska Native exemption in Section 101(b) of the Marine Mammal Protection Act (16 U.S.C. 1371(b))'],
      removed: [] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
  },

  {
    id: '119-S-160',
    code: 'S.160',
    title: 'Aerial Firefighting Enhancement Act of 2025',
    official_title: 'To amend the Wildfire Suppression Aircraft Transfer Act of 1996 to reauthorize the sale by the Department of Defense of aircraft and parts for wildfire suppression purposes, and for other purposes.',
    date: '2025-06-12',
    version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4,
    pipeline: ['Introduced', 'Committee', 'Passed Senate', 'Passed House', 'Signed'],
    sponsor: 'Sen. Sheehy, Tim (R-MT)', sponsor_bioguide: 'S001232', cosponsors: 8,
    pages: 1, analyzed: true, demo: false, billType: 'reauthorization',
    stageDate: '2025-06-12', enactedDate: '2025-06-12',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-18 on June 12, 2025. Introduced by Sen. Tim Sheehy (R-MT) with 8 cosponsors; reauthorizing the existing DoD wildfire-aircraft transfer authority drew bipartisan support, and the bill cleared both chambers before being signed.',
    summary: 'The Wildfire Suppression Aircraft Transfer Act of 1996 lets the Department of Defense sell surplus aircraft and parts to companies that fight wildfires. This bill renews that sale authority through October 1, 2035 and clarifies that the aircraft may be used to drop water as well as fire retardant.',
    brief: 'Reauthorizes the Department of Defense’s authority to sell aircraft and parts for wildfire suppression through October 1, 2035, and extends it to cover water drops.',
    top_lines: [
      { headline: 'What the Aircraft Transfer Authority Does', billSection: '2', subs: [
        'Lets the Department of Defense sell aircraft and parts for wildfire suppression',
        'Aircraft sold may be used only to provide aircraft services for wildfire suppression' ] },
      { headline: 'What This Bill Changes', billSection: '2', subs: [
        'Reauthorizes the sale authority through October 1, 2035',
        'Extends "fire retardant" use to include "or water"' ] }
    ],
    sections: [
      { label: 'Section 2 — Modification and Reauthorization of DoD Aircraft Sale Authority', items: [
        { main: 'Amends the Wildfire Suppression Aircraft Transfer Act of 1996 to set the period for exercising the sale authority as beginning on enactment and ending October 1, 2035.',
          detail: 'The amendment to Public Law 104-307 (10 U.S.C. 2576 note) also inserts "or water" after "fire retardant" in two places and narrows subsection (b) so that aircraft sold under the authority may be used only for the provision of aircraft services for wildfire suppression purposes.',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2(2) — use restricted to aircraft services',
        summary: 'Subsection (b) is rewritten so aircraft sold under the authority may be used only for the provision of aircraft services for wildfire suppression purposes.',
        why_unreported: 'Alongside the reauthorization, this narrows permissible use of the transferred aircraft to wildfire-suppression aircraft services, a use limitation separate from the headline date extension.' }
    ],
    criticisms: [],
    gaps: [
      'The bill reauthorizes the sale authority through 2035 but does not address what happens to aircraft already sold once the authority next expires.'
    ],
    changes: { added: [],
      modified: ['Reauthorizes the DoD wildfire-aircraft sale authority through October 1, 2035 (Wildfire Suppression Aircraft Transfer Act of 1996)',
        'Adds "or water" to the permitted use alongside "fire retardant"',
        'Restricts use of sold aircraft to the provision of aircraft services for wildfire suppression'],
      removed: [] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
  },

  {
    id: '119-HR-42',
    code: 'HR.42',
    title: 'Alaska Native Settlement Trust Eligibility Act',
    official_title: 'To amend the Alaska Native Claims Settlement Act to exclude certain payments to aged, blind, or disabled Alaska Natives or descendants of Alaska Natives from being used to determine eligibility for certain programs, and for other purposes.',
    date: '2025-07-07',
    version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4,
    pipeline: ['Introduced', 'Committee', 'Passed House', 'Passed Senate', 'Signed'],
    sponsor: 'Rep. Begich, Nicholas (R-AK)', sponsor_bioguide: 'B001323', cosponsors: 0,
    pages: 1, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2025-07-07', enactedDate: '2025-07-07',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-22 on July 7, 2025. Introduced by Rep. Nick Begich (R-AK) with no cosponsors; the narrow benefit-eligibility fix for aged, blind, or disabled Alaska Natives drew no recorded opposition and cleared both chambers before being signed.',
    summary: 'Makes sure that money or benefits an aged, blind, or disabled Alaska Native receives from a Settlement Trust are not counted against them when determining eligibility for need-based programs. The protection lasts for five years after enactment.',
    brief: 'Excludes Settlement Trust distributions to aged, blind, or disabled Alaska Natives from benefit-eligibility calculations for five years.',
    top_lines: [
      { headline: 'Settlement Trust Eligibility Exclusion', billSection: '2', subs: [
        'Settlement Trust distributions to aged, blind, or disabled Natives excluded from eligibility tests',
        'Protection runs for 5 years from enactment',
        'Uses the Social Security Act definition of aged, blind, or disabled individual' ] }
    ],
    sections: [
      { label: 'Section 2 — Eligibility for Certain Programs', items: [
        { main: 'Amends Section 29(c) of the Alaska Native Claims Settlement Act (43 U.S.C. 1626(c)) so that, for five years after enactment, an amount distributed from or benefit provided by a Settlement Trust to an aged, blind, or disabled Native or descendant is not used to determine eligibility for certain programs.',
          detail: 'The provision retains the existing exclusion of an interest in a Settlement Trust and adds the time-limited distribution exclusion. "Aged, blind, or disabled individual" is defined by reference to section 1614(a) of the Social Security Act (42 U.S.C. 1382c(a)).',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2 — five-year sunset',
        summary: 'The exclusion of Settlement Trust distributions and benefits applies only for the 5-year period beginning on the date of enactment.',
        why_unreported: 'The protection is temporary; without further action the distribution exclusion expires five years after enactment, while the underlying exclusion of a trust interest remains.' }
    ],
    criticisms: [],
    gaps: [
      'The bill protects aged, blind, or disabled beneficiaries for five years but does not address whether the exclusion will be extended or made permanent before it sunsets.'
    ],
    changes: { added: [],
      modified: ['Amends Section 29(c) of the Alaska Native Claims Settlement Act (43 U.S.C. 1626(c)) to exclude Settlement Trust distributions to aged, blind, or disabled Natives from eligibility determinations for five years'],
      removed: [] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
  },

  {
    id: '119-HR-43',
    code: 'HR.43',
    title: 'Alaska Native Village Municipal Lands Restoration Act of 2025',
    official_title: 'To amend the Alaska Native Claims Settlement Act to provide that Village Corporations shall not be required to convey land in trust to the State of Alaska for the establishment of Municipal Corporations, and for other purposes.',
    date: '2025-07-07',
    version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4,
    pipeline: ['Introduced', 'Committee', 'Passed House', 'Passed Senate', 'Signed'],
    sponsor: 'Rep. Begich, Nicholas (R-AK)', sponsor_bioguide: 'B001323', cosponsors: 0,
    pages: 2, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2025-07-07', enactedDate: '2025-07-07',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-23 on July 7, 2025. Introduced by Rep. Nick Begich (R-AK) with no cosponsors; the change to Alaska Native Village Corporation land-conveyance obligations drew no recorded opposition and cleared both chambers before being signed.',
    summary: 'Under current law, Alaska Native Village Corporations had to convey some of their land in trust to the State of Alaska to support future municipal governments. This bill ends that requirement going forward and lets a Village Corporation reclaim land it already put in trust if no municipal government was ever established.',
    brief: 'Ends the requirement that Alaska Native Village Corporations convey land in trust for future municipalities and allows reversion of unused trust land.',
    top_lines: [
      { headline: 'No Future Trust Conveyance Required', billSection: '2', subs: [
        'Village Corporations no longer required to convey land in trust for future municipal corporations',
        'Applies as of the date of enactment' ] },
      { headline: 'Reversion of Unused Trust Land', billSection: '2', subs: [
        'Trust land conveyed for a municipality that was never established can revert to the Village Corporation',
        'Requires a formal resolution by the Village Corporation and the village residents',
        'Reversion is subject to existing rights, easements, and roadway access' ] }
    ],
    sections: [
      { label: 'Section 2 — Reversion of Certain Land Conveyed in Trust to the State of Alaska', items: [
        { main: 'Amends Section 14(c) of the Alaska Native Claims Settlement Act (43 U.S.C. 1613(c)) so a Village Corporation is no longer required to convey additional land in trust to the State for the future establishment of a Municipal Corporation.',
          detail: 'Where a Village Corporation, before enactment, conveyed land in trust for a municipality that has not been established as of enactment, the trust may be dissolved and title revert to the Village Corporation on formal resolution by the corporation and the residents of the Native village. Reversion is subject to valid existing rights created by the trust and existing easements or rights-of-way for public roadway access, and the Village Corporation assumes the trust’s obligations under any lease or use agreement on reversion. The amendment also makes technical redesignations and fixes the relevant date as December 18, 1971.',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2 — Village Corporation assumes trust obligations on reversion',
        summary: 'When trust land reverts to a Village Corporation, the corporation must assume the obligations of the applicable trust with respect to any lease or other use agreement on the land.',
        why_unreported: 'The headline is land returning to Village Corporations, but reversion carries forward the trust’s existing lease and use-agreement obligations along with valid existing rights and roadway easements.' }
    ],
    criticisms: [],
    gaps: [
      'The bill allows reversion of trust land where no municipality was established but does not address land already conveyed for municipalities that were established.'
    ],
    changes: { added: ['New process for dissolving a trust and reverting land to a Village Corporation where a municipality was never established'],
      modified: ['Amends Section 14(c) of the Alaska Native Claims Settlement Act (43 U.S.C. 1613(c)) to end required trust conveyances for future municipalities'],
      removed: ['Removes the requirement that Village Corporations convey additional land in trust for the future establishment of a Municipal Corporation'] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
  },

  {
    id: '119-HR-4238',
    code: 'HR.4238',
    title: 'DLARA',
    official_title: 'To improve accountability in the disaster loan program of the Small Business Administration, and for other purposes.',
    date: '2026-06-24',
    version: 'v1.0',
    stage: 'house', stageLabel: 'Passed House', currentStep: 2,
    pipeline: ['Introduced', 'Committee', 'Passed House', 'Passed Senate', 'Signed'],
    sponsor: 'Rep. Moore, Tim (R-NC)', sponsor_bioguide: 'M001236', cosponsors: 19,
    pages: 7, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2026-06-24',
    likelihood: 60, likelihoodLabel: 'Likely',
    likelihoodReason: 'Introduced by Rep. Tim Moore (R-NC) with 19 cosponsors in the Republican-led House. The bill adds reporting and oversight requirements to the SBA disaster loan program rather than new spending, the kind of accountability measure that tends to draw bipartisan support; its main friction is the temporary authority to limit loan obligations when funding runs low, which could concern members whose districts rely on disaster lending.',
    summary: 'Adds accountability and reporting rules to the Small Business Administration’s disaster loan program. It requires more frequent and detailed reports to Congress, new budget disclosures, GAO and Inspector General reviews, and gives the SBA a temporary tool to limit new loan obligations when disaster-loan funding runs low.',
    brief: 'Imposes new reporting, budgeting, and oversight requirements on the SBA disaster loan program and adds a temporary low-funding loan-limitation authority.',
    top_lines: [
      { headline: 'Disaster Loan Reporting', billSection: '4', subs: [
        'Monthly reports must project when funding hits 10% of the latest appropriation and when it will be depleted',
        'Reports must detail any changes to obligation and expenditure estimates',
        'Bars official-travel funds for the Administrator until a required report is submitted' ] },
      { headline: 'Budget Disclosures', billSection: '5', subs: [
        'Budget must separately state SBA disaster loan and COVID-EIDL loan costs against a 10-year average',
        'Same disclosure required for administrative costs' ] },
      { headline: 'Low-Funding Limitation Authority', billSection: '6', subs: [
        'SBA must notify Congress within 24 hours when funding falls below 10% of the 10-year average cost',
        'SBA may then limit new loan obligations to loans requiring collateral until more funds are appropriated',
        'Authority sunsets 4 years after enactment' ] },
      { headline: 'GAO and Inspector General Reviews', billSection: '7', subs: [
        'GAO reports on disbursement rates and on two 2023-2024 disaster-loan rule changes',
        'SBA Inspector General reviews the disaster-loan funding shortfall flagged in October 2024' ] }
    ],
    sections: [
      { label: 'Section 4 — Monthly Disaster Loan Reports', items: [
        { main: 'Amends the monthly disaster-loan reporting requirement so reports project the date funding will reach 10 percent of the most recent appropriation and the date funds will be depleted, and detail any changes to obligation and expenditure estimates.',
          detail: 'The provision amends 15 U.S.C. 636k(a). It adds a prohibition: if the Administrator does not submit a required monthly report by the deadline, no funds may be obligated for the Administrator’s official travel until the report is submitted.',
          comments: [] }
      ] },
      { label: 'Section 5 — Budget Request Relating to Disaster Loans', items: [
        { main: 'Requires the President’s budget to separately state requested amounts for SBA disaster loan costs and COVID-EIDL loan costs against their 10-year averages, with an explanation of any difference.',
          detail: 'Amends 31 U.S.C. 1105 to add the disclosures for both program costs and administrative costs, and defines "COVID-EIDL loan" and "SBA disaster loan" for those paragraphs.',
          comments: [] }
      ] },
      { label: 'Section 6 — Limitations on Disaster Loans', items: [
        { main: 'Requires SBA to notify Congress within 24 hours when the unobligated balance for disaster loans falls below 10 percent of the 10-year average annual cost, and allows SBA to then limit new loan obligations to loans requiring collateral until more funds are appropriated.',
          detail: 'The new paragraph (17) of 15 U.S.C. 636(b) requires that once additional funds are appropriated, SBA disburse remaining loan amounts on a regular schedule within 14 days. The authority sunsets 4 years after enactment, and GAO must report within 1 year if the limitation authority is used.',
          comments: [] }
      ] },
      { label: 'Section 7 — GAO Report on SBA Disaster Loan Account', items: [
        { main: 'Directs GAO to report within 180 days on disaster-loan obligation rates and average weekly disbursements to borrowers, separated by home, business, and economic injury borrowers.',
          detail: 'The report covers periods anchored to October 1, 2015 and July 31, 2023. SBA must respond within 90 days with an implementation plan for any recommendations.',
          comments: [] }
      ] },
      { label: 'Sections 8-10 — Additional Reviews and Reports', items: [
        { main: 'Adds a GAO report on the budget cost of two 2023-2024 disaster-loan rule changes, an SBA Inspector General review of the disaster-loan funding shortfall, and an SBA budget-forecasting correction report.',
          detail: 'Section 8 covers two final rules from 2023 and 2024 on maximum and unsecured loan amounts. Section 9 directs the Inspector General to review the shortfall described in October 2024 letters from the President and the Administrator. Section 10 requires SBA to report within 30 days on forecasting and budget-assumption corrections, with updates every 90 days until complete.',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 4(3) — official-travel funding cutoff',
        summary: 'If the Administrator misses a required monthly disaster-loan report deadline, no funds may be obligated for the Administrator’s official travel until the report is submitted.',
        why_unreported: 'Among reporting requirements, this attaches a direct personal-travel funding consequence to a missed report deadline, an enforcement mechanism distinct from the disclosure rules themselves.' },
      { section: 'Section 6(b) — sunset of the limitation authority',
        summary: 'The low-funding authority to limit loan obligations is repealed four years after enactment.',
        why_unreported: 'The headline new power to throttle lending when funds run low is temporary and self-repealing after four years, not a permanent change to the program.' }
    ],
    criticisms: [],
    gaps: [
      'The bill lets SBA limit new loan obligations to collateral-backed loans when funding is low but does not address applicants who cannot offer collateral during that period.',
      'The bill requires extensive reporting on the disaster-loan funding shortfall but does not itself appropriate additional funds for the program.'
    ],
    changes: { added: ['New requirement to notify Congress within 24 hours when disaster-loan funding falls below 10% of the 10-year average cost (15 U.S.C. 636(b)(17))',
        'New temporary authority to limit new loan obligations to collateral-backed loans during low-funding periods, sunsetting after 4 years',
        'New GAO and SBA Inspector General reviews of disaster-loan disbursements, rule changes, and the funding shortfall',
        'New budget disclosures of disaster-loan and COVID-EIDL costs against 10-year averages (31 U.S.C. 1105)'],
      modified: ['Expands the monthly disaster-loan report to project funding-depletion dates and estimate changes (15 U.S.C. 636k(a))'],
      removed: [] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
  },

  {
    id: '119-S-629',
    code: 'S.629',
    title: 'Emergency Conservation Program Improvement Act of 2025',
    official_title: 'To amend the Agricultural Credit Act of 1978 to remove barriers to agricultural producers in accessing funds to carry out emergency measures under the emergency conservation program, and for other purposes.',
    date: '2026-06-23',
    version: 'v1.0',
    stage: 'house', stageLabel: 'Passed House', currentStep: 3,
    pipeline: ['Introduced', 'Committee', 'Passed Senate', 'Passed House', 'Signed'],
    sponsor: 'Sen. Fischer, Deb (R-NE)', sponsor_bioguide: 'F000463', cosponsors: 2,
    pages: 2, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2026-06-23',
    likelihood: 75, likelihoodLabel: 'Likely',
    likelihoodReason: 'Introduced by Sen. Deb Fischer (R-NE) with a bipartisan trio of cosponsors (Sens. Luján and Schiff, both Democrats). The bill eases advance-payment access for farmers recovering from disasters under existing conservation programs, a constituency-driven change with support across rural-state members of both parties and little organized opposition.',
    summary: 'Makes it easier for farmers and forest owners to get federal help repairing land after disasters. It lets them receive part of an Emergency Conservation Program or Emergency Forest Restoration Program payment up front, before doing the work, and gives them more time to use the funds.',
    brief: 'Lets farmers and forest landowners receive advance payments for emergency conservation and forest-restoration work and extends the time to use the funds.',
    top_lines: [
      { headline: 'Advance Payments for Emergency Conservation', billSection: '2', subs: [
        'Producers may receive 75% of replacement cost up front, before doing the work',
        'Producers may receive 50% of repair or restoration cost up front',
        'Covers emergency measures to restore farmland or conservation structures' ] },
      { headline: 'More Time and Broader Wildfire Coverage', billSection: '2', subs: [
        'Window to use funds extended from 60 days to 180 days',
        'Eligible wildfire damage includes federally caused fires and natural spread of human-caused fires' ] },
      { headline: 'Emergency Forest Restoration Advance Payments', billSection: '3', subs: [
        'Owners of nonindustrial private forest land may receive up to 75% of emergency-measure cost up front',
        'Unspent advance funds must be returned after 180 days' ] }
    ],
    sections: [
      { label: 'Section 2 — Improving the Emergency Conservation Program', items: [
        { main: 'Amends Section 401 of the Agricultural Credit Act of 1978 (16 U.S.C. 2201) to give producers the option of advance payments before carrying out emergency work: 75 percent of replacement cost, or 50 percent of repair or restoration cost.',
          detail: 'The amendment extends eligible measures beyond fencing to other emergency measures to replace or restore farmland or conservation structures requiring an immediate response, extends a 60-day period to 180 days, and defines eligible wildfire damage to include a wildfire caused by the Federal Government and the natural spread of a non-naturally-caused wildfire.',
          comments: [] }
      ] },
      { label: 'Section 3 — Improving the Emergency Forest Restoration Program', items: [
        { main: 'Amends Section 407 of the Agricultural Credit Act of 1978 (16 U.S.C. 2206) to let owners of nonindustrial private forest land receive up to 75 percent of emergency-measure costs in advance.',
          detail: 'The provision adds the same broadened wildfire definition (federally caused fires and natural spread of human-caused fires) and requires that advance funds not expended within 180 days be returned within a reasonable timeframe.',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2(c) / Section 3(1) — federally caused wildfires made eligible',
        summary: 'Eligible wildfire damage is defined to include a wildfire caused by the Federal Government, as well as the natural spread of a wildfire that was not naturally caused.',
        why_unreported: 'Beyond the advance-payment headline, the bill expands which fires qualify for assistance to include those caused by the Federal Government, broadening program eligibility.' }
    ],
    criticisms: [],
    gaps: [
      'The bill provides advance payments before work is done but, for the conservation program, does not specify a return requirement for unspent advances the way the forest-restoration section does.',
      'The bill broadens eligibility to federally caused wildfires but does not address cost recovery from the federal entity responsible for such a fire.'
    ],
    changes: { added: ['New advance-payment options under the Emergency Conservation Program (75% replacement, 50% repair) and the Emergency Forest Restoration Program (up to 75%)',
        'New eligibility for wildfire damage caused by the Federal Government and the natural spread of human-caused wildfires'],
      modified: ['Extends the emergency-conservation funding window from 60 days to 180 days (16 U.S.C. 2201)'],
      removed: [] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
  },

  {
    id: '119-HR-915',
    code: 'HR.915',
    title: 'Small Business Technological Act of 2025',
    official_title: 'To authorize small business loans to finance access to modern business software, and for other purposes.',
    date: '2026-06-24',
    version: 'v1.0',
    stage: 'house', stageLabel: 'Passed House', currentStep: 2,
    pipeline: ['Introduced', 'Committee', 'Passed House', 'Passed Senate', 'Signed'],
    sponsor: 'Rep. Alford, Mark (R-MO)', sponsor_bioguide: 'A000379', cosponsors: 3,
    pages: 1, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2026-06-24',
    likelihood: 55, likelihoodLabel: 'Possible',
    likelihoodReason: 'Introduced by Rep. Mark Alford (R-MO) with 3 cosponsors. The bill simply clarifies that SBA 7(a) loans may finance business software and cloud services, a low-controversy expansion of permitted loan uses likely to draw bipartisan support, though small standalone SBA bills often wait to move as part of a larger package.',
    summary: 'Clarifies that the Small Business Administration’s main 7(a) loan program can be used to pay for business software and cloud computing services, including tools that use artificial intelligence. It confirms these are allowable uses for small business loans.',
    brief: 'Authorizes SBA 7(a) business loans to finance business software and cloud computing services, including AI tools.',
    top_lines: [
      { headline: 'Software and Cloud as Loan Uses', billSection: '2', subs: [
        'SBA 7(a) loans may finance business software and cloud computing services',
        'Covers tools for payroll, HR, sales, billing, accounting, and inventory',
        'Expressly includes business tools that use artificial intelligence' ] }
    ],
    sections: [
      { label: 'Section 2 — Additional Uses for SBA Business Loans', items: [
        { main: 'Amends Section 7(a) of the Small Business Act (15 U.S.C. 636(a)) to let the SBA make loans financing business software or cloud computing services that facilitate business operations.',
          detail: 'Covered uses include product or service delivery; payroll processing, payment, or tracking; human resources; sales and billing; and accounting or tracking of supplies, inventory, records, and expenses, including business tools that use artificial intelligence. Rules of construction state the change does not imply prior such loans were impermissible, does not authorize loans for research and development, and does not limit the existing definition of working capital.',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2(b) — research-and-development carve-out',
        summary: 'A rule of construction states the amendment does not authorize the use of 7(a) loans for research and development purposes.',
        why_unreported: 'While the bill expands loan uses to software and AI tools, it expressly excludes research and development, limiting how far the new authority reaches.' }
    ],
    criticisms: [],
    gaps: [
      'The bill authorizes software and cloud financing but does not set any dollar limit specific to these uses within the existing 7(a) loan framework.'
    ],
    changes: { added: ['New authorized use of SBA 7(a) loans for business software and cloud computing services, including AI tools (15 U.S.C. 636(a))'],
      modified: [],
      removed: [] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
  },

  {
    id: '119-HR-7401',
    code: 'HR.7401',
    title: 'Small Business Lending Fraud Prevention Act',
    official_title: 'To require employees of the Small Business Administration to certify that the employee does not have any prohibited conflicts of interest with respect to loans in which the employee is involved, and for other purposes.',
    date: '2026-06-24',
    version: 'v1.0',
    stage: 'house', stageLabel: 'Passed House', currentStep: 2,
    pipeline: ['Introduced', 'Committee', 'Passed House', 'Passed Senate', 'Signed'],
    sponsor: 'Rep. Meuser, Daniel (R-PA)', sponsor_bioguide: 'M001204', cosponsors: 1,
    pages: 1, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2026-06-24',
    likelihood: 55, likelihoodLabel: 'Possible',
    likelihoodReason: 'Introduced by Rep. Dan Meuser (R-PA) with 1 cosponsor. The bill requires SBA employees involved in loans to certify they have no prohibited conflict of interest, an anti-fraud integrity measure with little obvious opposition, though small standalone SBA bills often advance only as part of a larger vehicle.',
    summary: 'Requires Small Business Administration employees who help originate, review, or approve SBA loans to first certify in writing that they have no prohibited conflict of interest in the loan. Employees must also recuse themselves if a conflict comes up later.',
    brief: 'Requires SBA employees involved in loans to certify in writing that they have no prohibited conflict of interest.',
    top_lines: [
      { headline: 'Conflict-of-Interest Certification', billSection: '2', subs: [
        'SBA employees must certify no prohibited conflict before participating in a loan',
        'Requirement begins 270 days after enactment',
        'Employees must disclose later-discovered conflicts and recuse themselves' ] }
    ],
    sections: [
      { label: 'Section 2 — SBA Employee Conflict of Interest Certification', items: [
        { main: 'Requires an SBA employee who will personally and substantially participate in originating, reviewing, or approving an SBA loan to first certify in writing that they have no conflict of interest prohibited under 18 U.S.C. 208 or 5 C.F.R. 2635.502 with respect to that loan.',
          detail: 'The requirement begins 270 days after enactment. The employee must also certify that they will immediately disclose any conflict discovered later to their supervisor and recuse themselves, and that they understand the applicable conflict-of-interest requirements. The Administrator must issue implementing regulations within 180 days of enactment.',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2(a) / (b) — staggered effective dates',
        summary: 'The certification requirement takes effect 270 days after enactment, while the Administrator must issue implementing regulations within 180 days of enactment.',
        why_unreported: 'The implementing regulations are due before the certification duty begins, an ordering detail that shapes when the requirement actually operates.' }
    ],
    criticisms: [],
    gaps: [
      'The bill requires a written no-conflict certification but does not specify a penalty for an employee who files a false certification beyond existing conflict-of-interest law.',
      'The certification applies to employees who "personally and substantially participate" but the bill does not define that threshold.'
    ],
    changes: { added: ['New written conflict-of-interest certification requirement for SBA employees involved in loans, effective 270 days after enactment'],
      modified: [],
      removed: [] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-25'
  }
];

let added = 0, replaced = 0;
for (const e of entries) {
  const idx = cache.bills.findIndex(b => b.id === e.id);
  if (idx >= 0) { cache.bills[idx] = e; replaced++; }
  else { cache.bills.push(e); added++; }
}
cache.generated = cache.generated; // unchanged; run-batch --post / generate_sitemap will refresh
fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
console.log(`Done. Added ${added}, replaced ${replaced}. Cache now ${cache.bills.length} bills.`);
