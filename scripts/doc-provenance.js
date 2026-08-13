#!/usr/bin/env node
// doc-provenance.js -- catch self-descriptive prose drifting from the code it
// describes.
//
// THE PROBLEM: articles/methodology.html described a verification process that
// had since changed, and nothing noticed. As the site adds explainer and trust
// pages, that surface grows and the drift compounds silently. A stale page that
// describes how the site works is worse than no page: it is a false claim about
// our own process, on a site whose entire pitch is accuracy.
//
// THE MECHANISM: the same one data/qa-provenance.json already uses for bills --
// stamp a hash of the SOURCE, and re-trigger review when the source changes.
// Here the "source" is the set of files whose behaviour the prose describes.
//
// WHY WHOLE-FILE HASHES (deliberately noisy): a cosmetic edit to
// validate-batch.js will flag editorial-standards.html even though nothing
// user-visible changed. That false positive costs ~30 seconds to clear. A false
// NEGATIVE is the exact failure this exists to prevent. Noisy-but-safe wins.
//
// WHY THE claims[] FIELD: "go re-read the doc" reliably degrades into a rubber
// stamp. Each entry lists the specific assertions the prose makes, so a drift
// review is a checklist of falsifiable statements rather than a vibe check.
//
// Usage:
//   node scripts/doc-provenance.js              # check; exit 1 if any doc drifted
//   node scripts/doc-provenance.js --stamp      # record current state (AFTER re-reading)
//   node scripts/doc-provenance.js --stamp --doc editorial-standards.html
//   node scripts/doc-provenance.js --list       # show the registry

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(ROOT, 'data', 'doc-provenance.json');

const args  = process.argv.slice(2);
const flag  = name => args.includes(`--${name}`);
const opt   = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

const STAMP = flag('stamp');
const LIST  = flag('list');
const ONLY  = opt('doc');

function loadRegistry() {
  if (!fs.existsSync(REGISTRY)) {
    console.error(`doc-provenance: missing ${path.relative(ROOT, REGISTRY)}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
}

/** Combined hash over the described files, in registry order. Missing file = hard error. */
function describedHash(describes) {
  const h = crypto.createHash('sha256');
  const missing = [];
  for (const rel of describes) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) { missing.push(rel); continue; }
    h.update(rel);
    h.update(fs.readFileSync(full));
  }
  return { sha: h.digest('hex').slice(0, 16), missing };
}

/**
 * Check every registered doc. Returns { drifted[], missing[], ok }.
 * Exported so validate-batch.js can render it as a normal check section.
 */
function check() {
  const reg = loadRegistry();
  const docs = Object.entries(reg).filter(([k]) => !k.startsWith('_'));

  const drifted = [];
  const brokenRefs = [];
  let ok = 0;

  for (const [doc, meta] of docs) {
    if (ONLY && doc !== ONLY) continue;
    const docPath = path.join(ROOT, doc);
    if (!fs.existsSync(docPath)) {
      brokenRefs.push({ doc, problem: 'the documented page itself is missing' });
      continue;
    }
    const { sha, missing } = describedHash(meta.describes || []);
    if (missing.length) {
      brokenRefs.push({ doc, problem: `describes files that no longer exist: ${missing.join(', ')}` });
    }
    if (sha !== meta.sha) {
      drifted.push({ doc, meta, was: meta.sha, now: sha });
    } else {
      ok++;
    }
  }
  return { drifted, brokenRefs, ok, total: docs.length };
}

function doStamp() {
  const reg = loadRegistry();
  const today = new Date().toISOString().slice(0, 10);
  let stamped = 0;

  for (const [doc, meta] of Object.entries(reg)) {
    if (doc.startsWith('_')) continue;
    if (ONLY && doc !== ONLY) continue;
    const { sha } = describedHash(meta.describes || []);
    if (sha !== meta.sha) {
      meta.sha = sha;
      meta.reviewedAt = today;
      stamped++;
      console.log(`  stamped ${doc} -> ${sha} (${today})`);
    }
  }

  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
  console.log(`doc-provenance: ${stamped} doc(s) re-stamped`);
  if (stamped) {
    console.log('');
    console.log('  Stamping records that a HUMAN re-read the page and confirmed its');
    console.log('  claims still hold. If you did not actually re-read it, this gate');
    console.log('  just became decorative.');
  }
}

function doList() {
  const reg = loadRegistry();
  for (const [doc, meta] of Object.entries(reg)) {
    if (doc.startsWith('_')) continue;
    console.log(`\n${doc}`);
    console.log(`  reviewed : ${meta.reviewedAt}`);
    console.log(`  describes: ${(meta.describes || []).join(', ')}`);
    console.log(`  claims   : ${(meta.claims || []).length}`);
  }
}

function main() {
  if (LIST)  return doList();
  if (STAMP) return doStamp();

  const { drifted, brokenRefs, ok, total } = check();

  for (const b of brokenRefs) {
    console.log(`  ⚠️  ${b.doc}: ${b.problem}`);
  }

  if (!drifted.length && !brokenRefs.length) {
    console.log(`  ✅ All ${total} self-descriptive page(s) match the code they describe`);
    return;
  }

  for (const d of drifted) {
    console.log('');
    console.log(`  ⚠️  ${d.doc} describes code that has CHANGED since it was last reviewed`);
    console.log(`      last reviewed: ${d.meta.reviewedAt}`);
    console.log(`      changed files: ${(d.meta.describes || []).join(', ')}`);
    if (d.meta.claims && d.meta.claims.length) {
      console.log(`      re-verify these claims against the current code:`);
      for (const c of d.meta.claims) console.log(`        - ${c}`);
    }
    console.log(`      then: node scripts/doc-provenance.js --stamp --doc ${d.doc}`);
  }

  console.log('');
  console.log(`  ${drifted.length} page(s) need re-review, ${ok} current`);
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { check, describedHash };
