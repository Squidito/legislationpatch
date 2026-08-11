#!/usr/bin/env node
// qa-metrics-render.js — render a self-contained HTML dashboard from the metrics history.
// Deterministic, ZERO LLM cost.
//
//   npm run qa-metrics:render     → write data/qa-metrics/dashboard.html (open in a browser)

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'data', 'qa-metrics');
const HIST = path.join(DIR, 'history.jsonl');
const OUT = path.join(DIR, 'dashboard.html');

if (!fs.existsSync(HIST)) { console.error('  No history. Run `npm run qa-metrics` first.'); process.exit(1); }
const snaps = fs.readFileSync(HIST, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean).sort((a, b) => a.date < b.date ? -1 : 1);
const cur = snaps[snaps.length - 1];
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// tiny inline SVG line chart of a numeric series over the snapshots
function chart(series, color, max) {
  const W = 560, H = 90, pad = 6;
  if (snaps.length < 2) return `<div class="nochart">need ≥2 snapshots for a trend — accrues as you run \`npm run qa-metrics\` over time</div>`;
  const mx = max || Math.max(1, ...series);
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (W - 2 * pad);
    const y = H - pad - (v / mx) * (H - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const dots = series.map((v, i) => { const x = pad + (i / (series.length - 1)) * (W - 2 * pad); const y = H - pad - (v / mx) * (H - 2 * pad); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}"/>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>${dots}</svg>`;
}

const byType = Object.entries(cur.byType || {}).sort((a, b) => b[1] - a[1]);
const maxType = Math.max(1, ...byType.map(([, n]) => n));
const typeRows = byType.map(([t, n]) => `<tr><td>${esc(t)}</td><td class="num">${n}</td><td class="barcell"><span class="bar" style="width:${Math.round(n / maxType * 100)}%"></span></td></tr>`).join('');

const snapRows = snaps.slice().reverse().map(s => `<tr><td>${esc(s.date)}</td><td class="num">${s.coveragePct}%</td><td class="num">${s.liveMaterial}</td><td class="num">${s.liveMinor}</td><td class="num">${s.materialRate}%</td></tr>`).join('');

const html = `<title>LegislationPatch — QA Metrics</title>
<style>
  :root{--bg:#fff;--fg:#111;--muted:#666;--card:#f6f7f9;--line:#e3e6ea;--good:#178a4c;--accent:#2f6feb;--warn:#b26a00}
  @media (prefers-color-scheme:dark){:root{--bg:#0f1216;--fg:#e8eaed;--muted:#9aa1a9;--card:#171b21;--line:#262c34;--good:#3fbf74;--accent:#5b9bff;--warn:#e0a44a}}
  :root[data-theme=dark]{--bg:#0f1216;--fg:#e8eaed;--muted:#9aa1a9;--card:#171b21;--line:#262c34;--good:#3fbf74;--accent:#5b9bff;--warn:#e0a44a}
  :root[data-theme=light]{--bg:#fff;--fg:#111;--muted:#666;--card:#f6f7f9;--line:#e3e6ea;--good:#178a4c;--accent:#2f6feb;--warn:#b26a00}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .wrap{max-width:780px;margin:0 auto;padding:28px 20px 48px}
  h1{font-size:20px;margin:0 0 2px}.sub{color:var(--muted);font-size:13px;margin-bottom:22px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
  .tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
  .tile .k{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
  .tile .v{font-size:28px;font-weight:700;margin-top:4px}.tile .v.good{color:var(--good)}.tile .v.warn{color:var(--warn)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:20px}
  .card h2{font-size:14px;margin:0 0 12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  table{width:100%;border-collapse:collapse}td,th{padding:5px 8px;text-align:left;border-bottom:1px solid var(--line);font-size:14px}
  th{color:var(--muted);font-weight:600;font-size:12px}.num{text-align:right;font-variant-numeric:tabular-nums}
  .barcell{width:45%}.bar{display:inline-block;height:9px;border-radius:5px;background:var(--accent);opacity:.75}
  .nochart{color:var(--muted);font-size:13px;padding:8px 0}
  svg{display:block;overflow:visible}.legend{color:var(--muted);font-size:12px;margin-top:6px}
</style>
<div class="wrap">
  <h1>LegislationPatch — QA Accuracy Dashboard</h1>
  <div class="sub">rubric v1.0 · latest snapshot ${esc(cur.date)} · ${snaps.length} snapshot(s) · deterministic (no LLM)</div>
  <div class="tiles">
    <div class="tile"><div class="k">Coverage</div><div class="v">${cur.coveragePct}%</div><div class="sub" style="margin:0">${cur.fullClaimsAudited}/${cur.total} bills audited</div></div>
    <div class="tile"><div class="k">Live material errors</div><div class="v ${cur.liveMaterial === 0 ? 'good' : 'warn'}">${cur.liveMaterial}</div><div class="sub" style="margin:0">over ${cur.loggedClaims} claims</div></div>
    <div class="tile"><div class="k">Material rate</div><div class="v ${cur.materialRate === 0 ? 'good' : 'warn'}">${cur.materialRate}%</div></div>
    <div class="tile"><div class="k">Minor (style debt)</div><div class="v">${cur.liveMinor}</div></div>
  </div>
  <div class="card"><h2>Coverage over time</h2>${chart(snaps.map(s => s.coveragePct), 'var(--accent)', 100)}<div class="legend">coverage %</div></div>
  <div class="card"><h2>Material-error rate over time</h2>${chart(snaps.map(s => s.materialRate), 'var(--warn)')}<div class="legend">material errors ÷ claims (%) — lower is better</div></div>
  <div class="card"><h2>Open items by type (latest)</h2><table><thead><tr><th>type</th><th class="num">count</th><th></th></tr></thead><tbody>${typeRows || '<tr><td colspan=3 class="nochart">none</td></tr>'}</tbody></table></div>
  <div class="card"><h2>Snapshot history</h2><table><thead><tr><th>date</th><th class="num">coverage</th><th class="num">material</th><th class="num">minor</th><th class="num">mat-rate</th></tr></thead><tbody>${snapRows}</tbody></table></div>
</div>`;

fs.writeFileSync(OUT, html);
console.log(`\n  qa-metrics: dashboard → data/qa-metrics/dashboard.html (${snaps.length} snapshot(s))\n`);
