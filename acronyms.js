// acronyms.js — hover tooltips for legislative acronyms
// To add a new acronym: add an entry to ACRONYMS below.

const ACRONYMS = {
  // Federal agencies
  CIA:   'Central Intelligence Agency',
  NSA:   'National Security Agency',
  FBI:   'Federal Bureau of Investigation',
  DOD:   'Department of Defense',
  DOJ:   'Department of Justice',
  HHS:   'Department of Health and Human Services',
  EPA:   'Environmental Protection Agency',
  FCC:   'Federal Communications Commission',
  FDA:   'Food and Drug Administration',
  FTC:   'Federal Trade Commission',
  SEC:   'Securities and Exchange Commission',
  DHS:   'Department of Homeland Security',
  DOT:   'Department of Transportation',
  DOE:   'Department of Energy',
  USDA:  'U.S. Department of Agriculture',
  HUD:   'Department of Housing and Urban Development',
  SSA:   'Social Security Administration',
  IRS:   'Internal Revenue Service',
  CBP:   'Customs and Border Protection',
  ICE:   'Immigration and Customs Enforcement',
  TSA:   'Transportation Security Administration',
  FEMA:  'Federal Emergency Management Agency',
  NIH:   'National Institutes of Health',
  CDC:   'Centers for Disease Control and Prevention',
  CISA:  'Cybersecurity and Infrastructure Security Agency',
  GSA:   'General Services Administration',
  SBA:   'Small Business Administration',
  SBIC:  'Small Business Investment Company',
  ANCSA: 'Alaska Native Claims Settlement Act',
  SNWA:  'Southern Nevada Water Authority',
  OPM:   'Office of Personnel Management',
  OMB:   'Office of Management and Budget',
  CBO:   'Congressional Budget Office',
  GAO:   'Government Accountability Office',
  CRS:   'Congressional Research Service',
  CFPB:  'Consumer Financial Protection Bureau',
  DOGE:  'Department of Government Efficiency',
  // International
  NATO:  'North Atlantic Treaty Organization',
  WTO:   'World Trade Organization',
  IMF:   'International Monetary Fund',
  // Legislative / economic
  NDAA:  'National Defense Authorization Act',
  ACA:   'Affordable Care Act',
  FISA:  'Foreign Intelligence Surveillance Act',
  FIRE:  'Fire Improvement and Reforming Exceptional Events Act',
  FLPMA: 'Federal Land Policy and Management Act',
  MQ:    'MQ-9 Reaper drone (U.S. Air Force)',
  SAVE:  'Safeguard American Voter Eligibility Act',
  CRA:   'Congressional Review Act',
  BLM:   'Bureau of Land Management',
  CR:    'Continuing Resolution',
  FY:    'Fiscal Year',
  GDP:   'Gross Domestic Product',
  // Immigration
  DACA:  'Deferred Action for Childhood Arrivals',
  TPS:   'Temporary Protected Status',
  USCIS: 'U.S. Citizenship and Immigration Services',
  // Benefits / domestic programs
  SNAP:   'Supplemental Nutrition Assistance Program',
  CHIP:   "Children's Health Insurance Program",
  TANF:   'Temporary Assistance for Needy Families',
  SSI:    'Supplemental Security Income',
  LIHEAP: 'Low Income Home Energy Assistance Program',
  NFIP:   'National Flood Insurance Program',
  WIOA:   'Workforce Innovation and Opportunity Act',
  IDEA:   'Individuals with Disabilities Education Act',
  ROTC:   'Reserve Officers\' Training Corps',
  IRA:    'Inflation Reduction Act',
  // Health agencies / programs
  CMS:    'Centers for Medicare & Medicaid Services',
  SAMHSA: 'Substance Abuse and Mental Health Services Administration',
  NCI:    'National Cancer Institute',
  NIAID:  'National Institute of Allergy and Infectious Diseases',
  NHLBI:  'National Heart, Lung, and Blood Institute',
  MCED:   'Multi-Cancer Early Detection',
  PBM:    'Pharmacy Benefit Manager',
  APM:    'Alternative Payment Model',
  DSH:    'Disproportionate Share Hospital',
  DME:    'Durable Medical Equipment',
  // Foreign assistance / trade
  USAID:  'U.S. Agency for International Development',
  PEPFAR: "President's Emergency Plan for AIDS Relief",
  FMF:    'Foreign Military Financing',
  UNRWA:  'United Nations Relief and Works Agency',
  AGOA:   'African Growth and Opportunity Act',
  ESF:    'Economic Support Fund',
  SEED:   'Support for East European Democracy Act',
  INCLE:  'International Narcotics Control and Law Enforcement',
  // Financial / oversight
  CFIUS:  'Committee on Foreign Investment in the United States',
  CFTC:   'Commodity Futures Trading Commission',
  CBDC:   'Central Bank Digital Currency',
  GAAP:   'Generally Accepted Accounting Principles',
  // Elections / voting
  NVRA:   'National Voter Registration Act',
  // Immigration law
  INA:    'Immigration and Nationality Act',
  // Infrastructure / cyber
  'ARPA-I': 'Advanced Research Projects Agency–Infrastructure',
  NCPS:   'National Cybersecurity Protection System',
  // Visa programs
  'H-2B': 'H-2B Temporary Nonagricultural Worker Program',
  // Tax (HR-1 and others)
  AGI:    'Adjusted Gross Income',
  SALT:   'State and Local Tax (deduction)',
  GILTI:  'Global Intangible Low-Taxed Income',
  FDII:   'Foreign-Derived Intangible Income',
  BEAT:   'Base Erosion and Anti-Abuse Tax',
  CFC:    'Controlled Foreign Corporation',
  IRC:    'Internal Revenue Code',
  NFA:    'National Firearms Act',
  // Farm programs
  ARC:    'Agriculture Risk Coverage',
  PLC:    'Price Loss Coverage',
  ABAWD:  'Able-Bodied Adult Without Dependents',
  // Student loans
  PAYE:   'Pay As You Earn (student loan repayment plan)',
  ICR:    'Income-Contingent Repayment',
  PLUS:   'Direct PLUS Loan program (graduate students and parents)',
  // Energy / environment
  ANWR:   'Arctic National Wildlife Refuge',
  NPR:    'National Petroleum Reserve',
  CAFE:   'Corporate Average Fuel Economy',
  NHTSA:  'National Highway Traffic Safety Administration',
  RVP:    'Reid Vapor Pressure (gasoline volatility measure)',
  NAAQS:  'National Ambient Air Quality Standards',
  NEPA:   'National Environmental Policy Act',
  MOU:    'Memorandum of Understanding',
  FERC:   'Federal Energy Regulatory Commission',
  // Space / aviation / transportation
  NASA:   'National Aeronautics and Space Administration',
  ISS:    'International Space Station',
  FAA:    'Federal Aviation Administration',
  FHWA:   'Federal Highway Administration',
  FRA:    'Federal Railroad Administration',
  ARPA:   'Advanced Research Projects Agency',
  // Telecom
  NTIA:   'National Telecommunications and Information Administration',
  USF:    'Universal Service Fund',
  API:    'Application Programming Interface',
  // Health
  GME:    'Graduate Medical Education',
  NHSC:   'National Health Service Corps',
  HECM:   'Home Equity Conversion Mortgage',
  HIV:    'Human Immunodeficiency Virus',
  AIDS:   'Acquired Immunodeficiency Syndrome',
  COVID:  'Coronavirus Disease 2019',
  // Housing / mortgage finance
  MBS:    'Mortgage-Backed Securities',
  CDBG:   'Community Development Block Grant',
  HOME:   'HOME Investment Partnerships Program',
  // Defense
  CVN:    'Nuclear-Powered Aircraft Carrier (Navy hull type)',
  DDG:    'Guided-Missile Destroyer (Navy hull type)',
  ISIS:   'Islamic State of Iraq and Syria',
  SRBMD:  'Short-Range Ballistic Missile Defense',
  RDT:    'Research, Development, Test, and Evaluation',
  MDAP:   'Major Defense Acquisition Program',
  JCIDS:  'Joint Capabilities Integration and Development System',
  JROC:   'Joint Requirements Oversight Council',
  DIU:    'Defense Innovation Unit',
  OSD:    'Office of the Secretary of Defense',
  FAR:    'Federal Acquisition Regulation',
  IMET:   'International Military Education and Training',
  SPEED:  'SPEED Act (defense acquisition reform)',
  // Foreign assistance / international
  IDA:    'International Development Association',
  AIIB:   'Asian Infrastructure Investment Bank',
  FIFA:   'Federation Internationale de Football Association',
  // Banking / financial oversight
  OCC:    'Office of the Comptroller of the Currency',
  NCUA:   'National Credit Union Administration',
  FDIC:   'Federal Deposit Insurance Corporation',
  CAMELS: 'Capital, Assets, Management, Earnings, Liquidity, and Sensitivity (bank rating system)',
  EGRPRA: 'Economic Growth and Regulatory Paperwork Reduction Act',
  FDI:    'Federal Deposit Insurance Act',
  SIB:    'Systemically Important Bank',
  BSA:    'Bank Secrecy Act',
  SIPA:   'Securities Investor Protection Act',
  SIPC:   'Securities Investor Protection Corporation',
  GENIUS: 'GENIUS Act (federal stablecoin framework)',
  // Sanctions / trade / small business
  OFAC:   'Office of Foreign Assets Control',
  SDN:    'Specially Designated Nationals (sanctions list)',
  UFLPA:  'Uyghur Forced Labor Prevention Act',
  SBIR:   'Small Business Innovation Research',
  STTR:   'Small Business Technology Transfer',
  TAAMS:  'Trust Asset and Accounting Management System',
  // Legal
  FSIA:   'Foreign Sovereign Immunities Act',
  HEAR:   'Holocaust Expropriated Art Recovery Act',
  // Labor / homeland / other programs
  OCR:    'Optical Character Recognition',
  SEA:    'Self-Employment Assistance program',
  AFG:    'Assistance to Firefighters Grants',
  SAFER:  'Staffing for Adequate Fire and Emergency Response',
  USSS:   'United States Secret Service',
  PAYGO:  'Pay-As-You-Go (budget rule)',
  HELP:   'Haiti Economic Lift Program Act',
  ACES:   'Agriculture Conservation Experienced Services Program',
  HALT:   'HALT Fentanyl Act',
  REAL:   'REAL ID Act',
};

// ---- Tooltip element (one shared instance appended to body) ----

let _acronymTooltipEl = null;

function _getTooltipEl() {
  if (!_acronymTooltipEl) {
    _acronymTooltipEl = document.createElement('div');
    _acronymTooltipEl.className = 'acronym-tooltip';
    document.body.appendChild(_acronymTooltipEl);
  }
  return _acronymTooltipEl;
}

function _showTooltip(anchorEl) {
  const el = _getTooltipEl();
  // .acronym-tip uses data-full (short, single-line); generic tags use data-tip (sentence, wraps)
  const isTip = anchorEl.hasAttribute('data-tip');
  el.textContent = isTip ? anchorEl.getAttribute('data-tip') : anchorEl.getAttribute('data-full');
  el.classList.toggle('acronym-tooltip--wide', isTip);

  // Park off-screen to measure dimensions before positioning
  el.style.left = '-9999px';
  el.style.top = '-9999px';
  el.style.opacity = '1';

  requestAnimationFrame(function () {
    const rect = anchorEl.getBoundingClientRect();
    const tw = el.offsetWidth;
    const th = el.offsetHeight;

    let left = rect.left + rect.width / 2 - tw / 2;
    let top  = rect.top - th - 6;

    // Clamp horizontally; flip below if not enough room above
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    if (top < 8) top = rect.bottom + 6;

    el.style.left = left + 'px';
    el.style.top  = top  + 'px';
  });
}

function _hideTooltip() {
  if (_acronymTooltipEl) _acronymTooltipEl.style.opacity = '0';
}

// Attach global delegation once (browser only)
if (typeof document !== 'undefined') (function () {
  document.addEventListener('mouseover', function (e) {
    var tip = e.target && e.target.closest && e.target.closest('.acronym-tip, [data-tip]');
    if (tip) {
      _showTooltip(tip);
    } else {
      _hideTooltip();
    }
  });
})();

// Allow Node.js scripts to require ACRONYMS for processing-time checks
if (typeof module !== 'undefined') module.exports = { ACRONYMS };

// ---- Text node scanner ----

function scanAcronyms(root) {
  if (!root) return;

  const keys = Object.keys(ACRONYMS);
  if (!keys.length) return;

  const pattern = new RegExp('\\b(' + keys.join('|') + ')\\b', 'g');

  const SKIP_TAGS = /^(H[1-6]|SCRIPT|STYLE|INPUT|TEXTAREA|A|BUTTON|ABBR|SELECT)$/;
  const SKIP_CLASSES = [
    'section-label', 'rep-badge', 'party-badge', 'stance-badge',
    'filter-btn', 'back-btn', 'bill-code', 'bill-number', 'bill-meta',
    'header-cta', 'acronym-tip', 'trust-bar-badge', 'floor-cat-meta',
  ];

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        var el = node.parentElement;
        while (el && el !== root) {
          if (SKIP_TAGS.test(el.tagName)) return NodeFilter.FILTER_REJECT;
          for (var i = 0; i < SKIP_CLASSES.length; i++) {
            if (el.classList.contains(SKIP_CLASSES[i])) return NodeFilter.FILTER_REJECT;
          }
          el = el.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  var nodes = [];
  var n;
  while ((n = walker.nextNode())) nodes.push(n);

  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var text = node.textContent;
    if (!pattern.test(text)) continue;
    pattern.lastIndex = 0;

    var frag = document.createDocumentFragment();
    var last = 0;
    var m;
    while ((m = pattern.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var span = document.createElement('span');
      span.className = 'acronym-tip';
      span.setAttribute('data-full', ACRONYMS[m[1]]);
      span.textContent = m[1];
      frag.appendChild(span);
      last = m.index + m[1].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

    node.parentNode.replaceChild(frag, node);
  }
}
