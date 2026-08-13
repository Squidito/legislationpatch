#!/usr/bin/env node
// migrate-article-entities.js -- point every article at the site's canonical
// Person and Organization entities instead of carrying its own inline copy.
//
// THE PROBLEM THIS FIXES: all 46 articles shipped a duplicated author blob
// ({"@type":"Organization","name":"LegislationPatch"}) and an identical inline
// publisher. That is 46 unlinked author objects and no resolvable author entity
// -- and a generic organizational byline with no accountable human, which is
// both an authorship-transparency gap and the weakest possible E-E-A-T signal.
//
// AFTER: each article's JSON-LD references {"@id": ".../author/james-shearn#person"}
// and {"@id": ".../#organization"}. The FULL nodes live in exactly two places --
// author/<slug>/index.html (Person) and about.html (Organization). The visible
// byline becomes a linked human byline plus an AI-disclosure line.
//
// Identity comes from data/entity.json via lib/entity.js. Idempotent: running
// twice is a no-op. Dry-run by default per SCRIPT-CONVENTIONS.md section 4.
//
// Usage:
//   node scripts/migrate-article-entities.js           # dry run, report only
//   node scripts/migrate-article-entities.js --apply   # write the changes

'use strict';

const fs   = require('fs');
const path = require('path');

const entity = require('./lib/entity');
const { ARTICLES } = require('./lib/article-meta');

const args  = process.argv.slice(2);
const APPLY = args.includes('--apply');

const NOT_ARTICLES = new Set(['index.html']);

const PERSON = entity.person();
const ORG    = entity.organization();

// The visible byline the articles currently carry.
const OLD_BYLINE_RE = /<span>By LegislationPatch Team<\/span>/;

const NEW_BYLINE =
  `<span>By <a href="${PERSON.url}" rel="author">${PERSON.name}</a>, ${PERSON.jobTitle}</span>`;

// Disclosure sits at the end of the article body. Marked with a stable class so
// re-runs detect it rather than stacking duplicates.
const DISCLOSURE_CLASS = 'article-disclosure';
const DISCLOSURE_HTML =
`        <p class="${DISCLOSURE_CLASS}" style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border, rgba(128,128,128,0.25));font-size:0.85rem;opacity:0.8">Drafted from primary source documents by LegislationPatch's automated research pipeline, then reviewed, verified, and edited by <a href="${PERSON.url}" rel="author">${PERSON.name}</a>, ${PERSON.jobTitle}. Every figure and citation is checked against the official text before publication. See our <a href="/editorial-standards.html">editorial standards and AI disclosure</a>.</p>
`;

/**
 * Rewrite the author/publisher/image fields inside a JSON-LD script block,
 * preserving whether the original was pretty-printed or minified.
 */
function rewriteJsonLd(html, articleUrl) {
  let changed = false;
  const out = html.replace(
    /(<script[^>]+type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
    (full, open, body, close) => {
      let parsed;
      const raw = body.trim();
      try { parsed = JSON.parse(raw); } catch { return full; }

      const ARTICLE_TYPES = new Set(['Article', 'NewsArticle', 'BlogPosting', 'ReportageNewsArticle']);
      const nodes = Array.isArray(parsed['@graph']) ? parsed['@graph']
                  : Array.isArray(parsed) ? parsed
                  : [parsed];

      let touched = false;
      for (const node of nodes) {
        if (!node || !ARTICLE_TYPES.has(node['@type'])) continue;

        // author -> reference the canonical Person
        if (!node.author || node.author['@id'] !== PERSON.id) {
          node.author = { '@id': PERSON.id };
          touched = true;
        }
        // publisher -> reference the canonical Organization
        if (!node.publisher || node.publisher['@id'] !== ORG.id) {
          node.publisher = { '@id': ORG.id };
          touched = true;
        }
        // image is a documented Top-Stories/rich-result requirement
        if (!node.image) {
          node.image = ORG.logo;
          touched = true;
        }
        // mainEntityOfPage ties the Article node to its own URL
        if (!node.mainEntityOfPage && (node.url || articleUrl)) {
          node.mainEntityOfPage = { '@type': 'WebPage', '@id': node.url || articleUrl };
          touched = true;
        }
      }

      if (!touched) return full;
      changed = true;

      // Preserve the file's existing formatting style.
      const wasMinified = !/\n/.test(raw);
      const serialized = wasMinified
        ? JSON.stringify(parsed)
        : JSON.stringify(parsed, null, 2);
      return open + (wasMinified ? serialized : '\n  ' + serialized + '\n  ') + close;
    }
  );
  return { html: out, changed };
}

function migrateOne(file) {
  const full = path.join(ARTICLES, file);
  const original = fs.readFileSync(full, 'utf8');
  let html = original;
  const actions = [];

  const articleUrl = `${entity.site().baseUrl}/articles/${file}`;

  // 1. JSON-LD entity references
  const ld = rewriteJsonLd(html, articleUrl);
  if (ld.changed) { html = ld.html; actions.push('schema'); }

  // 2. Visible byline
  if (OLD_BYLINE_RE.test(html)) {
    html = html.replace(OLD_BYLINE_RE, NEW_BYLINE);
    actions.push('byline');
  }

  // 3. AI disclosure line at the end of the article body.
  //    Anchor = the </div> that closes .article-body, i.e. the last one before
  //    </article>. Whitespace between them varies per file, so match loosely.
  if (!html.includes(DISCLOSURE_CLASS)) {
    const closeRe = /([ \t]*)<\/div>(\s*)<\/article>/;
    if (closeRe.test(html)) {
      html = html.replace(closeRe, (m, indent, gap) => `${DISCLOSURE_HTML}${indent}</div>${gap}</article>`);
      actions.push('disclosure');
    } else {
      actions.push('disclosure-SKIPPED(no .article-body close found)');
    }
  }

  return { file, actions, html, changed: html !== original };
}

function main() {
  const files = fs.readdirSync(ARTICLES)
    .filter(f => f.endsWith('.html') && !NOT_ARTICLES.has(f))
    .sort();

  let changedCount = 0;
  const skipped = [];

  for (const file of files) {
    const r = migrateOne(file);
    if (!r.changed) continue;
    changedCount++;
    if (r.actions.some(a => a.includes('SKIPPED'))) skipped.push(r.file);
    console.log(`  ${APPLY ? 'wrote' : 'would change'} ${file} [${r.actions.join(', ')}]`);
    if (APPLY) fs.writeFileSync(path.join(ARTICLES, file), r.html);
  }

  console.log('');
  console.log(`migrate-article-entities: ${changedCount}/${files.length} articles ${APPLY ? 'updated' : 'need updating'}`);
  console.log(`  author    -> ${PERSON.id}`);
  console.log(`  publisher -> ${ORG.id}`);
  if (skipped.length) {
    console.log(`  ⚠️  disclosure not inserted (unexpected markup): ${skipped.join(', ')}`);
  }
  if (!APPLY && changedCount) {
    console.log('');
    console.log('Dry run. Re-run with --apply to write.');
  }
}

main();
