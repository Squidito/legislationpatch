// app-reps.js — rep portraits, strip carousel, tracking (split from app.js 2026-07-06).
// Load order: after app-settings.js.

// ---- Portrait helpers ----

// (deduped into util.js 2026-07-06) PHOTO_OVERRIDES lives in util.js

// (deduped into util.js 2026-07-06) portraitUrl lives in util.js

// (deduped into util.js 2026-07-06) partyColor lives in util.js

// (deduped into util.js 2026-07-06) repLastName lives in util.js

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

