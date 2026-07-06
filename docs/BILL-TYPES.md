# Bill Type Classification (billType)

## Bill Type Classification (`billType`)

Every analyzed bill carries a neutral `billType` describing its **legislative form**, rendered as a muted badge on both the index/bills cards and the full bill page. This is a structural fact like "omnibus" — **never a judgment of importance, quality, or significance.** All type badges share one muted neutral style (`.status-type`); no type is color-highlighted, so "FRAMEWORK" reads exactly like "AMENDMENT," just different words.

**Assign by the bill's PRIMARY operative function, from the bill text only:**

| `billType` | Badge | Criterion |
|---|---|---|
| `framework` | FRAMEWORK | Creates a new comprehensive federal regulatory regime — a new class of regulated entity with registration/licensing and ongoing oversight, where none existed |
| `appropriation` | FUNDING | Primarily appropriates or authorizes federal funds. On index cards, omnibus appropriations show only the OMNIBUS badge (the type chip is suppressed to avoid redundancy); on the full bill page the FUNDING chip shows alongside OMNIBUS |
| `reauthorization` | EXTENSION | Extends, renews, or reauthorizes an existing program, authority, or expiring deadline without otherwise changing the regime |
| `resolution` | RESOLUTION | A joint or concurrent resolution (rule disapproval, war-powers directive, expression of policy) rather than a standalone Act |
| `study` | STUDY | Primary action is a study, review, advisory program, or report — with no substantive change to legal rights or obligations |
| `amendment` | AMENDMENT | **Default.** Substantive change to existing law — modifying statutes, adding requirements/prohibitions, creating penalties, or directing agency action — short of a comprehensive new regulatory regime |

**Tiebreaker:** classify by what the bill *primarily does*. A bill that both amends a statute and orders a study is `amendment` (the substantive change dominates). A bill that creates only advisory machinery plus reports is `study`. When genuinely torn between `framework` and `amendment`, default to `amendment` — `framework` is reserved for bills that stand up a whole new regulated-entity regime (e.g., the Clarity and GENIUS Acts), and keeping it rare is what keeps it neutral. Do not promote a bill to `framework` because it feels important.

**Rendering** lives in `billTypeBadge()` / `BILL_TYPE_LABELS` / `BILL_TYPE_TIPS` (`app.js`); styling is `.status-type` (`styles.css`). The badge appears wherever `renderBill()` runs — index cards, the bills page, and the full bill page (which reuses `renderBill()` via `bill.js`).
- **Desktop:** chip in the left rank column (above the portrait), with a hover tooltip — `data-tip` attr handled by the shared tooltip in `acronyms.js` (wide/wrapping variant `.acronym-tooltip--wide`).
- **Mobile (≤640px):** rank-column chip hidden; an inline copy (rendered with `billTypeBadge(bill, true)`, no `data-tip`) shows at the **start** of `.bill-meta-row`. The stage words (`.meta-stage`) are hidden on mobile to make room, and placing the chip first keeps it far-left, away from the right-side ENACTED badge so the two don't crowd.
- Omnibus bills suppress the chip except on the bill page (`window.BILL_PAGE_ID`).

