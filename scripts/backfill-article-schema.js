#!/usr/bin/env node
// backfill-article-schema.js — one-time schema backfill for pre-lane articles.
//
//   node scripts/backfill-article-schema.js            (dry run — prints per-file plan)
//   node scripts/backfill-article-schema.js --apply
//
// The article template gained breadcrumb/about/citation JSON-LD on 2026-08-17
// (first explainer's pre-ping scrutiny pass), which future articles inherit.
// The 40+ articles written before it carry the same gap this backfills:
//
//   breadcrumb — derived from the article's OWN visible breadcrumb nav. Mirrors
//                what the page already shows; invents nothing.
//   about      — from the VERIFIED_ABOUT map below. Every sameAs URL in it was
//                fetch-verified 200 on 2026-08-17 before being committed here.
//                Meta pages (about the site itself) reference the canonical
//                Organization node by @id. Articles that already carry `about`
//                (the SEO-era trackers, LegislativeAction form) are untouched.
//   citation   — lifted from the article's OWN "Primary Sources" box: the links
//                the page already shows readers, restated in schema form. An
//                article with no source box gets no citation.
//
// Idempotent: every field is only added where missing; dateModified is never
// touched (schema metadata is not a content change). NewsArticle pages
// (dispatches) are skipped entirely.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'articles');
const APPLY = process.argv.includes('--apply');

const WIKI = 'https://en.wikipedia.org/wiki/';

// slug -> [name, wikipedia title]. Every URL fetch-verified 200 on 2026-08-17.
const VERIFIED_ABOUT = {
    '119th-congress-tracker': ['119th United States Congress', '119th_United_States_Congress'],
    'appropriations-process': ['United States budget process', 'United_States_budget_process'],
    'bill-numbering': ['Bill (United States Congress)', 'Bill_(United_States_Congress)'],
    'budget-reconciliation': ['Budget reconciliation', 'Reconciliation_(United_States_Congress)'],
    'cloture-60-vote': ['Cloture', 'Cloture'],
    'congressional-oversight': ['Congressional oversight', 'Congressional_oversight'],
    'congressional-review-act': ['Congressional Review Act', 'Congressional_Review_Act'],
    'continuing-resolution': ['Continuing resolution', 'Continuing_resolution'],
    'discharge-petition': ['Discharge petition', 'Discharge_petition'],
    'fisa-history': ['Foreign Intelligence Surveillance Act', 'Foreign_Intelligence_Surveillance_Act'],
    'fisa-surveillance-tracker': ['Foreign Intelligence Surveillance Act', 'Foreign_Intelligence_Surveillance_Act'],
    'government-shutdown': ['Government shutdowns in the United States', 'Government_shutdowns_in_the_United_States'],
    'house-rules-committee': ['United States House Committee on Rules', 'United_States_House_Committee_on_Rules'],
    'how-a-bill-becomes-law': ['Act of Congress', 'Act_of_Congress'],
    'how-to-read-a-bill': ['Bill (United States Congress)', 'Bill_(United_States_Congress)'],
    'impoundment-rescission': ['Impoundment of appropriated funds', 'Impoundment_of_appropriated_funds'],
    'joint-resolution': ['Joint resolution', 'Joint_resolution'],
    'legislative-stages': ['Procedures of the United States Congress', 'Procedures_of_the_United_States_Congress'],
    'pocket-veto': ['Pocket veto', 'Pocket_veto'],
    'presidential-veto': ['Veto power in the United States', 'Veto_power_in_the_United_States'],
    'senate-filibuster': ['Filibuster in the United States Senate', 'Filibuster_in_the_United_States_Senate'],
    'signing-statements': ['Signing statement', 'Signing_statement'],
    'unanimous-consent': ['Unanimous consent', 'Unanimous_consent'],
    'voice-vote-vs-roll-call': ['Voice vote', 'Voice_vote'],
    'what-is-a-committee': ['United States congressional committee', 'United_States_congressional_committee'],
    'what-is-cbo': ['Congressional Budget Office', 'Congressional_Budget_Office'],
    'what-is-congressional-record': ['Congressional Record', 'Congressional_Record'],
};

// Pages about the site itself: `about` is the canonical Organization node.
const META_PAGES = new Set([
    'what-is-legislationpatch', 'no-editorial-spin', 'how-we-source-quotes',
    'how-we-track-voting', 'plain-english-government', 'legislationpatch-and-ai',
    'methodology',
]);

const decode = (s) => s
    .replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function breadcrumbLabel(html) {
    const nav = html.match(/<nav class="article-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/);
    if (!nav) return null;
    const parts = nav[1].replace(/<[^>]+>/g, '|').split('|').map(s => s.trim()).filter(Boolean);
    return parts.length ? decode(parts[parts.length - 1]) : null;
}

function sourceBoxCitations(html) {
    const box = html.match(/article-source-box[\s\S]*?<ul>([\s\S]*?)<\/ul>/);
    if (!box) return null;
    const out = [];
    const re = /<a href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(box[1])) !== null) {
        const name = decode(m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
        if (name) out.push({ '@type': 'CreativeWork', name, url: m[1] });
    }
    if (!out.length) return null;
    return out.length === 1 ? out[0] : out;
}

let changed = 0, skipped = 0, warned = 0;

for (const f of fs.readdirSync(ART).sort()) {
    if (!f.endsWith('.html') || f === 'index.html') continue;
    const slug = f.replace(/\.html$/, '');
    const abs = path.join(ART, f);
    const html = fs.readFileSync(abs, 'utf8');

    const ldMatch = html.match(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/);
    if (!ldMatch) { console.log(`  ⚠ ${slug}: no JSON-LD block — skipped`); warned++; continue; }
    let ld;
    try { ld = JSON.parse(ldMatch[2]); } catch (e) { console.log(`  ⚠ ${slug}: JSON-LD does not parse — skipped`); warned++; continue; }
    if (ld['@type'] === 'NewsArticle') { skipped++; continue; }

    const adds = [];

    if (!ld.breadcrumb) {
        const label = breadcrumbLabel(html);
        if (label) {
            ld.breadcrumb = {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://legislationpatch.com/' },
                    { '@type': 'ListItem', position: 2, name: 'Articles', item: 'https://legislationpatch.com/articles/' },
                    { '@type': 'ListItem', position: 3, name: label },
                ],
            };
            adds.push('breadcrumb');
        } else { console.log(`  ⚠ ${slug}: no visible breadcrumb nav to derive from`); warned++; }
    }

    if (!ld.about) {
        if (META_PAGES.has(slug)) {
            ld.about = { '@id': 'https://legislationpatch.com/#organization' };
            adds.push('about(org)');
        } else if (VERIFIED_ABOUT[slug]) {
            const [name, title] = VERIFIED_ABOUT[slug];
            ld.about = { '@type': 'Thing', name, sameAs: WIKI + title };
            adds.push('about');
        }
    }

    if (!ld.citation) {
        const cit = sourceBoxCitations(html);
        if (cit) { ld.citation = cit; adds.push(`citation(${Array.isArray(cit) ? cit.length : 1})`); }
    }

    if (!adds.length) { skipped++; continue; }

    const serialized = '\n  ' + JSON.stringify(ld, null, 2).replace(/\n/g, '\n  ') + '\n  ';
    const next = html.replace(ldMatch[0], ldMatch[1] + serialized + ldMatch[3]);
    // Read-back guard: the block we wrote must parse to the object we meant.
    const check = next.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (JSON.stringify(JSON.parse(check[1])) !== JSON.stringify(ld)) {
        console.log(`  ❌ ${slug}: serialization round-trip mismatch — not written`);
        process.exitCode = 1; continue;
    }
    if (APPLY) fs.writeFileSync(abs, next, 'utf8');
    console.log(`  ${APPLY ? '✅' : '·'} ${slug}: +${adds.join(' +')}`);
    changed++;
}

console.log(`\n  ${APPLY ? 'Applied' : 'Would apply (dry run — add --apply)'}: ${changed} file(s) changed, ${skipped} already complete/skipped, ${warned} warning(s)\n`);
