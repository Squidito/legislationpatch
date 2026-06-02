const fs = require('fs');
const path = require('path');

const cacheFile = path.join(__dirname, '../data/cache.json');
const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

// Helper: shorten dollar amounts in a string
function shortenDollars(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\$([0-9,]+)/g, (match, num) => {
    const n = parseInt(num.replace(/,/g, ''), 10);
    if (isNaN(n)) return match;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
    if (n >= 1e8) return `$${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1e6) return `$${Math.round(n / 1e6)}M`;
    return match;
  });
}

function shortenObj(obj) {
  if (typeof obj === 'string') return shortenDollars(obj);
  if (Array.isArray(obj)) return obj.map(shortenObj);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = shortenObj(obj[k]);
    return out;
  }
  return obj;
}

// billSection mappings: billId -> headline -> section number
const billSections = {
  '119-HR-2815': {
    'Land Selection Change': '3',
    'Conveyance Deadlines': '4',
    'Public Access Preserved': '5',
  },
  '119-HR-2066': {
    'Leverage Cap Reduced': '2',
    'Common Control Limits': '2',
    'Rural and Technology Investment Exclusion': '2',
    'Private Capital Definition Expanded': '2',
  },
  '119-HR-972': {
    'Conservation Area Expansion': '3',
    'Pipeline Rights-of-Way': '3',
    'Excavation and Disposal': '3',
  },
  '119-S-1020': {
    'Construction Deadline Extension': '1',
    'License Reinstatement': '1',
  },
  '119-S-98': {
    'FCC Vetting Rulemaking': '2',
    'Application Requirements': '2',
    'Default Penalties': '2',
  },
};

const targetIds = new Set(Object.keys(billSections));

cache.bills = cache.bills.map(bill => {
  if (!targetIds.has(bill.id)) return bill;

  // Shorten all dollar amounts
  bill = shortenObj(bill);

  // Add billSection to top_lines
  const sections = billSections[bill.id];
  if (bill.top_lines && sections) {
    bill.top_lines = bill.top_lines.map(tl => {
      if (sections[tl.headline] && !tl.billSection) {
        return { ...tl, billSection: sections[tl.headline] };
      }
      return tl;
    });
  }

  return bill;
});

fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
console.log('Fixed billSection and dollar amounts for', [...targetIds].join(', '));
