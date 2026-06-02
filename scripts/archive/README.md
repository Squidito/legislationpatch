# Archived scripts

One-off, single-bill scaffolding kept for reference only. **Not part of the
pipeline** (`run-batch.js`) and not imported by any active script.

| Script | What it was for |
|---|---|
| `build_hr7148_analysis.js` | Assembled the HR-7148 omnibus cache entry (all divisions) — hardcoded to that bill. |
| `restructure_hr7148_toplevel.js` | One-time reshape of HR-7148's top-level fields. |
| `update_cache_hr7148.js` | One-time cache patch for HR-7148. |
| `scan_acros_hr7148.js` | Acronym scan for HR-7148 text. |

These are **bill-specific** and should not be reused for the next omnibus.
The goal (see project notes) is to generalize omnibus handling into the main
pipeline so no per-bill scripts are needed again.
