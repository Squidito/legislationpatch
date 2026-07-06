'use strict';
require('dotenv').config();
const https = require('https');
const KEY   = process.env.GOVINFO_API_KEY; // was a hardcoded literal — rotated + moved to .env 2026-07-06

function get(url) {
  return new Promise((res, rej) => {
    https.get(url + (url.includes('?') ? '&' : '?') + 'api_key=' + KEY,
      { headers: { 'User-Agent': 'LegislationPatch/1.0' } }, r => {
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
      }).on('error', rej);
  });
}

const RE_BIG_AMT = /\$([\d,]{4,})/g;

function findAmountsNear(plain, pattern, windowChars = 800) {
  const re      = new RegExp(pattern, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(plain)) !== null) {
    const ctx  = plain.slice(Math.max(0, m.index - 150), m.index + windowChars);
    const amts = [];
    let am;
    RE_BIG_AMT.lastIndex = 0;
    while ((am = RE_BIG_AMT.exec(ctx)) !== null) {
      const n = parseFloat(am[1].replace(/,/g, ''));
      if (n >= 1e7) amts.push(n); // include amounts >= $10M
    }
    if (amts.length) results.push({ match: m[0].slice(0, 60), context: ctx.slice(0, 300), amounts: amts });
  }
  return results;
}

function fmt(n) {
  return n >= 1e9 ? (n/1e9).toFixed(3)+'B' : (n/1e6).toFixed(0)+'M';
}

const SEARCHES = [
  { label: 'PEPFAR / Global Health Programs (State)',  pattern: 'Global Health Programs' },
  { label: 'Amtrak National Network',                  pattern: 'national network.*?amtrak|amtrak.*?national network|national railroad passenger corporation' },
  { label: 'IRS Taxpayer Services',                    pattern: 'taxpayer services' },
  { label: 'IRS Enforcement',                          pattern: 'enforcement.*?internal revenue|internal revenue.*?enforcement' },
  { label: 'IRS Operations Support',                   pattern: 'operations support.*?internal revenue|internal revenue.*?operations support' },
  { label: 'Special Diabetes Programs',                pattern: 'special diabetes program' },
  { label: 'Counter-ISIS Train and Equip',             pattern: 'counter-i(?:SIS|SIL) train and equip' },
];

async function searchBill(packageId) {
  console.log(`\nFetching ${packageId}...`);
  const raw   = await get(`https://api.govinfo.gov/packages/${packageId}/htm`);
  const plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log('Size:', (plain.length / 1024).toFixed(0), 'KB');
  return plain;
}

async function main() {
  // FY2024 was split across two bills:
  // HR-4366 = Consolidated Appropriations Act, 2024 (Div A-F: Defense, Labor/HHS, Energy, FinServ, Homeland, Interior)
  // HR-2882 = Further Consolidated Appropriations Act, 2024 (Div A-G: Agriculture, Commerce, State, Transport, etc.)

  const bills = [
    { id: 'BILLS-118hr2882enr', label: 'Further Consol. Approp. 2024 (HR-2882)' },
    { id: 'BILLS-118hr4366enr', label: 'Consol. Approp. 2024 (HR-4366)'         },
  ];

  const plains = {};
  for (const { id, label } of bills) {
    try { plains[id] = await searchBill(id); }
    catch(e) { console.log(`  Failed: ${e.message}`); plains[id] = ''; }
  }

  for (const { label, pattern } of SEARCHES) {
    console.log(`\n${'─'.repeat(60)}\n${label}`);
    let found = false;
    for (const { id } of bills) {
      const hits = findAmountsNear(plains[id] || '', pattern);
      if (!hits.length) continue;
      found = true;
      hits.slice(0, 1).forEach(h => {
        // Best amount: largest below $50B (ignore guarantee ceilings)
        const best = h.amounts.filter(n => n < 50e9).sort((a,b)=>b-a)[0];
        console.log(`  [${id}] ${label}: ${best ? fmt(best) : 'no amount'}`);
        console.log(`  context: ...${h.context.slice(0, 200)}...`);
      });
      break;
    }
    if (!found) console.log('  NOT FOUND in either bill');
  }
}

main().catch(console.error);
