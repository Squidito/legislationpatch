'use strict';
const fs    = require('fs');
const path  = require('path');
const cache = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cache.json'), 'utf8'));

const bill = cache.bills.find(b => b.id === '119-HR-7148');

const UNITS = { T:1e12, B:1e9, M:1e6, K:1e3 };
function parseDollar(num, unit) {
  const n = parseFloat(num.replace(/,/g,''));
  // Fix: "B" → 1e9, "MB" → 1e6, "TB" → 1e12, "M" → 1e6, etc.
  const u = (unit||'').toUpperCase().replace(/^([TBMK])B?$/, '$1');
  return n * (UNITS[u] || 1);
}
function fmt(n) {
  return n >= 1e9 ? (n/1e9).toFixed(2)+'B' : (n/1e6).toFixed(1)+'M';
}

// Regex that captures "$X.XX B/M/etc"
const RE_AMT = /\$([0-9,.]+)\s*([TBMK]B?)/g;

function hasBigAmount(text) {
  let m; RE_AMT.lastIndex = 0;
  while ((m = RE_AMT.exec(text)) !== null) {
    if (parseDollar(m[1], m[2]) >= 1e8) return true;
  }
  return false;
}

const sources = [
  ...(bill.changes.modified||[]).map(t=>({t,s:'top.modified'})),
  ...(bill.changes.added||[]).map(t=>({t,s:'top.added'})),
  ...(bill.divisions||[]).flatMap(d=>[
    ...(d.changes.modified||[]).map(t=>({t,s:d.label.slice(0,30)+' [mod]'})),
    ...(d.changes.added||[]).map(t=>({t,s:d.label.slice(0,30)+' [add]'})),
  ])
];

const big = sources.filter(s => hasBigAmount(s.t));
console.log(`\n${big.length} source strings with amounts >= $100M:\n`);
big.forEach(({t, s}) => {
  // Show each amount found
  const amts = [];
  let m; RE_AMT.lastIndex = 0;
  while ((m = RE_AMT.exec(t)) !== null) {
    const n = parseDollar(m[1], m[2]);
    if (n >= 1e8) amts.push(fmt(n));
  }
  console.log(`[${s}]`);
  console.log(`  Amounts: ${amts.join(', ')}`);
  console.log(`  Text:    ${t.slice(0,100)}`);
  console.log();
});
