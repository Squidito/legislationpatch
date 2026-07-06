// fetch_vote_data.js — roll call / voice vote fetcher for cached bills.
//
// Usage:
//   node scripts/fetch_vote_data.js                       all cached bills
//   node scripts/fetch_vote_data.js --bill 119-HR-227     one bill
//   node scripts/fetch_vote_data.js --bill <id> --apply-stage
//
// Besides votes, this checks stage consistency against the fetched actions
// (confident cases only: "Became Public Law" → signed; failed latest floor
// action → dead). Mismatches warn loudly; --apply-stage corrects the
// stage/stageLabel/currentStep fields. likelihood/likelihoodReason prose is
// never auto-edited — re-review it after any stage correction.
// Voice/UC passages are deduplicated (the same action arrives via both the
// chamber source system and the Library of Congress mirror).

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const { PASSAGE_CONTEXT } = require("./lib/patterns.js");

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const CACHE_FILE   = path.join(__dirname, '../data/cache.json');
const VOTES_DIR    = path.join(__dirname, '../data/votes');
const REPS_DIR     = path.join(__dirname, '../data/reps');
const REPS_INDEX   = path.join(__dirname, '../data/reps-index.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Build lastName+state → bioguideId lookup for senators (Senate XML has no bio_id field)
function buildSenatorLookup() {
  try {
    const index = JSON.parse(fs.readFileSync(REPS_INDEX, 'utf8'));
    const lookup = {};
    for (const reps of Object.values(index)) {
      for (const rep of reps) {
        if (rep.role === 'Senator') {
          const lastName = rep.name.split(',')[0].split(' ').pop().toLowerCase().replace(/[^a-z]/g, '');
          lookup[lastName + '-' + rep.state] = rep.bioguideId;
        }
      }
    }
    return lookup;
  } catch (_) { return {}; }
}
const SENATOR_LOOKUP = buildSenatorLookup();

// ---- Cache I/O ----

function loadCache() {
  return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
}

function saveCache(data) {
  data.generated = new Date().toISOString();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

// ---- Congress.gov actions ----

async function fetchBillActions(congress, type, number) {
  const url = 'https://api.congress.gov/v3/bill/' + congress + '/' + type.toLowerCase() + '/' + number
            + '/actions?format=json&limit=250&api_key=' + CONGRESS_API_KEY;
  await sleep(2000);
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    return (await res.json()).actions || [];
  } catch (e) {
    console.error('   - Failed to fetch actions:', e.message);
    return [];
  }
}

// ---- XML fetching ----

async function fetchXML(url) {
  await sleep(800);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'LegislationPatch/1.0' } });
    if (!res.ok) {
      console.log('   - XML ' + res.status + ': ' + url);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.error('   - XML fetch error:', e.message);
    return null;
  }
}

// ---- House XML parser ----
// clerk.house.gov/evs/{year}/roll{N}.xml

function parseHouseXML(xml) {
  // Totals live inside <totals-by-vote> which appears after the per-party rows
  const totalsBlock = (xml.match(/<totals-by-vote>([\s\S]*?)<\/totals-by-vote>/i) || [])[1] || xml;
  const yeas      = parseInt((totalsBlock.match(/<yea-total>(\d+)<\/yea-total>/i)         || [])[1] || '0');
  const nays      = parseInt((totalsBlock.match(/<nay-total>(\d+)<\/nay-total>/i)         || [])[1] || '0');
  const present   = parseInt((totalsBlock.match(/<present-total>(\d+)<\/present-total>/i) || [])[1] || '0');
  const notVoting = parseInt((totalsBlock.match(/<not-voting-total>(\d+)<\/not-voting-total>/i)||[])[1]||'0');
  const result    = ((xml.match(/<vote-result>([\s\S]*?)<\/vote-result>/i)    || [])[1] || '').trim();
  const question  = ((xml.match(/<vote-question>([\s\S]*?)<\/vote-question>/i)|| [])[1] || '').trim();

  const members = [];
  const blocks  = xml.match(/<recorded-vote>[\s\S]*?<\/recorded-vote>/gi) || [];
  for (const block of blocks) {
    // <legislator name-id="A000374" sort-field="..." unaccented-name="..." party="R" state="LA" role="Member">Name</legislator>
    const leg  = block.match(/<legislator\s[^>]*name-id="([^"]*)"[^>]*party="([^"]*)"[^>]*state="([^"]*)"[^>]*>([^<]*)<\/legislator>/i);
    const vote = block.match(/<vote>([^<]+)<\/vote>/i);
    if (leg && vote) {
      members.push({
        bioguideId: leg[1].trim(),
        name:       leg[4].trim(),
        party:      leg[2].trim(),
        state:      leg[3].trim(),
        vote:       vote[1].trim(),
      });
    }
  }

  return { yeas, nays, present, notVoting, result, question, members };
}

// ---- Senate XML parser ----
// senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{roll5d}.xml

function parseSenateXML(xml) {
  const yeas      = parseInt((xml.match(/<yeas>(\d+)<\/yeas>/i)     || [])[1] || '0');
  const nays      = parseInt((xml.match(/<nays>(\d+)<\/nays>/i)     || [])[1] || '0');
  const present   = parseInt((xml.match(/<present>(\d+)<\/present>/i)|| [])[1] || '0');
  const notVoting = parseInt((xml.match(/<absent>(\d+)<\/absent>/i) || [])[1] || '0');
  const result    = ((xml.match(/<vote_result>([\s\S]*?)<\/vote_result>/i)          || [])[1] || '').trim();
  const question  = ((xml.match(/<vote_question_text>([\s\S]*?)<\/vote_question_text>/i)|| [])[1] || '').trim();

  const members = [];
  const blocks  = xml.match(/<member>[\s\S]*?<\/member>/gi) || [];
  for (const block of blocks) {
    let bioguideId = ((block.match(/<bio_id>([\s\S]*?)<\/bio_id>/i)           || [])[1] || '').trim();
    const lastName  = ((block.match(/<last_name>([\s\S]*?)<\/last_name>/i)    || [])[1] || '').trim();
    const firstName = ((block.match(/<first_name>([\s\S]*?)<\/first_name>/i)  || [])[1] || '').trim();
    const party     = ((block.match(/<party>([\s\S]*?)<\/party>/i)            || [])[1] || '').trim();
    const state     = ((block.match(/<state>([\s\S]*?)<\/state>/i)            || [])[1] || '').trim();
    const vote      = ((block.match(/<vote_cast>([\s\S]*?)<\/vote_cast>/i)    || [])[1] || '').trim();
    // Senate XML often omits bio_id — fall back to lastName+state lookup
    if (!bioguideId && lastName && state) {
      const key = lastName.toLowerCase().replace(/[^a-z]/g, '') + '-' + state;
      bioguideId = SENATOR_LOOKUP[key] || '';
    }
    if (vote) {
      members.push({
        bioguideId,
        name:  lastName + (firstName ? ', ' + firstName : ''),
        party,
        state,
        vote,
      });
    }
  }

  return { yeas, nays, present, notVoting, result, question, members };
}

// ---- Crossover detection ----
// Only runs on close votes (margin <= 30% of total). Returns members who voted
// against their party's majority.

function detectCrossovers(members, yeas, nays) {
  const total  = yeas + nays;
  if (total === 0) return [];
  if (Math.abs(yeas - nays) / total > 0.30) return [];

  // Tally each party's vote direction
  const counts = {};
  for (const m of members) {
    const p = m.party || 'I';
    if (!counts[p]) counts[p] = { Yea: 0, Nay: 0 };
    const v = (m.vote || '').toLowerCase();
    if (v === 'yea' || v === 'aye' || v === 'yes') counts[p].Yea++;
    else if (v === 'nay' || v === 'no')            counts[p].Nay++;
  }

  const partyMajority = {};
  for (const [p, c] of Object.entries(counts)) {
    partyMajority[p] = c.Yea >= c.Nay ? 'Yea' : 'Nay';
  }

  const crossovers = [];
  for (const m of members) {
    const majority = partyMajority[m.party || 'I'];
    if (!majority) continue;
    const v = (m.vote || '').toLowerCase();
    const memberVote = (v === 'yea' || v === 'aye' || v === 'yes') ? 'Yea'
                     : (v === 'nay' || v === 'no')                 ? 'Nay'
                     : null;
    if (memberVote && memberVote !== majority) {
      crossovers.push({
        bioguideId: m.bioguideId,
        name:       m.name,
        party:      m.party,
        state:      m.state,
        vote:       memberVote,
      });
    }
  }
  return crossovers;
}

// ---- Stage derivation from actions (confident cases only) ----

const APPLY_STAGE = process.argv.includes('--apply-stage');
const PASSAGE_CTX = PASSAGE_CONTEXT; // shared — scripts/lib/patterns.js (was a third drifting copy)

function deriveStageSignal(actions) {
  if (actions.some(a => /became public law/i.test(a.text || ''))) return { stage: 'signed' };
  // latest floor passage-type action, by date
  let latest = null;
  for (const a of actions) {
    const t = a.text || '';
    if (!PASSAGE_CTX.test(t)) continue;
    const failed = /\bfailed\b/i.test(t);
    const passed = !failed && /\b(passed|agreed to)\b/i.test(t);
    if (!failed && !passed) continue;
    if (!latest || String(a.actionDate || '') > String(latest.date)) {
      latest = { date: a.actionDate || '', failed, text: t, chamber: a.chamber || (/senate/i.test(t) ? 'Senate' : 'House') };
    }
  }
  if (latest && latest.failed) return { stage: 'dead', chamber: latest.chamber, date: latest.date, text: latest.text };
  return null; // no confident signal — leave stage alone
}

function checkStageConsistency(bill, actions, cacheData) {
  const signal = deriveStageSignal(actions);
  if (!signal || bill.stage === signal.stage) return;
  // 'vetoed' is its own terminal stage — never overwrite it with 'dead'
  if (bill.stage === 'vetoed') return;
  const desc = signal.stage === 'signed'
    ? 'actions show "Became Public Law"'
    : `latest floor action FAILED (${signal.chamber} ${signal.date}: "${(signal.text || '').slice(0, 70)}")`;
  console.warn(`  ⚠️  STAGE MISMATCH ${bill.id}: cache says "${bill.stageLabel || bill.stage}" but ${desc}`);
  if (!APPLY_STAGE) {
    console.warn('      Re-run with --apply-stage to correct the stage fields, then re-review likelihood/prose.');
    return;
  }
  const idx = cacheData.bills.findIndex(b => b.id === bill.id);
  if (idx < 0) return;
  const target = cacheData.bills[idx];
  if (signal.stage === 'signed') {
    target.stage = 'signed'; target.stageLabel = 'Signed into Law'; target.currentStep = 4;
  } else {
    target.stage = 'dead';
    target.stageLabel = signal.chamber === 'Senate' ? 'Failed in Senate' : 'Failed in House';
    target.currentStep = 1;
  }
  console.warn(`      → stage corrected to "${target.stageLabel}". likelihood/likelihoodReason still need a human re-review.`);
}

// ---- Process votes for one bill ----

async function processVotesForBill(bill, cacheData) {
  const billId = bill.id;
  const parts  = billId.split('-');
  if (parts.length !== 3) return;

  const congress = parseInt(parts[0], 10);
  const type     = parts[1];
  const number   = parts[2];

  console.log('\n  Fetching votes: ' + billId);

  const actions = await fetchBillActions(congress, type, number);

  // ---- Stage consistency (the HCONRES-40 drift class) ----
  // Stage prose is written at analysis time; actions are fetched now and the two
  // silently drift apart. Detect the CONFIDENT cases only — enacted, or failed on
  // the floor with no later passage — warn loudly on mismatch, and correct the
  // stage fields when run with --apply-stage. Ambiguous cases are left alone;
  // validate-batch's stage checks are the backstop.
  checkStageConsistency(bill, actions, cacheData);

  // ---- Voice vote / unanimous consent (no per-member tally) ----
  // Congress.gov returns recordedVotes (plural array), not recordedVote
  const recordedActions = actions.filter(a => Array.isArray(a.recordedVotes) && a.recordedVotes.length > 0);

  if (recordedActions.length === 0) {
    const voiceActions = actions.filter(a => {
      const t = (a.text || '').toLowerCase();
      return (t.includes('passed') || t.includes('agreed to'))
          && (t.includes('voice vote') || t.includes('unanimous consent') || t.includes('without objection'));
    });
    if (voiceActions.length > 0) {
      // Dedupe identical voice/UC passages — the same action appears under both
      // the chamber source system and the Library of Congress mirror (no roll
      // number to dedupe on, unlike recorded votes below)
      const seenVoice = new Set();
      const summaries = voiceActions.map(a => {
        const t = (a.text || '').toLowerCase();
        return {
          chamber:  a.chamber || (t.includes('senate') ? 'Senate' : 'House'),
          date:     a.actionDate || '',
          question: 'On Passage',
          result:   'Passed',
          method:   t.includes('unanimous consent') ? 'Unanimous Consent' : 'Voice Vote',
        };
      }).filter(s => {
        const k = JSON.stringify(s);
        if (seenVoice.has(k)) return false;
        seenVoice.add(k);
        return true;
      });
      const idx = cacheData.bills.findIndex(b => b.id === billId);
      if (idx >= 0) cacheData.bills[idx].votes = summaries;
      if (!fs.existsSync(VOTES_DIR)) fs.mkdirSync(VOTES_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(VOTES_DIR, billId + '.json'),
        JSON.stringify({ billId, title: bill.title, votes: summaries }, null, 2)
      );
      console.log('  - ' + summaries.length + ' voice/UC passage(s) — no member tally');
    } else {
      console.log('  - No vote records found');
    }
    return;
  }

  // ---- Recorded roll call votes ----
  const fullVotes     = [];
  const voteSummaries = [];

  // Deduplicate by roll number — the same vote often appears under both
  // the House/Senate source system action AND the Library of Congress mirror action
  const seenRolls = new Set();

  for (const action of recordedActions) {
    for (const rv of action.recordedVotes) {
      const rollKey = (rv.chamber || 'House') + '-' + rv.rollNumber + '-' + rv.sessionNumber;
      if (seenRolls.has(rollKey)) continue;
      seenRolls.add(rollKey);

      const chamber = (rv.chamber || action.chamber || 'House').trim();
      console.log('  - ' + chamber + ' roll ' + rv.rollNumber + ' (session ' + rv.sessionNumber + ')...');

      // Build XML URL — House provides it directly; construct Senate URL from roll number
      let xmlUrl = rv.url || '';
      if (!xmlUrl && chamber === 'Senate') {
        const sess = rv.sessionNumber || 1;
        const roll = String(rv.rollNumber).padStart(5, '0');
        xmlUrl = 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote'
               + (rv.congress || congress) + sess
               + '/vote_' + (rv.congress || congress) + '_' + sess + '_' + roll + '.xml';
      }
      if (!xmlUrl) { console.log('  - No XML URL, skipping'); continue; }

      const xml = await fetchXML(xmlUrl);
      if (!xml) continue;

      const parsed     = chamber === 'Senate' ? parseSenateXML(xml) : parseHouseXML(xml);
      const crossovers = detectCrossovers(parsed.members, parsed.yeas, parsed.nays);

      const voteEntry = {
        chamber,
        date:      action.actionDate || '',
        question:  parsed.question || rv.fullActionName || 'On Passage',
        result:    parsed.result || '',
        yeas:      parsed.yeas,
        nays:      parsed.nays,
        present:   parsed.present  || 0,
        notVoting: parsed.notVoting || 0,
        crossovers,
        members:   parsed.members,
      };

      fullVotes.push(voteEntry);
      voteSummaries.push({
        chamber:        voteEntry.chamber,
        date:           voteEntry.date,
        question:       voteEntry.question,
        result:         voteEntry.result,
        yeas:           voteEntry.yeas,
        nays:           voteEntry.nays,
        present:        voteEntry.present,
        notVoting:      voteEntry.notVoting,
        crossoverCount: crossovers.length,
      });

      console.log('  - ' + chamber + ': ' + voteEntry.result + ' '
        + voteEntry.yeas + '-' + voteEntry.nays
        + ', ' + crossovers.length + ' crossover(s)'
        + ', ' + parsed.members.length + ' members');
    }
  }

  if (fullVotes.length === 0) return;

  // Save data/votes/{billId}.json
  if (!fs.existsSync(VOTES_DIR)) fs.mkdirSync(VOTES_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(VOTES_DIR, billId + '.json'),
    JSON.stringify({ billId, title: bill.title, votes: fullVotes }, null, 2)
  );
  console.log('  - Saved data/votes/' + billId + '.json');

  // Patch cache.json bill with aggregate summary (no member arrays)
  const billIdx = cacheData.bills.findIndex(b => b.id === billId);
  if (billIdx >= 0) cacheData.bills[billIdx].votes = voteSummaries;

  // Update rep voteHistory
  let repUpdates = 0;
  for (const vote of fullVotes) {
    for (const member of vote.members) {
      if (!member.bioguideId) continue;
      const repFile = path.join(REPS_DIR, member.bioguideId + '.json');
      if (!fs.existsSync(repFile)) continue;
      try {
        const rep = JSON.parse(fs.readFileSync(repFile, 'utf8'));
        if (!Array.isArray(rep.voteHistory)) rep.voteHistory = [];
        const alreadyHas = rep.voteHistory.some(v => v.billId === billId && v.chamber === vote.chamber);
        if (!alreadyHas) {
          rep.voteHistory.unshift({
            billId,
            billTitle: bill.title,
            chamber:   vote.chamber,
            date:      vote.date,
            vote:      member.vote,
          });
          rep.voteHistory.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          fs.writeFileSync(repFile, JSON.stringify(rep, null, 2));
          repUpdates++;
        }
      } catch (_) { /* skip reps with corrupt JSON */ }
    }
  }
  console.log('  - Updated ' + repUpdates + ' rep vote histories');
}

// ---- Entry point ----

async function main() {
  if (!CONGRESS_API_KEY) {
    console.error('ERROR: Missing CONGRESS_API_KEY in .env');
    process.exit(1);
  }

  if (!fs.existsSync(VOTES_DIR)) fs.mkdirSync(VOTES_DIR, { recursive: true });

  const cacheData = loadCache();

  // Support --bill 119-HR-227 or --bill=119-HR-227
  const billFlag = process.argv.find(a => a.startsWith('--bill='))?.split('=')[1]
                || (process.argv.includes('--bill')
                    ? process.argv[process.argv.indexOf('--bill') + 1]
                    : null);

  const bills = billFlag
    ? cacheData.bills.filter(b => b.id === billFlag)
    : cacheData.bills;

  if (bills.length === 0) {
    console.log(billFlag ? 'Bill ' + billFlag + ' not found in cache.json' : 'No bills in cache.');
    return;
  }

  console.log('=== VOTE DATA FETCH: ' + bills.length + ' bill(s) ===');

  for (const bill of bills) {
    try {
      await processVotesForBill(bill, cacheData);
    } catch (e) {
      console.error('  Error on ' + bill.id + ':', e.message);
    }
  }

  saveCache(cacheData);
  console.log('\n=== DONE. cache.json updated. ===');
}

if (require.main === module) {
  main();
}

module.exports = { processVotesForBill };
