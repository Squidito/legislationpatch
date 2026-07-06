# Archived scripts

One-off, single-bill scaffolding kept for reference only. **Not part of the
pipeline** (`run-batch.js`) and not imported by any active script.

| Script | What it was for |
|---|---|
| `build_hr7148_analysis.js` | Assembled the HR-7148 omnibus cache entry (all divisions) — hardcoded to that bill. |
| `restructure_hr7148_toplevel.js` | One-time reshape of HR-7148's top-level fields. |
| `update_cache_hr7148.js` | One-time cache patch for HR-7148. |
| `scan_acros_hr7148.js` | Acronym scan for HR-7148 text. |
| `_add-hr6644.js` | One-off cache merge for HR-6644 (Jun 2026) — data already applied to cache.json. |
| `_add-new-bills-jun19.js` | One-off cache merge, 6-bill batch of 2026-06-19 — applied. |
| `_add-new-bills-jun25.js` | One-off cache merge, 2026-06-25 batch — applied. |
| `_add-new-bills-jun26.js` | One-off cache merge, 2026-06-26 batch — applied. |

The `_add-*.js` scripts embedded analyzed bill data inline — that pattern is
retired. New batches go in a JSON data file merged via `node scripts/add-bills.js
<file.json> [--force]`. See SCRIPT-CONVENTIONS.md.

These are **bill-specific** and should not be reused for the next omnibus.
The goal (see project notes) is to generalize omnibus handling into the main
pipeline so no per-bill scripts are needed again.
