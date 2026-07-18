# Both-Sides Positions (Tracker Articles)

How LegislationPatch writes the "who supports it, who opposes it, and why" section inside a bill-tracker article. This captures argument-question search demand ("why do people oppose KOSA", "[bill] pros and cons") on ONE neutral page per bill — explicitly INSTEAD of separate pro/con advocacy pages. The iron rule still governs: nonpartisan, no editorial spin, significance via structural facts, every argumentative claim attributed to a named holder with a verifiable source.

## Eligibility — structural triggers, not vibes

A both-sides section appears ONLY when opposition is **on the record** through at least one of:

- a near-party-line or closely split recorded vote;
- a formal opposition letter or statement from a **named** organization;
- a Statement of Administration Policy or veto threat;
- on-record statements against from named members.

**Consensus bills get no padded opposition.** A voice vote, a lopsided tally, or unanimous consent means the both-sides frame does not apply. Write "Who supports it" and state the structural fact instead — e.g. *"No organized opposition is on record; it passed 414&ndash;2."* **False balance is a neutrality violation equal to picking a winner.** Inventing a second side to look even is the same failure, in the other direction, as taking a side.

## Form

- **One section inside the tracker.** Never a standalone pro/con article, never a separate "arguments against X" page.
- **Question-form headings per side** — e.g. *"Why do supporters back &lt;bill&gt;?"* / *"Why do opponents object?"* A third, neutral heading (e.g. *"How the bill has changed in response"*) is allowed for on-record context.
- **Strongest actual arguments only,** proportionate to the real record. A committee-stage bill gets a lighter section than one with a contested floor vote. Depth follows the record, not the topic's heat.

## Attribution — the strip test

Delete every attribution tag mentally. **Any sentence that still asserts a side's claim as fact FAILS.** Every argumentative claim names its holder ("The EFF argues…", "The Brennan Center says…") and is backed by a verifiable source — the org's own letter/statement, a recorded vote, a member's press release, an SAP. "It's well known" is not a source; an empirical claim in dispute (e.g. how rare noncitizen voting is) stays attributed to whoever measured it.

## Verb symmetry — greppable rule

Use **identical neutral verbs for both sides**: `says` / `argues` / `contends`. **Never** pair a validating verb for one side with a doubting verb for the other — no `notes` / `points out` for supporters against `claims` / `alleges` for opponents (or vice versa). Grep the section for `notes|points out|claims|alleges|acknowledges|admits` before shipping; each hit must be justified or replaced.

## Order convention

**Supporters first, sitewide, always.** It matches the sponsor-first structure of the rest of the article; fixing the order so it never varies keeps the order itself from signaling favor.

## QC — dual adversarial review

Before a both-sides section ships it must clear:

1. **Dual-lens review.** A supporter-lens reviewer and an opponent-lens reviewer each confirm *their* side's strongest case is fairly and fully represented. Both must sign off — one satisfied side is not enough.
2. **Strip test** on every new sentence (see above).
3. **Verb-symmetry grep** (see above).
4. **Source verification** — each named position resolves to a real, fetched source (org statement/letter/SAP, recorded vote, member statement). Claims that cannot be verified are omitted, never softened-and-kept.
5. **Staleness check** — `npm run stale` (`scripts/article-staleness.js`) so the section is not describing a bill state the record has moved past.
6. **Vehicle-bill check.** Policy often becomes law — or gets its decisive floor vote — under a **different bill number** than the tracked one (the FY2026 NDAA was enacted via S. 1071, not S. 2296; KOSA's 91-3 Senate vote rode S. 2073; the SAVE America Act's House vote rode S. 1383). Status and positions sections must verify enactment and floor action **across vehicles** — check Congress.gov actions for related/companion vehicles, not just the tracked number's own action record. The automated staleness checker cannot catch this class.

## Scope cap

Both-sides content lives **only** as sections inside bill trackers. The site's center of gravity stays structural — bill pages, process/explainer guides, the changelog. Do not spin these sections out into their own pages or let them become the site's main event.
