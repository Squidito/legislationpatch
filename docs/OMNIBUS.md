# Omnibus / Multi-Division Bill Processing


Omnibus appropriations bills (e.g. HR-7148, Consolidated Appropriations Act) have too much text for a single-pass analysis (~1.4M chars vs ~800K context limit). They use a division-by-division architecture.

### Detection

`fetch_bills_data.js` auto-detects omnibus bills via `classifyAppropriation()`. When detected:
1. `splitIntoDivisions()` splits the cleaned display text at `DIVISION X--` body headers
2. `bills_raw.json` entry has `isOmnibus: true` and a `divisions` array instead of a flat `billText`
3. Each division entry: `{ label, divisionKey, text, charCount }`
4. Full bill text still saved to `data/bill-text/{billId}.txt` unchanged

### bills_raw.json schema for omnibus

```json
{
  "billId": "119-HR-7148",
  "isOmnibus": true,
  "billText": "",
  "divisions": [
    { "label": "Division A — Department of Defense Appropriations Act, 2026", "divisionKey": "A", "text": "...(flat analysis text)...", "charCount": 350000 },
    { "label": "Division B — ...", "divisionKey": "B", "text": "...", "charCount": 180000 }
  ],
  "crsSummary": "...",
  "congressionalRecord": "..."
}
```

### Analysis workflow (in-conversation)

When `run-batch.js` pauses for manual analysis of an omnibus bill:

1. **Per-division passes** — For each `divisions[N]` entry:
   - Paste `divisions[N].text` into the conversation
   - Follow it with `OMNIBUS_DIVISION_PROMPT` from `scripts/prompts.js`
   - Claude outputs one division JSON block
   - Repeat for each division

2. **Top-level pass** — After all divisions are analyzed:
   - Paste the full CRS summary + congressional record from `bills_raw.json`
   - Follow with `OMNIBUS_TOPLEVEL_PROMPT` from `scripts/prompts.js`
   - Claude outputs the top-level fields (summary, brief, top_lines, sections, changes, etc.)

3. **Assemble cache.json entry**:
   ```json
   {
     "id": "119-HR-7148",
     "isOmnibus": true,
     "summary": "...",
     "brief": "...",
     "top_lines": [...],
     "sections": [...],
     "changes": {...},
     "underreported": [...],
     "criticisms": [...],
     "gaps": [...],
     "featured_quotes": [...],
     "divisions": [
       { "label": "Division A — ...", "divisionKey": "A", "summary": "...", "brief": "...", "top_lines": [...], "sections": [...], "underreported": [...], "changes": {...}, "criticisms": [], "gaps": [], "featured_quotes": [] },
       ...
     ]
   }
   ```

### cache.json schema for omnibus

Top-level fields work identically to a normal bill. Additional fields:

| Field | Purpose |
|---|---|
| `isOmnibus: true` | Flags this as a division-split bill; drives OMNIBUS badge + amber card border |
| `top_lines[]` | One headline group per division — per-division quick overview bullets |
| `sections[]` | Per-title breakdown pulled from `divisions[].sections[]` — the full factual breakdown |
| `divisions[]` | Analysis layer only: summary, top_lines, underreported, gaps, changes per division |

**`top_lines[]` for omnibus** — one headline per division, each with 2-3 subs of key figures:
```json
{ "headline": "Division A — Defense", "billSection": "8001", "subs": ["$54.54B Army personnel...", "..."] }
```

**`sections[]`** — pulled directly from `divisions[N].sections[]`. Use auto-parseable Title labels:
```json
{ "label": "Title I — Military Personnel", "items": [{ "main": "...", "detail": "...", "comments": [] }] }
```

**`divisions[]` analysis layer** — does NOT repeat sections; contains only the interpretive fields:
```json
{
  "label": "Division A — Department of Defense Appropriations Act, 2026",
  "divisionKey": "A",
  "summary": "...",
  "brief": "...",
  "top_lines": [...],
  "underreported": [...],
  "changes": { "added": [], "modified": [], "removed": [] },
  "criticisms": [],
  "gaps": [],
  "featured_quotes": []
}
```

Note: `divisions[N].sections[]` is still populated in the data (used to build the top-level `sections[]`) but is NOT rendered in the division block on the bill page — `renderDivision()` in `app-*.js` (see CLAUDE.md Key Files for the split map) intentionally skips it to avoid duplication.

### Display behavior

- **Bill card** (`renderBill` in `app-*.js` (see CLAUDE.md Key Files for the split map)): gets `.bill-card--omnibus` class → amber border + glow. Badge column shows the **OMNIBUS** badge.
- **Index card expansion** (`renderBody`): top-lines (per-division overview) only — patch notes section suppressed for omnibus (`bill.isOmnibus` guard in `renderBody`).
- **Bill page** (`bill.html`): top-level `sections[]` renders as normal patch notes (per-title breakdown), followed by `divisions[]` as "Division-by-Division Analysis" — each block shows summary, top_lines bullets, changes, underreported, and gaps.

### Section anchors in division analysis

When writing `divisions[N].sections[].label`, use the same parseable format as normal bills:
- `"Title I — Military Personnel"` → auto-links to `bt-title-I`
- `"Section 8059 — ..."` → auto-links to `bt-sec-8059`

Division headers in the full bill text are rendered as `bt-title` elements if they appear as standalone ALL-CAPS lines.

