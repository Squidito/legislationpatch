// =============================================
//  app.js — UI rendering and interactions
// =============================================

let allBills      = [];
let openCards     = new Set();
let openDetails   = {};
let aiOutputs     = {};
let activeFilter  = 'all';

// ---- Boot ----

document.addEventListener('DOMContentLoaded', () => {
  checkSetup();
  loadBills();
  setupFilters();
});

function checkSetup() {
  const hasKeys = CONFIG.CONGRESS_API_KEY && CONFIG.ANTHROPIC_API_KEY;
  const banner = document.getElementById('setupBanner');
  if (hasKeys) banner.style.display = 'none';
}

function dismissBanner() {
  document.getElementById('setupBanner').style.display = 'none';
}

// ---- Load bills ----

async function loadBills() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  btn.disabled = true;

  showLoading(true);
  showError(false);

  try {
    allBills = await fetchRecentBills();
    renderAll();
  } catch (e) {
    console.error(e);
    showError(true, e.message);
  } finally {
    showLoading(false);
    btn.classList.remove('spinning');
    btn.disabled = false;
  }
}

function showLoading(on) {
  document.getElementById('loadingState').style.display = on ? 'block' : 'none';
  document.getElementById('billList').style.display     = on ? 'none'  : 'block';
}

function showError(on, msg) {
  const el = document.getElementById('errorState');
  el.style.display = on ? 'block' : 'none';
  if (msg) document.getElementById('errorMsg').textContent = msg;
}

// ---- Filters ----

function setupFilters() {
  document.getElementById('filters').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.stage;
    renderAll();
  });
}

// ---- Render ----

function renderAll() {
  const list = document.getElementById('billList');
  const filtered = activeFilter === 'all'
    ? allBills
    : allBills.filter(b => b.stage === activeFilter);

  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">No bills found for this filter.</div>';
    return;
  }

  list.innerHTML = filtered.map(renderBill).join('');
}

function renderBill(bill) {
  const isOpen  = openCards.has(bill.id);
  const col     = likelihoodColor(bill.likelihood);

  return `<div class="bill-card" id="card-${bill.id}">
    ${renderHeader(bill, isOpen)}
    ${renderLikelihoodFooter(bill, col)}
    ${renderBody(bill, isOpen, col)}
  </div>`;
}

function renderHeader(bill, isOpen) {
  return `<div class="bill-header" onclick="toggleCard('${bill.id}')">
    <div class="bill-left">
      <span class="stage-badge ${badgeClass(bill.stage)}">${bill.stageLabel}</span>
      ${renderMiniPipeline(bill)}
    </div>
    <div class="bill-right">
      <div class="bill-title-block">
        <div class="bill-title">${escHtml(bill.title)}</div>
        <div class="bill-meta">
          <span>${escHtml(bill.code)}</span>
          <span>${escHtml(bill.sponsor)}</span>
          <span>${escHtml(bill.date)}</span>
        </div>
      </div>
      <span class="chevron ${isOpen ? 'open' : ''}">▾</span>
    </div>
  </div>`;
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

function renderLikelihoodFooter(bill, col) {
  const pct = bill.likelihood || 0;
  return `<div class="likelihood-footer" onclick="toggleCard('${bill.id}')">
    <span class="likelihood-label">Passage likelihood</span>
    <div class="likelihood-track">
      <div class="likelihood-fill" style="width:${pct}%;background:${col.fill}"></div>
    </div>
    <span class="likelihood-value" style="color:${col.text}">${bill.likelihoodLabel || labelFromPct(pct)} · ${pct}%</span>
  </div>`;
}

function renderBody(bill, isOpen, col) {
  const aiOut = aiOutputs[bill.id] || '';

  const pipelineHtml = `<div class="full-pipeline">
    ${bill.pipeline.map((step, i) => {
      const done   = i < bill.currentStep;
      const active = i === bill.currentStep;
      const cls    = done ? 'pipe-done' : active ? 'pipe-active' : 'pipe-pending';
      return `${i > 0 ? '<span class="pipe-arrow">›</span>' : ''}<span class="pipe-pill ${cls}">${escHtml(step)}</span>`;
    }).join('')}
  </div>`;

  const likelihoodDetail = `<div class="likelihood-detail" style="border-left:3px solid ${col.fill}">
    <div class="likelihood-detail-title" style="color:${col.text}">${bill.likelihoodLabel || labelFromPct(bill.likelihood)} · ${bill.likelihood}% chance of passage</div>
    <div class="likelihood-detail-text">${escHtml(bill.likelihoodReason || '')}</div>
  </div>`;

  const sectionsHtml = bill.sections?.length
    ? `<div class="patch-notes">${bill.sections.map((sec, si) => renderSection(bill, sec, si)).join('')}</div>`
    : `<div class="patch-notes"><p style="font-size:0.85rem;color:var(--text-3);padding:0.5rem 0">Click "Analyze with AI" below to generate patch notes for this bill.</p></div>`;

  const criticismsHtml = bill.criticisms?.length ? `
    <div class="section-divider"></div>
    <div class="criticism-section">
      <div class="criticism-title">⚑ Opposed — who and why</div>
      ${bill.criticisms.map(c => `<div class="criticism-item"><span class="criticism-who">${escHtml(c.who)}:</span> ${escHtml(c.why)}</div>`).join('')}
    </div>` : '';

  const gapsHtml = bill.gaps?.length ? `
    <div class="gaps-section">
      <div class="gaps-title">◈ Not addressed in this bill</div>
      ${bill.gaps.map(g => `<div class="gaps-item">${escHtml(g)}</div>`).join('')}
    </div>` : '';

  return `<div class="bill-body ${isOpen ? 'open' : ''}">
    ${pipelineHtml}
    ${likelihoodDetail}
    ${sectionsHtml}
    ${criticismsHtml}
    ${gapsHtml}
    <div class="section-divider"></div>
    <button class="ai-btn" id="ai-btn-${bill.id}" onclick="runAIAnalysis('${bill.id}')">
      ✦ ${bill.analyzed ? 'Re-analyze' : 'Analyze'} with AI
    </button>
    <div class="ai-output ${aiOut ? 'open' : ''}" id="ai-out-${bill.id}">${escHtml(aiOut)}</div>
  </div>`;
}

function renderSection(bill, sec, si) {
  return `<div class="patch-section">
    <div class="patch-section-title">${escHtml(sec.label)}</div>
    ${sec.items.map((item, ii) => renderItem(bill, item, si, ii)).join('')}
  </div>`;
}

function renderItem(bill, item, si, ii) {
  const key    = `${bill.id}-${si}-${ii}`;
  const isOpen = openDetails[key];

  const chipsHtml = item.comments?.length
    ? `<div class="comment-chips">${item.comments.map(c =>
        `<span class="chip chip-${c.party}" title="${escHtml(c.text)}">${c.party === 'd' ? 'D' : c.party === 'r' ? 'R' : '◆'} ${escHtml(c.text.split(':')[0])}</span>`
      ).join('')}</div>`
    : '';

  const commentsDetail = item.comments?.map(c =>
    `<div class="item-detail-comment">${escHtml(c.text)}</div>`
  ).join('') || '';

  return `<div class="patch-item">
    <div class="patch-item-main">${escHtml(item.main)}</div>
    ${chipsHtml}
    ${item.detail ? `
      <button class="more-btn" onclick="toggleDetail('${key}')">${isOpen ? '▲ hide details' : '▼ more info'}</button>
      <div class="item-detail ${isOpen ? 'open' : ''}" id="detail-${key}">
        <div>${escHtml(item.detail)}</div>
        ${commentsDetail}
      </div>` : ''}
  </div>`;
}

// ---- Interactions ----

function toggleCard(id) {
  openCards.has(id) ? openCards.delete(id) : openCards.add(id);
  renderAll();
}

function toggleDetail(key) {
  openDetails[key] = !openDetails[key];
  renderAll();
}

// ---- AI Analysis ----

async function runAIAnalysis(billId) {
  const bill = allBills.find(b => b.id === billId);
  if (!bill) return;

  if (!CONFIG.ANTHROPIC_API_KEY) {
    alert('Add your Anthropic API key to config.js to use AI analysis.');
    return;
  }

  const btn = document.getElementById(`ai-btn-${billId}`);
  const out = document.getElementById(`ai-out-${billId}`);

  btn.disabled = true;
  btn.innerHTML = '✦ Analyzing<span class="dot-anim">...</span>';
  out.classList.add('open');
  out.textContent = 'Reading legislation and generating patch notes...';

  try {
    const result = await analyzeBill(bill);

    // Merge AI results back into the bill object
    if (result.sections?.length)     bill.sections     = result.sections;
    if (result.criticisms?.length)   bill.criticisms   = result.criticisms;
    if (result.gaps?.length)         bill.gaps         = result.gaps;
    if (result.likelihoodLabel)      bill.likelihoodLabel = result.likelihoodLabel;
    if (result.likelihoodReason)     bill.likelihoodReason = result.likelihoodReason;
    bill.analyzed = true;

    // Hide raw AI output, re-render the card with structured data
    aiOutputs[billId] = '';
    renderAll();
  } catch (e) {
    out.textContent = `Analysis failed: ${e.message}`;
    btn.disabled = false;
    btn.innerHTML = '✦ Retry analysis';
  }
}

// ---- Helpers ----

function badgeClass(stage) {
  return {
    senate:     'badge-senate',
    house:      'badge-house',
    signed:     'badge-signed',
    committee:  'badge-committee',
    introduced: 'badge-introduced',
    conference: 'badge-conference',
  }[stage] || 'badge-default';
}

function likelihoodColor(pct) {
  if (pct >= 100) return { fill: '#085041', text: '#085041' };
  if (pct >= 75)  return { fill: '#2D7A3A', text: '#1A4D22' };
  if (pct >= 50)  return { fill: '#1A56A0', text: '#0C3A72' };
  if (pct >= 25)  return { fill: '#B06A00', text: '#6B3F00' };
  return { fill: '#C0392B', text: '#7A1F15' };
}

function labelFromPct(pct) {
  if (pct >= 100) return 'Enacted';
  if (pct >= 75)  return 'Likely';
  if (pct >= 50)  return 'Possible';
  if (pct >= 25)  return 'Unlikely';
  return 'Long shot';
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
