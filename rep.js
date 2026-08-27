// rep.js
// (deduped into util.js 2026-07-06) (fallback changes from congress.gov blank_200 to the neutral SVG)

let currentRep = null; // set when profile loads, used by toggleRepStar

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  // Static /rep/<slug>/ pages carry the id in <meta name="rep-id"> (no query
  // string); rep.html?id= links land on the redirector and never reach here.
  const metaRep = document.querySelector('meta[name="rep-id"]');
  const repId = safeBioId(urlParams.get('id') || (metaRep && metaRep.content) || '');
  const isStaticPage = !!metaRep;

  const loadingState = document.getElementById('loadingState');
  const errorState   = document.getElementById('errorState');
  const profileEl    = document.getElementById('repProfile');

  // Load theme — same key as main site (dark is the default)
  const isDark = localStorage.getItem('lpTheme') !== 'light';
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.checked = isDark;
  updateLogoForTheme(isDark);

  // Contextual back button
  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    const ref = urlParams.get('ref') || '';
    if (ref.startsWith('bill-')) {
      const billId = ref.slice(5);
      backBtn.href = `/?scrollTo=${encodeURIComponent(billId)}`;
      backBtn.textContent = '← Home';
    } else if (ref === 'home') {
      backBtn.href = '/';
      backBtn.textContent = '← Home';
    } else if (ref === 'reps') {
      backBtn.href = '/reps.html';
      backBtn.textContent = '← Reps';
    }
  }

  if (!repId) {
    loadingState.style.display = 'none';
    errorState.style.display   = 'block';
    return;
  }

  try {
    // Root-absolute: static pages live two levels deep at /rep/<slug>/, where a
    // relative "data/…" path would 404.
    const res = await fetch(`/data/reps/${repId}.json`);
    if (!res.ok) throw new Error('Data not found');
    const rep = await res.json();

    currentRep = rep;
    renderProfile(rep, isStaticPage);
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

const PARTY_FULL = { D: 'Democrat', R: 'Republican', I: 'Independent' };
const STATE_FULL = STATE_NAMES; // (deduped into util.js 2026-07-06) — same map, kept under rep.js's local name

function renderProfile(rep, isStaticPage) {
  // Static /rep/<slug>/ pages ship the richer server-rendered head (unique
  // title/description/canonical + ProfilePage JSON-LD) — leave it in place.
  if (!isStaticPage) {
    var repRole = rep.role === 'Senator' ? 'Senator' : 'Representative';
    var repParty = PARTY_FULL[(rep.party || 'I').toUpperCase()[0]] || rep.party || '';
    var repState = STATE_FULL[rep.state] || rep.state || '';
    var repDesc = repRole + ' ' + (rep.name || '') + ' (' + repParty + ', ' + repState + '). Voting record and floor statements on LegislationPatch.';
    var slugUrl = 'https://legislationpatch.com/rep/' + repSlug(rep) + '/';
    setPageMeta(
      (rep.name || 'Representative') + ' — LegislationPatch',
      repDesc.slice(0, 160),
      slugUrl
    );
    injectRepSchema(rep, slugUrl);
  }

  // Static pages arrive fully server-rendered (with crawlable /bill/<slug>/
  // links baked in) — do not rebuild their DOM; just wire the interactive bits.
  if (isStaticPage) { hydrateStatic(rep); return; }

  // Portrait. SECURITY: rep.photo is from ingested rep JSON — only allow an https
  // image URL; portraitUrl() validates the bioguide id for the fallback path.
  const portrait = document.getElementById('repPortrait');
  const httpsPhoto = (typeof rep.photo === 'string' && /^https:\/\//i.test(rep.photo)) ? rep.photo : null;
  portrait.src = httpsPhoto || portraitUrl(rep.bioguideId);
  portrait.onerror = () => { portrait.src = FALLBACK_PORTRAIT; };

  // Profile card — party accent class
  const partyKey  = (rep.party || 'I').toUpperCase()[0];
  const partyLow  = partyKey === 'D' ? 'd' : partyKey === 'R' ? 'r' : 'i';
  const card      = document.getElementById('repProfileCard');
  if (card) card.classList.add('party-' + partyLow);

  // Eyebrow: role · state
  const chamber    = rep.role === 'Senator' ? 'Senate' : 'House';
  const districtTx = rep.district ? ' · District ' + rep.district : '';
  const eyebrow    = document.getElementById('repEyebrow');
  if (eyebrow) eyebrow.textContent = rep.role + ' · ' + (STATE_FULL[rep.state] || rep.state) + districtTx;

  // Name
  document.getElementById('repName').textContent = rep.name;

  // Party chip
  const chipEl = document.getElementById('repPartyChip');
  if (chipEl) chipEl.innerHTML = '<span class="chip chip-' + partyLow + '">' + escHtml(rep.party || 'I') + '</span>';

  // Stat grid
  var stats = [
    { label: 'Chamber', value: chamber },
    { label: 'Party',   value: escHtml(PARTY_FULL[partyKey] || rep.party || 'Independent') },
    { label: 'State',   value: escHtml(STATE_FULL[rep.state] || rep.state || '—') },
  ];
  if (rep.district) stats.push({ label: 'District', value: rep.district + (rep.district === 1 ? 'st' : rep.district === 2 ? 'nd' : rep.district === 3 ? 'rd' : 'th') });

  const gridEl = document.getElementById('repStatGrid');
  if (gridEl) {
    gridEl.innerHTML = stats.map(function(s) {
      return '<div class="rep-stat-cell">'
        + '<span class="rep-stat-label">' + escHtml(s.label) + '</span>'
        + '<span class="rep-stat-value">' + s.value + '</span>'
        + '</div>';
    }).join('');
  }

  // Vote breakdown (from voteHistory)
  const history   = Array.isArray(rep.voteHistory) ? rep.voteHistory : [];
  const votePanel = document.getElementById('repVoteProfile');
  if (votePanel && history.length > 0) {
    var yeas = 0, nays = 0, nvs = 0;
    history.forEach(function(v) {
      var lv = (v.vote || '').toLowerCase();
      if (lv === 'yea' || lv === 'yes' || lv === 'aye')           yeas++;
      else if (lv === 'nay' || lv === 'no')                       nays++;
      else                                                         nvs++;
    });
    var total = history.length;
    var yeaPct = Math.round(yeas / total * 100);
    var nayPct = Math.round(nays / total * 100);
    var nvPct  = 100 - yeaPct - nayPct;
    votePanel.innerHTML = '<div class="rep-vote-profile-label">On the Record <span class="rep-vote-profile-count">' + total + ' tracked vote' + (total !== 1 ? 's' : '') + '</span></div>'
      + '<div class="rep-vote-bar-row">'
      + (yeas > 0 ? '<div class="rep-vote-bar-seg seg-yea" style="width:' + yeaPct + '%" title="Yea: ' + yeas + '"></div>' : '')
      + (nays > 0 ? '<div class="rep-vote-bar-seg seg-nay" style="width:' + nayPct + '%" title="Nay: ' + nays + '"></div>' : '')
      + (nvs  > 0 ? '<div class="rep-vote-bar-seg seg-nv"  style="width:' + nvPct  + '%" title="Not Voting: ' + nvs + '"></div>' : '')
      + '</div>'
      + '<div class="rep-vote-bar-legend">'
      + (yeas > 0 ? '<span class="legend-yea">Yea ' + yeas + '</span>' : '')
      + (nays > 0 ? '<span class="legend-nay">Nay ' + nays + '</span>' : '')
      + (nvs  > 0 ? '<span class="legend-nv">Not Voting ' + nvs + '</span>' : '')
      + '</div>';
    votePanel.style.display = 'block';
  }

  // Bio
  const bioBlock = document.getElementById('repBioBlock');
  const bioEl    = document.getElementById('repBio');
  if (bioEl && rep.bio && rep.bio.length > 120) {
    bioEl.textContent = rep.bio;
    // SECURITY: rep.bioUrl comes from the Wikipedia-API ingestion — only render the
    // link if it's a real http(s) URL, so a "javascript:"/"data:" scheme can't run.
    var bioHref = null;
    try { var u = new URL(rep.bioUrl); if (u.protocol === 'https:' || u.protocol === 'http:') bioHref = u.href; } catch (e) { /* not a valid URL — skip the link */ }
    if (bioHref) {
      var attrib = document.createElement('a');
      attrib.href        = bioHref;
      attrib.target      = '_blank';
      attrib.rel         = 'noopener noreferrer';
      attrib.className   = 'rep-bio-source';
      attrib.textContent = 'Wikipedia';
      bioEl.parentNode.appendChild(attrib);
    }
    if (bioBlock) bioBlock.style.display = 'block';
  }

  // Comments
  const commentsContainer = document.getElementById('repComments');
  if (!rep.comments || rep.comments.length === 0) {
    commentsContainer.innerHTML = '<div class="empty-state">No recorded floor statements.</div>';
    renderVotingHistory(rep);
    return;
  }

  const FLOOR_DEFAULT = 3;
  const FLOOR_STEP    = 10;

  rep.comments.sort((a, b) => new Date(b.date) - new Date(a.date));

  commentsContainer.innerHTML = rep.comments.map((c, idx) => {
    const stanceCls   = c.stance === 'support' ? 'stance-support' : 'stance-oppose';
    const stanceLabel = c.stance === 'support' ? 'SUPPORT' : 'OPPOSE';
    const chamberFallback = c.source?.includes('Senate') ? 'Senate Floor' : c.source?.includes('House') ? 'House Floor' : 'Floor Statement';
    const billLabel   = c.billTitle || formatBillId(c.billId) || chamberFallback;
    const billUrl     = c.billId
      ? `/?fromRep=${encodeURIComponent(rep.bioguideId)}&repName=${encodeURIComponent(rep.name)}&scrollTo=${encodeURIComponent(c.billId)}`
      : null;
    const titleEl     = billUrl
      ? `<a href="${billUrl}" class="rep-bill-link">${escHtml(billLabel)}</a>`
      : `<span class="rep-bill-link" style="cursor:default">${escHtml(billLabel)}</span>`;
    const hidden = idx >= FLOOR_DEFAULT ? ' style="display:none"' : '';
    return '<div class="rep-show-item" data-idx="' + idx + '"' + hidden + '>'
      + '<div class="quote-card rep-comment-card">'
      + '<div class="rep-comment-title">' + titleEl + (c.stance ? '<span class="quote-stance ' + stanceCls + '">' + stanceLabel + '</span>' : '') + '</div>'
      + '<div class="quote-text">&ldquo;' + escHtml(c.text) + '&rdquo;</div>'
      + '<div style="font-size:0.7rem;color:var(--text-3);font-family:var(--font-mono);margin-top:10px">' + formatDate(c.date) + '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  if (rep.comments.length > FLOOR_DEFAULT) {
    renderShowMoreBtn(commentsContainer, FLOOR_DEFAULT, rep.comments.length, FLOOR_STEP);
  }

  renderVotingHistory(rep);
}

// ---- Static-page hydration (progressive enhancement only) ----

// Server-rendered /rep/<slug>/ pages ship every statement and vote visible (so
// the full content is readable with JS off and crawlable). Hydration collapses
// the long lists to the same defaults the client renderer uses and wires the
// show-more buttons + portrait fallback — nothing is re-rendered.
function hydrateStatic(rep) {
  var portrait = document.getElementById('repPortrait');
  if (portrait) portrait.onerror = function () { portrait.src = FALLBACK_PORTRAIT; };
  collapseStaticList(document.getElementById('repComments'), 3, 10);
  collapseStaticList(document.getElementById('repVoteHistory'), 8, 15);
}

function collapseStaticList(container, defaultCount, step) {
  if (!container) return;
  var items = container.querySelectorAll('.rep-show-item');
  if (items.length <= defaultCount) return;
  for (var i = defaultCount; i < items.length; i++) items[i].style.display = 'none';
  renderShowMoreBtn(container, defaultCount, items.length, step);
}

// ---- JSON-LD schema injector ----

function injectRepSchema(rep, url) {
  var el = document.getElementById('rep-schema');
  if (!el) return;
  url = url || ('https://legislationpatch.com/rep/' + repSlug(rep) + '/');
  var chamber = rep.role === 'Senator' ? 'United States Senate' : 'United States House of Representatives';
  el.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        'name': rep.name,
        'jobTitle': rep.role || 'Member of Congress',
        'memberOf': {
          '@type': 'GovernmentOrganization',
          'name': chamber,
          'parentOrganization': {'@type': 'GovernmentOrganization', 'name': 'United States Congress'}
        },
        'url': url
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://legislationpatch.com/'},
          {'@type': 'ListItem', 'position': 2, 'name': rep.name, 'item': url}
        ]
      }
    ]
  });
}

// ---- Meta tag updater ----

function setPageMeta(title, description, url) {
  document.title = title;
  function setAttr(sel, attr, val) {
    var el = document.querySelector(sel);
    if (el) el.setAttribute(attr, val);
  }
  setAttr('meta[name="description"]', 'content', description);
  setAttr('meta[property="og:title"]', 'content', title);
  setAttr('meta[property="og:description"]', 'content', description);
  setAttr('meta[property="og:url"]', 'content', url);
  setAttr('meta[name="twitter:title"]', 'content', title);
  setAttr('meta[name="twitter:description"]', 'content', description);
  var canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = url;
}

// ---- Utilities ----

// formatDate() moved to util.js (loaded first on every page) — same impl, shared name.

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

// escHtml() moved to util.js (loaded first on every page).

// (deduped into util.js 2026-07-06)

// (deduped into util.js 2026-07-06)

function renderVotingHistory(rep) {
  var container = document.getElementById('repVoteHistory');
  var labelEl   = document.getElementById('repVoteHistoryLabel');
  var history   = Array.isArray(rep.voteHistory) ? rep.voteHistory : [];

  if (history.length === 0) {
    if (labelEl) labelEl.style.display = 'none';
    if (container) container.style.display = 'none';
    return;
  }

  var VOTE_DEFAULT = 8;
  var VOTE_STEP    = 15;

  var html = '';
  for (var i = 0; i < history.length; i++) {
    var v         = history[i];
    var billLabel = v.billTitle ? escHtml(v.billTitle) : escHtml(formatBillId(v.billId) || v.billId);
    var billIdFmt = escHtml(formatBillId(v.billId) || '');
    var billUrl   = '/?scrollTo=' + encodeURIComponent(v.billId);
    var rawVote   = (v.vote || '').toLowerCase();
    var voteDisplay = rawVote.includes('yea') || rawVote.includes('yes') ? 'Yea'
                    : rawVote.includes('nay') || rawVote.includes('no')  ? 'Nay'
                    : rawVote.includes('not')                            ? 'Not Voting'
                    : (v.vote || '');
    var badgeCls  = voteDisplay === 'Yea' ? 'rv-yea' : voteDisplay === 'Nay' ? 'rv-nay' : 'rv-nv';
    var hidden    = i >= VOTE_DEFAULT ? ' style="display:none"' : '';
    html += '<div class="rep-show-item" data-idx="' + i + '"' + hidden + '>'
      + '<div class="rep-vote-row">'
      + '<div class="rep-vote-bill">'
      + '<a href="' + billUrl + '" class="rep-vote-bill-link">' + billLabel + '</a>'
      + (billIdFmt ? '<span class="rep-vote-bill-id">' + billIdFmt + '</span>' : '')
      + '</div>'
      + '<span class="rep-vote-badge ' + badgeCls + '">' + escHtml(voteDisplay) + '</span>'
      + '<span class="rep-vote-date">' + formatDate(v.date || '') + '</span>'
      + '</div>'
      + '</div>';
  }
  if (container) {
    container.innerHTML = html;
    if (history.length > VOTE_DEFAULT) {
      renderShowMoreBtn(container, VOTE_DEFAULT, history.length, VOTE_STEP);
    }
  }
}

// ---- Show more / collapse helper ----

function renderShowMoreBtn(container, defaultCount, total, step) {
  var remaining = total - defaultCount;
  var btn = document.createElement('button');
  btn.className = 'rep-show-more-btn';
  btn.setAttribute('data-shown', String(defaultCount));
  btn.setAttribute('data-default', String(defaultCount));
  btn.setAttribute('data-total', String(total));
  btn.setAttribute('data-step', String(step));
  btn.setAttribute('data-mode', 'expand');
  btn.textContent = 'Show ' + Math.min(step, remaining) + ' more  (' + remaining + ' remaining)';
  btn.onclick = function() { showMoreRep(container, btn); };
  container.appendChild(btn);
}

function showMoreRep(container, btn) {
  var shown   = parseInt(btn.getAttribute('data-shown'));
  var total   = parseInt(btn.getAttribute('data-total'));
  var def     = parseInt(btn.getAttribute('data-default'));
  var step    = parseInt(btn.getAttribute('data-step'));
  var mode    = btn.getAttribute('data-mode');

  if (mode === 'collapse') {
    // Collapse back to default
    container.querySelectorAll('.rep-show-item').forEach(function(el) {
      var idx = parseInt(el.getAttribute('data-idx'));
      el.style.display = idx >= def ? 'none' : '';
    });
    btn.setAttribute('data-shown', String(def));
    btn.setAttribute('data-mode', 'expand');
    var rem = total - def;
    btn.textContent = 'Show ' + Math.min(step, rem) + ' more  (' + rem + ' remaining)';
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    // Show next batch
    var newShown = Math.min(shown + step, total);
    container.querySelectorAll('.rep-show-item').forEach(function(el) {
      var idx = parseInt(el.getAttribute('data-idx'));
      if (idx >= shown && idx < newShown) el.style.display = '';
    });
    btn.setAttribute('data-shown', String(newShown));
    if (newShown >= total) {
      btn.setAttribute('data-mode', 'collapse');
      btn.textContent = 'Show less';
    } else {
      var rem = total - newShown;
      btn.textContent = 'Show ' + Math.min(step, rem) + ' more  (' + rem + ' remaining)';
    }
  }
}
