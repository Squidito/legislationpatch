# Vote Data Architecture

## Vote Data Architecture

`fetch_vote_data.js` fetches roll call vote data for each bill:
- Reads `recordedVotes` array from Congress.gov actions API (note: plural field, not `recordedVote`)
- House votes: fetches `clerk.house.gov/evs/{year}/roll{N}.xml` — XML totals in `<totals-by-vote>` using `<yea-total>` / `<nay-total>` tags
- Senate votes: fetches `senate.gov/legislative/LIS/roll_call_votes/vote{congress}{session}/vote_{congress}_{session}_{roll5d}.xml`
- Voice vote / UC bills: stored with `method: "Voice Vote"` or `"Unanimous Consent"`, no member array
- Deduplicates rolls — same vote appears under both chamber source system + Library of Congress mirror actions

**Output files:**
- `data/votes/{billId}.json` — full vote with member arrays + crossover detection
- `cache.json` bill `votes` field — aggregate summary only (no member arrays)
- `data/reps/{bioguideId}.json` `voteHistory` field — patched with `{billId, billTitle, chamber, date, vote}` per member

**Crossover detection:** only runs on close votes (margin ≤ 30% of total yeas+nays). Compares each member's vote against their party's majority direction.

`batch_processor.js` automatically calls `processVotesForBill` after each new bill is processed.

