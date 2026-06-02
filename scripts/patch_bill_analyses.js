const fs   = require('fs');
const path = require('path');

const cacheFile = path.join(__dirname, '../data/cache.json');
const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

function patchBill(id, fn) {
  const idx = cache.bills.findIndex(b => b.id === id);
  if (idx === -1) { console.warn('Bill not found:', id); return; }
  cache.bills[idx] = fn(cache.bills[idx]);
  console.log('Patched', id);
}

// ─── Deduplicate vote records (keep one per chamber+date+method combo) ──────
function dedupeVotes(votes) {
  if (!votes) return votes;
  const seen = new Set();
  return votes.filter(v => {
    const key = `${v.chamber}|${v.date}|${v.method || ''}|${v.yeas ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── 119-HR-2815 Cape Fox ────────────────────────────────────────────────────
patchBill('119-HR-2815', b => ({
  ...b,
  summary: "The Alaska Native Claims Settlement Act of 1971 (ANCSA) gave Alaska Native corporations the right to select federal land as compensation for aboriginal land claims. Cape Fox Corporation — the Native village corporation for Saxman, Alaska — still has acres remaining from that original entitlement. This bill lets Cape Fox satisfy that remaining entitlement by selecting approximately 180 acres in the Tongass National Forest rather than a previously required township parcel near Saxman. The subsurface estate of the selected land goes to Sealaska Corporation, and a public access easement is reserved.",
  brief: "Lets Cape Fox Corporation fulfill its remaining Alaska Native land entitlement under the 1971 ANCSA settlement by selecting 180 acres in Tongass National Forest instead of the originally required township parcel.",
  top_lines: [
    {
      headline: 'Land Selection Change',
      subs: [
        'Cape Fox may select approximately 180 acres in Tongass National Forest instead of ~185 acres in the Saxman township',
      ],
      billSection: '3'
    },
    {
      headline: 'Conveyance Deadlines',
      subs: [
        'Cape Fox has 90 days from enactment to submit written notice of selection to the Secretary of the Interior',
        'Interior must convey surface estate to Cape Fox within 180 days of receiving the selection notice',
        'Subsurface estate of the same land conveyed simultaneously to Sealaska Corporation',
      ],
      billSection: '4'
    },
    {
      headline: 'Public Access Preserved',
      subs: [
        'Easement reserved under ANCSA Section 17(b) to allow public access to National Forest land via George Inlet on Revillagigedo Island',
      ],
      billSection: '5'
    },
  ],
  gaps: [
    "The bill does not specify what happens to Cape Fox's entitlement if no written selection notice is submitted within the 90-day window.",
    "The bill conveys the subsurface estate to Sealaska upon Cape Fox surface conveyance but does not address the disposition of existing mineral rights or subsurface claims at the time of conveyance.",
  ],
  votes: dedupeVotes(b.votes),
}));

// ─── 119-HR-2066 Investing in All of America ────────────────────────────────
patchBill('119-HR-2066', b => ({
  ...b,
  summary: "Reduces the maximum leverage a Small Business Investment Company (SBIC) can obtain from the SBA from 300% to 200% of its private capital, while adding a new exclusion from the leverage calculation for investments in rural areas, covered technology categories, or small manufacturers — up to the lesser of 50% of private capital or $125M. Also expands what counts as private capital to include college and university endowments and foundations.",
  brief: "Lowers the SBIC leverage ceiling from 300% to 200% of private capital and creates a new $125M exclusion for investments in rural areas, critical technologies, and small manufacturers.",
  changes: {
    ...b.changes,
    modified: [
      'Individual SBIC leverage ceiling — from 300% to 200% of private capital',
      'Commonly controlled SBIC aggregate cap — restructured from a single $350M limit to two tiers: $475M for quarterly/semiannual interest payers and $350M for all others',
      'Private capital definition — expanded to include college/university foundation, endowment, or trust',
    ],
  },
  votes: dedupeVotes(b.votes),
}));

// ─── 119-HR-972 Sloan Canyon ─────────────────────────────────────────────────
patchBill('119-HR-972', b => ({
  ...b,
  votes: dedupeVotes(b.votes),
}));

// ─── 119-S-1020 FERC Hydropower ──────────────────────────────────────────────
patchBill('119-S-1020', b => ({
  ...b,
  changes: {
    ...b.changes,
    modified: [
      'Maximum extension authority for covered project construction deadlines — from up to 8 years to up to 14 years total extension time',
    ],
  },
  gaps: [
    'The bill requires "good cause shown" for an extension but does not define good cause or establish criteria, leaving the standard entirely to FERC discretion.',
    'The bill applies only to projects licensed before March 13, 2020 but does not explain the significance of that date or address treatment of projects licensed on that date.',
    'The bill does not address whether environmental review requirements attached to the original license must be updated before construction may begin under the extended deadline.',
  ],
  votes: dedupeVotes(b.votes),
}));

// ─── 119-S-98 Rural Broadband ────────────────────────────────────────────────
patchBill('119-S-98', b => {
  const newTopLines = b.top_lines.map(tl => {
    if (tl.headline !== 'Default Penalties') return tl;
    return {
      ...tl,
      subs: [
        'Minimum $9,000 per violation for pre-authorization defaults',
        "Base forfeiture may not fall below 30% of the applicant's total support unless FCC demonstrates the need for lower penalties in a particular instance",
      ],
    };
  });
  const newGaps = b.gaps.map(g =>
    g.includes('specific instance') ? g.replace('specific instance', 'particular instance') : g
  );
  return { ...b, top_lines: newTopLines, gaps: newGaps, votes: dedupeVotes(b.votes) };
});

fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
console.log('\nAll patches applied.');
