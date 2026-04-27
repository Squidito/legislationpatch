// =============================================
//  app.js — UI rendering and interactions
// =============================================

let allBills      = [];
let openCards        = new Map(); // id -> 'minor' | 'full'
let openDetails      = {};
let aiOutputs        = {};
let activeMainFilter  = 'in_progress';
let favoritesView     = false;
let selectedRepIds    = new Set();
let standaloneQuotes  = [];

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

const FALLBACK_PORTRAIT = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44'%3E%3Crect width='44' height='44' fill='%23374151'/%3E%3Ccircle cx='22' cy='16' r='9' fill='%236b7280'/%3E%3Cellipse cx='22' cy='40' rx='15' ry='11' fill='%236b7280'/%3E%3C/svg%3E";

let trackedState = 'TX';
let trackedReps = [];
let availableStateReps = [];

// ---- Boot ----

document.addEventListener('DOMContentLoaded', async () => {
  loadTrackedSettings();
  loadWatchedBills();
  await autoDetectState();
  fetchStandaloneQuotes().then(q => { standaloneQuotes = q; });
  setupSettings();
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
  el.style.display = on ? 'block' : 'none';
  if (msg) document.getElementById('errorMsg').textContent = msg;
}

// ---- Filters ----

function isJustPassed(bill) {
  if (bill.stage !== 'signed') return false;
  try {
    const daysDiff = (Date.now() - new Date(bill.date).getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 30;
  } catch (e) { return false; }
}

function setupFilters() {
  document.getElementById('filtersMain').addEventListener('click', e => {
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
  const moreBtn = document.getElementById('repMoreBtn');
  if (moreBtn) moreBtn.addEventListener('click', toggleRepDropdown);

  const stateSelect = document.getElementById('stateSelect');
  if (stateSelect) stateSelect.addEventListener('change', handleStateChange);

  const manualAdd = document.getElementById('manualRepAdd');
  if (manualAdd) manualAdd.addEventListener('click', addManualTrackedRep);

  const strip = document.getElementById('repStrip');
  if (strip) {
    strip.addEventListener('click', e => {
      const card = e.target.closest('[data-rep-id]');
      if (!card) return;
      const id = card.dataset.repId;
      if (selectedRepIds.has(id)) selectedRepIds.delete(id);
      else selectedRepIds.add(id);
      renderRepStrip();
      const existingCarousel = document.querySelector('.shock-quotes-grid');
      if (existingCarousel) _carouselScroll = existingCarousel.scrollLeft;
      renderAll();
    });
  }

  populateStateDropdown();
  // Gemini 3.1 work: Removed live fetchStateReps call here.
}

function loadTrackedSettings() {
  const savedState = localStorage.getItem(STORAGE_KEYS.trackedState);
  const savedReps  = localStorage.getItem(STORAGE_KEYS.trackedReps);
  if (savedState) trackedState = savedState;
  try { trackedReps = savedReps ? JSON.parse(savedReps) : []; }
  catch (err) { trackedReps = []; }
}

function toggleTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('lpTheme', isDark ? 'dark' : 'light');
}

// Apply saved theme on load
(function() {
  const saved = localStorage.getItem('lpTheme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.addEventListener('DOMContentLoaded', () => {
      const cb = document.getElementById('themeToggle');
      if (cb) cb.checked = true;
    });
  }
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

// Silently detect state and ZIP from IP — no user prompt
async function autoDetectState() {
  const savedZip = localStorage.getItem(STORAGE_KEYS.trackedZip);
  if (savedZip) {
    const zipEl = document.getElementById('zipDisplay');
    if (zipEl) zipEl.textContent = '~' + savedZip;
  }
  if (localStorage.getItem(STORAGE_KEYS.trackedState)) return; // respect saved state preference
  try {
    const res  = await fetch('https://ipapi.co/json/');
    if (!res.ok) return;
    const data = await res.json();
    if (data.region_code && US_STATES.some(s => s.code === data.region_code)) {
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

function populateStateDropdown() {
  const select = document.getElementById('stateSelect');
  if (!select) return;
  select.innerHTML = US_STATES.map(s =>
    `<option value="${s.code}">${escHtml(s.name)}</option>`
  ).join('');
  select.value = trackedState;
}

function handleStateChange(e) {
  trackedState = e.target.value;
  saveTrackedSettings();
  
  // Gemini 3.1 work: State reps are now handled statically.
  renderRepStrip();
  renderRepGrid();
}

// Gemini 3.1 work: Removed fetchStateReps live API function.

// ---- Portrait helpers ----

function portraitUrl(bioguideId) {
  if (!bioguideId || typeof bioguideId !== 'string' || bioguideId.length < 2) return FALLBACK_PORTRAIT;
  const id = bioguideId.toUpperCase();
  return `https://bioguide.congress.gov/bioguide/photo/${id[0]}/${id}.jpg`;
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

  return `<a href="rep.html?id=${escHtml(bioguide || id)}" class="rep-card rep-card-${size}${tracked ? ' tracked' : ''}"
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

  allBills.forEach(bill => {
    (bill.sponsors || []).forEach(s => {
      const id = s.bioguideId || s.id;
      if (id && !seen.has(id)) { seen.add(id); pool.push({ bioguideId: id, name: formatRepName(s), party: s.party || 'n', state: s.state || '' }); }
    });
    (bill.featured_quotes || []).forEach(q => {
      if (q.bioguideId && !seen.has(q.bioguideId)) { seen.add(q.bioguideId); pool.push(q); }
    });
  });

  const fallback = availableStateReps.length ? availableStateReps : DEMO_REPS;
  fallback.forEach(rep => {
    const id = getRepId(rep);
    if (id && !seen.has(id)) { seen.add(id); pool.push(rep); }
  });

  strip.innerHTML = pool.slice(0, 8).map(rep => {
    const id      = getRepId(rep);
    const bg      = rep.bioguideId || (id.length >= 6 ? id : null);
    const color   = partyColor(rep.party || 'I');
    const name    = formatRepName(rep);
    const active  = selectedRepIds.has(id);
    return `<button class="rep-card rep-card-sm${active ? ' rep-selected' : ''}"
                    data-rep-id="${escHtml(id)}"
                    style="--party-color:${color}; background:none; border:none; padding:0; cursor:pointer;"
                    title="${escHtml(name)}${active ? ' — click to deselect' : ' — click to feature quotes'}">
      <div class="rep-ring">
        <img src="${portraitUrl(bg)}" alt="${escHtml(name)}" onerror="this.src='${FALLBACK_PORTRAIT}'" />
      </div>
      <span class="rep-badge">${escHtml(rep.state || rep.stateCode || '')}</span>
    </button>`;
  }).join('');
}

// ---- Rep grid (all portraits in dropdown) ----

function renderRepGrid() {
  const grid = document.getElementById('repGrid');
  if (!grid) return;
  const pool = availableStateReps.length ? availableStateReps : DEMO_REPS;
  if (!pool.length) {
    grid.innerHTML = '<div class="rep-status">No members found.</div>';
    return;
  }
  grid.innerHTML = pool.map(rep => repCardHtml(rep, 'lg')).join('');
}

// ---- Toggle dropdown ----

function toggleRepDropdown() {
  const dropdown = document.getElementById('repDropdown');
  const chevron  = document.getElementById('repMoreChevron');
  if (!dropdown) return;
  const opening = !dropdown.classList.contains('open');
  dropdown.classList.toggle('open', opening);
  if (chevron) chevron.textContent = opening ? '▴' : '▾';
  if (opening) {
    const sel = document.getElementById('stateSelect');
    if (sel) sel.value = trackedState;
    renderRepGrid();
  }
}

// ---- Toggle tracking for a rep ----

function toggleRepTracked(id) {
  const idx = trackedReps.findIndex(r => r.id === id);
  if (idx >= 0) {
    trackedReps.splice(idx, 1);
  } else {
    const pool   = [...availableStateReps, ...DEMO_REPS];
    const source = pool.find(r => getRepId(r) === id);
    trackedReps.push({
      id,
      name:   formatRepName(source) || id,
      party:  source?.party || source?.partyCode || 'n',
      state:  source?.state || source?.stateCode || trackedState,
      source: 'strip',
    });
  }
  saveTrackedSettings();
  refreshRepStripClasses(); // update tracked highlights without rebuilding the pool
  renderRepGrid();
  renderAll();
}

// Update tracked styling on existing strip cards without rebuilding the pool
function refreshRepStripClasses() {
  const strip = document.getElementById('repStrip');
  if (!strip) return;
  strip.querySelectorAll('.rep-card[data-id]').forEach(card => {
    card.classList.toggle('tracked', trackedReps.some(r => r.id === card.dataset.id));
  });
}

// ---- Manual rep add ----

function addManualTrackedRep() {
  const input = document.getElementById('manualRepInput');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;
  const id = raw.toLowerCase();
  if (trackedReps.some(r => r.id === id)) { input.value = ''; return; }
  trackedReps.push({ id, name: raw, party: 'n', state: trackedState, source: 'manual' });
  saveTrackedSettings();
  input.value = '';
  renderRepStrip();
  renderRepGrid();
  renderAll();
}

function updateTrackedRep(id, checked) {
  if (checked) {
    if (!trackedReps.find(r => r.id === id)) {
      const source = availableStateReps.find(r => getRepId(r) === id);
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
  renderRepGrid();
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
  if (!positions.length) return '';
  return `<div class="positions-section">
    <div class="positions-title">Congressional Positions</div>
    ${positions.map(pos => `<div class="position-row${pos.tracked ? ' tracked' : ''}">
      <span class="position-name">${escHtml(pos.name)} ${partyInitial(pos.party)}</span>
      <span class="position-role ${roleClass(pos.role)}">${escHtml(pos.role)}</span>
    </div>`).join('')}
  </div>`;
}

function renderUnderreportedSection(bill) {
  if (!Array.isArray(bill.underreported) || !bill.underreported.length) return '';
  return `<div class="underreported-section">
    <div class="underreported-title">⚠ Underreported provisions</div>
    ${bill.underreported.map(item => `<div class="underreported-item">
      <div class="underreported-section-name">${escHtml(item.section || 'Section')}</div>
      <div class="underreported-summary">${escHtml(item.summary || '')}</div>
      <div class="underreported-why">${escHtml(item.why_unreported || '')}</div>
    </div>`).join('')}
  </div>`;
}

// ---- Render ----

let _carouselRaf    = null;
let _carouselScroll = null;

function setupCarousel() {
  if (_carouselRaf) { cancelAnimationFrame(_carouselRaf); _carouselRaf = null; }

  const el = document.querySelector('.shock-quotes-grid');
  if (!el || el.children.length === 0) return;

  // Remove any clones from a prior setup
  el.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove());

  const originals = [...el.children];
  if (!originals.length) return;

  // Prepend clones for left-direction infinite wrap
  originals.forEach(card => {
    const clone = card.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    el.insertBefore(clone, el.firstChild);
  });
  // Append clones for right-direction infinite wrap
  originals.forEach(card => {
    const clone = card.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    el.appendChild(clone);
  });

  // Resume saved position, or start in the middle third on first load
  el.scrollLeft = (_carouselScroll !== null) ? _carouselScroll : el.scrollWidth / 3;
  _carouselScroll = null;

  let paused = false;
  el.addEventListener('mouseenter', () => { paused = true; });
  el.addEventListener('mouseleave', () => {
    paused = false;
    isDragging = false;
    el.classList.remove('dragging');
  });

  let isDragging = false, startX = 0, startScroll = 0;
  el.addEventListener('mousedown', e => {
    isDragging  = true;
    startX      = e.pageX;
    startScroll = el.scrollLeft;
    el.classList.add('dragging');
    e.preventDefault();
  });
  el.addEventListener('mouseup',   () => { isDragging = false; el.classList.remove('dragging'); });
  el.addEventListener('mousemove', e => {
    if (!isDragging) return;
    el.scrollLeft = startScroll - (e.pageX - startX) * 1.8;
  });

  const SPEED = 0.1; // px per frame target — accumulator fires each whole pixel
  let scrollAccum = 0;

  function tick() {
    if (!paused) {
      scrollAccum += SPEED;
      if (scrollAccum >= 1) {
        const px = Math.floor(scrollAccum);
        el.scrollLeft += px;
        scrollAccum -= px;
      }
    }

    // Bidirectional infinite wrap — snap within the middle third
    const third = el.scrollWidth / 3;
    if (el.scrollLeft >= third * 2) {
      el.scrollLeft -= third;
      if (isDragging) startScroll -= third;
    } else if (el.scrollLeft < third) {
      el.scrollLeft += third;
      if (isDragging) startScroll += third;
    }

    _carouselRaf = requestAnimationFrame(tick);
  }

  _carouselRaf = requestAnimationFrame(tick);
}

function renderAll() {
  if (favoritesView) { renderFavoritesView(); return; }

  const list = document.getElementById('billList');
  const IN_PROGRESS = ['introduced', 'committee', 'house', 'senate'];

  const filtered = allBills.filter(b => {
    if (activeMainFilter === 'in_progress') {
      return IN_PROGRESS.includes(b.stage) || isJustPassed(b);
    } else if (activeMainFilter === 'dead') {
      return b.stage === 'dead';
    } else {
      return b.stage === 'signed';
    }
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">No bills found for this filter.</div>';
    return;
  }

  const existingCarousel = document.querySelector('.shock-quotes-grid');
  if (existingCarousel) _carouselScroll = existingCarousel.scrollLeft;

  list.innerHTML =
    renderShockQuotesSection() +
    filtered.map((b, i) => renderBill(b, i + 1)).join('');

  setupCarousel();
}

// ---- Favorites view ----

function toggleFavoritesView() {
  favoritesView = !favoritesView;
  const btn        = document.getElementById('favBtn');
  const controls   = document.querySelector('.controls-bar');
  const dropdown   = document.getElementById('repDropdown');
  const label      = document.getElementById('sectionLabel');

  if (favoritesView) {
    btn.classList.add('active');
    controls.style.display  = 'none';
    dropdown.style.display  = 'none';
    label.textContent       = 'Saved';
    renderFavoritesView();
  } else {
    btn.classList.remove('active');
    controls.style.display  = '';
    dropdown.style.display  = '';
    label.textContent       = 'Recent bills';
    renderAll();
  }
}

function renderFavoritesView() {
  const list         = document.getElementById('billList');
  const starredBills = allBills.filter(b => watchedBills.has(b.id));

  let html = renderTrackedRepsSection();

  html += `<div class="fav-section-header">
    <span class="fav-section-title">Tracked bills</span>
    <span class="fav-section-count">${starredBills.length}</span>
  </div>`;

  if (starredBills.length) {
    html += starredBills.map((b, i) => renderBill(b, i + 1)).join('');
  } else {
    html += `<div class="fav-empty">
      <div class="fav-empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.35">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
        </svg>
      </div>
      <div class="fav-empty-title">No tracked bills yet</div>
      <div class="fav-empty-sub">Tap the star on any bill to track it here.</div>
    </div>`;
  }

  list.innerHTML = html;
}

function renderTrackedRepsSection() {
  const sectionHeader = `<div class="fav-section-header">
    <span class="fav-section-title">Tracked reps</span>
    <span class="fav-section-count">${trackedReps.length}</span>
  </div>`;

  if (!trackedReps.length) {
    return sectionHeader + `<div class="fav-empty" style="margin-bottom:1.5rem">
      <div class="fav-empty-title">No tracked reps</div>
      <div class="fav-empty-sub">Click a portrait in the rep strip to follow a representative.</div>
    </div>`;
  }

  const cards = trackedReps.map(rep => {
    const color = partyColor(rep.party);
    const imgSrc = portraitUrl(rep.id);
    const bills = allBills.filter(b => {
      const sponsors = Array.isArray(b.sponsors) ? b.sponsors
        : Array.isArray(b.raw?.sponsors) ? b.raw.sponsors : [];
      return sponsors.some(s => (s.bioguideId || s.id) === rep.id)
        || (b.featured_quotes || []).some(q => q.bioguideId === rep.id);
    });

    const pills = bills.slice(0, 3).map(b => {
      const shortId = b.id.split('-').slice(1).join(' ');
      return `<span class="rep-bill-pill" title="${escHtml(b.title)}">${escHtml(shortId)}</span>`;
    }).join('');
    const more  = bills.length > 3 ? `<span class="rep-bill-more">+${bills.length - 3} more</span>` : '';
    const none  = !bills.length   ? `<span class="rep-bill-more">No bills in current feed</span>` : '';

    const quote = allBills.flatMap(b =>
      (b.featured_quotes || []).filter(q => q.bioguideId === rep.id)
    ).find(Boolean);

    return `<div class="tracked-rep-card" style="--party-color:${color}">
      <div class="tracked-rep-portrait-wrap">
        <img class="tracked-rep-portrait" src="${imgSrc}"
             onerror="this.src='${FALLBACK_PORTRAIT}'" alt="${escHtml(rep.name)}"
             style="border-color:${color}" />
        <span class="rep-badge" style="background:${color}">${escHtml(rep.state || '')}</span>
      </div>
      <div class="tracked-rep-info">
        <div class="tracked-rep-name">${escHtml(rep.name)}</div>
        <div class="tracked-rep-meta">${escHtml(partyInitial(rep.party))} · ${bills.length} bill${bills.length !== 1 ? 's' : ''} in feed</div>
        <div class="tracked-rep-bills">${pills}${more}${none}</div>
        ${quote ? `<div class="tracked-rep-quote">"${escHtml(quote.text)}"</div>` : ''}
      </div>
      <button class="tracked-rep-untrack" onclick="toggleRepTracked('${escHtml(rep.id)}')" title="Untrack">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>`;
  }).join('');

  return sectionHeader + `<div class="tracked-reps-list">${cards}</div>`;
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
        source: bill.date ? 'Floor, ' + formatDateCompact(bill.date) : '',
        billId: bill.id, billTitle: bill.title,
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
  const quoteKey = q => (q.bioguideId || q.name) + '|' + (q.text || '').slice(0, 25);
  const pool = buildQuotePool();
  if (!pool.length) return '';

  // Featured: top 2 by shock score
  const featured = [...pool].sort((a, b) => b.shockScore - a.shockScore).slice(0, 2);
  const used = new Set(featured.map(quoteKey));

  // Selected: user-toggled reps in portrait strip
  const selected = pool.filter(q => selectedRepIds.has(q.bioguideId) && !used.has(quoteKey(q)));
  selected.forEach(q => used.add(quoteKey(q)));

  // Tracked: auto-detected reps
  const trackedIdSet = new Set(trackedReps.map(r => r.id));
  const tracked = pool.filter(q =>
    (trackedIdSet.has(q.bioguideId) || trackedIdSet.has(q.name?.toLowerCase())) &&
    !used.has(quoteKey(q))
  );
  tracked.forEach(q => used.add(quoteKey(q)));

  // Rest: fill to minimum 5
  const rest = pool.filter(q => !used.has(quoteKey(q)));
  const ordered = [...featured, ...selected, ...tracked, ...rest];
  const display = ordered.slice(0, Math.max(5, featured.length + selected.length));

  const html = display.map((q, i) => {
    const isFeatured = i < featured.length;
    const color = partyColor(q.party);
    const repHref  = q.bioguideId ? `rep.html?id=${escHtml(q.bioguideId)}` : null;
    const billInCache = q.billId && allBills.some(b => b.id === q.billId);
    const billHref = q.billId
      ? (billInCache ? `#card-${escHtml(q.billId)}` : `bill-pending.html?id=${escHtml(q.billId)}`)
      : null;

    const portraitInner = `
      <img class="shock-quote-portrait" src="${portraitUrl(q.bioguideId)}"
           onerror="this.src='${FALLBACK_PORTRAIT}'" alt="${escHtml(q.name)}"
           style="border: 2px solid ${color}" />
      <div class="shock-quote-rep-text">
        <div class="shock-quote-name">${escHtml(q.name)}</div>
        <div class="shock-quote-source">${escHtml(q.source || '')}</div>
      </div>`;

    const headerArea = repHref
      ? `<a href="${repHref}" class="shock-quote-rep-link">${portraitInner}</a>`
      : `<div class="shock-quote-rep-link">${portraitInner}</div>`;

    const quoteBody = billHref
      ? `<a href="${billHref}" class="shock-quote-text-link">
          <div class="shock-quote-text">"${escHtml(q.text)}"</div>
          ${q.billTitle ? `<div class="shock-quote-bill">${escHtml(q.billTitle)}</div>` : ''}
        </a>`
      : `<div class="shock-quote-text">"${escHtml(q.text)}"</div>`;

    return `<div class="shock-quote-card${isFeatured ? ' is-featured' : ''}">
      <div class="shock-quote-header">${headerArea}</div>
      ${quoteBody}
    </div>`;
  }).join('');

  return `<div class="shock-quotes-section">
    <div class="shock-quotes-label">From the floor this week</div>
    <div class="shock-quotes-grid">${html}</div>
  </div>`;
}

function renderBill(bill, num) {
  const state    = openCards.get(bill.id);
  const col      = likelihoodColor(bill.likelihood);
  const watching = watchedBills.has(bill.id);
  return `<div class="bill-card" id="card-${bill.id}">
    ${renderHeader(bill, state, num, watching)}
    ${renderLikelihoodFooter(bill, col, state)}
    ${renderMinorBody(bill, col, state === 'minor')}
    ${renderBody(bill, state === 'full', col)}
  </div>`;
}

function formatDateCompact(dateStr) {
  // "Apr 20, 2026" → "20/04/26"
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  } catch(e) { return dateStr; }
}

function renderHeader(bill, state, num, watching) {
  const isOpen     = !!state;
  const lcolor     = bill.likelihood >= 65 ? '#3a7a4f' : bill.likelihood >= 45 ? '#a87d24' : '#a14040';
  const sponsorSrc = bill.sponsor_bioguide ? portraitUrl(bill.sponsor_bioguide) : FALLBACK_PORTRAIT;
  const cosponsors = bill.raw?.cosponsors?.count || bill.cosponsors || 0;
  const pages      = bill.pages || '';
  const dateShort  = formatDateCompact(bill.date);
  const version    = bill.version || 'v1.0';

  const sponsorMeta = [
    `SPONSOR · ${bill.sponsor.toUpperCase()}`,
    cosponsors ? `${cosponsors} COSPONSORS` : null,
    pages ? `${pages} PAGES` : null
  ].filter(Boolean).join(' · ');

  return `<div class="bill-header" onclick="toggleCard('${bill.id}')">
    <div class="bill-rank-col">
      ${bill.live ? `<span class="status-badge status-live">LIVE</span>` : ''}
      ${bill.demo ? `<span class="status-badge status-demo">DEMO</span>` : ''}
      ${isJustPassed(bill) ? `<span class="status-badge status-just-passed">JUST PASSED</span>` : ''}
      <div class="bill-number">#${num || ''}</div>
    </div>
    <img class="sponsor-portrait" src="${sponsorSrc}" onerror="this.src='${FALLBACK_PORTRAIT}'" alt="${escHtml(bill.sponsor)}" />
    <div class="bill-title-block">
      <div class="bill-meta-row">
        <span class="bill-meta-compact">${escHtml(bill.stageLabel)} · ${escHtml(version)} · ${escHtml(dateShort)}</span>
      </div>
      <div class="bill-title">${escHtml(bill.title)}</div>
      ${bill.summary ? `<div class="bill-summary">${escHtml(bill.summary)}</div>` : ''}
      <div class="bill-meta">${escHtml(sponsorMeta)}</div>
    </div>
    <div class="bill-actions-col">
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
        <div class="top-line-content"><div class="top-line-headline">${escHtml(item)}</div></div>
      </div>`;
    }
    // New headline + subs format
    const subs = (item.subs || []).slice(0, 3).map(s =>
      `<div class="top-line-sub">${escHtml(s)}</div>`
    ).join('');
    return `<div class="top-line-item">
      <span class="top-line-bullet">—</span>
      <div class="top-line-content">
        <div class="top-line-headline">${escHtml(item.headline || '')}</div>
        ${subs}
      </div>
    </div>`;
  };

  return `<div class="top-lines">
    ${bill.brief ? `<div class="top-lines-brief">${escHtml(bill.brief)}</div>` : ''}
    ${items.slice(0, 3).map(renderLine).join('')}
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
  if (!added.length && !modified.length && !removed.length) return '';

  const block = (label, symbol, color, bg, items) => {
    if (!items.length) return `<div class="patch-block" style="background:${bg}">
      <div class="patch-block-label" style="color:${color}">
        <span class="patch-block-symbol">${symbol}</span>${label}
      </div>
      <div class="patch-block-items"><div class="patch-block-item" style="color:#a8acb8;font-style:italic">None</div></div>
    </div>`;
    return `<div class="patch-block" style="background:${bg}">
      <div class="patch-block-label" style="color:${color}">
        <span class="patch-block-symbol">${symbol}</span>${label}
      </div>
      <div class="patch-block-items">${items.map(t => `<div class="patch-block-item">${escHtml(t)}</div>`).join('')}</div>
    </div>`;
  };

  return `<div class="what-changed-section">
    <div class="what-changed-label">What changed in ${escHtml(bill.version || 'this version')}</div>
    <div class="what-changed-grid">
      ${block('Added', '+', '#3a7a4f', '#eef5ef', added)}
      ${block('Modified', '~', '#a87d24', '#f7f1e3', modified)}
      ${block('Removed', '−', '#a14040', '#f7ecec', removed)}
    </div>
  </div>`;
}

function renderMinorBody(bill, col, isOpen) {
  const topUnder = bill.underreported?.[0];
  const underHtml = topUnder ? `
    <div class="underreported-teaser">
      <span class="underreported-badge">⚠ Underreported</span>
      <div class="underreported-headline">${escHtml(topUnder.section)}</div>
      <div class="underreported-preview">${escHtml(topUnder.summary)}</div>
    </div>` : '';

  const likelihoodDetail = `<div class="likelihood-detail" style="margin:0.65rem 1.1rem 0;border-left:3px solid ${col.fill}">
    <div class="likelihood-detail-title" style="color:${col.text}">${bill.likelihoodLabel} · ${bill.likelihood}% chance of passage</div>
    <div class="likelihood-detail-text">${escHtml(bill.brief || bill.likelihoodReason || '')}</div>
  </div>`;

  return `<div class="bill-body-minor ${isOpen ? 'open' : ''}">
    ${likelihoodDetail}
    ${renderTopLines(bill)}
    ${underHtml}
    ${renderQuoteCards(bill)}
    <button class="expand-full-btn" onclick="expandFull('${bill.id}', event)">Full analysis ↓</button>
  </div>`;
}

function renderQuoteCards(bill) {
  const quotes = bill.featured_quotes;
  if (!quotes?.length) return '';
  return `<div class="quote-cards-row">
    ${quotes.slice(0, 2).map(q => {
      const stanceCls = q.stance === 'support' ? 'stance-support' : 'stance-oppose';
      const stanceLabel = q.stance === 'support' ? 'SUPPORT' : 'OPPOSE';
      return `<div class="quote-card">
        <div class="quote-card-meta">
          <a href="rep.html?id=${q.bioguideId}" class="quote-card-rep" style="text-decoration: none; color: inherit;">
            <img class="quote-portrait" src="${portraitUrl(q.bioguideId)}"
                 onerror="this.src='${FALLBACK_PORTRAIT}'" alt="${escHtml(q.name)}" />
            <div class="quote-card-name">
              <span onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escHtml(q.name)}</span>
              <span class="chip chip-${(q.party||'n').toLowerCase()[0]}">${q.party}</span>
            </div>
          </a>
          <span class="quote-stance ${stanceCls}">${stanceLabel}</span>
        </div>
        <div class="quote-text">"${escHtml(q.text)}"</div>
      </div>`;
    }).join('')}
  </div>`;
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

  const sectionsHtml = bill.sections?.length
    ? `<div class="patch-notes">${bill.sections.map((sec, si) => renderSection(bill, sec, si)).join('')}</div>`
    : `<div class="patch-notes"><p style="font-size:0.85rem;color:var(--text-3);padding:0.5rem 0">Click "Analyze with AI" below to generate patch notes for this bill.</p></div>`;

  const positionsHtml     = renderPositionsSection(bill);
  const underreportedHtml = renderUnderreportedSection(bill);

  const criticismsHtml = bill.criticisms?.length ? `
    <div class="section-divider"></div>
    <div class="criticism-section">
      <div class="criticism-title">⚑ Opposed — who and why</div>
      ${bill.criticisms.map(c => `<div class="criticism-item"><span class="criticism-who">${escHtml(c.who)}:</span> ${escHtml(c.why)}</div>`).join('')}
    </div>` : '';

  const gapsHtml = bill.gaps?.length ? `
    <div class="gaps-section">
      <div class="gaps-title">◈ Not addressed in this bill</div>
      ${bill.gaps.map(g => `<div class="gaps-item">${escHtml(g)}</div>`).join('')}
    </div>` : '';

  return `<div class="bill-body ${isOpen ? 'open' : ''}">
    ${topLinesHtml}
    ${renderChangesSection(bill)}
    ${sectionsHtml}
    ${positionsHtml}
    ${underreportedHtml}
    ${criticismsHtml}
    ${gapsHtml}
  </div>`;
}

function renderSection(bill, sec, si) {
  return `<div class="patch-section">
    <div class="patch-section-title">${escHtml(sec.label)}</div>
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
    `<div class="item-detail-comment">${escHtml(c.text)}</div>`
  ).join('') || '';

  return `<div class="patch-item">
    <div class="patch-item-main">${escHtml(item.main)}</div>
    ${chipsHtml}
    ${item.detail ? `
      <button class="more-btn" onclick="toggleDetail('${key}')">${isOpen ? '▲ hide details' : '▼ more info'}</button>
      <div class="item-detail ${isOpen ? 'open' : ''}" id="detail-${key}">
        <div>${escHtml(item.detail)}</div>
        ${commentsDetail}
      </div>` : ''}
  </div>`;
}

// ---- Interactions ----

function toggleCard(id) {
  const state = openCards.get(id);
  if (state === 'minor') openCards.delete(id);   // minor → closed
  else openCards.set(id, 'minor');               // closed or full → minor
  renderAll();
}

function expandFull(id, e) {
  e && e.stopPropagation();
  openCards.set(id, 'full');
  renderAll();
}

function toggleDetail(key) {
  openDetails[key] = !openDetails[key];
  renderAll();
}

// ---- AI Analysis ----
// Gemini 3.1 work: Removed client-side AI Analysis execution. All analysis is now provided statically via cache.json.

// ---- Helpers ----

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

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
