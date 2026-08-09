# QA Audit Rubric — canonical hostile fidelity pass (v1.0)

**Single source of truth for the hostile audit.** `qa-loop.md` and
`patch-console/lib/prompts.js` both defer to THIS file — edit the rubric here so the
interactive loop and the headless pipeline never drift. One comprehensive pass covers
every known error class and emits a claim-ledger row per claim (`data/qa-ledger/<id>.json`,
schema in `data/qa-ledger/README.md`).

`auditVersion` for this rubric = **1.0**. Bumping it forces re-audit of bills stamped older.

---

## Stance (non-negotiable)

**Read to REFUTE, not to confirm.** Assume the analysis is WRONG until the bill text
proves each claim right. The only evidence is `data/bill-text/<id>.txt` plus the bill's
registered `referencedSources` — **training knowledge and the analysis's own wording are
never evidence.** Anything you cannot anchor to a quoted source line is a FLAG; never
"correct" it from memory. A flag counts only when you can quote the source line (or point
to its provable absence). Verify every candidate flag against the source before recording it.

Use hostile source-only verifier agents (Agent tool, **never `/workflows`** — cold-start
subagents fall back to training data; that is the exact failure this whole rubric exists
to catch), one per bill or small group.

---

## The one pass — decompose, then judge every class at once

**1. Decompose.** Break each prose field (`summary`, `brief`, `top_lines[]`,
`sections[].items[]`, `changes[]`, `underreported`, `gaps`, and every `divisions[]`
sub-field) into ATOMIC claims — split every modifier, figure, and actor into its own claim.

**2. Judge each claim against the source in isolation.** Record a ledger row per claim with
its `verdict`, `type`, `severity`, and — for every claim — the `sourceSpan` (verbatim
backing/contradicting line) and the `section`/account heading it binds to. The classes to
hunt, all in this single pass:

| # | Class (`type`) | What it catches | The check |
|---|---|---|---|
| 1 | `figure` | wrong dollar/percent/year/count | figure must appear verbatim in source (line-break-tolerant) |
| 2 | `direction` | expand↔restrict, mandatory↔discretionary, permanent↔sunset, add↔repeal, raise↔lower | **polarity sub-check on every effect claim** — the inversion class no script sees |
| 3 | `entity` | right fact, wrong actor/program/account (fabricated account names) | the named entity must be the one the source attaches the fact to |
| 4 | `attribution` | figure/claim bound to the wrong source span | the `section`/heading over the `sourceSpan` must match the account the claim names — **right number, wrong account** |
| 5 | `unsupported` | claim absent from all fetched source (extrinsic / training-data) | present in bill text OR a tagged referencedSource, else FLAG |
| 6 | `overgeneralization` | "may"→"will", "certain"→"all", hedging dropped | quantifier/modal strength must match the source exactly |
| 7 | `qualifier` | invented frequency/scope ("annual", "arms-embargoed") | the qualifier must be stated in source, not inferred |
| 8 | `framing` | unsourced political characterization in `likelihoodReason` | keep structural (party, recorded vote); flag breadth-of-support claims |

**3. Coverage / omission pass (`omission`).** List the source's material provisions;
flag any missing from the analysis or misleadingly buried. Faithful ≠ complete — this is
the only class a hallucination check cannot see.

**4. Stage/freshness cross-check.** For any bill with stage/vote movement or a freshness
warning, confirm stage & likelihood prose match `votes[]` and the current stage.

---

## Severity (drives fix priority)

- **`material`** — changes what a reader understands: wrong figure, wrong account, direction
  inversion, fabricated entity, dropped core provision. **Fix these first** (highest SEO/trust risk).
- **`minor`** — real but low-impact: formatting, a soft qualifier, a stylistic gloss.
- **`ok`** — SUPPORTED claim, receipt recorded (kept only at `depth:"full-claims"` as the
  regression baseline).

---

## Cross-model verify (kills correlated error)

The finder and the verifier must be **different models** (self-preference bias makes
same-model "agreement" worthless). Default: **Opus finds, Sonnet verifies.** The verifier
re-checks each flagged row against source and sets `verify: CONFIRMED | REJECTED`. **Only
CONFIRMED material rows are fixed**; REJECTED rows stay in the ledger as recorded false
positives (they tune the rubric).

---

## Output (what the pass writes)

- The claim-ledger file `data/qa-ledger/<id>.json` (schema: `data/qa-ledger/README.md`),
  `status:"audited"`, `depth:"full-claims"`, `auditVersion:"1.0"`, both model fields set.
  Record **every atomic claim** as a row — SUPPORTED ones too (they are the regression
  baseline) — each carrying: `verdict`, `type`, `severity`, `sourceSpan` **and its
  `sourceStart`/`sourceEnd` char offsets** (the receipt — must be a real substring of the
  source; `npm run qa-receipts` enforces this deterministically), `section` (the binding),
  `status:"open"` (or `"fixed"` after you correct it), and `verify` (the cross-model verdict).
- Quote-bearing bills: add `kind:"quote"` rows verifying each CR quote verbatim against
  source + its stance + bioguide attribution.
- Source-grounded fixes to `cache.json` for CONFIRMED material rows only (set that row's
  `status:"fixed"` + `fixedAt`). REJECTED rows stay as recorded false positives.
- Stamp provenance: `npm run qa-provenance` (records the source hash the analysis was written
  against, so a later source change re-triggers audit for that bill only).
- `npm run validate` must stay **0 errors** after fixes; `npm run qa-receipts` must pass.
- Never commit/push here — the orchestrator (or James) owns that.

## Deterministic aids (never a substitute for the fresh read)
`npm run qa-verify -- --bill <id> --quote` ties figures to quoted source lines + prints the
enclosing account heading (feeds classes 1 & 4). `npm run validate` is the mechanical gate.
Both are blind to classes 2, 3, 6, 7, 8 and to omission — those only surface via this read.
