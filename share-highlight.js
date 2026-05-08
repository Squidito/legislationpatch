// share-highlight.js — text fragment share tooltip
// Appears above any text selection ≥ 20 chars; copies a #:~:text= URL to clipboard.
(function () {
  var MIN_LENGTH = 20;

  var LINK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  var IDLE_HTML = LINK_SVG + ' Share';

  var tip = document.createElement('div');
  tip.className = 'share-hl-tip';
  tip.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tip);

  var hideTimer;

  function show(rect) {
    clearTimeout(hideTimer);
    tip.innerHTML = IDLE_HTML;
    tip.classList.remove('share-hl-tip--copied', 'share-hl-tip--below');

    var above = rect.top > 52;
    // Center on selection, clamped to viewport
    var cx = Math.max(44, Math.min(window.innerWidth - 44, rect.left + rect.width / 2));

    tip.style.left = cx + 'px';
    tip.style.top = (above ? rect.top - 46 : rect.bottom + 8) + 'px';
    if (!above) tip.classList.add('share-hl-tip--below');
    tip.style.display = 'flex';
  }

  function hide(now) {
    clearTimeout(hideTimer);
    if (now) {
      tip.style.display = 'none';
    } else {
      hideTimer = setTimeout(function () { tip.style.display = 'none'; }, 150);
    }
  }

  document.addEventListener('mouseup', function (e) {
    // Skip inputs and editable elements
    var t = e.target;
    if (t.closest && t.closest('input, textarea, [contenteditable], .share-btn, .share-hl-tip')) return;

    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : '';
    if (text.length < MIN_LENGTH) { hide(); return; }

    var rect = sel.getRangeAt(0).getBoundingClientRect();
    show(rect);
  });

  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection();
    if (!sel || sel.toString().trim().length < MIN_LENGTH) hide();
  });

  // Prevent click on tip from collapsing the selection
  tip.addEventListener('mousedown', function (e) { e.preventDefault(); });

  tip.addEventListener('click', function () {
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : '';
    if (!text) return;

    var url = window.location.href.split('#')[0] + '#:~:text=' + encodeURIComponent(text);

    tip.classList.add('share-hl-tip--copied');
    tip.innerHTML = 'Copied!';

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).catch(function () {});
    } else {
      var inp = document.createElement('input');
      inp.value = url;
      inp.style.cssText = 'position:absolute;left:-9999px';
      document.body.appendChild(inp);
      inp.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(inp);
    }

    setTimeout(function () { hide(true); }, 1500);
  });

  window.addEventListener('scroll', function () { hide(true); }, { passive: true });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(true); });
})();
