// fetch_wiki_bios.js — Populate Wikipedia bios for all existing rep JSON files.
// Skips reps that already have bioSource: 'wikipedia'.
// Usage: node scripts/fetch_wiki_bios.js

const fs   = require('fs');
const path = require('path');

const REPS_DIR = path.join(__dirname, '../data/reps');
const sleep    = ms => new Promise(r => setTimeout(r, ms));
const AGENT    = { headers: { 'User-Agent': 'LegislationPatch/1.0 (contact@legislationpatch.com)' } };

async function fetchWikipediaBio(name, role, stateCode) {
  const roleWord = role === 'Senator' ? 'Senator' : 'Representative';
  const titles   = [
    name,
    name + ' (politician)',
    name + ' (U.S. ' + roleWord + ')',
  ];

  for (const title of titles) {
    await sleep(220);
    try {
      const res = await fetch(
        'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title),
        AGENT
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data.type === 'disambiguation' || !data.extract) continue;
      const lower = data.extract.toLowerCase();
      const ok    = lower.includes('represent') || lower.includes('senator')
                 || lower.includes('congress')  || lower.includes('politician');
      if (!ok) continue;
      return { bio: data.extract.split('\n')[0].trim(), url: data.content_urls?.desktop?.page || '' };
    } catch (_) { continue; }
  }

  // Fallback: Wikipedia search
  await sleep(300);
  try {
    const q   = encodeURIComponent(name + ' ' + roleWord + ' ' + stateCode);
    const res = await fetch(
      'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + q + '&format=json&srlimit=3',
      AGENT
    );
    if (!res.ok) return null;
    const results = (await res.json()).query?.search || [];
    for (const r of results) {
      await sleep(200);
      try {
        const pr = await fetch(
          'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(r.title),
          AGENT
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

async function main() {
  const files = fs.readdirSync(REPS_DIR).filter(f => f.endsWith('.json'));
  console.log('=== WIKIPEDIA BIO FETCH: ' + files.length + ' rep files ===\n');

  let updated = 0, alreadyHad = 0, failed = 0;

  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(REPS_DIR, files[i]);
    let rep;
    try { rep = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (_) { failed++; continue; }

    if (rep.bioSource === 'wikipedia' && rep.bioUrl) { alreadyHad++; continue; }
    if (!rep.name || !rep.role)        { failed++;     continue; }

    process.stdout.write('[' + (i + 1) + '/' + files.length + '] ' + rep.name + ' ... ');

    const bio = await fetchWikipediaBio(rep.name, rep.role, rep.state || '');

    if (bio) {
      rep.bio       = bio.bio;
      rep.bioSource = 'wikipedia';
      rep.bioUrl    = bio.url || '';
      fs.writeFileSync(filePath, JSON.stringify(rep, null, 2));
      updated++;
      console.log('OK');
    } else {
      failed++;
      console.log('not found');
    }
  }

  console.log('\n=== DONE ===');
  console.log('Updated:     ' + updated);
  console.log('Already had: ' + alreadyHad);
  console.log('Not found:   ' + failed);
}

main().catch(console.error);
