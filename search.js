// search.js — site search page (search.html). Self-contained like floor.js —
// does NOT load the app-*.js set. Deps: util.js (escHtml, toggleTheme,
// updateLogoForTheme) and search-lib.js (searchRecords, SEARCH_TYPE_ORDER),
// both loaded before this file.

(function () {
  const GROUP_LABEL = { bill: 'Bills', rep: 'Representatives', quote: 'Floor Quotes', article: 'Guides' };
  const BADGE_LABEL = { bill: 'BILL', rep: 'REP', quote: 'QUOTE', article: 'GUIDE' };
  const GROUP_CAP = 8;    // per-type rows shown in "All" view before "Show all"
  const FLAT_CAP = 50;    // rows per page in single-type view

  let records = [];
  let counts = null;
  let activeType = 'all';
  let expandedGroups = new Set();
  let flatShown = FLAT_CAP;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    // Theme — same key + helpers as the rest of the site (dark is the default)
    const isDark = localStorage.getItem('lpTheme') !== 'light';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.checked = isDark;
    updateLogoForTheme(isDark);

    const input = document.getElementById('searchInput');
    const params = new URLSearchParams(location.search);
    input.value = params.get('q') || '';
    const t = params.get('type');
    if (t && GROUP_LABEL[t]) setActiveChip(t);

    document.getElementById('typeChips').addEventListener('click', e => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      setActiveChip(btn.dataset.type);
      expandedGroups = new Set();
      flatShown = FLAT_CAP;
      render();
    });

    document.getElementById('searchResults').addEventListener('click', e => {
      const expand = e.target.closest('[data-expand]');
      if (expand) { expandedGroups.add(expand.dataset.expand); render(); return; }
      if (e.target.closest('[data-more]')) { flatShown += FLAT_CAP; render(); }
    });

    let timer = null;
    const onInput = () => { clearTimeout(timer); timer = setTimeout(() => { expandedGroups = new Set(); flatShown = FLAT_CAP; render(); }, 150); };
    input.addEventListener('input', onInput);
    input.addEventListener('search', onInput);
    input.focus();

    try {
      const ctrl = new AbortController();
      const t10 = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch('/data/search-index.json', { signal: ctrl.signal });
      clearTimeout(t10);
      if (!res.ok) throw new Error('Search index not found');
      const data = await res.json();
      records = data.records || [];
      counts = data.counts || null;
    } catch (e) {
      document.getElementById('searchStatus').textContent = 'Search is unavailable right now — please try again later.';
      return;
    }
    render();
  }

  function setActiveChip(type) {
    activeType = type;
    document.querySelectorAll('#typeChips [data-type]').forEach(b =>
      b.classList.toggle('active', b.dataset.type === type));
  }

  function syncUrl(q) {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (activeType !== 'all') p.set('type', activeType);
    const qs = p.toString();
    // location.pathname (not a hard-coded 'search.html') — local `serve` clean-urls
    // strips the .html; GH Pages serves both. Keep whichever path we landed on.
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  }

  function render() {
    const q = document.getElementById('searchInput').value.trim();
    const status = document.getElementById('searchStatus');
    const out = document.getElementById('searchResults');
    syncUrl(q);

    if (searchTokenize(q).length === 0) {
      status.textContent = counts
        ? `Search ${counts.bill} bills, ${counts.rep} representatives, ${counts.quote} floor quotes, and ${counts.article} guides.`
        : 'Search bills, representatives, floor quotes, and guides.';
      out.innerHTML = '';
      return;
    }

    const results = searchRecords(records, q, activeType);
    if (!results.length) {
      status.textContent = '';
      out.innerHTML = `<div class="empty-state">No results for &ldquo;${escHtml(q)}&rdquo;${activeType !== 'all' ? ' in ' + GROUP_LABEL[activeType] : ''}.</div>`;
      return;
    }
    const terms = searchTokenize(q);
    status.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;

    if (activeType === 'all') {
      out.innerHTML = SEARCH_TYPE_ORDER.map(type => {
        const group = results.filter(r => r.t === type);
        if (!group.length) return '';
        const open = expandedGroups.has(type);
        const shown = open ? group : group.slice(0, GROUP_CAP);
        const moreBtn = !open && group.length > GROUP_CAP
          ? `<button class="sr-expand" data-expand="${type}">Show all ${group.length} ${GROUP_LABEL[type].toLowerCase()}</button>`
          : '';
        return `<section class="sr-group">
          <h2 class="sr-group__heading">${GROUP_LABEL[type]} <span class="sr-group__count">(${group.length})</span></h2>
          ${shown.map(r => card(r, terms)).join('')}
          ${moreBtn}
        </section>`;
      }).join('');
    } else {
      const shown = results.slice(0, flatShown);
      const moreBtn = results.length > flatShown
        ? `<button class="sr-expand" data-more="1">Show ${Math.min(FLAT_CAP, results.length - flatShown)} more</button>`
        : '';
      out.innerHTML = shown.map(r => card(r, terms)).join('') + moreBtn;
    }
  }

  function card(r, terms) {
    const text = r.t === 'quote' && r.text ? `&ldquo;${hl(r.text, terms)}&rdquo;` : (r.text ? hl(r.text, terms) : '');
    return `<a class="sr-card" href="${escHtml(r.url)}">
      <span class="sr-badge sr-badge--${r.t}">${BADGE_LABEL[r.t]}</span>
      <span class="sr-card__body">
        <span class="sr-card__title">${hl(r.title, terms)}</span>
        ${r.sub ? `<span class="sr-card__sub">${escHtml(r.sub)}</span>` : ''}
        ${text ? `<span class="sr-card__text">${text}</span>` : ''}
      </span>
    </a>`;
  }

  // Escape first, then wrap matched term prefixes — terms are alphanumeric-only
  // (searchTokenize), so they can't collide with the entities escHtml produces.
  function hl(str, terms) {
    let html = escHtml(String(str || ''));
    if (!terms.length) return html;
    const pattern = terms.slice().sort((a, b) => b.length - a.length).join('|');
    // (^|[^&#\w]) instead of \b so we never match inside an &entity; escHtml emitted
    return html.replace(new RegExp(`(^|[^&#a-zA-Z0-9])(${pattern})`, 'gi'), '$1<mark>$2</mark>');
  }
})();
