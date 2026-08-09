# QA Claim Ledger

The **reusable, per-bill record** of the hostile fidelity audit — one file per bill, `data/qa-ledger/<id>.json`.

## Why this exists (the "last expensive pass" guarantee)

Reading a bill's source text + analysis with an LLM is the expensive step. The ledger
**persists what that read found** as structured data — every atomic claim, its verdict,
and the exact source line (and char offsets) that back it. Once a bill is audited, **future
QA runs against the stored ledger, not another LLM re-read of the corpus.** Paired with the
provenance sidecar (below), re-audits then hit only bills whose source or generator changed.

Jobs served with zero new LLM cost: **resume/worklist** (`npm run qa-ledger`),
**regression** (a stored SUPPORTED claim a later edit breaks — see status note below),
**accuracy measurement** (live material errors ÷ claims, over full-claim audits only), and
**writing-prompt feedback** (aggregate error `type`s → which SYSTEM_PROMPT rules to add).

## Three ledger classes (do not conflate them)
- **`depth:"full-claims"`, `status:"audited"`** — a real v1-rubric audit: every claim
  decomposed (SUPPORTED rows kept as the regression baseline), each with a receipt +
  binding. **Only these count as coverage and feed live accuracy.**
- **`depth:"imported"`, `status:"imported"`** — seeded from the pre-v1 gold-set/Wave-1 work.
  Historical flags with **no receipts/bindings/SUPPORTED baseline**. Shown separately;
  **never counted as live accuracy or as "audited to rubric depth."** Upgrade = re-audit.
- **no ledger file** — never audited → the priority worklist.

## File schema

```json
{
  "id": "119-HR-1234",
  "title": "…",
  "billType": "appropriation",
  "auditVersion": "1.0",              // null for imported
  "status": "audited | imported | needs-audit",
  "depth": "full-claims | imported",
  "sourceReadDepth": "full | partial",
  "auditedAt": "2026-08-08",
  "auditModel": "opus",               // finder (or *-import for seeds)
  "verifyModel": "sonnet",            // cross-model verifier; null if none ran
  "claims": [
    {
      "field": "sections[2].items[0].detail",
      "claim": "atomic claim exactly as written in the analysis",
      "verdict": "SUPPORTED | CONTRADICTED | UNSUPPORTED | OMISSION",
      "type": "figure | direction | entity | attribution | omission | unsupported | overgeneralization | qualifier | framing | other",
      "severity": "material | minor | ok",
      "sourceSpan": "verbatim bill-text line(s) that back/contradict the claim  ← RECEIPT",
      "sourceStart": 12034, "sourceEnd": 12098,   // char offsets into the source file (null until captured)
      "section": "bill section / account heading the claim binds to  ← BINDING",
      "note": "why, when not SUPPORTED",
      "status": "open | fixed",        // 'fixed' = corrected in cache; excluded from LIVE accuracy
      "fixedAt": "2026-08-08",
      "verify": "CONFIRMED | REJECTED | null",   // cross-model verdict on THIS row (REJECTED = recorded false positive)
      "kind": "claim | quote"          // quote rows verify a CR quote verbatim + stance + attribution
    }
  ],
  "counts": { "claims": 0, "material": 0, "minor": 0, "omissions": 0 },
  "resolution": "what was fixed, if anything",
  "notes": ""
}
```

### Field notes
- **`sourceStart`/`sourceEnd` + `sourceSpan` are the receipt; `section` is the binding.**
  Together they kill "right number, wrong account" and make `npm run qa-receipts` (a
  deterministic substring/offset check) able to prove the receipt is real, not paraphrased.
- **`status:"fixed"` + `verify:"REJECTED"` are excluded from LIVE accuracy** — the report
  counts only unfixed, non-rejected, non-SUPPORTED rows on full-claims bills. This is why
  the meter reflects *currently-shipping* errors, not *ever-found* ones.
- **`verdict`+`severity` are separate axes** — an OMISSION is a `type`, and still carries a
  `severity`; the report never double-counts it as a third bucket.
- **`auditVersion`** — bump the rubric (docs/QA-AUDIT-RUBRIC.md) to force re-audit of
  full-claims bills stamped older. Imported bills carry `null` and sit on the upgrade list.
- **Regression** activates once full-claims SUPPORTED rows exist (populated by the sweep);
  `scripts/qa-ledger-regression.js` (Phase 3) replays them against current cache/source.

## Provenance sidecar
`data/qa-provenance.json` (`{ "<id>": { billTextSha, refShas, promptVersion, genModel, genAt, stampedAt } }`)
records what produced each analysis and the source hash it was written against — stamped by
`npm run qa-provenance`. `qa-ledger` flags any bill whose current `bill-text/<id>.txt` hash
no longer matches, so a source change re-triggers audit **for that bill only**.

## Relation to the gold-set
`data/gold-set/` is the committed 30-bill *measurement sample*. The ledger is the
*corpus-wide* worklist + regression store; `qa-ledger-seed.js` imports the gold-set +
Wave-1 audits as `imported` history (never as verified truth — gold files are still
candidate-status). Single source of truth for a bill = its full-claims ledger once audited.
