// util.js — shared pure helpers for the web app.
//
// Single source of truth for functions that were previously hand-copied across
// the app-*.js set / api.js / floor.js / rep.js / reps.js. Loaded as the FIRST <script> on
// every page that uses them, so the globals exist before the page scripts run.
//
// These are mirrored on the mobile app in legislationpatch-app/lib/format.ts.
// When you change the logic of one of the SHARED functions below, update the
// mobile copy too — the parity test (scripts/check-parity.js + the matching
// mobile test, both driven by shared/parity-fixtures.json) will FAIL on drift.
// Drift between these copies is what caused the past date-ordering bugs.
//
// No DOM dependencies here — the file is also require()-able from Node so the
// parity checker can import it directly.

// HTML-escape for safe innerHTML interpolation. Escapes all 5 sensitive chars
// (including the apostrophe — needed for single-quoted attribute contexts).
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Display formatter: ISO YYYY-MM-DD (canonical storage) -> mm-dd-yy.
// Parses the ISO parts directly (no `new Date()`) to avoid the UTC->local
// off-by-one day shift. Falls back to `new Date()` only for legacy/human strings.
// MIRRORED in mobile lib/format.ts as formatDateCompact (Hermes-safe version).
function formatDateCompact(dateStr) {
  if (!dateStr) return '';
  const s = String(dateStr).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}-${iso[3]}-${iso[1].slice(-2)}`;
  try {
    const d = new Date(s);
    if (isNaN(d)) return s;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}-${dd}-${yy}`;
  } catch (e) { return s; }
}

// Alias: api.js and rep.js historically called this `formatDate`. Same function.
function formatDate(dateStr) {
  return formatDateCompact(dateStr);
}

// ── Quote provenance taglines (web display) ───────────────────────────────
// These build the small line under a speaker's name on quote cards. They are
// web-display helpers shared between app-carousel.js/app-favorites.js and
// floor.js (floor carousel) so the label is built ONE way everywhere; they are
// not part of the mobile-mirrored parity contract above.

// Chamber ("House" | "Senate" | "") from the best available signal: the stored
// `chamber` field (backfilled by scripts/backfill_quote_chamber.js), then the
// "Rep."/"Sen." name prefix, then a "House/Senate Floor" source prefix.
function quoteChamber(q) {
  if (q && q.chamber) return q.chamber;
  const name = (q && q.name) || '';
  if (/^\s*Sen\./i.test(name)) return 'Senate';
  if (/^\s*Rep\./i.test(name)) return 'House';
  const source = (q && q.source) || '';
  if (/^\s*Senate\b/i.test(source)) return 'Senate';
  if (/^\s*House\b/i.test(source))  return 'House';
  return '';
}

// mm-dd-yy date for a quote — from a structured `quoteDate` (ISO) when present,
// else parsed out of the free-text `source` string (long-form or already-compact).
function quoteDateCompact(q) {
  if (q && q.quoteDate) return formatDateCompact(q.quoteDate);
  const source = String((q && q.source) || '');
  const long = source.match(/[A-Z][a-z]{2,8}\.?\s+\d{1,2},\s+\d{4}/);
  if (long) return formatDateCompact(long[0]);
  const compact = source.match(/\d{2}-\d{2}-\d{2}/);
  return compact ? compact[0] : '';
}

// Context label (no date): "{Chamber} floor {debate|statement}".
//   debate    = the remark was made while a specific bill was on the floor (q.billId set)
//   statement = a standalone floor remark not tied to a bill
// Chamber is dropped to a plain "Floor" only when it can't be resolved.
// The carousel cards show this on the name line and put the date in the footer.
function quoteContext(q) {
  const chamber = quoteChamber(q);
  const venue   = chamber ? chamber + ' floor' : 'Floor';
  const kind    = (q && q.billId) ? 'debate' : 'statement';
  return venue + ' ' + kind;
}

// Full one-line tagline: "{context} · {mm-dd-yy}". Used where there's no footer
// to carry the date (e.g. the favorites card).
function quoteTagline(q) {
  const ctx  = quoteContext(q);
  const date = quoteDateCompact(q);
  return date ? ctx + ' · ' + date : ctx;
}

// "Sen. Britt, Katie Boyd (R-AL)" -> "BRITT (R-AL)" — last name + party/state, caps.
// Used for the compact sponsor/stats row on bill cards.
// MIRRORED in mobile lib/format.ts as sponsorShort.
function sponsorShort(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const psMatch = raw.match(/\(([^)]+)\)\s*$/);
  const partyState = psMatch ? psMatch[1].trim() : '';
  const core = raw
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^(Sen\.|Rep\.|Dr\.|Mr\.|Ms\.)\s+/, '')
    .trim();
  let last;
  if (core.includes(',')) {
    last = core.split(',')[0].trim();
  } else {
    const SUFFIX = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'jr.', 'sr.']);
    const parts = core.split(' ').filter(Boolean);
    last = core;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!SUFFIX.has(parts[i].toLowerCase())) { last = parts[i]; break; }
    }
  }
  const out = last.toUpperCase();
  return partyState ? `${out} (${partyState})` : out;
}

// Node interop for the parity checker (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escHtml, formatDateCompact, formatDate, quoteChamber, quoteDateCompact, quoteContext, quoteTagline, sponsorShort };
}
