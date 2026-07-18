#!/usr/bin/env node
// security-check.js — commit-time security gate for LegislationPatch.
//
// Scans every git-TRACKED file (not node_modules, not gitignored working files)
// for the security invariants this project has actually been bitten by or
// hardened against. See SECURITY.md for the invariant -> gate map.
//
//   ERRORS (exit 1, block the commit — no sanctioned bypass):
//     E1  secret-like value assigned in any tracked file (the hardcoded-key
//         class — a real GovInfo key shipped this way once; never again)
//     E2  a .env-style file is tracked by git
//     E3  an HTML page is missing the Content-Security-Policy meta tag,
//         or the policy has been weakened (unsafe-eval, extra script-src hosts)
//     E4  an HTML page is missing the no-referrer meta tag
//     E5  target="_blank" without rel noopener (reverse-tabnabbing)
//
//   WARNINGS (exit 0, informational — fix or annotate):
//     W1  .innerHTML / insertAdjacentHTML template-literal interpolation whose
//         expression doesn't visibly pass through a sanitizer (escHtml /
//         safeBioId / portraitUrl / encodeURIComponent / Number). Heuristic —
//         concatenation-style sinks are NOT covered (the hostile-payload test
//         + CSP are the blocking defense for the whole class). Suppress a
//         reviewed-safe line with an `// xss-ok` comment on or above it.
//
// Zero dependencies. Run directly:  node scripts/security-check.js
// Wired into: pre-commit hook (blocking), CI (blocking), npm test.

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Files this script must not scan: they intentionally contain the very
// patterns being detected (detection regexes, hostile test payloads).
const SELF_EXCLUDE = new Set([
  'scripts/security-check.js',
  'scripts/test-security-helpers.js',
]);

// Binary / non-text extensions — nothing to scan.
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.bundle',
]);

const errors = [];
const warnings = [];

function listTrackedFiles() {
  const out = execSync('git ls-files -z', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  return out.toString('utf8').split('\0').filter(Boolean);
}

const tracked = listTrackedFiles();
const textFiles = tracked.filter((f) =>
  !SELF_EXCLUDE.has(f) && !BINARY_EXT.has(path.extname(f).toLowerCase()));

function read(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
  catch (e) { return null; }
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

// ── E1: secret-like strings in tracked files ───────────────────────────────
// Two layers: provider-specific token shapes (high confidence), and generic
// `someKey = "longvalue"` assignments (placeholder-aware).

const PROVIDER_PATTERNS = [
  { name: 'Anthropic key',       re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI-style key',    re: /sk-[A-Za-z0-9]{40,}/g },
  { name: 'AWS access key',      re: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub token',        re: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'Google API key',      re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'Slack token',         re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  // Split so this file (if ever un-excluded) can't match itself.
  { name: 'Private key block',   re: new RegExp('-----BEGIN [A-Z ]*' + 'PRIVATE KEY-----', 'g') },
];

// Generic: KEY/TOKEN/SECRET/PASSWORD-ish name = 'value of 20+ token chars'.
// api.data.gov keys (the class that actually leaked) are 40-char alphanumeric.
const GENERIC_SECRET = /\b[A-Za-z0-9_.]*(?:api[_-]?key|apikey|token|secret|passw(?:or)?d)\b['"]?\s*[:=]\s*['"]([A-Za-z0-9+/_-]{20,})['"]/gi;

// Values that are clearly placeholders, not live secrets. Deliberately narrow:
// a broad prefix list (e.g. "abc") would excuse real random keys that happen
// to start with it. Placeholders must LOOK like placeholders.
const PLACEHOLDER = /^(?:your[_-]|my[_-]|xxx|test[_-]|dummy|sample|example|placeholder|replace[_-]?me|insert[_-]|redacted|removed)|(?:[_-]here|[_-]removed|[_-]redacted|example)$|^(?:x{8,}|a{8,}|0{8,})$/i;

for (const f of textFiles) {
  const content = read(f);
  if (content == null) continue;

  for (const { name, re } of PROVIDER_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      errors.push(`E1 ${f}:${lineOf(content, m.index)} — ${name} detected (${m[0].slice(0, 12)}…). Move it to .env and rotate it.`);
    }
  }

  GENERIC_SECRET.lastIndex = 0;
  let m;
  while ((m = GENERIC_SECRET.exec(content)) !== null) {
    if (PLACEHOLDER.test(m[1])) continue;
    errors.push(`E1 ${f}:${lineOf(content, m.index)} — secret-like assignment (value ${m[1].slice(0, 8)}…, ${m[1].length} chars). Keys live in .env only.`);
  }
}

// ── E2: env files must never be tracked ────────────────────────────────────
for (const f of tracked) {
  const base = path.basename(f);
  // .env.example/.sample/.template are legitimate tracked placeholders — their
  // CONTENTS are still covered by the E1 secret scan above.
  if (/^\.env\.(example|sample|template)$/.test(base)) continue;
  if (base === '.env' || base.endsWith('.env') || base.startsWith('.env.')) {
    errors.push(`E2 ${f} — env file is tracked by git. Untrack it (git rm --cached) and rotate anything in it.`);
  }
}

// ── E3 + E4: CSP and referrer meta on every HTML page ──────────────────────
// Presence alone is gameable — also assert the policy hasn't been weakened.
const htmlFiles = textFiles.filter((f) => f.endsWith('.html'));

for (const f of htmlFiles) {
  const content = read(f);
  if (content == null) continue;

  // NB: the policy itself contains single quotes ('self') — capture to the
  // matching outer delimiter, not to the first quote of either kind.
  const cspMatch = content.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(?:"([^"]+)"|'([^']+)')/i);
  if (!cspMatch) {
    errors.push(`E3 ${f} — missing Content-Security-Policy meta tag. Copy the policy from index.html <head>.`);
  } else {
    const policy = cspMatch[1] || cspMatch[2];
    if (!/default-src\s+'self'/.test(policy)) {
      errors.push(`E3 ${f} — CSP has no "default-src 'self'". The policy has been weakened.`);
    }
    if (/unsafe-eval/.test(policy)) {
      errors.push(`E3 ${f} — CSP contains 'unsafe-eval'. Never allowed here.`);
    }
    const scriptSrc = policy.match(/script-src\s+([^;]+)/);
    if (scriptSrc) {
      // Sole allowlisted external host: Cloudflare Web Analytics beacon (owner-approved 2026-07-17, see SECURITY.md invariant 2)
      const allowed = new Set(["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com"]);
      for (const tok of scriptSrc[1].trim().split(/\s+/)) {
        if (!allowed.has(tok)) {
          errors.push(`E3 ${f} — CSP script-src contains "${tok}". Only 'self', 'unsafe-inline', and the allowlisted Cloudflare analytics host are permitted; other external script hosts defeat the whole policy.`);
        }
      }
    } else {
      errors.push(`E3 ${f} — CSP has no explicit script-src directive.`);
    }
  }

  if (!/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i.test(content)) {
    errors.push(`E4 ${f} — missing <meta name="referrer" content="no-referrer">.`);
  }
}

// ── E5: target="_blank" needs noopener ─────────────────────────────────────
// Checked in HTML and JS-built markup alike: look for rel…noopener within the
// surrounding 300 chars (covers rel-before-target and rel-after-target).
for (const f of textFiles) {
  if (!/\.(html|js)$/.test(f)) continue;
  const content = read(f);
  if (content == null) continue;

  const re = /target=(?:\\?["'])_blank(?:\\?["'])/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const window = content.slice(Math.max(0, m.index - 300), m.index + 300);
    if (!/noopener/.test(window)) {
      errors.push(`E5 ${f}:${lineOf(content, m.index)} — target="_blank" without rel="noopener". Add rel="noopener noreferrer".`);
    }
  }
}

// ── W1: unsanitized template-literal interpolation into innerHTML ──────────
// Heuristic, warn-only. An interpolated expression is considered safe when it
// visibly passes through a sanitizer/encoder, or the line is annotated xss-ok.
const SANITIZERS = /\b(?:escHtml|safeBioId|portraitUrl|encodeURIComponent|Number|partyColor|formatDateCompact|formatDate)\s*\(|\bFALLBACK_PORTRAIT\b|\.length\b/;

for (const f of textFiles) {
  if (!f.endsWith('.js') || f.startsWith('scripts/')) continue; // browser code only — pipeline scripts have no DOM
  const content = read(f);
  if (content == null) continue;
  const lines = content.split('\n');

  const sinkRe = /\.(?:innerHTML\s*\+?=|insertAdjacentHTML\s*\()/g;
  let m;
  while ((m = sinkRe.exec(content)) !== null) {
    // Statement window: from the sink to the first line that ends in `;` (or 2500 chars).
    const rest = content.slice(m.index, m.index + 2500);
    const endMatch = rest.match(/;\s*\n/);
    const stmt = endMatch ? rest.slice(0, endMatch.index + 1) : rest;

    const startLine = lineOf(content, m.index);
    const stmtLineCount = stmt.split('\n').length;

    const interpRe = /\$\{([^}]+)\}/g;
    let im;
    while ((im = interpRe.exec(stmt)) !== null) {
      const expr = im[1];
      if (SANITIZERS.test(expr)) continue;

      // xss-ok suppression: on the interpolation's line, or the line above the sink.
      const interpLine = startLine + stmt.slice(0, im.index).split('\n').length - 1;
      const lineText = lines[interpLine - 1] || '';
      const prevText = lines[startLine - 2] || '';
      if (/xss-ok/.test(lineText) || /xss-ok/.test(prevText)) continue;

      warnings.push(`W1 ${f}:${interpLine} — \${${expr.trim().slice(0, 60)}} flows into ${stmt.includes('insertAdjacentHTML') ? 'insertAdjacentHTML' : 'innerHTML'} without a visible sanitizer. Wrap in escHtml()/safeBioId(), or annotate the line with // xss-ok after review.`);
    }
    sinkRe.lastIndex = m.index + Math.min(stmt.length, 1);
    void stmtLineCount;
  }
}

// ── report ──────────────────────────────────────────────────────────────────
console.log('security-check: scanned ' + textFiles.length + ' tracked files');
console.log('');

if (warnings.length) {
  console.log('── Warnings (advisory — fix or annotate // xss-ok after review)');
  for (const w of warnings) console.log('  ! ' + w);
  console.log('');
}

if (errors.length) {
  console.log('── ERRORS (blocking)');
  for (const e of errors) console.log('  X ' + e);
  console.log('');
  console.log(`X security-check: ${errors.length} error(s), ${warnings.length} warning(s) — commit BLOCKED.`);
  console.log('  There is no sanctioned bypass for security errors. Fix them.');
  process.exit(1);
}

console.log(`OK security-check: 0 errors, ${warnings.length} warning(s).`);
