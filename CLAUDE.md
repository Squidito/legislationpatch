# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## What This Project Does

LegislationPatch is a static single-page web app that explains U.S. federal bills in plain English, styled like video game patch notes. Bills are analyzed offline via a local batch processor and pushed to the site as static JSON. The site reads only from `data/cache.json` — no live API calls happen in the browser.

**Bill filtering rule:** Only bills with real legislative progress are shown. Bills that are introduced and immediately dead, technical corrections, post office naming bills, sense-of-Congress resolutions, and commemorative recognitions are filtered at fetch time in the batch processor.

## Architecture: Batch-First, Static Site

```
Local machine (overnight batch run):
  scripts/batch_processor.js
    → Congress.gov API  (bill text, metadata, CRS summary, Congressional Record)
    → LM Studio / Qwen3 (local LLM — map phase per chunk, reduce phase for JSON)
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
- **Targeted test:** `node scripts/batch_processor.js --bill 119-HR-8071`

## File Responsibilities

| File | Role |
|---|---|
| `config.js` | API keys + constants — **gitignored, never commit** |
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
| `.env` | `CONGRESS_API_KEY` + `CONGRESS_SESSION=119` — gitignored |
| `scripts/batch_processor.js` | Full overnight batch pipeline |
| `scripts/prompts.js` | LLM prompts: SYSTEM_PROMPT + CHUNK_MAP_PROMPT |
| `scripts/generate_reps.js` | Generates/updates `data/reps/` static files |
| `.github/workflows/deploy.yml` | Auto-deploys to Netlify on push to main |

## Batch Processor Pipeline

```
node scripts/batch_processor.js
```

1. Fetch 10 recent bills from Congress.gov (`/v3/bill/119?sort=updateDate+desc`)
2. Filter out: DOA actions, technical corrections, naming bills, sense resolutions, commemoratives
3. For each eligible bill (up to 2 per run):
   - Fetch full bill text, metadata (sponsors/latestAction/cosponsors), CRS summary
   - Fetch Congressional Record for the action date (source for quotes/criticisms)
   - **Map phase:** chunk bill text → LLM extracts facts per chunk (bullet points only, no inference)
   - **Reduce phase:** LLM synthesizes final JSON from notes + CRS + Record context
   - **Verification gate:** hard-rejects bill if any claim is unverified (see below)
4. Saves to `data/cache.json` — commit and push to deploy

**LM Studio settings that matter:** port 1235, context 12288, GPU offload 32, CPU threads 6, Flash Attention ON, thinking mode OFF.

**Three-zone source discipline:**
- Zone 1 (bill text + CRS only): summary, sections, top_lines, underreported, gaps, changes
- Zone 2 (Congressional Record only): featured_quotes, criticisms, section comments
- Zone 3 (reasoning allowed): likelihood, likelihoodLabel, likelihoodReason

**Verification gate — every failure hard-rejects the bill:**
- Zone 2 with no Congressional Record → rejected
- Speaker name not found in Record excerpts → rejected
- Dollar amount not in bill text or CRS → rejected
- Percentage not in source → rejected
- Section number reference not in source → rejected
- Named program/agency not in source → rejected
- Underreported section keywords not in bill text → rejected

## Bill Card Architecture

Cards use a **4-column CSS grid**: `48px 48px 1fr 40px` (mobile: `36px 40px 1fr 34px`)
- Col 1: rank badge + LIVE/DEMO pill
- Col 2: sponsor portrait (42px circle)
- Col 3: title block (meta + title + summary + sponsor meta)
- Col 4: star button (SVG star polygon — fills amber when watched)

**Likelihood footer** uses the same grid:
- Cols 1-2 spanned: mini stage pipeline dots
- Col 3: passage likelihood bar + value (label derived from number in processor, not model)
- Col 4: CSS chevron (outline in dark mode uses var(--text))

**Two-level card expansion** (managed via `openCards` Map):
- `undefined` → collapsed
- `'minor'` → likelihood detail + top-lines + underreported teaser + quote carousel + "Full analysis" button
- `'full'` → full patch notes, what-changed, criticisms, gaps

## Key UI Features

**Favorites view** — star icon in header:
- Tracked reps: portrait, name, bill activity, featured quote
- Starred bills: full interactive cards
- All localStorage, no account: `lpTrackedReps`, `lpWatchedBills`, `lpTheme`, `lpTrackedState`
- Untracking a rep from favorites view works via × button

**Rep pages** (`rep.html?id={bioguideId}`):
- Star button inline with rep name → writes to `lpTrackedReps` (same key as main site)
- Comments: their quotes from bills, sorted newest first, with SUPPORT/OPPOSE badges
- Theme reads `lpTheme` key (same as main site — dark mode persists across pages)
- Missing profile → graceful "not yet available" message, not a hard error

**Shock quotes carousel** ("From the Floor This Week"):
- Auto-scrolls at 0.4px/frame, wraps infinitely via card cloning
- Pauses on hover; grab-to-drag while hovered
- Dual gradient fade left+right via mask-image

**Logo:** Clicking the logo block always returns to home on all pages.
- `index.html`: calls `goHome()` — closes favorites view or scrolls to top
- All other pages: `<a href="index.html">`

## Color System

| Purpose | Color |
|---|---|
| Accent / active states | `--purple: #6d4fc7` |
| Likelihood Likely (≥65%) | `--green` / `--green-text` |
| Likelihood Possible (≥45%) | `--purple` / `--purple-text` |
| Likelihood Unlikely (<45%) | `--text-3` / `--text-2` (adapts dark mode) |
| Underreported / warning | `--amber: #a87d24` |
| Footer "only" emphasis | `#E8855A` (warm orange, slightly brighter than Claude's brand) |

## Dark Mode

Toggle via `[data-theme="dark"]` on `<html>`. Key: `lpTheme`.
Crescent moon SVG left of toggle track — `--text-3` at rest, `--purple` when active.

## Cache Schema (per bill)

```json
{
  "id": "119-HR-6955",
  "title": "...",
  "code": "HR.6955",
  "stage": "house",
  "stageLabel": "Passed House",
  "date": "Apr 20, 2026",
  "sponsor": "Rep. Hill, J. French (R-AR)",
  "sponsor_bioguide": "H001072",
  "sponsors": [...],
  "cosponsors": 33,
  "pages": 47,
  "version": "v1.0",
  "pipeline": ["Introduced","Committee","Passed House","Passed Senate","Signed"],
  "currentStep": 2,
  "likelihood": 55,
  "likelihoodLabel": "Possible",
  "likelihoodReason": "...",
  "analyzed": true,
  "live": true,
  "demo": false,
  "summary": "...",
  "brief": "...",
  "top_lines": ["..."],
  "sections": [{"label":"...","items":[{"main":"...","detail":"...","comments":[]}]}],
  "underreported": [{"section":"...","summary":"...","why_unreported":"..."}],
  "criticisms": [{"who":"...","why":"..."}],
  "gaps": ["..."],
  "featured_quotes": [{"name":"...","party":"D","state":"MA","bioguideId":"W000817","text":"...","stance":"oppose"}],
  "changes": {"added":[],"modified":[],"removed":[]}
}
```

## Rep Profile Schema (`data/reps/{bioguideId}.json`)

```json
{
  "bioguideId": "H001072",
  "name": "Rep. J. French Hill",
  "party": "R",
  "state": "AR",
  "role": "Member of Congress",
  "portraitUrl": "https://www.congress.gov/img/member/h001072_200.jpg",
  "bio": "...",
  "comments": [
    {"billId":"119-HR-6955","billTitle":"...","stance":"support","text":"...","date":"Apr 20, 2026"}
  ]
}
```

## Next Session Focus

- Run the batch processor for more real bills (use `--bill` flag to test specific ones)
- Second-pass LLM verification for underreported sections (deferred — revisit after quality assessment)
- Rep profile generation via `scripts/generate_reps.js` needs testing
- Favorites view: consider adding a "last seen" or activity indicator on tracked rep cards
