// changelog-page.js -- read a PUBLISHED changelog page back into structured entries.
//
// Extracted 2026-08-27 from verify-changelog.js so generate_digest.js can share it.
// Two consumers, one parser:
//   * verify-changelog.js -- cross-checks a frozen edition against the bill record.
//   * generate_digest.js  -- recovers the entries of an edition published BEFORE
//     digest-state.json started recording them, so a same-day regeneration can
//     merge instead of overwrite (the 2026-08-27 defect: a second same-day run
//     silently deleted four bills from that day's edition, unrecoverably, because
//     their stages were already in the state snapshot and never diffed again).
//
// The published page is the only durable record of a legacy edition's contents,
// which is why parsing it is worth doing. Everything here is fail-soft at the
// parse layer (unparsable markup yields fewer entries); the CALLER decides
// whether a short read is an error -- generate_digest treats it as fatal.

'use strict';

function decode(s) {
  return String(s)
    .replace(/<[^>]*>/g, '')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rarr;/g, '→')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** "/bill/119-hr-2069-stop-secret-spending-act-of-2025/" -> "119-HR-2069" */
function idFromHref(href) {
  const m = String(href).match(/\/bill\/(\d+)-([a-z]+)-(\d+)-/i);
  return m ? `${m[1]}-${m[2].toUpperCase()}-${m[3]}` : null;
}

/** Every entry <li> in a slice of markup, parsed. */
function parseEntries(html) {
  const found = [];
  for (const m of String(html).matchAll(/<li class="cl-entry">([\s\S]*?)<\/li>/g)) {
    const li = m[1];
    const hrefM  = li.match(/<a class="cl-code" href="([^"]+)"/);
    const codeM  = li.match(/<a class="cl-code"[^>]*>([\s\S]*?)<\/a>/);
    const titleM = li.match(/<span class="cl-title">([\s\S]*?)<\/span>/);
    const nowM   = li.match(/<span class="cl-renamed"[^>]*>\(now:\s*([\s\S]*?)\)<\/span>/);
    const transM = li.match(/<span class="cl-transition">([\s\S]*?)<\/span>\s*<span class="cl-meta">/);
    if (!codeM) continue;
    const trans = decode(transM ? transM[1] : '');
    const parts = trans.split('→').map(s => s.trim());
    found.push({
      href: hrefM ? hrefM[1] : '',
      id: hrefM ? idFromHref(hrefM[1]) : null,
      code: decode(codeM[1]),
      title: decode(titleM ? titleM[1] : ''),
      from: parts.length > 1 ? parts[0] : null,
      to: parts.length > 1 ? parts[1] : trans,
      nowTitle: nowM ? decode(nowM[1]) : null,
    });
  }
  return found;
}

// Group heading text -> the group KEY generate_digest builds editions with.
// "Recent activity" is the inaugural edition's label for the same 'advanced' key.
const GROUP_KEY = {
  'signed into law': 'enacted',
  'advanced a stage': 'advanced',
  'recent activity': 'advanced',
  'new to the site': 'new',
};

/**
 * Entries grouped as the page presents them:
 *   [{ key, title, claimed, entries: [...] }]
 * `claimed` is the count the group header states about itself; `key` is null for
 * a heading this module does not recognise (the caller decides how loud that is).
 */
function parseGroups(html) {
  const groups = [];
  for (const g of String(html).matchAll(/<section class="cl-group">([\s\S]*?)<\/section>/g)) {
    const body  = g[1];
    const headM = body.match(/<h3 class="cl-group-title">([\s\S]*?)<span class="cl-group-count">(\d+)<\/span>/);
    if (!headM) { groups.push({ key: null, title: null, claimed: null, entries: parseEntries(body) }); continue; }
    const title = decode(headM[1]);
    groups.push({
      key: GROUP_KEY[title.toLowerCase()] || null,
      title,
      claimed: Number(headM[2]),
      entries: parseEntries(body),
    });
  }
  return groups;
}

module.exports = { decode, idFromHref, parseEntries, parseGroups, GROUP_KEY };
