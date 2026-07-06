// config.js — central env/key/path configuration for pipeline scripts.
// Part of scripts/lib/ (B2 extraction, 2026-07-06). Scripts are migrating to
// this incrementally — new code should import from here instead of re-reading
// process.env locally.

require('dotenv').config();
const path = require('path');

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const GOVINFO_API_KEY  = process.env.GOVINFO_API_KEY || '';
const CONGRESS_SESSION = parseInt(process.env.CONGRESS_SESSION || '119', 10);

const DATA_DIR      = path.join(__dirname, '../../data');
const CACHE_FILE    = path.join(DATA_DIR, 'cache.json');
const BILL_TEXT_DIR = path.join(DATA_DIR, 'bill-text');

// Fail fast with a clear message instead of a mysterious fetch error 200 lines later.
function validateKeys(need = ['CONGRESS_API_KEY']) {
    const missing = need.filter(k => !module.exports[k]);
    if (missing.length) throw new Error(`Missing in .env: ${missing.join(', ')}`);
}

module.exports = { CONGRESS_API_KEY, GOVINFO_API_KEY, CONGRESS_SESSION, DATA_DIR, CACHE_FILE, BILL_TEXT_DIR, validateKeys };
