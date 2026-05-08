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
  updateLogoForTheme(isDark);

  // Contextual back button — show bill name if we came from a bill's quote card
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    const ref = urlParams.get('ref') || '';
    const billTitleParam = urlParams.get('billTitle') || '';
    if (ref.startsWith('bill-')) {
      const billId = ref.slice(5);
      const label = billTitleParam || formatBillId(billId) || 'Bill';
      backBtn.href = `index.html?scrollTo=${encodeURIComponent(billId)}`;
      backBtn.textContent = `← ${label}`;
    }
  }

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
  portrait.src = rep.photo
    || (rep.bioguideId ? `https://bioguide.congress.gov/bioguide/photo/${rep.bioguideId[0].toUpperCase()}/${rep.bioguideId}.jpg` : FALLBACK_PORTRAIT);
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
    renderVotingHistory(rep);
    return;
  }

  rep.comments.sort((a, b) => new Date(b.date) - new Date(a.date));

  commentsContainer.innerHTML = rep.comments.map(c => {
    const stanceCls   = c.stance === 'support' ? 'stance-support' : 'stance-oppose';
    const stanceLabel = c.stance === 'support' ? 'SUPPORT' : 'OPPOSE';
    const chamberFallback = c.source?.includes('Senate') ? 'Senate Floor' : c.source?.includes('House') ? 'House Floor' : 'Floor Statement';
    const billLabel   = c.billTitle || formatBillId(c.billId) || chamberFallback;
    const billUrl     = c.billId
      ? `index.html?fromRep=${encodeURIComponent(rep.bioguideId)}&repName=${encodeURIComponent(rep.name)}&scrollTo=${encodeURIComponent(c.billId)}`
      : null;
    const titleEl     = billUrl
      ? `<a href="${billUrl}" class="rep-bill-link">${escHtml(billLabel)}</a>`
      : `<span class="rep-bill-link" style="cursor:default">${escHtml(billLabel)}</span>`;
    return `
      <div class="quote-card rep-comment-card">
        <div class="rep-comment-title">
          ${titleEl}
          <span class="quote-stance ${stanceCls}">${stanceLabel}</span>
        </div>
        <div class="quote-text">"${escHtml(c.text)}"</div>
        <div style="font-size:0.7rem;color:var(--text-3);font-family:var(--font-mono);margin-top:10px">${formatDate(c.date)}</div>
      </div>
    `;
  }).join('');

  renderVotingHistory(rep);
}

// ---- Utilities ----

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
  } catch(e) { return dateStr; }
}

function formatBillId(billId) {
  if (!billId) return null;
  return billId.replace(/^\d+-/, '')
    .replace(/^HR-/, 'H.R. ')
    .replace(/^S-/, 'S. ')
    .replace(/^HCONRES-/, 'H.Con.Res. ')
    .replace(/^SCONRES-/, 'S.Con.Res. ')
    .replace(/^HJRES-/, 'H.J.Res. ')
    .replace(/^SJRES-/, 'S.J.Res. ')
    .replace(/^HRES-/, 'H.Res. ')
    .replace(/^SRES-/, 'S.Res. ');
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function renderVotingHistory(rep) {
  var container   = document.getElementById('repVoteHistory');
  var labelEl     = document.getElementById('repVoteHistoryLabel');
  var history     = Array.isArray(rep.voteHistory) ? rep.voteHistory : [];

  if (history.length === 0) {
    if (labelEl) labelEl.style.display = 'none';
    if (container) container.style.display = 'none';
    return;
  }

  var html = '';
  for (var v of history) {
    var billLabel = v.billTitle ? escHtml(v.billTitle) : escHtml(formatBillId(v.billId) || v.billId);
    var billIdFmt = escHtml(formatBillId(v.billId) || '');
    var billUrl   = 'index.html?scrollTo=' + encodeURIComponent(v.billId);
    var rawVote   = (v.vote || '').toLowerCase();
    var voteDisplay = rawVote.includes('yea') || rawVote.includes('yes') ? 'Yea'
                    : rawVote.includes('nay') || rawVote.includes('no')  ? 'Nay'
                    : rawVote.includes('not')                            ? 'Not Voting'
                    : (v.vote || '');
    var badgeCls = voteDisplay === 'Yea' ? 'rv-yea' : voteDisplay === 'Nay' ? 'rv-nay' : 'rv-nv';
    html += '<div class="rep-vote-row">'
      + '<div class="rep-vote-bill">'
      + '<a href="' + billUrl + '" class="rep-vote-bill-link">' + billLabel + '</a>'
      + (billIdFmt ? '<span class="rep-vote-bill-id">' + billIdFmt + '</span>' : '')
      + '</div>'
      + '<span class="rep-vote-badge ' + badgeCls + '">' + escHtml(voteDisplay) + '</span>'
      + '<span class="rep-vote-date">' + formatDate(v.date || '') + '</span>'
      + '</div>';
  }
  if (container) container.innerHTML = html;
}
