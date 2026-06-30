// fetch_version_texts.js
//
// For the Version Timeline net-change summary: fetch the INTRODUCED text and the
// LATEST text of a bill, strip HTML, and save both so they can be read + diffed.
// The summary must come from these two texts only (sourcing rule).
//
//   node scripts/fetch_version_texts.js --bill=119-HR-1316
//   -> data/version-text/119-HR-1316.introduced.txt
//      data/version-text/119-HR-1316.latest.txt

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const ONE = (process.argv.find(a => a.startsWith('--bill=')) || '').split('=')[1];
const CACHE = path.join(__dirname, '../data/cache.json');
const OUTDIR = path.join(__dirname, '../data/version-text');

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

function rank(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('enrolled')) return 9;
  if (t.includes('engrossed amendment')) return 7;
  if (t.includes('engrossed') || t.includes('considered and passed')) return 6;
  if (t.includes('reported')) return 4;
  if (t.includes('introduced')) return 1;
  return 3; // procedural reprints
}

(async () => {
  if (!ONE) { console.error('pass --bill=119-HR-1'); process.exit(1); }
  const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const bill = cache.bills.find(b => b.id === ONE);
  if (!bill || !bill.versions?.length) { console.error('no versions for ' + ONE); process.exit(1); }

  // Introduced = the introduced version (fallback: earliest). Latest = highest-rank
  // text-bearing version (Enrolled > Engrossed Amendment > Engrossed > Reported).
  const intro = bill.versions.find(v => /introduced/i.test(v.type)) || bill.versions[0];
  const latest = bill.versions
    .filter(v => !/public law/i.test(v.type))           // Public Law text == Enrolled
    .slice().sort((a, b) => rank(b.type) - rank(a.type))[0];

  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  for (const [tag, v] of [['introduced', intro], ['latest', latest]]) {
    if (!v?.url) { console.warn(`  ! ${tag}: no url`); continue; }
    const res = await fetch(v.url);
    if (!res.ok) { console.warn(`  ! ${tag}: HTTP ${res.status} (${v.url})`); continue; }
    const text = strip(await res.text());
    const file = path.join(OUTDIR, `${ONE}.${tag}.txt`);
    fs.writeFileSync(file, text);
    console.log(`${tag}: "${v.type}" ${v.date || ''} — ${text.length} chars -> ${path.relative(path.join(__dirname,'..'), file)}`);
  }
})();
