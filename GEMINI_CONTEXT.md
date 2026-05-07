# LegislationPatch — Context for Gemini / Antigravity

This document captures the full current state of the project for handoff between AI sessions. Read this before making any changes.

---

## What This Is

A static civic web app that explains U.S. federal bills in plain English, styled like video game patch notes. Nonpartisan. No accounts. No backend.

**Live site:** deployed via Netlify, auto-deploys on push to `main`.
**Local dev:** `npx serve . --listen 3131`

---

## The Single Most Important Architectural Decision

**The site is fully static. No live API calls happen in the browser.**

All bill analysis is done locally on James's machine via a batch processor (`scripts/batch_processor.js`), which uses a local LLM (LM Studio / Qwen3.5 9B on port 1235). The output is written to `data/cache.json`, committed, and pushed to GitHub, which triggers a Netlify deploy.

The browser reads only `data/cache.json`. Do not add live API calls to `api.js` or `app.js`.

---

## Current State of the Codebase (Updated April 2026)

### What Works and Is Deployed

- Full desktop and mobile responsive layout
- Bill cards with two-level expansion (minor → full); clicking header from any open state collapses fully
- Bill code (e.g. "HR 2319") displayed in metadata line alongside stage/version/date
- **Filter system:** In Progress / Passed primary tabs + sub-filter row (All, Introduced, Committee, House, Senate, Just Passed). "Just Passed" = signed within 30 days, appears under both tabs.
- Favorites/tracked view (star icon in header) — localStorage only, no accounts. Renamed from "starred" to "tracked".
- Rep detail pages (`rep.html`) with star tracking
- Shock quotes carousel: bidirectional infinite wrap, `width: 165px` cards (2 visible on mobile), auto-scroll via pixel accumulator at ~6px/sec, names wrap within card, source dates in dd/mm/yy format
- Dark mode with full variable system + moon icon toggle
- ZIP auto-detect from `ipapi.co` — populates header input on first visit
- Stage pipeline dots use CSS custom properties (dark mode safe — `fp-dot-done/active/pending` classes)
- `top_lines` in bill cards now support `{headline, subs[]}` object format for grouped summaries (backward compatible with legacy string array format)
- "Just Passed" badge on bills signed within 30 days
- **Quote cards** in bill expansions: shown in minor view and full view (after "What Changed"). Rep portrait links to rep page. Quotes clamp at 5 lines with `...`, expand on hover. Neutral stance shows no badge.
- **Gaps section** (`Not Addressed In This Bill`) has amber card container matching underreported style
- **Patch notes section** has surface card container with purple left border, matching top-lines style

### Batch Processor — Key Behaviors

**Floor-time rule (strict):** Only bills that have passed the House or Senate floor (step ≥ 2) are eligible. Batch mode enforces this automatically. `--bill` mode enforces it with a `--force` override.

**Three chunking strategies (priority order):**
1. **XML structural** (`chunkXMLByStructure`): splits at `<section>` USLM XML boundaries — semantically whole provisions, each labeled by enum+header. `fetchBillText` now returns `{text, isXML}` and prefers Formatted XML over Formatted Text.
2. **CRS-primary**: when bill > 100K chars and CRS > 10K chars, chunks the CRS summary instead of raw bill text. Dramatically fewer chunks for mega-bills.
3. **Word-count fallback**: 3000-word chunks, 500-word overlap.

**Reduce phase:** ≤14 chunks → direct proportional truncation to 20K chars. 15+ chunks → hierarchical two-pass reduce (groups of 15 → mid-reduce to key facts → final synthesis).

**Post-verification number humanizer:** After the verification gate passes, `humanizeAmountsDeep()` converts exact legislative figures to human-readable units ($240,774,000 → $241M, $1,175,482,000 → $1.2B). This runs AFTER verification — numbers verified as real, then formatted for display.

**Dollar amount verification fix:** Verification now checks dollar amounts against both the normal source text AND a comma-stripped version, so $240,774,000 correctly matches "240,774,000" in appropriations bill text.

**detectStage improvements:**
- "Placed on Union Calendar" / "House Calendar" → committee, step 1
- "Motion to reconsider laid on the table Agreed to" → house, step 2 (= passed House)
- "Received in the Senate" → house, step 2 (= passed House, now in Senate)

### Bills Currently in cache.json

| ID | Title | Stage | Type |
|---|---|---|---|
| 119-HR-1 | Reconciliation Act (Public Law 119-21) | Signed into Law | BATCH |
| 119-HR-5587 | HEATS Act (geothermal permits) | Passed House | BATCH |
| 119-HR-6955 | Main Street Capital Access Act | House Calendar | LIVE (manually crafted) |
| 119-HR-8469 | Military Construction FY2027 | House Calendar | DEMO |
| 119-HR-7567 | Farm, Food, and National Security Act | House Calendar | DEMO |

---

## Files You Should Know About

```
index.html          Main app page
styles.css          All styles — CSS custom properties, dark mode at bottom
app.js              All UI logic, rendering, state management
api.js              Reads data/cache.json ONLY — no live fetching
rep.html            Rep detail page
rep.js              Rep page logic (tracking, theme, profile render)
privacy.html        Privacy policy
terms.html          Terms of service
data/cache.json     The bill database — written by batch processor
data/reps/          Rep profile JSON files — one per bioguideId
scripts/batch_processor.js   The batch pipeline + CR fetching (exports module.exports for reuse)
scripts/fetch_bill_cr.js     Retroactive CR quote fetcher (no LLM; uses batch_processor exports)
scripts/prompts.js           LLM prompts for map and reduce phases
scripts/generate_reps.js     Generates rep JSON files (not yet fully tested)
.env                CONGRESS_API_KEY + GOVINFO_API_KEY + CONGRESS_SESSION=119 (gitignored)
```

---

## localStorage Keys (Do Not Change These)

```
lpTrackedReps     Array of tracked rep objects {id, name, party, state, source}
lpWatchedBills    Array of watched bill IDs (tracked bills)
lpTheme           'dark' or 'light'
lpTrackedState    2-letter state code for the rep tracker
lpTrackedZip      5-digit ZIP code (auto-detected from ipapi.co on first visit)
```

These keys are shared between `index.html` (app.js) and `rep.html` (rep.js). If you change them, both files must be updated together.

---

## Data Source Rules — Strictly Enforced

The batch processor has a **verification gate** that hard-rejects bills if claims can't be traced to official sources. The three-zone rule:

- **Zone 1** (bill text/XML + CRS summary only): summary, sections, top_lines, underreported, gaps, changes
- **Zone 2** (Congressional Record excerpts only): featured_quotes, criticisms, section comments
- **Zone 3** (reasoning allowed): likelihood, likelihoodLabel, likelihoodReason

Do not change this architecture. It is intentional and non-negotiable — the project's credibility depends on it.

---

## Bill Schema — Exact Format Required

```json
{
  "id": "119-HR-6955",
  "title": "...",
  "code": "HR.6955",
  "stage": "house",
  "stageLabel": "Passed House",
  "date": "Apr 20, 2026",
  "sponsor": "Rep. Full Name (P-ST)",
  "sponsor_bioguide": "H001072",
  "sponsors": [...],
  "cosponsors": 0,
  "pages": 1,
  "version": "v1.0",
  "pipeline": ["Introduced","Committee","Passed House","Passed Senate","Signed"],
  "currentStep": 2,
  "likelihood": 55,
  "likelihoodLabel": "Possible",
  "likelihoodReason": "...",
  "analyzed": true,
  "live": false,
  "demo": false,
  "summary": "...",
  "brief": "...",
  "top_lines": [
    { "headline": "One-sentence major theme — include $ figure if available", "subs": ["Supporting detail", "Another detail"] }
  ],
  "sections": [...],
  "underreported": [...],
  "criticisms": [...],
  "gaps": [...],
  "featured_quotes": [...],
  "changes": {"added":[],"modified":[],"removed":[]}
}
```

**top_lines note:** new bills use the `{headline, subs[]}` object format. Old bills may use a flat `string[]` format — the renderer handles both. Do not convert old bills unless reprocessing.

**Dollar amounts in cache.json** are humanized after verification: $241M not $240,774,000. This is correct and intentional.

---

## Things NOT To Do

- Do not add live API calls to `api.js` or `app.js`
- Do not add the Anthropic Claude credit to any footer — we use a local LLM
- Do not change localStorage key names without updating both `app.js` and `rep.js`
- Do not implement the second-pass LLM verification for underreported sections without James confirming
- Do not commit `config.js` or `.env` — both are gitignored
- Do not change `likelihoodLabel` to be model-generated — it is always derived from the numeric `likelihood` in `batch_processor.js`
- Do not remove or weaken the verification gate
- Do not break the `--bill` flag in `batch_processor.js`
- Do not add committee-stage or introduced bills to cache.json — floor-time rule is strict
- Do not use exact long-form dollar amounts ($240,774,000) in new cache entries — humanizer produces $241M format

---

## Design Language

- **Font:** Plus Jakarta Sans — warm geometric, Discord/Duolingo-adjacent feel
- **Mono:** IBM Plex Mono (wght 500;600;700) — bill titles, rep names on quote cards, all metadata, codes, percentages, section labels
- **Color accent:** `--purple: #6d4fc7` (active states, tracking, favorites)
- **Warning/amber:** `--amber` for underreported, star buttons when active
- **Footer emphasis:** `#E8855A` — warm orange for the word "only" in the data source line
- Dense-but-readable, information-first, nonpartisan

---

## Session History

- `gemini-3.1-seo-and-compliance` — April 2026 Gemini session, merged to main
- All subsequent work by Claude Code on `main` directly

**Claude sessions (April–May 2026):**
- Built batch processor, verification gate, three-zone source discipline
- UI: filter redesign (In Progress/Passed), carousel bidirectional wrap, ZIP auto-detect, tracked bills rename, dark mode stage dots, Just Passed badge, top_lines headline+subs format
- Batch processor: XML structural chunking, CRS-primary mega-bill strategy, hierarchical reduce, floor-time filter, number humanizer, detectStage improvements
- Processed and verified: HR-1 (reconciliation law), HR-5587 (HEATS Act)
- Font swap DM Mono → IBM Plex Mono across all pages; date format standardised to mm/dd/yy
- Veto detection in detectStage (both api.js and batch_processor.js)
- Rule 8 strengthened: extension/reauth bills must explain original program in summary AND top_lines
- CR quote pipeline rebuilt: GovInfo granule fetching (offsetMark=* pagination), direct page-ref fast path, pattern-based speaker extraction, filler opener stripping — no LLM required
- `scripts/fetch_bill_cr.js` added for retroactive quote backfill
- UI: bill code in metadata line, full-expansion collapse on header click, quote cards in full expansion after "What Changed", gaps section container, patch notes container, patch-item-main font/size tuning, quote hover expansion
