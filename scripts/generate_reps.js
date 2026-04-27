// generate_reps.js — Build rep profile JSON files for data/reps/
//
// Usage:
//   node scripts/generate_reps.js          — update profiles for reps in quotes/cache only
//   node scripts/generate_reps.js --all    — fetch ALL 119th Congress members, build full library

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

let CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || '';
try {
  const cfg = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
  const m   = cfg.match(/CONGRESS_API_KEY.*?['"]([A-Za-z0-9]+)['"]/);
  if (m?.[1]) CONGRESS_API_KEY = m[1];
} catch (e) {}

const CONGRESS_SESSION = parseInt(process.env.CONGRESS_SESSION || '119', 10);
const ALL_MODE  = process.argv.includes('--all');
const cachePath  = path.join(__dirname, '../data/cache.json');
const quotesPath = path.join(__dirname, '../data/quotes.json');
const repsDir    = path.join(__dirname, '../data/reps');

if (!fs.existsSync(repsDir)) fs.mkdirSync(repsDir, { recursive: true });

const SEED_BIOGUIDES = [
  'G000596', 'C001127', 'T000278', 'T000481',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Build comment map from cache.json + quotes.json ----
const commentsByBioguide = {};

function addComment(id, comment) {
  if (!id) return;
  if (!commentsByBioguide[id]) commentsByBioguide[id] = [];
  if (!commentsByBioguide[id].some(c => c.text === comment.text))
    commentsByBioguide[id].push(comment);
}

try {
  const data  = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const bills = Array.isArray(data.bills) ? data.bills : Object.values(data.bills || {});
  bills.forEach(bill => {
    (bill.featured_quotes || []).forEach(q => {
      addComment(q.bioguideId, {
        billId: bill.id, billTitle: bill.title,
        stance: q.stance, text: q.text, date: bill.date || ''
      });
    });
  });
} catch (e) { console.warn('Could not read cache.json:', e.message); }

try {
  const quotes = JSON.parse(fs.readFileSync(quotesPath, 'utf8')).quotes || [];
  quotes.forEach(q => {
    addComment(q.bioguideId, {
      billId: q.billId || null, billTitle: q.billTitle || null,
      stance: q.stance || null, text: q.text,
      date: (q.source || '').replace(/^(House|Senate) Floor,?\s*/i, '')
    });
  });
} catch (e) {}

// ---- Fetch all member bioguideIds from Congress.gov ----
async function fetchAllMemberIds() {
  const ids = [];
  let offset = 0;
  console.log(`Fetching all ${CONGRESS_SESSION}th Congress members...`);
  while (true) {
    await sleep(600);
    const url = `https://api.congress.gov/v3/member/congress/${CONGRESS_SESSION}?limit=100&offset=${offset}&format=json&api_key=${CONGRESS_API_KEY}`;
    const res  = await fetch(url);
    if (!res.ok) { console.error('Member list fetch failed:', res.status); break; }
    const data    = await res.json();
    const members = data.members || [];
    members.forEach(m => { if (m.bioguideId) ids.push(m.bioguideId); });
    process.stdout.write(`  ${ids.length} members fetched...\r`);
    if (members.length < 100) break;
    offset += 100;
  }
  console.log(`\n  Total: ${ids.length} members`);
  return ids;
}

// ---- Fetch individual member bio ----
async function fetchMemberDetail(bioguideId) {
  await sleep(550);
  try {
    const res = await fetch(`https://api.congress.gov/v3/member/${bioguideId}?api_key=${CONGRESS_API_KEY}`);
    if (!res.ok) return null;
    const d      = await res.json();
    const member = d.member;
    if (!member) return null;
    const terms  = member.terms || [];
    const latest = terms[terms.length - 1] || {};
    const type   = latest.memberType === 'Senator' ? 'Senator' : 'Representative';
    const name   = member.directOrderName || member.invertedOrderName || '';
    const party  = member.partyHistory?.[member.partyHistory.length - 1]?.partyAbbreviation || 'I';
    const state  = latest.stateCode || member.state || '';
    const district = latest.district || null;
    const districtText = district ? ` for District ${district}` : '';
    return {
      bioguideId,
      name,
      party,
      state,
      role: type,
      district,
      bio:  `${name} is a ${type} representing ${state}${districtText}.`,
      comments: commentsByBioguide[bioguideId] || []
    };
  } catch (e) { return null; }
}

// ---- Merge with existing file (preserve comments) ----
function mergeWithExisting(fresh, filePath) {
  if (!fs.existsSync(filePath)) return fresh;
  try {
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // Merge comments: existing + any new ones not already present
    const merged = [...(existing.comments || [])];
    (fresh.comments || []).forEach(c => {
      if (!merged.some(e => e.text === c.text)) merged.push(c);
    });
    return { ...existing, ...fresh, comments: merged };
  } catch (e) { return fresh; }
}

// ---- Main ----
async function run() {
  let bioguideIds;

  if (ALL_MODE) {
    if (!CONGRESS_API_KEY) { console.error('CONGRESS_API_KEY required for --all mode'); process.exit(1); }
    bioguideIds = await fetchAllMemberIds();
    // Add seeds in case they're not in the member list
    SEED_BIOGUIDES.forEach(id => { if (!bioguideIds.includes(id)) bioguideIds.push(id); });
  } else {
    // Quote/cache mode: only reps we have data for
    const fromData = new Set([
      ...Object.keys(commentsByBioguide),
      ...SEED_BIOGUIDES
    ]);
    bioguideIds = [...fromData];
  }

  if (!bioguideIds.length) { console.log('No reps to process.'); return; }

  console.log(`\nBuilding profiles for ${bioguideIds.length} rep(s)...`);
  let written = 0, skipped = 0;

  for (const id of bioguideIds) {
    const filePath = path.join(repsDir, `${id}.json`);
    // In non-all mode, skip if file already exists and no new comments
    if (!ALL_MODE && fs.existsSync(filePath) && !commentsByBioguide[id]?.length) {
      skipped++;
      continue;
    }

    process.stdout.write(`  [${written + skipped + 1}/${bioguideIds.length}] ${id}...\r`);
    const detail = await fetchMemberDetail(id);
    if (!detail) {
      // Fallback: preserve existing file if fetch failed, or write minimal stub
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify({
          bioguideId: id, name: '', party: '', state: '',
          bio: 'Member of the United States Congress.',
          role: 'Member of Congress', comments: commentsByBioguide[id] || []
        }, null, 2));
      }
      skipped++;
      continue;
    }

    const final = mergeWithExisting(detail, filePath);
    fs.writeFileSync(filePath, JSON.stringify(final, null, 2));
    written++;
  }

  console.log(`\nDone. ${written} profiles written, ${skipped} skipped. Total in data/reps/: ${fs.readdirSync(repsDir).length}`);
}

run();
