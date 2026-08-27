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

// ── Rep, theme & date helpers (deduped 2026-07-06) ─────────────────────────
// Single source of truth — these were hand-copied across app-reps/app-settings/
// floor.js/reps.js/rep.js/bill.js and had drifted (floor.js portraitUrl skipped
// PHOTO_OVERRIDES; three different FALLBACK_PORTRAIT values existed, one of them
// a real member's photo). util.js loads FIRST on every page.

const FALLBACK_PORTRAIT = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 44 44%27%3E%3Crect width=%2744%27 height=%2744%27 fill=%27%23374151%27/%3E%3Ccircle cx=%2722%27 cy=%2716%27 r=%279%27 fill=%27%236b7280%27/%3E%3Cellipse cx=%2722%27 cy=%2740%27 rx=%2715%27 ry=%2711%27 fill=%27%236b7280%27/%3E%3C/svg%3E";

const PHOTO_OVERRIDES = {
  'C001115': 'https://clerk.house.gov/images/members/C001115.jpg',
};

const STATE_NAMES = {
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', FL:'Florida', GA:'Georgia',
  HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa', KS:'Kansas',
  KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts',
  MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana',
  NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey', NM:'New Mexico',
  NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma',
  OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
  SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont',
  VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
  DC:'D.C.', PR:'Puerto Rico', GU:'Guam', VI:'Virgin Islands',
};

function portraitUrl(bioguideId) {
  if (!bioguideId || typeof bioguideId !== 'string' || bioguideId.length < 2) return FALLBACK_PORTRAIT;
  // SECURITY: bioguide IDs are always alphanumeric (e.g. "C001098"). Reject anything
  // else so a hostile id from ingested data (quotes/reps/votes JSON) can never break
  // out of the src="" attribute this URL gets interpolated into. Validating at the
  // source closes every portrait sink at once — security pass 2026-07-06.
  if (!/^[A-Za-z0-9]+$/.test(bioguideId)) return FALLBACK_PORTRAIT;
  const id = bioguideId.toUpperCase();
  return PHOTO_OVERRIDES[id] || `https://bioguide.congress.gov/bioguide/photo/${id[0]}/${id}.jpg`;
}

// SECURITY: validate a bioguide id for use in a `rep?id=…` href. Same alphanumeric
// rule as portraitUrl; returns '' for anything hostile so the caller can skip the
// link rather than emit an attribute-breakout. Use wherever an id lands in an href.
function safeBioId(bioguideId) {
  return (typeof bioguideId === 'string' && /^[A-Za-z0-9]+$/.test(bioguideId)) ? bioguideId : '';
}

function partyColor(party) {
  const p = String(party || '').trim().toUpperCase()[0];
  if (p === 'D') return '#3b82f6';
  if (p === 'R') return '#ef4444';
  return '#8b5cf6';
}

function repLastName(name) {
  const clean = String(name || '').replace(/^(Sen\.|Rep\.|Dr\.|Mr\.|Ms\.) /, '');
  const parts  = clean.trim().split(' ');
  return parts[parts.length - 1] || clean;
}

function updateLogoForTheme(isDark) {
  const logo = document.querySelector('.logo-img');
  // Root-absolute so the swap also resolves on the two-levels-deep /bill/<slug>/
  // static pages (a relative 'logo-dark.svg' would 404 there). Every page is
  // served from the site root, so this is equivalent to the old relative path.
  if (logo) logo.src = isDark ? '/logo-dark.svg' : '/logo.svg';
}

function toggleTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('lpTheme', isDark ? 'dark' : 'light');
  updateLogoForTheme(isDark);
}

function parseSourceDate(source) {
  if (!source) return 0;
  const m = source.match(/(\w+ \d+, \d+)$/);
  return m ? (new Date(m[1]).getTime() || 0) : 0;
}

// ── SEO slug helpers (shared client + generator) ───────────────────────────
// A bill's static-page URL is /bill/<billSlug>/ . Both the generator
// (scripts/generate_bill_pages.js) and the client (internal links in
// app-render.js / app-carousel.js) derive the slug through THESE functions,
// so the URL is produced exactly one way and the two can never drift.
// Pure string logic — safe in the browser and require()-able from Node.

// Slugify a bill title: ASCII-fold, lowercase, non-alphanumeric -> hyphen,
// collapse repeats, trim, cap ~70 chars at a word (hyphen) boundary.
function slugifyTitle(title) {
  let s = String(title || '')
    .normalize('NFKD').replace(new RegExp('[^\x00-\x7F]', 'g'), '') // ASCII-fold: drop combining marks left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')                        // non-alphanumeric -> hyphen
    .replace(/-+/g, '-')                                // collapse repeats
    .replace(/^-+|-+$/g, '');                           // trim leading/trailing
  if (s.length > 70) {
    s = s.slice(0, 70);
    const cut = s.lastIndexOf('-');
    if (cut > 0) s = s.slice(0, cut);                   // back off to a word boundary
    s = s.replace(/-+$/, '');
  }
  return s;
}

// Full slug for a bill record: <lowercased id>-<slugified title>.
// The id prefix (e.g. "119-hr-2480") guarantees global uniqueness; the title
// tail is for humans/SEO. Falls back to the bare id if the title is empty.
function billSlug(bill) {
  const id = String((bill && bill.id) || '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const tail = slugifyTitle(bill && bill.title);
  return tail ? id + '-' + tail : id;
}

// Full slug for a rep record: <lowercased bioguide id>-<slugified name>.
// Same contract as billSlug — the bioguide prefix (e.g. "b001257") guarantees
// uniqueness; the name tail is for humans/SEO. Static pages live at
// /rep/<repSlug>/ ; scripts/generate_rep_pages.js and the client both derive
// the slug through THIS function so the URL can never drift.
function repSlug(rep) {
  const id = safeBioId(rep && rep.bioguideId).toLowerCase();
  if (!id) return '';
  const tail = slugifyTitle(rep && rep.name);
  return tail ? id + '-' + tail : id;
}

// Node interop for the parity checker (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) {
  // Second line: web-only helpers deduped here 2026-07-06 — locked by
  // shared/parity-fixtures-web.json (web regression; NOT the mobile contract).
  module.exports = { escHtml, formatDateCompact, formatDate, quoteChamber, quoteDateCompact, quoteContext, quoteTagline, sponsorShort,
                     partyColor, repLastName, parseSourceDate, portraitUrl, safeBioId, slugifyTitle, billSlug, repSlug };
}
