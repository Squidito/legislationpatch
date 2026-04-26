// rep.js
const FALLBACK_PORTRAIT = 'https://www.congress.gov/img/member/blank_200.jpg';

let currentRep = null; // set when profile loads, used by toggleRepStar

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const repId = urlParams.get('id');

  const loadingState = document.getElementById('loadingState');
  const errorState   = document.getElementById('errorState');
  const profileEl    = document.getElementById('repProfile');

  // Load theme — same key as main site
  const isDark = localStorage.getItem('lpTheme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.checked = isDark;

  if (!repId) {
    loadingState.style.display = 'none';
    errorState.style.display   = 'block';
    return;
  }

  try {
    const res = await fetch(`data/reps/${repId}.json`);
    if (!res.ok) throw new Error('Data not found');
    const rep = await res.json();

    currentRep = rep;
    renderProfile(rep);
    updateStarBtn(isTracked(rep.bioguideId));

    loadingState.style.display = 'none';
    profileEl.style.display    = 'block';
  } catch (err) {
    console.error(err);
    loadingState.style.display = 'none';
    errorState.style.display   = 'block';
  }
}

// ---- Rep tracking ----

function getTrackedReps() {
  try { return JSON.parse(localStorage.getItem('lpTrackedReps') || '[]'); }
  catch { return []; }
}

function isTracked(bioguideId) {
  return getTrackedReps().some(r => r.id === bioguideId);
}

function toggleRepStar() {
  if (!currentRep) return;
  const id   = currentRep.bioguideId;
  let reps   = getTrackedReps();
  const idx  = reps.findIndex(r => r.id === id);

  if (idx >= 0) {
    reps.splice(idx, 1);
  } else {
    reps.push({
      id,
      name:   currentRep.name,
      party:  currentRep.party,
      state:  currentRep.state,
      source: 'rep-page',
    });
  }

  localStorage.setItem('lpTrackedReps', JSON.stringify(reps));
  updateStarBtn(reps.some(r => r.id === id));
}

function updateStarBtn(tracked) {
  const btn = document.getElementById('repStarBtn');
  if (!btn) return;
  btn.classList.toggle('watching', tracked);
  btn.title = tracked ? 'Untrack this representative' : 'Track this representative';
}

// ---- Profile rendering ----

function renderProfile(rep) {
  document.title = `${rep.name} — LegislationPatch`;

  const portrait = document.getElementById('repPortrait');
  portrait.src = rep.portraitUrl || FALLBACK_PORTRAIT;
  portrait.onerror = () => { portrait.src = FALLBACK_PORTRAIT; };

  document.getElementById('repName').textContent = rep.name;

  const partyLetter = (rep.party || 'N').charAt(0).toUpperCase();
  document.getElementById('repMeta').innerHTML = `
    <span class="chip chip-${partyLetter.toLowerCase()}">${rep.party}</span>
    <span style="color:var(--text-3);font-size:0.85rem;font-family:var(--font-mono)">
      ${rep.role} · ${rep.state}${rep.district ? `-${rep.district}` : ''}
    </span>
  `;

  document.getElementById('repBio').textContent = rep.bio || '';

  const commentsContainer = document.getElementById('repComments');
  if (!rep.comments || rep.comments.length === 0) {
    commentsContainer.innerHTML = `<div class="empty-state">No recorded comments on recent legislation.</div>`;
    return;
  }

  rep.comments.sort((a, b) => new Date(b.date) - new Date(a.date));

  commentsContainer.innerHTML = rep.comments.map(c => {
    const stanceCls   = c.stance === 'support' ? 'stance-support' : 'stance-oppose';
    const stanceLabel = c.stance === 'support' ? 'SUPPORT' : 'OPPOSE';
    return `
      <div class="quote-card rep-comment-card">
        <div class="quote-card-meta" style="margin-bottom:8px">
          <a href="index.html#${c.billId}" class="rep-bill-link" title="View bill details">
            <strong>${escHtml(c.billTitle)}</strong>
          </a>
          <span class="quote-stance ${stanceCls}">${stanceLabel}</span>
        </div>
        <div class="quote-text">"${escHtml(c.text)}"</div>
        <div style="font-size:0.7rem;color:var(--text-3);font-family:var(--font-mono);margin-top:10px">${c.date}</div>
      </div>
    `;
  }).join('');
}

// ---- Utilities ----

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toggleTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('lpTheme', isDark ? 'dark' : 'light');
}
