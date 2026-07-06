// app-render.js — bill card & bill page rendering (split from app.js 2026-07-06).
// Load order: after app-reps.js. bill.js/bills.js override renderAll/toggleCard
// by loading AFTER all app-*.js files — keep them last in every <script> block.

// "Enacted" = signed into law (stage 'signed'). Permanent once enacted — no time window.
function isEnacted(bill) {
  return bill && bill.stage === 'signed';
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

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Resolve a top-line's billSection to an EXISTING spine section anchor. Exact
// match first (bt-sec-N / bt-title-X); if the spine is organized by Title but the
// top-line cites a section number, fall back to the Title that contains it
// (section 214 -> Title II, via the hundreds digit). Returns the anchor or null.
function resolveTopLineSpineAnchor(billSection, spineAnchors) {
  if (billSection == null) return null;
  const raw = String(billSection);
  const suffix = raw.startsWith('title-') ? `bt-${raw}` : `bt-sec-${raw}`;
  if (spineAnchors.has(suffix)) return suffix;
  const num = parseInt(raw, 10);
  if (num >= 100) {
    const t = `bt-title-${ROMAN[Math.floor(num / 100)] || ''}`;
    if (spineAnchors.has(t)) return t;
  }
  return null;
}

// hasSpine: whether the section spine is rendered alongside (full body / bill page).
// Headlines only become spine links when there's a spine to scroll to.
function renderTopLines(bill, hasSpine) {
  const items = bill.top_lines || [];
  if (!items.length && !bill.brief) return '';

  const spineAnchors = hasSpine
    ? new Set((bill.sections || []).map(patchSectionAnchor).filter(Boolean))
    : new Set();

  const renderLine = item => {
    if (typeof item === 'string') {
      // Legacy flat format
      return `<div class="top-line-item">
        <span class="top-line-bullet">—</span>
        <div class="top-line-content"><div class="top-line-headline">${billRefHtml(item, bill.id)}</div></div>
      </div>`;
    }
    // New headline + subs format. Headlines link to the matching section-by-section
    // spine entry (not the raw bill text) — on both the card's full view and the bill page.
    const spineSuffix = resolveTopLineSpineAnchor(item.billSection, spineAnchors);
    const tlSpineId = spineSuffix ? `sp-${bill.id}-${spineSuffix}` : null;
    const headlineHtml = tlSpineId
      ? `<a class="top-line-headline-link" href="#${tlSpineId}" onclick="event.preventDefault();scrollToSpineSection('${tlSpineId}')">${escHtml(item.headline || '')}</a>`
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
    <button class="expand-full-btn" onclick="expandFull('${bill.id}', event)">Further Analysis ↓</button>
    ${window.BILL_PAGE_ID ? '' : `<div class="view-bill-link-row view-bill-link-mobile"><a href="bill?id=${encodeURIComponent(bill.id)}">View full bill page →</a></div>`}
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
          <span class="chip chip-${(q.party||'n').toLowerCase()[0]}">${escHtml(q.party || '')}</span>
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
      tallyHtml = '<span class="tally-yea">Yea ' + Number(v.yeas) + '</span>'
        + '<span class="tally-sep">·</span>'
        + '<span class="tally-nay">Nay ' + Number(v.nays) + '</span>'
        + (v.notVoting > 0 ? '<span class="tally-sep">·</span><span class="tally-nv">NV ' + Number(v.notVoting) + '</span>' : '');
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
      html += safeBioId(co.bioguideId)
        ? '<a class="crossover-member" href="rep?id=' + safeBioId(co.bioguideId) + '&ref=' + (window.BILLS_PAGE ? 'bills' : 'home') + '">' + coInner + '</a>'
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
      html += safeBioId(m.bioguideId)
        ? '<a class="vote-member" href="rep?id=' + safeBioId(m.bioguideId) + '&ref=' + (window.BILLS_PAGE ? 'bills' : 'home') + '">' + mInner + '</a>'
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

  const topLinesHtml = renderTopLines(bill, true);

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

// Smooth-scroll to a section-by-section spine entry (top-line headline links).
// Works on the card and the bill page; opens the folded admin group if needed.
function scrollToSpineSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const kids = el.closest('.ps-admin-kids');
  if (kids && !kids.classList.contains('open')) {
    kids.classList.add('open');
    const caret = kids.previousElementSibling && kids.previousElementSibling.querySelector('.ps-caret');
    if (caret) caret.textContent = '▴';
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('spine-flash');
  void el.offsetWidth;
  el.classList.add('spine-flash');
}

function patchSectionAnchor(sec) {
  if (sec.billSection) return `bt-sec-${sec.billSection}`;
  const secM = sec.label?.match(/^Sections?\s+(\d+)/i);
  if (secM) return `bt-sec-${secM[1]}`;
  const titleM = sec.label?.match(/^Title\s+([IVXLC]+)/i);
  if (titleM) return `bt-title-${titleM[1].toUpperCase()}`;
  const divM = sec.label?.match(/^Division\s+([A-Z0-9]+)/i);
  if (divM) return `bt-div-${divM[1].toUpperCase()}`;
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
  const spineAnchor = patchSectionAnchor(sec);              // spine id — top-lines scroll target (all views)
  const anchor = window.BILL_PAGE_ID ? spineAnchor : null;  // section title → bill text (bill page only)
  const titleHtml = anchor
    ? `<a class="patch-section-title-link" href="#${anchor}" onclick="event.preventDefault();scrollToBillSection('${anchor}')">${escHtml(title)}</a>`
    : escHtml(title);
  const node = marker
    ? `<span class="ps-num${sec.admin ? ' admin' : ''}">${escHtml(marker)}</span>`
    : `<span class="ps-dot"></span>`;
  return `<div class="patch-section ps-row${opts.last ? ' ps-last' : ''}${sec.admin ? ' ps-adm' : ''}"${spineAnchor ? ` id="sp-${escHtml(bill.id)}-${spineAnchor}"` : ''}>
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
    window.location.href = `./?scrollTo=${encodeURIComponent(id)}`;
    return;
  }
  const bill = allBills.find(b => b.id === id);
  if (!bill) return;
  // Defensive: nothing currently sets favoritesView to true (legacy of the removed
  // in-page favorites toggle). The old branch called toggleFavoritesView(), which no
  // longer exists anywhere — kept as a safe navigation fallback instead of a latent
  // ReferenceError. ./? not index.html? — serve strips queries on the .html redirect.
  if (favoritesView) {
    window.location.href = `./?scrollTo=${encodeURIComponent(id)}`;
    return;
  }
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

