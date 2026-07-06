// One-off merge: add the Jun-26 2026 recheck batch (3 new bills) to cache.json.
// Sourced only from data/bill-text/*.txt. Votes filled afterward by fetch_vote_data.js.
const fs = require('fs');
const path = require('path');
const cachePath = path.join(__dirname, '..', 'data', 'cache.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

const entries = [
  {
    id: '119-HR-2478',
    code: 'HR.2478',
    title: 'Financial Exploitation Prevention Act of 2025',
    official_title: 'To amend the Investment Company Act of 1940 to postpone the date of payment or satisfaction upon redemption of certain securities in the case of the financial exploitation of specified adults, and for other purposes.',
    date: '2026-06-25',
    version: 'v1.0',
    stage: 'house', stageLabel: 'Passed House', currentStep: 2,
    pipeline: ['Introduced', 'Committee', 'Passed House', 'Passed Senate', 'Signed'],
    sponsor: 'Rep. Wagner, Ann (R-MO)', sponsor_bioguide: 'W000812', cosponsors: 11,
    pages: 5, analyzed: true, demo: false, billType: 'amendment',
    stageDate: '2026-06-25',
    likelihood: 65, likelihoodLabel: 'Likely',
    likelihoodReason: 'Introduced by Rep. Ann Wagner (R-MO) with 11 cosponsors from both parties (including Reps. Gottheimer and Perez, Democrats). The bill gives mutual funds a tool to pause redemptions when they suspect elder financial exploitation — a consumer-protection measure with bipartisan backing and little organized opposition, though it is an opt-in framework that imposes no mandate on the industry.',
    summary: 'Lets mutual fund companies temporarily hold up a withdrawal when they reasonably believe an older or vulnerable customer is being financially exploited. Funds that opt in can ask customers for a trusted contact and may delay a redemption beyond the usual 7-day limit to investigate.',
    brief: 'Allows mutual funds to postpone redemptions of securities when they suspect financial exploitation of an older or vulnerable customer.',
    top_lines: [
      { headline: 'Redemption Holds for Suspected Exploitation', billSection: '2', subs: [
        'Funds may delay a redemption past the normal 7-day limit, up to 15 business days',
        'Holds apply when a "specified adult" is suspected of being financially exploited',
        'Period may be extended 10 more business days after an internal review' ] },
      { headline: 'Trusted Contact and Disclosures', billSection: '2', subs: [
        'Participating funds must request a trusted adult contact for direct accounts',
        'Must disclose that the contact may be reached about possible exploitation',
        'A trusted contact suspected of the exploitation is not notified of a hold' ] },
      { headline: 'Who Is Covered and Oversight', billSection: '2', subs: [
        '"Specified adult" = age 65+, or 18+ with an impairment limiting self-protection',
        'Held funds kept in a demand deposit account; records made available to the SEC',
        'SEC must report to Congress within 1 year with further recommendations' ] }
    ],
    sections: [
      { label: 'Section 2 — Redemption of Certain Securities Postponed', items: [
        { main: 'Amends Section 22 of the Investment Company Act of 1940 (15 U.S.C. 80a-22) to let a registered open-end investment company (a mutual fund) or its transfer agent postpone payment on a redemption beyond the normal 7-day limit when it reasonably believes a "specified adult" is being financially exploited.',
          detail: 'A hold may run up to 15 business days, extendable by an additional 10 business days if the fund makes an exploitation determination, notifies the customer’s trusted contacts within 2 days (unless that contact is the suspected exploiter), starts an internal review, and holds the funds in a demand deposit account. A state regulator or court may extend the period further. The fund must establish internal procedures, keep records, and disclose the postponement authority in its prospectus.',
          comments: [] },
        { main: 'Funds and transfer agents that elect to participate must request and retain the name and contact information of at least one trusted adult contact for non-institutional direct-at-fund accounts.',
          detail: 'The requirement is opt-in: a fund and transfer agent comply by notifying the Commission of their election, and the trusted-contact and redemption-hold provisions apply only to those that elect. Customers must be told in writing that the contact may be reached to address possible exploitation, confirm the customer’s contact information or health status, or identify a guardian, executor, trustee, or power-of-attorney holder.',
          comments: [] },
        { main: 'Defines "specified adult" as an individual age 65 or older, or age 18 or older whom the fund reasonably believes has a mental or physical impairment that renders them unable to protect their own interests.',
          detail: 'Within 1 year of enactment, the SEC must report to Congress with recommendations on regulatory and legislative changes to address financial exploitation of specified adults, in consultation with the CFTC, CFPB, FINRA, the North American Securities Administrators Association, the Federal Reserve, the Comptroller of the Currency, and the FDIC.',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 22(i)(2)(D) — trusted contact suspected of exploitation is not notified',
        summary: 'A fund need not notify a customer’s designated trusted contact of a redemption hold if it reasonably believes that contact is, has been, or will be the one exploiting the customer.',
        why_unreported: 'The trusted-contact mechanism is framed as a safeguard, but this exception routes notice away from a contact the fund suspects is the exploiter, changing who learns of a hold.' },
      { section: 'Section 22(h)(1) — opt-in election',
        summary: 'The entire trusted-contact and redemption-hold regime applies only to funds and transfer agents that affirmatively elect to participate by notifying the Commission.',
        why_unreported: 'The protections read as industry-wide but are voluntary; a fund that does not elect is not bound by any of the new requirements.' }
    ],
    criticisms: [],
    gaps: [
      'The bill lets funds postpone redemptions on a reasonable belief of exploitation but does not set a standard or penalty for a hold later found to be unjustified.',
      'The regime is opt-in, so the bill does not address customers at funds that decline to elect into the protections.'
    ],
    changes: { added: [
        'New authority for opt-in mutual funds to postpone redemptions up to 15 business days (plus a 10-business-day extension) on suspected financial exploitation of a specified adult',
        'New trusted-contact request and disclosure requirement for participating funds’ direct-at-fund accounts',
        'New SEC report to Congress within 1 year on addressing financial exploitation of specified adults' ],
      modified: ['Amends Section 22 of the Investment Company Act of 1940 (15 U.S.C. 80a-22) to add the redemption-postponement and trusted-contact provisions'],
      removed: [] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-26'
  },

  {
    id: '119-S-201',
    code: 'S.201',
    title: 'ACES Act of 2025',
    official_title: 'To provide for a study by the National Academies of Sciences, Engineering, and Medicine on the prevalence and mortality of cancer among individuals who served as active duty aircrew in the Armed Forces, and for other purposes.',
    date: '2025-08-14',
    version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4,
    pipeline: ['Introduced', 'Committee', 'Passed Senate', 'Passed House', 'Signed'],
    sponsor: 'Sen. Kelly, Mark (D-AZ)', sponsor_bioguide: 'K000377', cosponsors: 3,
    pages: 2, analyzed: true, demo: false, billType: 'study',
    stageDate: '2025-08-14', enactedDate: '2025-08-14',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-32 on August 14, 2025. Introduced by Sen. Mark Kelly (D-AZ) with 3 cosponsors; ordering a National Academies study of cancer among military aircrew is a low-cost veterans-health measure that drew no recorded opposition, clearing both chambers before being signed.',
    summary: 'Orders an independent scientific study of how often cancer occurs, and how often it is fatal, among military members who served as aircrew on fixed-wing aircraft. The Department of Veterans Affairs must arrange for the National Academies of Sciences, Engineering, and Medicine to conduct it.',
    brief: 'Directs a National Academies study on the prevalence and mortality of cancer among military fixed-wing aircrew.',
    top_lines: [
      { headline: 'National Academies Cancer Study', billSection: '2', subs: [
        'VA must seek an agreement with the National Academies within 30 days of enactment',
        'Study covers cancer prevalence and mortality among fixed-wing aircrew',
        'Must report to Congress if the agreement is not finalized within 60 days of negotiations' ] },
      { headline: 'Scope of the Study', billSection: '2', subs: [
        'Identifies exposures tied to aircrew occupations (chemicals, compounds, agents)',
        'Reviews 11 named cancer types, including brain, lung, prostate, and thyroid',
        'Uses VA, DoD, and CDC death-index data where available' ] }
    ],
    sections: [
      { label: 'Section 2 — National Academies Study on Cancer Among Active Duty Aircrew', items: [
        { main: 'Directs the Secretary of Veterans Affairs, within 30 days of enactment, to seek an agreement with the National Academies of Sciences, Engineering, and Medicine to study the prevalence and mortality of cancers among covered individuals.',
          detail: 'The Secretary must finalize the agreement within 60 days of entering negotiations; if not, the Secretary must report to the Senate and House Veterans’ Affairs Committees explaining the delay and give a briefing at least every 60 days until it is finalized. "Covered individual" means a person who served on active duty in the Army, Navy, Air Force, or Marine Corps as an aircrew member of a fixed-wing aircraft (pilot, navigator, weapons systems operator, or other regular crew).',
          comments: [] },
        { main: 'Requires the study to identify occupational exposures and review associations with overall cancer morbidity and mortality and 11 specified cancers.',
          detail: 'The named cancers are brain; colon and rectal; kidney; lung; melanoma skin; non-Hodgkin lymphoma; pancreatic; prostate; testicular; thyroid; and urinary bladder, plus others the Secretary deems appropriate. The study draws on VA, DoD, and Service health databases, the National Death Index, and the aircrew study conducted under section 750 of the FY2021 National Defense Authorization Act (Public Law 116-283). The National Academies reports the results to the Secretary and the Veterans’ Affairs Committees.',
          comments: [] }
      ] }
    ],
    underreported: [
      { section: 'Section 2(a)(2)(B) — reporting consequences for a missed deadline',
        summary: 'If the VA does not finalize the study agreement within 60 days of negotiations, the Secretary must report the reasons to Congress and brief the Veterans’ Affairs Committees at least every 60 days until it is done.',
        why_unreported: 'Beyond ordering a study, the bill attaches a recurring congressional-reporting consequence to the VA missing the agreement deadline.' }
    ],
    criticisms: [],
    gaps: [
      'The bill orders a study of cancer among aircrew but does not itself establish or change any benefit, presumption, or treatment for affected veterans.',
      'The study covers fixed-wing aircrew but does not address members who served as aircrew on rotary-wing aircraft.'
    ],
    changes: { added: ['New requirement for a National Academies study on cancer prevalence and mortality among military fixed-wing aircrew'],
      modified: [], removed: [] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-26'
  },

  {
    id: '119-S-2878',
    code: 'S.2878',
    title: 'Great Lakes Fishery Research Reauthorization Act',
    official_title: 'To reauthorize funding to monitor, assess, and research the Great Lakes Basin, and for other purposes.',
    date: '2025-12-26',
    version: 'v1.0',
    stage: 'signed', stageLabel: 'Signed into Law', currentStep: 4,
    pipeline: ['Introduced', 'Committee', 'Passed Senate', 'Passed House', 'Signed'],
    sponsor: 'Sen. Peters, Gary C. (D-MI)', sponsor_bioguide: 'P000595', cosponsors: 1,
    pages: 1, analyzed: true, demo: false, billType: 'reauthorization',
    stageDate: '2025-12-26', enactedDate: '2025-12-26',
    likelihood: 100, likelihoodLabel: 'Enacted',
    likelihoodReason: 'Enacted as Public Law 119-67 on December 26, 2025. Introduced by Sen. Gary Peters (D-MI) with 1 cosponsor; extending an existing Great Lakes research funding authorization is a narrow regional measure that drew no recorded opposition, clearing both chambers before being signed.',
    summary: 'Extends the existing federal authorization to fund monitoring, assessment, and research of the Great Lakes Basin. The prior authorization was set to run through 2025; this law continues it through 2030.',
    brief: 'Reauthorizes funding to monitor, assess, and research the Great Lakes Basin through 2030.',
    top_lines: [
      { headline: 'What the Great Lakes Authorization Does', billSection: '2', subs: [
        'Authorizes federal funding to monitor, assess, and research the Great Lakes Basin' ] },
      { headline: 'What This Bill Changes', billSection: '2', subs: [
        'Extends the funding authorization from 2025 through 2030' ] }
    ],
    sections: [
      { label: 'Section 2 — Reauthorization of Great Lakes Basin Funding', items: [
        { main: 'Extends the authorization of funding to monitor, assess, and research the Great Lakes Basin from 2025 through 2030.',
          detail: 'The change amends Section 201(d) of title II of division P of the Further Consolidated Appropriations Act, 2020 (16 U.S.C. 941h(d)) by striking "2025" and inserting "2030." The bill makes no other change to the underlying program.',
          comments: [] }
      ] }
    ],
    underreported: [],
    criticisms: [],
    gaps: [
      'The bill extends the funding authorization through 2030 but does not itself appropriate funds or change the amount authorized for the Great Lakes Basin program.'
    ],
    changes: { added: [],
      modified: ['Extends the Great Lakes Basin monitoring and research funding authorization from 2025 to 2030 (16 U.S.C. 941h(d))'],
      removed: [] },
    featured_quotes: [], votes: [], analyzedAt: '2026-06-26'
  }
];

let added = 0, replaced = 0;
for (const e of entries) {
  const idx = cache.bills.findIndex(b => b.id === e.id);
  if (idx >= 0) { cache.bills[idx] = e; replaced++; }
  else { cache.bills.push(e); added++; }
}
fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n');
console.log(`Done. Added ${added}, replaced ${replaced}. Cache now ${cache.bills.length} bills.`);
