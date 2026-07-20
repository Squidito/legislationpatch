// search-widget.js — upgrades the header magnifier link into an inline search
// box: clicking the magnifier expands an input ON the current page; Enter (or
// clicking the magnifier again with text) navigates to /search?q=… .
// Without JS the plain link still navigates to the search page (fallback).
//
// Loaded directly (script tag) by the standalone pages — floor, reps, rep,
// about, corrections, articles — and dynamically by app-boot.js's
// injectHeaderSearch() for every page that loads the app-*.js set.

(function () {
  function upgrade() {
    var link = document.querySelector('.header-search-link');
    if (!link || link.dataset.searchWidget) return;
    link.dataset.searchWidget = '1';

    var form = document.createElement('form');
    form.className = 'header-search-form';
    if (link.classList.contains('header-search-link--solo')) form.classList.add('header-search-form--solo');
    form.setAttribute('role', 'search');
    form.action = '/search';
    form.method = 'get';

    var input = document.createElement('input');
    input.type = 'search';
    input.name = 'q';
    input.className = 'header-search-input';
    input.placeholder = 'Search…';
    input.setAttribute('aria-label', 'Search');
    input.autocomplete = 'off';

    // The magnifier moves inside the form and becomes its open/submit control.
    link.parentNode.insertBefore(form, link);
    form.appendChild(input);
    form.appendChild(link);

    function isOpen() { return form.classList.contains('open'); }
    function openBox() { form.classList.add('open'); setTimeout(function () { input.focus(); }, 30); }
    function closeBox() { form.classList.remove('open'); }
    function submit() {
      var q = input.value.trim();
      if (!q) { input.focus(); return; }
      location.href = '/search?q=' + encodeURIComponent(q);
    }

    link.addEventListener('click', function (e) {
      e.preventDefault();
      if (!isOpen()) { openBox(); return; }
      if (input.value.trim()) submit();
      else closeBox();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; closeBox(); link.focus(); }
    });
    // Collapse when focus leaves and the box is empty; keep it open while it
    // holds text so a magnifier click can still submit (blur fires first).
    input.addEventListener('blur', function () {
      setTimeout(function () {
        if (!input.value.trim() && document.activeElement !== link) closeBox();
      }, 120);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', upgrade);
  else upgrade();
})();
