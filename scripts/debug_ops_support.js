'use strict';
const https = require('https');
const KEY   = 'GOVINFO_API_KEY_REMOVED';
function get(url) {
  return new Promise((res,rej) => {
    https.get(url+'?api_key='+KEY,{headers:{'User-Agent':'LP/1.0'}},r=>{
      const c=[];r.on('data',d=>c.push(d));r.on('end',()=>res(Buffer.concat(c).toString('utf8')));
    }).on('error',rej);
  });
}
async function main() {
  const raw   = await get('https://api.govinfo.gov/packages/BILLS-118hr2882enr/htm');
  const plain = raw.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

  // Offset 203376 is where "operations support For necessary" starts
  // Look 3000 chars forward for the dollar amount
  const start = 203376;
  const ctx = plain.slice(start, start + 3000);

  const amts = [...ctx.matchAll(/\$([\d,]{4,})/g)].map(a => {
    const n = parseFloat(a[1].replace(/,/g,''));
    return { val: n, fmt: n >= 1e9 ? (n/1e9).toFixed(3)+'B' : (n/1e6).toFixed(0)+'M', pos: a.index };
  }).filter(a => a.val >= 1e8);

  console.log('Amounts >= $100M within 3000 chars of heading:');
  amts.forEach(a => console.log(`  pos+${a.pos}: ${a.fmt}`));

  // Show snippet around first big amount
  if (amts.length) {
    const pos = amts[0].pos;
    console.log('\nContext around first big amount:');
    console.log(ctx.slice(Math.max(0, pos-100), pos+200));
  }
}
main().catch(console.error);
