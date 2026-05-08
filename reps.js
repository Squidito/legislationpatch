// reps.js — Members of Congress library page

const FALLBACK_PORTRAIT = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44'%3E%3Crect width='44' height='44' fill='%23374151'/%3E%3Ccircle cx='22' cy='16' r='9' fill='%236b7280'/%3E%3Cellipse cx='22' cy='40' rx='15' ry='11' fill='%236b7280'/%3E%3C/svg%3E";
const PHOTO_OVERRIDES   = { 'C001115': 'https://clerk.house.gov/images/members/C001115.jpg' };
const TRACKED_KEY       = 'lpTrackedReps';

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

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const isDark = localStorage.getItem('lpTheme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.checked = isDark;
  updateLogoForTheme(isDark);

  try {
    const res   = await fetch('data/reps-index.json');
    if (!res.ok) throw new Error('fetch failed');
    const index = await res.json();
    renderRepsPage(index);
  } catch (err) {
    document.getElementById('loadingState').innerHTML = '<p style="color:var(--text-2);padding:1rem">Could not load representatives data.</p>';
  }
}

// ---- Theme ----

function toggleTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('lpTheme', isDark ? 'dark' : 'light');
  updateLogoForTheme(isDark);
}

function updateLogoForTheme(isDark) {
  const logo = document.querySelector('.logo-img');
  if (logo) logo.src = isDark ? 'logo-dark.svg' : 'logo.svg';
}

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
  const page    = document.getElementById('repsPage');
  const loading = document.getElementById('loadingState');
  const tracked = getTrackedReps();

  const states  = Object.keys(index).sort((a, b) => (STATE_NAMES[a] || a).localeCompare(STATE_NAMES[b] || b));

  page.innerHTML = states.map(code => {
    const reps     = index[code] || [];
    const byLast   = (a, b) => repLastName(a.name).localeCompare(repLastName(b.name));
    const senators = reps.filter(r => r.role === 'Senator').sort(byLast);
    const house    = reps.filter(r => r.role !== 'Senator').sort(byLast);
    const name     = STATE_NAMES[code] || code;

    return `<div class="reps-state-section">
      <div class="reps-state-header">${escHtml(name)}</div>
      ${chamberHtml('Senate', senators, tracked)}
      ${chamberHtml('House', house, tracked)}
    </div>`;
  }).join('');

  loading.style.display = 'none';
  page.style.display    = 'block';

  page.querySelectorAll('.reps-carousel').forEach(setupCarouselDrag);

  page.addEventListener('click', e => {
    const btn = e.target.closest('.reps-rep-fav-btn');
    if (!btn) return;
    toggleTrack(btn.dataset.repId, { name: btn.dataset.repName, party: btn.dataset.repParty, state: btn.dataset.repState });
  });
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
    <a href="rep?id=${escHtml(id)}&ref=reps" class="reps-rep-portrait-link" style="--party-color:${color};" title="View ${escHtml(name)}">
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

function repLastName(name) {
  const clean = String(name || '').replace(/^(Sen\.|Rep\.|Dr\.|Mr\.|Ms\.) /, '');
  const parts  = clean.trim().split(' ');
  return parts[parts.length - 1] || clean;
}

function partyColor(party) {
  const p = String(party || '').trim().toUpperCase()[0];
  if (p === 'D') return '#3b82f6';
  if (p === 'R') return '#ef4444';
  return '#8b5cf6';
}

function portraitUrl(bioguideId) {
  if (!bioguideId || typeof bioguideId !== 'string' || bioguideId.length < 2) return FALLBACK_PORTRAIT;
  const id = bioguideId.toUpperCase();
  return PHOTO_OVERRIDES[id] || `https://bioguide.congress.gov/bioguide/photo/${id[0]}/${id}.jpg`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
