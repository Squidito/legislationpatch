#!/usr/bin/env node
/**
 * generate_brand_assets.js — render LegislationPatch brand raster assets.
 *
 * Produces, in the repo root:
 *   favicon.ico          32x32  (PNG bytes in an .ico-named file — browsers accept this)
 *   favicon-32.png       32x32  (squircle badge, transparent corners)
 *   apple-touch-icon.png 180x180 (full-bleed badge, opaque — iOS masks corners)
 *   og-image.png         1200x630 (social share card)
 *
 * All assets derive from the DEPLOYED brand (styles-shared.css :root + logo.svg):
 *   --purple #5F52DD ("sampled from the logo bubble"), --orange #c75c0e / logo #F97316,
 *   --bg #fafaf9, --text #0c0c0d, fonts Be Vietnam Pro + IBM Plex Mono.
 * The favicon is a faithful reconstruction of the deployed badge (purple squircle +
 * white Capitol dome + "LP" + orange patch-note bars). The OG card embeds the real
 * production logo.svg so the wordmark is pixel-accurate.
 *
 * Rasterizes with the repo's existing Playwright chromium (no extra deps, no image libs).
 *
 * Reusable: renderOgImage({ headline, sub, chip, domain, out }) is parameterized so a
 * later per-bill OG generator can call it with per-bill copy.
 *
 * Usage:  node scripts/generate_brand_assets.js [--only=og|icons]
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

// ---- Brand tokens (from styles-shared.css :root + logo.svg) --------------------
const BRAND = {
  purple:    '#5F52DD',
  purpleDk:  '#4C3FDE',
  purpleTop: '#6A5EE4',
  purpleBg:  '#efedfc',
  purpleBd:  '#cfc9f6',
  orange:    '#F97316',   // logo mark accent
  orangeInk: '#c75c0e',   // wordmark orange (--orange)
  paper:     '#fafaf9',
  ink:       '#0c0c0d',
  muted:     '#57534e',
  domGrey:   '#78716c',
  white:     '#ffffff',
};

// ---- Badge mark (faithful reconstruction of the deployed logo badge) -----------
function badgeSVG(size, { fullBleed = false } = {}) {
  const P = BRAND;
  const tile = fullBleed
    ? `<rect x="0" y="0" width="100" height="100" fill="url(#bg)"/>`
    : `<rect x="3" y="3" width="94" height="94" rx="24" fill="url(#bg)"/>`;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.purpleTop}"/>
      <stop offset="1" stop-color="${P.purpleDk}"/>
    </linearGradient>
  </defs>
  ${tile}
  <!-- Capitol dome (white), left -->
  <g fill="${P.white}">
    <circle cx="30" cy="20" r="2.1"/>
    <rect x="29" y="21.5" width="2" height="4.5"/>
    <rect x="26.5" y="26" width="7" height="4" rx="1"/>
    <path d="M18 51 C18 34 23.5 30 30 29 C36.5 30 42 34 42 51 Z"/>
    <rect x="16" y="51" width="28" height="3.2" rx="1.2"/>
    <rect x="19" y="55.5" width="22" height="14" rx="1"/>
    <rect x="15.5" y="70" width="29" height="3.4" rx="1.2"/>
    <rect x="13" y="74" width="34" height="3.2" rx="1.2"/>
  </g>
  <!-- dome ribs -->
  <g stroke="${P.purple}" stroke-width="1.1">
    <line x1="30" y1="30" x2="30" y2="50"/>
    <line x1="25" y1="33" x2="25" y2="50"/>
    <line x1="35" y1="33" x2="35" y2="50"/>
    <line x1="21" y1="40" x2="21" y2="50"/>
    <line x1="39" y1="40" x2="39" y2="50"/>
  </g>
  <!-- colonnade columns -->
  <g stroke="${P.purple}" stroke-width="1.4">
    <line x1="22.5" y1="57" x2="22.5" y2="68"/>
    <line x1="26"   y1="57" x2="26"   y2="68"/>
    <line x1="30"   y1="57" x2="30"   y2="68"/>
    <line x1="34"   y1="57" x2="34"   y2="68"/>
    <line x1="37.5" y1="57" x2="37.5" y2="68"/>
  </g>
  <!-- LP monogram (white), right -->
  <text x="55" y="52" font-family="'Be Vietnam Pro', system-ui, sans-serif"
        font-weight="800" font-size="26" fill="${P.white}" letter-spacing="-1">LP</text>
  <!-- orange patch-note bars -->
  <g fill="${P.orange}">
    <rect x="55" y="60" width="26" height="4" rx="2"/>
    <rect x="55" y="67" width="20" height="4" rx="2"/>
    <rect x="55" y="74" width="24" height="4" rx="2"/>
  </g>
</svg>`;
}

// ---- OG card HTML (parameterized for reuse by a future per-bill generator) ------
function buildOgHtml({
  headlineTop = 'U.S. Federal Bills,',
  headlineBottom = 'Plain English.',
  sub = 'Sourced directly from bill text. No editorial spin.',
  chip = '// SOURCED FROM CONGRESS.GOV',
  domain = 'legislationpatch.com',
} = {}) {
  const logoUri = 'data:image/svg+xml;base64,' +
    Buffer.from(fs.readFileSync(path.join(ROOT, 'logo.svg'), 'utf8')).toString('base64');
  const P = BRAND;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1200px; height:630px; }
  body { background:${P.paper}; font-family:'Be Vietnam Pro', system-ui, sans-serif;
         color:${P.ink}; position:relative; overflow:hidden; }
  .accent  { position:absolute; left:0; top:0;   width:100%; height:10px; background:${P.purple}; }
  .accent2 { position:absolute; left:0; top:10px; width:100%; height:3px;  background:${P.orange}; opacity:.85; }
  .wrap { padding:82px 80px 0; display:flex; flex-direction:column; height:100%; }
  .logo { width:640px; margin-bottom:44px; }
  .tag  { font-size:52px; font-weight:700; letter-spacing:-1.2px; line-height:1.1; }
  .tag .o { color:${P.orangeInk}; }
  .sub  { font-size:27px; font-weight:500; color:${P.muted}; margin-top:22px; }
  .footer { position:absolute; left:80px; right:80px; bottom:46px;
            display:flex; justify-content:space-between; align-items:center; }
  .chip { font-family:'IBM Plex Mono', ui-monospace, monospace; font-size:18px; font-weight:600;
          color:${P.purple}; background:${P.purpleBg}; border:1px solid ${P.purpleBd};
          padding:9px 16px; border-radius:8px; letter-spacing:.5px; }
  .dom  { font-family:'IBM Plex Mono', ui-monospace, monospace; font-size:20px; font-weight:600; color:${P.domGrey}; }
</style></head>
<body>
  <div class="accent"></div><div class="accent2"></div>
  <div class="wrap">
    <img class="logo" src="${logoUri}">
    <div class="tag">${headlineTop}<br><span class="o">${headlineBottom}</span></div>
    <div class="sub">${sub}</div>
  </div>
  <div class="footer">
    <div class="chip">${chip}</div>
    <div class="dom">${domain}</div>
  </div>
</body></html>`;
}

// ---- PNG header reader (width/height = big-endian uint32 at offsets 16/20) ------
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ---- Wrap a PNG buffer in a single-image .ico container (no deps) --------------
// ICONDIR(6) + ICONDIRENTRY(16) + PNG payload. PNG-in-ICO is valid since Vista and
// accepted by every current browser; this is a real .ico, not a renamed PNG.
function pngToIco(pngBuf) {
  const { width, height } = pngSize(pngBuf) || { width: 32, height: 32 };
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);            // reserved
  dir.writeUInt16LE(1, 2);            // type: 1 = icon
  dir.writeUInt16LE(1, 4);            // image count
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width  >= 256 ? 0 : width,  0);  // width  (0 => 256)
  entry.writeUInt8(height >= 256 ? 0 : height, 1);  // height (0 => 256)
  entry.writeUInt8(0, 2);            // palette colors
  entry.writeUInt8(0, 3);            // reserved
  entry.writeUInt16LE(1, 4);         // color planes
  entry.writeUInt16LE(32, 6);        // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8);   // size of image data
  entry.writeUInt32LE(6 + 16, 12);         // offset to image data
  return Buffer.concat([dir, entry, pngBuf]);
}

// ---- Renderers -----------------------------------------------------------------
async function renderBadge(browser, size, opts, outFile) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<body style="margin:0">${badgeSVG(size, opts)}</body>`,
    { waitUntil: 'load' });
  await page.waitForTimeout(120);
  await page.screenshot({
    path: outFile,
    clip: { x: 0, y: 0, width: size, height: size },
    omitBackground: !opts.fullBleed,   // transparent corners for the squircle favicon
  });
  await page.close();
  return outFile;
}

async function renderOgImage(browser, opts = {}) {
  const out = opts.out || path.join(ROOT, 'og-image.png');
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(buildOgHtml(opts), { waitUntil: 'networkidle' });
  try { await page.evaluate(() => document.fonts.ready); } catch (_) { /* offline: fall back to system fonts */ }
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await page.close();
  return out;
}

// ---- Main ----------------------------------------------------------------------
(async () => {
  const arg = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || 'all';
  const browser = await chromium.launch();
  const made = [];
  try {
    if (arg === 'all' || arg === 'icons') {
      const fav32   = await renderBadge(browser, 32,  { fullBleed: false }, path.join(ROOT, 'favicon-32.png'));
      const apple   = await renderBadge(browser, 180, { fullBleed: true },  path.join(ROOT, 'apple-touch-icon.png'));
      // favicon.ico: proper single-image ICO container wrapping the 32x32 PNG (no deps).
      const icoPath = path.join(ROOT, 'favicon.ico');
      fs.writeFileSync(icoPath, pngToIco(fs.readFileSync(fav32)));
      made.push(fav32, apple, icoPath);
    }
    if (arg === 'all' || arg === 'og') {
      made.push(await renderOgImage(browser));
    }
  } finally {
    await browser.close();
  }

  // ---- Verify ----
  console.log('\nGenerated brand assets:');
  for (const f of made) {
    const buf = fs.readFileSync(f);
    // .ico wraps the PNG after a 22-byte header; read the embedded PNG for dims.
    const dim = f.endsWith('.ico') ? pngSize(buf.subarray(22)) : pngSize(buf);
    const kind = f.endsWith('.ico') ? 'ICO(png)' : 'PNG';
    const dimStr = dim ? `${dim.width}x${dim.height}` : 'n/a';
    console.log(`  ${path.basename(f).padEnd(22)} ${String(buf.length).padStart(8)} bytes  ${kind.padEnd(9)} ${dimStr}`);
  }

  // Hard assertion on the OG dimensions
  const ogPath = path.join(ROOT, 'og-image.png');
  if (fs.existsSync(ogPath)) {
    const d = pngSize(fs.readFileSync(ogPath));
    if (!d || d.width !== 1200 || d.height !== 630) {
      console.error(`\nFAIL: og-image.png must be 1200x630, got ${d ? d.width + 'x' + d.height : 'unreadable'}`);
      process.exit(1);
    }
    console.log('\nOK: og-image.png verified 1200x630.');
  }
})().catch(e => { console.error(e); process.exit(1); });
