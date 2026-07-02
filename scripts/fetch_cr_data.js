// fetch_cr_data.js
// Fetches Congressional Record granule text for a date range.
// Does NOT call any LLM — outputs data/cr_raw.json for in-conversation Claude processing.
//
// Usage: node scripts/fetch_cr_data.js [--days=10]

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const GOVINFO_API_KEY  = process.env.GOVINFO_API_KEY;
const OUTPUT_FILE      = path.join(__dirname, '../data/cr_raw.json');
const QUOTES_FILE      = path.join(__dirname, '../data/quotes.json');
const DAYS             = parseInt(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || '10', 10);

const sleep = ms => new Promise(r => setTimeout(r, ms));

const SKIP_TITLES = [
  'PRAYER', 'PLEDGE', 'THE JOURNAL', 'RECESS', 'QUORUM', 'ANNOUNCEMENT',
  'RECOGNIZING', 'CELEBRATING', 'HONORING', 'TRIBUTE', 'MEMORIAL',
  'ADDITIONAL COSPONSORS', 'INTRODUCTION OF BILLS', 'MESSAGE FROM',
  'MEASURES PLACED', 'MEASURES READ', 'REPORTS OF COMMITTEES',
  'EXECUTIVE AND OTHER', 'SUBMISSION OF', 'TEXT OF SENATE AMENDMENT',
  'TEXT OF HOUSE AMENDMENT', 'DESIGNATION OF THE SPEAKER',
];

function loadProcessedDates() {
  try {
    const q = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8'));
    return new Set(q.processedDates || []);
  } catch (e) { return new Set(); }
}

// Step 1: check Congress.gov to get the CR publish date → GovInfo package ID
async function getCRPackageId(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  try {
    await sleep(1000);
    const res  = await fetch(`https://api.congress.gov/v3/congressional-record?y=${y}&m=${m}&d=${d}&format=json&api_key=${CONGRESS_API_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    const issues = data.Results?.Issues || [];
    if (!issues.length) return null;
    const pub = issues[0].PublishDate || `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return `CREC-${pub}`;
  } catch (e) { return null; }
}

// Step 2: get granules for a package
async function getSubstantiveGranules(packageId, chamber) {
  const granules = [];
  let offset = 0;
  const granuleClass = chamber.toUpperCase();
  while (offset < 500) {
    try {
      await sleep(1500);
      const res  = await fetch(`https://api.govinfo.gov/packages/${packageId}/granules?api_key=${GOVINFO_API_KEY}&pageSize=100&offset=${offset}`);
      if (res.status === 429) { console.log('    Rate limited — waiting 30s...'); await sleep(30000); continue; }
      if (!res.ok) break;
      const data = await res.json();
      const items = data.granules || [];
      if (!items.length) break;
      for (const g of items) {
        if (g.granuleClass !== granuleClass) continue;
        const title = (g.title || '').toUpperCase();
        if (SKIP_TITLES.some(s => title.startsWith(s))) continue;
        if (title.length < 10) continue;
        granules.push(g);
      }
      if (items.length < 100) break;
      offset += 100;
    } catch (e) { break; }
  }
  return granules;
}

// Step 3: fetch text of a granule
async function fetchGranuleText(packageId, granuleId) {
  try {
    await sleep(1200);
    const url = `https://api.govinfo.gov/packages/${packageId}/granules/${granuleId}/htm?api_key=${GOVINFO_API_KEY}`;
    const res  = await fetch(url);
    if (res.status === 429) { await sleep(30000); return ''; }
    if (!res.ok) return '';
    const html = await res.text();
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch (e) { return ''; }
}

async function main() {
  if (!CONGRESS_API_KEY) { console.error('CONGRESS_API_KEY not set.'); process.exit(1); }
  if (!GOVINFO_API_KEY)  { console.error('GOVINFO_API_KEY not set.'); process.exit(1); }

  const processedDates = loadProcessedDates();
  const results = [];

  const today = new Date();
  for (let i = 1; i <= DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    if (processedDates.has(ds)) { process.stdout.write(`[skip] ${ds}\n`); continue; }

    console.log(`\n[${ds}] Checking Congress.gov CR index...`);
    const packageId = await getCRPackageId(d);
    if (!packageId) { console.log('  No CR (recess or no session)'); continue; }
    console.log(`  Package: ${packageId}`);

    for (const chamber of ['House', 'Senate']) {
      console.log(`  [${chamber}] Fetching granules...`);
      const granules = await getSubstantiveGranules(packageId, chamber);
      console.log(`  [${chamber}] ${granules.length} substantive granule(s)`);
      if (!granules.length) continue;

      for (const g of granules.slice(0, 40)) {
        const title = g.title || '';
        process.stdout.write(`    ${title.slice(0, 60)}...\r`);
        const text = await fetchGranuleText(packageId, g.granuleId);
        if (!text || text.length < 200) continue;
        results.push({
          date: ds,
          packageId,
          granuleId: g.granuleId,
          granuleTitle: title,
          chamber,
          text: text.slice(0, 30000),
        });
      }
      console.log(`  [${chamber}] Done.`);
    }
  }

  console.log(`\n\nDone. ${results.length} granule(s) across ${new Set(results.map(r => r.date)).size} date(s).`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Saved to ${OUTPUT_FILE}`);
}

main().catch(console.error);
