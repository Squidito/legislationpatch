// senator-match.js — resolve a Senate roll-call member row to a bioguide id.
//
// WHY THIS EXISTS. Senate roll-call XML carries no <bio_id> for most votes, so a
// senator has to be matched on last name + state. fetch_vote_data.js used to do
// that with a flat object:
//
//     lookup[rep.name.split(',')[0].split(' ').pop() + '-' + rep.state] = id
//
// and a single-key read on the XML's whole <last_name> string. Two defects,
// both live in production until 2026-08-30:
//
//   1. THE TWO SIDES DERIVED THE KEY DIFFERENTLY. The index side took the LAST
//      SPACE-SEPARATED TOKEN of the display name; the XML side took the WHOLE
//      last_name field. So "Chris Van Hollen" was stored under `hollen-MD`
//      while the XML asked for `vanhollen-MD`, and the two never met. Measured
//      on the stored corpus: 505 unmatched member rows across 101 Senate roll
//      calls, all of them the same five senators — Blunt Rochester, Cortez
//      Masto, King ("Angus S. King Jr." keyed on the SUFFIX, `jr-ME`), Luján
//      (the accent was stripped to `lujn-NM`) and Van Hollen. All five had an
//      EMPTY voting record on their public profile page as a result.
//   2. A COLLISION OVERWROTE SILENTLY. Two same-state senators sharing a
//      surname would collapse to one entry, and the loser's votes would be
//      attributed to the winner with no warning. articles/how-we-track-voting
//      claimed "additional disambiguation logic" handled exactly this. There
//      was none.
//
// WHAT THIS DOES INSTEAD.
//   - Both sides derive keys through the SAME function, so they cannot diverge.
//   - Keys are suffix-anchored on the real surname and generated at several
//     lengths (`hollen`, `vanhollen`, `chrisvanhollen`), which is what makes a
//     compound surname match whether the source spells out one word or two.
//   - Generational suffixes (Jr., Sr., II, III…) and single-letter initials are
//     dropped before keys are built.
//   - Diacritics are folded (Luján -> lujan) rather than deleted.
//   - A key holding more than one senator is a LIST, not an overwrite. The
//     tiebreak is first name, then party.
//   - An unresolved row returns an empty id AND a reason. It is never guessed:
//     a wrong attribution is worse than a missing one, and the caller logs it.
//
// Pure, read-only, no network, no LLM. Unit-tested by scripts/test-senator-match.js.

'use strict';

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'vi']);

/** Fold diacritics and drop everything that is not a letter or a space. */
function fold(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * The name tokens that can form a surname, in order, with generational suffixes
 * and single-letter initials removed. "Angus S. King Jr." -> ["angus","king"].
 */
function nameTokens(name) {
    return fold(name)
        .split(' ')
        .filter(t => t.length > 1 && !SUFFIXES.has(t));
}

/**
 * Candidate surname keys for a name, longest-suffix first.
 *
 * Suffix-anchored on purpose: every key ends at the last token, so a key can
 * never be built out of a first name alone. "Catherine Cortez Masto" yields
 * ["catherinecortezmasto", "cortezmasto", "masto"]; the XML's "Cortez Masto"
 * yields ["cortezmasto", "masto"]. They intersect, which is the whole point.
 */
function surnameKeys(name) {
    const t = nameTokens(name);
    if (!t.length) return [];
    const keys = [];
    for (let start = 0; start < t.length; start++) keys.push(t.slice(start).join(''));
    return keys;
}

/** The given name a tiebreak compares on. "Angus S. King Jr." -> "angus". */
function firstToken(name) {
    const raw = String(name || '');
    // "King, Angus" (roll-call order) puts the given name after the comma.
    const given = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
    const t = nameTokens(given);
    return t.length ? t[0] : '';
}

/**
 * Build key -> [candidate] from data/reps-index.json (a state -> members map).
 * Every senator is registered under EVERY one of their surname keys.
 */
function buildSenatorIndex(repsIndex) {
    const index = {};
    for (const list of Object.values(repsIndex || {})) {
        if (!Array.isArray(list)) continue;
        for (const rep of list) {
            if (!rep || rep.role !== 'Senator' || !rep.bioguideId) continue;
            const cand = {
                bioguideId: rep.bioguideId,
                name: rep.name,
                first: firstToken(rep.name),
                party: fold(rep.party).slice(0, 1),
                state: rep.state,
            };
            for (const k of surnameKeys(rep.name)) {
                const key = k + '-' + rep.state;
                if (!index[key]) index[key] = [];
                if (!index[key].some(c => c.bioguideId === cand.bioguideId)) index[key].push(cand);
            }
        }
    }
    return index;
}

/**
 * Resolve one roll-call row.
 *
 * Returns { bioguideId, reason, candidates }. `bioguideId` is '' whenever the
 * row cannot be resolved to exactly one member — including the ambiguous case.
 * Guessing is not an option here: the caller writes this id into a public voting
 * record.
 */
function resolveSenator(index, { lastName, firstName, state, party } = {}) {
    if (!state) return { bioguideId: '', reason: 'no state on the row', candidates: [] };
    const keys = surnameKeys(lastName);
    if (!keys.length) return { bioguideId: '', reason: 'no usable surname on the row', candidates: [] };

    const seen = new Set();
    let candidates = [];
    for (const k of keys) {
        for (const c of (index[k + '-' + state] || [])) {
            if (seen.has(c.bioguideId)) continue;
            seen.add(c.bioguideId);
            candidates.push(c);
        }
    }
    if (!candidates.length) return { bioguideId: '', reason: `no ${state} senator matches "${lastName}"`, candidates: [] };
    if (candidates.length === 1) return { bioguideId: candidates[0].bioguideId, reason: 'surname + state', candidates };

    // Tiebreak 1: given name. An initial on either side counts as a match only
    // when it is the only initial that fits.
    const f = firstToken(firstName);
    if (f) {
        const exact = candidates.filter(c => c.first === f);
        const prefix = candidates.filter(c => c.first.startsWith(f) || f.startsWith(c.first));
        const narrowed = exact.length ? exact : prefix;
        if (narrowed.length === 1) return { bioguideId: narrowed[0].bioguideId, reason: 'surname + state + given name', candidates };
        if (narrowed.length > 1) candidates = narrowed;
    }

    // Tiebreak 2: party.
    const p = fold(party).slice(0, 1);
    if (p) {
        const byParty = candidates.filter(c => c.party === p);
        if (byParty.length === 1) return { bioguideId: byParty[0].bioguideId, reason: 'surname + state + party', candidates };
    }

    return {
        bioguideId: '',
        reason: `ambiguous — ${candidates.length} ${state} senators match "${lastName}" (${candidates.map(c => c.name).join(', ')})`,
        candidates,
    };
}

module.exports = { fold, nameTokens, surnameKeys, firstToken, buildSenatorIndex, resolveSenator };
