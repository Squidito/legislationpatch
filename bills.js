// bills.js — Bills page logic
// Loaded after app.js. window.BILLS_PAGE and window.activeBillCategories
// are set inline in bills.html before any scripts run.

const BILL_CAT_RULES = [
  {
    id: 'war',
    re: /\b(defense|military|army|navy|air force|space force|marines|pentagon|weapon|missile|submarine|combat|nato|veteran|terror|nuclear|troop|armed force|warfare|drone|bomb|fighter|aircraft carrier|special forces|isis|isil|hezbollah|hamas|ukraine|israel|iran|china|russia|taiwan|sanction|foreign policy|foreign assist|state department|usaid|pepfar|fmf|foreign military|peacekeep)\b/i,
  },
  {
    id: 'immigration',
    re: /\b(immigr|border|visa|asylum|refugee|deport|daca|tps\b|citizenship|undocumented|migrant|h-2b|h-1b|uscis|alien|naturalization|customs|cbp\b|ice\b|border patrol|green card|work permit|legal status|sanctuary)\b/i,
  },
  {
    id: 'economy',
    re: /\b(tax|trade|tariff|fiscal|budget|appropriat|small business|sba\b|irs\b|banking|finance|debt|inflation|commerce|revenue|spending|deficit|loan|credit|manufacture|economic|stock|market|crypto|currency|monetary|treasury|interest rate|gdp|employment|job|labor|worker|wage|workforce|wioa|pension|retirement|401k)\b/i,
  },
  {
    id: 'health',
    re: /\b(health|medicare|medicaid|opioid|mental health|fda\b|drug|hospital|insurance|snap\b|social security|disability|prescription|telehealth|nursing|cancer|disease|pepfar|hiv|aids|mced|chip\b|public health|vaccine|pandemic|abortion|reproductive|maternal|pediatric|pharmacy|pbm|medicai)\b/i,
  },
  {
    id: 'executive',
    re: /\b(executive|regulation|regulatory|rulemaking|agency|administrative|doge\b|efficiency|bureaucracy|deregulation|presidential|reorganiz|executive order|cabinet|white house|omb\b|opm\b|federal workforce|inspector general|civil servant)\b/i,
  },
  {
    id: 'government',
    re: /\b(government|oversight|transparency|election|judiciary|federal employee|continuing resolution|audit|gao\b|inspector general|appropriations act|shutdown|spending bill|omnibus|supplemental|rescission|appropriation|congress|senate|house of rep|committee|subcommittee|fema\b|dhs\b|tsa\b|cisa\b|coast guard)\b/i,
  },
  {
    id: 'civil',
    re: /\b(civil rights|discrimination|voting|education|housing|privacy|freedom|equality|police|criminal|constitution|amendment|gun|firearm|free speech|religion|lgbtq|gender|race|racial|protest|bail|prison|sentencing|due process|nfip|flood|disaster|environment|climate|wildlife|public land)\b/i,
  },
];

window.BILL_CAT_RULES = BILL_CAT_RULES;

window.getBillCategories = function(bill) {
  const text = [bill.title, bill.summary, bill.brief, (bill.changes?.added||[]).join(' ')]
    .filter(Boolean).join(' ');
  const matches = BILL_CAT_RULES.filter(r => r.re.test(text)).map(r => r.id);
  return matches.length ? matches : ['other'];
};

window.billMatchesCategories = function(bill) {
  if (!window.activeBillCategories || window.activeBillCategories.size === 0) return true;
  const billCats = window.getBillCategories(bill);
  return billCats.some(c => window.activeBillCategories.has(c));
};

// ── Category chip interactions ─────────────────────────────────────────────

function updateChipVisuals() {
  const isEmpty = window.activeBillCategories.size === 0;
  document.querySelectorAll('.bills-cat-chip').forEach(chip => {
    const cat = chip.dataset.cat;
    if (cat === 'all') {
      chip.classList.toggle('active', isEmpty);
    } else {
      chip.classList.toggle('active', window.activeBillCategories.has(cat));
    }
  });
}

document.addEventListener('click', e => {
  const chip = e.target.closest('.bills-cat-chip');
  if (!chip) return;
  const cat = chip.dataset.cat;
  if (cat === 'all') {
    window.activeBillCategories.clear();
  } else {
    if (window.activeBillCategories.has(cat)) {
      window.activeBillCategories.delete(cat);
    } else {
      window.activeBillCategories.add(cat);
    }
  }
  updateChipVisuals();
  if (typeof renderAll === 'function') renderAll();
});
