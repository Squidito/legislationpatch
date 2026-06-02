// share-selection.js — floating "Copy link" button on text selection, all pages.
// Generates a Text Fragment URL (#:~:text=...) and also handles incoming fragment
// URLs by finding + highlighting the text after dynamic content has rendered.
(function () {

  // ── Incoming text fragment handler ─────────────────────────────────────────
  // The browser's native #:~:text= handling fires before JS renders the page,
  // so it misses dynamically rendered content. We re-implement it here.

  const HIGHLIGHT_STYLE = document.createElement('style');
  HIGHLIGHT_STYLE.textContent = `
    mark.lp-frag {
      background: rgba(251,146,60,0.38);
      border-radius: 2px;
      padding: 0;
      animation: lp-frag-fade 3.5s ease-out 0.8s forwards;
    }
    @keyframes lp-frag-fade {
      from { background: rgba(251,146,60,0.38); }
      to   { background: transparent; }
    }
  `;
  document.head.appendChild(HIGHLIGHT_STYLE);

  function applyTextFragment() {
    const raw = window.location.hash || '';
    if (!raw.startsWith('#:~:text=')) return;
    const text = decodeURIComponent(raw.slice(9)).trim();
    if (!text || text.length < 5) return;

    let attempts = 0;

    function findTextNode(searchText) {
      // Walk every text node in the document, including inside display:none elements.
      // Skip the shock quotes carousel — the same quote text often appears there first
      // and would produce a false match at the top of the page.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (n.parentElement.closest('.shock-quotes-section, .shock-quotes-track')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      let node;
      while ((node = walker.nextNode())) {
        const idx = node.textContent.indexOf(searchText);
        if (idx !== -1) return { node, idx };
      }
      return null;
    }

    function revealAncestors(startEl) {
      // offsetParent === null is reliable for ANY hidden element (display:none on self
      // or any ancestor). Walk up from the text node's parent and force-show anything
      // that is hidden, skipping fixed/sticky positioned elements.
      let cur = startEl;
      while (cur && cur !== document.body) {
        if (cur.offsetParent === null) {
          const pos = window.getComputedStyle(cur).position;
          if (pos !== 'fixed' && pos !== 'sticky') {
            cur.style.setProperty('display', 'block', 'important');
            cur.classList.add('open');
          }
        }
        cur = cur.parentElement;
      }
    }

    function highlightAndScroll(node, idx) {
      const range = document.createRange();
      const end = Math.min(idx + text.length, node.textContent.length);
      range.setStart(node, idx);
      range.setEnd(node, end);

      // Scroll with offset for sticky header
      const rect = range.getBoundingClientRect();
      window.scrollTo({ top: rect.top + window.scrollY - 90, behavior: 'smooth' });

      // Wrap in <mark> for orange fade highlight
      try {
        const mark = document.createElement('mark');
        mark.className = 'lp-frag';
        range.surroundContents(mark);
        setTimeout(() => mark.replaceWith(...mark.childNodes), 5000);
      } catch (_) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }

    function attempt() {
      const match = findTextNode(text);
      if (!match) {
        if (attempts++ < 25) setTimeout(attempt, 300);
        return;
      }

      const { node, idx } = match;

      // Reveal hidden ancestors, then wait one frame for layout before scrolling
      revealAncestors(node.parentElement);
      requestAnimationFrame(() => highlightAndScroll(node, idx));
    }

    // Notify page scripts in case they want to do their own expansions
    window.dispatchEvent(new CustomEvent('lp-expand-for-fragment', { detail: { text } }));
    // Wait for dynamic content to render, then search
    setTimeout(attempt, 400);
  }

  applyTextFragment();

  // ── Share button on text selection ─────────────────────────────────────────
  const LINK_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

  let btn = null;
  let hideTimer = null;

  function getBtn() {
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = 'lp-share-sel';
    btn.setAttribute('aria-label', 'Copy link to highlighted text');
    document.body.appendChild(btn);

    const style = document.createElement('style');
    style.textContent = `
      #lp-share-sel {
        position: fixed; z-index: 9999; display: none;
        align-items: center; gap: 6px;
        padding: 6px 12px 6px 10px;
        background: #1a1a1f; color: #f0f0f3;
        border: 1px solid #3a3a48; border-radius: 6px;
        font-size: 0.75rem; font-weight: 600;
        font-family: 'IBM Plex Mono', ui-monospace, monospace;
        cursor: pointer; white-space: nowrap;
        box-shadow: 0 4px 14px rgba(0,0,0,0.45);
        letter-spacing: 0.01em;
        transform: translateX(-50%);
        transition: opacity 0.1s;
        pointer-events: auto;
      }
      #lp-share-sel:hover { background: #242429; }
      #lp-share-sel.copied { background: #14532d; border-color: #166534; color: #86efac; }
    `;
    document.head.appendChild(style);

    btn.onclick = function (e) {
      e.stopPropagation();
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text) return;

      const base = window.location.href.split('#')[0];
      let url;

      // If selection is inside a floor entry with a stable key, use #q= (reliable)
      const floorEntry = sel.anchorNode?.parentElement?.closest('[data-qkey]');
      if (floorEntry) {
        url = base + '#q=' + encodeURIComponent(floorEntry.dataset.qkey);
      } else {
        // All other pages: use text fragment
        url = base + '#:~:text=' + encodeURIComponent(text);
      }

      navigator.clipboard.writeText(url).then(() => {
        btn.innerHTML = '✓ Copied!';
        btn.classList.add('copied');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hide, 1800);
      }).catch(() => {
        prompt('Copy this link:', url);
      });
    };

    return btn;
  }

  function show(x, y) {
    const b = getBtn();
    b.innerHTML = LINK_ICON + ' Copy link';
    b.classList.remove('copied');
    b.style.display = 'flex';
    b.style.left = x + 'px';
    b.style.top  = y + 'px';
    clearTimeout(hideTimer);
  }

  function hide() {
    if (btn) btn.style.display = 'none';
  }

  document.addEventListener('mouseup', function (e) {
    if (e.target.closest('#lp-share-sel')) return;
    // Small delay so selection is finalised
    setTimeout(function () {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || text.length < 15) { hide(); return; }
      try {
        const range = sel.getRangeAt(0);
        const rect  = range.getBoundingClientRect();
        if (!rect.width) { hide(); return; }
        // Position above the midpoint of the selection
        const x = rect.left + rect.width / 2;
        const y = rect.top - 44 + window.scrollY;
        show(x, y);
      } catch (_) { hide(); }
    }, 10);
  });

  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest('#lp-share-sel')) hide();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hide();
  });

  document.addEventListener('selectionchange', function () {
    if (!window.getSelection()?.toString().trim()) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 200);
    }
  });
})();
