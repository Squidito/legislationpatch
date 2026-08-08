# Accuracy Gold Set

Ground-truth error labels for a stratified sample of bill analyses — the "ruler" that turns process-confidence into a **measured faithfulness rate**, and (once QA emits reports) lets us test whether a QA change actually improved recall.

## What lives here
- `<id>.json` — one label file per sampled bill (the ground truth).
- `_manifest.json` — the current sample (which bills, by type).
- `_run-<label>.json` — (optional) a QA run's flagged errors, for computing recall/precision.

## The flow
1. **Select** the sample → `npm run goldset:select -- --n 30` (writes blank templates).
2. **Bootstrap candidates** — hostile verifier agents propose errors per bill (`status: "candidate"`). Cheap first pass; NOT authoritative.
3. **Adjudicate** — James confirms/rejects each candidate against source, sets `status: "adjudicated"`. **Only adjudicated files count as gold.**
4. **Score** → `npm run goldset:score` → the accuracy number + error breakdown.

## Label file schema
```json
{
  "id": "119-HR-1",
  "title": "...",
  "billType": "appropriation",
  "stage": "signed",
  "status": "template | candidate | adjudicated",
  "labeledBy": "james",
  "labeledAt": "2026-08-08",
  "sourceReadDepth": "full | partial",
  "errors": [
    {
      "type": "direction-inversion | entity | attribution | omission | unsupported | overgeneralization | other",
      "field": "sections[2].items[0].detail",
      "claim": "the claim as written in the analysis",
      "problem": "what is wrong",
      "sourceTruth": "verbatim what the bill text actually says",
      "severity": "material | minor",
      "origin": "candidate | human"
    }
  ],
  "verifiedCorrectClaims": 0,
  "notes": ""
}
```
An adjudicated file with `errors: []` = a bill confirmed clean.

## Two things this measures
- **Product accuracy (now):** material errors in the *current* analyses over the labeled sample → "X% of bills carry a material error." Answers "how accurate is my info, really?"
- **QA recall (later):** given a `_run-*.json` of what the QA pass flagged, what fraction of the gold errors did it catch? Answers "is the QA actually working?"

## Error types (aligned to the fidelity check, steps 2.6/2.7)
- `direction-inversion` — expand/restrict, permanent/sunset, mandatory/discretionary flipped
- `entity` — right fact, wrong actor/program (the "right number, wrong account" class)
- `attribution` — figure/claim not bound to the source span it cites
- `omission` — a material provision left out or misleadingly buried
- `unsupported` — claim not in the fetched source (extrinsic)
- `overgeneralization` — "may"→"will", "certain"→"all", hedging lost
