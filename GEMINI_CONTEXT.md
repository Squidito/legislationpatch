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

## Current State of the Codebase

### What Works and Is Deployed
- Full desktop and mobile responsive layout
- Bill cards with two-level expansion (minor → full)
- Favorites/saved view (star icon in header) — localStorage only, no accounts
- Rep detail pages (`rep.html`) with star tracking
- Shock quotes section as infinite auto-scroll carousel with drag-to-pilot
- Dark mode with full variable system + moon icon toggle
- Plus Jakarta Sans font sitewide
- All pages (index, rep, privacy, terms) have consistent header with logo → home navigation
- Footer: "Data directly sourced *only* from the Congress.gov API" — no Anthropic credit (we use local LLM)

### What's In Progress
- Batch processor is functional but has been tested on only a few bills
- The `--bill` flag (`node scripts/batch_processor.js --bill 119-HR-8071`) is the primary testing tool
- Rep profile generation via `scripts/generate_reps.js` exists but hasn't been fully tested

### Known Deferred Items
- Second-pass LLM verification for `underreported` sections (was explicitly deferred — do not implement without James confirming)
- More bill profiles via batch runs

---

## Files You Should Know About

```
index.html          Main app page
styles.css          All styles — CSS custom properties, dark mode at bottom
app.js              All UI logic, rendering, state management
api.js              Reads data/cache.json ONLY — simplified, no live fetching
rep.html            Rep detail page
rep.js              Rep page logic (tracking, theme, profile render)
privacy.html        Privacy policy
terms.html          Terms of service
data/cache.json     The bill database — written by batch processor
data/reps/          Rep profile JSON files — one per bioguideId
scripts/batch_processor.js   The overnight batch pipeline
scripts/prompts.js           LLM prompts for map and reduce phases
scripts/generate_reps.js     Generates rep JSON files
.env                CONGRESS_API_KEY + CONGRESS_SESSION=119 (gitignored)
```

---

## localStorage Keys (Do Not Change These)

```
lpTrackedReps     Array of tracked rep objects {id, name, party, state, source}
lpWatchedBills    Array of watched bill IDs (starred bills)
lpTheme           'dark' or 'light'
lpTrackedState    2-letter state code for the rep tracker
```

These keys are shared between `index.html` (app.js) and `rep.html` (rep.js). If you change them, both files must be updated together.

---

## Data Source Rules — Strictly Enforced

The batch processor has a **verification gate** that hard-rejects bills if claims can't be traced to official sources. The three-zone rule:

- **Zone 1** (bill text + CRS summary only): summary, sections, top_lines, underreported, gaps, changes
- **Zone 2** (Congressional Record excerpts only): featured_quotes, criticisms, section comments
- **Zone 3** (reasoning allowed): likelihood, likelihoodLabel, likelihoodReason

Do not change this architecture. It is intentional and non-negotiable — the project's credibility depends on it.

---

## What Gemini Did Previously (April 2026 Session)

**Good work that was kept:**
- SEO meta tags, Open Graph, Twitter cards, Schema.org in index.html
- `rep.html` and `rep.js` — rep detail page (navigated to from portrait clicks)
- `privacy.html`, `terms.html` — legal pages
- `robots.txt`, `sitemap.xml`
- `data/reps/` — static rep profile JSON files
- `scripts/generate_reps.js`
- `package.json` with dotenv dependency

**Work that was reverted or fixed:**
- Gemini removed all live API fetching from `api.js` — this was actually correct for our architecture
- Gemini removed `fetchStateReps` and the Anthropic AI button — both correct
- Gemini changed rep portrait clicks from tracking to navigation — kept (James confirmed this)
- Gemini generated one test bill with wrong ID format (`id: "22"`) — removed
- Gemini's `batch_processor.js` had schema mismatches — completely rewritten by Claude
- Terms/privacy pages had Anthropic credit — updated to reflect local LLM

---

## Bill Schema — Exact Format Required

When adding or modifying bills in `data/cache.json`, every bill must have these fields:

```json
{
  "id": "119-HR-6955",           ← Congress-Type-Number format
  "title": "...",
  "code": "HR.6955",             ← Type.Number format with dot
  "stage": "house",              ← introduced|committee|house|senate|signed
  "stageLabel": "Passed House",
  "date": "Apr 20, 2026",        ← Human-readable, not ISO
  "sponsor": "Rep. Full Name (P-ST)",
  "sponsor_bioguide": "H001072",
  "sponsors": [...],
  "cosponsors": 0,
  "pages": 1,
  "version": "v1.0",
  "pipeline": ["Introduced","Committee","Passed House","Passed Senate","Signed"],
  "currentStep": 2,              ← 0-4 index into pipeline
  "likelihood": 55,              ← 1-99, derived from model number
  "likelihoodLabel": "Possible", ← Enacted|Likely|Possible|Unlikely|Long shot
  "likelihoodReason": "...",
  "analyzed": true,
  "live": false,                 ← Only manually set live bills show LIVE badge
  "demo": false,
  "summary": "...",
  "brief": "...",
  "top_lines": ["...","...","..."],
  "sections": [...],
  "underreported": [...],
  "criticisms": [...],
  "gaps": [...],
  "featured_quotes": [...],
  "changes": {"added":[],"modified":[],"removed":[]}
}
```

---

## Rep Profile Schema

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
    {
      "billId": "119-HR-6955",
      "billTitle": "Main Street Capital Access Act",
      "stance": "support",
      "text": "...",
      "date": "Apr 20, 2026"
    }
  ]
}
```

Rep JSON files live in `data/reps/{bioguideId}.json`. If a rep appears in the bill strip but has no JSON file, clicking their portrait shows a graceful "profile not yet available" message in `rep.html`.

---

## Things NOT To Do

- Do not add live API calls to `api.js` or `app.js`
- Do not add the Anthropic Claude credit back to any footer — we use a local LLM
- Do not change localStorage key names without updating both `app.js` and `rep.js`
- Do not implement the second-pass LLM verification for underreported sections without James confirming
- Do not commit `config.js` or `.env` — both are gitignored for a reason
- Do not change `likelihoodLabel` to be model-generated — it is always derived from the numeric `likelihood` in `batch_processor.js`
- Do not remove the verification gate or lower its strictness
- Do not break the `--bill` flag in `batch_processor.js` — it is the primary testing tool

---

## Design Language

- **Font:** Plus Jakarta Sans — warm geometric, Discord/Duolingo-adjacent feel
- **Mono:** DM Mono — all metadata, codes, percentages, section labels
- **Color accent:** `--purple: #6d4fc7` (active states, tracking, favorites)
- **Warning/amber:** `--amber` for underreported, star buttons when active
- **Footer emphasis:** `#E8855A` — warm orange for the word "only" in the data source line
- The design is intentionally dense-but-readable, information-first, nonpartisan

---

## Branching History

- `main` — production, deployed to Netlify
- `gemini-3.1-seo-and-compliance` — the April 2026 Gemini session branch, now merged to main

All current work is on `main`.
