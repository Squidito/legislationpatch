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

  document.title = `${bill.title} — LegislationPatch`;

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
  toggleRow.innerHTML = '<button class="analysis-toggle-btn" id="analysisToggle">▲ Collapse analysis</button>';
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
  } catch (e) {
    textMount.innerHTML = billTextPlaceholder(bill);
  }
});

// ---- Bill text rendering ----

function cleanBillText(text) {
  // Safety pass — files are pre-cleaned at save time; this catches any residue
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<<[^>]*>>/g, '').replace(/``/g, '”').replace(/''/g, '”')
    .replace(/ -- /g, ' — ').replace(/\n{3,}/g, '\n\n');
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
    /^(TITLE\s+[IVXLC]+|SUBTITLE|PART|CHAPTER)\s+[IVXA-Z]/i.test(t) ||
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
  if (!t) return '<div class=”bt-blank”></div>';

  // [[Page N]] markers
  if (/^\[\[Page\b/.test(t))
    return `<div class=”bt-page-marker”>${escHtml(t)}</div>`;

  // [Citation block]
  if (/^\[.+\]$/.test(t))
    return `<div class=”bt-citation”>${escHtml(t)}</div>`;

  // TITLE / SUBTITLE / PART
  if (/^(TITLE\s+[IVXLC]+|SUBTITLE|PART\s+[IVXA-Z]|CHAPTER\s+[IVXA-Z])/i.test(t))
    return `<div class=”bt-title”>${escHtml(t)}</div>`;

  // Section headers: “1. Name” or “SECTION 1.” or “SEC. 2.”
  if (/^(SECTION|SEC\.)\s+\d+[A-Z]?[.\s]/i.test(t) || /^\d+\.\s+[A-Z]/.test(t))
    return `<div class=”bt-section”>${escHtml(t)}</div>`;

  // Enacting / resolving clause
  if (/^be it (enacted|resolved)\b/i.test(t))
    return `<div class=”bt-enacting”>${escHtml(t)}</div>`;

  // Helper: split label from rest, allow optional whitespace
  const lbl = (m, cls) =>
    `<div class=”bt-item ${cls}”><span class=”bt-lbl”>${escHtml(m[1])}</span> ${escHtml(m[2].trim())}</div>`;

  // Subsection (a) (b) — level 1
  const subM = t.match(/^(\([a-z]+\))\s+([\s\S]+)/i);
  if (subM && !/^\([ivxlc]{2,}\)/i.test(t)) return lbl(subM, 'bt-l1');

  // Paragraph (1) (2) — level 2
  const parM = t.match(/^(\(\d+\))\s+([\s\S]+)/);
  if (parM) return lbl(parM, 'bt-l2');

  // Subparagraph (A) (B) — level 3
  const subpM = t.match(/^(\([A-Z]\))\s+([\s\S]+)/);
  if (subpM) return lbl(subpM, 'bt-l3');

  // Clause (i) (ii) (iii) — level 4
  const clM = t.match(/^(\([ivxlc]+\))\s+([\s\S]+)/i);
  if (clM) return lbl(clM, 'bt-l4');

  return `<div class=”bt-text”>${escHtml(t)}</div>`;
}

function renderBillText(rawText, bill) {
  if (!rawText?.trim()) return billTextPlaceholder(bill);

  const text  = cleanBillText(rawText);
  const lines = joinContinuations(text.split('\n'));

  // Separate preamble (everything before “Be it enacted” or first section)
  let splitAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^be it (enacted|resolved)\b/i.test(t)) { splitAt = i; break; }
    if (/^(SECTION|SEC\.)\s+\d/i.test(t) || /^\d+\.\s+[A-Z]/.test(t)) { splitAt = i; break; }
  }

  const preambleLines = splitAt > 0 ? lines.slice(0, splitAt).filter(l => l.trim()) : [];
  const statuteLines  = splitAt >= 0 ? lines.slice(splitAt) : lines;

  const preambleHtml = preambleLines.length
    ? `<div class=”bt-preamble”>${preambleLines.map(l => escHtml(l)).join('\n')}</div>` : '';

  return `<div class=”bill-text-container”>
    <div class=”bill-text-header”>
      <span class=”bill-text-label”>Full Bill Text</span>
      <span class=”bill-text-source”>${escHtml(bill.code || '')} &middot; Congress.gov</span>
    </div>
    <div class=”bill-text-body”>
      ${preambleHtml}
      ${statuteLines.map(renderBtLine).join('')}
    </div>
  </div>`;
}

function billTextPlaceholder(bill) {
  return `<div class="bill-text-container">
    <div class="bill-text-header">
      <span class="bill-text-label">Full Bill Text</span>
      <span class="bill-text-source">${escHtml(bill.code || '')} &middot; Congress.gov</span>
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

// ---- Theme (mirrors rep.js) ----

function toggleTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  localStorage.setItem('lpTheme', isDark ? 'dark' : 'light');
  if (typeof updateLogoForTheme === 'function') updateLogoForTheme(isDark);
}
