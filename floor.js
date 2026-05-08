// floor.js — Floor Activity page

const QUOTES_FILE       = 'data/quotes.json';
const FALLBACK_PORTRAIT = 'https://bioguide.congress.gov/bioguide/photo/P/P000587.jpg';
const FLOOR_FAVS_KEY    = 'lpFloorFavs';

const CATEGORIES = [
  {
    id:       'war',
    label:    'War & Foreign Policy',
    keywords: ['iran', 'the war', 'war in', 'war has', 'military', 'hostilities',
               'armed force', 'operation epic', 'sanction', 'combat', 'nato', 'troops'],
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
               'monetary', 'treasury', 'tax cut', 'tax refund', 'lower rates', 'rates will'],
  },
  {
    id:       'executive',
    label:    'Executive Power',
    keywords: ['25th amendment', 'kash patel', 'remove the president', 'coercion',
               'fbi director', 'pardon', 'attorney general', 'cabinet must',
               'national security', 'unqualified'],
  },
  {
    id:       'government',
    label:    'Government & Oversight',
    keywords: ['shutdown', 'fema', ' dhs ', 'homeland security', ' tsa ', ' cisa ',
               'coast guard', 'appropriation', 'continuing resolution', 'longest shutdown'],
  },
  {
    id:       'civil',
    label:    'Civil Liberties & Justice',
    keywords: ['fisa', 'warrantless', 'surveillance', 'rule of law', 'epstein',
               'contempt', 'breaking the law', 'civil liberties', 'due process',
               'liberty for security', 'foreign intelligence'],
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
  other:       '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
};

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function portraitUrl(bioguideId) {
  if (!bioguideId || bioguideId.length < 2) return FALLBACK_PORTRAIT;
  const id = bioguideId.toUpperCase();
  return 'https://bioguide.congress.gov/bioguide/photo/' + id[0] + '/' + id + '.jpg';
}

function parseSourceDate(source) {
  if (!source) return 0;
  const m = source.match(/(\w+ \d+, \d+)$/);
  return m ? (new Date(m[1]).getTime() || 0) : 0;
}

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

function classifyQuote(q) {
  const haystack = (q.text + ' ' + (q.granuleTitle || '')).toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.id === 'other') continue;
    if (cat.keywords.some(kw => haystack.includes(kw))) return cat.id;
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
  const res  = await fetch(QUOTES_FILE);
  const data = await res.json();
  allQuotes  = data.quotes || [];
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

  const accentClass = party === 'D' ? 'accent-dem'
                    : party === 'R' ? 'accent-rep'
                    : 'accent-ind';

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

  const billTag = q.billId
    ? '<a class="floor-entry-bill" href="bill?id=' + encodeURIComponent(q.billId) + '">' +
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        '<span class="floor-entry-bill-id">' + escHtml(formatBillId(q.billId)) + '</span>' +
        (q.billTitle ? '<span class="floor-entry-bill-title">' + escHtml(q.billTitle) + '</span>' : '') +
      '</a>'
    : '';

  return (
    '<div class="floor-entry ' + accentClass + (isFirst ? ' floor-entry-first' : '') + '">' +
      '<div class="floor-entry-header">' +
        '<img class="floor-entry-portrait" src="' + escHtml(portrait) + '" alt="' + escHtml(q.name) + '"' +
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
        '<div class="floor-cat-chip cat-' + cat.id + '">' +
          '<div class="floor-cat-chip-icon">' + icon + '</div>' +
          '<div class="floor-cat-chip-count">' + count + '</div>' +
        '</div>' +
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
    groups.slice(1).forEach(({ cat }) => collapsedCats.add(cat.id));
    initialRender = false;
  }

  el.innerHTML = groups.map(renderCategoryCard).join('');
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

function updateLogo(isDark) {
  const logo = document.querySelector('.logo-img');
  if (logo) logo.src = isDark ? 'logo-dark.svg' : 'logo.svg';
}

function toggleTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('lpTheme', isDark ? 'dark' : 'light');
  updateLogo(isDark);
}

// ---- Init ----

async function init() {
  const saved = localStorage.getItem('lpTheme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    const cb = document.getElementById('themeToggle');
    if (cb) cb.checked = true;
    updateLogo(true);
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

  document.querySelectorAll('[data-chamber]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.chamber;
      document.querySelectorAll('[data-chamber]')
        .forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
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

  render();
}

document.addEventListener('DOMContentLoaded', init);
