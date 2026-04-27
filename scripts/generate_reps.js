require('dotenv').config();
const fs   = require('fs');
const path = require('path');

let CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || '';
try {
  const cfg = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
  const m   = cfg.match(/CONGRESS_API_KEY:\s*['"]([^'"]+)['"]/);
  if (m?.[1]) CONGRESS_API_KEY = m[1];
} catch (e) {}

const cachePath  = path.join(__dirname, '../data/cache.json');
const quotesPath = path.join(__dirname, '../data/quotes.json');
const repsDir    = path.join(__dirname, '../data/reps');

if (!fs.existsSync(repsDir)) fs.mkdirSync(repsDir, { recursive: true });

// Reps that always get a profile even if not in featured_quotes (e.g. SHOCK_QUOTES)
const SEED_BIOGUIDES = [
  'G000596', // Rep. Marjorie Taylor Greene
  'C001127', // Rep. Jasmine Crockett
  'T000278', // Sen. Tommy Tuberville
  'T000481', // Rep. Rashida Tlaib
];

let data;
try { data = JSON.parse(fs.readFileSync(cachePath, 'utf8')); }
catch (e) { console.error('Failed to read cache.json', e); process.exit(1); }

const bills = Array.isArray(data.bills) ? data.bills : Object.values(data.bills || {});
const reps  = {};

// Build from cache.json featured_quotes
bills.forEach(bill => {
  (bill.featured_quotes || []).forEach(q => {
    const id = q.bioguideId;
    if (!id) return;
    if (!reps[id]) reps[id] = { bioguideId: id, name: q.name, party: q.party, state: q.state, bio: '', comments: [] };
    reps[id].comments.push({
      billId: bill.id, billTitle: bill.title,
      stance: q.stance, text: q.text,
      date: bill.date || ''
    });
  });
});

// Build from data/quotes.json (standalone CR quotes)
let standaloneQuotes = [];
try { standaloneQuotes = JSON.parse(fs.readFileSync(quotesPath, 'utf8')).quotes || []; } catch (e) {}
standaloneQuotes.forEach(q => {
  const id = q.bioguideId;
  if (!id) return;
  if (!reps[id]) reps[id] = { bioguideId: id, name: q.name, party: q.party, state: q.state, bio: '', comments: [] };
  if (q.text && !reps[id].comments.some(c => c.text === q.text)) {
    reps[id].comments.push({
      billId: q.billId || null, billTitle: q.billTitle || null,
      stance: q.stance || null, text: q.text,
      date: (q.source || '').replace(/^(House|Senate) Floor,?\s*/i, '')
    });
  }
});

// Ensure seed reps exist even with no quotes
SEED_BIOGUIDES.forEach(id => {
  if (!reps[id]) reps[id] = { bioguideId: id, name: '', party: '', state: '', bio: '', comments: [] };
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchBio(rep) {
  if (!CONGRESS_API_KEY) {
    if (!rep.bio) rep.bio = `${rep.name || 'This member'} is a member of the United States Congress.`;
    rep.role = rep.role || 'Member of Congress';
    return;
  }
  try {
    await sleep(500);
    const res = await fetch(`https://api.congress.gov/v3/member/${rep.bioguideId}?api_key=${CONGRESS_API_KEY}`);
    if (!res.ok) throw new Error(res.status);
    const d      = await res.json();
    const member = d.member;
    if (!member) throw new Error('no member');
    const terms  = member.terms || [];
    const latest = terms[terms.length - 1] || {};
    const type   = latest.memberType === 'Senator' ? 'Senator' : 'Representative';
    rep.role     = type;
    rep.district = latest.district || null;
    rep.name     = rep.name || member.directOrderName || member.invertedOrderName || rep.name;
    rep.party    = rep.party || (member.partyHistory?.[0]?.partyAbbreviation) || rep.party;
    rep.state    = rep.state || latest.stateCode || rep.state;
    const districtText = rep.district ? ` for District ${rep.district}` : '';
    rep.bio = `${rep.name} is a ${type} representing ${rep.state}${districtText}.`;
  } catch (e) {
    rep.bio  = rep.bio  || `${rep.name || 'This member'} is a member of the United States Congress.`;
    rep.role = rep.role || 'Member of Congress';
  }
}

async function run() {
  const repList = Object.values(reps);
  if (!repList.length) { console.log('No reps found.'); return; }
  console.log(`Generating profiles for ${repList.length} rep(s)...`);
  for (const rep of repList) {
    console.log(`  ${rep.bioguideId} — ${rep.name || '(unknown name)'}`);
    await fetchBio(rep);
    fs.writeFileSync(path.join(repsDir, `${rep.bioguideId}.json`), JSON.stringify(rep, null, 2));
  }
  console.log(`Done. ${repList.length} rep files written to data/reps/`);
}

run();
