# Styling — CSS Variables & Fonts

## CSS Variables (dark mode via [data-theme="dark"])

Key colors: `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-2`, `--text-3`
Accent palette: `--purple`, `--teal`, `--green`, `--amber`, `--red` — each has `-bg`, `-text`, `-border` variants.
Trust bar dark mode: `background: #1c1208` → changed to `var(--surface-2)` with `color: #fb923c`.

**What Changed** (`.wc-card`, from `renderChangesAppStyle`) uses `.wc-seg-label` / `.wc-dot` in `.wc-added` / `.wc-modified` / `.wc-removed` variants that reference the accent CSS variables (green / amber / red), NOT hardcoded colors. Dark mode overrides automatically via the variable cascade. Do not add inline styles here. (Replaced the old `.what-changed-grid` / `.patch-block--*` version-diff renderer, deleted 2026-07-14.)

**Dead-bill frame** (`.bill-card--dead`): a deep oxblood/maroon — the one intentional off-palette literal (light `#6e1a2b`, dark `#a83c4b`) so it sits clearly away from the bright `--red` used for votes. Underreported's light-mode tint (`#f9f0dd`) is the other deliberate literal (palette `--amber-bg` was too weak to differentiate from grey Not-addressed).

## Fonts

- **Body/Display:** Be Vietnam Pro — loaded via Google Fonts `<link>` in each page's `<head>` (replaced Plus Jakarta Sans 2026-06-11; chosen specifically to avoid AI/template-common fonts like Inter/Geist/Manrope/Plus Jakarta). Italic 400 **and** 500 are loaded for the italic quote text. Set via `--font-body` / `--font-display` in styles-shared.css `:root`.
- **Mono:** IBM Plex Mono (wght 500;600;700) — **DATA only**: bill numbers, dates, vote tallies, metadata, rep names, badges, full-bill-text. Bill **titles, nav, and section labels were moved OFF mono** to Be Vietnam Pro (de-vibecoding pass 2). Replaced DM Mono for better readability.
- **Reading-layer body text = weight 500 / 13px** (`.bill-summary`, `.shock-quote-text`, `.top-line-sub`, `.likelihood-detail-text`, `.item-detail`, `.criticism-item`, `.underreported-*`, `.gaps-item`; `.patch-item-main` is 14px/500). James's pick: denser over bigger/lighter.

