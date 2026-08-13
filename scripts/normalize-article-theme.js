#!/usr/bin/env node
// normalize-article-theme.js -- make articles default to DARK, matching the
// rest of the site.
//
// THE BUG: every page under articles/ defaults to LIGHT, while every root page
// (index, bills, about, floor, rep...) defaults to DARK. A visitor arriving on
// an article from search gets a light page, clicks through to the homepage, and
// it flips. Nothing is broken; it just reads as unpolished, and articles are the
// most common search entry point.
//
// CAUSE: the theme init tests `=== 'dark'` (opt IN to dark) instead of
// `!== 'light'` (opt OUT of dark). Root pages already use the latter.
//
// Two formattings exist across the 47 files -- pretty and minified -- and both
// carry the same three expressions. All are rewritten.
//
// Idempotent; dry-run by default per SCRIPT-CONVENTIONS.md section 4.
//
// Usage:
//   node scripts/normalize-article-theme.js
//   node scripts/normalize-article-theme.js --apply

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const ARTICLES = path.join(ROOT, 'articles');

const args  = process.argv.slice(2);
const APPLY = args.includes('--apply');

// Ordered, literal replacements. Each flips an opt-IN-to-dark test into an
// opt-OUT-of-dark test, which is what every root page already does.
const RULES = [
  // pre-paint init -- pretty
  {
    from: "if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');",
    to:   "if (t !== 'light') document.documentElement.setAttribute('data-theme', 'dark');",
    label: 'pre-paint (pretty)',
  },
  // pre-paint init -- minified
  {
    from: "if(t==='dark')document.documentElement.setAttribute('data-theme','dark');",
    to:   "if(t!=='light')document.documentElement.setAttribute('data-theme','dark');",
    label: 'pre-paint (min)',
  },
  // toggle-state sync -- pretty
  {
    from: "var isDark = localStorage.getItem('lpTheme') === 'dark'",
    to:   "var isDark = localStorage.getItem('lpTheme') !== 'light'",
    label: 'toggle state (pretty)',
  },
  // toggle-state sync -- minified
  {
    from: "var isDark=localStorage.getItem('lpTheme')==='dark'",
    to:   "var isDark=localStorage.getItem('lpTheme')!=='light'",
    label: 'toggle state (min)',
  },
];

function migrate(file) {
  const full = path.join(ARTICLES, file);
  const original = fs.readFileSync(full, 'utf8');
  let html = original;
  const applied = [];

  for (const rule of RULES) {
    if (html.includes(rule.from)) {
      html = html.split(rule.from).join(rule.to);
      applied.push(rule.label);
    }
  }

  return { file, applied, html, changed: html !== original };
}

function main() {
  const files = fs.readdirSync(ARTICLES).filter(f => f.endsWith('.html')).sort();

  let changed = 0;
  const untouched = [];

  for (const file of files) {
    const r = migrate(file);
    if (!r.changed) { untouched.push(file); continue; }
    changed++;
    console.log(`  ${APPLY ? 'wrote' : 'would change'} ${file} [${r.applied.join(', ')}]`);
    if (APPLY) fs.writeFileSync(path.join(ARTICLES, file), r.html);
  }

  console.log('');
  console.log(`normalize-article-theme: ${changed}/${files.length} file(s) ${APPLY ? 'updated' : 'need updating'}`);
  if (untouched.length && changed) {
    console.log(`  already dark-default: ${untouched.length}`);
  }
  if (!APPLY && changed) console.log('\nDry run. Re-run with --apply to write.');
}

main();
