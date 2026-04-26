const fs = require('fs');
const path = require('path');

let CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || '';
try {
  const configContent = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
  const match = configContent.match(/CONGRESS_API_KEY:\s*['"]([^'"]+)['"]/);
  if (match && match[1]) CONGRESS_API_KEY = match[1];
} catch (e) {
  // Ignore
}

const cachePath = path.join(__dirname, '../data/cache.json');
const repsDir = path.join(__dirname, '../data/reps');

if (!fs.existsSync(repsDir)) {
  fs.mkdirSync(repsDir, { recursive: true });
}

let data;
try {
  data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
} catch (e) {
  console.error("Failed to read data/cache.json", e);
  process.exit(1);
}

const bills = Object.values(data.bills || {});
const reps = {};

bills.forEach(bill => {
  if (bill.featured_quotes) {
    bill.featured_quotes.forEach(quote => {
      const id = quote.bioguideId;
      if (!id) return;
      if (!reps[id]) {
        reps[id] = {
          bioguideId: id,
          name: quote.name,
          party: quote.party,
          state: quote.state,
          portraitUrl: `https://www.congress.gov/img/member/${id.toLowerCase()}_200.jpg`,
          bio: "",
          comments: []
        };
      }
      reps[id].comments.push({
        billId: bill.id,
        billTitle: bill.title,
        stance: quote.stance,
        text: quote.text,
        date: bill.date || new Date().toISOString().split('T')[0]
      });
    });
  }
});

async function fetchBio(rep) {
  if (!CONGRESS_API_KEY) {
    rep.bio = `${rep.name} is a member of the United States Congress representing ${rep.state}.`;
    rep.role = "Member of Congress";
    return;
  }
  try {
    const url = `https://api.congress.gov/v3/member/${rep.bioguideId}?api_key=${CONGRESS_API_KEY}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const member = data.member;
      if (member) {
         let type = "Representative";
         let district = null;
         if (member.terms && member.terms.length > 0) {
           const latestTerm = member.terms[member.terms.length - 1];
           type = latestTerm.memberType === 'Senator' ? 'Senator' : 'Representative';
           if (latestTerm.district) district = latestTerm.district;
         }
         rep.role = type;
         rep.district = district;
         
         const districtText = district ? ` for District ${district}` : '';
         rep.bio = `${rep.name} is a ${type} representing ${rep.state}${districtText}.`;
      }
    } else {
      rep.bio = `${rep.name} is a member of the United States Congress representing ${rep.state}.`;
      rep.role = "Member of Congress";
    }
  } catch (e) {
    rep.bio = `${rep.name} is a member of the United States Congress representing ${rep.state}.`;
    rep.role = "Member of Congress";
  }
}

async function run() {
  const repValues = Object.values(reps);
  if (repValues.length === 0) {
    console.log("No featured quotes with bioguideIds found in cache.json.");
    return;
  }
  
  for (const rep of repValues) {
    console.log(`Fetching info for ${rep.name} (${rep.bioguideId})...`);
    await fetchBio(rep);
    fs.writeFileSync(path.join(repsDir, `${rep.bioguideId}.json`), JSON.stringify(rep, null, 2));
    console.log(`Generated data/reps/${rep.bioguideId}.json`);
  }
  console.log('Done generating reps!');
}

run();
