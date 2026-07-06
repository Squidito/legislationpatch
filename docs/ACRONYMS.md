# Acronym Tooltips

Restored verbatim from pre-slim CLAUDE.md (was lost in the 2026-07-06 slim; recovered same day).


`acronyms.js` provides hover tooltips for legislative acronyms (e.g. NSA, FISA, SNAP) in body text.

**Browser side:** `scanAcronyms(root)` walks text nodes inside a container, wraps matched all-caps words in `<span class="acronym-tip" data-full="...">`. A single `<div class="acronym-tooltip">` is appended to `<body>` and repositioned via `getBoundingClientRect()` on hover — this avoids clipping by `overflow: hidden` parents (which would break a CSS `::after` approach). Called from `renderAll()` in `app.js`, `render()` in `floor.js`, and `renderAll()` / `DOMContentLoaded` in `bill.js`.

**Scope:** patch notes, summaries, top lines, quote text, floor quotes. Skips headings, buttons, links, UI badge/label elements, and `#bill-text-mount` (full bill text).

**Adding a new acronym:** open `acronyms.js`, add a line to the `ACRONYMS` object at the top. No other changes needed.

**Processing-time check:** `batch_processor.js`, `scan_record.js`, and `fetch_bill_cr.js` all require `acronyms.js` (via `module.exports`) and print `[ACRONYMS]` warnings for any all-caps words found in generated content that aren't in the dictionary. US state codes and common non-acronym caps are excluded from the check. The `_collectBillTexts` helper in `batch_processor.js` also walks all `divisions[]` sub-fields so omnibus bills are fully covered.

