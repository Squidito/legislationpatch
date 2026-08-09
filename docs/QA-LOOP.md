# QA Loop — canonical procedure (tracked)

Run the QA loop until N consecutive clean passes (default 2). Arguments may set N or limit to specific bills. This file is the **tracked** canonical loop; `.claude/commands/qa-loop.md` is a thin pointer to it (the `.claude/` dir is gitignored, so the loop must live here to survive a clone).

**CANONICAL RUBRIC:** `docs/QA-AUDIT-RUBRIC.md` (v1.0) is the single source of truth for the hostile audit — every error class, the receipt/binding capture, cross-model verify, and severity. Steps 2.5–2.7 below are its summary; when they disagree, the rubric wins. Every audited bill MUST emit a claim-ledger file (see step 5).

**GENUINE-READ RULE (governs everything):** a pass counts ONLY if step 2 was a real, fresh read of the source text in `data/bill-text/`. Re-running a deterministic script against unchanged data is NOT an independent pass. Each consecutive clean pass must re-derive its conclusions from source.

## One pass = 5 steps

1. **Automated gate:** `npm run validate` → 0 errors mandatory; warnings are this pass's worklist.

2. **Fresh source read (the pass-defining step) — read to REFUTE:** for each bill, re-open `data/bill-text/{id}.txt` and treat every figure, date, section cite, threshold, and named entity in the analysis as WRONG until it appears verbatim in that text. Absence = flag it, never fix from memory. Aid (required, not a substitute): `node scripts/qa-source-verify.js --bill {id} --quote`
   - **2.5 HEADING CHECK:** the verifier's ✓ proves a number is *present*, not that it's bound to the right account. For every `under account heading →` line, confirm the heading matches the account the analysis names. "Right number, wrong account" survives presence checks — this step is the only defense (NASA $3.0B and NFS↔Wildland-Fire both shipped past 2 clean passes before this rule).
   - Also sweep for what no guard can catch: out-of-source proper nouns, invented qualifiers/frequencies ("annual" when the bill states none), claims about unfetched prior statutes, direction-of-change inversions, unsourced political framing in `likelihoodReason`.
   - **2.6 CLAIM-LEVEL FIDELITY (presence ≠ faithfulness):** decompose each prose field (`summary`, `brief`, every `top_lines`/`sections[].items[]`, `changes`, `likelihoodReason`, and every `divisions[]` field) into ATOMIC claims — one subject–predicate–object each, splitting every modifier (duration, scope, permanence, frequency, condition, threshold) into its OWN claim. Judge each against source ONLY: **SUPPORTED** (quote the verbatim span — no span, it is NOT supported), **CONTRADICTED**, or **UNSUPPORTED**. Judging holistically is what lets a fluent misread pass — judge each claim in isolation.
     - **Polarity/direction sub-check:** for every EFFECT claim, test direction against source — increases/decreases, expands/restricts, mandatory/discretionary, permanent/sunset(+duration), adds/repeals, raises/lowers. A flipped direction is CONTRADICTED. (The HR-6644 §504 "permanent vs 3-year sunset" class.)
   - **2.7 COVERAGE / OMISSION (faithful ≠ complete):** from the SOURCE, list the bill's most material provisions; any absent or misleadingly buried = an OMISSION flag.

3. **Resolve every flag:** fix the analysis / fetch the reference (`fetch-reference.js`) / adjudicate in `data/qa-adjudications.json` with real evidence. **Matching is exact on ALL keys:**
   - qa-source-verify flags → `{billId, kind, token, path, reason, verifiedAt}`
   - validate-batch warnings → `{billId, check, key, reason, verifiedAt}`
   Any edit to the underlying claim re-opens the adjudication.

4. **Log:** `Pass K: <N issues found/fixed> — <one-line summary>`

5. **Emit the claim-ledger (durable artifact — this is what makes the read reusable):** write `data/qa-ledger/{id}.json` per audited bill (schema: `data/qa-ledger/README.md`), `depth:"full-claims"`, `auditVersion:"1.0"`. Record EVERY atomic claim from step 2.6 as a row — including SUPPORTED ones (the regression baseline) — each with `verdict`, `type`, `severity`, `sourceSpan` + `sourceStart`/`sourceEnd` offsets (the receipt), `section` (the binding), `status:"open"|"fixed"`, and `verify` (cross-model verdict; Opus finds, Sonnet verifies — only CONFIRMED material rows get fixed). Then `npm run qa-receipts` (receipts must resolve) and `npm run qa-provenance` (stamp the source hash). `npm run qa-ledger` shows corpus coverage + the remaining worklist.

## Loop control
- Clean pass = step 1 has 0 errors AND steps 2–3 surfaced zero NEW issues.
- A pass that finds issues resets the counter to 0. **The pass that applies fixes never counts as clean** — at least one fully clean pass must follow it.
- **Adversarial verifiers are the DEFAULT stance:** read every pass to REFUTE. Spawn hostile source-only verifier agents (Agent tool, never `/workflows`), one per bill — "assume the analysis is wrong; your only truth is the bill text; absence in source = FLAG, never correct from memory." Verify every flag against source yourself before fixing. A source-anchored catch is a WIN, not a failed pass.
- Out of budget → stop and report: `Achieved X consecutive clean passes (target N).`
- Stretch bar once genuinely clean: `npm run validate -- --strict` (warnings also block).
