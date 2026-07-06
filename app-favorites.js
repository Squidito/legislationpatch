// app-favorites.js — favorites/saved view (split from app.js 2026-07-06).
// Load order: after app-carousel.js.


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

// (deduped into util.js 2026-07-06) parseFavDate — use parseSourceDate from util.js

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
      .sort((a, b) => parseSourceDate(b.source) - parseSourceDate(a.source))
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
