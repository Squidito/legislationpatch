# What Changed — Version Diff (bill.versionChanges)

## "What changed" — version diff (`bill.versionChanges`)

The "What changed" section is a **version-to-version diff of the bill's own text** (Introduced → latest), rendered as Added/Modified/Removed patch-notes cards. It is NOT effect-on-existing-law and NOT a separate timeline. Empty (and hidden) until the bill is actually revised between versions, so a returning reader sees what differs since they last read it. (Replaced the abandoned standalone "Version Timeline" + prose `versionSummary` approach — those are gone; `normalizeVersions`/`versionMilestoneLabel`/`.vt-*` CSS are dead code, cleanup candidates.)

**Data — `bill.versions[]`:** `scripts/fetch_versions.js` reads Congress.gov `GET /v3/bill/{c}/{type}/{n}/text` and stores `bill.versions = [{type, date, url}]` (chronological; rank fallback since Enrolled often has no date and Public Law's date is the signing). Metadata only. Runs in `run-batch --post`.

**Data — `bill.versionChanges`:** `{ added[], modified[], removed[], throughVersion:{type,date}, fromVersion:{type,date}, unchanged?, generatedAt }`. `fromVersion` = the baseline the diff was actually taken against (Introduced if present, else earliest available — `versions.find(introduced) || versions[0]`); `throughVersion` = latest text-bearing version (a future check can re-diff when a newer version appears). `unchanged:true` marks "checked, passed as introduced" (renders nothing).
- **Generation is a content batch** (Agent or in-conversation, same HARD sourcing rules — bullets come ONLY from the two fetched version texts, never training data). Helper scripts: `scripts/fetch_version_texts.js` (fetches Introduced+latest text to `data/version-text/{id}.{introduced,latest}.txt`, gitignored), `scripts/set_version_changes.js` (`--bill=ID --file=changes.json` or `--none`). Oversized bills (>~400K chars) get a coarse structural/heading diff, flagged for spot-check.

**UI (`renderWhatChanged` in app.js):** renders the `.what-changed-grid` Added/Modified/Removed `.patch-block` cards. The provenance tag is dynamic via `whatChangedBaselineTag(vc)` — "vs. as introduced" only when `fromVersion` is an introduced text, else "vs. as reported" / "vs. as placed on the calendar" / "vs. as first passed" etc. Placement: it now leads the **bottom** analyst/context cluster (after the section spine, just before Underreported / Not-addressed) on both normal bills (`renderBody`) and omnibus divisions (`renderDivision`) — NOT at the top.

