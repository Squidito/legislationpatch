const fs   = require('fs');
const path = require('path');

const cacheFile = path.join(__dirname, '../data/cache.json');
const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

function patchBill(id, fn) {
  const idx = cache.bills.findIndex(b => b.id === id);
  if (idx === -1) { console.warn('Not found:', id); return; }
  cache.bills[idx] = fn(cache.bills[idx]);
  console.log('Patched', id);
}

// ─── HR-6260: remove U.S.C. citation from top_line sub ───────────────────────
patchBill('119-HR-6260', b => ({
  ...b,
  top_lines: b.top_lines.map(tl => {
    if (tl.headline !== 'Bail Redefined as Insurance Activity') return tl;
    return {
      ...tl,
      subs: [
        'Adds posting of monetary bail, criminal bail bonds, and federal immigration bail bonds to the federal definition of "business of insurance"',
        'Subjects bail-posting entities — including charitable bail organizations — to federal criminal fraud and embezzlement provisions that apply to insurance companies',
      ],
    };
  }),
}));

// ─── S-723: define Realty Ombudsman inline in top_lines ──────────────────────
patchBill('119-S-723', b => ({
  ...b,
  top_lines: b.top_lines.map(tl => {
    if (tl.headline !== 'Oversight and Reporting') return tl;
    return {
      ...tl,
      subs: tl.subs.map(s =>
        s.startsWith('New Realty Ombudsman')
          ? 'New Realty Ombudsman — a BIA official who monitors deadline compliance and resolves complaints from tribes and lenders — established within BIA Division of Real Estate Services'
          : s
      ),
    };
  }),
}));

fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
console.log('Done.');
