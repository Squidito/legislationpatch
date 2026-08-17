# ARTICLE-SPEC.md — House style for LegislationPatch articles

What an article on this site must be, structurally and editorially. Companion to
`docs/BOTH-SIDES.md` (position sections), `docs/QA-AUDIT-RUBRIC.md` (fidelity),
`docs/QA-LOOP.md` (the verification loop), and `docs/article-template.html` (the shell —
kept in `docs/` on purpose: anything sitting in `articles/` is picked up by the sitemap,
search index, article index and staleness checker as a real page).

**This is a rulebook, not a description of the pipeline.** It states what must be
true of an article — so it does not go stale when a script is refactored, and it
is deliberately not registered in `data/doc-provenance.json`. Anything countable
(how many checks run, how many bills are audited) belongs in generated output,
never typed into prose here or in an article.

---

## 1. The four article types

Different risk, different sourcing, different gate. Know which one you are writing
before you write a word.

| Type | What it is | Risk | Source of truth |
|---|---|---|---|
| **Explainer** | Evergreen civics/process — cloture, discharge petitions, pocket vetoes | Low | House/Senate rules, CRS, statute |
| **Tracker** | A living page on one bill — status, what it does, positions | **High** | The bill's audited `cache.json` entry + fetched org statements |
| **Dispatch** | An event-pegged note: a bill moved | Low | The audited cache entry + roll-call data |
| **Meta** | How the site works — methodology, sourcing, neutrality | Low | Our own documented process |

**A tracker inherits its bill facts from the audited cache entry. It never
re-derives them from bill text.** That is free correctness: the entry already
passed the hostile audit and carries a QA ledger. Re-reading the source to restate
a figure only creates a second chance to get it wrong.

---

## 2. Structure

Every article, in this order:

1. **Title** — the question a reader would actually type. Not a slogan.
2. **Status line first, if the article concerns a live bill.** Open with where the
   bill stands and as-of when. A reader who bounces after one sentence should still
   leave with the correct status.
3. **Nut graf** — one or two sentences, no more. What this is and why it matters now.
   **The nut graf obeys the same sourcing bar as everything else (decided
   2026-08-15): "why it matters" is built ONLY from sourced structural facts** — a
   rule change with a date, a count from the record, a stored provision (e.g. "the
   119th Congress dropped the last-six-days window in 2025"). There is no
   interpretive-voice carve-out; zero-open-flags applies to every sentence,
   nut graf included. **If the sources don't support a why-it-matters, write a
   plain descriptive opening instead** — a duller opening is better than an
   unsourced one.
4. **Body in question-shaped `<h2>` sections.** "What does the bill require?" reads
   better to a person and is directly quotable by an answer engine. **The first
   sentence under each `<h2>` answers its question directly** (added 2026-08-16, with
   the standing editorial pass in §7b) — answer engines lift the opening sentences
   under a matching heading, so an answer that arrives after two sentences of setup
   is an answer they never see.
5. **Primary Sources box** at the foot — every source actually used, linked, and
   labelled where a position is involved (e.g. "opponent position").
6. **Disclosure line** — inserted automatically; never hand-write it.

**Length follows the record, not the topic's heat.** A committee-stage bill gets a
short page. Padding to hit a word count is how a site becomes thin content.

---

## 3. Sourcing rules

These are the article-level restatement of the HARD RULES in `CLAUDE.md`. They are
not softer because this is prose rather than a bill analysis.

- **Training knowledge is never a source.** Not for figures, dates, cites, or
  history. It may only tell you *where to look*.
  **The enforced form of this rule is `ARTICLE_DRAFT_PROMPT` in
  `scripts/prompts.js` — include it VERBATIM in any session or prompt that
  drafts article prose.** Rulebooks sitting in context are not a substitute: the
  first explainer was drafted with only the rulebooks loaded and the audit had
  to delete four training-knowledge claims. The audit is the net, not the license.
- **Every figure, date, and statutory citation must appear in a fetched, stored
  source.** A claim that cannot be tied to a source line is deleted, not hedged.
- **Never paraphrase a quotation.** Verbatim with speaker, date, and Congressional
  Record citation, or leave it out.
- **Never assert a position that is not on the record.** See §4.
- **Cross-vehicle check.** Policy often becomes law under a *different bill number*
  than the one you are tracking. Verify enactment and floor action across related
  and companion vehicles, not just the tracked number. No script catches this.
- **Cite the version you read.** Enrolled where a bill is law, engrossed where it
  passed a chamber, introduced otherwise.

---

## 4. Positions and named parties

**The highest-risk sentence on this site is "The EFF argues X."** Misattributing a
position to a named organization is worse than a wrong dollar figure, and it is the
only content here with defamation exposure.

Full rules in `docs/BOTH-SIDES.md`. The non-negotiables:

- A position must resolve to a **fetched and stored primary source** — the
  organization's own letter or statement, a Statement of Administration Policy, a
  recorded vote, or a member's own words. Linked-and-trusted is not enough.
- **Unverifiable positions are omitted, never softened and kept.**
- **Never characterize motive.** Report the stated position.
- **Verb symmetry**: identical neutral verbs for both sides — `says` / `argues` /
  `contends`. Grep for `notes|points out|claims|alleges|acknowledges|admits` before
  shipping; every hit must be justified or replaced.
- **Supporters first, always**, so running order never signals favour.
- **No invented balance.** A bill that passed 414–2 passed 414–2. Manufacturing an
  opposing side is a neutrality violation equal to taking one.

---

## 5. Voice

- Plain English. If a sentence needs a legislative dictionary, rewrite it.
- **Describe, never evaluate.** No "landmark", "radical", "common-sense",
  "sweeping", "controversial".
- Significance comes from **structural facts** — sponsorship, stage, vote margins,
  dollar amounts — not adjectives.
- Expand an acronym on first use, and add it to `acronyms.js`.
- Dollars follow the `CLAUDE.md` shortening rules (`$11.08B`, `$584.3M`, `$98M`).
  Use the real figure, never a loose round number.
- Prefer the statute's own terms over a coalition's preferred framing
  ("estate tax", not "death tax"; "fetus", not "unborn child").

---

## 6. Freshness

- **`dateModified` must reflect a real content change**, and gets updated whenever
  one happens. It drives the "Updated" label on the article index and is a genuine
  ranking and citation signal — content refreshed within 30 days is cited
  substantially more often by answer engines.
- **Never type a date into prose or a label** where it can be derived. The article
  index derives its "Updated <month>" from `dateModified` precisely because eight
  hand-typed labels had silently gone stale.
- A tracker whose bill has moved is **wrong, not merely dated**. It joins the
  staleness worklist (`npm run stale`).

### 6a. Cadence (RATIFIED by James, 2026-08-15)

- **≤ 2 new explainers per month, ~4 refreshes per month.** Commissioned one at a
  time — never batched. Volume is the failure mode this program is designed
  against, and the cap is deliberately below capacity.
- **Reviewed quarterly** (or sooner if search/AI-citation rules visibly shift —
  the GSC data is the alarm). Rationale and sources:
  `_personal/ARTICLE-CADENCE-MEMO.md`. Nothing enforces this in code by design;
  it is an editorial commitment, not a gate.

---

## 7. Before it ships

1. `npm run validate` — 0 errors.
2. `npm run preflight` — structural page checks pass.
3. **Fresh adversarial read against source** — assume it is wrong; absence from the
   source is a flag, never something to correct from memory.
4. **Cross-model verify** for anything a tracker asserts — the model that drafted
   must not be the only model that checked.
5. **Both-sides QC** if a positions section exists: strip test, verb-symmetry grep,
   dual-lens review, vehicle-bill check.
6. `npm run articles:index` so the article appears in the human-facing index.
7. **Human review before publish.** No exceptions in this lane.

### 7b. How an explainer actually moves (the Phase 3 lane)

```
fetch + store source  ->  draft in drafts/  ->  hostile audit  ->  editorial pass  ->  re-audit  ->  panel  ->  publish
   fetch-reference.js      (gitignored)        to convergence     (merge/cut/reorder    to convergence   James   publish-article.js
                                               (article-audit.js)  only — no new claims)
```

1. **Fetch and store every source first.** `node scripts/fetch-reference.js --rule
   "house:XV"` (chamber rules via govinfo HMAN), `--usc`, or `--bill`. It stores the text
   in `data/ref-text/` and registers the citation in `data/ref-sources.json`. **Nothing may
   be written from memory** — and the auditor has no web access, so an unfetched source
   simply cannot be used.
2. **Draft into `drafts/<slug>.html`, never `articles/`.** Everything that scans
   `articles/` treats what it finds as live, and the repo root deploys. Write the draft
   with the exact relative paths it will have once published — publishing is then a move
   with no link rewriting, and `preflight` checks a draft **as** an article (byline,
   disclosure, theme bootstrap, entity @ids, links), so it is structurally gated before it
   is publishable rather than at the moment it goes live.
3. **Audit to convergence, before any human reads it.** Fresh headless session per pass,
   a different model from the drafter, zero open flags, two consecutive clean passes,
   bail-out if it does not converge. The ledger is `data/qa-ledger/article-<slug>.json`.
4. **Editorial pass — STANDING step, ratified by James 2026-08-16.** The audit optimizes
   for fidelity, not reading; left alone, a converged article reads like a verified-claim
   list. After first convergence, one fidelity-preserving pass restructures the prose:
   **merge, cut, and reorder only — never a new claim, figure, or qualifier.** It serves
   two readers at once, and the second is why this is not optional polish:
   - *The person:* kill repetition, order sections by what a reader asks first, tighten.
   - *The answer engine:* structure IS the SEO surface for this site. Keep every `<h2>`
     question-shaped; make the **first sentence under each `<h2>` answer that question
     directly and quotably** (answer engines lift the opening sentences under a matching
     heading — an answer buried mid-section is invisible to them); title stays the query a
     reader would type; nothing may bury the answer below context.
   The pass may not touch JSON-LD, entity `@id`s, the Primary Sources box, or the
   disclosure line. **Then re-audit to convergence (step 3 again)** — the editorial pass
   is drafting, and edited prose is unaudited prose until a fresh ledger says otherwise.
5. **Review in the patch-console panel** — rendered draft beside the claim ledger.
6. **Approve-and-publish is one human act** (James, 2026-08-16 — the panel button records
   the approval, then runs the publish). `npm run article:publish -- --slug <slug> --apply`
   refuses an unaudited draft, a ledger with open flags, an unbound receipt, or an existing
   article at that path — and (added 2026-08-17, each caught by hand on the first explainer)
   a missing curated entry in `data/articles-index.json`, or JSON-LD without the template's
   `breadcrumb`/`citation` blocks. It warns on a missing `about` entity and on zero inbound
   links. On success it registers the article's prose hash in the qa-regression baseline
   (scoped to that entry — never a blanket `--update`). It never commits, pushes, or pings
   IndexNow.
7. **Weave it in.** A new page nothing links to is invisible to crawl discovery and gets
   no internal authority. Find the related live pages that ALREADY mention the topic
   (grep, don't guess) and link the existing mention to the new article. Link-only
   insertions are navigational — they do not bump `dateModified`; an edit that adds a
   factual clause does, and that clause obeys §3 sourcing like any other sentence.

**Quotation marks are a promise of verbatimness.** A span in quotes must appear exactly in
a stored source, *including any inline citations the source carries*. Dropping a source's
`(V, 6795)` to make a sentence read better is elision inside quotation marks — it is
paraphrase, `qa-receipts` rejects it, and §3 already forbids it. When a source's own text
cannot be quoted cleanly, report it as prose instead of quoting it.

### 7a. Dispatches are the one exception, and they buy it

The checklist above is the **slow lane**. Dispatches auto-publish (decision D1,
2026-08-13): no human reads one before it is live. That is only defensible
because a dispatch is built to make almost no new claims — every substantive
sentence is copied from the bill's already-audited `cache.json` entry or is a
structural fact from `data/votes`. The trade is explicit:

- **Pre-publish:** a deterministic gate, no LLM in the path, seven checks
  (`scripts/dispatch-gate.js`, spec §6.1). Any failure blocks the dispatch
  entirely. There is no publish-with-warnings.
- **Post-publish:** review via the dispatch log and the patch-console panel.
- **When wrong:** a logged, visible correction (`scripts/dispatch-correct.js`) —
  never a silent edit, never a deletion.

**Nothing else may use this exception.** An explainer or tracker that wants to
skip human review is a tracker that has not been reviewed.

---

## 8. What a new article must never do

- Exist because the corpus needed another page. **Volume for its own sake is
  scaled content abuse**, and it is judged the same whether a human or a model
  wrote it.
- Restate a bill summary that the bill's own page already carries better.
- Claim a count, a rate, or a total that is not generated from real data.
- Ship with a position attributed to anyone without a stored source behind it.
