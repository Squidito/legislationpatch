// scan_record.js — Scan Congressional Record for the last N days, extract notable quotes.
//
// Usage:
//   node scripts/scan_record.js [--days=30] [--reset]
//
// Requires in .env:
//   CONGRESS_API_KEY=...    (Congress.gov — you already have this)
//   GOVINFO_API_KEY=...     (GovInfo.gov — free key at https://api.data.gov/signup/)
//
// Outputs: data/quotes.json
// Skips dates already processed unless --reset is passed.

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { ACRONYMS } = require('../acronyms');

const _ACRONYM_EXCLUDED = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN',
  'TX','UT','VT','VA','WA','WV','WI','WY','DC',
  'USA','US','TV','AM','PM','AI','IT','HR','GOP',
  'II','III','IV','VI','VII','VIII','IX','XI','XII',
]);

function reportQuoteAcronyms(text, speaker) {
  const known = new Set(Object.keys(ACRONYMS));
  const found = new Set();
  const pat = /\b([A-Z]{2,6})\b/g;
  let m;
  while ((m = pat.exec(text)) !== null) {
    if (!known.has(m[1]) && !_ACRONYM_EXCLUDED.has(m[1])) found.add(m[1]);
  }
  if (found.size) {
    console.log(`  [ACRONYMS] Unknown in quote (${speaker}) — add to acronyms.js if needed:`);
    console.log(`  → ${[...found].sort().join(', ')}`);
  }
}

// ---- Config ----
let CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || '';
let GOVINFO_API_KEY  = process.env.GOVINFO_API_KEY  || '';
try {
  const cfg = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
  const mk  = cfg.match(/CONGRESS_API_KEY.*?['"]([A-Za-z0-9]+)['"]/);
  const mg  = cfg.match(/GOVINFO_API_KEY.*?['"]([A-Za-z0-9]+)['"]/);
  if (mk?.[1]) CONGRESS_API_KEY = mk[1];
  if (mg?.[1]) GOVINFO_API_KEY  = mg[1];
} catch (e) {}

if (!CONGRESS_API_KEY) { console.error('CONGRESS_API_KEY not set.'); process.exit(1); }
if (!GOVINFO_API_KEY)  {
  console.error('GOVINFO_API_KEY not set.');
  console.error('Get a free key at: https://api.data.gov/signup/');
  console.error('Then add GOVINFO_API_KEY=your_key to your .env file.');
  process.exit(1);
}

const LM_STUDIO_URL = 'http://localhost:1235/v1/chat/completions';
const QUOTES_FILE   = path.join(__dirname, '../data/quotes.json');
const DAYS          = parseInt(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || '30', 10);
const RESET         = process.argv.includes('--reset');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Load bill reference from cache.json for in-context Qwen matching ----
const BILL_REFERENCE = [];
try {
  const raw   = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cache.json'), 'utf8'));
  const bills = Array.isArray(raw.bills) ? raw.bills : Object.values(raw.bills || {});
  bills.forEach(b => { if (b.id && b.title) BILL_REFERENCE.push({ id: b.id, title: b.title }); });
} catch (e) {}

// ---- Load / init output file ----
let quotesData = { generated: null, processedDates: [], quotes: [] };
if (!RESET && fs.existsSync(QUOTES_FILE)) {
  try { quotesData = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8')); } catch (e) {}
}
const processedDates = new Set(quotesData.processedDates || []);

// ---- Local rep lookup (reps-index.json) — used first before API ----
const repsByLastName = {};
try {
  const repsIndex = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/reps-index.json'), 'utf8'));
  for (const stateReps of Object.values(repsIndex)) {
    for (const rep of stateReps) {
      const ln = rep.name.split(/\s+/).pop().toLowerCase();
      if (!repsByLastName[ln]) repsByLastName[ln] = [];
      repsByLastName[ln].push(rep);
    }
  }
} catch (e) { console.warn('Warning: could not load reps-index.json for local lookup'); }

const bioguideCache = {};
async function resolveRepInfo(name) {
  if (!name) return {};
  const clean    = name.replace(/^(Sen\.|Rep\.|Mr\.|Ms\.|Mrs\.|Dr\.) /, '').trim();
  const parts    = clean.split(/\s+/);
  const lastName = parts.pop().toLowerCase();
  const firstName = (parts[0] || '').toLowerCase();
  if (!lastName || lastName.length < 3) return {};

  // Local lookup — prefer this over the API (API returns wrong IDs)
  const candidates = repsByLastName[lastName] || [];
  if (candidates.length === 1) {
    const r = candidates[0];
    return { bioguideId: r.bioguideId, party: r.party, state: r.state };
  }
  if (candidates.length > 1 && firstName) {
    const match = candidates.find(r => r.name.toLowerCase().split(/\s+/)[0].startsWith(firstName));
    if (match) return { bioguideId: match.bioguideId, party: match.party, state: match.state };
  }

  // API fallback for speakers not in our reps library (e.g. former members)
  if (lastName in bioguideCache) return { bioguideId: bioguideCache[lastName] };
  try {
    await sleep(600);
    const url = `https://api.congress.gov/v3/member?name=${encodeURIComponent(clean)}&currentMember=true&limit=5&api_key=${CONGRESS_API_KEY}`;
    const res  = await fetch(url);
    if (!res.ok) { bioguideCache[lastName] = null; return {}; }
    const data = await res.json();
    const members = data.members || [];
    bioguideCache[lastName] = members[0]?.bioguideId || null;
    return { bioguideId: bioguideCache[lastName] };
  } catch (e) { bioguideCache[lastName] = null; return {}; }
}

// ---- Check if CR exists for a date via Congress.gov ----
async function getCRPackageId(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  try {
    await sleep(1000);
    const res  = await fetch(`https://api.congress.gov/v3/congressional-record?y=${y}&m=${m}&d=${d}&format=json&api_key=${CONGRESS_API_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    const issues = data.Results?.Issues || [];
    if (!issues.length) return null;
    // Return the publish date in YYYY-MM-DD format for GovInfo package ID
    const pub = issues[0].PublishDate || `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return `CREC-${pub}`;
  } catch (e) { return null; }
}

// ---- Fetch list of substantive granules from GovInfo ----
// Skips procedural items (tributes, prayers, quorum calls, etc.)
const SKIP_TITLES = [
  'PRAYER', 'PLEDGE', 'THE JOURNAL', 'RECESS', 'QUORUM', 'ANNOUNCEMENT',
  'RECOGNIZING', 'CELEBRATING', 'HONORING', 'TRIBUTE', 'MEMORIAL',
  'ADDITIONAL COSPONSORS', 'INTRODUCTION OF BILLS', 'MESSAGE FROM',
  'MEASURES PLACED', 'MEASURES READ', 'REPORTS OF COMMITTEES',
  'EXECUTIVE AND OTHER', 'SUBMISSION OF', 'TEXT OF SENATE AMENDMENT',
  'TEXT OF HOUSE AMENDMENT', 'DESIGNATION OF THE SPEAKER',
];

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

// ---- Fetch text of a granule ----
async function fetchGranuleText(packageId, granuleId) {
  try {
    await sleep(2000);
    const url = `https://api.govinfo.gov/packages/${packageId}/granules/${granuleId}/htm?api_key=${GOVINFO_API_KEY}`;
    const res  = await fetch(url);
    if (res.status === 429) { await sleep(30000); return ''; }
    if (!res.ok) return '';
    const html = await res.text();
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch (e) { return ''; }
}

// ---- LLM quote extraction ----
async function extractQuotesWithLLM(text, chamber, dateStr, granuleTitles = [], billRef = []) {
  if (!text || text.length < 100) return [];

  const truncated = text.split(' ').slice(0, 10000).join(' ');

  const sectionsLine = granuleTitles.length
    ? `\nThe text covers these CR sections: ${granuleTitles.join(' | ')}`
    : '';

  const billLine = billRef.length
    ? `\nKnown bills currently tracked (use exact ID if the speaker is referencing one):\n${billRef.map(b => `  ${b.id} — ${b.title}`).join('\n')}`
    : '';

  const prompt = `You are reading a ${chamber} section of the Congressional Record dated ${dateStr}.${sectionsLine}${billLine}

Your ONLY job is to find and copy direct quotes exactly as they appear in the text. Do NOT paraphrase, summarize, or reword anything. Copy the speaker's exact words only.

Extract up to 5 of the most notable, surprising, or controversial direct floor quotes from named speakers.

SKIP: procedural statements, quorum calls, unanimous consent requests, routine motions, tributes to constituents, commemorations, prayers, ceremonial speeches, and floor statements about non-legislative events (e.g. charity bike rides, local achievements).

PREFER: quotes that directly reference specific legislation, policy decisions, or named government actions. Only include general political statements (no bill cited) if they are exceptionally striking or newsworthy.

SPEAKER LIMIT: Include no more than 2 quotes from any single speaker across all quotes returned.

For each quote return:
- name: Full name with title (e.g. "Rep. Nancy Pelosi" or "Sen. Chuck Schumer")
- party: "D", "R", or "I"
- state: Two-letter state code (if not clear, use best guess)
- text: COPY the exact verbatim words from the text — 1-3 sentences, the most striking passage only. Do not change a single word.
- billId: If the speaker references a known tracked bill above, use its exact ID. If they cite any other bill number explicitly, format as "119-HR-1234" or "119-S-567". Otherwise null.
- granuleTitle: The CR section heading this quote came from. Use the exact --- heading text in the source (e.g. "FEDERAL RESERVE INDEPENDENCE ACT" or "IRAN WAR POWERS"). This field is required — do not omit it.
- stance: "support", "oppose", or "neutral"

Return ONLY valid JSON: {"quotes": [...]}
If no notable quotes found, return {"quotes": []}

Congressional Record text:
${truncated}`;

  try {
    await sleep(1000);
    const res  = await fetch(LM_STUDIO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local-model',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 10000,
        stream: false
      })
    });
    if (!res.ok) return [];
    const data    = await res.json();
    const msg     = data.choices?.[0]?.message || {};
    // Qwen3 puts thinking in reasoning_content; actual answer goes in content
    const content = msg.content || msg.reasoning_content || '';
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return [];
    return JSON.parse(jsonStr).quotes || [];
  } catch (e) { return []; }
}

function normaliseQuote(q, chamber, dateStr) {
  const [y, mo, d] = dateStr.split('-');
  const monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mo)-1];
  const billId    = q.billId || null;
  const knownBill = billId ? BILL_REFERENCE.find(b => b.id === billId) : null;
  return {
    name:         q.name  || '',
    party:        (q.party || 'I').toUpperCase().slice(0, 1),
    state:        (q.state || '').toUpperCase().slice(0, 2),
    bioguideId:   null,
    text:         q.text  || '',
    source:       `${chamber} Floor, ${monthName} ${parseInt(d)}, ${y}`,
    stance:       q.stance || 'neutral',
    billId,
    billTitle:    knownBill?.title || null,
    granuleTitle: q.granuleTitle || null,
  };
}

// ---- Main ----
async function run() {
  const dates = [];
  for (let i = 1; i <= DAYS; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d);
  }

  console.log(`Scanning Congressional Record — last ${DAYS} days`);
  console.log(`Already processed: ${processedDates.size} dates\n`);

  let added = 0;

  for (const date of dates) {
    const ds = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

    if (processedDates.has(ds)) { process.stdout.write(`[skip] ${ds}\r`); continue; }

    console.log(`[${ds}] Checking Congress.gov CR index...`);
    const packageId = await getCRPackageId(date);

    if (!packageId) {
      console.log(`  No CR (recess or no session)`);
    } else {
      console.log(`  Package: ${packageId}`);

      for (const chamber of ['House', 'Senate']) {
        console.log(`  [${chamber}] Fetching substantive granules...`);
        const granules = await getSubstantiveGranules(packageId, chamber);
        console.log(`  [${chamber}] Found ${granules.length} substantive granule(s)`);

        if (!granules.length) continue;

        // Fetch text from up to 8 granules per chamber, concatenate for LLM
        const texts = [];
        const granuleTitles = [];
        for (const g of granules.slice(0, 8)) {
          const t = await fetchGranuleText(packageId, g.granuleId);
          if (t.length > 50) {
            texts.push(`--- ${g.title} ---\n${t}`);
            granuleTitles.push(g.title);
          }
        }

        if (!texts.length) { console.log(`  [${chamber}] No text retrieved`); continue; }

        const combined = texts.join('\n\n');
        console.log(`  [${chamber}] Extracting quotes from ~${combined.split(' ').length} words...`);
        const raw = await extractQuotesWithLLM(combined, chamber, ds, granuleTitles, BILL_REFERENCE);
        console.log(`  [${chamber}] Found ${raw.length} quote(s)`);

        for (const q of raw) {
          if (!q.text || q.text.length < 20) continue;
          const normed   = normaliseQuote(q, chamber, ds);
          const repInfo  = await resolveRepInfo(normed.name);
          normed.bioguideId = repInfo.bioguideId || null;
          if (repInfo.party) normed.party = repInfo.party;
          if (repInfo.state) normed.state = repInfo.state;
          quotesData.quotes.push(normed);
          reportQuoteAcronyms(normed.text, normed.name);
          added++;
        }
      }
    }

    processedDates.add(ds);
    quotesData.processedDates = [...processedDates].sort();
    quotesData.generated      = new Date().toISOString();
    fs.writeFileSync(QUOTES_FILE, JSON.stringify(quotesData, null, 2));
    console.log(`  Saved. Running total: ${quotesData.quotes.length} quote(s)\n`);
    await sleep(500);
  }

  console.log(`\nDone. Added ${added} new quote(s). Total in quotes.json: ${quotesData.quotes.length}`);
  if (added > 0) console.log('Run `node scripts/generate_reps.js` to rebuild rep profiles.');
}

run();
