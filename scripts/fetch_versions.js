// fetch_versions.js
//
// Records every text version of each cached bill (Introduced -> Reported ->
// Engrossed -> Enrolled ...) into `bill.versions[]` for the Version Timeline
// feature. Pure metadata from Congress.gov's text endpoint — no text download.
//
//   bill.versions = [{ type, date, url }]   // chronological, oldest first
//
// Usage:
//   node scripts/fetch_versions.js            (dry run, all bills)
//   node scripts/fetch_versions.js --apply    (write cache.json)
//   node scripts/fetch_versions.js --bill=119-HR-1 --apply

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const KEY   = process.env.CONGRESS_API_KEY;
const CACHE = path.join(__dirname, '../data/cache.json');
const APPLY = process.argv.includes('--apply');
const ONE   = (process.argv.find(a => a.startsWith('--bill=')) || '').split('=')[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Prefer the Congress.gov "Formatted Text" (HTML) link for a readable view.
function pickUrl(formats) {
  if (!formats || !formats.length) return null;
  const f = formats.find(x => /formatted text/i.test(x.type))
         || formats.find(x => /\.htm/i.test(x.url || ''))
         || formats[0];
  return f ? f.url : null;
}

// Milestone rank so versions order correctly even when the API omits a date
// (Enrolled often has no date; Public Law's date is the signing, after enrollment).
function rank(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('introduced')) return 1;
  if (t.includes('reported'))   return 2;
  if (t.includes('engrossed amendment')) return 4;
  if (t.includes('engrossed') || t.includes('considered and passed')) return 3;
  if (t.includes('placed on calendar') || t.includes('referred') || t.includes('received') || t.includes('held at')) return 3.5;
  if (t.includes('enrolled')) return 8;
  if (t.includes('public law')) return 9;
  return 5;
}

(async () => {
  if (!KEY) { console.error('CONGRESS_API_KEY not set'); process.exit(1); }
  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  let bills = cache.bills;
  if (ONE) bills = bills.filter(b => b.id === ONE);

  let updated = 0, multi = 0, errs = 0;
  for (const b of bills) {
    const [c, t, n] = b.id.split('-');
    try {
      await sleep(350);
      const res = await fetch(`https://api.congress.gov/v3/bill/${c}/${t.toLowerCase()}/${n}/text?format=json&api_key=${KEY}`);
      if (!res.ok) { errs++; console.warn(`  ! ${b.id} HTTP ${res.status}`); continue; }
      const data = await res.json();
      const vs = (data.textVersions || []).map(v => ({
        type: v.type || '',
        date: v.date ? String(v.date).slice(0, 10) : null,
        url:  pickUrl(v.formats),
      }));
      // Order by date, falling back to milestone rank when dates are missing/equal.
      vs.sort((a, x) => {
        const ra = rank(a.type), rx = rank(x.type);
        const da = a.date || (ra >= 8 ? '9999-99-99' : '0000');
        const dx = x.date || (rx >= 8 ? '9999-99-99' : '0000');
        if (da !== dx) return da < dx ? -1 : 1;
        return ra - rx;
      });
      b.versions = vs;
      updated++;
      if (vs.length >= 2) multi++;
    } catch (e) { errs++; console.warn(`  ! ${b.id} ${e.message}`); }
  }

  console.log(`versions set on ${updated} bill(s) — ${multi} with >=2 versions, ${errs} error(s)`);
  if (APPLY) {
    cache.generated = new Date().toISOString();
    fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
    console.log('✅ wrote cache.json');
  } else {
    console.log('(dry run — re-run with --apply to write)');
  }
})();
