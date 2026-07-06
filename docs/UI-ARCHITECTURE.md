# UI Architecture — LegislationPatch

Detailed UI/layout reference, moved out of CLAUDE.md (2026-07-06). Read when working on the pages/components below.

## Logo / Dark Mode

Logo swap handled by `updateLogoForTheme(isDark)` in `app.js` and `rep.js`. Static pages (bill-pending, privacy, terms) have it inline in their `apply(dark)` function.

**Dark is the DEFAULT theme (2026-06-11).** Every page has an inline "before paint" script right after `<body>` that sets `data-theme="dark"` unless `localStorage.lpTheme === 'light'` — this prevents a light-flash on load. The per-page JS init (`app.js`/`floor.js`/`rep.js`/`reps.js`; `bill.js` just reads the attribute) syncs the toggle checkbox + logo using `lpTheme !== 'light'`. An explicit light choice is stored and respected on every page; absence of a saved preference = dark. (Site still ignores OS `prefers-color-scheme`.)

## Header Structure (all pages)

All pages share the same three-layer header structure:

```
<header.site-header>
  <div.header-inner>          ← max-width 960px, flex, space-between
    <a.logo-block>            ← left: logo.svg
    <div.header-cta>          ← right: "Take it with you" label + .header-cta__badges wrapper + App Store + Google Play
<div.trust-bar>               ← centered strip: shield icon + "Data sourced direct from Congress.gov" (floor page: "Direct from the Congressional Record")
<div.controls-bar>            ← sticky nav bar (all pages)
  <nav.site-nav>              ← pill group: Home | Bills | Reps | Floor Quotes (active page gets nav-link--active)
                                 On mobile (≤640px): "Floor Quotes" shortens to "Floor" via <span class="nav-hide-mobile"> Quotes</span>
                                 site-nav gets flex:1 on mobile so all 4 tabs distribute evenly across available width
  <div.header-track>          ← right side: zip-display (index/reps only), fav star, theme toggle
```

**Controls bar by page:**
- `index.html`: Home active; zip-display + fav + theme on right
- `bills.html`: Bills active; fav + theme on right (`window.BILLS_PAGE = true` set inline before scripts)
- `reps.html`: Reps active; zip-display + fav + theme on right
- `floor.html`: Floor Quotes active; fav + theme on right (no zip)
- `rep.html`: back button (`#backBtn`) left, site-nav center, fav + theme right

**Below controls bar on index.html only:** `.controls-rep-row` (rep strip carousel) — static, scrolls with page, no longer sticky/collapsible.

Mobile (≤640px): `.zip-display` is hidden.

## Rep Portraits

Portrait URL logic: `portraitUrl(bioguideId)` in `app.js` checks `PHOTO_OVERRIDES` first, then falls back to `bioguide.congress.gov/bioguide/photo/X/BIOGUIDE.jpg`. `rep.js` checks `rep.photo` first, then constructs the bioguide URL.

**Adding a photo override** (when a rep's bioguide photo is missing/broken):
1. Add `"photo": "https://clerk.house.gov/images/members/BIOGUIDE.jpg"` to `data/reps/BIOGUIDE.json` — survives `generate_reps.js` regeneration (API doesn't return this field, so `mergeWithExisting` preserves it).
2. Add the bioguide ID → clerk URL to `PHOTO_OVERRIDES` in `app.js` (covers rep strip + tracked reps panel).

**Known overrides:** `C001115` (Michael Cloud) — bioguide photo missing, served from `clerk.house.gov`.

## Card Status Badges & Frames

Two status markers, separate from `billType`:
- **OMNIBUS** — `.status-omnibus` (amber), shown for `bill.isOmnibus` in the left rank column; card gets the gold frame `.bill-card--omnibus`.
- **ENACTED** — `.status-enacted` (green), shown by `isEnacted(bill)` (just `stage === 'signed'` — **permanent, no time window**), top-right above the star in `.bill-actions-col`, only when `!isOmnibus`; card gets the green frame `.bill-card--enacted`.
- **Omnibus takes precedence over enacted** for both the frame and the right-side badge.
- Tags carrying a `data-tip` (type chips, OMNIBUS, ENACTED) show the plain-English hover tooltip; `.status-badge[data-tip] { cursor: help }`.
- History: this badge was "JUST PASSED" (30-day window via the old `isJustPassed`) → "PASSED" → now **"ENACTED"**; `isEnacted()` and `.status-enacted` / `.bill-card--enacted` are the current names.

## Section breakdown — numbered spine (`renderSections`)

The per-section breakdown ("patch notes") renders as a numbered **spine**: each section is a node with a mono marker (`§N` / roman `Title` / `Division` letter, dot fallback for odd labels) on a continuous vertical rail. `renderSections(bill)` wraps `renderSection` rows; helpers `secMarker()` / `secTitle()` derive the chip + strip the "Section N — " prefix. Boilerplate sections flagged `admin:true` (Short Title, Table of Contents, Definitions, Findings, Sense of Congress, Severability, Effective Date, Rule of Construction, etc.) collapse into one folded "Administrative provisions" node at the top of the spine. Every section of a bill should have an entry (admin ones carry a short flavor/admin note); grouped entries ("Sections 8-10") are split per-section. CSS: `.patch-spine` / `.ps-row` / `.ps-rail` / `.ps-num` / `.ps-admin-strip` block in styles.css. **Omnibus divisions** (`renderDivision`) render their `divisions[N].sections[]` through the same `renderSections` spine (the old dotted `top_lines` overview is suppressed when sections exist, to avoid duplicating the same per-title content).

## Congressional Positions Section (bill card)

Single `.positions-section` container holds both vote data and sponsor:
- Vote rows first (more prominent) — collapsed tally with pass bar; "Show votes" lazily fetches `data/votes/{billId}.json`
- Pass bar: green/red bar showing Yea vs Nay proportion with a threshold line (50% default, 60% cloture, 67% two-thirds)
- "SPONSOR" divider, then sponsor row(s) below
- Crossovers featured at top of expanded detail (amber section) — only on close votes (≤30% margin)
- Full member chip grid: Yea / Nay / Not Voting groups with party color badges
- Member names: state stripped from name string before re-appending from `m.state` field (clerk XML sometimes embeds state in name)
- Senate XML has no `bio_id` — senators matched by lastName+state via `SENATOR_LOOKUP` built from reps-index.json

## Rep Profile Page (rep.html / rep.js)

**Profile card layout:** 3-column grid — portrait | name/info | 2×2 stat panel (Chamber, Party, State, District). Party-colored left border gradient, eyebrow, portrait ring, and stat labels. Dark mode uses lighter party colors (#93bfff blue, #fca5a5 red).

**Vote profile bar:** "ON THE RECORD" section shows tracked vote count with green/red segmented bar (Yea/Nay/NV breakdown).

**Biography:** Sourced from Wikipedia REST API (NPOV intro paragraph). Stored as `bio`, `bioSource: 'wikipedia'`, `bioUrl` in rep JSON. Only shown when `bio.length > 120`. `fetch_wiki_bios.js` populates all 552 rep files. `generate_reps.js` fetches bios for new reps automatically. `mergeWithExisting` preserves Wikipedia bios across rebuilds.

**Section labels:** Biography → purple (`var(--purple)`), Floor Statements → orange (`#c75c0e` / `#fb923c` dark), Voting Record → purple.

**Pagination:**
- Floor Statements: 3 shown by default, "Show N more (N remaining)" in steps of 10. "Show less" collapses back.
- Voting Record: 8 shown by default, steps of 15.
- Shared helper: `renderShowMoreBtn()` + `showMoreRep()` in `rep.js`.

**Favorites link:** `/?fav=1` (not `index.html?fav=1` — `serve` and some hosts strip query strings on .html redirects).

## Navigation — URL-param back system

Cross-entity navigation (bills ↔ reps ↔ comments) uses URL query params to pass one level of "previous context":

**Bill quote card → rep page:**
`rep?id=BIOGUIDE&ref=bill-{billId}&billTitle={encoded}`
rep.js reads `ref` and `billTitle` in `init()` and updates `#backBtn` to "← [Bill Name]" linking back to `index.html?scrollTo={billId}`.

**Rep comment → bill:**
`index.html?fromRep={bioguideId}&repName={encoded}&scrollTo={billId}`
app.js reads these in `loadBills()` after render: calls `scrollToBill()` and shows `#repBackBanner` with "← Rep. Name".

**Fav shortcut from rep page:**
`index.html?fav=1` — app.js calls `toggleFavoritesView()` on load.

**All-reps library → rep page:**
`rep?id=BIOGUIDE&ref=reps`
rep.js reads `ref === 'reps'` and sets backBtn to "← Reps" → `reps.html`.

**General rep links** (strip, grid, tracked cards, saved quotes, shock carousel): always append `&ref=bills` so rep.js defaults the back button to "← Bills".

`scrollToBill(id)` already handles switching filter tabs and flash-highlighting the target card.

## Shock Quote Carousel

`.shock-quotes-grid` (overflow-x:clip, overflow-y:visible, position:relative). `.shock-quotes-track` (direct child) holds all cards and moves via JS-driven `transform: translateX()`.

- Speed: `SPEED = 0.125` px/frame (≈ 7.5px/sec at 60fps) in `setupCarousel()`
- Infinite scroll: prepend + append clone sets; wrap triggers when `currentX` exits the middle third
- Position saved across `renderAll()` via `DOMMatrix` read on the track's computed transform (`_carouselScroll = m.m41`)
- Event listeners attach to the grid; each `renderAll()` creates a fresh grid DOM node so old listeners are GC'd
- Quote text is top-aligned (`justify-content: flex-start` on `.shock-quote-text-link`)

**Hover-intent expansion (500ms delay):**
- Cards expand after 500ms dwell, not on instant hover — prevents jarring layout shifts when the mouse passes through en route to the bill list
- **Dwell indicator = corner brackets** (`.sq-corner` ×4, brand orange). Four L-shaped corners draw inward (`width/height` 0→16px) over the dwell — 0.5s on desktop hover, 1s on mobile `.sq-filling` — framing the card like a viewfinder. (Replaced the old `.sq-ring` circular fill, which read as the Claude-Code context meter / "vibe-coded".) The `.sq-ring` SVG element is kept but now holds only the close-✕ lines (`.sq-x-line`) — same click target / mobile expand-close mechanics as before; brackets hide once any card is `.sq-expanded`.
- **Gap hover-bridge:** the track gap is `0.65rem`; `.shock-quote-card::before`/`::after` are two `0.45rem` strips that sit ONLY in the gap (overlap 0.9rem > gap, no dead pixel) with `pointer-events:auto` on desktop hover. They keep `:has(:hover)` true while the mouse crosses between cards — otherwise the hover dropped, collapsing the row and re-arming the 500ms delay (the "stutter"). Strips live in the gap only, so links/acronym tooltips inside cards stay clickable. (The old single full-card `::before` had `pointer-events:none` and bridged nothing.)
- Collapse has an 80ms grace period (`transition-delay: 0.08s` on base `.shock-quote-text`) to prevent 1-frame flicker when moving between cards
- ALL cards in the track expand when any is hovered: `.shock-quotes-track:has(.shock-quote-card:hover) .shock-quote-text` — flexbox already stretched all to the tallest height; this keeps text in sync
- Bill title unwrap (`.shock-quote-bill` white-space/overflow) uses a `0.001s 0.5s forwards` CSS animation since those properties can't be transitioned

**Overlay expansion (cards expand over page content, not pushing it down):**
- `mouseenter`: lock `grid.style.height = offsetHeight`, release `will-change` (GPU compositor would clip overflow), add `.sq-expanding` class (fades out edge overlays), set `overflowX = 'visible'`. Before releasing overflow, measure each card's visible % against the grid rect — cards with < 25% visible get `visibility:hidden` so previously-hidden clones don't appear.
- `mouseleave`: restore `overflowX = ''` immediately (re-clips edge cards), remove `.sq-expanding` class (edge fade dissolves back in over 0.2s via CSS transition). After 350ms: restore `grid.style.height`, restore `will-change`.
- **Why `will-change` must be off during expansion:** `will-change:transform` promotes the track to a GPU compositor layer; that layer's paint bounds are clipped to the parent's box regardless of CSS `overflow-y:visible`. Releasing it on hover lets the track render in software where CSS overflow rules apply.
- **Why `mask-image` was replaced:** `mask-image` creates a bounded paint context that clips overflow content the same way. Replaced with `::before`/`::after` pseudo-elements (gradient bg, `z-index:1`, `opacity` transition) so the edge fade can cross-dissolve rather than snap. Class `.sq-expanding` sets `opacity:0` on both; removing the class lets CSS `transition: opacity 0.2s ease` handle the smooth restore.
- `.shock-quotes-section` has `position:relative; z-index:2` so expanded cards render above the bill list below.

## Bill Card UI Notes

- **ZIP edit:** Clicking `#zipDisplay` opens an inline `<input class="zip-edit-input">`. On Enter: validates 5 digits, saves to `localStorage`, fetches `api.zippopotam.us/us/{zip}` to resolve state code, updates `trackedState`, calls `saveTrackedSettings()` + `renderAll()`. Escape cancels. Hover shows underline + pointer. State always follows zip change.
- **Version number:** removed from bill card meta line display and "What changed" label — stored in data but not shown to users.
- **Metadata line:** `bill.code.replace('.', ' ')` formats "HR.2319" → "HR 2319" prepended to stage/date (no version)
- **Header grid:** 3 columns — `48px 1fr 40px` (rank col | title block | star). `align-items: stretch` so rank col fills the full row height.
- **Rank col (`.bill-rank-col`):** flex column, `align-items: center`. Contains status badges at top, then `.bill-portrait-wrap` (portrait centered via `margin: auto 0`). Badges render above portrait: OMNIBUS/DEMO take the top slot (the `live` flag was removed). ENACTED is **not** here — it renders in the right-side `.bill-actions-col` above the star. No bill number — removed.
- **Portrait:** `object-position: top` on all circular portraits sitewide so faces show correctly in circular crops.
- **Likelihood footer:** `display: flex` (was CSS grid). `.footer-stage-dots` is `flex-shrink: 0`; `.footer-likelihood-inner` has `flex: 1`.
- **Pipeline dots:** `.fp-line` is `width: 14px; flex-shrink: 0` (fixed width, no margin — lines connect flush to dots). Mobile (`≤640px`): dots shrink to 5px (6px active), lines to 8px.
- **Mobile bill summary:** no longer clamped on `≤640px` — shows full text.
- **Expansion states:** closed → minor → full. Clicking header from ANY open state collapses fully.
- **Full expansion layout order:** top-lines → what-changed → quote cards → patch notes → positions → underreported → criticisms → gaps
- **Changes section (`.what-changed-grid`):** stacks Added/Modified/Removed vertically (`flexDirection: column`). Uses CSS variable accent colors, no inline styles.
- **Patch notes container:** `.patch-notes` has surface background + purple left border, matching `.top-lines` style
- **Quote cards:** clamp 5 lines, expand to full on hover (`-webkit-line-clamp: 100`). Rep portrait/name links to rep page only when `bioguideId` is present. Neutral stance shows no badge.
- **Gaps section:** `.gaps-section` has amber card container matching `.underreported-section` style
- **Omnibus card:** `bill.isOmnibus` → adds `.bill-card--omnibus` class (amber border + glow) and renders the **OMNIBUS** badge. Patch notes suppressed on card expansion — only top-lines shown.

## Bill Filter Tabs (index.html and bills.html)

Stage filter tabs rendered inside `renderAll()` as part of `#billList` (not static HTML). Document-level click delegation on `[data-main]` so they survive re-renders.

| Tab | `data-main` | Shows |
|---|---|---|
| Recently Updated | `recent` | All bills, newest first |
| In the Pipeline | `pipeline` | `introduced`, `committee`, `house`, `senate` stages only |
| Passed | `passed` | `signed` stage only |
| Dead | `dead` | `dead` / `vetoed` stages only |

Default: `recent`. `scrollToBill()` switches to `recent` if the target bill isn't visible on the current tab.

## Bills Page (bills.html + bills.js)

Dedicated bills page with category chip filter + stage tabs.

**Category chips** (multi-select, `window.activeBillCategories` Set):
- All Topics, Defense & Foreign Policy, Immigration, Economy & Tax, Health & Benefits, Executive Power, Government & Oversight, Civil Rights & Justice
- Keyword matching via `window.getBillCategories(bill)` in `bills.js` — runs on title + summary + brief + changes.added
- Active chip gets category-colored border (blue=defense, red=immigration, amber=economy, green=health, purple=executive, teal=government, amber=civil)
- `window.billMatchesCategories(bill)` called in `app.js` `renderAll()` as a second filter pass

**app.js integration:** `bills.html` sets `window.BILLS_PAGE = true` inline before loading scripts. In `renderAll()`:
- Shock quote carousel suppressed (`window.BILLS_PAGE` guard)
- "Recent bills" section label suppressed
- Category filter applied via `window.billMatchesCategories`

**Do NOT load app.js on floor.html** — floor.js is self-contained. Loading app.js there causes `const` re-declaration conflicts (`FALLBACK_PORTRAIT`, `escHtml`).

## Bill Text Section Linking (bill.html)

Patch section titles and top-line headlines link to the corresponding section in the bill text (smooth scroll + purple flash).

**How it works:**
- `renderBtLine()` in `bill.js` assigns `id="bt-sec-N"` to section headers (`SECTION 1.`, `SEC. 2.`, `2. Title`) and `id="bt-title-I"` to TITLE headers
- `patchSectionAnchor(sec)` in `app.js` parses the section number from the label — handles `"Section 2 — ..."`, `"Sections 3–End — ..."`, `"Title I — ..."`. Falls back to `sec.billSection` for thematic labels
- `renderSection()` wraps the `.patch-section-title` in a `<a class="patch-section-title-link">` when `window.BILL_PAGE_ID` is set (bill page only)
- `renderTopLines()` does the same for `item.headline` when `item.billSection` is set
- `scrollToBillSection(anchorId)` in `bill.js` does the scroll + flash. Also handles URL hash on load (direct linking)

**Adding links to thematic top-line headlines** (ones that don't auto-parse):
Add `"billSection": "1"` to the top_line object in cache.json:
```json
{ "headline": "What This Extension Changes", "billSection": "1", "subs": [...] }
```

**CSS:**
- `.patch-section-title-link` / `.top-line-headline-link` — inherit text style, `↓` pseudo-element, purple underline on hover
- `.bt-section-flash` / `@keyframes bt-section-flash` — 1.5s purple pulse on the target section
- `.bt-section` and `.bt-title` have `scroll-margin-top: 60px` to clear the sticky controls bar

**Watch out:** The Edit tool can corrupt double quotes inside template literals to curly smart quotes (U+201D). If links render but don't scroll, check char codes in the JS file with Node.js — run `fix-quotes.js` pattern to replace `“` / `”` with ASCII `"`.

**On the main index page**, no links are rendered (guarded by `window.BILL_PAGE_ID`).

## Bill Text Nav Panel + Back-to-Top (bill.html)

Both are injected by `bill.js` after the bill text renders — nothing in bill.html markup.

**`buildBillNav()`** — builds a fixed right-side section nav:
- Queries all `.bt-title[id]` and `.bt-section[id]` elements after render
- If bill has ≥2 TITLE entries: shows preamble sections (before first TITLE) + all TITLEs only
- If simple bill (no TITLEs): shows all bt-section entries
- Only builds if ≥3 nav items found (short bills don't get it)
- Uses `IntersectionObserver` with `rootMargin: '-60px 0px -65% 0px'` to highlight the topmost visible section as active
- Slides in from the right when bill text scrolls above the viewport (`bill-nav-visible` class)
- Hidden below 1200px viewport width via media query

**`setupBackToTop()`** — fixed circular ↑ button:
- Appears after bill text has scrolled 200px above viewport (`bill-back-top--visible`)
- Scrolls to `window.scrollTop = 0` (top of page, not just bill text)
- Positioned bottom-right; shifts left of the nav panel on wide screens (`right: calc(210px + 1.25rem)` at ≥1200px)

**CSS classes:** `.bill-nav-panel`, `.bill-nav-visible`, `.bill-nav-header`, `.bill-nav-list`, `.bill-nav-item`, `.bill-nav-item--title` (bold, surface-2 bg), `.bill-nav-item.active` (purple left border), `.bill-back-top`, `.bill-back-top--visible`

## Floor Activity Page (floor.html / floor.js)

All quotes from `data/quotes.json` are shown — both standalone CR quotes and bill-attached quotes. Bill-attached quotes display a clickable tag below the quote text showing the formatted bill ID + title, linking to `bill?id={billId}`.

**Entry card layout:**
- Header row: portrait (28px) | speaker name (mono, links to rep page if bioguideId present) | party badge (D-NY, R-TX) | stance badge (Support/Oppose/Neutral) | date | chamber | star
- Quote text clamped to 4 lines — click to expand
- Bill tag below quote (if billId present): `[doc icon] H.R. 1  Title of the Bill`

**Category chips:** 40×40px colored squares with an SVG icon (framed inner box) + statement count below. Colors mirror the accent palette. Cards have a 4px colored left border matching the chip color.

**Left border on entries:** party-based — blue for D, red for R, grey for independents/unknown.

**Favorites:** star icon in controls bar links to `favorites.html` on all pages. `floorFavs` stored in localStorage under `lpFloorFavs`. The floor fav star is now an `<a>` link, not a toggle.

**Floor category colors:** War & Foreign → red, Immigration → amber, Economy → green, Executive → red, Government → blue, Civil Liberties → purple, Other → neutral. All categories start collapsed on load.

**Search:** debounced live filter by quote text, speaker name, or state. When a search term is active, all matching categories auto-expand regardless of `collapsedCats` state.

**`formatBillId(billId)`** converts `"119-HCONRES-40"` → `"H.Con.Res. 40"` etc.

## Rep Strip (homepage carousel)

The controls bar strip renders `.rep-strip-card` elements (not `.rep-card` buttons as before). Each card is:
```
<div.rep-strip-card [data-rep-id, data-rep-name, data-rep-party, data-rep-state]>
  <a.rep-strip-portrait-link>   ← links to rep page (&ref=bills)
    <div.rep-ring>
    <span.rep-badge>            ← state badge overlay
  </a>
  <div.rep-name>                ← last name, truncates with ellipsis
  <button.rep-strip-star>       ← ☆/★ toggle, min-width 44px (iOS target)
</div>
```
- Clicking portrait navigates to rep page. Clicking star toggles tracking + selectedRepIds (quote carousel filter).
- `.rep-strip-card.tracked` → yellow ring outline (#facc15) on portrait
- `.rep-strip-portrait-link.rep-selected` → purple ring + glow (quote filter active)
- Pool order: tracked reps first, then local state reps, then recent quote speakers as fallback. No featured/priority reps.

## Rep Dropdown (homepage)

The "Reps" strip row has a "View all ▾" toggle button. The dropdown panel contains:
- `.rep-dropdown-top`: state selector, status, manual-add input, + right-side `.rep-dropdown-actions` (Browse all reps → link + × close button)
- `.rep-grid`: two `.rep-chamber-row` sections (Senate / House), each a horizontal `.rep-strip rep-strip-dropdown` carousel
- Carousel cards use `repGridCardHtml()` → `.rep-grid-card` wrapper with `.rep-card.rep-card-lg` portrait link + `.rep-track-btn` star overlay
- Close button (#repDropdownClose) calls `toggleRepDropdown()`

## Reps Library Page (reps.html / reps.js)

All 119th Congress members, states A→Z, each with Senate + House carousels (reps A→Z by last name within each).

Card structure on the reps page:
```
<div.reps-rep-card [data-id]>
  <a.reps-rep-portrait-link>   ← links to rep page (&ref=reps)
    <div.rep-ring>
    <span.rep-badge>
  </a>
  <div.reps-rep-name>          ← last name
  <button.reps-rep-fav-btn>    ← ☆/★, font-size 1.3rem, min-width 44px (iOS target)
</div>
```
- `.reps-rep-card.tracked` → yellow ring outline on portrait, name bolds
- Tracking writes to the same `lpTrackedReps` localStorage key as the main app — shared state across all pages
- `reps.js` is self-contained: duplicates utility functions (escHtml, partyColor, portraitUrl, repLastName) rather than loading app.js

