// entity.js -- the site's Person / Organization identity, loaded once from
// data/entity.json and emitted as schema.org nodes.
//
// WHY THIS EXISTS: before this module, all 47 articles carried a duplicated
// inline author blob ({"@type":"Organization","name":"LegislationPatch"}). That
// gives search and AI engines 47 unlinked author objects instead of one
// resolvable entity. Everything here emits @id-referenced nodes so the whole
// site resolves to a single Person and a single Organization.
//
// Shared by:
//   generate_bill_pages.js    -- per-bill page JSON-LD
//   generate_articles_index.js -- articles/index.html
//   migrate-article-schema.js  -- one-time article schema rewrite
//   generate_author_page.js    -- the author page itself
//
// Read-only. Adding a sameAs corroboration point is a one-line edit to
// data/entity.json -- never to a page.

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..'); // scripts/lib -> repo root
const ENTITY_FILE = path.join(ROOT, 'data', 'entity.json');

let _cache = null;

function load() {
  if (_cache) return _cache;
  const raw = JSON.parse(fs.readFileSync(ENTITY_FILE, 'utf8'));
  for (const key of ['site', 'person', 'organization']) {
    if (!raw[key]) throw new Error(`entity.json is missing the "${key}" block`);
  }
  if (!raw.person.id || !raw.organization.id) {
    throw new Error('entity.json: person.id and organization.id are required (they are the @id anchors)');
  }
  _cache = raw;
  return _cache;
}

/** Full Person node. Emit ONCE per page (on the author page, or in an @graph). */
function personNode() {
  const p = load().person;
  const node = {
    '@type': 'Person',
    '@id': p.id,
    name: p.name,
    url: p.url,
  };
  if (p.givenName)   node.givenName   = p.givenName;
  if (p.familyName)  node.familyName  = p.familyName;
  if (p.jobTitle)    node.jobTitle    = p.jobTitle;
  if (p.description) node.description = p.description;
  if (p.knowsAbout && p.knowsAbout.length) node.knowsAbout = p.knowsAbout;
  if (p.sameAs && p.sameAs.length)         node.sameAs     = p.sameAs;
  node.worksFor = { '@id': load().organization.id };
  return node;
}

/** Full Organization node. Emit ONCE per page (or in an @graph). */
function organizationNode() {
  const o = load().organization;
  const node = {
    '@type': o.type || 'Organization',
    '@id': o.id,
    name: o.name,
    url: o.url,
  };
  if (o.logo) {
    node.logo = { '@type': 'ImageObject', url: o.logo };
  }
  if (o.description)  node.description  = o.description;
  if (o.foundingDate) node.foundingDate = o.foundingDate;
  // NewsMediaOrganization trust properties -- these are the machine-readable
  // form of the transparency pages the site already publishes.
  for (const prop of [
    'publishingPrinciples',
    'verificationFactCheckingPolicy',
    'correctionsPolicy',
    'actionableFeedbackPolicy',
    'ownershipFundingInfo',
    'ethicsPolicy',
  ]) {
    if (o[prop]) node[prop] = o[prop];
  }
  if (o.sameAs && o.sameAs.length) node.sameAs = o.sameAs;
  return node;
}

/** Lightweight {"@id": ...} reference. This is what articles use for author/publisher. */
function personRef()       { return { '@id': load().person.id }; }
function organizationRef() { return { '@id': load().organization.id }; }

/** Convenience accessors for HTML (byline text, links). */
function person()       { return load().person; }
function organization() { return load().organization; }
function site()         { return load().site; }

/**
 * The visible byline + disclosure line. Kept here so every surface renders the
 * same wording -- the AP-style standard is that AI involvement is disclosed
 * where it materially shapes published work, and this is that disclosure.
 */
function bylineHtml() {
  const p = load().person;
  return `By <a href="${p.url}" rel="author">${p.name}</a>, ${p.jobTitle}`;
}

function disclosureHtml() {
  const p = load().person;
  return `Drafted from primary source documents by LegislationPatch's automated research pipeline, then reviewed, verified, and edited by <a href="${p.url}" rel="author">${p.name}</a>. Every figure and citation is checked against the official text before publication. <a href="/editorial-standards.html">Editorial standards and AI disclosure</a>.`;
}

module.exports = {
  load,
  personNode,
  organizationNode,
  personRef,
  organizationRef,
  person,
  organization,
  site,
  bylineHtml,
  disclosureHtml,
};
