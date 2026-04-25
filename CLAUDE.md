# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

LegislationPatch is a static single-page web app that fetches U.S. federal bills from the Congress.gov API and uses Claude to generate plain-English "patch notes" (styled like video game update notes) — summaries, opposition arguments, and legislative gaps. Users can filter by bill stage and see passage likelihood estimates.

**Bill filtering rule:** Only show bills that have passed at least one stage (committee action, floor vote, etc.). Bills that are introduced and immediately dead are excluded. Stage must be beyond "introduced" with no further action.

## Tech Stack

Vanilla JS / HTML / CSS — no framework, no build tools, no backend. Deployed by dragging the folder to Netlify, or opened locally via `index.html`. No npm, no compilation.

## File Responsibilities

| File | Role |
|---|---|
| `config.js` | API keys + constants (`CONGRESS_API_KEY`, `ANTHROPIC_API_KEY`, `BILLS_PER_PAGE`, `CONGRESS_SESSION`) — gitignored |
| `api.js` | All network calls (Congress.gov + Anthropic), stage detection, likelihood estimation |
| `app.js` | All UI state, rendering, event handling |
| `index.html` | Page structure — loads scripts in order: config → api → app |
| `styles.css` | All styles via CSS custom properties |

## Non-Obvious Architecture

- **Full re-renders on every state change** — `renderAll()` regenerates the entire bill list HTML on every toggle, filter, or AI result. No virtual DOM.
- **Stage detection is heuristic** — `detectStage()` walks action history newest-first and matches keywords (`"signed by president"`, `"passed senate"`, etc.). Not based on a structured field.
- **Likelihood is a formula, not ML** — base % by stage (introduced=12% → signed=100%) plus flat bonuses for co-sponsor count thresholds.
- **Claude must return raw JSON** — system prompt says "You MUST respond with valid JSON only. No markdown, no extra text." Response strips ``` fences before `JSON.parse()`.
- **Demo mode** — `getDemoBills()` returns 3 hard-coded bills (Infrastructure, Drug Pricing, NDAA) when no API keys are set, so the UI is testable without credentials.
- **API keys in browser** — intentional trade-off for zero-backend simplicity. `config.js` is in `.gitignore`. Never commit it.

## Claude API Schema

`analyzeBill()` expects this exact structure back from Claude:

```json
{
  "sections": [{ "label": "string", "items": [{ "main": "string", "detail": "string", "comments": [{ "party": "d|r|n", "text": "string" }] }] }],
  "underreported": [{ "section": "string", "summary": "string", "why_unreported": "string" }],
  "criticisms": [{ "who": "string", "why": "string" }],
  "gaps": ["string"],
  "likelihoodLabel": "Enacted|Likely|Possible|Unlikely|Long shot",
  "likelihoodReason": "string"
}
```

## New features

- Added an **Underreported** AI analysis field and UI section. Claude now returns a top-level `underreported` array of 2-4 items for provisions likely to be missed by mainstream reporting, hidden riders, or highly technical language with outsized impact.
- Added a **tracked representative** settings panel. Users can select a state, fetch current members from the Congress.gov API, check reps to track, and add reps manually by name or `bioguideId`.
- Added a **Congressional Positions** section for each bill card. It displays sponsors, co-sponsors, and vote-based positions from fetched bill detail/action data; tracked reps are highlighted.

## Setup Checklist

Before the app shows live bills, `config.js` needs two keys. This file is gitignored — never commit it.

```js
const CONFIG = {
  CONGRESS_API_KEY: 'your-key-here',   // free at api.congress.gov/sign-up
  ANTHROPIC_API_KEY: 'your-key-here',  // only needed for live AI analysis
  BILLS_PER_PAGE: 20,
  CONGRESS_SESSION: 119,
};
```

**Without keys:** app loads from `data/cache.json` (pre-analyzed bills). Works fully offline.
**With Congress key only:** fetches live bills, merges with cache for any pre-analyzed matches. Rep portrait tracker also works.
**With both keys:** full live fetch + on-demand AI analysis via "Analyze with AI" button.

> **Reminder:** After any batch processing session where you add new bills to `data/cache.json`, make sure `config.js` has the Congress.gov API key so the live fetch + cache merge works on next load.

## How to Run

- **Local**: Open `index.html` in a browser. Congress.gov API may fail due to CORS — use Netlify for reliable access.
- **Netlify**: Drag the folder to the Netlify dashboard. No build step.

## Congress.gov API

Endpoints used (all GET, append `?api_key={CONGRESS_API_KEY}`):
- `/v3/bill/{session}?sort=updateDate+desc&limit={n}` — recent bills list
- `/v3/bill/{congress}/{type}/{number}` — bill detail
- `/v3/bill/{congress}/{type}/{number}/actions?limit=10` — action history
- `/v3/bill/{congress}/{type}/{number}/summaries` — CRS summary
- `/v3/member?state={stateCode}&currentMember=true` — current members for a state, used by the tracked rep settings panel

Parallel fetches capped at 8 to respect rate limits.
