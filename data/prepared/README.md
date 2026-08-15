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

## The seven branch kinds

Five are the D2 threshold kinds — `passed-house`, `passed-senate`, `failed-floor`,
`signed`, `vetoed`. Two behave differently (James, 2026-08-14):

- **`amended`** — auto-selectable, but not a threshold kind of its own. A bill
  passing in amended form fires an *ordinary passage event*; what marks it is the
  vote record's question (`"On Motion to Concur in the Senate Amendment"`). When
  the record has an amended branch and the vote says amendment, that branch wins
  and its verb ("passed the Senate in amended form") replaces the plain one.
  **This is the normal path for a CR.** If the vote says amendment and no amended
  branch was prepared, it BLOCKS — fail-closed, because the only cleared draft
  would claim the bill passed unqualified.
  Its `renderKind` is the passage kind, since the page's slug comes from the
  event kind, not from our label for the branch.
- **`pulled`** — **manual only.** A pulled bill's stage never changes, so no event
  ever fires, and pulls are not observable from any feed found (0 of 376 scheduled
  items across 20 session weeks carried a removal timestamp). It exists so a
  cleared page is *ready* if a bill gets yanked. **Publishing it is a deliberate
  human act and is deliberately not wired to anything automatic.**

Re-run `dispatch:prepare:check` after any re-audit: a changed cache entry voids
the prepared QA by design.
