# Bill Text Section Linking

## Writing analyses (billSection / labels)


Every `top_lines` item and every `sections[]` entry should link to the corresponding section in the full bill text. This enables click-to-scroll on the bill page.

**`sections[]` labels — use auto-parseable format:**
- Start with `"Section N — ..."` → auto-links to `bt-sec-N` ✓
- Start with `"Sections N–End — ..."` → auto-links to `bt-sec-N` ✓
- Start with `"Title I — ..."` → auto-links to `bt-title-I` ✓
- Any other format (e.g. `"Division A, Title II — ..."`) → **won't auto-link**. Either rename to the parseable form, or add an explicit `"billSection"` field.

**`top_lines` items — always need explicit `"billSection"` field:**
Headlines are thematic and never auto-parse. Always add `"billSection"` pointing to the section that contains the described content:
- Section target: `"billSection": "2"` → links to `bt-sec-2`
- Title target: `"billSection": "title-II"` → links to `bt-title-II`
- Specific sub-section: `"billSection": "219"` → links to `bt-sec-219`

**Before writing:** run the anchor scanner to see what targets are available for the bill:
```
node -e "
const fs=require('fs'),lines=fs.readFileSync('data/bill-text/BILL-ID.txt','utf8').split('\n');
const a=[];for(const l of lines){const s=l.match(/^(?:SECTION|SEC\.)\s+(\d+)/i);if(s)a.push('bt-sec-'+s[1]);const t=l.match(/^TITLE\s+([IVXLC]+)/i);if(t)a.push('bt-title-'+t[1].toUpperCase());}
console.log([...new Set(a)].join(', '));
"
```

**Resolving clauses and concurrent resolutions** (HJRES, HCONRES) have no section anchors — omit `billSection` entirely.


## Rendering (bill.html)


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

