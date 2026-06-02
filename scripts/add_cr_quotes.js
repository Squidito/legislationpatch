const fs   = require('fs');
const path = require('path');

const QUOTES_FILE = path.join(__dirname, '../data/quotes.json');
const quotesData  = JSON.parse(fs.readFileSync(QUOTES_FILE, 'utf8'));

const newQuotes = [
  {
    name: 'Sen. Chuck Schumer',
    party: 'D',
    state: 'NY',
    bioguideId: 'S000148',
    text: "Donald Trump settles with himself in his own lawsuit against his own government to funnel taxpayer money to his political allies, January 6 insurrectionists, and far-right loyalists. That is not justice. That is not law and order. That is corruption—corruption in broad daylight—no disguise, no shame, no attempt to hide it.",
    source: 'Senate Floor, May 19, 2026',
    stance: 'oppose',
    billId: null,
    billTitle: null,
  },
  {
    name: 'Sen. John Thune',
    party: 'R',
    state: 'SD',
    bioguideId: 'T000250',
    text: "What I consider to be the most consequential action not just of this majority but of my entire time in the Senate is the Working Families Tax Cut—because of the permanent tax relief Republicans delivered in this bill, tax relief that puts more money in hard-working Americans' pockets.",
    source: 'Senate Floor, May 19, 2026',
    stance: 'support',
    billId: '119-HR-1',
    billTitle: 'One Big Beautiful Bill Act',
  },
  {
    name: 'Rep. Hank Johnson',
    party: 'D',
    state: 'GA',
    bioguideId: 'J000288',
    text: "Healthcare will cost more than $26 trillion through the year 2036, making healthcare the largest category of Federal spending. This Republican rubber-stamped Congress has failed to advance extensions to the enhanced premium tax credits, causing more families to make very difficult decisions—decisions we should not have to make in a country like this.",
    source: 'House Floor, May 19, 2026',
    stance: 'oppose',
    billId: null,
    billTitle: null,
  },
  {
    name: 'Rep. Tracey Mann',
    party: 'R',
    state: 'KS',
    bioguideId: 'M001245',
    text: "Seventy years later, America's transportation needs have changed, but Congress' basic responsibility remains the same. We have a duty to maintain a surface transportation system that allows people and goods to move across this country safely, efficiently, and reliably.",
    source: 'House Floor, May 21, 2026',
    stance: 'support',
    billId: null,
    billTitle: null,
  },
];

// Deduplicate by speaker+text prefix
const existingKeys = new Set(
  (quotesData.quotes || []).map(q => `${q.name}|${(q.text || '').slice(0, 40)}`)
);

const toAdd = newQuotes.filter(q => !existingKeys.has(`${q.name}|${q.text.slice(0, 40)}`));

quotesData.quotes = [...(quotesData.quotes || []), ...toAdd];

// Mark all four CR dates as processed
const newDates = ['2026-05-19', '2026-05-21', '2026-05-22', '2026-05-26'];
const processed = new Set(quotesData.processedDates || []);
newDates.forEach(d => processed.add(d));
quotesData.processedDates = [...processed].sort();
quotesData.generated = new Date().toISOString();

fs.writeFileSync(QUOTES_FILE, JSON.stringify(quotesData, null, 2));
console.log(`Added ${toAdd.length} quotes. Total: ${quotesData.quotes.length}`);
toAdd.forEach(q => console.log(` + ${q.name} (${q.source})`));
console.log('Processed dates now:', quotesData.processedDates.slice(-6).join(', '));
