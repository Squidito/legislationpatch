// bill.js — bill detail page logic
// Reuses app.js render functions; overrides renderAll and toggleCard for single-bill context.

// Re-render only this bill's card (replaces the full-page renderAll from app.js)
function renderAll() {
  if (!window.BILL_PAGE_ID) return;
  const bill = allBills.find(b => b.id === window.BILL_PAGE_ID);
  if (!bill) return;
  document.getElementById('bill-card-mount').innerHTML = renderBill(bill, 1);
  const isFull = openCards.get(window.BILL_PAGE_ID) === 'full';
  const btn = document.getElementById('analysisToggle');
  if (btn) btn.textContent = isFull ? '▲ Collapse analysis' : '▼ Show analysis';
}

// On the bill page, toggle between full expansion and closed (header only, no body)
function toggleCard(id) {
  const isFull = openCards.get(id) === 'full';
  if (isFull) {
    openCards.delete(id);
  } else {
    openCards.set(id, 'full');
    // Re-open all detail panels when expanding
    const bill = allBills.find(b => b.id === id);
    (bill?.sections || []).forEach((sec, si) => {
      (sec.items || []).forEach((item, ii) => {
        if (item.detail) openDetails[`${id}-${si}-${ii}`] = true;
      });
    });
  }
  renderAll();
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

// ---- Init ----

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const billId = params.get('id');

  const loading = document.getElementById('bill-loading');
  loading.style.display = 'flex';

  if (!billId) {
    loading.innerHTML = '<p style="color:var(--text-3)">No bill ID specified.</p>';
    return;
  }

  // Load cache.json
  let bills;
  try {
    const data = await fetch('data/cache.json').then(r => r.json());
    bills = Array.isArray(data.bills) ? data.bills : Object.values(data.bills || {});
  } catch (e) {
    loading.innerHTML = '<p style="color:var(--text-3)">Could not load bill data.</p>';
    return;
  }

  const bill = bills.find(b => b.id === billId);
  if (!bill) {
    loading.innerHTML = `<p style="color:var(--text-3)">Bill "${billId}" not found.</p>`;
    return;
  }

  setPageMeta(
    bill.title + ' — LegislationPatch',
    (bill.brief || bill.summary || '').slice(0, 160),
    'https://legislationpatch.com/bill.html?id=' + encodeURIComponent(billId)
  );
  injectBillSchema(bill, billId);

  // Update back button
  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.href = `index.html?scrollTo=${encodeURIComponent(billId)}`;

  // Initialise globals app.js render functions depend on
  allBills = bills;
  loadWatchedBills();
  loadTrackedSettings();

  // Mark this as the bill page (suppresses "View full bill" link and guard checks)
  window.BILL_PAGE_ID = billId;

  // Open this bill fully with all detail panels expanded
  openCards.set(billId, 'full');
  (bill.sections || []).forEach((sec, si) => {
    (sec.items || []).forEach((item, ii) => {
      if (item.detail) openDetails[`${billId}-${si}-${ii}`] = true;
    });
  });

  // Render the bill card
  document.getElementById('bill-card-mount').innerHTML = renderBill(bill, 1);
  loading.style.display = 'none';

  // Analysis collapse toggle — mirrors clicking the card header
  const toggleRow = document.getElementById('analysis-toggle-row');
  toggleRow.innerHTML = '<button class="analysis-toggle-btn" id="analysisToggle">▲ Collapse analysis</button>'
    + '<button class="share-btn" id="shareBtn" onclick="copyBillLink()" title="Copy link to this bill">' + SHARE_LINK_SVG + ' Copy link</button>';
  document.getElementById('analysisToggle').addEventListener('click', () => toggleCard(billId));

  // Sync theme toggle state
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.checked = isDark;
  if (typeof updateLogoForTheme === 'function') updateLogoForTheme(isDark);

  // Load and render full bill text
  const textMount = document.getElementById('bill-text-mount');
  try {
    const res = await fetch(`data/bill-text/${billId}.txt`);
    if (res.ok) {
      textMount.innerHTML = renderBillText(await res.text(), bill);
    } else {
      textMount.innerHTML = billTextPlaceholder(bill);
    }
    if (window.location.hash) {
      setTimeout(() => scrollToBillSection(window.location.hash.slice(1)), 150);
    }
  } catch (e) {
    textMount.innerHTML = billTextPlaceholder(bill);
  }
});

// ---- JSON-LD schema injector ----

function injectBillSchema(bill, billId) {
  var el = document.getElementById('bill-schema');
  if (!el) return;
  var url = 'https://legislationpatch.com/bill.html?id=' + encodeURIComponent(billId);
  var about = {
    '@type': 'LegislativeAction',
    'name': bill.title,
    'identifier': bill.code || billId
  };
  if (bill.date) about.legislationDate = bill.date;
  if (bill.sponsor) about.sponsor = {'@type': 'Person', 'name': bill.sponsor};
  el.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        'headline': bill.title,
        'description': (bill.brief || bill.summary || '').slice(0, 200),
        'url': url,
        'publisher': {'@type': 'Organization', 'name': 'LegislationPatch', 'url': 'https://legislationpatch.com'},
        'about': about
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://legislationpatch.com/'},
          {'@type': 'ListItem', 'position': 2, 'name': bill.title, 'item': url}
        ]
      }
    ]
  });
}

// ---- Bill text rendering ----

function cleanBillText(text) {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<<[^>]*>>/g, '').replace(/``/g, '"').replace(/''/g, '"')
    .replace(/ -- /g, ' — ').replace(/<all>/gi, '').replace(/\n{3,}/g, '\n\n');
}

// Join continuation lines — source files wrap long lines at ~72 chars.
// A line is a continuation if it doesn't open a new structural element.
function joinContinuations(lines) {
  const isBreak = t =>
    !t ||
    /^\[\[Page\b/.test(t) ||
    /^\[.+\]$/.test(t) ||
    /^be it (enacted|resolved)\b/i.test(t) ||
    /^(SECTION|SEC\.)\s+\d/i.test(t) ||
    /^\d+\.\s+[A-Z]/.test(t) ||
    // No /i flag — TITLE/SUBTITLE headers are ALL CAPS; avoids matching
    // inline references like "title VII of the Foreign Intelligence..."
    /^(TITLE\s+[IVXLC]+|SUBTITLE\s+|PART\s+[IVXA-Z]|CHAPTER\s+[IVXA-Z])/.test(t) ||
    /^\([a-zA-Z0-9ivxlc]+\)/i.test(t) ||
    /^-{5,}/.test(t);

  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (!out.length || isBreak(t)) {
      out.push(t);
    } else {
      const prev = out[out.length - 1];
      out[out.length - 1] = prev ? prev + ' ' + t : t;
    }
  }
  return out;
}

// Classify and render a single (already-joined) line of bill text
function renderBtLine(line) {
  const t = line.trim();
  if (!t) return '<div class="bt-blank"></div>';

  // [[Page N]] markers
  if (/^\[\[Page\b/.test(t))
    return `<div class="bt-page-marker">${escHtml(t)}</div>`;

  // [Citation block]
  if (/^\[.+\]$/.test(t))
    return `<div class="bt-citation">${escHtml(t)}</div>`;

  // TITLE / SUBTITLE / PART
  if (/^(TITLE\s+[IVXLC]+|SUBTITLE|PART\s+[IVXA-Z]|CHAPTER\s+[IVXA-Z])/i.test(t)) {
    const titleM = t.match(/^TITLE\s+([IVXLC]+)/i);
    const id = titleM ? ` id="bt-title-${titleM[1].toUpperCase()}"` : '';
    return `<div class="bt-title"${id}>${escHtml(t)}</div>`;
  }

  // Section headers: "1. Name" or "SECTION 1." or "SEC. 2."
  if (/^(SECTION|SEC\.)\s+\d+[A-Z]?[.\s]/i.test(t) || /^\d+\.\s+[A-Z]/.test(t)) {
    const secM = t.match(/^(?:SECTION|SEC\.)\s+(\d+)/i) || t.match(/^(\d+)\./);
    const id = secM ? ` id="bt-sec-${secM[1]}"` : '';
    return `<div class="bt-section"${id}>${escHtml(t)}</div>`;
  }

  // Enacting / resolving clause
  if (/^be it (enacted|resolved)\b/i.test(t))
    return `<div class="bt-enacting">${escHtml(t)}</div>`;

  // Helper: split label from rest, allow optional whitespace
  const lbl = (m, cls) =>
    `<div class="bt-item ${cls}"><span class="bt-lbl">${escHtml(m[1])}</span> ${escHtml(m[2].trim())}</div>`;

  // Subsection (a) (b) — level 1; prepend a spacer for visual separation
  const subM = t.match(/^(\([a-z]+\))\s+([\s\S]+)/i);
  if (subM && !/^\([ivxlc]{2,}\)/i.test(t))
    return '<div class="bt-break"></div>' + lbl(subM, 'bt-l1');

  // Paragraph (1) (2) — level 2
  const parM = t.match(/^(\(\d+\))\s+([\s\S]+)/);
  if (parM) return lbl(parM, 'bt-l2');

  // Subparagraph (A) (B) — level 3
  const subpM = t.match(/^(\([A-Z]\))\s+([\s\S]+)/);
  if (subpM) return lbl(subpM, 'bt-l3');

  // Clause (i) (ii) (iii) — level 4
  const clM = t.match(/^(\([ivxlc]+\))\s+([\s\S]+)/i);
  if (clM) return lbl(clM, 'bt-l4');

  // Add breathing room before "Approved" date and legislative history lines
  if (/^Approved\s+\w/i.test(t) || /^LEGISLATIVE HISTORY/i.test(t))
    return '<div style="height:1.4rem"></div>' + `<div class="bt-text">${escHtml(t)}</div>`;

  return `<div class="bt-text">${escHtml(t)}</div>`;
}

function renderBillText(rawText, bill) {
  if (!rawText?.trim()) return billTextPlaceholder(bill);

  const text  = cleanBillText(rawText);
  const lines = joinContinuations(text.split('\n'));

  // Separate preamble (everything before "Be it enacted" or first section)
  let splitAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^be it (enacted|resolved)\b/i.test(t)) { splitAt = i; break; }
    if (/^(SECTION|SEC\.)\s+\d/i.test(t) || /^\d+\.\s+[A-Z]/.test(t)) { splitAt = i; break; }
  }

  const preambleLines = splitAt > 0 ? lines.slice(0, splitAt).filter(l => l.trim()) : [];
  let   statuteLines  = splitAt >= 0 ? lines.slice(splitAt) : lines;

  // Detect epilogue: "Approved [Month]" or "LEGISLATIVE HISTORY" marks the end
  // of the statute proper. Separate it into a footer block like the preamble.
  let epilogueStart = -1;
  for (let i = 0; i < statuteLines.length; i++) {
    const t = statuteLines[i].trim();
    if (/^Approved\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i.test(t) ||
        /^LEGISLATIVE HISTORY/i.test(t)) {
      epilogueStart = i;
      break;
    }
  }
  const epilogueLines = epilogueStart >= 0 ? statuteLines.slice(epilogueStart).filter(l => l.trim()) : [];
  if (epilogueStart >= 0) statuteLines = statuteLines.slice(0, epilogueStart);

  // Render preamble and epilogue as block-per-line divs — no CSS white-space dependency
  const renderMeta = (lines, cls) =>
    lines.length
      ? `<div class="${cls}">${lines.map(l => `<div>${escHtml(l)}</div>`).join('')}</div>`
      : '';

  // Header uses block divs so stacking works without CSS flex
  return `<div class="bill-text-container">
    <div class="bill-text-header">
      <div class="bill-text-label">Full Bill Text</div>
      <div class="bill-text-source">${escHtml(bill.code || '')} &middot; Congress.gov</div>
    </div>
    <div class="bill-text-body">
      ${renderMeta(preambleLines, 'bt-preamble')}
      ${statuteLines.map(renderBtLine).join('')}
      ${renderMeta(epilogueLines, 'bt-epilogue')}
    </div>
  </div>`;
}

function billTextPlaceholder(bill) {
  return `<div class="bill-text-container">
    <div class="bill-text-header">
      <div class="bill-text-label">Full Bill Text</div>
      <div class="bill-text-source">${escHtml(bill.code || '')} &middot; Congress.gov</div>
    </div>
    <div style="padding:2rem 1.25rem;color:var(--text-3);font-size:0.85rem">
      Full text will appear here after the bill is reprocessed with the updated pipeline.
      <br><br>
      <a href="https://www.congress.gov/bill/${(bill.id||'').split('-')[0]}th-congress/${
        (bill.code||'').toLowerCase().replace('.','/')
      }" target="_blank" rel="noopener" style="color:var(--purple)">
        Read on Congress.gov →
      </a>
    </div>
  </div>`;
}

// ---- Bill text section linking ----

function scrollToBillSection(anchorId) {
  const el = document.getElementById(anchorId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('bt-section-flash');
  setTimeout(() => el.classList.remove('bt-section-flash'), 1500);
}

// ---- Share / copy link ----

var SHARE_LINK_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

function copyBillLink() {
  var url = window.location.href;
  var btn = document.getElementById('shareBtn');
  if (btn) { btn.classList.add('share-btn--copied'); btn.textContent = 'Copied!'; }
  function reset() {
    if (btn) { btn.innerHTML = SHARE_LINK_SVG + ' Copy link'; btn.classList.remove('share-btn--copied'); }
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function() { setTimeout(reset, 2000); })
      .catch(function() { setTimeout(reset, 2000); });
  } else {
    try {
      var inp = document.createElement('input');
      inp.value = url; inp.style.position = 'absolute'; inp.style.left = '-9999px';
      document.body.appendChild(inp); inp.select(); document.execCommand('copy'); document.body.removeChild(inp);
    } catch (_) {}
    setTimeout(reset, 2000);
  }
}

// ---- Theme (mirrors rep.js) ----

function toggleTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('lpTheme', isDark ? 'dark' : 'light');
  if (typeof updateLogoForTheme === 'function') updateLogoForTheme(isDark);
}
