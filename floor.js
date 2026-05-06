// floor.js — Floor Activity page (unattributed floor statements, organized by category)

const QUOTES_FILE       = 'data/quotes.json';
const FALLBACK_PORTRAIT = 'https://bioguide.congress.gov/bioguide/photo/P/P000587.jpg';
const FLOOR_FAVS_KEY    = 'lpFloorFavs';

// Categories checked in order — first match wins
const CATEGORIES = [
  {
    id:       'war',
    label:    'War & Foreign Policy',
    abbr:     'WAR',
    keywords: ['iran', 'the war', 'war in', 'war has', 'military', 'hostilities',
               'armed force', 'operation epic', 'sanction', 'combat', 'nato', 'troops'],
  },
  {
    id:       'immigration',
    label:    'Immigration & Border',
    abbr:     'IMMI',
    keywords: ['ice', 'border patrol', 'immigration', 'tps', 'deport', 'haitian',
               'asylum', 'undocumented', 'enforcement operations', 'militarized enforcement'],
  },
  {
    id:       'economy',
    label:    'Economy & Markets',
    abbr:     'ECO',
    keywords: ['federal reserve', 'the fed', 'fed chair', 'central bank', 'interest rate',
               'the markets', 'markets hate', 'inflation', 'tariff', 'deficit', 'fiscal',
               'monetary', 'treasury', 'tax cut', 'tax refund', 'lower rates', 'rates will'],
  },
  {
    id:       'executive',
    label:    'Executive Power',
    abbr:     'EXEC',
    keywords: ['25th amendment', 'kash patel', 'remove the president', 'coercion',
               'fbi director', 'pardon', 'attorney general', 'cabinet must',
               'national security', 'unqualified'],
  },
  {
    id:       'government',
    label:    'Government & Oversight',
    abbr:     'GOV',
    keywords: ['shutdown', 'fema', ' dhs ', 'homeland security', ' tsa ', ' cisa ',
               'coast guard', 'appropriation', 'continuing resolution', 'longest shutdown'],
  },
  {
    id:       'civil',
    label:    'Civil Liberties & Justice',
    abbr:     'CIVIL',
    keywords: ['fisa', 'warrantless', 'surveillance', 'rule of law', 'epstein',
               'contempt', 'breaking the law', 'civil liberties', 'due process',
               'liberty for security', 'foreign intelligence'],
  },
  {
    id:       'other',
    label:    'Other',
    abbr:     '···',
    keywords: [],
  },
];

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function portraitUrl(bioguideId) {
  if (!bioguideId || bioguideId.length < 2) return FALLBACK_PORTRAIT;
  const id = bioguideId.toUpperCase();
  return `https://bioguide.congress.gov/bioguide/photo/${id[0]}/${id}.jpg`;
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

function formatShortDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  allQuotes  = (data.quotes || []).filter(q => !q.billId);
}

// ---- Grouping ----

function buildCategoryGroups(quotes) {
  const filtered = activeFilter === 'all'
    ? quotes
    : quotes.filter(q => chamberFromSource(q.source) === activeFilter);

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

const STAR_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>`;

function renderEntry(q, isFirst) {
  const key      = quoteKey(q);
  const isFav    = floorFavs.has(key);
  const portrait = q.bioguideId ? portraitUrl(q.bioguideId) : FALLBACK_PORTRAIT;
  const repHref  = q.bioguideId ? `rep?id=${escHtml(q.bioguideId)}` : null;

  const party = (q.party || '').toUpperCase()[0] || '';
  const state  = (q.state  || '').toUpperCase();
  const ps     = [party, state].filter(Boolean).join('-');

  const accentClass = q.stance === 'support' ? 'accent-support'
                    : q.stance === 'oppose'  ? 'accent-oppose'
                    : 'accent-neutral';

  const attrInner = `
    <img class="floor-entry-portrait" src="${escHtml(portrait)}" alt="${escHtml(q.name)}"
         onerror="this.src='${FALLBACK_PORTRAIT}'" />
    <span class="floor-entry-speaker">${escHtml(q.name)}</span>
    <span class="floor-entry-meta">${escHtml(ps)} &middot; ${escHtml(q.source)}</span>`;

  return `
    <div class="floor-entry ${accentClass}${isFirst ? ' floor-entry-first' : ''}">
      <div class="floor-entry-body">
        <p class="floor-entry-text">&ldquo;${escHtml(q.text)}&rdquo;</p>
        <button class="star-btn floor-quote-star${isFav ? ' watching' : ''}"
                data-key="${escHtml(key)}"
                onclick="toggleQuoteFav(this.dataset.key);event.stopPropagation()"
                title="${isFav ? 'Remove from saved' : 'Save quote'}">${STAR_SVG}</button>
      </div>
      ${repHref
        ? `<a class="floor-entry-attr" href="${repHref}">${attrInner}</a>`
        : `<div class="floor-entry-attr">${attrInner}</div>`}
    </div>`;
}

function renderCategoryCard({ cat, quotes }) {
  const isCollapsed = collapsedCats.has(cat.id);
  const latestDate  = formatShortDate(parseSourceDate(quotes[0].source));
  const count       = quotes.length;
  const metaStr     = `${count} statement${count !== 1 ? 's' : ''} &middot; most recent ${escHtml(latestDate)}`;

  return `
    <div class="bill-card floor-cat-card" id="floor-cat-${cat.id}">
      <div class="floor-cat-header" onclick="toggleCategory('${cat.id}')">
        <div class="floor-cat-chip cat-${cat.id}">${escHtml(cat.abbr)}</div>
        <div class="floor-cat-info">
          <div class="floor-cat-name">${escHtml(cat.label)}</div>
          <div class="floor-cat-meta">${metaStr}</div>
        </div>
        <div class="bill-actions-col">
          <span class="chevron${isCollapsed ? '' : ' open'}"></span>
        </div>
      </div>
      <div class="floor-cat-body${isCollapsed ? '' : ' open'}">
        ${quotes.map((q, i) => renderEntry(q, i === 0)).join('')}
      </div>
    </div>`;
}

function render() {
  const groups = buildCategoryGroups(allQuotes);
  const el     = document.getElementById('floorContent');

  if (!groups.length) {
    el.innerHTML = '<p class="floor-empty">No floor statements found for this filter.</p>';
    return;
  }

  if (initialRender) {
    groups.slice(1).forEach(({ cat }) => collapsedCats.add(cat.id));
    initialRender = false;
  }

  el.innerHTML = groups.map(renderCategoryCard).join('');
}

// ---- Favorites ----

function toggleQuoteFav(key) {
  if (floorFavs.has(key)) floorFavs.delete(key);
  else floorFavs.add(key);
  saveFavs();
  render();
}

// ---- Category toggle ----

function toggleCategory(id) {
  const card = document.getElementById(`floor-cat-${id}`);
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

  render();
}

document.addEventListener('DOMContentLoaded', init);
