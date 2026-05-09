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
  CR:    'Continuing Resolution',
  FY:    'Fiscal Year',
  GDP:   'Gross Domestic Product',
  // Immigration
  DACA:  'Deferred Action for Childhood Arrivals',
  TPS:   'Temporary Protected Status',
  USCIS: 'U.S. Citizenship and Immigration Services',
  // Benefits
  SNAP:  'Supplemental Nutrition Assistance Program',
  CHIP:  "Children's Health Insurance Program",
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
  el.textContent = anchorEl.getAttribute('data-full');

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

// Attach global delegation once
(function () {
  document.addEventListener('mouseover', function (e) {
    var tip = e.target && e.target.closest && e.target.closest('.acronym-tip');
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
