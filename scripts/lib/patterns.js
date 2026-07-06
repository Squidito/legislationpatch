// patterns.js — shared regex patterns used by multiple pipeline scripts.
// First module of scripts/lib/ (see FABLE-AUDIT.md §B2 for the full extraction plan).

// Passage-context matcher — identifies vote questions / action texts that decide
// a measure itself, as opposed to procedural motions (recommit, commit, table,
// cloture, proceed) which say nothing about stage. Shared by validate-batch.js
// (roll-call vote questions) and refresh_stages.js (Congress.gov action texts);
// the union covers both domains: "on passage" / "suspend the rules and pass" /
// "motion to concur" appear in vote questions, "passed/agreed to" / "failed of
// passage" appear in action texts. Keeping ONE pattern prevents the silent drift
// where the two files disagreed on what counts as a passage vote.
const PASSAGE_CONTEXT = /\b(on passage|suspend the rules and pass|agreeing to the (concurrent )?resolution|motion to concur|passed\/agreed to|failed of passage)\b/i;

// Curly/smart quotes (U+2018/2019/201C/201D). These silently corrupt anchor ids
// (billSection → bt-sec-N links) and JS template literals (the known Edit-tool
// corruption class — see CLAUDE.md "Watch out" under Bill Text Section Linking).
// Structural fields and source files must stay ASCII-quoted; prose (CR quote
// text) legitimately contains typographic quotes and is exempt.
const SMART_QUOTES   = /[‘’“”]/;
const SMART_QUOTES_G = /[‘’“”]/g;

module.exports = { PASSAGE_CONTEXT, SMART_QUOTES, SMART_QUOTES_G };
