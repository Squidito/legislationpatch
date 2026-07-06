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

// ---- Bill attribution pipeline ----
// For quotes with no billId, score each bill by keyword overlap and assign if confident.

const STOP_WORDS = new Set([
  // Common English
  'the','a','an','of','in','to','and','or','is','are','was','were','for','that','this',
  'with','from','has','have','be','will','by','on','at','as','not','but','its','it',
  'we','our','their','they','he','she','who','which','all','any','can','do','did','if',
  'so','no','up','out','more','been','had','than','when','what','how','also','each',
  'some','other','these','those','into','would','should','could','may','must','about',
  'after','before','between','through','during','over','under','same','both','such',
  'own','new','per','just','very','now','only','then','them','her','his','him','said',
  'get','got','one','two','three','four','five','six','seven','eight','nine','ten',
  // Generic political/legislative terms (appear everywhere, signal nothing)
  'american','america','national','federal','government','congress','congressional',
  'senate','house','senator','representative','member','members','legislation',
  'bill','bills','act','acts','law','laws','section','title','provides','provided',
  'united','states','people','public','policy','political','president','administration',
  'security','services','program','programs','funding','funds','fund','million','billion',
  'percent','under','year','years','fiscal','budget','appropriations','appropriation',
  'department','agency','agencies','office','committee','floor','statement','vote',
  'republican','republicans','democrat','democrats','bipartisan','majority','minority',
]);

function extractKeywords(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
}

function buildBillKeywords(bill) {
  const kw = new Map(); // term → max weight
  const add = (text, weight) => extractKeywords(text).forEach(w => {
    kw.set(w, Math.max(kw.get(w) || 0, weight));
  });
  add(bill.title, 4);
  add(bill.summary, 2);
  add(bill.brief, 2);
  (bill.top_lines || []).forEach(tl => {
    add(typeof tl === 'string' ? tl : tl.headline, 2);
    (tl.subs || []).forEach(s => add(s, 1));
  });
  (bill.sections || []).forEach(s => {
    add(s.label, 1);
    (s.items || []).forEach(item => add(item.main, 1));
  });
  return kw;
}

function attributeQuotesToBills(quotes, bills) {
  const billIndex = bills.map(b => ({ id: b.id, title: b.title, kw: buildBillKeywords(b) }));
  let count = 0;
  for (const q of quotes) {
    if (q.billId) continue;
    const words = new Set(extractKeywords(q.text));
    let best = null, bestScore = 0;
    for (const b of billIndex) {
      let score = 0;
      for (const [term, weight] of b.kw) { if (words.has(term)) score += weight; }
      if (score > bestScore) { bestScore = score; best = b; }
    }
    const matchCount = best ? [...best.kw.keys()].filter(k => words.has(k)).length : 0;
    if (bestScore >= 6 && matchCount >= 2 && best) {
      q.billId    = best.id;
      q.billTitle = best.title;
      count++;
      console.log(`  [attr] "${q.text.slice(0, 55)}..." → ${best.id} (score ${bestScore})`);
    }
  }
  return count;
}

// Run attribution on quotes.json before building comment map
try {
  const rawBills = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const bills    = Array.isArray(rawBills.bills) ? rawBills.bills : Object.values(rawBills.bills || {});
  const rawQuotes = JSON.parse(fs.readFileSync(quotesPath, 'utf8'));
  const attributed = attributeQuotesToBills(rawQuotes.quotes || [], bills);
  if (attributed > 0) {
    fs.writeFileSync(quotesPath, JSON.stringify(rawQuotes, null, 2));
    console.log(`Attribution: ${attributed} quote(s) matched to bills.\n`);
  }
} catch (e) { console.warn('Attribution skipped:', e.message); }

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
      source: q.source || null,
      granuleTitle: q.granuleTitle || null,
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

// ---- Wikipedia bio fetching ----
// Uses the REST summary API (no key required, NPOV-enforced intro paragraph).
// Verifies the result is about a politician before accepting it.

async function fetchWikipediaBio(name, role, stateCode) {
  const agent = { headers: { 'User-Agent': 'LegislationPatch/1.0 (contact@legislationpatch.com)' } };

  // Try direct title variants
  const roleWord = role === 'Senator' ? 'Senator' : 'Representative';
  const titles = [
    name,
    name + ' (politician)',
    name + ' (U.S. ' + roleWord + ')',
  ];

  for (const title of titles) {
    await sleep(250);
    try {
      const res = await fetch(
        'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title),
        agent
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data.type === 'disambiguation' || !data.extract) continue;
      const lower = data.extract.toLowerCase();
      const isPolitician = lower.includes('represent') || lower.includes('senator')
                        || lower.includes('congress') || lower.includes('politician');
      if (!isPolitician) continue;
      return { bio: data.extract.split('\n')[0].trim(), url: data.content_urls?.desktop?.page || '' };
    } catch (_) { continue; }
  }

  // Fallback: Wikipedia search
  await sleep(300);
  try {
    const q   = encodeURIComponent(name + ' ' + roleWord + ' ' + stateCode);
    const res = await fetch(
      'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + q + '&format=json&srlimit=3',
      agent
    );
    if (!res.ok) return null;
    const results = (await res.json()).query?.search || [];
    for (const r of results) {
      await sleep(200);
      try {
        const pr = await fetch(
          'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(r.title),
          agent
        );
        if (!pr.ok) continue;
        const pd = await pr.json();
        if (!pd.extract) continue;
        const lower = pd.extract.toLowerCase();
        if (!lower.includes('represent') && !lower.includes('senator') && !lower.includes('congress')) continue;
        return { bio: pd.extract.split('\n')[0].trim(), url: pd.content_urls?.desktop?.page || '' };
      } catch (_) { continue; }
    }
  } catch (_) {}

  return null;
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
    const wikiBio = await fetchWikipediaBio(name, type, state);
    return {
      bioguideId,
      name,
      party,
      state,
      role: type,
      district,
      bio:       wikiBio ? wikiBio.bio : `${name} is a ${type} representing ${state}${districtText}.`,
      bioSource: wikiBio ? 'wikipedia' : 'stub',
      bioUrl:    wikiBio ? wikiBio.url : '',
      comments:  commentsByBioguide[bioguideId] || []
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
    // Preserve a good bio — never overwrite a Wikipedia bio with the stub fallback
    const keepExistingBio = existing.bioSource === 'wikipedia' && fresh.bioSource !== 'wikipedia';
    return {
      ...existing,
      ...fresh,
      bio:       keepExistingBio ? existing.bio : fresh.bio,
      bioSource: keepExistingBio ? 'wikipedia'  : fresh.bioSource,
      comments:  merged,
    };
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
    // SECURITY: bioguide IDs are always alphanumeric (e.g. "C001098"). These ids can
    // arrive from CLI args, comment data, or the members index, so validate before
    // interpolating into a path — a "../"-style id would otherwise write outside repsDir.
    if (typeof id !== 'string' || !/^[A-Za-z0-9]+$/.test(id)) {
      console.warn(`  ! skipping invalid bioguide id: ${JSON.stringify(id)}`);
      skipped++;
      continue;
    }
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
  rebuildIndex();
}

function rebuildIndex() {
  const index = {};
  fs.readdirSync(repsDir).forEach(f => {
    if (!f.endsWith('.json')) return;
    try {
      const r = JSON.parse(fs.readFileSync(path.join(repsDir, f), 'utf8'));
      if (!r.state || !r.bioguideId || !r.name) return;
      if (!index[r.state]) index[r.state] = [];
      index[r.state].push({ bioguideId: r.bioguideId, name: r.name, party: r.party || 'I', state: r.state, role: r.role || 'Member of Congress', district: r.district || null });
    } catch (e) {}
  });
  Object.keys(index).forEach(st => {
    index[st].sort((a, b) => {
      if (a.role === 'Senator' && b.role !== 'Senator') return -1;
      if (b.role === 'Senator' && a.role !== 'Senator') return 1;
      return a.name.split(' ').pop().localeCompare(b.name.split(' ').pop());
    });
  });
  const indexPath = path.join(__dirname, '../data/reps-index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index));
  console.log(`Rebuilt reps-index.json — ${Object.values(index).flat().length} reps across ${Object.keys(index).length} states`);
}

run();
