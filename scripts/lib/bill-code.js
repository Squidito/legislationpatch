// bill-code.js -- render a bill id as its official display code.
//
// "119-HR-5625" -> "H.R. 5625". The cache's own `code` field is the compact
// form ("HR.5625"), which is fine as a key but is NOT how a bill is written in
// prose. Two surfaces now publish bill codes to readers -- the changelog and
// the dispatch lane -- and they must agree, so the table lives here rather
// than being copied a second time.

'use strict';

const TYPE_DISPLAY = {
  HR: 'H.R.', S: 'S.',
  HRES: 'H.Res.', SRES: 'S.Res.',
  HJRES: 'H.J.Res.', SJRES: 'S.J.Res.',
  HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.',
};

function displayCode(id) {
  const m = String(id).match(/^\d+-([A-Z]+)-(\d+\w*)$/);
  if (!m) return String(id);
  return `${TYPE_DISPLAY[m[1]] || m[1]} ${m[2]}`;
}

module.exports = { TYPE_DISPLAY, displayCode };
