// util.js — shared pure helpers for the web app.
//
// Single source of truth for functions that were previously hand-copied across
// app.js / api.js / floor.js / rep.js / reps.js. Loaded as the FIRST <script> on
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
  module.exports = { escHtml, formatDateCompact, formatDate, sponsorShort };
}
