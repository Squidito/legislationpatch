// app-carousel.js — shock-quote carousel (split from app.js 2026-07-06).
// Load order: after app-render.js. Owns the carousel state lets (_carouselRaf etc.).

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
    // Link cached bills to their static /bill/<slug>/ page (slug derived via the
    // shared util.billSlug so it can never drift from the generated URL); fall
    // back to bill-pending for a quote whose bill is not yet in cache.
    const billObj = q.billId ? allBills.find(b => b.id === q.billId) : null;
    const billHref = q.billId
      ? (billObj ? `/bill/${billSlug(billObj)}/` : `bill-pending?id=${escHtml(q.billId)}`)
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

