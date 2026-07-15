// app-boot.js — DOMContentLoaded boot + data load (split from app.js 2026-07-06).
// LOAD LAST of the app-*.js files (before page-specific bill.js/bills.js).


document.addEventListener('DOMContentLoaded', async () => {
  if (!document.getElementById('billList')) return;
  loadTrackedSettings();
  loadWatchedBills();
  setupSettings();

  if (window.FAVORITES_PAGE) {
    showLoading(true);
    try {
      [allBills, standaloneQuotes] = await Promise.all([
        fetchRecentBills(),
        fetchStandaloneQuotes()
      ]);
    } catch(e) {
      showError(true, e.message);
    } finally {
      showLoading(false);
    }
    renderFavoritesView();
    return;
  }

  await autoDetectState();
  fetchStandaloneQuotes().then(q => { standaloneQuotes = q; });
  fetchRepsIndex().then(idx => { repsIndex = idx; renderRepStrip(); });
  setupRepStripDrag();
  renderRepStrip();
  loadBills();
  setupFilters();
});


// ---- Load bills ----

async function loadBills() {
  const btn = document.getElementById('refreshBtn');
  if (btn) { btn.classList.add('spinning'); btn.disabled = true; }

  showLoading(true);
  showError(false);

  try {
    allBills = await fetchRecentBills();
    renderAll();
    renderRepStrip(); // rebuild strip now that bill sponsors/quotes are available

    // Handle incoming nav context (from rep page → bill, or fav shortcut)
    const urlP     = new URLSearchParams(location.search);
    const scrollTo = urlP.get('scrollTo');
    const fromRep  = urlP.get('fromRep');
    const repName  = urlP.get('repName');
    if (scrollTo) scrollToBill(scrollTo);
    if (fromRep && repName) {
      const banner = document.getElementById('repBackBanner');
      const link   = document.getElementById('repBackLink');
      if (banner && link) {
        link.href        = `rep?id=${encodeURIComponent(fromRep)}&ref=${window.BILLS_PAGE ? 'bills' : 'home'}`;
        link.textContent = `← ${repName}`;
        banner.style.display = 'flex';
      }
    }
  } catch (e) {
    console.error(e);
    showError(true, e.message);
  } finally {
    showLoading(false);
    if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
  }
}

function showLoading(on) {
  document.getElementById('loadingState').style.display = on ? 'block' : 'none';
  document.getElementById('billList').style.display     = on ? 'none'  : '';  // '' → CSS flex (keeps the .bill-list gap; 'block' killed it)
}

function showError(on, msg) {
  const el = document.getElementById('errorState');
  if (!el) return;
  el.style.display = on ? 'block' : 'none';
  if (msg) { const em = document.getElementById('errorMsg'); if (em) em.textContent = msg; }
}

