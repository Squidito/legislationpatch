# Scripts Reference

Full pipeline/script reference, moved out of CLAUDE.md (2026-07-06).

## Scripts

**npm aliases** (preferred): `npm run add-bills` · `npm run batch` · `batch:post` · `batch:fetch` · `validate` · `qa-verify` · `facts` · `parity` · `sitemap` · `reps` · `refresh` (and `npm test` = validate).

> **Pre-commit hook:** `.git/hooks/pre-commit` runs `npm run validate` and blocks the commit on ERRORS only (warnings pass). Per-clone (not version-controlled). Bypass with `git commit --no-verify`. A commented-out `npm run parity` line in the hook can be enabled to also block on web↔mobile drift.

> **Cross-platform parity (`npm run parity`):** `scripts/check-parity.js` checks `util.js` against `shared/parity-fixtures.json`; the mobile repo has a matching `npm run parity` (`lib/checkParity.js`) that checks `lib/format.ts` against the SAME fixture. These guard the hand-ported pure functions (`formatDateCompact`, `sponsorShort`) against the drift that caused past date-ordering bugs — change one side, update both + the fixture.

The canonical **pipeline** is `run-batch.js` → `fetch_bills_data` + `fetch_cr_data` → (manual analysis pause) → `fetch_vote_data` + `generate_reps` + `fetch_versions` + `fetch_bill_cr --all` + `backfill_quote_chamber` + `generate_sitemap` + `validate-batch`. One-off, single-bill scaffolding (the old HR-7148 omnibus scripts) lives in `scripts/archive/`.

> **`batch_processor.js` is legacy** — its auto-analysis CLI is superseded by in-conversation analysis, but it is **not dead**: `fetch_bill_cr.js` and `fetch_bill_text.js` import shared fetch helpers from it. Don't delete; the cleanup task is to extract those helpers to `scripts/lib/` first.

| Command | What it does |
|---|---|
| `node scripts/run-batch.js` (`npm run batch`) | **Full pipeline** — fetch + pause for analysis + post-analysis steps |
| `node scripts/run-batch.js --post` (`npm run batch:post`) | Post-analysis only — votes, reps, sitemap, validate |
| `node scripts/run-batch.js --fetch-only` | Fetch raw data only, stop before post-analysis |
| `node scripts/run-batch.js --days=N` | Override CR lookback window (default 7) |
| `node scripts/validate-batch.js` (`npm run validate`) | Pre-push validation — fields, formatting, ISO dates, figure-sourcing guard, acronym audit, sitemap |
| `node scripts/validate-batch.js --strict` | Same, but warnings also block (exit 1) — the "perfect pass" bar for the QA loop |
| `node scripts/qa-source-verify.js [--bill ID] [--quote]` | QA-loop source-anchored verifier — ties every figure/%/year/section cite in the analysis to a **quoted source line** (bill text + referencedSources). `--quote` prints the evidence line per claim. Stateless (never reads a prior run); see the QA Loop Protocol's GENUINE-READ RULE in CLAUDE.md (kept inline there as a hard rule) |
| `node scripts/fetch_bills_data.js --bill 119-HR-7148` | Force-refetch one bill into bills_raw.json (bypasses cache check — use to re-run through updated pipeline) |
| `node scripts/fetch_bill_cr.js --bill 119-HR-2319` | Retroactively fetch CR quotes for one bill |
| `node scripts/fetch_bill_cr.js --all` | Fetch CR quotes for all analyzed bills missing them |
| `node scripts/fetch-reference.js --bill 119-HR-1234` | Fetch a referenced bill/law text → `data/ref-text/` + prints `referencedSources` entry (cross-bill sourcing) |
| `node scripts/fetch-reference.js --usc "50:1881a"` | Fetch a referenced U.S. Code section (GovInfo USCODE) for cross-source verification |
| `node scripts/bill-facts.js --bill 119-HR-1 [--sums] [--full]` (`npm run facts`) | **Pre-analysis facts sheet** — every figure/%/deadline/date/heading with line numbers; `--sums` adds per-section dollar sums (caps + rescissions excluded, "of which" double-count warnings). Figures in analyses are copied from here, never from memory |
| `node scripts/refresh_stages.js [--apply] [--bill ID]` (`npm run refresh`) | **Re-check cached non-final bills for progress.** Resurfaces any with new activity (bumps `stageDate` → moves to top of the recency sort) and advances stage on Congress.gov's canonical "Passed/agreed to in [Chamber]" markers (signed / passed-both / passed-one / died). Prints a RE-REVIEW list for any bill whose stage changed (prose is never auto-edited). Runs automatically in `run-batch --post`. Dry-run by default; `--apply` writes |
| `node scripts/fetch_vote_data.js` | Fetch roll call votes for all cached bills; warns on confident stage mismatches (enacted / failed-on-floor) |
| `node scripts/fetch_vote_data.js --bill 119-HR-227` | Fetch votes for one bill |
| `node scripts/fetch_vote_data.js --bill <id> --apply-stage` | Also correct stage/stageLabel/currentStep on a confident mismatch (likelihood prose still needs human re-review) |
| `node scripts/fetch_versions.js [--apply] [--bill=ID]` | Record every text version (Introduced→…→Enrolled) into `bill.versions[]` for the Version Timeline. Metadata only (no text download). Dry-run by default; runs in `--post`. |
| `node scripts/backfill_quote_chamber.js [--apply]` | Add a structured `chamber` ("House"/"Senate") to every quote in cache.json `featured_quotes` (+ omnibus `divisions[].featured_quotes`) and quotes.json, resolved from `bioguideId` → reps-index role (fallbacks: name prefix, source prefix). Dry-run by default. **Re-run after adding new bills/quotes** so `quoteTagline()` can show the chamber. Idempotent. |
| `node scripts/fetch_wiki_bios.js` | Fetch Wikipedia bios for all existing rep files |
| `node scripts/generate_reps.js` | Update rep profiles + rebuild index |
| `node scripts/generate_reps.js --all` | Full 119th Congress rebuild (~6 min) |
| `node scripts/generate_bill_pages.js` (`npm run pages`) | **Static SEO pages per bill** — `bill/<slug>/index.html` for every cached bill (unique title/desc/canonical, JSON-LD, JS-off body), slug map + history redirect stubs (`data/slug-map.json` / `slug-index.json`), per-bill JSON split (`data/bills/<id>.json`), crawlable homepage bill index. Runs in `run-batch --post` before the sitemap |
| `node scripts/generate_rep_pages.js` (`npm run rep-pages`) | **Static SEO pages per member** — `rep/<bioguide>-<name>/index.html` ×551 (unique title/desc/canonical, ProfilePage+Breadcrumb JSON-LD, JS-off profile w/ crawlable `/bill/<slug>/` cross-links, district composition block from `data/district-geography.json` when present), rep slug map/index, crawlable member directory injected into reps.html. `rep.html` is the matching noindex `?id=` redirector. Runs in `run-batch --post` after bill pages / before the sitemap |
| `node scripts/fetch-district-geography.js [--force] [--verbose]` (`npm run geo`) | **Download the Census CD119 relationship files** (county + place + state-FIPS + PEP place populations) into `data/geo-src/` (committed raw as provenance) and derive `data/district-geography.json` — county/place composition per district with whole/partial flags (AREALAND_PART equality) and population ranking (2020 estimates base; CDPs/PR/territories have no PEP rows → `pop: null`, area-ranked fallback labeled per district). Header schemas asserted byte-for-byte. Run manually/rarely — refetch with CD120 files when the 120th Congress seats (spec: `_personal/CENSUS-GEOGRAPHY-SPEC.md`) |
| `node scripts/qa-geo-verify.js [--verbose]` (`npm run qa-geo`) | **Sourcing guard for rep-page district blocks** (figure-sourcing-guard pattern): re-derives every county/place name + whole/partial flag from the RAW files in `data/geo-src/` (not the derived JSON) and checks each page's marked spans, sentence structure ("all of"/"part of"/"including" positional), vintage line, and senator-block absence. Runs inside `preflight.js` |
| `node scripts/preflight.js [--verbose]` | Structural checks across every rendered HTML page: JSON-LD, smart quotes, entity @ids, bylines, theme, internal links, trust links, canonical/title, **title uniqueness, meta descriptions, sitemap↔disk both directions, district-geography sourcing (qa-geo-verify)** |
| `node scripts/verify-production.js [--all] [--per-group N]` (`npm run verify-prod`) | **Post-deploy check of the LIVE site vs origin/main**: robots.txt, live sitemap matches deployed sitemap, sampled pages (every path group) serve 200 with matching title/canonical/description, no redirect, no noindex. Run after any push to main; retries transient 5xx; failures right after a push may be Cloudflare cache lag (~4h) |

Env vars needed: `CONGRESS_API_KEY`, `GOVINFO_API_KEY`, `CONGRESS_SESSION=119`


Also: `node scripts/add-bills.js <file.json> [--force] [--dry-run]` (npm run add-bills) — merge analyzed bill entries from a JSON data file into cache.json. Replaces the retired one-off _add-*.js pattern; see SCRIPT-CONVENTIONS.md.
