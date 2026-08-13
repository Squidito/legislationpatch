#!/usr/bin/env node
// indexnow-ping.js -- notify IndexNow-participating engines that URLs changed.
//
// WHAT THIS IS: IndexNow is a free push protocol. Instead of waiting to be
// crawled, you tell the engine a URL changed and it fetches promptly. Bing,
// Yandex, Naver and Seznam participate; submitting to any one endpoint shares
// the notification with the others.
//
// WHAT IT IS NOT: Google does NOT support IndexNow and has said it is not
// planning to. This does nothing for Google rankings or Google News. It is
// worth running because it is free and covers the non-Google engines, but the
// Google speed path is the news sitemap + being crawlable, not this.
//
// SETUP (one time):
//   1. node scripts/indexnow-ping.js --init    -> writes the key file to the repo root
//   2. Deploy so the key file is reachable at https://legislationpatch.com/<key>.txt
//   3. Only then will pings be accepted.
//
// Usage:
//   node scripts/indexnow-ping.js --init                  # create the key file
//   node scripts/indexnow-ping.js --url /articles/x.html  # dry run (prints payload)
//   node scripts/indexnow-ping.js --url /articles/x.html --apply
//   node scripts/indexnow-ping.js --since 2026-08-13 --apply   # every article modified on/after
//
// Dry-run by default: this is an OUTWARD-FACING call that publishes URLs to a
// third party, so it never fires without --apply.

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const entity = require('./lib/entity');
const { allArticles } = require('./lib/article-meta');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const opt  = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

const APPLY    = flag('apply');
const INIT     = flag('init');
const KEY_FILE = path.join(ROOT, 'data', 'indexnow-key.txt');
const ENDPOINT = 'https://api.indexnow.org/indexnow';

function loadOrCreateKey(create) {
  if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, 'utf8').trim();
  if (!create) return null;
  const key = crypto.randomBytes(16).toString('hex');
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, key + '\n');
  return key;
}

function doInit() {
  const key = loadOrCreateKey(true);
  const publicFile = path.join(ROOT, `${key}.txt`);
  fs.writeFileSync(publicFile, key);
  console.log('indexnow: key generated');
  console.log(`  secret copy : data/indexnow-key.txt`);
  console.log(`  public file : ${key}.txt  (must deploy to the site root)`);
  console.log('');
  console.log('Next: deploy, then confirm the key is reachable at');
  console.log(`  ${entity.site().baseUrl}/${key}.txt`);
  console.log('Pings are rejected until that file is live.');
}

async function main() {
  if (INIT) return doInit();

  const site = entity.site();
  const BASE = site.baseUrl;
  const host = new URL(BASE).host;

  const key = loadOrCreateKey(false);
  if (!key) {
    console.error('indexnow: no key yet. Run: node scripts/indexnow-ping.js --init');
    process.exit(1);
  }

  // Build the URL list
  let urls = [];
  const single = opt('url');
  const since  = opt('since');

  if (single) {
    urls = [single.startsWith('http') ? single : BASE + (single.startsWith('/') ? single : '/' + single)];
  } else if (since) {
    urls = allArticles()
      .filter(a => a.dateModified && a.dateModified >= since)
      .map(a => `${BASE}${a.url}`);
  } else {
    console.error('indexnow: pass --url <path> or --since <YYYY-MM-DD> (or --init)');
    process.exit(1);
  }

  if (!urls.length) {
    console.log('indexnow: nothing to submit');
    return;
  }
  // IndexNow caps a batch at 10,000 URLs.
  if (urls.length > 10000) urls = urls.slice(0, 10000);

  const payload = { host, key, keyLocation: `${BASE}/${key}.txt`, urlList: urls };

  console.log(`indexnow: ${urls.length} URL(s) for ${host}`);
  for (const u of urls.slice(0, 20)) console.log(`  ${u}`);
  if (urls.length > 20) console.log(`  ... and ${urls.length - 20} more`);

  if (!APPLY) {
    console.log('');
    console.log('Dry run — nothing sent. Re-run with --apply to submit.');
    return;
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  // 200 = accepted, 202 = accepted pending key validation.
  if (res.status === 200 || res.status === 202) {
    console.log(`indexnow: submitted (HTTP ${res.status})`);
  } else {
    console.error(`indexnow: FAILED (HTTP ${res.status}) — ${await res.text()}`);
    process.exit(1);
  }
}

main().catch(e => { console.error('indexnow:', e.message); process.exit(1); });
