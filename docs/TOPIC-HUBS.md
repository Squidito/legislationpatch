# TOPIC-HUBS.md — /topics/<slug>/ pillar pages (Phase 4)

A hub aggregates the site's OWN corpus on one topic: curated member guides plus
bills selected by `billType`/id. Hubs build topical authority (hub-and-spoke);
bill pages were already the spokes — hubs are the missing pillars.

**Phase 4 rulings (James, 2026-08-17):** wave 1 = 2 hubs (government-spending,
congressional-procedure) · intro prose gets the FULL article-lane audit ·
hubs live at `/topics/<slug>/`.

## The rules

1. **Every rendered fact is generated.** Counts, stage labels, dates, links all
   come from `cache.json` / `slug-map.json` / `articles-index.json` / the member
   articles at build time. Nothing countable is typed into a config.
2. **`dateModified` is derived** — max of member-article `dateModified` and
   member-bill `stageDate`. It cannot go stale.
3. **Prose is gated through the article lane.** Hub prose is drafted as a
   FRAGMENT at `drafts/topic-<slug>.html` (no page shell, no scripts — the
   publish gate refuses both), audited under ledger `article-topic-<slug>` by
   the same patch-console runner as an explainer (zero open flags, convergence,
   `ARTICLE_DRAFT_PROMPT` verbatim), approved via the panel's one-click button
   (routed to `scripts/publish-topic-prose.js`), and published to
   `data/topics/<slug>-prose.html`. The generator injects it **fail-closed**: a
   fragment with no clean, current ledger kills the run. A hub with no fragment
   opens with a **structural fallback** built only from generated counts. No
   free-text claim ships unaudited. Drafting brief:
   `_personal/HUB-PROSE-HANDOFF.md`. Hub prose runs count as REFRESHES on the
   cadence, not explainers (James, 2026-08-17).
4. **Bidirectional linking is a maintained system.** `generate_topic_hubs.js`
   rewrites the `topic-hub-link` line in every member article each run
   (idempotent; removed when an article leaves a hub). `generate_bill_pages.js`
   reads the same configs and adds the hub link to matching bills' Related
   blocks. Nobody hand-maintains links.

## Files

| File | Role |
|---|---|
| `data/topics/<slug>.json` | Hub config: title, description, curated `guides[]`, `bills` selector, verified `about` entities, `intro[]` |
| `scripts/generate_topic_hubs.js` | Renders `/topics/<slug>/index.html` (CollectionPage JSON-LD, ItemList, derived dates) + maintains spoke links. `npm run topics` |
| `scripts/generate_bill_pages.js` | Adds the hub link to member bills' Related guides block |
| `scripts/generate_articles_index.js` | Renders hub cards at the top of `/articles/` |
| `scripts/generate_sitemap.js` | Lists `/topics/<slug>/` (weekly) |
| `scripts/run-batch.js` | Regenerates hubs every `--post` run, after bill pages, before the sitemap |

## Spoke-edit safety (learned the hard way, 2026-08-17)

v1 of the spoke-link writer truncated all 22 member articles at the breadcrumb
(a `slice` that never appended the file's remainder). **The qa-regression
prose-hash tripwire caught it** — the audited article's hash changed and the
gate flagged it before anything was committed. The writer now refuses to write
any edit that loses the document tail, loses the article body, or changes a
single byte INSIDE the `article-body` region; and a member article with no
`<h1 class="article-title">` fails the whole run rather than falling back to a
filename title (the silent fallback is how the truncation survived a second
run unnoticed). The hub line itself sits after the breadcrumb nav, OUTSIDE the
prose-hash region, so maintaining it never invalidates an audit — and it is
navigational, so it never bumps a member's `dateModified`.

## Adding a hub

1. Write `data/topics/<slug>.json` (fetch-verify every `about` sameAs URL first).
2. `npm run topics` — page + spoke links appear; `npm run articles:index`,
   `npm run sitemap`, `node scripts/generate_bill_pages.js` pick it up (or just
   run the batch post chain).
3. Commission the prose through the article lane when wanted: draft
   `drafts/topic-<slug>.html`, audit with `article-audit.js --slug topic-<slug>`,
   approve in the panel — the publish moves the fragment and regenerates.

## Open follow-ups

- **Hub OG cards** — hubs share the generic site card; extend the `--articles`
  card generator when worth it.
- **Search index** — hubs are deliberately NOT in `data/search-index.json` yet:
  the index shape is mirrored by the mobile app (`lib/search.ts`), so adding a
  new entry type is a parity decision, not a website-only change.
- **Intro drafting** — both hubs currently run the structural fallback.
