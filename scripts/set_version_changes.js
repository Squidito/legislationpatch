// set_version_changes.js
//
// Stores the Version "What changed" diff on a bill as patch-notes lists covering
// the bill's lifespan (Introduced -> latest text):
//   bill.versionChanges = { added:[], modified:[], removed:[],
//                           throughVersion:{type,date}, unchanged?, generatedAt }
//
// `throughVersion` records the latest version the diff was generated against, so
// a later pipeline check can detect when a NEWER version exists (-> re-diff).
//
//   node scripts/set_version_changes.js --bill=119-S-222 --file=changes.json
//   node scripts/set_version_changes.js --bill=119-HR-22 --none   (checked, no substantive change)

const fs   = require('fs');
const path = require('path');

const ONE  = (process.argv.find(a => a.startsWith('--bill=')) || '').split('=')[1];
const FILE = (process.argv.find(a => a.startsWith('--file=')) || '').split('=')[1];
const NONE = process.argv.includes('--none');
const DATE = (process.argv.find(a => a.startsWith('--date=')) || '').split('=')[1] || null;
const CACHE = path.join(__dirname, '../data/cache.json');

function rank(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('enrolled')) return 9;
  if (t.includes('engrossed amendment')) return 7;
  if (t.includes('engrossed') || t.includes('considered and passed')) return 6;
  if (t.includes('reported')) return 4;
  if (t.includes('introduced')) return 1;
  return 3;
}

if (!ONE || (!FILE && !NONE)) { console.error('usage: --bill=ID (--file=changes.json | --none)'); process.exit(1); }

const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
const bill = cache.bills.find(b => b.id === ONE);
if (!bill) { console.error('bill not found: ' + ONE); process.exit(1); }

// latest text-bearing version (skip Public Law: same text as Enrolled)
const latest = (bill.versions || [])
  .filter(v => !/public law/i.test(v.type))
  .slice().sort((a, b) => rank(b.type) - rank(a.type))[0] || null;
const throughVersion = latest ? { type: latest.type, date: latest.date } : null;

let added = [], modified = [], removed = [];
if (FILE) {
  const vc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  added = vc.added || []; modified = vc.modified || []; removed = vc.removed || [];
  if (!added.length && !modified.length && !removed.length) {
    console.error('all lists empty — use --none to mark "checked, no change"'); process.exit(1);
  }
}

bill.versionChanges = NONE
  ? { added: [], modified: [], removed: [], unchanged: true, throughVersion, generatedAt: DATE }
  : { added, modified, removed, throughVersion, generatedAt: DATE };
delete bill.versionSummary;  // prose approach dropped
cache.generated = new Date().toISOString();
fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
console.log(NONE
  ? `✅ ${ONE}: marked no-substantive-change (through ${throughVersion?.type})`
  : `✅ ${ONE}: versionChanges set — +${added.length} ~${modified.length} −${removed.length} (through ${throughVersion?.type})`);
