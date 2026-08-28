// reps.js — Members of Congress library page

// (deduped into util.js 2026-07-06)
// (deduped into util.js 2026-07-06)
const TRACKED_KEY       = 'lpTrackedReps';
let repSlugIndex = {};   // bioguide -> /rep/<slug>/ slug; loaded in init()

// (deduped into util.js 2026-07-06) STATE_NAMES lives in util.js

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const isDark = localStorage.getItem('lpTheme') !== 'light';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.checked = isDark;
  updateLogoForTheme(isDark);

  try {
    // The rep slug index rides along with the member index so every card links
    // straight to the static /rep/<slug>/ page instead of the rep.html?id=
    // redirector. A failed fetch leaves it {} and the links fall back.
    const [res, repSlugRes] = await Promise.all([
      fetch('data/reps-index.json'),
      fetch('data/rep-slug-index.json').catch(() => null),
    ]);
    if (!res.ok) throw new Error('fetch failed');
    const index = await res.json();
    if (repSlugRes && repSlugRes.ok) {
      try { repSlugIndex = await repSlugRes.json(); } catch (_) {}
    }

    const countEl = document.getElementById('pageHeadCount');
    if (countEl) {
      const total = Object.values(index)
        .reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
      if (total) countEl.textContent = total;
    }

    renderRepsPage(index);
  } catch (err) {
    document.getElementById('loadingState').innerHTML = '<p style="color:var(--text-2);padding:1rem">Could not load representatives data.</p>';
  }
}

// ---- Theme ----

// (deduped into util.js 2026-07-06)

// (deduped into util.js 2026-07-06)

// ---- Tracking ----

function getTrackedReps() {
  try { return JSON.parse(localStorage.getItem(TRACKED_KEY) || '[]'); }
  catch { return []; }
}

function saveTrackedReps(reps) {
  localStorage.setItem(TRACKED_KEY, JSON.stringify(reps));
}

function toggleTrack(id, fallback) {
  let reps = getTrackedReps();
  const idx = reps.findIndex(r => r.id === id);
  if (idx >= 0) {
    reps.splice(idx, 1);
  } else {
    reps.push({ id, name: fallback.name || id, party: fallback.party || 'n', state: fallback.state || '', source: 'reps-page' });
  }
  saveTrackedReps(reps);
  refreshTrackState();
}

function refreshTrackState() {
  const tracked = getTrackedReps();
  document.querySelectorAll('.reps-rep-card').forEach(card => {
    const id    = card.dataset.id;
    const isTr  = tracked.some(r => r.id === id);
    card.classList.toggle('tracked', isTr);
    const btn   = card.querySelector('.reps-rep-fav-btn');
    if (!btn) return;
    btn.classList.toggle('tracked', isTr);
    btn.innerHTML  = isTr ? '&#9733;' : '&#9734;';
    const lastName = btn.dataset.repName ? repLastName(btn.dataset.repName) : '';
    btn.title      = (isTr ? 'Untrack ' : 'Track ') + lastName;
  });
}

// ---- Render ----

function renderRepsPage(index) {
  const page     = document.getElementById('repsPage');
  const loading  = document.getElementById('loadingState');
  const tracked  = getTrackedReps();
  const myState  = localStorage.getItem('lpTrackedState');

  const states  = Object.keys(index).sort((a, b) => (STATE_NAMES[a] || a).localeCompare(STATE_NAMES[b] || b));
  const ordered = (myState && index[myState])
    ? [myState, ...states.filter(s => s !== myState)]
    : states;

  // Populate jump select
  const jumpSelect = document.getElementById('stateJump');
  if (jumpSelect) {
    jumpSelect.innerHTML = '<option value="">Jump to state…</option>' +
      states.map(code => `<option value="${escHtml(code)}">${escHtml(STATE_NAMES[code] || code)}</option>`).join('');
    jumpSelect.addEventListener('change', e => {
      const code = e.target.value;
      if (!code) return;
      const section = document.querySelector(`.reps-state-section[data-state="${CSS.escape(code)}"]`);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      e.target.value = '';
    });
  }

  page.innerHTML = ordered.map((code, idx) => {
    const reps     = index[code] || [];
    const byLast   = (a, b) => repLastName(a.name).localeCompare(repLastName(b.name));
    const senators = reps.filter(r => r.role === 'Senator').sort(byLast);
    const house    = reps.filter(r => r.role !== 'Senator').sort(byLast);
    const name     = STATE_NAMES[code] || code;
    const isHome   = myState && code === myState;
    const open     = idx === 0;

    return `<div class="reps-state-section${open ? '' : ' collapsed'}" data-state="${escHtml(code)}">
      <div class="reps-state-header reps-state-toggle">
        <span>${escHtml(name)}${isHome ? ' <span class="reps-your-state">Your state</span>' : ''}</span>
        <svg class="reps-state-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="reps-state-body">
        ${chamberHtml('Senate', senators, tracked)}
        ${chamberHtml('House', house, tracked)}
      </div>
    </div>`;
  }).join('');

  loading.style.display = 'none';
  page.style.display    = 'block';

  page.querySelectorAll('.reps-carousel').forEach(setupCarouselDrag);

  page.addEventListener('click', e => {
    const toggle = e.target.closest('.reps-state-toggle');
    if (toggle) {
      toggle.closest('.reps-state-section').classList.toggle('collapsed');
      return;
    }
    const btn = e.target.closest('.reps-rep-fav-btn');
    if (!btn) return;
    toggleTrack(btn.dataset.repId, { name: btn.dataset.repName, party: btn.dataset.repParty, state: btn.dataset.repState });
  });

  setupHoverCards(page);
}

function chamberHtml(label, members, tracked) {
  if (!members.length) return '';
  return `<div class="reps-chamber-section">
    <div class="reps-chamber-label">${escHtml(label)}</div>
    <div class="reps-carousel">${members.map(r => repPageCardHtml(r, tracked)).join('')}</div>
  </div>`;
}

function repPageCardHtml(rep, tracked) {
  const id       = rep.bioguideId || rep.id || rep.name;
  const party    = rep.party || 'I';
  const state    = rep.state || '';
  const name     = rep.name || '';
  const lastName = repLastName(name);
  const color    = partyColor(party);
  const imgSrc   = portraitUrl(rep.bioguideId);
  const isTr     = tracked.some(r => r.id === id);

  return `<div class="reps-rep-card${isTr ? ' tracked' : ''}" data-id="${escHtml(id)}">
    <a href="${escHtml(repProfileHref(repSlugIndex, id, 'reps'))}" class="reps-rep-portrait-link" style="--party-color:${color};" title="View ${escHtml(name)}">
      <div class="rep-ring"><img src="${imgSrc}" alt="${escHtml(name)}" onerror="this.src='${FALLBACK_PORTRAIT}'" /></div>
      <span class="rep-badge">${escHtml(state)}</span>
    </a>
    <div class="reps-rep-name">${escHtml(lastName)}</div>
    <button class="reps-rep-fav-btn${isTr ? ' tracked' : ''}"
            data-rep-id="${escHtml(id)}"
            data-rep-name="${escHtml(name)}"
            data-rep-party="${escHtml(party)}"
            data-rep-state="${escHtml(state)}"
            title="${isTr ? 'Untrack' : 'Track'} ${escHtml(lastName)}">${isTr ? '&#9733;' : '&#9734;'}</button>
  </div>`;
}

// ---- Hover card ----

const _repCache = {};

function setupHoverCards(page) {
  const hoverEl = getHoverCardEl();
  let hideTimer = null;
  let showTimer = null;

  page.addEventListener('mouseover', e => {
    const card = e.target.closest('.reps-rep-card');
    if (!card) return;
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = setTimeout(() => showHoverCard(card.dataset.id, card, hoverEl), 250);
  });

  page.addEventListener('mouseout', e => {
    const card = e.target.closest('.reps-rep-card');
    if (!card) return;
    const to = e.relatedTarget;
    if (to && (to === hoverEl || hoverEl.contains(to))) return;
    clearTimeout(showTimer);
    hideTimer = setTimeout(() => hideHoverCard(hoverEl), 120);
  });

  hoverEl.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  hoverEl.addEventListener('mouseleave', () => {
    clearTimeout(showTimer);
    hideTimer = setTimeout(() => hideHoverCard(hoverEl), 120);
  });
}

function getHoverCardEl() {
  let el = document.getElementById('repHoverCard');
  if (!el) {
    el = document.createElement('div');
    el.id = 'repHoverCard';
    el.className = 'rep-hover-card';
    document.body.appendChild(el);
  }
  return el;
}

async function showHoverCard(id, anchor, cardEl) {
  if (!id) return;

  let rep = _repCache[id];
  if (!rep) {
    try {
      const res = await fetch(`data/reps/${id}.json`);
      if (!res.ok) return;
      rep = await res.json();
      _repCache[id] = rep;
    } catch { return; }
  }

  cardEl.innerHTML = buildHoverCardHtml(rep);

  const CARD_W = 280;
  const rect   = anchor.getBoundingClientRect();
  let left     = rect.left + rect.width / 2 - CARD_W / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - CARD_W - 8));

  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow >= 240 || spaceBelow >= rect.top
    ? rect.bottom + 8
    : rect.top - 8 - (cardEl.offsetHeight || 220);

  cardEl.style.left  = left + 'px';
  cardEl.style.top   = top + 'px';
  cardEl.style.width = CARD_W + 'px';
  cardEl.classList.add('visible');
}

function hideHoverCard(cardEl) {
  cardEl.classList.remove('visible');
}

function buildHoverCardHtml(rep) {
  const id      = rep.bioguideId || '';
  const party   = rep.party || 'I';
  const color   = partyColor(party);
  const imgSrc  = portraitUrl(id);
  const chamber = rep.role === 'Senator' ? 'Senate' : 'House';
  const meta    = [party, rep.state, chamber].filter(Boolean).join(' · ');
  const bio     = rep.bio ? rep.bio.slice(0, 160).replace(/\s\S+$/, '') + '…' : '';

  const votes  = rep.voteHistory || [];
  const yea    = votes.filter(v => v.vote === 'Yea').length;
  const nay    = votes.filter(v => v.vote === 'Nay').length;
  const total  = votes.length;
  const nv     = total - yea - nay;

  const voteBarHtml = total ? `
    <div class="rep-hc-votes">
      <div class="rep-hc-vote-bar">
        <div class="rep-hc-vote-yea" style="width:${(yea/total*100).toFixed(1)}%"></div>
        <div class="rep-hc-vote-nay" style="width:${(nay/total*100).toFixed(1)}%"></div>
      </div>
      <div class="rep-hc-vote-label">${yea} Yea \xB7 ${nay} Nay${nv > 0 ? ` \xB7 ${nv} NV` : ''}</div>
    </div>` : '';

  return `
    <div class="rep-hc-header">
      <a href="${escHtml(repProfileHref(repSlugIndex, id, 'reps'))}" class="rep-hc-portrait" style="--party-color:${color};">
        <div class="rep-ring"><img src="${imgSrc}" alt="${escHtml(rep.name)}" onerror="this.src='${FALLBACK_PORTRAIT}'" /></div>
      </a>
      <div class="rep-hc-info">
        <div class="rep-hc-name">${escHtml(rep.name)}</div>
        <div class="rep-hc-meta">${escHtml(meta)}</div>
      </div>
    </div>
    ${bio ? `<p class="rep-hc-bio">${escHtml(bio)}</p>` : ''}
    ${voteBarHtml}
    <a href="${escHtml(repProfileHref(repSlugIndex, id, 'reps'))}" class="rep-hc-link">View profile →</a>`;
}

// ---- Carousel drag-to-scroll ----

function setupCarouselDrag(el) {
  let isDragging = false, startX = 0, startScroll = 0;
  el.addEventListener('mousedown', e => {
    isDragging  = true;
    startX      = e.pageX;
    startScroll = el.scrollLeft;
    el.classList.add('dragging');
    e.preventDefault();
  });
  window.addEventListener('mouseup', () => { isDragging = false; el.classList.remove('dragging'); });
  el.addEventListener('mousemove', e => {
    if (!isDragging) return;
    el.scrollLeft = startScroll - (e.pageX - startX);
  });
}

// ---- Utilities ----

// (deduped into util.js 2026-07-06)

// (deduped into util.js 2026-07-06)

// (deduped into util.js 2026-07-06)

// escHtml() moved to util.js (loaded first on every page).
