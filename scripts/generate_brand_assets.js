#!/usr/bin/env node
/**
 * generate_brand_assets.js — render LegislationPatch brand raster assets.
 *
 * Produces, in the repo root:
 *   favicon.ico          32x32  (PNG bytes in an .ico-named file — browsers accept this)
 *   favicon-32.png       32x32  (squircle badge, transparent corners)
 *   apple-touch-icon.png 180x180 (full-bleed badge, opaque — iOS masks corners)
 *   og-image.png         1200x630 (site-wide social share card)
 *
 * And, in --bills mode, one per-bill social card per cached bill:
 *   og/bills/<id>.png    1200x630 (bill-specific share card)
 *   og/bills/manifest.json  { version, bills: { <id>: <inputHash> } }
 *
 * All assets derive from the DEPLOYED brand (styles-shared.css :root + logo.svg):
 *   --purple #5F52DD ("sampled from the logo bubble"), --orange #c75c0e / logo #F97316,
 *   --bg #fafaf9, --text #0c0c0d, fonts Be Vietnam Pro + IBM Plex Mono, and the site's
 *   semantic status tokens (--green #3a7a4f / --red #a14040).
 * The favicon is a faithful reconstruction of the deployed badge (purple squircle +
 * white Capitol dome + "LP" + orange patch-note bars). The site-wide OG card embeds
 * the real production logo.svg so the wordmark is pixel-accurate; the per-bill cards
 * use the vector badge + a live-text wordmark instead (the raster logo.svg is ~360 KB,
 * far too heavy to inline into 183 cards) — same brand lockup, a fraction of the bytes.
 *
 * Rasterizes with the repo's existing Playwright chromium (no extra deps, no image libs).
 *
 * Reusable: renderOgImage({ headline, sub, chip, domain, out }) is parameterized so a
 * later per-bill OG generator can call it with per-bill copy.
 *
 * Usage:
 *   node scripts/generate_brand_assets.js [--only=og|icons]   — site-wide brand assets
 *   node scripts/generate_brand_assets.js --bills [--bill=ID] — per-bill OG cards (npm run og)
 */

const { chromium } = require('playwright');
const crypto = require('crypto');
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
  // Semantic status tokens (verbatim from styles-shared.css :root).
  green:     '#3a7a4f',
  greenBg:   '#eef5ef',
  greenText: '#1A4D22',
  greenBd:   '#cfe4d5',
  red:       '#a14040',
  redBg:     '#f7ecec',
  redText:   '#7A1F15',
  redBd:     '#eccdcd',
  neutralBg: '#f1efe9',
  neutralBd: '#e2ded4',
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

// ================================================================================
//  PER-BILL OG CARDS
// ================================================================================
//
// A 1200x630 card in the same brand system as the site-wide og-image.png (paper
// ground, purple/orange top accent, LP badge lockup, Be Vietnam Pro + IBM Plex
// Mono) but bill-specific: the bill title is the hero headline (auto-fit to <=3
// lines), a mono chip carries the bill code + congress, and a status pill shows
// the stage label in the site's semantic colors (green = signed/passed, red =
// failed, neutral otherwise). Only the domain is set small; everything else stays
// legible at feed-thumbnail size. Plain background, no gradients/photos → the PNG
// compresses to well under the 100 KB target.

// Bump this whenever the CARD DESIGN changes (layout, colors, fields shown) so
// every cached bill re-renders on the next run even if its data is unchanged.
const BILL_CARD_VERSION = 'bill-og-v1';

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => HTML_ESCAPES[c]); }

// 119 -> "119TH", 1 -> "1ST" (ordinal suffix, uppercased for the mono chip).
function ordinal(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  const s = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return (num + (s[(v - 20) % 10] || s[v] || s[0])).toUpperCase();
}

// stageLabel -> a semantic tone. Structural, not editorial: it mirrors the
// recorded outcome (signed/passed = green, failed = red, everything else neutral).
function statusTone(label) {
  const l = String(label || '').toLowerCase();
  if (l.includes('signed') || l.includes('enacted')) return 'green';
  if (l.includes('passed')) return 'green';
  if (l.includes('failed')) return 'red';
  return 'neutral';
}

const TONE_STYLE = {
  green:   { bg: BRAND.greenBg,   text: BRAND.greenText,   bd: BRAND.greenBd,   dot: BRAND.green },
  red:     { bg: BRAND.redBg,     text: BRAND.redText,     bd: BRAND.redBd,     dot: BRAND.red },
  neutral: { bg: BRAND.neutralBg, text: BRAND.muted,       bd: BRAND.neutralBd, dot: BRAND.domGrey },
};

// Derive the exact set of strings the card SHOWS from a bill record. The manifest
// hashes this object, so anything that changes the rendered pixels must live here.
function billCardInputs(bill) {
  const parts = String(bill.id || '').split('-');
  let code, congress;
  if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
    congress = ordinal(parts[0]) + ' CONGRESS';
    code = `${parts[1].toUpperCase()} ${parts[parts.length - 1]}`;
  } else {
    congress = '';
    code = String(bill.code || bill.id || '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  }
  const chip = [code, congress].filter(Boolean).join(' · '); // " · "
  const headline = String(bill.title || bill.code || bill.id || '').replace(/\s+/g, ' ').trim();
  const statusLabel = String(bill.stageLabel || '').trim();
  return {
    id: bill.id,
    headline,
    chip,
    statusLabel,
    tone: statusTone(statusLabel),
    domain: 'legislationpatch.com',
    v: BILL_CARD_VERSION,
  };
}

// 16-char content hash of the render inputs → the manifest skip key.
function cardHash(inputs) {
  const stable = {
    headline: inputs.headline, chip: inputs.chip, statusLabel: inputs.statusLabel,
    tone: inputs.tone, domain: inputs.domain, v: inputs.v,
  };
  return crypto.createHash('sha1').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
}

function buildBillOgHtml(inputs) {
  const P = BRAND;
  const tone = TONE_STYLE[inputs.tone] || TONE_STYLE.neutral;
  const badge = badgeSVG(58);
  const statusPill = inputs.statusLabel
    ? `<div class="status">
         <span class="dot"></span>${esc(inputs.statusLabel.toUpperCase())}
       </div>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1200px; height:630px; }
  body { background:${P.paper}; font-family:'Be Vietnam Pro', system-ui, sans-serif;
         color:${P.ink}; position:relative; overflow:hidden; }
  .accent  { position:absolute; left:0; top:0;   width:100%; height:10px; background:${P.purple}; }
  .accent2 { position:absolute; left:0; top:10px; width:100%; height:3px;  background:${P.orange}; opacity:.85; }
  .wrap { padding:58px 76px 0; height:100%; display:flex; flex-direction:column; }
  .brand { display:flex; align-items:center; gap:16px; margin-bottom:38px; }
  .brand .badge { width:58px; height:58px; display:block; }
  .brand .word { font-size:34px; font-weight:700; letter-spacing:-1px; line-height:1; }
  .brand .word .o { color:${P.orangeInk}; }
  .metarow { display:flex; align-items:center; gap:18px; margin-bottom:30px; flex-wrap:nowrap; }
  .chip { font-family:'IBM Plex Mono', ui-monospace, monospace; font-size:23px; font-weight:600;
          color:${P.purple}; background:${P.purpleBg}; border:1px solid ${P.purpleBd};
          padding:10px 18px; border-radius:9px; letter-spacing:.4px; white-space:nowrap; }
  .status { display:inline-flex; align-items:center; gap:11px; font-size:22px; font-weight:700;
            letter-spacing:.4px; padding:10px 20px; border-radius:999px; white-space:nowrap;
            background:${tone.bg}; color:${tone.text}; border:1px solid ${tone.bd}; }
  .status .dot { width:13px; height:13px; border-radius:50%; background:${tone.dot}; display:block; flex:0 0 auto; }
  .hero { height:288px; display:flex; align-items:flex-start; }
  .headline { font-weight:800; letter-spacing:-1.8px; line-height:1.06; color:${P.ink};
              display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3;
              overflow:hidden; text-overflow:ellipsis; }
  .footer { position:absolute; left:76px; right:76px; bottom:46px;
            display:flex; justify-content:space-between; align-items:flex-end; }
  .tagline { font-family:'IBM Plex Mono', ui-monospace, monospace; font-size:19px; font-weight:600;
             color:${P.muted}; letter-spacing:.3px; }
  .dom { font-family:'IBM Plex Mono', ui-monospace, monospace; font-size:20px; font-weight:600; color:${P.domGrey}; }
</style></head>
<body>
  <div class="accent"></div><div class="accent2"></div>
  <div class="wrap">
    <div class="brand">
      <span class="badge">${badge}</span>
      <span class="word">Legislation<span class="o">Patch</span></span>
    </div>
    <div class="metarow">
      ${inputs.chip ? `<span class="chip">${esc(inputs.chip)}</span>` : ''}
      ${statusPill}
    </div>
    <div class="hero">
      <div class="headline">${esc(inputs.headline)}</div>
    </div>
  </div>
  <div class="footer">
    <span class="tagline">${esc(inputs.tagline || '// PLAIN-ENGLISH BILL SUMMARY')}</span>
    <span class="dom">${esc(inputs.domain)}</span>
  </div>
</body></html>`;
}

// Auto-fit the headline: start large, shrink until it fits in <=3 lines (or the
// floor), then the -webkit-line-clamp truncates anything still over 3 lines with
// an ellipsis. Deterministic for a given headline → stable pixels per input.
const HEADLINE_MAX = 84;
const HEADLINE_MIN = 40;

async function renderBillCard(page, inputs, out) {
  await page.setContent(buildBillOgHtml(inputs), { waitUntil: 'networkidle' });
  try { await page.evaluate(() => document.fonts.ready); } catch (_) { /* offline: system fonts */ }
  const fit = await page.evaluate(({ max, min, lh, maxLines }) => {
    const el = document.querySelector('.headline');
    if (!el) return { fontSize: 0 };
    // Measure with the clamp OFF (scrollHeight of a -webkit-box/line-clamp element
    // is unreliable). Shrink the font until the NATURAL text height fits within
    // maxLines, then re-apply the clamp so any residual overflow at the floor is
    // truncated with an ellipsis.
    el.style.display = 'block';
    el.style.webkitLineClamp = 'unset';
    let f = max;
    const fits = () => {
      el.style.fontSize = f + 'px';
      return el.scrollHeight <= Math.ceil(maxLines * f * lh) + 2;
    };
    while (!fits() && f > min) { f -= 2; }
    const overflow = !fits(); // still too tall at the floor → will be truncated
    el.style.display = '-webkit-box';
    el.style.webkitLineClamp = String(maxLines);
    return { fontSize: f, clamped: overflow };
  }, { max: HEADLINE_MAX, min: HEADLINE_MIN, lh: 1.06, maxLines: 3 });
  await page.waitForTimeout(60);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  return fit;
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

// ---- Per-bill batch (with manifest churn control) ------------------------------
function loadBills() {
  const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cache.json'), 'utf8'));
  return Array.isArray(cache.bills) ? cache.bills : Object.values(cache.bills || {});
}

async function runBillBatch(browser, { onlyBill = null } = {}) {
  const outDir = path.join(ROOT, 'og', 'bills');
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');

  let manifest = { version: BILL_CARD_VERSION, bills: {} };
  try {
    const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (prev && prev.version === BILL_CARD_VERSION && prev.bills) manifest = prev;
  } catch (_) { /* no/invalid manifest — full render */ }

  let bills = loadBills();
  if (onlyBill) bills = bills.filter(b => b.id === onlyBill);
  if (!bills.length) { console.error(`No bills to render${onlyBill ? ' for ' + onlyBill : ''}.`); return; }

  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

  let rendered = 0, skipped = 0;
  const nextBills = {};
  const fits = [];
  for (const bill of bills) {
    const inputs = billCardInputs(bill);
    const hash = cardHash(inputs);
    const out = path.join(outDir, `${bill.id}.png`);
    nextBills[bill.id] = hash;

    if (manifest.bills[bill.id] === hash && fs.existsSync(out)) {
      skipped++;
      continue;
    }
    const fit = await renderBillCard(page, inputs, out);
    fits.push({ id: bill.id, fontSize: fit.fontSize, clamped: !!fit.clamped, len: inputs.headline.length });
    rendered++;
  }
  await page.close();

  // Merge (single-bill runs must not drop other ids from the manifest); for a full
  // run, prune ids no longer in cache and delete their orphaned PNGs.
  if (onlyBill) {
    manifest.bills[onlyBill] = nextBills[onlyBill];
  } else {
    const keep = new Set(Object.keys(nextBills));
    for (const f of fs.readdirSync(outDir)) {
      if (f.endsWith('.png') && !keep.has(f.slice(0, -4))) {
        fs.unlinkSync(path.join(outDir, f));
      }
    }
    manifest.bills = nextBills;
  }
  manifest.version = BILL_CARD_VERSION;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  // ---- Report ----
  const pngs = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
  let total = 0, maxF = null, minF = null, clampCount = 0;
  for (const f of pngs) total += fs.statSync(path.join(outDir, f)).size;
  for (const fit of fits) {
    clampCount += fit.clamped ? 1 : 0;
    const buf = fs.readFileSync(path.join(outDir, fit.id + '.png'));
    fit.bytes = buf.length;
  }
  fits.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  const avg = pngs.length ? total / pngs.length : 0;

  console.log(`\nPer-bill OG cards → og/bills/`);
  console.log(`  rendered: ${rendered}   skipped (unchanged): ${skipped}   on disk: ${pngs.length}`);
  console.log(`  total size: ${(total / 1024).toFixed(1)} KB   average: ${(avg / 1024).toFixed(1)} KB/card`);
  if (fits.length) {
    console.log(`  headline auto-fit: ${clampCount} title(s) hard-truncated at ${HEADLINE_MIN}px; font range this run ${Math.min(...fits.map(f => f.fontSize))}–${Math.max(...fits.map(f => f.fontSize))}px`);
    console.log(`  largest cards this run:`);
    for (const f of fits.slice(0, 3)) {
      console.log(`    ${f.id.padEnd(16)} ${String((f.bytes / 1024).toFixed(1)).padStart(6)} KB  fit ${f.fontSize}px  ${f.clamped ? '(truncated)' : ''}`);
    }
  }
  if (avg / 1024 > 120) {
    console.warn(`\n  ⚠️  average card size ${(avg / 1024).toFixed(1)} KB exceeds the 120 KB budget — reduce card complexity.`);
  }
  const bad = pngs.map(f => ({ f, d: pngSize(fs.readFileSync(path.join(outDir, f))) }))
    .filter(x => !x.d || x.d.width !== 1200 || x.d.height !== 630);
  if (bad.length) {
    console.error(`\nFAIL: ${bad.length} per-bill card(s) are not 1200x630 (e.g. ${bad[0].f}).`);
    process.exit(1);
  }
  console.log(`\nOK: all ${pngs.length} per-bill cards verified 1200x630.`);
}

// ================================================================================
//  PER-ARTICLE OG CARDS  (added 2026-08-17 — James's directive after the first
//  explainer shipped sharing the generic site card)
// ================================================================================
//
// Same 1200x630 brand system and render path as the bill cards, with the article's
// h1 as the hero, the curated index label ("Explainer", "Bill Tracker", …) in the
// mono chip, no status pill, and a guide tagline. Deliberately its OWN version
// string, inputs, hash and manifest: sharing the bill card's hash would re-render
// all 183 bill cards the first time an article field was added.

const ARTICLE_CARD_VERSION = 'article-og-v1';

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// The h1 is the card headline (the <title> tag carries an appended explainer that
// would clamp at card sizes); curated label is the chip. Both come from what the
// site already shows — the card invents nothing.
function articleCardInputs(slug, html, label) {
  const h1 = html.match(/<h1 class="article-title">([\s\S]*?)<\/h1>/);
  const title = html.match(/<title>([\s\S]*?)<\/title>/);
  const headline = decodeEntities((h1 ? h1[1] : title ? title[1] : slug)
    .replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  return {
    id: slug,
    headline,
    chip: String(label || 'Guide').toUpperCase(),
    statusLabel: '',
    tone: 'neutral',
    tagline: '// PLAIN-ENGLISH GUIDE TO CONGRESS',
    domain: 'legislationpatch.com',
    v: ARTICLE_CARD_VERSION,
  };
}

function articleCardHash(inputs) {
  const stable = {
    headline: inputs.headline, chip: inputs.chip, tagline: inputs.tagline,
    domain: inputs.domain, v: inputs.v,
  };
  return crypto.createHash('sha1').update(JSON.stringify(stable)).digest('hex').slice(0, 16);
}

async function runArticleBatch(browser, { onlyArticle = null } = {}) {
  const outDir = path.join(ROOT, 'og', 'articles');
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');

  let manifest = { version: ARTICLE_CARD_VERSION, articles: {} };
  try {
    const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (prev && prev.version === ARTICLE_CARD_VERSION && prev.articles) manifest = prev;
  } catch (_) { /* no/invalid manifest — full render */ }

  const curated = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'articles-index.json'), 'utf8')).articles || {}; }
    catch (_) { return {}; }
  })();

  let slugs = fs.readdirSync(path.join(ROOT, 'articles'))
    .filter(f => f.endsWith('.html') && f !== 'index.html')
    .map(f => f.replace(/\.html$/, ''));
  if (onlyArticle) slugs = slugs.filter(s => s === onlyArticle);
  if (!slugs.length) { console.error(`No articles to render${onlyArticle ? ' for ' + onlyArticle : ''}.`); return; }

  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

  let rendered = 0, skipped = 0;
  const nextArticles = {};
  const fits = [];
  for (const slug of slugs) {
    const html = fs.readFileSync(path.join(ROOT, 'articles', `${slug}.html`), 'utf8');
    const label = (curated[`${slug}.html`] || {}).label;
    const inputs = articleCardInputs(slug, html, label);
    const hash = articleCardHash(inputs);
    const out = path.join(outDir, `${slug}.png`);
    nextArticles[slug] = hash;

    if (manifest.articles[slug] === hash && fs.existsSync(out)) { skipped++; continue; }
    const fit = await renderBillCard(page, inputs, out);
    fits.push({ id: slug, fontSize: fit.fontSize, clamped: !!fit.clamped });
    rendered++;
  }
  await page.close();

  if (onlyArticle) {
    manifest.articles[onlyArticle] = nextArticles[onlyArticle];
  } else {
    const keep = new Set(Object.keys(nextArticles));
    for (const f of fs.readdirSync(outDir)) {
      if (f.endsWith('.png') && !keep.has(f.slice(0, -4))) fs.unlinkSync(path.join(outDir, f));
    }
    manifest.articles = nextArticles;
  }
  manifest.version = ARTICLE_CARD_VERSION;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  const pngs = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
  let total = 0;
  for (const f of pngs) total += fs.statSync(path.join(outDir, f)).size;
  const clampCount = fits.filter(f => f.clamped).length;
  console.log(`\nPer-article OG cards → og/articles/`);
  console.log(`  rendered: ${rendered}   skipped (unchanged): ${skipped}   on disk: ${pngs.length}`);
  console.log(`  total size: ${(total / 1024).toFixed(1)} KB   average: ${pngs.length ? (total / pngs.length / 1024).toFixed(1) : 0} KB/card`);
  if (fits.length) console.log(`  headline auto-fit: ${clampCount} hard-truncated; font range ${Math.min(...fits.map(f => f.fontSize))}–${Math.max(...fits.map(f => f.fontSize))}px`);

  const bad = pngs.map(f => ({ f, d: pngSize(fs.readFileSync(path.join(outDir, f))) }))
    .filter(x => !x.d || x.d.width !== 1200 || x.d.height !== 630);
  if (bad.length) {
    console.error(`\nFAIL: ${bad.length} per-article card(s) are not 1200x630 (e.g. ${bad[0].f}).`);
    process.exit(1);
  }
  console.log(`\nOK: all ${pngs.length} per-article cards verified 1200x630.`);
}

// Topic-hub cards — same brand system, chip = "TOPIC HUB". Rendered as part of
// the --articles batch (skipped on single-article runs) into og/topics/ with
// their own manifest, so hub-config edits never churn article or bill cards.
const TOPIC_CARD_VERSION = 'topic-og-v1';

async function runTopicCardBatch(browser) {
  const cfgDir = path.join(ROOT, 'data', 'topics');
  if (!fs.existsSync(cfgDir)) return;
  const hubs = fs.readdirSync(cfgDir).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(cfgDir, f), 'utf8')));
  if (!hubs.length) return;

  const outDir = path.join(ROOT, 'og', 'topics');
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');
  let manifest = { version: TOPIC_CARD_VERSION, topics: {} };
  try {
    const prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (prev && prev.version === TOPIC_CARD_VERSION && prev.topics) manifest = prev;
  } catch (_) { /* full render */ }

  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  let rendered = 0, skipped = 0;
  const next = {};
  for (const h of hubs) {
    const inputs = {
      id: h.slug, headline: h.title, chip: 'TOPIC HUB', statusLabel: '', tone: 'neutral',
      tagline: '// PLAIN-ENGLISH GUIDE TO CONGRESS', domain: 'legislationpatch.com', v: TOPIC_CARD_VERSION,
    };
    const hash = articleCardHash(inputs);
    const out = path.join(outDir, `${h.slug}.png`);
    next[h.slug] = hash;
    if (manifest.topics[h.slug] === hash && fs.existsSync(out)) { skipped++; continue; }
    await renderBillCard(page, inputs, out);
    rendered++;
  }
  await page.close();

  const keep = new Set(Object.keys(next));
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.png') && !keep.has(f.slice(0, -4))) fs.unlinkSync(path.join(outDir, f));
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ version: TOPIC_CARD_VERSION, topics: next }, null, 2) + '\n');

  const pngs = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
  const bad = pngs.map(f => ({ f, d: pngSize(fs.readFileSync(path.join(outDir, f))) }))
    .filter(x => !x.d || x.d.width !== 1200 || x.d.height !== 630);
  if (bad.length) { console.error(`\nFAIL: ${bad.length} topic card(s) are not 1200x630.`); process.exit(1); }
  console.log(`\nTopic-hub OG cards → og/topics/   rendered: ${rendered}   skipped: ${skipped}   on disk: ${pngs.length} (verified 1200x630)`);
}

// ---- Main ----------------------------------------------------------------------
(async () => {
  const argv = process.argv.slice(2);
  const BILLS_MODE = argv.includes('--bills');
  const ARTICLES_MODE = argv.includes('--articles');
  const onlyBill = (argv.find(a => a.startsWith('--bill=')) || '').split('=')[1] || null;
  const onlyArticle = (argv.find(a => a.startsWith('--article=')) || '').split('=')[1] || null;
  const arg = (argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || 'all';

  const browser = await chromium.launch();
  try {
    if (BILLS_MODE) {
      await runBillBatch(browser, { onlyBill });
      if (!ARTICLES_MODE) return;
    }
    if (ARTICLES_MODE) {
      await runArticleBatch(browser, { onlyArticle });
      if (!onlyArticle) await runTopicCardBatch(browser);
      return;
    }

    // Site-wide brand assets (default).
    const made = [];
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
    if (fs.existsSync(ogPath) && (arg === 'all' || arg === 'og')) {
      const d = pngSize(fs.readFileSync(ogPath));
      if (!d || d.width !== 1200 || d.height !== 630) {
        console.error(`\nFAIL: og-image.png must be 1200x630, got ${d ? d.width + 'x' + d.height : 'unreadable'}`);
        process.exit(1);
      }
      console.log('\nOK: og-image.png verified 1200x630.');
    }
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
