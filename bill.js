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

function renderBillText(rawText, bill) {
  if (!rawText?.trim()) return billTextPlaceholder(bill);

  const lines = rawText.split('\n');
  const htmlLines = lines.map(line => {
    const esc  = escHtml(line);
    const trim = line.trim();
    if (/^TITLE\s+[IVXLC]+/i.test(trim))                        return `<span class="bt-title">${esc}</span>`;
    if (/^(SECTION|SEC\.)\s+\d+[A-Z]?[.\s]/i.test(trim))        return `<span class="bt-section">${esc}</span>`;
    if (/^(SUBTITLE|PART|CHAPTER)\s+[IVXLCA-Z]+/i.test(trim))   return `<span class="bt-section">${esc}</span>`;
    return esc;
  });

  return `<div class="bill-text-container">
    <div class="bill-text-header">
      <span class="bill-text-label">Full Bill Text</span>
      <span class="bill-text-source">${escHtml(bill.code || '')} &middot; Congress.gov</span>
    </div>
    <pre class="bill-text-body">${htmlLines.join('\n')}</pre>
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
