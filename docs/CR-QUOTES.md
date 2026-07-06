# CR Quote Fetching

## CR Quote Fetching Architecture

`batch_processor.js` fetches CR quotes during bill processing via a two-path strategy:
1. **Fast path** — `parseCRPageRefs(actions)` extracts CR page references from action texts (e.g. `(text: CR H1147)`), then `fetchCRByPageRefs` directly fetches those specific GovInfo granules + sub-granule suffixes (-2 through -6)
2. **Fallback** — `fetchCongressionalRecord` iterates over floor-date windows, fetching GovInfo granule lists (paginated via `offsetMark=*`) and searching each for bill mentions

`fetch_bill_cr.js` uses the same `fetchCongressionalRecord` (imported from batch_processor via `module.exports`) for retroactive quote extraction. It uses pattern-based speaker extraction — no LLM required.

**Quote backfill is now automatic (the anti-staleness defense).** `fetch_bill_cr.js --all` runs in `run-batch.js --post` (after `generate_reps`, before `backfill_quote_chamber`). It targets only `analyzed && !demo && !featured_quotes.length` bills, so it backfills any cached bill whose CR quotes were unavailable at analysis time (API down / recess / text not yet posted) — the fetch pipeline itself only touches NOT-yet-cached bills, so without this a quote-less bill would stay quote-less forever (this is the same stale-forever trap `refresh_stages.js` fixes for stages). It's idempotent (skips bills that already have quotes) and re-checks the genuinely quote-less ones cheaply each run (500ms apart). This resolved the May→June backlog where 119/136 bills had no quotes.

**General (non-bill) floor statements** (`quotes.json`, `billId: null`) are now automated too. The fetch phase runs `fetch_cr_data.js` (pulls last `--days`, default 7, of raw CR granules → `cr_raw.json`) then `extract_floor_quotes.js`, which regex-extracts substantive speaker quotes (reusing `fetch_bill_cr.js`'s `extractQuotesFromCR` with empty bill args = no bill-proximity filter) under a **"spicy filter"**: keep only oppose/support stance (drop neutral), rank by the same `computeShockScore` the carousel uses, cap `PER_DAY_CAP` (6) per session day, dedup vs existing quotes + `processedDates`. This replaces the old hand-written `add_cr_quotes.js` (now legacy — it hardcoded LLM-picked quotes). **Backfill a gap:** `node scripts/fetch_cr_data.js --days=N` then `node scripts/extract_floor_quotes.js`. **Attribution caveat:** the regex path resolves bioguide by surname→reps-index (first match; it does NOT use the CR's "of State"), so always check `validate-batch.js`'s Quote-attribution WARN/ERROR output and fix any wrong person before pushing.

**Speaker extraction:** Regex matches `Mr./Ms./Mrs./Dr. LASTNAME.` (all-caps CR format). Filler openers ("I yield myself such time...", "I rise in support of...") are stripped sentence-by-sentence before excerpt selection. Quotes trim to the last complete sentence within 550 chars.

**Bioguide attribution (HARD RULE):** the CR attributes by **surname + state** ("Ms. SMITH of Minnesota"). When setting a quote's `bioguideId`, **disambiguate by state/party/chamber — never by surname alone.** Congress has many shared surnames (Smith, Mann, Johnson, Morrison…); a surname-only match grabs the wrong person and shows the wrong photo. `validate-batch.js` enforces this: the **Quote attribution** check ERRORs if a quote's surname isn't in the bioguide's rep name (wrong person) and WARNs on a state mismatch. Cross-check against `reps-index.json` before assigning. *(Real misfires caught & fixed this way: "Ms. Smith"→Jason Smith, "Rep. Tracey Mann"→Christian Menefee, "Ms. Morrison" IL→MN.)*

**GovInfo API note:** The granule list endpoint requires `offsetMark=*` (not `offset=0`). The live CR fetchers (`fetch_bill_cr.js`, `fetch_cr_data.js`, and the helpers in `batch_processor.js`) use `offsetMark` correctly — follow those for any new GovInfo calls.

