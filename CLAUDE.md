# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What This Project Does

LegislationPatch is a static single-page web app that explains U.S. federal bills in plain English, styled like video game patch notes. Bills are analyzed offline via a local batch processor and pushed to the site as static JSON. The site reads only from `data/cache.json` — no live API calls happen in the browser.

**Floor-time rule (strict):** Only bills that have been voted on the House or Senate floor (passed House, passed Senate, or signed into law) are eligible. Committee-stage and introduced bills are excluded. Use `--force` to override in single-bill mode.

## Architecture: Batch-First, Static Site

```
Local machine (batch run):
  scripts/batch_processor.js
    → Congress.gov API  (bill XML/text, metadata, CRS summary, Congressional Record)
    → LM Studio / Qwen3.5 9B on port 1235 (map phase per chunk, reduce phase for JSON)
    → Post-verification number humanizer ($240,774,000 → $241M)
    → Verification gate (hard-rejects any unverified factual claim)
    → data/cache.json   ← written here, then git pushed to deploy

Site (browser — fully static):
  api.js  → reads data/cache.json only
  app.js  → renders everything from that data
```

## Tech Stack

Vanilla JS / HTML / CSS. No framework, no build tools, no backend.
- **Font:** Plus Jakarta Sans (body/display) + DM Mono (mono/metadata)
- **Deployed:** GitHub → auto-deploy via `.github/workflows/deploy.yml` → Netlify
- **Local dev:** `npx serve . --listen 3131` then open `http://localhost:3131`
- **Batch run:** `node scripts/batch_processor.js` (LM Studio must be on port 1235)
- **Targeted run:** `node scripts/batch_processor.js --bill 119-HR-5587`
- **Force non-floor bill:** `node scripts/batch_processor.js --bill 119-HR-XXXX --force`

## API Keys and Secrets

**Never put real API keys in `config.js`** — it is tracked by git. Keys go in `.env` only (gitignored).

Copy `.env.example` to `.env` and fill in your keys:
- `CONGRESS_API_KEY` — free at https://api.congress.gov/sign-up/
- `GOVINFO_API_KEY` — free at https://api.data.gov/signup/

`scripts/generate_reps.js` and `scripts/scan_record.js` fall back to reading from `config.js` if `.env` is missing — but `config.js` only contains empty placeholders, so always use `.env`.

## File Responsibilities

| File | Role |
|---|---|
| `config.js` | Empty API key placeholders — **tracked by git, never add real keys here** |
| `api.js` | Reads `data/cache.json` — no live fetching on the site |
| `app.js` | All UI: rendering, state, dark mode, rep tracking, favorites, carousel |
| `index.html` | Page structure — loads config → api → app |
| `styles.css` | All styles via CSS custom properties; dark mode via `[data-theme="dark"]` |
| `rep.html` | Rep detail page — loads from `data/reps/{bioguideId}.json` |
| `rep.js` | Rep page: profile render, star tracking, theme sync, toggleTheme |
| `privacy.html` | Privacy policy (full site header, matching footer) |
| `terms.html` | Terms of service (full site header, matching footer) |
| `data/cache.json` | All bill data — written by batch processor, read by site |
| `data/reps/*.json` | Individual rep profile JSON files |
| `.env` | `CONGRESS_API_KEY` + `GOVINFO_API_KEY` + `CONGRESS_SESSION=119` — **gitignored** |
| `scripts/batch_processor.js` | Full batch pipeline — see pipeline section below |
| `scripts/prompts.js` | LLM prompts: SYSTEM_PROMPT + CHUNK_MAP_PROMPT |
| `scripts/generate_reps.js` | Generates/updates `data/reps/` static files |
| `scripts/scan_record.js` | Scans Congressional Record for floor quotes via GovInfo API |
| `.github/workflows/deploy.yml` | Auto-deploys to Netlify on push to main |

## Batch Processor Pipeline

```
node scripts/batch_processor.js
```

1. Fetch 10 recent bills from Congress.gov (`/v3/bill/119?sort=updateDate+desc`)
2. Filter out: DOA actions, technical corrections, naming bills, sense resolutions, commemoratives, **and any bill that hasn't passed the House or Senate floor**
3. For each eligible bill (up to 2 per run):
   - Fetch bill text (XML preferred, HTML fallback), metadata, CRS summary
   - Fetch Congressional Record for the action date
   - **Chunking strategy (priority order):**
     1. XML structural: split at legal `<section>` boundaries — semantically whole provisions, labeled by title/header
     2. CRS-primary: use CRS summary as source when bill > 100K chars and CRS > 10K chars
     3. Word-count: 3000-word chunks with 500-word overlap (fallback)
   - **Map phase:** each chunk → LLM extracts facts (bullet points only, no inference)
   - **Reduce phase:** direct truncation for ≤14 chunks; hierarchical two-pass reduce for 15+ chunks (groups of 15 → mid-reduce → final synthesis)
   - **Verification gate:** hard-rejects bill if any claim is unverified
   - **Number humanizer:** post-verification pass converts $240,774,000 → $241M, $1.175B etc.
4. Saves to `data/cache.json` — commit and push to deploy

**LM Studio settings that matter:** port 1235, Qwen3.5 9B, context 12288, GPU offload 32, CPU threads 6, Flash Attention ON, `enable_thinking: false`.

## Three-Zone Source Discipline

| Zone | Source | Fields | Notes |
|---|---|---|---|
| 1 | Bill text + CRS only | `summary`, `brief`, `top_lines`, `sections`, `underreported`, `gaps`, `changes` | Verified by gate |
| 2 | Congressional Record only | `featured_quotes`, `criticisms`, `comments` | Empty arrays if no Record |
| 3 | Reasoning allowed | `likelihood`, `likelihoodLabel`, `likelihoodReason` | Editorial — labeled in UI |

**Verification gate — every failure hard-rejects the bill:**
- Zone 2 with no Congressional Record → rejected
- Speaker name not found in Record excerpts → rejected
- Dollar amount not in bill text or CRS (checked with and without commas) → rejected
- Percentage not in source → rejected
- Section number reference not in source → rejected
- Named program/agency not in source → rejected
- Underreported section keywords not in bill text → rejected

## Prompt Rules (scripts/prompts.js)

Rules enforced in `SYSTEM_PROMPT`:
- **Rule 1** — Numbers first, exact and unrounded (`$240,774,000` not `$240.8M`)
- **Rule 2** — Label sections after actual bill titles
- **Rule 3** — Underreported = mechanically distinct from the headline; no "buried/quietly/hidden" language
- **Rule 4** — Gaps must be anchored to the bill's own stated purpose, not external policy preference
- **Rule 5** — Changes must be precise (old → new values)
- **Rule 6** — Likelihood must cite chamber majority, sponsor party, cosponsor count
- **Rule 7** — No editorial adjectives in Zone 1/2 ("quietly," "buried," "sweeping," "significant," etc.)

**Analyst judgment fields** (marked with `analyst judgment` tag in UI): `underreported`, `gaps`, `likelihoodReason`. These involve interpretation beyond source extraction.

## top_lines Format

`top_lines` uses `{headline, subs[]}` objects — NOT flat strings:
- `headline` — short topic label (3–6 words), e.g. `"Defense Spending"`, `"Tax Rate Changes"`. No dollar amounts.
- `subs` — 1–3 specific provisions under that topic, leading with exact figures when available.

**Backward compatibility:** `renderTopLines` handles legacy flat string format. Old bills render correctly.

## Bill Reference Linking

`billRefHtml(text, currentBillId)` in `app.js` scans prose fields for bill code patterns (`H.R. 1234`, `S. 40`, `H.Con.Res. 40`, etc.) and:
- Replaces with a linked title if the bill is in `allBills`
- Renders as italic span if it's a self-reference
- Leaves the code unchanged if not found in cache

`scrollToBill(id)` handles click: switches filter tab if needed, smooth-scrolls, and briefly flashes the card purple.

Applied to: `top_lines` subs, `brief`, `underreported`, `criticisms`, `gaps`, `changes` blocks, patch item `main`/`detail`, and comment text.

## Rep Strip

The horizontal portrait carousel in the controls bar. Ordering: **Featured → Tracked → Local state reps**.

- **Featured** (positions 1–2): top-scoring R + top-scoring D from quote pool by `shockScore`; amber outline ring (`rep-featured` class)
- **Tracked**: manually tracked reps from localStorage
- **Local**: all reps from `repsIndex[trackedState]`
- **Fallback** (no local index): 8 most recent quote speakers beyond the featured two
- Drag-to-scroll: mouse + touch, handled by `setupRepStripDrag()` (wired once at boot)
- Last names shown under portraits (same style as dropdown)

**ZIP auto-detect:** `autoDetectState()` hits `ipapi.co/json/` when state is saved but ZIP is missing. Only skips the IP call when both state AND ZIP are already stored.

## Bill Card Architecture

Cards use a **4-column CSS grid**: `48px 48px 1fr 40px` (mobile: `36px 40px 1fr 34px`)
- Col 1: rank badge + LIVE/DEMO/JUST PASSED pill
- Col 2: sponsor portrait (42px circle)
- Col 3: title block (meta + title + summary + sponsor meta)
- Col 4: star button (SVG star polygon — fills amber when tracked)

**Likelihood footer** uses the same grid:
- Cols 1-2 spanned: mini stage pipeline dots (CSS-class driven: `fp-dot-done/active/pending` — dark mode safe)
- Col 3: passage likelihood bar + value
- Col 4: CSS chevron

**Two-level card expansion** (managed via `openCards` Map):
- `undefined` → collapsed
- `'minor'` → likelihood detail + top-lines (headline+subs format) + underreported teaser + quote cards + "Full analysis" button
- `'full'` → full patch notes, what-changed, criticisms, gaps

## Key UI Features

**Filter system:**
- Primary row: **In Progress** | **Passed**
- Sub-filter row (rendered dynamically by `renderSubFilters()`):
  - In Progress: All | Introduced | Committee | House | Senate | Just Passed
  - Passed: All Passed | Just Passed
- "Just Passed" = stage `signed` within 30 days of today — appears in BOTH primary tabs

**Favorites view** — star icon in header:
- Tracked reps: portrait, name, bill activity, featured quote
- Tracked bills: full interactive cards, star icon in empty state
- All localStorage, no account: `lpTrackedReps`, `lpWatchedBills`, `lpTheme`, `lpTrackedState`, `lpTrackedZip`

**Shock quotes carousel** ("From the Floor This Week"):
- Cards: `width: 165px`, uniform height via `align-items: stretch` + `min-height: 5.5rem` on text area
- Quote text clamped to 5 lines by default; hover expands smoothly (0.28s ease, up to 20rem)
- Auto-scrolls at 0.1px/frame; bidirectional infinite wrap `[clones][originals][clones]`, starts at middle third
- Featured cards (top R + top D by shock score): amber border + ⚡ bolt icon
- Grab cursor on card empty space; pauses on hover; grab-to-drag

**Stage dots (dark mode safe):**
- Footer pipeline dots: `.fp-dot-done`, `.fp-dot-active`, `.fp-dot-pending` CSS classes
- Stage strip labels: `.stage-strip-label-on` for active/done steps

## Color System

| Purpose | Color |
|---|---|
| Accent / active states | `--purple: #6d4fc7` |
| Likelihood Likely (≥65%) | `--green` / `--green-text` |
| Likelihood Possible (≥45%) | `--purple` / `--purple-text` |
| Likelihood Unlikely (<45%) | `--text-3` / `--text-2` (adapts dark mode) |
| Underreported / warning | `--amber: #a87d24` |
| Featured rep ring / shock quote card | `--amber` border + glow |
| Footer "only" emphasis | `#E8855A` (warm orange) |

## Dark Mode

Toggle via `[data-theme="dark"]` on `<html>`. Key: `lpTheme`.

## Cache Schema (per bill)

```json
{
  "id": "119-HR-6955",
  "title": "Main Street Capital Access Act",
  "code": "HR.6955",
  "stage": "house",
  "stageLabel": "House Calendar",
  "date": "Apr 20, 2026",
  "sponsor": "Rep. Hill, J. French (R-AR)",
  "sponsor_bioguide": "H001072",
  "cosponsors": 33,
  "pages": 47,
  "version": "v1.0",
  "pipeline": ["Introduced","Committee","Passed House","Passed Senate","Signed"],
  "currentStep": 2,
  "likelihood": 38,
  "likelihoodLabel": "Unlikely",
  "likelihoodReason": "...",
  "analyzed": true,
  "live": true,
  "demo": false,
  "summary": "...",
  "brief": "...",
  "top_lines": [
    { "headline": "Short Topic Label", "subs": ["Specific provision with figure", "Another provision"] }
  ],
  "sections": [{"label":"Title I — ...","items":[{"main":"...","detail":"...","comments":[]}]}],
  "underreported": [{"section":"...","summary":"...","why_unreported":"..."}],
  "criticisms": [{"who":"...","why":"..."}],
  "gaps": ["..."],
  "featured_quotes": [{"name":"...","party":"D","state":"MA","bioguideId":"W000817","text":"...","stance":"oppose"}],
  "changes": {"added":[],"modified":[],"removed":[]}
}
```

## Bills Currently in cache.json

| ID | Title | Stage | Badge |
|---|---|---|---|
| 119-HR-6955 | Main Street Capital Access Act | House Calendar | LIVE |
| 119-HR-7148 | Consolidated Appropriations Act 2026 | Signed | BATCH |
| 119-HR-1 | Reconciliation Act (Public Law 119-21) | Signed | BATCH |
| 119-HR-5587 | HEATS Act (geothermal permits) | Passed House | DEMO |
| 119-HR-8469 | Military Construction FY2027 | House Calendar | DEMO |
| 119-HR-7567 | Farm, Food, and National Security Act | House Calendar | DEMO |

## scan_record.js — CR Quote Pipeline

Scans GovInfo Congressional Record packages for floor quotes, runs them through Qwen3.5 9B, saves to `data/quotes.json`.

```
node scripts/scan_record.js --days=30
node scripts/scan_record.js --reset   # clears processedDates AND quotes — use carefully
```

**How it works:**
1. For each date: checks Congress.gov for CR package ID, then GovInfo for granules
2. Filters granules by `granuleClass` (`HOUSE` or `SENATE`)
3. Skips procedural titles (PRAYER, PLEDGE, QUORUM, HONORING, etc.)
4. Fetches HTML text of first 8 granules per chamber, strips tags, tracks granule titles
5. Passes to Qwen: full text + granule section titles + bill reference list from cache.json
6. Qwen extracts verbatim quotes with `billId`, `granuleTitle`, and `stance`
7. Resolved against local reps-index for bioguideId + party; `billTitle` auto-filled from cache
8. Saves to `data/quotes.json` with `processedDates` tracking

**Qwen settings that matter:** `max_tokens: 10000`, no `enable_thinking` flag. Known limit: very large sessions (50k+ words) may return 0 quotes.

## generate_reps.js — Bill Attribution Pipeline

For quotes with null `billId`, scores each bill in cache.json by keyword overlap and assigns if score ≥ 6 with ≥ 2 distinct keyword matches.

- Bill title keywords weighted 4×, summary 2×, sections 1×
- `granuleTitle` and `source` fields passed through from quotes.json to rep comment profiles

## Rep Page Notes

- Portrait URL constructed in `rep.js` from `bioguideId` — `portraitUrl` field is NOT present in rep JSON files
- Party chip classes: `chip-d` (blue), `chip-r` (red), `chip-i` (green), `chip-n` (neutral)
- Comment card title: uses `billTitle` → `formatBillId(billId)` → chamber fallback
- `formatBillId()` converts `119-HR-1234` → `H.R. 1234`, `119-HCONRES-40` → `H.Con.Res. 40`, etc.
