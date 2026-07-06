// smoke-test.js — standalone browser smoke suite for the whole site.
//
// PURPOSE: frontend changes break silently (no build step, no type checker) —
// this converts the manual verify-every-page pattern into a one-command gate
// that any model/human can run without judgment. Checks every page loads, key
// UI renders with data-driven expected counts, interactions work, the theme
// round-trips, mobile layout responds, and NO console errors occur (favicon
// 404 allowlisted).
//
// Run:  npm run smoke        (spawns its own static server on :3141, ~30s)
// Exit: 0 all green, 1 any failure. Requires devDependency playwright
// (npx playwright install chromium once per machine).

'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 3141;
const BASE = `http://localhost:${PORT}`;

// Data-driven expectations from the real cache
const cache = require(path.join(ROOT, 'data/cache.json'));
const BILLS = cache.bills.length;
// An omnibus WITH division-structured text (HR-1 is flagged omnibus but its
// reconciliation text uses TITLEs, not DIVISION headers — no bt-div anchors).
const omnibus = cache.bills.find(b => b.isOmnibus && (b.divisions || []).some(d => /^[A-Z]$/.test(d.divisionKey)));
const regular = cache.bills.find(b => !b.isOmnibus && b.analyzed);
const repId = (cache.bills.find(b => b.sponsor_bioguide) || {}).sponsor_bioguide;

let passN = 0, failN = 0;
const pass = m => { passN++; console.log(`  ✓ ${m}`); };
const fail = m => { failN++; console.log(`  ✗ ${m}`); };
const check = (cond, m) => cond ? pass(m) : fail(m);

async function waitForServer(url, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

(async () => {
  console.log(`smoke-test — ${BILLS} bills in cache; omnibus=${omnibus?.id}, regular=${regular?.id}, rep=${repId}`);
  const server = spawn('npx', ['serve', '.', '--listen', String(PORT)], { cwd: ROOT, shell: true, stdio: 'ignore' });
  if (!await waitForServer(BASE + '/')) { console.error('server failed to start'); server.kill(); process.exit(1); }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));

  const go = async url => { await page.goto(BASE + url, { waitUntil: 'load', timeout: 20000 }); await page.waitForTimeout(700); };
  const count = sel => page.locator(sel).count();

  // ── Home ──
  console.log('\n— index');
  await go('/');
  check(await count('.bill-card') === BILLS, `bill cards render (== cache: ${BILLS})`);
  check(await count('.rep-strip-card') > 0, 'rep strip populated');
  check(await count('.shock-quote-card') > 0, 'shock-quote carousel populated');
  check(await count('[data-main]') === 4, 'four filter tabs');
  // interactions: filter switch + card expand + theme round-trip
  const filtered = await page.evaluate(() => {
    document.querySelector('[data-main="pipeline"]')?.click();
    const n = document.querySelectorAll('.bill-card').length;
    document.querySelector('[data-main="recent"]')?.click();
    return n;
  });
  check(filtered > 0 && filtered < BILLS, `pipeline filter re-renders (${filtered} of ${BILLS})`);
  const theme = await page.evaluate(() => {
    toggleTheme(false);
    const light = document.documentElement.getAttribute('data-theme') === 'light' && document.querySelector('.logo-img')?.src.endsWith('logo.svg');
    toggleTheme(true);
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' && document.querySelector('.logo-img')?.src.endsWith('logo-dark.svg');
    return light && dark;
  });
  check(theme, 'theme round-trips light↔dark with logo swap');

  // ── Bills page ──
  console.log('— bills');
  await go('/bills.html');
  check(await count('.bill-card') === BILLS, 'bill cards render');
  check(await count('.shock-quote-card') === 0, 'carousel suppressed on bills page');

  // ── Bill pages ──
  if (regular) {
    console.log(`— bill (regular: ${regular.id})`);
    await go(`/bill?id=${regular.id}`);
    check(await count('.bill-card') === 1, 'bill card renders');
    check(await count('.bt-section[id], .bt-title[id]') > 0, 'bill-text anchors present');
  }
  if (omnibus) {
    console.log(`— bill (omnibus: ${omnibus.id})`);
    await go(`/bill?id=${omnibus.id}`);
    check(await count('.bt-division[id]') > 0, 'bt-div division anchors present');
    check(await count('.status-omnibus') > 0, 'OMNIBUS badge shown');
  }

  // ── Floor / Reps / Rep / Favorites ──
  console.log('— floor');
  await go('/floor.html');
  check(await count('.floor-entry, [class*="quote-entry"], .fq-entry') > 0, 'floor quote entries render');

  console.log('— reps');
  await go('/reps.html');
  check(await count('.reps-rep-card') > 400, 'reps library populated (>400 members)');

  if (repId) {
    console.log(`— rep (${repId})`);
    await go(`/rep?id=${repId}&ref=reps`);
    check((await page.locator('h1, .rep-name').first().textContent() || '').trim().length > 0, 'rep name renders');
  }

  console.log('— favorites');
  await go('/favorites.html');
  check(await count('.section-label') > 0, 'saved view renders');

  // ── Static pages styled ──
  console.log('— static pages');
  for (const p of ['/privacy.html', '/terms.html', '/bill-pending.html']) {
    await go(p);
    const styled = await page.evaluate(() =>
      [...document.styleSheets].filter(s => (s.href || '').includes('styles-')).length === 3
      && getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)');
    check(styled, `${p} loads all 3 stylesheets and paints`);
  }

  // ── Mobile viewport ──
  console.log('— mobile 375px');
  await page.setViewportSize({ width: 375, height: 720 });
  await go('/');
  check(await count('.bill-card') === BILLS, 'mobile: bill cards render');
  check(await page.locator('[data-main]').first().isVisible(), 'mobile: filter tabs visible');

  // ── Console errors (favicon allowlisted) ──
  const errs = consoleErrors.filter(e => !/favicon\.ico/.test(e));
  check(errs.length === 0, errs.length ? `console errors: ${errs.slice(0, 3).join(' | ')}` : 'zero console errors across all pages');

  await browser.close();
  server.kill();
  console.log(`\n${failN === 0 ? '✅' : '❌'} smoke: ${passN} passed, ${failN} failed`);
  process.exit(failN === 0 ? 0 : 1);
})().catch(e => { console.error('smoke crashed:', e); process.exit(1); });
