// rep.js
const FALLBACK_PORTRAIT = 'https://www.congress.gov/img/member/blank_200.jpg';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const repId = urlParams.get('id');

  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const profileEl = document.getElementById('repProfile');

  // Load theme preference
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.checked = isDark;

  if (!repId) {
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
    return;
  }

  try {
    const res = await fetch(`data/reps/${repId}.json`);
    if (!res.ok) throw new Error('Data not found');
    const rep = await res.json();
    
    renderProfile(rep);
    
    loadingState.style.display = 'none';
    profileEl.style.display = 'block';
  } catch (err) {
    console.error(err);
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
  }
}

function renderProfile(rep) {
  document.title = `${rep.name} — LegislationPatch`;
  
  const portrait = document.getElementById('repPortrait');
  portrait.src = rep.portraitUrl || FALLBACK_PORTRAIT;
  portrait.onerror = () => { portrait.src = FALLBACK_PORTRAIT; };

  document.getElementById('repName').textContent = rep.name;
  
  const partyLetter = (rep.party || 'N').charAt(0).toUpperCase();
  document.getElementById('repMeta').innerHTML = `
    <span class="chip chip-${partyLetter.toLowerCase()}">${rep.party}</span>
    <span style="color: var(--text-3); font-size: 0.85rem; font-family: var(--font-mono);">${rep.role} · ${rep.state}${rep.district ? `-${rep.district}` : ''}</span>
  `;

  document.getElementById('repBio').textContent = rep.bio || '';

  const commentsContainer = document.getElementById('repComments');
  if (!rep.comments || rep.comments.length === 0) {
    commentsContainer.innerHTML = `<div class="empty-state">No recorded comments on recent legislation.</div>`;
    return;
  }

  // Sort by date descending
  rep.comments.sort((a, b) => new Date(b.date) - new Date(a.date));

  commentsContainer.innerHTML = rep.comments.map(c => {
    const stanceCls = c.stance === 'support' ? 'stance-support' : 'stance-oppose';
    const stanceLabel = c.stance === 'support' ? 'SUPPORT' : 'OPPOSE';
    return `
      <div class="quote-card rep-comment-card">
        <div class="quote-card-meta" style="margin-bottom: 8px;">
          <a href="index.html#${c.billId}" class="rep-bill-link" title="View bill details">
            <strong>${escHtml(c.billTitle)}</strong>
          </a>
          <span class="quote-stance ${stanceCls}">${stanceLabel}</span>
        </div>
        <div class="quote-text">"${escHtml(c.text)}"</div>
        <div style="font-size: 0.7rem; color: var(--text-3); font-family: var(--font-mono); margin-top: 10px;">${c.date}</div>
      </div>
    `;
  }).join('');
}

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
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}
