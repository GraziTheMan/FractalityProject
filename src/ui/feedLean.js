// src/ui/feedLean.js
//
// Self-curation: the reader decides how much the feed leans.
//
// A slider from -2 to +2 at the top of the feed, the same shape as the one on each
// post. 0 is chronological. Positive leans toward what the reader is predicted to
// resonate with; negative leans the other way — not "show me things I hate", but
// "show me what I might not like and feel compelled to witness anyway".
//
// Three properties this deliberately has, each of which a corporate feed does not:
//
//   1. NOTHING IS EVER HIDDEN. The lean reorders; it does not filter. So no setting
//      can make a post disappear, and there is no state the reader can get into
//      where something is being kept from them without their knowing.
//
//   2. IT IS REVERSIBLE IN ONE MOVE. Back to 0 and the order is the order things
//      were posted in. An echo chamber is reachable here, but only by holding the
//      slider there on purpose — which was the point.
//
//   3. IT IS STATABLE. The whole rule is one line of arithmetic, below, and each
//      post can say how far it moved and why. "Transparent algorithm" is not a
//      claim this file makes; it is a thing the reader can check.
//
// Deliberately client-side, over the posts already loaded. Ranking on the server
// across the whole feed would mean the reader asks for a page and a model decides
// what is in it — which is the thing this is meant to be an alternative to. Here the
// reader has the posts, and chooses how to arrange what they have.

/** The lean values, matching the notches on a post's own slider. */
export const LEAN_MIN = -2;
export const LEAN_MAX = 2;

/** Where a reader's lean is remembered between visits. */
const STORAGE_KEY = 'fractality:feed:lean';

/**
 * Reorder pulses according to the reader's lean.
 *
 * The rule, in full:
 *
 *     newPosition = chronologicalPosition - (lean / 2) * predicted * count
 *
 * `predicted` is -1..+1 and is that reader's own predicted resonance. `lean / 2` is
 * 0.5 at one notch and 1.0 at two, so two notches can move a strongly-predicted post
 * the length of the list and one notch moves it half. The sign of `lean` flips the
 * direction, which is what makes -2 mean "surface the dissonant" rather than
 * "surface less of everything".
 *
 * A post with no prediction does not move. That is the honest handling of "we do not
 * know": if unknown posts sank they would all pile at the bottom, and early on —
 * when almost nothing has a prediction — the feed would look broken rather than
 * chronological.
 *
 * Stable: equal scores keep chronological order, so the result is deterministic and
 * re-applying the same lean to the same posts cannot shuffle them differently.
 *
 * @param {Array<object>} pulses in chronological order, newest first
 * @param {number} lean -2..+2
 * @returns {Array<{pulse: object, shift: number}>} ordered, with each post's move
 */
export function applyLean(pulses, lean) {
    const list = Array.isArray(pulses) ? pulses : [];
    const strength = clampLean(lean) / 2;

    if (strength === 0 || list.length < 2) {
        return list.map((pulse) => ({ pulse, shift: 0 }));
    }

    const scored = list.map((pulse, index) => {
        const predicted = typeof pulse?.predicted === 'number' ? pulse.predicted : null;
        const move = predicted === null ? 0 : strength * predicted * list.length;
        return { pulse, index, score: index - move };
    });

    // Sort by score, falling back to the original index so the sort is stable across
    // engines that do not guarantee it and across re-runs.
    scored.sort((a, b) => (a.score - b.score) || (a.index - b.index));

    // The shift is reported from the FINAL positions, not from the score: a post can
    // score a large move and still barely change place if everything around it moved
    // too, and what the reader sees is the place, not the score.
    return scored.map((entry, position) => ({
        pulse: entry.pulse,
        shift: entry.index - position,
    }));
}

/**
 * Plain words for what the current lean is doing.
 *
 * Written to be read by someone deciding whether to move it, so it says what the
 * setting does rather than naming it. The scope is stated too — "the posts you have
 * loaded" — because a description that implied it reached the whole feed would be
 * claiming more than the code does.
 *
 * @param {number} lean
 * @returns {string}
 */
export function describeLean(lean) {
    switch (clampLean(lean)) {
        case 2:
            return 'Strongly toward what resonates with you. Nothing is hidden — '
                + 'the posts you have loaded are just reordered.';
        case 1:
            return 'Leaning toward what resonates with you. Nothing is hidden.';
        case 0:
            return 'Newest first, in the order things were posted. No reordering at all.';
        case -1:
            return 'Leaning toward what may not resonate with you — things worth '
                + 'seeing anyway. Nothing is hidden.';
        case -2:
            return 'Strongly toward what may not resonate with you. Nothing is '
                + 'hidden — the posts you have loaded are just reordered.';
        default:
            return '';
    }
}

/** A short label for the control itself. */
export function leanLabel(lean) {
    switch (clampLean(lean)) {
        case 2: return 'Strongly resonant';
        case 1: return 'Leaning resonant';
        case 0: return 'Chronological';
        case -1: return 'Leaning dissonant';
        case -2: return 'Strongly dissonant';
        default: return '';
    }
}

/**
 * Why one post is where it is.
 *
 * The per-post half of the transparency: a reader who wonders why something is near
 * the top can find out, on that post, without being told to trust anything.
 *
 * @param {number} shift places moved, positive meaning upward
 * @param {number|null} predicted
 * @returns {string|null} null when the post did not move
 */
export function describeShift(shift, predicted) {
    if (!shift) return null;

    const places = Math.abs(shift) === 1 ? '1 place' : `${Math.abs(shift)} places`;
    const direction = shift > 0 ? 'up' : 'down';
    const because = typeof predicted === 'number'
        ? (predicted >= 0
            ? 'this looks like something that resonates with you'
            : 'this looks like something that may not resonate with you')
        : 'the posts around it moved';

    return `Moved ${direction} ${places} by your feed lean: ${because}.`;
}

/** Read the remembered lean. 0 whenever there is nothing usable stored. */
export function loadLean() {
    try {
        return clampLean(Number(localStorage.getItem(STORAGE_KEY)));
    } catch {
        // Private browsing, or storage disabled. Chronological is the right default
        // to fall back to, because it is the one that does nothing.
        return 0;
    }
}

/** Remember the lean. Failure is silent: it is a preference, not data. */
export function saveLean(lean) {
    try {
        localStorage.setItem(STORAGE_KEY, String(clampLean(lean)));
        return true;
    } catch {
        return false;
    }
}

export function clampLean(lean) {
    const n = Math.round(Number(lean) || 0);
    return Math.max(LEAN_MIN, Math.min(LEAN_MAX, n));
}
