// =============================================
//  api.js — Congress.gov + Anthropic API calls
// =============================================

// ---- Congress.gov ----

async function fetchRecentBills() {
  const key = CONFIG.CONGRESS_API_KEY;
  if (!key) return getDemoBills();

  const session = CONFIG.CONGRESS_SESSION || 119;
  const limit   = CONFIG.BILLS_PER_PAGE   || 20;

  // Fetch recently updated bills from both chambers
  const url = `https://api.congress.gov/v3/bill/${session}?sort=updateDate+desc&limit=${limit}&api_key=${key}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Congress API error: ${res.status}`);
  const data = await res.json();

  // Fetch details for each bill in parallel (limited to 8 to avoid rate limits)
  const bills = data.bills.slice(0, 8);
  const detailed = await Promise.all(bills.map(b => fetchBillDetail(b, key)));
  return detailed.filter(Boolean);
}

async function fetchBillDetail(billSummary, key) {
  try {
    const { type, number, congress } = billSummary;
    const baseUrl = `https://api.congress.gov/v3/bill/${congress}/${type.toLowerCase()}/${number}`;

    // Fetch bill details and actions in parallel
    const [detailRes, actionsRes, summaryRes] = await Promise.all([
      fetch(`${baseUrl}?api_key=${key}`),
      fetch(`${baseUrl}/actions?limit=10&api_key=${key}`),
      fetch(`${baseUrl}/summaries?api_key=${key}`),
    ]);

    const detail  = detailRes.ok  ? await detailRes.json()  : null;
    const actions = actionsRes.ok ? await actionsRes.json() : null;
    const summaryData = summaryRes.ok ? await summaryRes.json() : null;

    if (!detail?.bill) return null;

    const bill = detail.bill;
    const stage = detectStage(bill, actions?.actions || []);
    const pipeline = buildPipeline(bill, actions?.actions || []);
    const summaryText = summaryData?.summaries?.[0]?.text || '';

    return {
      id:           `${congress}-${type}-${number}`,
      title:        bill.title || 'Untitled Bill',
      code:         `${type}.${number}`,
      stage:        stage.key,
      stageLabel:   stage.label,
      date:         formatDate(bill.updateDate || bill.introducedDate),
      sponsor:      formatSponsor(bill.sponsors?.[0]),
      pipeline:     pipeline.steps,
      currentStep:  pipeline.currentIndex,
      likelihood:   estimateLikelihood(stage.key, bill, actions?.actions || []),
      summaryText:  cleanHtml(summaryText),
      sections:     [],   // filled in by AI analysis
      criticisms:   [],
      gaps:         [],
      analyzed:     false,
      raw:          bill,
    };
  } catch (e) {
    console.warn('Failed to fetch bill detail:', e);
    return null;
  }
}

function detectStage(bill, actions) {
  // Walk actions newest-first to find current stage
  const sorted = [...actions].sort((a,b) => new Date(b.actionDate) - new Date(a.actionDate));
  for (const action of sorted) {
    const text = (action.text || '').toLowerCase();
    const type = (action.type || '').toLowerCase();
    if (text.includes('signed by president') || text.includes('became public law'))
      return { key: 'signed', label: 'Signed into law' };
    if (text.includes('passed senate') || text.includes('senate passed'))
      return { key: 'senate', label: 'Senate passed' };
    if (text.includes('passed house') || text.includes('house passed'))
      return { key: 'house', label: 'House passed' };
    if (text.includes('senate') && (text.includes('committee') || text.includes('referred')))
      return { key: 'committee', label: 'Senate committee' };
    if (text.includes('house') && (text.includes('committee') || text.includes('referred')))
      return { key: 'committee', label: 'House committee' };
    if (text.includes('conference'))
      return { key: 'conference', label: 'Conference' };
  }
  return { key: 'introduced', label: 'Introduced' };
}

function buildPipeline(bill, actions) {
  const steps = ['Introduced', 'Committee', 'House floor', 'Senate floor', 'Conference', 'Signed'];
  const stageOrder = { introduced: 0, committee: 1, house: 2, senate: 3, conference: 4, signed: 5 };
  const stage = detectStage(bill, actions);
  const currentIndex = stageOrder[stage.key] ?? 0;
  return { steps, currentIndex };
}

function estimateLikelihood(stageKey, bill, actions) {
  // Simple heuristic — in production you'd use vote counts, co-sponsor counts, etc.
  const base = { introduced: 12, committee: 28, house: 52, senate: 68, conference: 82, signed: 100 };
  let pct = base[stageKey] || 10;
  // More co-sponsors = slightly higher likelihood
  const cosponsors = bill.cosponsors?.count || 0;
  if (cosponsors > 50) pct = Math.min(pct + 10, 95);
  else if (cosponsors > 20) pct = Math.min(pct + 5, 95);
  return pct;
}

function formatSponsor(sponsor) {
  if (!sponsor) return 'Unknown sponsor';
  const party = sponsor.party ? `(${sponsor.party})` : '';
  const state = sponsor.state || '';
  return `${sponsor.fullName || sponsor.name || 'Unknown'} ${party} ${state}`.trim();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function cleanHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// ---- Anthropic AI Analysis ----

async function analyzeBill(bill) {
  const key = CONFIG.ANTHROPIC_API_KEY;
  if (!key) throw new Error('No Anthropic API key configured.');

  const prompt = buildAnalysisPrompt(bill);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1800,
      system: `You are a nonpartisan legislative analyst. You write clear, plain-English summaries of U.S. legislation in a "patch notes" style — like a video game patch log — so everyday Americans can understand what changed, who's affected, and what's missing. You are always factual and balanced.
      
You MUST respond with valid JSON only. No markdown, no extra text.`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Anthropic API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.map(c => c.text || '').join('') || '{}';

  // Strip any accidental markdown fences
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

function buildAnalysisPrompt(bill) {
  return `Analyze this U.S. federal bill and return a JSON object with this exact structure:

{
  "sections": [
    {
      "label": "Category name (e.g. Budget, Healthcare, Defense, Education)",
      "items": [
        {
          "main": "One plain-English sentence describing what this provision does and who it affects. Put dollar amounts or key numbers in the text.",
          "detail": "2-3 sentences of additional context: how it works, who administers it, key conditions or deadlines.",
          "comments": [
            { "party": "d", "text": "Sen./Rep. Name (D-State): 'Quote or paraphrased position.'" },
            { "party": "r", "text": "Sen./Rep. Name (R-State): 'Quote or paraphrased position.'" },
            { "party": "n", "text": "Nonpartisan source: factual note about the provision." }
          ]
        }
      ]
    }
  ],
  "criticisms": [
    {
      "who": "Name of person, group, or party opposing this",
      "why": "Plain-English explanation of their specific objection."
    }
  ],
  "gaps": [
    "One sentence describing something important that this bill does NOT address but probably should."
  ],
  "likelihoodLabel": "Enacted|Likely|Possible|Unlikely|Long shot",
  "likelihoodReason": "2-3 sentences explaining why this bill will or won't pass, based on political dynamics."
}

Bill title: ${bill.title}
Bill code: ${bill.code}
Sponsor: ${bill.sponsor}
Current stage: ${bill.stageLabel}
Summary: ${bill.summaryText ? bill.summaryText.slice(0, 2000) : 'No summary available — use your knowledge of this bill if it is well-known, otherwise provide general analysis based on the title and sponsor.'}

Rules:
- sections: 1-4 categories, 1-3 items each. Keep "main" to one sentence. 
- criticisms: 2-4 items from real or plausible stakeholders.
- gaps: 3-5 items, one sentence each.
- comments: 0-3 per item. Only include if realistic for this bill. party must be "d", "r", or "n".
- All text must be in plain English suitable for a general audience.
- Return ONLY the JSON object. No explanation, no markdown.`;
}

// ---- Demo bills (shown when no API key is configured) ----

function getDemoBills() {
  return [
    {
      id: 'demo-1',
      title: 'American Infrastructure Renewal Act of 2025',
      code: 'S.1042',
      stage: 'senate',
      stageLabel: 'Senate floor',
      date: 'Apr 14, 2025',
      sponsor: 'Sen. Klobuchar (D-MN)',
      pipeline: ['Introduced','Committee','House passed','Senate floor','Conference','Signed'],
      currentStep: 3,
      likelihood: 62,
      likelihoodLabel: 'Possible',
      likelihoodReason: 'Bipartisan support for core provisions, but Republican opposition to wage requirements and EV mandates creates real friction. Conference committee likely.',
      summaryText: '',
      analyzed: true,
      sections: [
        { label: 'Transportation', items: [
          { main: 'Allocates $120B for highway and bridge repair over 5 years.', detail: 'Funds distributed via formula grants to states weighted by lane-miles and vehicle miles traveled. States must match 20% of funds. Projects over $100M require environmental review under NEPA.', comments: [{ party:'d', text:"Sen. Klobuchar (D-MN): 'This is the largest bridge investment since the Highway Act.'" },{ party:'r', text:"Sen. Capito (R-WV): 'Supportive, but wants prevailing wage provisions removed.'" }] },
          { main: 'Establishes $12B EV charging corridor program across interstates.', detail: 'Targets 500K new public charging ports by 2030. 50% must be fast-chargers. Priority corridors include rural and underserved areas.', comments: [{ party:'r', text:"Sen. Barrasso (R-WY): 'Opposed — market should drive EV adoption, not mandates.'" }] }
        ]},
        { label: 'Broadband', items: [
          { main: 'Provides $65B to expand high-speed internet access to unserved rural areas.', detail: 'Commerce Dept. administers grants to ISPs and co-ops. Minimum speed: 100/20 Mbps. ISPs must offer low-income tier at $30/mo or less to qualify.', comments: [{ party:'d', text:"Rep. Matsui (D-CA): 'Closes the digital divide. Strongly in favor.'" },{ party:'n', text:"CBO estimates 98% rural coverage by 2028 if funds are fully deployed." }] }
        ]}
      ],
      criticisms: [
        { who: 'Sen. Capito (R-WV) & GOP caucus', why: 'Prevailing wage requirements are seen as inflating project costs by 15–20%, favoring union labor over open competition.' },
        { who: 'Fiscal hawks (both parties)', why: 'No pay-for mechanism included — the bill adds directly to the deficit.' }
      ],
      gaps: [
        'Rail and public transit funding is absent — no allocation for Amtrak expansion or urban transit.',
        'Climate resilience standards not addressed — no requirement that rebuilt infrastructure meet updated flood or heat thresholds.',
        'No provision for maintenance funding after construction.'
      ]
    },
    {
      id: 'demo-2',
      title: "Protecting Medicare's Drug Pricing Negotiation Act",
      code: 'H.R.3211',
      stage: 'committee',
      stageLabel: 'Senate Finance Cmte.',
      date: 'Apr 9, 2025',
      sponsor: 'Rep. Pallone (D-NJ)',
      pipeline: ['Introduced','House Cmte.','House passed','Senate Finance','Senate floor','Signed'],
      currentStep: 3,
      likelihood: 38,
      likelihoodLabel: 'Unlikely',
      likelihoodReason: 'Strong Democratic support but near-unanimous Republican opposition and intense pharmaceutical lobbying make passage unlikely without significant compromise.',
      summaryText: '',
      analyzed: true,
      sections: [
        { label: 'Prescription drug pricing', items: [
          { main: 'Expands Medicare authority to negotiate prices for 50 additional drugs per year (up from 20).', detail: 'HHS must publish negotiated maximum fair prices 60 days before they take effect. Manufacturers who refuse face an excise tax scaling to 95% of U.S. sales.', comments: [{ party:'d', text:"Rep. Pallone (D-NJ): 'Pharma has gotten away with price gouging for decades.'" },{ party:'r', text:"Sen. Thune (R-SD): 'Concerned this will reduce R&D investment for rare diseases.'" },{ party:'n', text:"AARP projects average senior savings of $800/year if enacted." }] },
          { main: 'Caps annual out-of-pocket Medicare Part D costs at $2,000 starting 2026.', detail: 'Replaces current catastrophic coverage threshold. Manufacturers must pay rebates if prices rise faster than inflation.', comments: [{ party:'d', text:"Sen. Sanders (I-VT): 'Good start — we need full Medicare for All.'" }] }
        ]}
      ],
      criticisms: [
        { who: 'PhRMA & pharmaceutical industry', why: 'Price controls will reduce R&D revenue, potentially killing pipeline drugs for rare diseases and cancers.' },
        { who: 'CBO (nonpartisan concern)', why: 'Projects the bill could reduce new drugs entering the market by 13 over the next decade.' }
      ],
      gaps: [
        'Insulin pricing not specifically addressed — non-Medicare patients under 65 are excluded.',
        'No provisions for dental, vision, or hearing coverage under Medicare.',
        'Pharmacy benefit manager (PBM) practices are not addressed.'
      ]
    },
    {
      id: 'demo-3',
      title: 'National Defense Authorization Act FY2026',
      code: 'S.880',
      stage: 'house',
      stageLabel: 'House Armed Services',
      date: 'Mar 28, 2025',
      sponsor: 'Sen. Wicker (R-MS)',
      pipeline: ['Introduced','Senate Armed Svcs.','Senate passed','House Armed Svcs.','House floor','Conference','Signed'],
      currentStep: 3,
      likelihood: 85,
      likelihoodLabel: 'Likely',
      likelihoodReason: 'The NDAA passes every year with broad bipartisan support. Specific provisions may be amended in conference but the bill is near-certain to be signed.',
      summaryText: '',
      analyzed: true,
      sections: [
        { label: 'Defense spending', items: [
          { main: 'Authorizes $923B in total defense spending for FY2026, a 3.5% increase.', detail: 'Base budget of $874B plus $49B in overseas contingency operations. Largest line items: personnel ($180B), O&M ($310B), procurement ($160B).', comments: [{ party:'r', text:"Sen. Wicker (R-MS): 'Essential to maintain our edge over China and Russia.'" },{ party:'d', text:"Sen. Warren (D-MA): 'We should audit the Pentagon before writing blank checks.'" }] }
        ]},
        { label: 'Personnel', items: [
          { main: 'Authorizes a 4.5% pay raise for all active-duty military personnel.', detail: 'Applies to all E-1 through O-10 pay grades effective Jan 1, 2026. Matching raise for reserve components during active duty periods.', comments: [{ party:'d', text:"Rep. Gallego (D-AZ): 'Bipartisan support — our troops deserve this.'" }] }
        ]}
      ],
      criticisms: [
        { who: 'Sen. Warren (D-MA) & progressive Democrats', why: 'Oppose the spending level without a mandatory Pentagon audit — DoD has failed its audit for six consecutive years.' },
        { who: 'Arms control advocates', why: 'Hypersonic missile expansion is seen as destabilizing with no diplomatic counterbalance in the bill.' }
      ],
      gaps: [
        'Cybersecurity workforce shortfall — Pentagon projects a deficit of 40,000 cyber personnel by 2027 with no training pipeline addressed.',
        'Military housing quality improvements absent despite documented unsafe conditions on bases.',
        'Climate readiness not addressed — no funding for hardening bases against flooding or wildfire.'
      ]
    }
  ];
}
