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
4. **Body in question-shaped `<h2>` sections.** "What does the bill require?" reads
   better to a person and is directly quotable by an answer engine.
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
fetch + store source  ->  draft in drafts/  ->  hostile audit to convergence  ->  panel  ->  publish
   fetch-reference.js      (gitignored)         patch-console article-audit.js    James   publish-article.js
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
4. **Review in the patch-console panel** — rendered draft beside the claim ledger.
5. **Publish is a human act.** `npm run article:publish -- --slug <slug> --apply` refuses
   an unaudited draft, a ledger with open flags, an unbound receipt, or an existing article
   at that path. It never commits, pushes, or pings IndexNow.

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
