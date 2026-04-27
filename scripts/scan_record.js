// scan_record.js — Scan Congressional Record for the last N days, extract notable quotes.
// Usage: node scripts/scan_record.js [--days=30] [--reset]
//
// Outputs: data/quotes.json
// Skips dates already processed unless --reset is passed.

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

// ---- Config ----
let CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || '';
try {
  const cfg = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
  const m   = cfg.match(/CONGRESS_API_KEY:\s*['"]([^'"]+)['"]/);
  if (m?.[1]) CONGRESS_API_KEY = m[1];
} catch (e) {}

const LM_STUDIO_URL = 'http://localhost:1235/v1/chat/completions';
const QUOTES_FILE   = path.join(__dirname, '../data/quotes.json');
const DAYS          = parseInt(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || '30', 10);
const RESET         = process.argv.includes('--reset');
const MAX_WORDS     = 7000; // truncate CR sections before sending to LLM

if (!CONGRESS_API_KEY) { console.error('CONGRESS_API_KEY not set.'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Load / init output file ----
let quotesData = { generated: null, processedDates: [], quotes: [] };
if (!RESET && fs.existsSync(QUOTES_FILE)) {
  try { quotesData = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8')); } catch (e) {}
}
const processedDates = new Set(quotesData.processedDates || []);

// ---- Member name → bioguideId cache ----
const bioguideCache = {};

async function resolveBioguideId(name) {
  if (!name) return null;
  const lastName = name.replace(/^(Sen\.|Rep\.|Mr\.|Ms\.|Mrs\.|Dr\.) /, '').trim().split(' ').pop();
  if (bioguideCache[lastName] !== undefined) return bioguideCache[lastName] || null;

  try {
    await sleep(400);
    const url = `https://api.congress.gov/v3/member?name=${encodeURIComponent(lastName)}&currentMember=true&limit=5&api_key=${CONGRESS_API_KEY}`;
    const res  = await fetch(url);
    if (!res.ok) { bioguideCache[lastName] = null; return null; }
    const data    = await res.json();
    const members = data.members || [];
    if (members.length === 1) {
      bioguideCache[lastName] = members[0].bioguideId;
      return members[0].bioguideId;
    }
    // Try to narrow by party/state if available
    bioguideCache[lastName] = members[0]?.bioguideId || null;
    return bioguideCache[lastName];
  } catch (e) { bioguideCache[lastName] = null; return null; }
}

// ---- Fetch CR index for a given date ----
async function fetchCRSections(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const url = `https://api.congress.gov/v3/congressional-record?y=${y}&m=${m}&d=${d}&format=json&api_key=${CONGRESS_API_KEY}`;

  try {
    await sleep(1000);
    const res  = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    const issues   = data.Results?.Issues || data.dailyCongressionalRecord || [];
    if (!issues.length) return [];

    const sections = [];
    for (const issue of issues) {
      for (const chamber of ['House', 'Senate']) {
        let sectionUrl = null;
        const items = issue.links?.items || issue.sections || [];
        for (const item of items) {
          if ((item.name || item.label || '').includes(chamber)) {
            sectionUrl = item.url || item.htmlUrl; break;
          }
        }
        if (!sectionUrl) {
          const links = issue.links || {};
          for (const key of Object.keys(links)) {
            if (key.includes(chamber) && links[key]?.HTML) {
              sectionUrl = links[key].HTML; break;
            }
          }
        }
        if (sectionUrl) sections.push({ chamber, url: sectionUrl });
      }
    }
    return sections;
  } catch (e) { return []; }
}

// ---- Fetch and clean a CR section ----
async function fetchSectionText(url) {
  try {
    await sleep(1000);
    const res  = await fetch(url);
    if (!res.ok) return '';
    const html = await res.text();
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // Truncate to MAX_WORDS
    return text.split(' ').slice(0, MAX_WORDS).join(' ');
  } catch (e) { return ''; }
}

// ---- LLM quote extraction ----
async function extractQuotesWithLLM(text, chamber, dateStr) {
  const prompt = `You are reading a ${chamber} section of the Congressional Record from ${dateStr}.

Extract up to 5 of the most notable, surprising, or controversial direct floor quotes from named speakers. Skip procedural statements, quorum calls, unanimous consent requests, and routine motions. Focus on substantive opinions, criticism, or striking statements about legislation.

For each quote return:
- name: Full name with title (e.g. "Rep. Nancy Pelosi" or "Sen. Chuck Schumer")
- party: "D", "R", or "I"
- state: Two-letter state code
- text: The verbatim quote, 1-3 sentences max — the most striking part only
- billId: Bill number if explicitly mentioned (format: "119-HR-1234" or "119-S-567"), or null
- stance: "support", "oppose", or "neutral"

Return ONLY valid JSON: {"quotes": [...]}
If no notable quotes found, return {"quotes": []}

Congressional Record text:
${text.slice(0, 25000)}`;

  try {
    const res  = await fetch(LM_STUDIO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local-model',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1200,
        stream: false,
        enable_thinking: false
      })
    });
    if (!res.ok) { console.log(`    LLM error: ${res.status}`); return []; }
    const data    = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return [];
    const parsed  = JSON.parse(jsonStr);
    return parsed.quotes || [];
  } catch (e) { console.log(`    LLM parse error: ${e.message}`); return []; }
}

// ---- Normalise a raw LLM quote into our schema ----
function normaliseQuote(q, chamber, dateStr) {
  const monthNames = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                       Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
  // dateStr is YYYY-MM-DD
  const [y, mo, d] = dateStr.split('-');
  const mon = Object.keys(monthNames).find(k => monthNames[k] === mo) || mo;
  const source = `${chamber} Floor, ${mon} ${parseInt(d)}, ${y}`;
  return {
    name:       q.name   || '',
    party:      (q.party || 'I').toUpperCase().slice(0, 1),
    state:      (q.state || '').toUpperCase().slice(0, 2),
    bioguideId: null,
    text:       q.text   || '',
    source,
    stance:     q.stance || 'neutral',
    billId:     q.billId || null,
    billTitle:  null
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

  console.log(`Scanning Congressional Record — last ${DAYS} days (${dates.length} dates)`);
  console.log(`Already processed: ${processedDates.size} dates\n`);

  let added = 0;

  for (const date of dates) {
    const ds = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

    if (processedDates.has(ds)) {
      process.stdout.write(`[skip] ${ds}\r`);
      continue;
    }

    console.log(`[${ds}] Fetching CR index...`);
    const sections = await fetchCRSections(date);

    if (!sections.length) {
      console.log(`  No CR found (Congress likely not in session)`);
      processedDates.add(ds);
    } else {
      for (const { chamber, url } of sections) {
        console.log(`  Fetching ${chamber} section...`);
        const text = await fetchSectionText(url);
        if (!text) { console.log(`  Empty section, skipping`); continue; }

        console.log(`  Extracting quotes (${text.split(' ').length} words)...`);
        const raw = await extractQuotesWithLLM(text, chamber, ds);
        console.log(`  Found ${raw.length} quote(s)`);

        for (const q of raw) {
          if (!q.text || q.text.length < 20) continue;
          const normed = normaliseQuote(q, chamber, ds);
          normed.bioguideId = await resolveBioguideId(normed.name);
          quotesData.quotes.push(normed);
          added++;
        }
      }
      processedDates.add(ds);
    }

    // Save progress after every date
    quotesData.processedDates = [...processedDates].sort();
    quotesData.generated      = new Date().toISOString();
    fs.writeFileSync(QUOTES_FILE, JSON.stringify(quotesData, null, 2));
    await sleep(500);
  }

  console.log(`\nDone. Added ${added} new quote(s). Total in quotes.json: ${quotesData.quotes.length}`);
  if (added > 0) console.log('Run `node scripts/generate_reps.js` to rebuild rep profiles with new quotes.');
}

run();
