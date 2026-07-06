// fetch-helpers.js — shared HTTP + HTML-cleaning helpers for pipeline scripts.
// Part of scripts/lib/ (B2 extraction, 2026-07-06). Canonical homes:
//   fetchWithRetry — was fetch_bills_data.js (the most complete implementation)
//   cleanHTML / cleanHTMLStructured — was batch_processor.js (decodes numeric
//     entities; fetch_bills_data's old flat copy did not — that was drift)
//   cleanBillHTML — was fetch_bills_data.js (bill-text format for renderBtLine)

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Resilient fetch — retries on network errors and HTTP 429/5xx with exponential
// backoff (honoring Retry-After when present). Returns a Response like fetch() does;
// callers still check res.ok for non-retryable 4xx. Throws only after exhausting tries.
// This is what makes a long sequential fetch survive Congress.gov rate-limiting
// instead of dying mid-run.
async function fetchWithRetry(url, { tries = 5, baseDelay = 2000, label = '' } = {}) {
    let lastErr;
    const tag = label || (typeof url === 'string' ? url.split('?')[0] : 'fetch');
    for (let attempt = 1; attempt <= tries; attempt++) {
        try {
            const res = await globalThis.fetch(url);
            if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
                const ra   = parseInt(res.headers.get('retry-after') || '', 10);
                const wait = Number.isFinite(ra) ? ra * 1000 : baseDelay * Math.pow(2, attempt - 1);
                if (attempt < tries) {
                    console.warn(`  [retry] ${tag} → HTTP ${res.status}; waiting ${Math.round(wait/1000)}s (attempt ${attempt}/${tries})`);
                    await sleep(wait);
                    continue;
                }
            }
            return res;
        } catch (e) {
            lastErr = e;
            const wait = baseDelay * Math.pow(2, attempt - 1);
            if (attempt < tries) {
                console.warn(`  [retry] ${tag} network error: ${e.message}; waiting ${Math.round(wait/1000)}s (attempt ${attempt}/${tries})`);
                await sleep(wait);
            }
        }
    }
    throw lastErr || new Error(`fetchWithRetry exhausted for ${tag}`);
}

// Flat clean — for short analysis text (CRS summaries, CR excerpts). Decodes
// numeric entities (&#8212; → —) so em-dashes etc. don't leak as literals.
function cleanHTML(html) {
    return html
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .replace(/\s+/g, ' ')
        .trim();
}

// Like cleanHTML but preserves paragraph structure by converting block-level closing
// tags to newlines before stripping. Used for committee reports where line breaks
// are needed to detect signature blocks at the end of views sections.
function cleanHTMLStructured(html) {
    return html
        .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Structure-preserving clean — for bill text saved to data/bill-text/*.txt
// Converts block-level HTML tags to newlines before stripping all other tags,
// matching the format expected by renderBillText / renderBtLine in bill.js.
function cleanBillHTML(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

module.exports = { sleep, fetchWithRetry, cleanHTML, cleanHTMLStructured, cleanBillHTML };
