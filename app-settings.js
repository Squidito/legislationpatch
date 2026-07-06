// app-settings.js — theme, localStorage, filters, zip/state detection (split from app.js 2026-07-06).
// Load order: after app-state.js. Contains the only load-time code besides boot:
// the theme-on-load IIFE (deps: app-state + updateLogoForTheme above it).

// ---- Filters ----


function setupFilters() {
  // Document-level delegation so listener survives filter bar being re-rendered inside renderAll()
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-main]');
    if (!btn) return;
    document.querySelectorAll('[data-main]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeMainFilter = btn.dataset.main;
    renderAll();
  });
}


// ---- Rep tracker setup ----

function setupSettings() {
  const strip = document.getElementById('repStrip');
  if (strip) {
    strip.addEventListener('click', e => {
      const star = e.target.closest('.rep-strip-star');
      if (!star) return;
      const card = star.closest('[data-rep-id]');
      if (!card) return;
      const id = card.dataset.repId;
      if (selectedRepIds.has(id)) selectedRepIds.delete(id);
      else selectedRepIds.add(id);
      const existingTrack = document.querySelector('.shock-quotes-track');
      if (existingTrack) { const m = new DOMMatrix(getComputedStyle(existingTrack).transform); _carouselScroll = m.m41; }
      toggleRepTracked(id, {
        name:  card.dataset.repName,
        party: card.dataset.repParty,
        state: card.dataset.repState,
      });
      renderRepStrip();
    });
  }

}

function loadTrackedSettings() {
  const savedState = localStorage.getItem(STORAGE_KEYS.trackedState);
  const savedReps  = localStorage.getItem(STORAGE_KEYS.trackedReps);
  if (savedState) trackedState = savedState;
  try { trackedReps = savedReps ? JSON.parse(savedReps) : []; }
  catch (err) { trackedReps = []; }
}

function updateLogoForTheme(isDark) {
  const logo = document.querySelector('.logo-img');
  if (logo) logo.src = isDark ? 'logo-dark.svg' : 'logo.svg';
}

function toggleTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('lpTheme', isDark ? 'dark' : 'light');
  updateLogoForTheme(isDark);
}

// Apply theme on load — dark is the default (light only when explicitly chosen)
(function() {
  const isDark = localStorage.getItem('lpTheme') !== 'light';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.addEventListener('DOMContentLoaded', () => {
    const cb = document.getElementById('themeToggle');
    if (cb) cb.checked = isDark;
    updateLogoForTheme(isDark);
  });
})();

function goHome() {
  // favoritesView is only true on favorites.html — toggleFavoritesView() no longer
  // exists (favorites became its own page), so "home" means navigating there.
  if (favoritesView) { window.location.href = 'index.html'; return; }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function loadWatchedBills() {
  try { watchedBills = new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.watchedBills) || '[]')); }
  catch(e) { watchedBills = new Set(); }
}

function toggleWatch(id, e) {
  e && e.stopPropagation();
  watchedBills.has(id) ? watchedBills.delete(id) : watchedBills.add(id);
  localStorage.setItem(STORAGE_KEYS.watchedBills, JSON.stringify([...watchedBills]));
  renderAll();
}

function saveTrackedSettings() {
  localStorage.setItem(STORAGE_KEYS.trackedState, trackedState);
  localStorage.setItem(STORAGE_KEYS.trackedReps, JSON.stringify(trackedReps));
}

function initZipEdit() {
  const el = document.getElementById('zipDisplay');
  if (!el) return;
  el.title = 'Click to change your ZIP code';
  el.addEventListener('click', () => {
    const current = localStorage.getItem(STORAGE_KEYS.trackedZip) || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.maxLength = 5;
    input.className = 'zip-edit-input';
    input.placeholder = '00000';
    let done = false;
    async function commit() {
      if (done) return; done = true;
      const val = input.value.trim();
      input.replaceWith(el);
      if (!/^\d{5}$/.test(val)) return;
      localStorage.setItem(STORAGE_KEYS.trackedZip, val);
      el.textContent = '~' + val;
      try {
        const res = await fetch(`https://api.zippopotam.us/us/${val}`);
        if (!res.ok) return;
        const data = await res.json();
        const stateCode = data.places?.[0]?.['state abbreviation'];
        if (stateCode && US_STATES.some(s => s.code === stateCode)) {
          trackedState = stateCode;
          saveTrackedSettings();
          renderAll();
        }
      } catch(e) { /* silently fail — zip saved, state unchanged */ }
    }
    function cancel() {
      if (done) return; done = true;
      input.replaceWith(el);
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') cancel();
    });
    input.addEventListener('blur', commit);
    el.replaceWith(input);
    input.focus();
    input.select();
  });
}

// Silently detect state and ZIP from IP — no user prompt
async function autoDetectState() {
  const savedZip   = localStorage.getItem(STORAGE_KEYS.trackedZip);
  const savedState = localStorage.getItem(STORAGE_KEYS.trackedState);
  if (savedZip) {
    const zipEl = document.getElementById('zipDisplay');
    if (zipEl) zipEl.textContent = '~' + savedZip;
  }
  initZipEdit();
  // Only skip IP lookup when both state and ZIP are already stored
  if (savedState && savedZip) return;
  try {
    const res  = await fetch('https://ipapi.co/json/');
    if (!res.ok) return;
    const data = await res.json();
    if (!savedState && data.region_code && US_STATES.some(s => s.code === data.region_code)) {
      trackedState = data.region_code;
      saveTrackedSettings();
    }
    if (data.postal && !savedZip) {
      localStorage.setItem(STORAGE_KEYS.trackedZip, data.postal);
      const zipEl = document.getElementById('zipDisplay');
      if (zipEl) zipEl.textContent = '~' + data.postal;
    }
  } catch (e) { /* silently fail — default state used */ }
}

