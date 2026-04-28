# LegislationPatch

**Patch notes for Congress. Sourced from bill text, no editorial spin.**

LegislationPatch takes U.S. federal legislation and turns it into structured, plain-English patch notes — the kind of format you'd expect from a software release, not a news article. Every fact is extracted directly from the bill text or Congressional Record. No pundit framing, no takes, no invented figures.

**Live site:** [legislation-patch.netlify.app](https://legislation-patch.netlify.app) *(occasionally down during active development)*

---

## What's open source

The **processing pipeline and data** are open source under MIT:

| Path | What it is |
|---|---|
| `scripts/batch_processor.js` | Full bill analysis pipeline — fetch, chunk, map, reduce, verify, humanize |
| `scripts/prompts.js` | LLM system prompt and chunk map prompt with zone discipline rules |
| `scripts/scan_record.js` | Congressional Record quote scanner via GovInfo API |
| `scripts/generate_reps.js` | Rep profile builder and bill attribution pipeline |
| `data/cache.json` | Processed bill data — public congressional record |
| `data/reps-index.json` | Congressional member index by state |
| `data/reps/` | Individual rep profile JSON files |

The **frontend** (UI, styles, and site code) is not open source — all rights reserved. See [LICENSE](LICENSE).

---

## The design philosophy

### Source zones — no mixing

Every output field is assigned to a source zone and the pipeline enforces it:

- **Zone 1 (bill text + CRS only):** `summary`, `brief`, `top_lines`, `sections`, `underreported`, `gaps`, `changes`
- **Zone 2 (Congressional Record only):** `featured_quotes`, `criticisms`, `comments`
- **Zone 3 (reasoning permitted):** `likelihood`, `likelihoodLabel`, `likelihoodReason`

Zone 1 and 2 fields are hard-rejected if they contain anything not in the source. Zone 3 fields are labeled "analyst judgment" in the UI so readers know where inference begins.

### Verification gate — zero tolerance

After the LLM produces its JSON, every factual claim is verified against source before it's accepted:

- Dollar amounts checked verbatim (with and without commas)
- Percentages checked verbatim
- Section number references verified in bill text
- Named programs and agencies verified in source
- Speaker names verified in Congressional Record

One failure = the entire bill is rejected. No soft warnings, no thresholds.

### No editorial framing

The prompt explicitly prohibits editorial adjectives in Zone 1 and 2 fields. Words like *quietly*, *buried*, *sweeping*, *significant*, and *hidden* are banned — not because the information isn't notable, but because **if it's in the bill text, it's on the record**. We bring light to it; we don't editorialize about how obscure it is.

### Gaps and underreported — anchored to the bill's own framing

- `gaps` must be grounded in what the bill's own title or stated purpose implies but doesn't address — not in external policy opinion
- `underreported` must describe the mechanical difference between a section's label and its operative text — not characterize intent

---

## The LLM problem — help wanted

This is where we're still figuring things out, and **criticism of the approach is genuinely welcome.**

### What we've tried

**Qwen3 5B (via LM Studio, port 1235)** is what the batch pipeline was built around — local, free to run, no API costs. In practice it's been inconsistent: it drifts from the zone rules, produces editorial framing that gets caught by the gate, and sometimes returns empty responses when context gets large. It's not a solved problem.

**Claude Opus 4.7** (`claude-opus-4-7`) produces reliably structured, zone-disciplined output with far fewer verification failures — and is capable enough to do the full map-reduce pipeline in one pass. The catch: it requires API credits, and we don't have enough throughput to run every bill through it at scale.

Right now: Opus 4.7 for careful single-bill analysis, Qwen for batch runs when we're willing to accept more rejections.

### What we're working on

The main open question is **how to get more reliable, less editorially-framed output from smaller local models**. Specifically:

- Getting the `top_lines` topic/sub format to stick without reverting to flat sentences
- Keeping `gaps` anchored to the bill's own framing rather than drifting into policy opinion
- Reducing false verification failures caused by number formatting inconsistencies

If you have experience with prompt engineering for structured output on smaller models, or thoughts on the zone discipline model itself, **open an issue or reach out directly.**

---

## Getting started

### Requirements

- Node.js 18+
- A Congress.gov API key (free): [api.congress.gov/sign-up](https://api.congress.gov/sign-up/)
- A GovInfo API key (free): [api.data.gov/signup](https://api.data.gov/signup/)
- LM Studio with Qwen3 5B loaded on port 1235 — *or* an Anthropic API key for Opus 4.7

### Setup

```bash
git clone https://github.com/Squidito/legislationpatch.git
cd legislationpatch
cp .env.example .env
# Fill in your API keys in .env
npm install
```

### Run the batch pipeline

```bash
# Process recent floor-eligible bills (up to 2 per run)
node scripts/batch_processor.js

# Target a specific bill
node scripts/batch_processor.js --bill 119-HR-6955

# Override the floor-time rule
node scripts/batch_processor.js --bill 119-HR-XXXX --force
```

### Scan Congressional Record for quotes

```bash
node scripts/scan_record.js --days=30
```

### Rebuild rep profiles

```bash
node scripts/generate_reps.js --all
```

---

## Architecture overview

```
Congress.gov API
    → bill XML/text, metadata, CRS summary, Congressional Record
    → batch_processor.js
        → chunkXMLByStructure() or chunkText() (3000-word fallback)
        → Map phase: LLM extracts facts per chunk (bullet points only)
        → Reduce phase: hierarchical synthesis (2-pass for 15+ chunks)
        → verifyOutput(): hard-reject on any unverified claim
        → humanizeAmountsDeep(): $240,774,000 → $241M
    → data/cache.json  ← static, read by the site
```

The site itself makes no API calls. Everything is pre-processed and served as static JSON.

---

## Contributing

Issues, criticism of the methodology, and pull requests to the pipeline are all welcome.

This project is built and maintained by [Squidito](https://github.com/Squidito) — a single father bootstrapping this in spare time. No team, no budget, no roadmap beyond "make it better and keep it honest." If you have ideas, expertise in LLM output reliability, or just spot something wrong with the analysis — **please say so.**

The goal is a tool that genuinely helps people understand what legislation does, without the spin. Any help toward that is appreciated.

---

## License

The processing pipeline (`scripts/`) and data (`data/`) are open source under the [MIT License](LICENSE).

The frontend (UI, styles, and site code) is not included in this license — all rights reserved.
