# data/prepared/ — Prepared Dispatch branches (Phase 2)

One `<bill-id>.json` per bill with a known upcoming floor event. Each file holds
a **fingerprint per outcome branch** (passed / failed / signed / vetoed) — not
stored HTML.

**What being in this folder means:** the five event-independent gate checks
already passed for every branch listed. Nothing waits here unverified. The two
event-dependent checks (`votes-match-record`, `stage-corroborated`) cannot exist
before the vote does and run unchanged at fire time.

**Written by** `scripts/prepare-dispatch.js` · **read by** `scripts/dispatch-publish.js`
· **mechanics** `scripts/lib/prepared.js`

```
npm run dispatch:prepare -- --bill 119-HR-9770 --expires 2026-10-05 --apply
npm run dispatch:prepared          # list
npm run dispatch:prepare:check     # re-verify every record against the current cache
```

**A prepared record makes the lane stricter, never looser.** Once a bill has one,
an event that matches no prepared branch does not publish — it is logged blocked
with `needsHuman: true` and waits for James. A bill with no record here behaves
exactly as it did in Phase 1.

Re-run `dispatch:prepare:check` after any re-audit: a changed cache entry voids
the prepared QA by design.
