// scripts/update_cache_hr7148.js
// Inserts the HR-7148 omnibus analysis into cache.json
const fs = require('fs');
const path = require('path');

const cachePath = path.join(__dirname, '../data/cache.json');
const draftPath = path.join(__dirname, '../data/hr7148_analysis_draft.json');

const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const newEntry = JSON.parse(fs.readFileSync(draftPath, 'utf8'));

const bills = cache.bills;
const idx = bills.findIndex(x => x.id === '119-HR-7148');
if (idx === -1) {
  console.log('ERROR: 119-HR-7148 not found in cache.bills');
  process.exit(1);
}

console.log('Found existing entry at index', idx);
console.log('Old hasDivisions:', !!bills[idx].divisions);

bills[idx] = newEntry;
console.log('New hasDivisions:', !!bills[idx].divisions, '| count:', bills[idx].divisions.length);
console.log('Division keys:', bills[idx].divisions.map(d => d.divisionKey).join(', '));

fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
console.log('cache.json updated. Total bills:', bills.length);
