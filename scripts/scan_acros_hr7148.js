// Scans 119-HR-7148 cache entry for untagged acronyms
const fs = require('fs');

const cache = JSON.parse(fs.readFileSync('./data/cache.json', 'utf8'));
const entry = cache.bills.find(x => x.id === '119-HR-7148');

const KNOWN = new Set([
  'ACA','CBO','CBP','CDC','CFPB','CHIP','CIA','CISA','CR','CRS','DACA','DHS','DOD','DOE',
  'DOGE','DOJ','DOT','EPA','FBI','FCC','FDA','FEMA','FISA','FTC','FY','GAO','GDP','GSA',
  'HHS','HUD','ICE','IMF','IRS','NATO','NDAA','NIH','NSA','OMB','OPM','SBA','SEC','SNAP',
  'SSA','TPS','TSA','USCIS','USDA','WTO'
]);

// Single letters, Roman numerals, state codes, common non-acronyms, contextual caps
const SKIP = new Set([
  ...['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'],
  ...['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'],
  ...['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA',
      'ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
      'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','GU','PR','DC'],
  // Contextual all-caps words that aren't acronyms
  'US','UK','EU','UN','DIV','AP','FF','CVN','DDG','PBM','PBMs','DME','APM',
  'ISIS','NATO','TRICARE','MEPA','PAYGO','PEPFAR','AGOA','HELP','SEED','ROTC',
  'OTC','GME','ACES','NHSC','OPTN','PREEMIE','REAL','HIV','AIDS','AIDS',
  'TB','DNA','RNA','COVID','FMF','IMET','INCLE','MCA','IDA','AIIB','SBIC',
  'ARPA','CDBG','HOME','HECM','MBS','TSA','FAA','FRA','FHWA','FTA',
  'GSA','IRS','SEC','FBI','CIA','NSA','DHS','HUD','DOT','DOD','HHS','DOE',
  'DOJ','EPA','FCC','FDA','FEMA','ICE','CBP','USDA','SBA','OMB','OPM',
  'GAO','CBO','CRS','NDAA','DOGE','CFPB','SNAP','USCIS','TPS','DACA',
  'CHIP','ACA','CISA','FISA','GDP','NATO','IMF','WTO','NIH','SSA',
  // Additional contextual
  'CR','FY','AP','MIF','MCED','NCI','NIAID','NHLBI','SAMHSA','WIOA',
  'IDEA','ESEA','HEA','CCDBG','TANF','SSI','LIHEAP',
  'NCPS','NFIP','CFTC','AGOA',
  'SRBMD','RDT','TE',
]);

const found = new Map();

function extractAcros(text) {
  const re = /\b([A-Z][A-Z0-9\-]{1,})\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const w = m[1].replace(/-$/, '');
    if (SKIP.has(w) || KNOWN.has(w)) continue;
    if (/^\d/.test(w)) continue;
    if (!found.has(w)) found.set(w, []);
    if (found.get(w).length < 2) found.get(w).push(text.substring(Math.max(0, m.index-30), m.index+60));
  }
}

function scan(obj) {
  if (typeof obj === 'string') extractAcros(obj);
  else if (Array.isArray(obj)) obj.forEach(v => scan(v));
  else if (obj && typeof obj === 'object') Object.values(obj).forEach(v => scan(v));
}

scan(entry);

const sorted = [...found.entries()].sort((a,b) => a[0].localeCompare(b[0]));
console.log('Candidate untagged acronyms (' + sorted.length + '):\n');
sorted.forEach(([w, ctxs]) => {
  console.log(w);
  ctxs.forEach(c => console.log('  »', c.replace(/\n/g,' ')));
});
