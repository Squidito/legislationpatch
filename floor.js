// floor.js — Floor Activity page

const QUOTES_FILE       = 'data/quotes.json';
const SLUG_INDEX_FILE   = 'data/slug-index.json';  // id -> current bill slug (generated)
// (deduped into util.js 2026-07-06) FALLBACK_PORTRAIT (was a real member's photo — now the neutral SVG from util.js)
const FLOOR_FAVS_KEY    = 'lpFloorFavs';

// id -> "/bill/<slug>/" lookup, loaded alongside the quotes so bill links point
// at the static bill pages. Empty until loadData() resolves; links degrade to
// bill-pending for any bill not present.
let billSlugIndex = {};


const CATEGORIES = [
  {
    id:       'war',
    label:    'War & Foreign Policy',
    keywords: ['iran', 'the war', 'war in', 'war has', 'to war', 'military', 'hostilities',
               'armed force', 'operation epic', 'sanction', 'combat', 'nato', 'troops',
               'taiwan', 'xi jinping', 'foreign policy'],
  },
  {
    id:       'immigration',
    label:    'Immigration & Border',
    keywords: ['ice', 'border patrol', 'immigration', 'tps', 'deport', 'haitian',
               'asylum', 'undocumented', 'enforcement operations', 'militarized enforcement'],
  },
  {
    id:       'economy',
    label:    'Economy & Markets',
    keywords: ['federal reserve', 'the fed', 'fed chair', 'central bank', 'interest rate',
               'the markets', 'markets hate', 'inflation', 'tariff', 'deficit', 'fiscal',
               'monetary', 'treasury', 'tax cut', 'tax refund', 'lower rates', 'rates will',
               'income tax', 'tax break', 'groceries', 'housing cost'],
  },
  {
    id:       'executive',
    label:    'Executive Power',
    keywords: ['25th amendment', 'kash patel', 'remove the president', 'coercion',
               'fbi director', 'pardon', 'attorney general', 'cabinet must',
               'national security', 'unqualified',
               'executive order', 'executive orders', 'executive branch',
               'executive overreach', 'executive action', 'abuse of power',
               'checks and balances', 'separation of powers', 'impeach', 'impeachment',
               'presidential power', 'veto', 'vetoed',
               'imperial presidency', 'unitary executive'],
  },
  {
    id:       'government',
    label:    'Government & Oversight',
    keywords: ['shutdown', 'fema', ' dhs ', 'homeland security', ' tsa ', ' cisa ',
               'coast guard', 'appropriation', 'continuing resolution', 'longest shutdown',
               'disaster recovery', 'recovery fund',
               'oversight', 'subpoena', 'subpoenas', 'inspector general', 'whistleblower',
               'accountability', 'government accountability', 'government waste',
               'wasteful spending', 'transparency', 'watchdog', 'ethics', 'gao',
               'audit', 'red tape', 'government efficiency'],
  },
  {
    id:       'civil',
    label:    'Civil Liberties & Justice',
    keywords: ['fisa', 'warrantless', 'surveillance', 'rule of law', 'epstein',
               'contempt', 'breaking the law', 'civil liberties', 'due process',
               'liberty for security', 'foreign intelligence',
               'gun safety', 'gun violence', 'firearm', 'firearms', 'nra',
               'security and liberty'],
  },
  {
    id:       'health',
    label:    'Health Care',
    keywords: ['health care', 'healthcare', 'medicaid', 'medicare', 'hospital', 'hospitals',
               'health insurance', 'prescription', 'prescriptions', 'affordable care act',
               'patients', 'nurses', 'physicians', 'opioid', 'opioids', 'mental health',
               'premiums', 'drug prices'],
  },
  {
    id:       'energy',
    label:    'Energy & Environment',
    keywords: ['energy', 'oil', 'natural gas', 'gasoline', 'gas prices', 'climate',
               'clean air', 'emissions', 'pipeline', 'pipelines', 'power grid', 'the grid',
               'renewable', 'renewables', 'coal', 'drilling', 'environment', 'environmental',
               'solar', 'nuclear power', 'power plant', 'power plants', 'clean energy'],
  },
  {
    id:       'education',
    label:    'Education',
    keywords: ['school', 'schools', 'student', 'students', 'education', 'teacher', 'teachers',
               'college', 'colleges', 'university', 'universities', 'tuition', 'student loan',
               'student loans', 'classroom', 'classrooms', 'pell grant', 'public schools'],
  },
  {
    id:       'veterans',
    label:    'Veterans & Military',
    keywords: ['veteran', 'veterans', 'veterans affairs', 'servicemember', 'servicemembers',
               'gi bill', 'gold star', 'military families', 'active duty', 'the troops'],
  },
  {
    id:       'agriculture',
    label:    'Agriculture & Rural',
    keywords: ['farm', 'farms', 'farmer', 'farmers', 'farming', 'agriculture', 'agricultural',
               'crop', 'crops', 'livestock', 'rancher', 'ranchers', 'usda', 'harvest', 'dairy',
               'soybeans', 'farm bill', 'rural communities'],
  },
  {
    id:       'crime',
    label:    'Crime & Public Safety',
    keywords: ['crime', 'criminal', 'police', 'law enforcement', 'fentanyl', 'trafficking',
               'violent crime', 'homicide', 'gang', 'gangs', 'prison', 'sentencing',
               'cartel', 'cartels', 'public safety', 'drug trafficking', 'overdose'],
  },
  {
    id:       'other',
    label:    'Other',
    keywords: [],
  },
];

const CAT_ICONS = {
  war:         '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  immigration: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  economy:     '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  executive:   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  government:  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12,2 20,7 4,7"/></svg>',
  civil:       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"/><polyline points="9 12 11 14 15 10"/></svg>',
  health:      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  energy:      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  education:   '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5"/></svg>',
  veterans:    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"/><path d="M15.5 12.5 17 22l-5-3-5 3 1.5-9.5"/></svg>',
  agriculture: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>',
  crime:       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  other:       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
};

// escHtml() moved to util.js (loaded first on every page).

// (deduped into util.js 2026-07-06) portraitUrl (floor's copy skipped PHOTO_OVERRIDES — util.js version honors them)

// (deduped into util.js 2026-07-06) parseSourceDate lives in util.js

function chamberFromSource(source) {
  if (!source) return 'unknown';
  if (source.startsWith('House'))  return 'house';
  if (source.startsWith('Senate')) return 'senate';
  return 'unknown';
}

function shortDateFromSource(source) {
  if (!source) return '';
  const m = source.match(/(\w{3} \d{1,2}),\s*\d{4}/);
  return m ? m[1] : '';
}

function chamberLabelFromSource(source) {
  if (!source) return '';
  if (source.startsWith('Senate')) return 'Senate';
  if (source.startsWith('House'))  return 'House';
  return '';
}

// Precompile one word-boundary regex per category. Substring matching mis-filed
// huge numbers of quotes — "ice" matched offICE/servICE/polICE/justICE, "nato"
// matched seNATOr, "war" matched toWARd — so any quote naming a Senator landed in
// War & Foreign Policy, etc. \b matching also makes the old manual ' dhs ' padding
// unnecessary and stops "the fed" matching "the federal".
const _catMatchers = CATEGORIES
  .filter(cat => cat.id !== 'other' && cat.keywords.length)
  .map(cat => ({
    id: cat.id,
    re: new RegExp('\\b(?:' +
      cat.keywords.map(kw => kw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
      ')\\b', 'i'),
  }));

function classifyQuote(q) {
  const haystack = q.text + ' ' + (q.granuleTitle || '');
  for (const m of _catMatchers) {
    if (m.re.test(haystack)) return m.id;
  }
  return 'other';
}

function quoteKey(q) {
  return q.name + '|' + q.source + '|' + q.text.slice(0, 40);
}

// ---- State ----

let allQuotes     = [];
let activeFilter  = 'all';
let searchTerm    = '';
let showFavs      = false;
let initialRender = true;

const collapsedCats = new Set();
const floorFavs     = new Set(JSON.parse(localStorage.getItem(FLOOR_FAVS_KEY) || '[]'));

function saveFavs() {
  localStorage.setItem(FLOOR_FAVS_KEY, JSON.stringify([...floorFavs]));
}

// ---- Data ----

async function loadData() {
  const [res, slugRes] = await Promise.all([
    fetch(QUOTES_FILE),
    fetch(SLUG_INDEX_FILE).catch(() => null),
  ]);
  const data = await res.json();
  allQuotes  = data.quotes || [];
  if (slugRes && slugRes.ok) {
    try { billSlugIndex = await slugRes.json(); } catch (_) {}
  }
}

function formatBillId(billId) {
  if (!billId) return '';
  const parts = billId.split('-');
  if (parts.length < 3) return billId;
  const type = parts[1];
  const num  = parts[parts.length - 1];
  const map  = {
    HR: 'H.R.', HCONRES: 'H.Con.Res.', HJRES: 'H.J.Res.', HRES: 'H.Res.',
    S:  'S.',   SCONRES: 'S.Con.Res.', SJRES: 'S.J.Res.', SRES: 'S.Res.',
  };
  return (map[type] || type) + ' ' + num;
}

// ---- Grouping ----

function buildCategoryGroups(quotes) {
  let filtered = activeFilter === 'all'
    ? quotes
    : quotes.filter(q => chamberFromSource(q.source) === activeFilter);

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(q =>
      q.text.toLowerCase().includes(term) ||
      (q.name  && q.name.toLowerCase().includes(term))  ||
      (q.state && q.state.toLowerCase().includes(term))
    );
  }

  const map = new Map();
  for (const q of filtered) {
    const catId = classifyQuote(q);
    if (!map.has(catId)) map.set(catId, []);
    map.get(catId).push(q);
  }
  for (const qs of map.values()) {
    qs.sort((a, b) => parseSourceDate(b.source) - parseSourceDate(a.source));
  }

  return CATEGORIES
    .filter(cat => map.has(cat.id))
    .map(cat => ({ cat, quotes: map.get(cat.id) }));
}

// ---- Rendering ----

const STAR_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>';

function renderEntry(q, isFirst) {
  const key     = quoteKey(q);
  const isFav   = floorFavs.has(key);
  const portrait = q.bioguideId ? portraitUrl(q.bioguideId) : FALLBACK_PORTRAIT;

  const party   = (q.party || '').toUpperCase()[0] || '';
  const state   = (q.state || '').toUpperCase();
  const ps      = party && state ? party + '-' + state : party || state;

  const partyClass = party === 'D' ? 'party-dem'
                   : party === 'R' ? 'party-rep'
                   : 'party-ind';

  const shortDate    = shortDateFromSource(q.source);
  const chamberLabel = chamberLabelFromSource(q.source);

  const ringClass = party === 'D' ? 'ring-dem'
                  : party === 'R' ? 'ring-rep'
                  : 'ring-ind';

  const stance      = q.stance || 'neutral';
  const stanceLabel = stance === 'support' ? 'support'
                    : stance === 'oppose'  ? 'oppose'
                    : 'neutral';
  const stanceDisplay = stanceLabel.charAt(0).toUpperCase() + stanceLabel.slice(1);
  const stanceBadge = '<span class="floor-stance-badge stance-' + stanceLabel + '">' + stanceDisplay + '</span>';

  const speakerEl = q.bioguideId
    ? '<a class="floor-entry-speaker-link" href="rep?id=' + escHtml(q.bioguideId) + '">' + escHtml(q.name) + '</a>'
    : '<span class="floor-entry-speaker-name">' + escHtml(q.name) + '</span>';

  const partyBadge = ps
    ? '<span class="floor-entry-party ' + partyClass + '">' + escHtml(ps) + '</span>'
    : '';

  const datePart = shortDate
    ? '<span class="floor-entry-date">' + escHtml(shortDate) + '</span>'
    : '';

  const chamberPart = chamberLabel
    ? '<span class="floor-entry-chamber">' + escHtml(chamberLabel) + '</span>'
    : '';

  const favTitle = isFav ? 'Remove from saved' : 'Save quote';

  const billSlugStr = q.billId ? billSlugIndex[q.billId] : '';
  const billHref = billSlugStr
    ? '/bill/' + billSlugStr + '/'
    : 'bill-pending?id=' + encodeURIComponent(q.billId);
  const billTag = q.billId
    ? '<a class="floor-entry-bill" href="' + billHref + '">' +
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        '<span class="floor-entry-bill-id">' + escHtml(formatBillId(q.billId)) + '</span>' +
        (q.billTitle ? '<span class="floor-entry-bill-title">' + escHtml(q.billTitle) + '</span>' : '') +
      '</a>'
    : '';

  return (
    '<div class="floor-entry' + (isFirst ? ' floor-entry-first' : '') + '">' +
      '<div class="floor-entry-header">' +
        '<img class="floor-entry-portrait ' + ringClass + '" src="' + escHtml(portrait) + '" alt="' + escHtml(q.name) + '"' +
             ' onerror="this.src=\'' + FALLBACK_PORTRAIT + '\'" />' +
        '<div class="floor-entry-speaker-block">' +
          speakerEl +
          partyBadge +
          stanceBadge +
        '</div>' +
        '<div class="floor-entry-right">' +
          datePart +
          chamberPart +
          '<button class="star-btn floor-quote-star' + (isFav ? ' watching' : '') + '"' +
                  ' data-key="' + escHtml(key) + '"' +
                  ' onclick="toggleQuoteFav(this.dataset.key);event.stopPropagation()"' +
                  ' title="' + escHtml(favTitle) + '">' + STAR_SVG + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="floor-entry-body">' +
        '<p class="floor-entry-text" onclick="toggleEntryExpand(this)">' +
          '&ldquo;' + escHtml(q.text) + '&rdquo;' +
        '</p>' +
        billTag +
      '</div>' +
    '</div>'
  );
}

function renderCategoryCard({ cat, quotes }) {
  const isCollapsed = !searchTerm && collapsedCats.has(cat.id);
  const latestDate  = shortDateFromSource(quotes[0].source);
  const count       = quotes.length;
  const metaStr     = count + ' statement' + (count !== 1 ? 's' : '') +
                      (latestDate ? ' &middot; latest ' + escHtml(latestDate) : '');

  const icon = CAT_ICONS[cat.id] || '';

  return (
    '<div class="bill-card floor-cat-card floor-cat-card--' + cat.id + '" id="floor-cat-' + cat.id + '">' +
      '<div class="floor-cat-header" onclick="toggleCategory(\'' + cat.id + '\')">' +
        '<div class="floor-cat-chip cat-' + cat.id + '">' + icon + '</div>' +
        '<div class="floor-cat-info">' +
          '<div class="floor-cat-name">' + escHtml(cat.label) + '</div>' +
          '<div class="floor-cat-meta">' + metaStr + '</div>' +
        '</div>' +
        '<div class="bill-actions-col">' +
          '<span class="chevron' + (isCollapsed ? '' : ' open') + '"></span>' +
        '</div>' +
      '</div>' +
      '<div class="floor-cat-body' + (isCollapsed ? '' : ' open') + '">' +
        quotes.map((q, i) => renderEntry(q, i === 0)).join('') +
      '</div>' +
    '</div>'
  );
}

function renderFavsContent(el) {
  const saved = allQuotes.filter(q => floorFavs.has(quoteKey(q)));

  if (!saved.length) {
    el.innerHTML =
      '<p class="floor-empty">No saved quotes yet.<br>' +
      '<span style="font-size:0.8rem">Star any quote to save it here.</span></p>';
    return;
  }

  const sorted = [...saved].sort((a, b) => parseSourceDate(b.source) - parseSourceDate(a.source));

  el.innerHTML =
    '<div class="bill-card floor-favs-list">' +
      '<div class="floor-favs-header">' +
        '<span class="floor-favs-title">Saved Quotes</span>' +
        '<span class="floor-favs-count">' + saved.length + ' saved</span>' +
      '</div>' +
      sorted.map((q, i) => renderEntry(q, i === 0)).join('') +
    '</div>';
}

function render() {
  const el = document.getElementById('floorContent');

  if (showFavs) {
    renderFavsContent(el);
    return;
  }

  const groups = buildCategoryGroups(allQuotes);

  if (!groups.length) {
    el.innerHTML = '<p class="floor-empty">' +
      (searchTerm ? 'No statements matched &ldquo;' + escHtml(searchTerm) + '&rdquo;.' : 'No floor statements found for this filter.') +
      '</p>';
    return;
  }

  if (initialRender) {
    groups.forEach(({ cat }) => collapsedCats.add(cat.id));
    initialRender = false;
  }

  const chamberBarHtml = '<div class="bill-filter-bar">'
    + '<div class="filter-row" id="chamberFilters">'
    + '<button class="filter-btn' + (activeFilter === 'all'    ? ' active' : '') + '" data-chamber="all">All</button>'
    + '<button class="filter-btn' + (activeFilter === 'house'  ? ' active' : '') + '" data-chamber="house">House</button>'
    + '<button class="filter-btn' + (activeFilter === 'senate' ? ' active' : '') + '" data-chamber="senate">Senate</button>'
    + '</div></div>';

  el.innerHTML = chamberBarHtml + groups.map(renderCategoryCard).join('');
  if (typeof scanAcronyms === 'function') scanAcronyms(el);
}

// ---- Expand individual quote text ----

function toggleEntryExpand(el) {
  el.classList.toggle('floor-entry-expanded');
}

// ---- Favorites ----

function toggleFavsView() {
  showFavs = !showFavs;
  const btn = document.getElementById('floorFavBtn');
  if (btn) btn.classList.toggle('active', showFavs);
  if (showFavs) {
    const searchEl = document.getElementById('floorSearch');
    if (searchEl) searchEl.value = '';
    searchTerm = '';
  }
  render();
}

function toggleQuoteFav(key) {
  if (floorFavs.has(key)) floorFavs.delete(key);
  else floorFavs.add(key);
  saveFavs();
  render();
}

// ---- Category toggle ----

function toggleCategory(id) {
  const card = document.getElementById('floor-cat-' + id);
  if (!card) return;

  if (collapsedCats.has(id)) collapsedCats.delete(id);
  else collapsedCats.add(id);

  const collapsed = collapsedCats.has(id);
  card.querySelector('.floor-cat-body').classList.toggle('open', !collapsed);
  card.querySelector('.chevron').classList.toggle('open', !collapsed);
}

// ---- Theme ----

// (deduped into util.js 2026-07-06) toggleTheme + updateLogoForTheme live in util.js

// ---- Init ----

async function init() {
  const isDark = localStorage.getItem('lpTheme') !== 'light';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  {
    const cb = document.getElementById('themeToggle');
    if (cb) cb.checked = isDark;
    updateLogoForTheme(isDark);
  }

  const zip   = localStorage.getItem('lpTrackedZip');
  const zipEl = document.getElementById('zipDisplay');
  if (zip && zipEl) zipEl.textContent = '~' + zip;

  try {
    await loadData();
  } catch (e) {
    document.getElementById('loadingState').innerHTML =
      '<p style="color:var(--red)">Failed to load floor data.</p>';
    return;
  }

  document.getElementById('loadingState').style.display = 'none';

  const latestEl = document.getElementById('pageHeadLatest');
  if (latestEl) {
    const newest = allQuotes
      .map(q => ({ q, t: parseSourceDate(q.source) }))
      .filter(x => x.t)
      .sort((a, b) => b.t - a.t)[0];
    if (newest) latestEl.textContent = shortDateFromSource(newest.q.source);
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-chamber]');
    if (!btn) return;
    activeFilter = btn.dataset.chamber;
    render();
  });

  const searchInput = document.getElementById('floorSearch');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchTerm = searchInput.value.trim().toLowerCase();
        render();
      }, 180);
    });
  }

  renderCarousel();
  render();
}

// ── Floor carousel ─────────────────────────────────────────────────────────

function computeShockScore(q) {
  let score = 0;
  const text = (q.text || '').toLowerCase();
  if (q.stance === 'oppose') score += 3;
  score += (q.text.match(/!/g) || []).length * 2;
  ['never','cannot','wrong','fail','destroy','steal','corrupt','socialism','looting',
   'screaming','disgusting','dangerous','unconstitutional','betrayed','shameful',
   'criminal','fraud','disaster','outrage'].forEach(w => { if (text.includes(w)) score += 1; });
  score += Math.min(4, Math.floor((q.text || '').length / 80));
  return score;
}

function renderCarousel() {
  const mount = document.getElementById('floorCarousel');
  if (!mount || !allQuotes.length) return;

  // Score and dedup by speaker
  const repKey = q => (q.bioguideId || q.name || '').toLowerCase();
  const used = new Set();
  const scored = [...allQuotes]
    .filter(q => q.text && q.name)
    .map(q => ({ ...q, shockScore: computeShockScore(q) }))
    .sort((a, b) => b.shockScore - a.shockScore)
    .filter(q => {
      const key = repKey(q);
      if (used.has(key)) return false;
      used.add(key);
      return true;
    });

  // Featured: top-scoring R and D (one each)
  const featR = scored.find(q => (q.party || '').toUpperCase().startsWith('R'));
  const featD = scored.find(q => (q.party || '').toUpperCase().startsWith('D'));
  const featured = [featR, featD].filter(Boolean);
  const featKeys = new Set(featured.map(repKey));

  // Rest: fill up to 12 more, deduplicated
  const rest = scored.filter(q => !featKeys.has(repKey(q))).slice(0, 12);
  const pool = [...featured, ...rest];

  if (!pool.length) return;

  const cards = pool.map((q, i) => {
    const isFeatured = i < featured.length;
    const color = q.party === 'D' ? '#3b82f6' : q.party === 'R' ? '#ef4444' : '#6b7280';
    const portrait = portraitUrl(q.bioguideId); // SECURITY: validates id + safe src (was raw interpolation)
    const safeId = safeBioId(q.bioguideId);
    const repHref = safeId ? `rep?id=${safeId}&ref=bills` : null;
    const portraitInner = `
      <img class="shock-quote-portrait" src="${escHtml(portrait)}" onerror="this.src='${FALLBACK_PORTRAIT}'" alt="${escHtml(q.name)}" style="border:2px solid ${color}"/>
      <div class="shock-quote-rep-text"><div class="shock-quote-name">${escHtml(q.name)}</div><div class="shock-quote-source">${escHtml(quoteContext(q))}</div></div>`;
    const header = repHref
      ? `<a href="${repHref}" class="shock-quote-rep-link">${portraitInner}</a>`
      : `<div class="shock-quote-rep-link">${portraitInner}</div>`;
    const quoteDate = quoteDateCompact(q);
    const footer = quoteDate
      ? `<div class="shock-quote-foot"><span class="shock-quote-foot-date">${escHtml(quoteDate)}</span></div>`
      : '';
    return `<div class="shock-quote-card${isFeatured ? ' is-featured' : ''}">
      <span class="sq-corner sq-corner-tl"></span><span class="sq-corner sq-corner-tr"></span><span class="sq-corner sq-corner-bl"></span><span class="sq-corner sq-corner-br"></span>
      <svg class="sq-ring" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><line class="sq-x-line" x1="8" y1="8" x2="18" y2="18"/><line class="sq-x-line" x1="18" y1="8" x2="8" y2="18"/></svg>
      <div class="shock-quote-header">${header}</div>
      <div class="shock-quote-text">"${escHtml(q.text)}"</div>
      ${footer}
    </div>`;
  }).join('');

  // xss-ok: `cards` is assembled above with escHtml/safeBioId/portraitUrl on every dynamic value
  mount.innerHTML = `<div class="shock-quotes-section">
    <div class="shock-quotes-label-row">
      <span class="shock-quotes-label">Controversial quotes from the floor</span>
    </div>
    <div class="shock-quotes-grid"><div class="shock-quotes-track">${cards}</div></div>
  </div>`;

  initFloorCarousel();
}

function initFloorCarousel() {
  let epoch = 0, raf = null;
  epoch++;
  const myEpoch = epoch;
  if (raf) { cancelAnimationFrame(raf); raf = null; }

  const grid = document.querySelector('#floorCarousel .shock-quotes-grid');
  const el   = grid?.querySelector('.shock-quotes-track');
  if (!el || !el.children.length) return;

  el.querySelectorAll('[data-clone]').forEach(n => n.remove());
  const originals = [...el.children];
  originals.forEach(c => { const cl = c.cloneNode(true); cl.setAttribute('data-clone','true'); cl.setAttribute('aria-hidden','true'); el.insertBefore(cl, el.firstChild); });
  originals.forEach(c => { const cl = c.cloneNode(true); cl.setAttribute('data-clone','true'); cl.setAttribute('aria-hidden','true'); el.appendChild(cl); });

  const setWidth = el.children[originals.length].getBoundingClientRect().left - el.children[0].getBoundingClientRect().left;
  if (setWidth === 0) { raf = requestAnimationFrame(() => { if (myEpoch === epoch) initFloorCarousel(); }); return; }

  let currentX = -setWidth, paused = false, isDragging = false, startX = 0, startCurrentX = 0;
  el.style.transform = `translateX(${currentX}px)`;

  grid.addEventListener('mouseenter', () => { paused = true; });
  grid.addEventListener('mouseleave', () => { paused = false; isDragging = false; grid.classList.remove('dragging'); });
  grid.addEventListener('mousedown', e => { isDragging = true; startX = e.pageX; startCurrentX = currentX; grid.classList.add('dragging'); e.preventDefault(); });
  grid.addEventListener('mouseup', () => { isDragging = false; grid.classList.remove('dragging'); });
  grid.addEventListener('mousemove', e => { if (isDragging) currentX = startCurrentX + (e.pageX - startX) * 1.8; });
  grid.addEventListener('touchstart', e => { startX = e.touches[0].pageX; startCurrentX = currentX; }, { passive: true });
  grid.addEventListener('touchmove', e => { currentX = startCurrentX + (e.touches[0].pageX - startX); }, { passive: true });

  const SPEED = 0.125;
  (function tick() {
    if (!paused && !isDragging) currentX -= SPEED;
    const third = setWidth;
    if (currentX < -2 * third) currentX += third;
    if (currentX > -third + 1)  currentX -= third;
    el.style.transform = `translateX(${currentX}px)`;
    raf = requestAnimationFrame(tick);
  })();
}

document.addEventListener('DOMContentLoaded', init);
