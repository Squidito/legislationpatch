// © 2026 Squidito. All rights reserved. Not open source — see LICENSE.
// =============================================
//  app.js — UI rendering and interactions
// =============================================

let allBills      = [];
let openCards        = new Map(); // id -> 'minor' | 'full'
let openDetails      = {};
let aiOutputs        = {};
let activeMainFilter  = 'recent';
let favoritesView          = false;
const collapsedFavSections = new Set();
let selectedRepIds    = new Set();
let standaloneQuotes  = [];
let repsIndex         = {};

// Placeholder shock quotes — replace with live Congressional Record feed when available
const SHOCK_QUOTES = [
  {
    name: 'Rep. Marjorie Taylor Greene', party: 'R', state: 'GA', bioguideId: 'G000596',
    text: 'This spending bill is socialism with a bow on it. We are looting our grandchildren to buy votes today.',
    source: 'House Floor, Apr 22, 2026', billId: '119-HR-1'
  },
  {
    name: 'Rep. Jasmine Crockett', party: 'D', state: 'TX', bioguideId: 'C001127',
    text: 'They cut food stamps for hungry kids and then stood up and applauded themselves. I cannot do this job without screaming sometimes.',
    source: 'House Floor, Apr 21, 2026', billId: '119-HR-1'
  },
  {
    name: 'Sen. Tommy Tuberville', party: 'R', state: 'AL', bioguideId: 'T000278',
    text: 'I do not think we need to be funding mental health programs for people who just do not want to work.',
    source: 'Senate Floor, Apr 20, 2026', billId: '119-HR-1'
  },
  {
    name: 'Rep. Rashida Tlaib', party: 'D', state: 'MI', bioguideId: 'T000481',
    text: 'Every single one of them knew what was in Section 223 and every single one of them voted yes anyway. Remember their names.',
    source: 'House Floor, Apr 23, 2026', billId: '119-HR-1'
  }
];

const STORAGE_KEYS = {
  trackedState:   'lpTrackedState',
  trackedReps:    'lpTrackedReps',
  watchedBills:   'lpWatchedBills',
  trackedZip:     'lpTrackedZip',
};

let watchedBills = new Set();

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

// Demo reps — shown when no Congress API key is configured
const DEMO_REPS = [
  { bioguideId: 'K000367', name: 'Sen. Klobuchar', party: 'D', state: 'MN' },
  { bioguideId: 'C001047', name: 'Sen. Capito',    party: 'R', state: 'WV' },
  { bioguideId: 'W000437', name: 'Sen. Wicker',    party: 'R', state: 'MS' },
  { bioguideId: 'P000034', name: 'Rep. Pallone',   party: 'D', state: 'NJ' },
  { bioguideId: 'B001261', name: 'Sen. Barrasso',  party: 'R', state: 'WY' },
  { bioguideId: 'M001163', name: 'Rep. Matsui',    party: 'D', state: 'CA' },
];

// NOTE: quotes inside this data-URI MUST stay URL-encoded as %27 — it is embedded
// in onerror="this.src='...'", so a raw ' would close the JS string early and throw
// "Unexpected identifier 'http'" when a portrait 404s. Browsers decode %27 → ' fine.
const FALLBACK_PORTRAIT = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 44 44%27%3E%3Crect width=%2744%27 height=%2744%27 fill=%27%23374151%27/%3E%3Ccircle cx=%2722%27 cy=%2716%27 r=%279%27 fill=%27%236b7280%27/%3E%3Cellipse cx=%2722%27 cy=%2740%27 rx=%2715%27 ry=%2711%27 fill=%27%236b7280%27/%3E%3C/svg%3E";

let trackedState = 'TX';
let trackedReps  = [];

// ---- Boot ----

document.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('billList')) return;
  loadTrackedSettings();
  loadWatchedBills();
  setupSettings();

  if (window.FAVORITES_PAGE) {
    showLoading(true);
    try {
      [allBills, standaloneQuotes] = await Promise.all([
        fetchRecentBills(),
        fetchStandaloneQuotes()
      ]);
    } catch(e) {
      showError(true, e.message);
    } finally {
      showLoading(false);
    }
    renderFavoritesView();
    return;
  }

  await autoDetectState();
  fetchStandaloneQuotes().then(q => { standaloneQuotes = q; });
  fetchRepsIndex().then(idx => { repsIndex = idx; renderRepStrip(); });
  setupRepStripDrag();
  renderRepStrip();
  loadBills();
  setupFilters();
});


// ---- Load bills ----

async function loadBills() {
  const btn = document.getElementById('refreshBtn');
  if (btn) { btn.classList.add('spinning'); btn.disabled = true; }

  showLoading(true);
  showError(false);

  try {
    allBills = await fetchRecentBills();
    renderAll();
    renderRepStrip(); // rebuild strip now that bill sponsors/quotes are available

    // Handle incoming nav context (from rep page → bill, or fav shortcut)
    const urlP     = new URLSearchParams(location.search);
    const scrollTo = urlP.get('scrollTo');
    const fromRep  = urlP.get('fromRep');
    const repName  = urlP.get('repName');
    if (scrollTo) scrollToBill(scrollTo);
    if (fromRep && repName) {
      const banner = document.getElementById('repBackBanner');
      const link   = document.getElementById('repBackLink');
      if (banner && link) {
        link.href        = `rep?id=${encodeURIComponent(fromRep)}&ref=${window.BILLS_PAGE ? 'bills' : 'home'}`;
        link.textContent = `← ${repName}`;
        banner.style.display = 'flex';
      }
    }
  } catch (e) {
    console.error(e);
    showError(true, e.message);
  } finally {
    showLoading(false);
    if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
  }
}

function showLoading(on) {
  document.getElementById('loadingState').style.display = on ? 'block' : 'none';
  document.getElementById('billList').style.display     = on ? 'none'  : 'block';
}

function showError(on, msg) {
  const el = document.getElementById('errorState');
  if (!el) return;
  el.style.display = on ? 'block' : 'none';
  if (msg) { const em = document.getElementById('errorMsg'); if (em) em.textContent = msg; }
}

// ---- Filters ----

// "Enacted" = signed into law (stage 'signed'). Permanent once enacted — no time window.
function isEnacted(bill) {
  return bill && bill.stage === 'signed';
}

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
  if (favoritesView) toggleFavoritesView();
  else window.scrollTo({ top: 0, behavior: 'smooth' });
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

// ---- Portrait helpers ----

const PHOTO_OVERRIDES = {
  'C001115': 'https://clerk.house.gov/images/members/C001115.jpg',
};

function portraitUrl(bioguideId) {
  if (!bioguideId || typeof bioguideId !== 'string' || bioguideId.length < 2) return FALLBACK_PORTRAIT;
  const id = bioguideId.toUpperCase();
  return PHOTO_OVERRIDES[id] || `https://bioguide.congress.gov/bioguide/photo/${id[0]}/${id}.jpg`;
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

function repCardHtml(rep, size) {
  const id       = getRepId(rep);
  const bioguide = rep.bioguideId || (id.length >= 6 ? id : null);
  const party    = rep.party || rep.partyCode || 'I';
  const state    = rep.state || rep.stateCode || trackedState;
  const name     = formatRepName(rep);
  const color    = partyColor(party);
  const tracked  = trackedReps.some(r => r.id === id);
  const imgSrc   = portraitUrl(bioguide);
  const lastName = repLastName(name);
  const nameEl   = size === 'lg' ? `<div class="rep-name">${escHtml(lastName)}</div>` : '';

  return `<a href="rep?id=${escHtml(bioguide || id)}&ref=${window.BILLS_PAGE ? 'bills' : 'home'}" class="rep-card rep-card-${size}${tracked ? ' tracked' : ''}"
               data-id="${escHtml(id)}"
               style="--party-color:${color}; text-decoration: none;"
               title="${escHtml(name)} (${escHtml(party)}-${escHtml(state)})">
    <div class="rep-ring">
      <img src="${imgSrc}" alt="${escHtml(name)}" onerror="this.src='${FALLBACK_PORTRAIT}'" />
    </div>
    <span class="rep-badge">${escHtml(state)}</span>
    ${nameEl}
  </a>`;
}

// ---- Rep strip (8 portraits in controls bar) ----

function renderRepStrip() {
  const strip = document.getElementById('repStrip');
  if (!strip) return;

  const seen = new Set();
  const pool = [];

  const hasLocal = repsIndex[trackedState]?.length > 0;

  if (hasLocal) {
    // 1. Tracked reps first
    trackedReps.forEach(rep => {
      const id = getRepId(rep);
      if (id && !seen.has(id)) { seen.add(id); pool.push(rep); }
    });

    // 2. Local state reps fill the rest
    repsIndex[trackedState].forEach(rep => {
      const id = getRepId(rep);
      if (id && !seen.has(id)) { seen.add(id); pool.push(rep); }
    });
  } else {
    // Fallback: most recent quote speakers
    buildQuotePool()
      .filter(q => q.bioguideId)
      .slice(0, 8)
      .forEach(q => {
        if (!seen.has(q.bioguideId)) {
          seen.add(q.bioguideId);
          pool.push({ bioguideId: q.bioguideId, name: q.name, party: q.party, state: q.state || '' });
        }
      });
  }

  strip.innerHTML = pool.slice(0, 60).map(rep => {
    const id         = getRepId(rep);
    const bg         = rep.bioguideId || (id.length >= 6 ? id : null);
    const color      = partyColor(rep.party || 'I');
    const name       = formatRepName(rep);
    const active     = selectedRepIds.has(id);
    const lastName   = repLastName(name);
    const isTracked  = trackedReps.some(r => r.id === id);
    return `<div class="rep-strip-card${active ? ' rep-selected' : ''}${isTracked ? ' tracked' : ''}"
                 data-rep-id="${escHtml(id)}"
                 data-rep-name="${escHtml(name)}"
                 data-rep-party="${escHtml(rep.party || rep.partyCode || '')}"
                 data-rep-state="${escHtml(rep.state || rep.stateCode || '')}">
      <a href="rep?id=${escHtml(bg || id)}&ref=${window.BILLS_PAGE ? 'bills' : 'home'}" class="rep-strip-portrait-link${active ? ' rep-selected' : ''}" style="--party-color:${color}; text-decoration:none;" title="${escHtml(name)}">
        <div class="rep-ring"><img src="${portraitUrl(bg)}" alt="${escHtml(name)}" onerror="this.src='${FALLBACK_PORTRAIT}'" /></div>
        <span class="rep-badge">${escHtml(rep.state || rep.stateCode || '')}</span>
      </a>
      <div class="rep-name">${escHtml(lastName)}</div>
      <button class="rep-strip-star${isTracked ? ' tracked' : ''}" title="${isTracked ? 'Untrack' : 'Track'} ${escHtml(lastName)}">${isTracked ? '&#9733;' : '&#9734;'}</button>
    </div>`;
  }).join('');
}

// ---- Rep strip drag-to-scroll ----

function setupRepStripDrag() {
  const el = document.getElementById('repStrip');
  if (!el) return;

  let isDragging = false, startX = 0, startScroll = 0;

  el.addEventListener('mousedown', e => {
    isDragging  = true;
    startX      = e.pageX;
    startScroll = el.scrollLeft;
    el.classList.add('dragging');
    e.preventDefault();
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
    el.classList.remove('dragging');
  });
  el.addEventListener('mousemove', e => {
    if (!isDragging) return;
    el.scrollLeft = startScroll - (e.pageX - startX);
  });

  el.addEventListener('touchstart', e => {
    startX      = e.touches[0].pageX;
    startScroll = el.scrollLeft;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    el.scrollLeft = startScroll - (e.touches[0].pageX - startX);
  }, { passive: true });
}

// ---- Toggle tracking for a rep ----

function toggleRepTracked(id, fallback = {}) {
  const idx = trackedReps.findIndex(r => r.id === id);
  if (idx >= 0) {
    trackedReps.splice(idx, 1);
  } else {
    const pool   = [...(repsIndex[trackedState] || []), ...DEMO_REPS];
    const source = pool.find(r => getRepId(r) === id);
    trackedReps.push({
      id,
      name:   formatRepName(source) || fallback.name || id,
      party:  source?.party || source?.partyCode || fallback.party || 'n',
      state:  source?.state || source?.stateCode || fallback.state || trackedState,
      source: 'strip',
    });
  }
  saveTrackedSettings();
  refreshRepStripClasses();
  if (window.FAVORITES_PAGE) renderFavoritesView();
  else renderAll();
}

// Update tracked styling on existing strip cards without rebuilding the pool
function refreshRepStripClasses() {
  const strip = document.getElementById('repStrip');
  if (!strip) return;
  strip.querySelectorAll('.rep-card[data-id]').forEach(card => {
    card.classList.toggle('tracked', trackedReps.some(r => r.id === card.dataset.id));
  });
}


function updateTrackedRep(id, checked) {
  if (checked) {
    if (!trackedReps.find(r => r.id === id)) {
      const source = (repsIndex[trackedState] || []).find(r => getRepId(r) === id);
      trackedReps.push({
        id,
        name:   formatRepName(source) || id,
        party:  source?.party || 'n',
        state:  source?.state || trackedState,
        source: 'state',
      });
    }
  } else {
    trackedReps = trackedReps.filter(r => r.id !== id);
  }
  saveTrackedSettings();
  renderRepStrip();
  renderAll();
}

function isTrackedRep(id) {
  return trackedReps.some(r => r.id === id);
}

function getRepId(rep) {
  if (!rep) return '';
  if (rep.bioguideId) return String(rep.bioguideId);
  if (rep.id)         return String(rep.id);
  if (rep.memberId)   return String(rep.memberId);
  if (rep.name)       return rep.name.trim().toLowerCase();
  if (rep.fullName)   return rep.fullName.trim().toLowerCase();
  if (rep.firstName || rep.lastName) return `${rep.firstName || ''} ${rep.lastName || ''}`.trim().toLowerCase();
  return '';
}

function formatRepName(rep) {
  if (!rep) return '';
  if (rep.name)     return rep.name;
  if (rep.fullName) return rep.fullName;
  if (rep.firstName || rep.lastName) return `${rep.firstName || ''} ${rep.lastName || ''}`.trim();
  return String(rep);
}

function partyInitial(party) {
  if (!party) return 'I';
  const code = String(party).trim().toLowerCase();
  if (code.startsWith('d')) return 'D';
  if (code.startsWith('r')) return 'R';
  if (code.startsWith('i')) return 'I';
  return code.slice(0, 1).toUpperCase() || 'I';
}

function roleClass(role) {
  if (!role) return 'role-grey';
  const lower = role.toLowerCase();
  if (lower.includes('not voted') || lower.includes('pending') || lower.includes('present')) return 'role-grey';
  if (lower.includes('yes') || lower.includes('yea'))   return 'role-yes';
  if (lower.includes('no')  || lower.includes('nay'))   return 'role-no';
  if (lower.includes('sponsored')) return 'role-sponsored';
  return 'role-grey';
}

function extractVotePositions(actions) {
  const entries = [];
  if (!Array.isArray(actions)) return entries;
  const addVote = (vote, source) => {
    const rep      = vote.member || vote.person || vote;
    const decision = String(vote.position || vote.vote || vote.value || vote.votePosition || vote.vote_desc || '').toLowerCase();
    let role = 'Voted';
    if (decision.includes('yea') || decision.includes('yes'))       role = 'Voted Yes';
    else if (decision.includes('nay') || decision.includes('no'))   role = 'Voted No';
    else if (decision.includes('present') || decision.includes('not')) role = 'Not Voted';
    if (rep) entries.push({ rep, role, source });
  };
  actions.forEach(action => {
    const voteArrays = [];
    if (Array.isArray(action.votes))       voteArrays.push(action.votes);
    if (Array.isArray(action.memberVotes)) voteArrays.push(action.memberVotes);
    if (Array.isArray(action.vote))        voteArrays.push(action.vote);
    if (action.rollCallVote) {
      if (Array.isArray(action.rollCallVote.votes))   voteArrays.push(action.rollCallVote.votes);
      if (Array.isArray(action.rollCallVote.members)) voteArrays.push(action.rollCallVote.members);
    }
    voteArrays.forEach(list => list.forEach(vote => addVote(vote, action)));
  });
  return entries;
}

function gatherBillPositions(bill) {
  const positions = [];
  const seen = new Set();
  const addPosition = (rep, role) => {
    const id = getRepId(rep);
    if (!id || seen.has(id)) return;
    seen.add(id);
    positions.push({
      id,
      name:    formatRepName(rep) || bill.sponsor || 'Unknown',
      party:   rep.party || rep.partyCode || 'n',
      role,
      tracked: isTrackedRep(id),
    });
  };
  const sponsors = Array.isArray(bill.raw?.sponsors) ? bill.raw.sponsors : Array.isArray(bill.sponsors) ? bill.sponsors : [];
  if (sponsors.length) {
    addPosition(sponsors[0], 'Sponsored');
    sponsors.slice(1).forEach(r => addPosition(r, 'Co-Sponsored'));
  } else if (bill.sponsor) {
    addPosition({ name: bill.sponsor, party: 'n' }, 'Sponsored');
  }
  extractVotePositions(bill.actions || []).forEach(entry => addPosition(entry.rep, entry.role));
  return positions;
}

function renderPositionsSection(bill) {
  const positions = gatherBillPositions(bill);
  const voteRows  = renderVoteSection(bill);
  if (!positions.length && !voteRows) return '';

  const posHtml = positions.map(pos => {
    // Only show party initial for known parties; skip when the name already
    // embeds party+state like "Sen. Cotton, Tom (R-TX)".
    const pi = partyInitial(pos.party);
    const hasPartyInName = /\([DRIB][A-Z]?-/.test(pos.name);
    const partyStr = (!hasPartyInName && (pi === 'D' || pi === 'R' || pi === 'I')) ? ' ' + pi : '';
    return '<div class="position-row' + (pos.tracked ? ' tracked' : '') + '">'
      + '<span class="position-name">' + escHtml(pos.name) + partyStr + '</span>'
      + '<span class="position-role ' + roleClass(pos.role) + '">' + escHtml(pos.role) + '</span>'
      + '</div>';
  }).join('');

  const sponsorBlock = posHtml
    ? '<div class="positions-votes-divider">Sponsor</div>' + posHtml
    : '';

  return '<div class="positions-section">'
    + '<div class="positions-title">Congressional Positions</div>'
    + (voteRows ? voteRows : '')
    + sponsorBlock
    + '</div>';
}

function renderUnderreportedSection(bill) {
  if (!Array.isArray(bill.underreported) || !bill.underreported.length) return '';
  return `<div class="underreported-section">
    <div class="underreported-title">⚠ Underreported provisions <span class="analysis-tag">analyst judgment</span></div>
    ${bill.underreported.map(item => `<div class="underreported-item">
      <div class="underreported-section-name">${escHtml(item.section || 'Section')}</div>
      <div class="underreported-summary">${billRefHtml(item.summary, bill.id)}</div>
      <div class="underreported-why">${billRefHtml(item.why_unreported, bill.id)}</div>
    </div>`).join('')}
  </div>`;
}

// ---- Render ----

let _carouselRaf      = null;
let _carouselScroll   = null;
let _carouselEpoch    = 0;
let _voteDetailCache  = {};

function setupCarousel() {
  // Bump epoch — any tick or retry from a previous call will see a stale epoch and stop.
  _carouselEpoch++;
  const myEpoch = _carouselEpoch;

  if (_carouselRaf) { cancelAnimationFrame(_carouselRaf); _carouselRaf = null; }

  const grid = document.querySelector('.shock-quotes-grid');
  const el   = grid?.querySelector('.shock-quotes-track');
  if (!el || el.children.length === 0) return;

  // Remove any clones from a prior setup
  el.querySelectorAll('[data-clone="true"]').forEach(n => n.remove());

  const originals = [...el.children];
  if (!originals.length) return;

  // Prepend clones for left-direction infinite wrap
  originals.forEach(card => {
    const clone = card.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('data-clone', 'true');
    el.insertBefore(clone, el.firstChild);
  });
  // Append clones for right-direction infinite wrap
  originals.forEach(card => {
    const clone = card.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.setAttribute('data-clone', 'true');
    el.appendChild(clone);
  });

  // setWidth = width of one set of cards; track holds 3 sets (prepend | originals | append).
  // getBoundingClientRect returns 0 when the parent has display:none (e.g. during initial
  // page load while the loading spinner is shown). Detect that and defer until visible.
  const setWidth = el.children[originals.length].getBoundingClientRect().left
                 - el.children[0].getBoundingClientRect().left;

  if (setWidth === 0) {
    // Parent is hidden — retry next frame. Epoch check ensures a superseded retry is a no-op.
    _carouselRaf = requestAnimationFrame(() => {
      if (myEpoch !== _carouselEpoch) return;
      setupCarousel();
    });
    return;
  }

  // Resume saved position (negative translateX), or start at the originals (middle set)
  let currentX = (_carouselScroll !== null) ? _carouselScroll : -setWidth;
  _carouselScroll = null;

  el.style.transform = `translateX(${currentX}px)`;
  el.style.willChange = 'transform'; // GPU-accelerate during scroll

  const isHoverDevice = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // Lock grid height on hover devices only — desktop cards overflow via overflow-y:visible
  // so the bill list never shifts. Mobile cards expand naturally (push content down).
  if (isHoverDevice()) grid.style.height = grid.offsetHeight + 'px';

  let paused = false;
  let _willChangePauseTimeout = null;

  grid.addEventListener('mouseenter', () => {
    // Guard before setting paused — some mobile browsers fire synthetic mouseenter on tap,
    // which would freeze the carousel until the user taps elsewhere (mouseleave).
    if (!isHoverDevice()) return;
    paused = true;
    if (_willChangePauseTimeout) { clearTimeout(_willChangePauseTimeout); _willChangePauseTimeout = null; }
    grid.classList.add('sq-expanding');
    // Defer willChange removal to just before card expansion (500 ms CSS delay) so the
    // compositor-layer teardown doesn't jitter surrounding elements on every hover entry.
    _willChangePauseTimeout = setTimeout(() => {
      _willChangePauseTimeout = null;
      el.style.willChange = 'auto';
    }, 450);
  });
  grid.addEventListener('mouseleave', () => {
    isDragging = false;
    grid.classList.remove('dragging');
    if (!isHoverDevice()) return;
    paused = false;
    if (_willChangePauseTimeout) { clearTimeout(_willChangePauseTimeout); _willChangePauseTimeout = null; }
    grid.classList.remove('sq-expanding');
    setTimeout(() => {
      if (el.style.willChange === 'auto') el.style.willChange = 'transform';
    }, 350);
  });

  // ── Mobile hold-to-expand (always registered; CSS pointer:coarse controls display) ──
  {
    let holdTimer = null, holdCard = null;

    function mobileExpand(card)   { card.classList.add('sq-expanded'); }
    function mobileCollapse(card) { card.classList.remove('sq-expanded'); }
    function cancelHold() {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (holdCard) { holdCard.classList.remove('sq-filling'); holdCard = null; }
    }

    el.addEventListener('touchstart', e => {
      const card = e.target.closest('.shock-quote-card:not([data-clone])');
      if (!card || e.target.closest('a')) return;
      if (el.querySelector('.shock-quote-card.sq-expanded')) return; // card open — X handles close
      // Cancel any in-progress fill on a different card
      if (holdCard && holdCard !== card) cancelHold();
      holdCard = card;
      card.classList.add('sq-filling');
      holdTimer = setTimeout(() => {
        holdTimer = null; holdCard = null;
        card.classList.remove('sq-filling');
        el.querySelectorAll('.shock-quote-card.sq-expanded').forEach(c => mobileCollapse(c));
        mobileExpand(card);
      }, 1000);
    }, { passive: true });

    el.addEventListener('touchend', cancelHold, { passive: true });

    // Tap any X ring to close — X shows on all cards when one is expanded
    el.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      if (e.target.closest('.sq-ring')) {
        el.querySelectorAll('.shock-quote-card.sq-expanded').forEach(c => mobileCollapse(c));
      }
    });
  }

  let isDragging = false, startX = 0, startCurrentX = 0, didDrag = false;
  grid.addEventListener('mousedown', e => {
    isDragging    = true;
    didDrag       = false;
    startX        = e.pageX;
    startCurrentX = currentX;
    grid.classList.add('dragging');
  });
  grid.addEventListener('mouseup', () => { isDragging = false; grid.classList.remove('dragging'); });
  grid.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.pageX - startX;
    if (Math.abs(dx) > 4) didDrag = true;
    currentX = startCurrentX + dx * 1.8;
  });
  // Swallow clicks that followed an actual drag so links don't fire after scrolling
  grid.addEventListener('click', e => {
    if (didDrag) { didDrag = false; e.preventDefault(); e.stopPropagation(); }
  }, true);

  grid.addEventListener('touchstart', e => {
    startX        = e.touches[0].pageX;
    startCurrentX = currentX;
  }, { passive: true });
  grid.addEventListener('touchmove', e => {
    currentX = startCurrentX + (e.touches[0].pageX - startX);
  }, { passive: true });

  const SPEED = 0.125; // subpixel float — no accumulator needed with transform

  function tick() {
    // Stop if a newer setupCarousel call has superseded this one.
    if (myEpoch !== _carouselEpoch) return;

    if (!paused) currentX -= SPEED;

    // Wrap runs every frame so dragging near a boundary also wraps correctly.
    if (currentX <= -(setWidth * 2)) {
      currentX      += setWidth;
      startCurrentX += setWidth;
    } else if (currentX >= 0) {
      currentX      -= setWidth;
      startCurrentX -= setWidth;
    }

    // Apply transform when auto-scrolling OR when user is manually dragging while hovering.
    if (!paused || isDragging) el.style.transform = `translateX(${currentX}px)`;

    _carouselRaf = requestAnimationFrame(tick);
  }

  _carouselRaf = requestAnimationFrame(tick);
}

// Bills page header readout: net legislative movement over a recent window.
// Widens 7d -> 30d if the data is quiet, falls back to a tracked-total if fully stale.
function renderBillActivity() {
  const host = document.getElementById('pageHeadStat');
  if (!host || !allBills.length) return;

  const DAY = 86400000;
  const dateOf = b => {
    const ds = b.stageDate || b.enactedDate || b.date;
    const t  = ds ? new Date(ds).getTime() : NaN;
    return isNaN(t) ? null : t;
  };
  // Anchor the window to the dataset's most recent activity, NOT the wall clock —
  // the data updates in batches, so a Date.now() window would silently shrink to
  // zero as real days pass with no new data ("4 advanced" quietly becoming "1").
  const anchor = Math.max(...allBills.map(dateOf).filter(t => t !== null));
  const isFinal = b => b.stage === 'signed' || b.stage === 'dead' || b.stage === 'vetoed';
  const within = (b, days) => {
    const t = dateOf(b);
    return t !== null && (anchor - t) <= days * DAY;
  };
  const tally = days => {
    const active = allBills.filter(b => within(b, days));
    return {
      advanced: active.filter(b => !isFinal(b)).length,
      enacted:  active.filter(b => b.stage === 'signed').length,
      dead:     active.filter(b => b.stage === 'dead' || b.stage === 'vetoed').length,
      total:    active.length,
    };
  };

  // "Latest activity" (not "Past 7 days") because the window is anchored to the
  // data's newest date, not the wall clock — so it stays honest when the data is
  // a few days/weeks stale, and it covers the 7d->30d widen without leaking it.
  const label = 'Latest activity';
  let d = tally(7);
  if (!d.total) d = tally(30);
  if (!d.total) {
    host.innerHTML =
      '<div class="page-head-stat-num">' + allBills.length + '</div>' +
      '<div class="page-head-stat-label">Bills tracked</div>';
    return;
  }

  const delta = (n, lbl, cls) => n
    ? '<div class="ph-delta ph-delta--' + cls + '"><span class="ph-delta-num">' + n +
      '</span><span class="ph-delta-label">' + lbl + '</span></div>'
    : '';

  host.innerHTML =
    '<div class="page-head-activity-label">' + label + '</div>' +
    '<div class="page-head-deltas">' +
      delta(d.advanced, 'advanced', 'advanced') +
      delta(d.enacted,  'enacted',  'enacted') +
      delta(d.dead,     'dead',     'dead') +
    '</div>';
}

function renderAll() {
  if (favoritesView) { renderFavoritesView(); return; }

  renderBillActivity();

  const list = document.getElementById('billList');
  const PIPELINE_STAGES = new Set(['introduced', 'committee', 'house', 'senate']);

  const filtered = allBills
    .filter(b => {
      if (activeMainFilter === 'recent')   return true;
      if (activeMainFilter === 'pipeline') return PIPELINE_STAGES.has(b.stage);
      if (activeMainFilter === 'dead')     return b.stage === 'dead' || b.stage === 'vetoed';
      return b.stage === 'signed';
    })
    .filter(b => window.billMatchesCategories ? window.billMatchesCategories(b) : true)
    .sort((a, b) => {
      const da = new Date(a.stageDate || a.enactedDate || a.date || 0);
      const db = new Date(b.stageDate || b.enactedDate || b.date || 0);
      return db - da;
    });

  const existingTrack = document.querySelector('.shock-quotes-track');
  if (existingTrack) { const m = new DOMMatrix(getComputedStyle(existingTrack).transform); _carouselScroll = m.m41; }

  const filterBarHtml = `<div class="bill-filter-bar">
    <div class="filter-row" id="filtersMain">
      <button class="filter-btn${activeMainFilter === 'recent' ? ' active' : ''}" data-main="recent">Recently Updated</button>
      <button class="filter-btn${activeMainFilter === 'enacted' ? ' active' : ''}" data-main="enacted">Enacted</button>
      <button class="filter-btn${activeMainFilter === 'pipeline' ? ' active' : ''}" data-main="pipeline">In the Pipeline</button>
      <button class="filter-btn${activeMainFilter === 'dead' ? ' active' : ''}" data-main="dead">Dead</button>
    </div>
  </div>`;

  const billsHtml = filtered.length
    ? filtered.map((b, i) => renderBill(b, i + 1)).join('')
    : '<div class="empty-state">No bills found for this filter.</div>';

  const sectionLabel = window.BILLS_PAGE ? '' : '<div class="section-label">Recent bills</div>';

  list.innerHTML =
    (window.BILLS_PAGE ? '' : renderShockQuotesSection()) +
    filterBarHtml +
    sectionLabel +
    billsHtml;

  setupCarousel();
  if (typeof scanAcronyms === 'function') scanAcronyms(list);
}


// ---- Favorites view ----


function renderFavoritesView() {
  const list = document.getElementById('billList');
  list.innerHTML = '<div class="section-label">Saved</div>' + renderRepsSection() + renderBillsSection() + renderQuotesSection();
}

function favSectionHeader(id, title, count) {
  const isCollapsed = collapsedFavSections.has(id);
  return `<div class="fav-section-header" onclick="toggleFavSection('${id}')">
    <span class="fav-section-title">${title}</span>
    <span class="fav-section-count">${count}</span>
    <span class="chevron${isCollapsed ? '' : ' open'} fav-chevron"></span>
  </div>`;
}

function toggleFavSection(id) {
  if (collapsedFavSections.has(id)) collapsedFavSections.delete(id);
  else collapsedFavSections.add(id);
  const body = document.getElementById(`fav-body-${id}`);
  const chev = body?.previousElementSibling?.querySelector('.chevron');
  const collapsed = collapsedFavSections.has(id);
  if (body) body.classList.toggle('open', !collapsed);
  if (chev) chev.classList.toggle('open', !collapsed);
}

function renderBillsSection() {
  const starredBills = allBills.filter(b => watchedBills.has(b.id));
  const isCollapsed  = collapsedFavSections.has('bills');
  const header       = favSectionHeader('bills', 'Tracked bills', starredBills.length);
  const body         = starredBills.length
    ? starredBills.map((b, i) => renderBill(b, i + 1)).join('')
    : `<div class="fav-empty">
        <div class="fav-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.35">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
          </svg>
        </div>
        <div class="fav-empty-title">No tracked bills yet</div>
        <div class="fav-empty-sub">Tap the star on any bill to track it here.</div>
      </div>`;
  return header + `<div class="fav-section-body${isCollapsed ? '' : ' open'}" id="fav-body-bills">${body}</div>`;
}

function parseFavDate(source) {
  if (!source) return 0;
  const m = source.match(/(\w+ \d+, \d+)$/);
  return m ? (new Date(m[1]).getTime() || 0) : 0;
}

function quoteKeyApp(q) {
  return q.name + '|' + q.source + '|' + (q.text || '').slice(0, 40);
}

function removeSavedQuote(key) {
  const favs = new Set(JSON.parse(localStorage.getItem('lpFloorFavs') || '[]'));
  favs.delete(key);
  localStorage.setItem('lpFloorFavs', JSON.stringify([...favs]));
  renderFavoritesView();
}

function renderSavedFloorQuote(q) {
  const key     = quoteKeyApp(q);
  const portrait = q.bioguideId ? portraitUrl(q.bioguideId) : FALLBACK_PORTRAIT;
  const repHref  = q.bioguideId ? `rep?id=${escHtml(q.bioguideId)}&ref=${window.BILLS_PAGE ? 'bills' : 'home'}` : null;
  const accent   = q.stance === 'oppose' ? 'accent-oppose'
                 : q.stance === 'support' ? 'accent-support' : 'accent-neutral';
  return `<div class="fav-quote-card ${accent}">
    <p class="fav-quote-text">&ldquo;${escHtml(q.text)}&rdquo;</p>
    <div class="fav-quote-attr">
      <img class="fav-quote-portrait" src="${escHtml(portrait)}" onerror="this.src='${FALLBACK_PORTRAIT}'" alt="" />
      ${repHref
        ? `<a href="${repHref}" class="fav-quote-speaker">${escHtml(q.name)}</a>`
        : `<span class="fav-quote-speaker">${escHtml(q.name)}</span>`}
      <span class="fav-quote-source">${escHtml(quoteTagline(q))}</span>
      <button class="tracked-rep-untrack" data-key="${escHtml(key)}"
              onclick="removeSavedQuote(this.dataset.key)" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  </div>`;
}

function renderQuotesSection() {
  const favKeys     = new Set(JSON.parse(localStorage.getItem('lpFloorFavs') || '[]'));
  const saved       = standaloneQuotes.filter(q => !q.billId && favKeys.has(quoteKeyApp(q)));
  const isCollapsed = collapsedFavSections.has('quotes');
  const header      = favSectionHeader('quotes', 'Floor statements', saved.length);
  const body        = saved.length
    ? saved.map(renderSavedFloorQuote).join('')
    : `<div class="fav-empty">
        <div class="fav-empty-title">No saved floor statements</div>
        <div class="fav-empty-sub">Tap ★ on any quote on the <a href="floor.html" style="color:var(--purple)">Floor Activity</a> page to save it here.</div>
      </div>`;
  return header + `<div class="fav-section-body${isCollapsed ? '' : ' open'}" id="fav-body-quotes">${body}</div>`;
}

function renderRepsSection() {
  const isCollapsed   = collapsedFavSections.has('reps');
  const sectionHeader = favSectionHeader('reps', 'Tracked reps', trackedReps.length);

  if (!trackedReps.length) {
    return sectionHeader + `<div class="fav-section-body${isCollapsed ? '' : ' open'}" id="fav-body-reps">
      <div class="fav-empty">
        <div class="fav-empty-title">No tracked reps</div>
        <div class="fav-empty-sub">Click a portrait in the rep strip to follow a representative.</div>
      </div>
    </div>`;
  }

  const cards = trackedReps.map(rep => {
    const color   = partyColor(rep.party);
    const imgSrc  = portraitUrl(rep.id);
    const repHref = rep.id ? `rep?id=${escHtml(rep.id)}&ref=${window.BILLS_PAGE ? 'bills' : 'home'}` : null;

    // Combine bill featured quotes + standalone floor quotes, newest first
    const billQuotes  = allBills.flatMap(b =>
      (b.featured_quotes || [])
        .filter(q => q.bioguideId === rep.id)
        .map(q => ({ ...q, context: b.title || b.id }))
    );
    const floorQuotes = standaloneQuotes
      .filter(q => q.bioguideId === rep.id)
      .map(q => ({ ...q, context: q.source }));

    const topTwo = [...billQuotes, ...floorQuotes]
      .sort((a, b) => parseFavDate(b.source) - parseFavDate(a.source))
      .slice(0, 2);

    const quotesHtml = topTwo.length
      ? topTwo.map(q => {
          const accent = q.stance === 'oppose'  ? 'accent-oppose'
                       : q.stance === 'support' ? 'accent-support'
                       : 'accent-neutral';
          return `<div class="tracked-rep-quote-entry ${accent}">
            <p class="tracked-rep-quote-text">&ldquo;${escHtml(q.text)}&rdquo;</p>
            <span class="tracked-rep-quote-ctx">${escHtml(q.context || '')}</span>
          </div>`;
        }).join('')
      : `<div class="tracked-rep-quote-entry accent-neutral">
           <p class="tracked-rep-quote-text fav-empty-sub">No recent quotes in feed.</p>
         </div>`;

    return `<div class="tracked-rep-card" style="--party-color:${color}">
      <div class="tracked-rep-portrait-wrap">
        <a href="${repHref || '#'}">
          <img class="tracked-rep-portrait" src="${imgSrc}"
               onerror="this.src='${FALLBACK_PORTRAIT}'" alt="${escHtml(rep.name)}"
               style="border-color:${color}" />
        </a>
        <span class="rep-badge" style="background:${color}">${escHtml(rep.state || '')}</span>
      </div>
      <div class="tracked-rep-info">
        <div class="tracked-rep-name">
          <a href="${repHref || '#'}" style="color:inherit;text-decoration:none">${escHtml(rep.name)}</a>
        </div>
        <div class="tracked-rep-meta">${escHtml(partyInitial(rep.party))}</div>
        ${quotesHtml}
      </div>
      <button class="tracked-rep-untrack" onclick="toggleRepTracked('${escHtml(rep.id)}')" title="Untrack">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>`;
  }).join('');

  return sectionHeader + `<div class="fav-section-body${collapsedFavSections.has('reps') ? '' : ' open'}" id="fav-body-reps"><div class="tracked-reps-list">${cards}</div></div>`;
}

function renderStatsBar(bills) {
  /* uses the stats-bar CSS class */
  const avgLikelihood = bills.length
    ? Math.round(bills.reduce((s, b) => s + (b.likelihood || 0), 0) / bills.length)
    : 0;
  const underCount = bills.reduce((s, b) => s + (b.underreported?.length || 0), 0);
  const newToday = bills.filter(b => b.analyzed).length;

  // Pick the most notable underreported item for the headline
  const notable = bills.flatMap(b => b.underreported || []).find(u => u?.section);
  const headlineExtra = notable
    ? ` <em>${escHtml(notable.section.split('—')[0].trim())}</em> went unnoticed.`
    : '';

  return `<div style="max-width:960px;margin:0 auto 16px;padding:0 24px">
    <div class="stats-hero">
      <div class="stats-hero-headline">
        <div class="stats-hero-week">This week in Congress</div>
        <div class="stats-hero-text">${bills.length} bill${bills.length !== 1 ? 's' : ''} active.${headlineExtra}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Active bills</div>
        <div class="stat-value">${bills.length}</div>
        <div class="stat-delta neu">tracked in this session</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Avg. likelihood</div>
        <div class="stat-value">${avgLikelihood}%</div>
        <div class="stat-delta ${avgLikelihood >= 50 ? '' : 'neg'}">of passage</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Underreported flags</div>
        <div class="stat-value">${underCount}</div>
        <div class="stat-delta neg">${newToday} with full analysis</div>
      </div>
    </div>
  </div>`;
}

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

function buildQuotePool() {
  const seen = new Set();
  const quotes = [];

  allBills.forEach(bill => {
    (bill.featured_quotes || []).forEach(q => {
      const key = (q.bioguideId || q.name) + '|' + (q.text || '').slice(0, 25);
      if (seen.has(key)) return;
      seen.add(key);
      quotes.push({
        name: q.name, party: q.party, state: q.state,
        bioguideId: q.bioguideId, text: q.text, stance: q.stance,
        chamber: q.chamber || '',
        billId: bill.id, billTitle: bill.title,
        quoteDate: bill.date || '',
        shockScore: computeShockScore(q)
      });
    });
  });

  SHOCK_QUOTES.forEach(q => {
    const key = (q.bioguideId || q.name) + '|' + (q.text || '').slice(0, 25);
    if (seen.has(key)) return;
    seen.add(key);
    const bill = q.billId ? allBills.find(b => b.id === q.billId) : null;
    quotes.push({ ...q, billTitle: bill?.title || null, shockScore: computeShockScore(q) });
  });

  standaloneQuotes.forEach(q => {
    const key = (q.bioguideId || q.name) + '|' + (q.text || '').slice(0, 25);
    if (seen.has(key)) return;
    seen.add(key);
    const bill = q.billId ? allBills.find(b => b.id === q.billId) : null;
    quotes.push({ ...q, billTitle: q.billTitle || bill?.title || null, shockScore: computeShockScore(q) });
  });

  return quotes;
}

function renderShockQuotesSection() {
  const repKey = q => q.bioguideId || (q.name || '').toLowerCase();
  const pool = buildQuotePool();
  if (!pool.length) return '';

  // Featured: top-scoring R + top-scoring D (one of each party)
  const _now = Date.now();
  const recencyBonus = q => {
    let dateStr = q.quoteDate || '';
    if (!dateStr && q.source) {
      const m = q.source.match(/([A-Z][a-z]+ \d+, \d{4})/);
      if (m) dateStr = m[1];
    }
    const d = new Date(dateStr);
    if (isNaN(d)) return 0;
    const days = (_now - d.getTime()) / 86400000;
    if (days <= 30)  return 4;
    if (days <= 90)  return 2;
    if (days <= 180) return 1;
    return 0;
  };
  const sorted = [...pool].sort((a, b) => (b.shockScore + recencyBonus(b)) - (a.shockScore + recencyBonus(a)));
  const featR = sorted.find(q => (q.party || '').toUpperCase().startsWith('R'));
  const featD = sorted.find(q => (q.party || '').toUpperCase().startsWith('D'));
  const featured = [featR, featD].filter(Boolean);
  // Dedup by speaker — each rep appears at most once in the carousel
  const usedReps = new Set(featured.map(repKey));

  // Selected: user-toggled reps in portrait strip — pick their top-shock quote
  const selected = [];
  sorted.forEach(q => {
    if (selectedRepIds.has(q.bioguideId) && !usedReps.has(repKey(q))) {
      selected.push(q); usedReps.add(repKey(q));
    }
  });

  // Tracked: auto-detected reps — top-shock quote per rep
  const trackedIdSet = new Set(trackedReps.map(r => r.id));
  const tracked = [];
  sorted.forEach(q => {
    if ((trackedIdSet.has(q.bioguideId) || trackedIdSet.has(q.name?.toLowerCase())) && !usedReps.has(repKey(q))) {
      tracked.push(q); usedReps.add(repKey(q));
    }
  });

  // Rest: fill, one (top-shock) quote per remaining rep
  const rest = [];
  sorted.forEach(q => {
    if (!usedReps.has(repKey(q))) { rest.push(q); usedReps.add(repKey(q)); }
  });
  const ordered = [...featured, ...selected, ...tracked, ...rest];
  const display = ordered.slice(0, Math.max(8, featured.length + selected.length));

  const html = display.map((q, i) => {
    const isFeatured = i < featured.length;
    const color = partyColor(q.party);
    const repRef   = q.billId ? `&ref=bill-${escHtml(q.billId)}` : '&ref=bills';
    const repHref  = q.bioguideId ? `rep?id=${escHtml(q.bioguideId)}${repRef}` : null;
    const billInCache = q.billId && allBills.some(b => b.id === q.billId);
    const billHref = q.billId
      ? (billInCache ? `bill?id=${escHtml(q.billId)}` : `bill-pending?id=${escHtml(q.billId)}`)
      : null;

    const portraitInner = `
      <img class="shock-quote-portrait" src="${portraitUrl(q.bioguideId)}"
           onerror="this.src='${FALLBACK_PORTRAIT}'" alt="${escHtml(q.name)}"
           style="border: 2px solid ${color}" />
      <div class="shock-quote-rep-text">
        <div class="shock-quote-name">${escHtml(q.name)}</div>
        <div class="shock-quote-source">${escHtml(quoteContext(q))}</div>
      </div>`;

    const headerArea = `<div class="shock-quote-rep-link">${portraitInner}</div>`;

    const quoteBody = `<div class="shock-quote-text">"${escHtml(q.text)}"</div>`;
    // Footer: bill title (truncates) on the left, date pinned right. Statement
    // cards (no bill) drop the redundant "Floor Statement" text — the name-line
    // context already says "… floor statement" — and show just the date.
    const quoteDate = quoteDateCompact(q);
    const billLabel = billHref && q.billTitle
      ? `<a href="${billHref}" class="shock-quote-bill shock-quote-bill--link">${escHtml(q.billTitle)}</a>`
      : (q.billTitle ? `<span class="shock-quote-bill">${escHtml(q.billTitle)}</span>` : '');
    const billFooter = (billLabel || quoteDate)
      ? `<div class="shock-quote-foot">${billLabel}${quoteDate ? `<span class="shock-quote-foot-date">${escHtml(quoteDate)}</span>` : ''}</div>`
      : '';

    return `<div class="shock-quote-card${isFeatured ? ' is-featured' : ''}">
      <span class="sq-corner sq-corner-tl"></span><span class="sq-corner sq-corner-tr"></span><span class="sq-corner sq-corner-bl"></span><span class="sq-corner sq-corner-br"></span>
      <svg class="sq-ring" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><line class="sq-x-line" x1="8" y1="8" x2="18" y2="18"/><line class="sq-x-line" x1="18" y1="8" x2="8" y2="18"/></svg>
      <div class="shock-quote-header">${headerArea}</div>
      ${quoteBody}
      ${billFooter}
    </div>`;
  }).join('');

  const seeAll = window.FLOOR_PAGE ? '' : '<a href="floor.html" class="shock-quotes-see-all">See all &rarr;</a>';
  return `<div class="shock-quotes-section">
    <div class="shock-quotes-label-row">
      <span class="shock-quotes-label">Controversial quotes from the floor</span>
      ${seeAll}
    </div>
    <div class="shock-quotes-grid"><div class="shock-quotes-track">${html}</div></div>
  </div>`;
}

function renderBill(bill, num) {
  const state    = openCards.get(bill.id);
  const col      = likelihoodColor(bill.likelihood);
  const watching = watchedBills.has(bill.id);
  return `<div class="bill-card${bill.isOmnibus ? ' bill-card--omnibus' : (isEnacted(bill) ? ' bill-card--enacted' : '')}" id="card-${bill.id}">
    ${renderHeader(bill, state, num, watching)}
    ${renderLikelihoodFooter(bill, col, state)}
    ${renderMinorBody(bill, col, state === 'minor')}
    ${renderBody(bill, state === 'full', col)}
  </div>`;
}

// formatDateCompact() and sponsorShort() moved to util.js (loaded first on every page).

function renderHeader(bill, state, num, watching) {
  const isOpen     = !!state;
  const lcolor     = bill.likelihood >= 65 ? '#3a7a4f' : bill.likelihood >= 45 ? '#a87d24' : '#a14040';
  const sponsorSrc = bill.sponsor_bioguide ? portraitUrl(bill.sponsor_bioguide) : FALLBACK_PORTRAIT;
  const cosponsors = bill.raw?.cosponsors?.count || bill.cosponsors || 0;
  const pages      = bill.pages || '';
  const version      = bill.version || 'v1.0';
  const introDate    = formatDateCompact(bill.date);
  const stageDateStr = formatDateCompact(bill.stageDate || bill.enactedDate || '');
  // Single date = when the bill reached its current stage (its most recent update),
  // paired with the stage label which says what that update was. Matches mobile.
  const dateDisplay  = stageDateStr || introDate;

  // Compact sponsor/stats row: "BRITT (R-AL) · 53 COSPONSORS · 4 PAGES · 04/28/25 → 01/29/25"
  // (date relocated here off the meta line; last name only; plurals corrected)
  const sponsorMeta = [
    sponsorShort(bill.sponsor),
    cosponsors ? `${cosponsors} COSPONSOR${cosponsors === 1 ? '' : 'S'}` : null,
    pages ? `${pages} PAGE${pages === 1 ? '' : 'S'}` : null,
    dateDisplay || null
  ].filter(Boolean).join(' · ');

  return `<div class="bill-header" onclick="toggleCard('${bill.id}')">
    <div class="bill-rank-col">
      ${bill.isOmnibus ? `<span class="status-badge status-omnibus" data-tip="A large package bill bundling many measures or a full-year appropriations act into one.">OMNIBUS</span>` : ''}
      ${bill.demo ? `<span class="status-badge status-demo">DEMO</span>` : ''}
      ${billTypeBadge(bill)}
      <div class="bill-portrait-wrap">
        <img class="sponsor-portrait" src="${sponsorSrc}" onerror="this.src='${FALLBACK_PORTRAIT}'" alt="${escHtml(bill.sponsor)}" />
      </div>
    </div>
    <div class="bill-title-block">
      <div class="bill-meta-row">
        ${billTypeBadge(bill, true)}
        <span class="bill-meta-compact">${bill.code ? escHtml(bill.code.replace('.', ' ')) : ''}<span class="meta-stage"> · ${escHtml(bill.stageLabel)}</span></span>
      </div>
      <div class="bill-title">${escHtml(bill.title)}</div>
      ${bill.summary ? `<div class="bill-summary">${escHtml(bill.summary)}</div>` : ''}
      <div class="bill-meta">${escHtml(sponsorMeta)}</div>
    </div>
    <div class="bill-actions-col">
      ${isEnacted(bill) && !bill.isOmnibus ? `<span class="status-badge status-enacted" data-tip="Signed into law.">ENACTED</span>` : ''}
      <button class="star-btn${watching ? ' watching' : ''}" onclick="toggleWatch('${bill.id}', event)" title="${watching ? 'Unwatch' : 'Watch this bill'}">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="${watching ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
        </svg>
      </button>
    </div>
  </div>`;
}

function renderTopLines(bill) {
  const items = bill.top_lines || [];
  if (!items.length && !bill.brief) return '';

  const renderLine = item => {
    if (typeof item === 'string') {
      // Legacy flat format
      return `<div class="top-line-item">
        <span class="top-line-bullet">—</span>
        <div class="top-line-content"><div class="top-line-headline">${billRefHtml(item, bill.id)}</div></div>
      </div>`;
    }
    // New headline + subs format
    const tlAnchor = window.BILL_PAGE_ID && item.billSection
      ? (item.billSection.startsWith('title-') ? `bt-${item.billSection}` : `bt-sec-${item.billSection}`)
      : null;
    const headlineHtml = tlAnchor
      ? `<a class="top-line-headline-link" href="#${tlAnchor}" onclick="event.preventDefault();scrollToBillSection('${tlAnchor}')">${escHtml(item.headline || '')}</a>`
      : escHtml(item.headline || '');
    const subs = (item.subs || []).slice(0, 3).map(s =>
      `<div class="top-line-sub">${billRefHtml(s, bill.id, true)}</div>`
    ).join('');
    return `<div class="top-line-item">
      <span class="top-line-bullet">—</span>
      <div class="top-line-content">
        <div class="top-line-headline">${headlineHtml}</div>
        ${subs}
      </div>
    </div>`;
  };

  return `<div class="top-lines">
    ${bill.brief ? `<div class="top-lines-brief">${billRefHtml(bill.brief, bill.id)}</div>` : ''}
    ${items.map(renderLine).join('')}
  </div>`;
}

function renderStageStrip(bill) {
  const stages = ['Introduced', 'Committee', 'House', 'Senate', 'Signed'];
  const idx = bill.currentStep || 0;
  return `<div class="stage-strip">
    ${stages.map((s, i) => {
      const dotCls  = i < idx ? 'done' : i === idx ? 'active' : 'pending';
      const dotSize = i === idx ? '13px' : '9px';
      const lblCls  = i <= idx ? 'stage-strip-label-on' : '';
      const conCls  = i < idx ? 'stage-strip-connector-done' : 'stage-strip-connector-pending';
      return `<div class="stage-strip-step">
        <div class="stage-strip-dot ${dotCls}" style="width:${dotSize};height:${dotSize}"></div>
        <div class="stage-strip-label ${lblCls}">${s}</div>
      </div>${i < stages.length - 1 ? `<div class="stage-strip-connector ${conCls}"></div>` : ''}`;
    }).join('')}
  </div>`;
}

function renderChangesSection(bill) {
  if (!bill.changes) return '';
  const { added = [], modified = [], removed = [] } = bill.changes;
  // Only show for bills that actually change EXISTING law (something modified or
  // removed). Brand-new bills only "add" new law — for them this diff is just
  // confusing (Modified/Removed = None), so the section is hidden entirely; the
  // top-lines already cover what a new bill does. Amendments still show all three.
  if (!modified.length && !removed.length) return '';

  const block = (label, symbol, cls, items) => {
    if (!items.length) return `<div class="patch-block ${cls}">
      <div class="patch-block-label">
        <span class="patch-block-symbol">${symbol}</span>${label}
      </div>
      <div class="patch-block-items"><div class="patch-block-item patch-block-item--none">None</div></div>
    </div>`;
    return `<div class="patch-block ${cls}">
      <div class="patch-block-label">
        <span class="patch-block-symbol">${symbol}</span>${label}
      </div>
      <div class="patch-block-items">${items.map(t => `<div class="patch-block-item">${billRefHtml(t, bill.id)}</div>`).join('')}</div>
    </div>`;
  };

  return `<div class="what-changed-section">
    <div class="what-changed-label">What changed</div>
    <div class="what-changed-grid">
      ${block('Added', '+', 'patch-block--added', added)}
      ${block('Modified', '~', 'patch-block--modified', modified)}
      ${block('Removed', '−', 'patch-block--removed', removed)}
    </div>
  </div>`;
}

// V2 likelihood readout — a mono "spec-sheet" verdict line (PASSAGE LIKELIHOOD →
// 90% Very likely) instead of a tinted pill box. The brief is NOT repeated here
// (it shows once in top-lines); signed/vetoed bills get a date note instead.
function renderLikelihoodReadout(bill, col, marginBottom) {
  const margin = `margin:0.65rem 1.1rem ${marginBottom}`;
  const tag = '<span class="analysis-tag">analyst judgment</span>';
  if (bill.stage === 'signed') {
    return `<div class="likelihood-readout" style="${margin}">
      <div class="lr-row"><span class="lr-key">Status</span><span class="lr-arrow">&rarr;</span><span class="lr-lab" style="color:var(--green)">Signed into Law</span></div>
      <div class="lr-note">Introduced ${escHtml(formatDateCompact(bill.date || ''))}${bill.enactedDate ? ` &middot; Enacted ${escHtml(formatDateCompact(bill.enactedDate))}` : ''}</div>
    </div>`;
  }
  if (bill.stage === 'vetoed') {
    return `<div class="likelihood-readout" style="${margin}">
      <div class="lr-row"><span class="lr-key">Status</span><span class="lr-arrow">&rarr;</span><span class="lr-lab" style="color:var(--red)">Vetoed by President</span></div>
      <div class="lr-note">Introduced ${escHtml(formatDateCompact(bill.date || ''))}${bill.stageDate ? ` &middot; Vetoed ${escHtml(formatDateCompact(bill.stageDate))}` : ''}</div>
    </div>`;
  }
  const label = bill.likelihoodLabel || labelFromPct(bill.likelihood);
  return `<div class="likelihood-readout" style="${margin}">
    <div class="lr-row">
      <span class="lr-key">Passage likelihood</span>
      <span class="lr-arrow">&rarr;</span>
      <span class="lr-val" style="color:${col.text}">${bill.likelihood}%</span>
      <span class="lr-lab" style="color:${col.text}">${escHtml(label)}</span>
      ${tag}
    </div>
  </div>`;
}

function renderMinorBody(bill, col, isOpen) {
  const topUnder = bill.underreported?.[0];
  const underHtml = topUnder ? `
    <div class="underreported-teaser">
      <span class="underreported-badge">⚠ Underreported</span>
      <div class="underreported-headline">${escHtml(topUnder.section)}</div>
      <div class="underreported-preview">${billRefHtml(topUnder.summary, bill.id)}</div>
    </div>` : '';

  const likelihoodDetail = renderLikelihoodReadout(bill, col, '0');

  return `<div class="bill-body-minor ${isOpen ? 'open' : ''}">
    ${likelihoodDetail}
    ${renderTopLines(bill)}
    ${renderWhatChanged(bill)}
    ${underHtml}
    ${renderQuoteCards(bill, true)}
    <button class="expand-full-btn" onclick="expandFull('${bill.id}', event)">Full analysis ↓</button>
  </div>`;
}

function renderOneQuoteCard(q, bill) {
  const stanceCls   = q.stance === 'support' ? 'stance-support' : q.stance === 'oppose' ? 'stance-oppose' : '';
  const stanceLabel = q.stance === 'support' ? 'SUPPORT' : q.stance === 'oppose' ? 'OPPOSE' : '';
  const repHref     = q.bioguideId
    ? `rep?id=${escHtml(q.bioguideId)}&ref=bill-${escHtml(bill.id)}`
    : null;
  const repInner = `
        <img class="quote-portrait" src="${portraitUrl(q.bioguideId)}"
             onerror="this.src='${FALLBACK_PORTRAIT}'" alt="${escHtml(q.name)}" />
        <div class="quote-card-name">
          <span>${escHtml(q.name)}</span>
          <span class="chip chip-${(q.party||'n').toLowerCase()[0]}">${q.party || ''}</span>
        </div>`;
  const repBlock = repHref
    ? `<a href="${repHref}" class="quote-card-rep" style="text-decoration:none;color:inherit;cursor:pointer">${repInner}</a>`
    : `<div class="quote-card-rep">${repInner}</div>`;
  return `<div class="quote-card">
    <div class="quote-card-meta">
      ${repBlock}
      ${stanceLabel ? `<span class="quote-stance ${stanceCls}">${stanceLabel}</span>` : ''}
    </div>
    <div class="quote-text">"${escHtml(q.text)}"</div>
  </div>`;
}

function renderQuoteCards(bill, compact = false) {
  const quotes = bill.featured_quotes;
  if (!quotes?.length) return '';

  // Bill page full expansion: carousel showing all quotes, controversial first
  if (window.BILL_PAGE_ID && !compact) {
    const id       = `qc-${bill.id.replace(/[^a-z0-9]/gi, '-')}`;
    const cards    = quotes.map(q => renderOneQuoteCard(q, bill)).join('');
    const dotCount = Math.max(1, quotes.length - 1); // 2-per-view: last card is always visible
    const dotsHtml = quotes.length > 1
      ? Array.from({ length: dotCount }, (_, i) =>
          `<button class="qc-dot${i === 0 ? ' qc-dot-active' : ''}" onclick="qcGoTo('${id}',${i})" aria-label="Quote ${i + 1}"></button>`
        ).join('')
      : '';
    return `<div class="quote-carousel" id="${id}">
      <div class="quote-carousel-viewport">
        <div class="quote-carousel-track">${cards}</div>
      </div>
      ${quotes.length > 1 ? `<div class="quote-carousel-nav">
        <button class="qc-arrow qc-prev" onclick="qcPrev('${id}')" aria-label="Previous">&#8249;</button>
        <div class="qc-dots">${dotsHtml}</div>
        <button class="qc-arrow qc-next" onclick="qcNext('${id}')" aria-label="Next">&#8250;</button>
      </div>` : ''}
    </div>`;
  }

  // Index cards: compact 2-column grid, first 2 quotes only
  return `<div class="quote-cards-row">
    ${quotes.slice(0, 2).map(q => renderOneQuoteCard(q, bill)).join('')}
  </div>`;
}

function qcGoTo(id, idx) {
  const el = document.getElementById(id);
  if (!el) return;
  const track   = el.querySelector('.quote-carousel-track');
  const dots    = el.querySelectorAll('.qc-dot');
  const cards   = el.querySelectorAll('.quote-card');
  const count   = cards.length;
  const perView = window.innerWidth >= 640 ? 2 : 1;
  const maxIdx  = Math.max(0, count - perView);
  idx = Math.max(0, Math.min(idx, maxIdx));
  el._qcIdx = idx;
  if (cards[0]) {
    const gap  = parseFloat(getComputedStyle(track).gap) || 0;
    const step = cards[0].offsetWidth + gap;
    track.style.transform = `translateX(-${idx * step}px)`;
  }
  dots.forEach((d, i) => d.classList.toggle('qc-dot-active', i === idx));
}
function qcPrev(id) {
  const el = document.getElementById(id);
  qcGoTo(id, (el._qcIdx || 0) - 1);
}
function qcNext(id) {
  const el = document.getElementById(id);
  qcGoTo(id, (el._qcIdx || 0) + 1);
}

function renderMiniPipeline(bill) {
  return `<div class="mini-pipe">
    ${bill.pipeline.map((s, i) => {
      const done   = i < bill.currentStep;
      const active = i === bill.currentStep;
      const dotCls = done ? 'mp-dot-done' : active ? 'mp-dot-active' : 'mp-dot-pending';
      const lineCls = done ? 'mp-line-done' : 'mp-line-pending';
      return `<div class="mp-dot ${dotCls}"></div>${i < bill.pipeline.length - 1 ? `<div class="mp-line ${lineCls}"></div>` : ''}`;
    }).join('')}
  </div>`;
}

function renderLikelihoodFooter(bill, col, state) {
  const pct    = bill.likelihood || 0;
  const isOpen = !!state;
  const stages = ['Intro','Cmte','House','Senate','Signed'];
  const idx    = bill.currentStep ?? 0;

  const dots = stages.map((s, i) => {
    const done   = i < idx;
    const active = i === idx;
    const dotCls = done ? 'fp-dot-done' : active ? 'fp-dot-active' : 'fp-dot-pending';
    const size   = active ? '9px' : '6px';
    const lineCls = done ? 'fp-line-done' : 'fp-line-pending';
    const line   = i < stages.length - 1
      ? `<div class="fp-line ${lineCls}"></div>`
      : '';
    return `<div class="fp-dot ${dotCls}" style="width:${size};height:${size}"></div>${line}`;
  }).join('');

  return `<div class="likelihood-footer" onclick="toggleCard('${bill.id}')">
    <div class="footer-stage-dots">${dots}</div>
    <div class="footer-likelihood-inner">
      <span class="likelihood-label">Passage likelihood</span>
      <div class="likelihood-track">
        <div class="likelihood-fill" style="width:${pct}%;background:${col.fill}"></div>
      </div>
      <span class="likelihood-value" style="color:${col.text}">${bill.likelihoodLabel || labelFromPct(pct)} · ${pct}%</span>
    </div>
    <div class="footer-chevron-col"><span class="chevron ${isOpen ? 'open' : ''}"></span></div>
  </div>`;
}

// ---- Vote Results Section ----

function renderVoteSection(bill) {
  if (!Array.isArray(bill.votes) || !bill.votes.length) return '';
  var rows = (bill.votes || []).map(function(v, i) {
    var detailId   = 'vote-detail-' + bill.id + '-' + i;
    var chamberCls = v.chamber === 'Senate' ? 'chamber-senate' : 'chamber-house';
    var resultCls  = (v.result || '').toUpperCase().includes('PASS') ? 'result-passed' : 'result-failed';
    var crossPill  = v.crossoverCount > 0
      ? '<span class="vote-crossover-pill">' + v.crossoverCount + ' crossed aisle</span>'
      : '';
    var tallyHtml;
    if (v.method) {
      tallyHtml = '<span class="tally-method">' + escHtml(v.method) + '</span>';
    } else {
      tallyHtml = '<span class="tally-yea">Yea ' + v.yeas + '</span>'
        + '<span class="tally-sep">·</span>'
        + '<span class="tally-nay">Nay ' + v.nays + '</span>'
        + (v.notVoting > 0 ? '<span class="tally-sep">·</span><span class="tally-nv">NV ' + v.notVoting + '</span>' : '');
    }
    var expandBtn = v.method ? '' :
      '<button class="vote-expand-btn" data-open="0" onclick="expandVoteDetail(\'' + bill.id + '\',' + i + ',this)">Show votes ▾</button>';

    // Pass bar — only for recorded votes with real tallies
    var passBar = '';
    var thresholdLabel = '';
    if (!v.method && (v.yeas > 0 || v.nays > 0)) {
      var total       = v.yeas + v.nays;
      var yeaPct      = Math.round(v.yeas / total * 1000) / 10;
      var nayPct      = 100 - yeaPct;
      var q           = (v.question || '').toLowerCase();
      var threshold   = q.includes('cloture') || q.includes('three-fifths') ? 60
                      : q.includes('two-thirds') || q.includes('veto')      ? 67
                      : 50;
      thresholdLabel  = threshold === 60 ? '60% (Cloture)' : threshold === 67 ? '2/3 Majority' : 'Simple Majority';
      passBar = '<div class="vote-pass-bar-wrap">'
        + '<div class="vote-pass-bar">'
        + '<div class="vpb-yea" style="width:' + yeaPct + '%"></div>'
        + '<div class="vpb-nay" style="width:' + nayPct + '%"></div>'
        + '</div>'
        + '<div class="vote-pass-line" style="left:' + threshold + '%" title="' + escHtml(thresholdLabel) + '"></div>'
        + '</div>';
    }

    return '<div class="vote-row">'
      + '<div class="vote-row-main">'
      +   '<div class="vote-row-left">'
      +     '<span class="vote-chamber-badge ' + chamberCls + '">' + escHtml(v.chamber) + '</span>'
      +     '<span class="vote-result-badge ' + resultCls + '">' + escHtml(v.result || '') + '</span>'
      +     '<span class="vote-tally">' + tallyHtml + '</span>'
      +   '</div>'
      +   '<div class="vote-row-right">'
      +     (thresholdLabel ? '<span class="vote-threshold-label">' + escHtml(thresholdLabel) + '</span>' : '')
      +     '<span class="vote-date-label">' + escHtml(formatDateCompact(v.date || '')) + '</span>'
      +     crossPill
      +     expandBtn
      +   '</div>'
      + '</div>'
      + passBar
      + '<div class="vote-detail" id="' + escHtml(detailId) + '" style="display:none"></div>'
      + '</div>';
  }).join('');
  return rows;
}

async function expandVoteDetail(billId, voteIdx, btnEl) {
  var detailEl = document.getElementById('vote-detail-' + billId + '-' + voteIdx);
  if (!detailEl) return;

  var isOpen = btnEl.getAttribute('data-open') === '1';
  if (isOpen) {
    detailEl.style.display = 'none';
    btnEl.setAttribute('data-open', '0');
    btnEl.textContent = 'Show votes ▾';
    return;
  }
  detailEl.style.display = 'block';
  btnEl.setAttribute('data-open', '1');
  btnEl.textContent = 'Hide votes ▴';

  if (!_voteDetailCache[billId]) {
    detailEl.innerHTML = '<div class="vote-detail-loading">Loading…</div>';
    try {
      var res = await fetch('data/votes/' + billId + '.json');
      if (!res.ok) throw new Error('not found');
      _voteDetailCache[billId] = await res.json();
    } catch (_) {
      detailEl.innerHTML = '<div class="vote-detail-error">Vote detail unavailable.</div>';
      return;
    }
  }

  var voteFile = _voteDetailCache[billId];
  var vote = (voteFile.votes || [])[voteIdx];
  if (!vote) { detailEl.innerHTML = ''; return; }

  var html = '';

  // Crossovers — featured at the top on close votes
  var crossovers = vote.crossovers || [];
  if (crossovers.length > 0) {
    html += '<div class="vote-crossovers-section">';
    html += '<div class="vote-crossovers-title">Crossed the Aisle (' + crossovers.length + ')</div>';
    html += '<div class="vote-crossovers-list">';
    for (var co of crossovers) {
      var coParty    = (co.party || 'I').toUpperCase()[0];
      var coBaseName = (co.name || '').replace(/\s*\([A-Z]{2}\)\s*$/, '').trim();
      var coVoteCls  = co.vote === 'Yea' ? 'vote-yea' : 'vote-nay';
      var coInner = '<span class="crossover-party party-' + coParty.toLowerCase() + '">' + escHtml(coParty) + '</span>'
        + '<span class="crossover-name">' + escHtml(coBaseName) + (co.state ? ' (' + escHtml(co.state) + ')' : '') + '</span>'
        + '<span class="crossover-vote ' + coVoteCls + '">' + escHtml(co.vote || '') + '</span>';
      html += co.bioguideId
        ? '<a class="crossover-member" href="rep?id=' + co.bioguideId + '&ref=' + (window.BILLS_PAGE ? 'bills' : 'home') + '">' + coInner + '</a>'
        : '<div class="crossover-member">' + coInner + '</div>';
    }
    html += '</div></div>';
  }

  // Member groups: Yea / Nay / Not Voting
  var groups = [
    { label: 'Yea',        cls: 'group-yea', test: function(v) { var lv = v.toLowerCase(); return lv === 'yea' || lv === 'aye' || lv === 'yes'; } },
    { label: 'Nay',        cls: 'group-nay', test: function(v) { var lv = v.toLowerCase(); return lv === 'nay' || lv === 'no'; } },
    { label: 'Not Voting', cls: 'group-nv',  test: function(v) { var lv = v.toLowerCase(); return lv.includes('not') || lv === 'present'; } },
  ];

  var members = vote.members || [];
  for (var g of groups) {
    var gMembers = members.filter(function(m) { return g.test(m.vote || ''); });
    if (gMembers.length === 0) continue;
    html += '<div class="vote-members-group ' + g.cls + '">';
    html += '<div class="vote-members-header"><span class="vote-group-label">' + g.label + '</span><span class="vote-group-count">' + gMembers.length + '</span></div>';
    html += '<div class="vote-members-list">';
    for (var m of gMembers) {
      var mParty    = (m.party || 'I').toUpperCase()[0];
      var mBaseName = (m.name || '').replace(/\s*\([A-Z]{2}\)\s*$/, '').trim();
      var mInner = '<span class="vm-party party-' + mParty.toLowerCase() + '">' + escHtml(mParty) + '</span>'
        + '<span class="vm-name">' + escHtml(mBaseName) + (m.state ? ' (' + escHtml(m.state) + ')' : '') + '</span>';
      html += m.bioguideId
        ? '<a class="vote-member" href="rep?id=' + m.bioguideId + '&ref=' + (window.BILLS_PAGE ? 'bills' : 'home') + '">' + mInner + '</a>'
        : '<span class="vote-member">' + mInner + '</span>';
    }
    html += '</div></div>';
  }

  detailEl.innerHTML = '<div class="vote-detail-inner">' + html + '</div>';
}

// Map a raw Congress.gov text-version type to a clean milestone label, or null
// for pure-procedural reprints (Placed on Calendar / Referred / Received) that
// carry no text change and shouldn't clutter the timeline.
function versionMilestoneLabel(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('introduced')) return 'Introduced';
  if (t.includes('reported'))   return 'Reported by committee';
  if (t.includes('engrossed amendment')) return t.includes('senate') ? 'Senate amended' : 'House amended';
  if (t.includes('engrossed') || t.includes('considered and passed')) return t.includes('senate') ? 'Passed the Senate' : 'Passed the House';
  if (t.includes('enrolled'))    return 'Enrolled (final text)';
  // "Public Law" is a status, not a distinct text (same text as Enrolled) — hide
  // it so the timeline ends cleanly at "Enrolled (final text)". The stage
  // pipeline already conveys that the bill was signed.
  return null;
}

function normalizeVersions(versions) {
  const out = [];
  for (const v of versions || []) {
    const label = versionMilestoneLabel(v.type);
    if (!label) continue;                                   // hide procedural reprints
    if (out.length && out[out.length - 1].label === label) continue; // dedupe consecutive
    out.push({ label, date: v.date, url: v.url });
  }
  return out;
}

// "What changed" — the bill's version-to-version changelog. EMPTY until the bill
// is actually revised (a `versionSummary` exists): introduced = nothing to show;
// advanced unchanged = nothing to show; revised = the net change vs. the
// introduced text, so a returning reader sees what's different without re-reading.
// On the bill page it also shows the version history (milestones + dates).
// "What changed" — the bill's version-to-version changelog, as patch-notes
// Added / Modified / Removed bullets covering the bill's lifespan (Introduced ->
// latest text). EMPTY until the bill is actually revised: `bill.versionChanges`
// is only set once a revision produces real differences. Lets a returning reader
// see what's different from the version they read, without re-reading.
function renderWhatChanged(bill) {
  const vc = bill.versionChanges;
  if (!vc) return '';
  const { added = [], modified = [], removed = [] } = vc;
  if (!added.length && !modified.length && !removed.length) return '';

  const block = (label, symbol, cls, items) => `<div class="patch-block ${cls}">
      <div class="patch-block-label"><span class="patch-block-symbol">${symbol}</span>${label}</div>
      <div class="patch-block-items">${
        items.length
          ? items.map(t => `<div class="patch-block-item">${billRefHtml(t, bill.id, true)}</div>`).join('')
          : '<div class="patch-block-item patch-block-item--none">None</div>'
      }</div>
    </div>`;

  return `<div class="what-changed-section">
    <div class="what-changed-label">What changed <span class="analysis-tag">${whatChangedBaselineTag(vc)}</span></div>
    <div class="what-changed-grid">
      ${block('Added', '+', 'patch-block--added', added)}
      ${block('Modified', '~', 'patch-block--modified', modified)}
      ${block('Removed', '−', 'patch-block--removed', removed)}
    </div>
  </div>`;
}

// The diff baseline is Introduced when available, otherwise the earliest text
// version on file (Reported/Engrossed/etc.) — say so instead of always claiming
// "as introduced", which is false for bills that were never diffed against an
// introduced text.
function whatChangedBaselineTag(vc) {
  const t = ((vc && vc.fromVersion && vc.fromVersion.type) || '').toLowerCase();
  if (!t || t.includes('introduced')) return 'vs. as introduced';
  if (t.includes('reported')) return 'vs. as reported';
  if (t.includes('placed on calendar')) return 'vs. as placed on the calendar';
  if (t.includes('engrossed amendment')) return 'vs. as passed with amendments';
  if (t.includes('engrossed') || t.includes('considered and passed')) return 'vs. as first passed';
  return 'vs. ' + (vc.fromVersion.type || 'earliest version');
}

function renderBody(bill, isOpen, col) {
  const pipelineHtml = `<div class="full-pipeline">
    ${bill.pipeline.map((step, i) => {
      const done   = i < bill.currentStep;
      const active = i === bill.currentStep;
      const cls    = done ? 'pipe-done' : active ? 'pipe-active' : 'pipe-pending';
      return `${i > 0 ? '<span class="pipe-arrow">›</span>' : ''}<span class="pipe-pill ${cls}">${escHtml(step)}</span>`;
    }).join('')}
  </div>`;

  const topLinesHtml = renderTopLines(bill);

  const sectionsHtml = (bill.isOmnibus && bill.divisions?.length) ? '' : bill.sections?.length
    ? `<div class="patch-notes">${renderSections(bill)}</div>`
    : `<div class="patch-notes"><p style="font-size:0.85rem;color:var(--text-3);padding:0.5rem 0">Click "Analyze with AI" below to generate patch notes for this bill.</p></div>`;

  const positionsHtml     = renderPositionsSection(bill);
  const underreportedHtml = renderUnderreportedSection(bill);

  const criticismsHtml = bill.criticisms?.length ? `
    <div class="section-divider"></div>
    <div class="criticism-section">
      <div class="criticism-title">⚑ Opposed — who and why</div>
      ${bill.criticisms.map(c => `<div class="criticism-item"><span class="criticism-who">${escHtml(c.who)}:</span> ${billRefHtml(c.why, bill.id)}</div>`).join('')}
    </div>` : '';

  const gapsHtml = bill.gaps?.length ? `
    <div class="gaps-section">
      <div class="gaps-title">◈ Not addressed in this bill <span class="analysis-tag">analyst judgment</span></div>
      ${bill.gaps.map(g => `<div class="gaps-item">${billRefHtml(g, bill.id)}</div>`).join('')}
    </div>` : '';

  const viewBillLink = window.BILL_PAGE_ID ? '' :
    `<div class="view-bill-link-row"><a href="bill?id=${encodeURIComponent(bill.id)}">View full bill page →</a></div>`;

  const stageDetailHtml = renderLikelihoodReadout(bill, col, '0.25rem');

  const divisionsHtml = renderDivisions(bill);

  return `<div class="bill-body ${isOpen ? 'open' : ''}">
    ${stageDetailHtml}
    ${topLinesHtml}
    ${renderQuoteCards(bill)}
    ${sectionsHtml}
    ${divisionsHtml}
    ${renderWhatChanged(bill)}
    ${underreportedHtml}
    ${criticismsHtml}
    ${gapsHtml}
    ${positionsHtml}
    ${viewBillLink}
  </div>`;
}

// ── Omnibus division rendering (bill page only) ────────────────────────────

// Render one division block. Uses a synthetic bill-like object so existing
// renderSection / renderItem / renderTopLines functions work without changes.
function renderDivision(bill, div, di) {
  const synth = {
    id:             `${bill.id}-d${di}`,
    top_lines:      div.top_lines      || [],
    brief:          div.brief          || '',
    sections:       div.sections       || [],
    underreported:  div.underreported  || [],
    criticisms:     div.criticisms     || [],
    gaps:           div.gaps           || [],
    featured_quotes: div.featured_quotes || [],
    changes:        div.changes        || null,
  };

  const underHtml    = renderUnderreportedSection(synth);
  const topLinesHtml = renderTopLines(synth);
  const changesHtml  = renderChangesSection(synth);
  const sectionsHtml = synth.sections.length ? renderSections(synth) : '';

  const criticismsHtml = synth.criticisms.length ? `
    <div class="criticism-section">
      <div class="criticism-title">⚑ Opposed — who and why</div>
      ${synth.criticisms.map(c => `<div class="criticism-item"><span class="criticism-who">${escHtml(c.who)}:</span> ${billRefHtml(c.why, bill.id)}</div>`).join('')}
    </div>` : '';

  const gapsHtml = synth.gaps.length ? `
    <div class="gaps-section">
      <div class="gaps-title">◈ Not addressed in this division <span class="analysis-tag">analyst judgment</span></div>
      ${synth.gaps.map(g => `<div class="gaps-item">${billRefHtml(g, bill.id)}</div>`).join('')}
    </div>` : '';

  return `<div class="division-block">
    <div class="division-block-header">
      <span class="division-key-badge">DIV ${escHtml(div.divisionKey || String.fromCharCode(65 + di))}</span>
      <span class="division-block-label">${escHtml(div.label || '')}</span>
    </div>
    ${div.summary ? `<div class="division-summary">${escHtml(div.summary)}</div>` : ''}
    ${sectionsHtml ? '' : topLinesHtml}
    ${sectionsHtml}
    ${changesHtml}
    ${underHtml}
    ${criticismsHtml}
    ${gapsHtml}
  </div>`;
}

// Only rendered on the dedicated bill page (not the index card — card uses sections[]).
function renderDivisions(bill) {
  if (!bill.divisions?.length || !window.BILL_PAGE_ID) return '';
  return `<div class="omnibus-divisions">
    <div class="omnibus-divisions-header">Division-by-Division Analysis</div>
    ${bill.divisions.map((div, di) => renderDivision(bill, div, di)).join('')}
  </div>`;
}

function patchSectionAnchor(sec) {
  if (sec.billSection) return `bt-sec-${sec.billSection}`;
  const secM = sec.label?.match(/^Sections?\s+(\d+)/i);
  if (secM) return `bt-sec-${secM[1]}`;
  const titleM = sec.label?.match(/^Title\s+([IVXLC]+)/i);
  if (titleM) return `bt-title-${titleM[1].toUpperCase()}`;
  return null;
}

// Section breakdown rendered as a numbered "spine": each section is a node with a
// mono §N / Title / Division marker on a continuous vertical rail. Boilerplate
// sections flagged `admin:true` collapse into one quiet folded node at the top.
function renderSections(bill) {
  const secs = bill.sections || [];
  if (!secs.length) return '';
  const admin = secs.filter(s => s.admin);
  const main  = secs.filter(s => !s.admin);
  let html = '<div class="patch-notes-title">Section-by-section breakdown</div><div class="patch-spine">';
  if (admin.length) {
    const aid = `psadm-${escHtml(bill.id)}`;
    const sub = admin.map(s => secMarker(s.label)).filter(Boolean).join(', ');
    html += `<div class="ps-admin-strip" onclick="var k=this.nextElementSibling;k.classList.toggle('open');var c=this.querySelector('.ps-caret');if(c)c.textContent=k.classList.contains('open')?'▴':'▾'">
        <span class="ps-num admin">§§</span><span class="ps-rail"></span>
        <div class="ps-admin-label">Administrative provisions${sub ? ` <span class="ps-admin-sub">· ${sub}</span>` : ''}<span class="ps-caret">▾</span></div>
      </div>
      <div class="ps-admin-kids" id="${aid}">${admin.map((s, i) => renderSection(bill, s, 'a' + i, {})).join('')}</div>`;
  }
  html += main.map((s, i) => renderSection(bill, s, i, { last: i === main.length - 1 })).join('');
  return html + '</div>';
}

// Derive the rail marker shown for a section label. Falls back to null (→ plain dot).
function secMarker(label) {
  const L = (label || '').trim();
  let m;
  if (m = L.match(/^Sections\s+(\w+)\s*[-–—]\s*(\w+)/i)) return /end/i.test(m[2]) ? `§${m[1]}+` : `§${m[1]}–${m[2]}`;
  if (m = L.match(/^Sec(?:tion)?\.?\s+(\d+[A-Za-z]?)/i)) return `§${m[1]}`;
  if (m = L.match(/^Title\s+([IVXLC]+)/i)) return m[1];
  if (m = L.match(/^Division\s+([A-Z0-9]+)/i)) return m[1];
  return null;
}

// Strip the "Section N — " / "Title I — " prefix so the title sits next to the marker.
function secTitle(label) {
  const L = label || '';
  if (!/^(Sec|Title|Division)/i.test(L)) return L;
  for (const sep of [' — ', ' – ', ' - ']) { const i = L.indexOf(sep); if (i >= 0) return L.slice(i + sep.length).trim(); }
  const i = L.search(/[—–]/);
  return i >= 0 ? L.slice(i + 1).trim() : L;
}

function renderSection(bill, sec, si, opts) {
  opts = opts || {};
  const marker = secMarker(sec.label);
  const title  = secTitle(sec.label);
  const anchor = window.BILL_PAGE_ID ? patchSectionAnchor(sec) : null;
  const titleHtml = anchor
    ? `<a class="patch-section-title-link" href="#${anchor}" onclick="event.preventDefault();scrollToBillSection('${anchor}')">${escHtml(title)}</a>`
    : escHtml(title);
  const node = marker
    ? `<span class="ps-num${sec.admin ? ' admin' : ''}">${escHtml(marker)}</span>`
    : `<span class="ps-dot"></span>`;
  return `<div class="patch-section ps-row${opts.last ? ' ps-last' : ''}${sec.admin ? ' ps-adm' : ''}">
    ${node}<span class="ps-rail"></span>
    <div class="ps-title">${titleHtml}</div>
    ${sec.items.map((item, ii) => renderItem(bill, item, si, ii)).join('')}
  </div>`;
}

function renderItem(bill, item, si, ii) {
  const key    = `${bill.id}-${si}-${ii}`;
  const isOpen = openDetails[key];
  const chipsHtml = item.comments?.length
    ? `<div class="comment-chips">${item.comments.map(c =>
        `<span class="chip chip-${c.party}" title="${escHtml(c.text)}">${c.party === 'd' ? 'D' : c.party === 'r' ? 'R' : '●'}</span>`
      ).join('')}</div>`
    : '';
  const commentsDetail = item.comments?.map(c =>
    `<div class="item-detail-comment">${billRefHtml(c.text, bill.id)}</div>`
  ).join('') || '';

  return `<div class="patch-item">
    <div class="patch-item-main">${billRefHtml(item.main, bill.id, true)}</div>
    ${chipsHtml}
    ${item.detail ? `
      <button class="more-btn" onclick="toggleDetail('${key}')">${isOpen ? '▴ hide' : '▾ details'}</button>
      <div class="item-detail ${isOpen ? 'open' : ''}" id="detail-${key}">
        <div>${billRefHtml(item.detail, bill.id)}</div>
        ${commentsDetail}
      </div>` : ''}
  </div>`;
}

// ---- Interactions ----

function toggleCard(id) {
  const state = openCards.get(id);
  if (state) openCards.delete(id);      // minor or full → closed
  else openCards.set(id, 'minor');      // closed → minor
  renderAll();
}

function expandFull(id, e) {
  e && e.stopPropagation();
  openCards.set(id, 'full');
  // Auto-open all detail panels when entering full expansion
  const bill = allBills.find(b => b.id === id);
  (bill?.sections || []).forEach((sec, si) => {
    (sec.items || []).forEach((item, ii) => {
      if (item.detail) openDetails[`${id}-${si}-${ii}`] = true;
    });
  });
  renderAll();
}

function toggleDetail(key) {
  openDetails[key] = !openDetails[key];
  renderAll();
}

// ---- AI Analysis ----

// ---- Helpers ----

// Neutral structural classification of a bill's legislative form (not a value judgment).
// On index cards, omnibus bills already carry the OMNIBUS badge, so the type chip is
// suppressed there to avoid redundancy. On the full bill page (window.BILL_PAGE_ID), the
// structural type is shown for every bill, omnibus included.
const BILL_TYPE_LABELS = {
  framework: 'FRAMEWORK', amendment: 'AMENDMENT', appropriation: 'FUNDING',
  reauthorization: 'EXTENSION', resolution: 'RESOLUTION', study: 'STUDY'
};
// Plain-English hover descriptions (data-tip → styled tooltip, same system as acronyms.js).
const BILL_TYPE_TIPS = {
  framework: 'Creates a brand-new federal regulatory regime, rather than changing existing law.',
  amendment: 'Changes existing law — adjusting statutes, requirements, penalties, or thresholds.',
  appropriation: 'Primarily provides or authorizes federal funding.',
  reauthorization: 'Extends or renews an existing program, authority, or deadline.',
  resolution: 'A congressional resolution — e.g. disapproving a rule or directing the President — not a standalone law.',
  study: 'Directs a government study, review, or report, without itself changing the law.'
};
// inline=true renders the meta-row variant (mobile), without the hover tooltip;
// CSS shows the rank-column chip on desktop and the inline one on mobile.
function billTypeBadge(bill, inline) {
  if (!bill || !bill.billType) return '';
  if (bill.isOmnibus && !window.BILL_PAGE_ID) return '';
  const label = BILL_TYPE_LABELS[bill.billType];
  if (!label) return '';
  if (inline) return `<span class="status-badge status-type">${label}</span>`;
  const tip = BILL_TYPE_TIPS[bill.billType] || '';
  return `<span class="status-badge status-type" data-tip="${escHtml(tip)}">${label}</span>`;
}

function badgeClass(stage) {
  return { senate: 'badge-senate', house: 'badge-house', signed: 'badge-signed',
           committee: 'badge-committee', introduced: 'badge-introduced', conference: 'badge-conference' }[stage] || 'badge-default';
}

function likelihoodColor(pct) {
  if (pct >= 65) return { fill: 'var(--green)',  text: 'var(--green-text)' };
  if (pct >= 45) return { fill: 'var(--purple)', text: 'var(--purple-text)' };
  return { fill: 'var(--text-3)', text: 'var(--text-2)' };
}

function labelFromPct(pct) {
  if (pct >= 100) return 'Enacted';
  if (pct >= 75)  return 'Likely';
  if (pct >= 50)  return 'Possible';
  if (pct >= 25)  return 'Unlikely';
  return 'Long shot';
}

function compactSource(source) {
  const MON = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
  return source.replace(/([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/,
    (_, m, d, y) => `${d.padStart(2,'0')}/${MON[m]}/${y.slice(2)}`);
}

// escHtml() moved to util.js (loaded first on every page).

// Renders prose text replacing bill code references (H.R. 1234, S. 40, etc.) with
// linked titles when the bill is in allBills, or a plain span when self-referential.
// Escape + bold figures (%, $amounts, day/year/month counts). The numbers are
// the substance of a bill, so emphasizing them makes the changes scannable.
// Runs on already-escaped text; figure tokens contain no HTML-special chars.
function escFig(text) {
  const FIG_RE = /(\$\d[\d,]*(?:\.\d+)?\s?(?:billion|million|trillion|B|M|T)?|\d+(?:\.\d+)?%|\b\d[\d,]*\s?(?:days?|years?|months?)\b)/gi;
  return escHtml(text).replace(FIG_RE, '<b class="fig">$1</b>');
}

function billRefHtml(text, currentBillId, emphFig) {
  if (!text) return '';
  const esc = emphFig ? escFig : escHtml;
  const BILL_RE = /(H\.R\.|H\.Con\.Res\.|H\.J\.Res\.|H\.Res\.|S\.Con\.Res\.|S\.J\.Res\.|S\.Res\.|S\.)\s*(\d+)/g;
  const typeMap = {
    'H.R.': 'HR', 'S.': 'S',
    'H.Con.Res.': 'HCONRES', 'S.Con.Res.': 'SCONRES',
    'H.J.Res.': 'HJRES',    'S.J.Res.': 'SJRES',
    'H.Res.': 'HRES',       'S.Res.': 'SRES',
  };
  let result = '', lastIndex = 0, match;
  BILL_RE.lastIndex = 0;
  while ((match = BILL_RE.exec(text)) !== null) {
    result += esc(text.slice(lastIndex, match.index));
    const type   = typeMap[match[1]] || 'HR';
    const billId = `119-${type}-${match[2]}`;
    const bill   = allBills.find(b => b.id === billId);
    if (bill) {
      if (bill.id === currentBillId) {
        result += `<span class="bill-self-ref">${escHtml(bill.title)}</span>`;
      } else {
        result += `<a class="bill-ref-link" href="#card-${escHtml(billId)}" onclick="scrollToBill('${escHtml(billId)}');return false;">${escHtml(bill.title)}</a>`;
      }
    } else {
      result += escHtml(match[0]);
    }
    lastIndex = BILL_RE.lastIndex;
  }
  return result + esc(text.slice(lastIndex));
}

function scrollToBill(id) {
  if (!document.getElementById('billList')) {
    window.location.href = `index.html?scrollTo=${encodeURIComponent(id)}`;
    return;
  }
  const bill = allBills.find(b => b.id === id);
  if (!bill) return;
  if (favoritesView) toggleFavoritesView();
  const PIPELINE_STAGES = new Set(['introduced', 'committee', 'house', 'senate']);
  const visibleOnCurrent =
    activeMainFilter === 'recent' ||
    (activeMainFilter === 'pipeline' && PIPELINE_STAGES.has(bill.stage)) ||
    (activeMainFilter === 'enacted'  && bill.stage === 'signed') ||
    (activeMainFilter === 'dead'     && (bill.stage === 'dead' || bill.stage === 'vetoed'));
  const needed = visibleOnCurrent ? activeMainFilter : 'recent';
  if (activeMainFilter !== needed) {
    activeMainFilter = needed;
    document.querySelectorAll('.filter-btn[data-main]').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.main === needed)
    );
    renderAll();
  }
  requestAnimationFrame(() => {
    const card = document.getElementById(`card-${id}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.add('bill-ref-flash');
    setTimeout(() => card.classList.remove('bill-ref-flash'), 1200);
  });
}
