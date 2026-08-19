// tests/feedLean.test.js
//
// The lean has three promises and they are the whole point of it, so each is tested
// directly rather than inferred from the ordering:
//
//   nothing is hidden, 0 is exactly chronological, and the same lean on the same
//   posts always gives the same order.
//
// The rest is about the case that dominates early on: most posts have no prediction,
// and they must not all pile at one end.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    applyLean,
    clampLean,
    describeLean,
    describeShift,
    leanLabel,
} from '../src/ui/feedLean.js';

/** Newest first, as the API returns them. */
function feed(...predictions) {
    return predictions.map((predicted, i) => ({ id: `p${i}`, predicted }));
}

const ids = (ordered) => ordered.map((entry) => entry.pulse.id);

// --- the promises ----------------------------------------------------------

test('zero is exactly chronological, and reports no movement', () => {
    const pulses = feed(-1, 0.9, null, 0.5, -0.7);
    const ordered = applyLean(pulses, 0);

    assert.deepEqual(ids(ordered), ['p0', 'p1', 'p2', 'p3', 'p4']);
    assert.deepEqual(ordered.map((e) => e.shift), [0, 0, 0, 0, 0]);
});

test('nothing is ever hidden, at any setting', () => {
    // The property that makes the control safe to hand to someone: no value of it
    // can put the reader in a state where something is being kept from them.
    const pulses = feed(1, -1, null, 0.5, -0.5, 0, null);
    for (const lean of [-2, -1, 0, 1, 2]) {
        const ordered = applyLean(pulses, lean);
        assert.equal(ordered.length, pulses.length, `lean ${lean} changed the count`);
        assert.deepEqual(
            new Set(ids(ordered)),
            new Set(pulses.map((p) => p.id)),
            `lean ${lean} lost or duplicated a post`
        );
    }
});

test('the same lean on the same posts always gives the same order', () => {
    const pulses = feed(0.5, 0.5, 0.5, null, -0.5, 0.5);
    const once = ids(applyLean(pulses, 2));
    for (let i = 0; i < 5; i++) {
        assert.deepEqual(ids(applyLean(pulses, 2)), once);
    }
});

test('posts that score identically keep chronological order', () => {
    // Otherwise the feed would reshuffle posts it cannot tell apart, which reads as
    // randomness and destroys the one ordering the reader can predict.
    //
    // The fixture has to produce an actual TIE, which is fiddlier than it looks. An
    // earlier version used four posts with the same prediction — but score is
    // index - move, so equal predictions give DIFFERENT scores and the tiebreak
    // never ran. Reversing the tiebreak left that version passing.
    //
    // Here p0 and p1 score -1 and -1: index 0 with move 1, index 1 with move 2.
    const pulses = feed(0.5, 1.0);
    assert.deepEqual(ids(applyLean(pulses, 2)), ['p0', 'p1']);

    // And a longer tie, so the property is not an artefact of two elements.
    const three = feed(0.25, 0.5, 0.75);
    assert.deepEqual(ids(applyLean(three, 2)), ['p0', 'p1', 'p2']);
});

// --- direction -------------------------------------------------------------

test('a positive lean brings resonant posts forward', () => {
    // The most resonant post is the oldest, so chronology and the lean disagree.
    const pulses = feed(-0.9, 0, 0.9);
    assert.deepEqual(ids(applyLean(pulses, 2)), ['p2', 'p1', 'p0']);
});

test('a negative lean brings dissonant posts forward', () => {
    const pulses = feed(0.9, 0, -0.9);
    assert.deepEqual(ids(applyLean(pulses, -2)), ['p2', 'p1', 'p0']);
});

test('a negative lean is not the same as showing less', () => {
    // "Show me what I might not like and feel compelled to witness anyway" is a
    // request to surface something, not to suppress everything.
    const pulses = feed(0.9, 0.9, -0.9);
    const ordered = applyLean(pulses, -2);
    assert.equal(ids(ordered)[0], 'p2', 'the dissonant post should be first');
    assert.equal(ordered.length, 3);
});

test('two notches move a post further than one', () => {
    const pulses = feed(0, 0, 0, 0, 0.9);
    const gentle = ids(applyLean(pulses, 1)).indexOf('p4');
    const strong = ids(applyLean(pulses, 2)).indexOf('p4');
    assert.ok(strong < gentle, `strong ${strong} should beat gentle ${gentle}`);
});

test('one notch still leaves chronology visible', () => {
    // A gentle lean should nudge, not reshuffle. A post predicted mildly resonant
    // and posted much earlier should not overtake everything.
    const pulses = feed(0, 0, 0, 0, 0, 0, 0, 0.3);
    assert.notEqual(ids(applyLean(pulses, 1))[0], 'p7');
});

// --- posts with no prediction ---------------------------------------------

test('a post with no prediction does not move', () => {
    const pulses = feed(null, null, null);
    const ordered = applyLean(pulses, 2);
    assert.deepEqual(ids(ordered), ['p0', 'p1', 'p2']);
    assert.deepEqual(ordered.map((e) => e.shift), [0, 0, 0]);
});

test('an unknown post holds its place among posts that do not move either', () => {
    // The assertion above cannot catch a change applied uniformly to every unknown
    // post — with nothing else in the list, sinking them all leaves the order
    // identical. Making the neighbours predicted-neutral pins the unknown one to a
    // position it must keep.
    const pulses = feed(0, 0, null, 0, 0);
    const ordered = applyLean(pulses, 2);
    assert.deepEqual(ids(ordered), ['p0', 'p1', 'p2', 'p3', 'p4']);
    assert.equal(ordered.findIndex((e) => e.pulse.id === 'p2'), 2,
        'an unknown post sank or rose past posts that stayed put');
});

test('an unknown post is not sorted below a post predicted dissonant', () => {
    // Unknown is not the worst case; it is no case. A post the model dislikes should
    // still rank below one it cannot judge, under a resonant lean.
    const ordered = ids(applyLean(feed(-0.9, null), 2));
    assert.deepEqual(ordered, ['p1', 'p0']);
});

test('unpredicted posts do not all pile at one end', () => {
    // The state the feed is in for a new reader: almost nothing has a prediction. If
    // unknown sank, the feed would look broken rather than chronological.
    const pulses = feed(null, 0.9, null, null, -0.9, null);
    const ordered = ids(applyLean(pulses, 2));
    const unknownPositions = ['p0', 'p2', 'p3', 'p5'].map((id) => ordered.indexOf(id));

    assert.ok(Math.min(...unknownPositions) < 2, 'no unknown post near the top');
    assert.ok(Math.max(...unknownPositions) > ordered.length - 3, 'none near the bottom');
});

test('a non-numeric prediction is treated exactly like a missing one', () => {
    // The guard is `typeof === 'number'`, not truthiness. Truthiness would let a
    // string through, and `strength * 'nonsense' * length` is NaN — which does not
    // throw, does not sort, and quietly scrambles the order.
    //
    // Asserted as an equivalence rather than against a fixed order, because what
    // matters is that junk and absence are the same thing here.
    const junk = feed(-0.9, 'nonsense', 0.9, undefined, 0.4);
    const absent = feed(-0.9, null, 0.9, null, 0.4);
    assert.deepEqual(ids(applyLean(junk, 2)), ids(applyLean(absent, 2)));
    assert.deepEqual(ids(applyLean(junk, -2)), ids(applyLean(absent, -2)));
});

test('predicted zero and predicted nothing move a post the same distance', () => {
    // Stated so it is not mistaken for a gap. They ARE the same here: a neutral
    // prediction and no prediction both mean no movement. The two differ where the
    // difference is visible to the reader — the gauge is drawn for one and not the
    // other, and describeShift gives a different reason — not in the ordering.
    assert.deepEqual(ids(applyLean(feed(0.9, 0), 2)), ids(applyLean(feed(0.9, null), 2)));
});

// --- shifts --------------------------------------------------------------

test('the reported shift matches where the post actually ended up', () => {
    const pulses = feed(-0.9, -0.9, 0.9);
    const ordered = applyLean(pulses, 2);

    for (const [position, entry] of ordered.entries()) {
        const original = pulses.findIndex((p) => p.id === entry.pulse.id);
        assert.equal(entry.shift, original - position,
            `${entry.pulse.id} reports ${entry.shift} but moved ${original - position}`);
    }
});

test('shifts describe a move up as positive', () => {
    const ordered = applyLean(feed(-0.9, 0.9), 2);
    const risen = ordered.find((e) => e.pulse.id === 'p1');
    assert.ok(risen.shift > 0, 'a post that came forward should report a positive shift');
});

// --- edges ---------------------------------------------------------------

test('an empty feed and a single post are handled', () => {
    assert.deepEqual(applyLean([], 2), []);
    assert.deepEqual(ids(applyLean(feed(0.9), 2)), ['p0']);
});

test('junk input does not throw', () => {
    assert.deepEqual(applyLean(null, 2), []);
    assert.deepEqual(applyLean(undefined, 0), []);
    const odd = applyLean([{ id: 'a' }, { id: 'b', predicted: 'nonsense' }], 2);
    assert.deepEqual(ids(odd), ['a', 'b']);
});

test('a lean outside the scale is clamped rather than obeyed', () => {
    assert.equal(clampLean(97), 2);
    assert.equal(clampLean(-97), -2);
    assert.equal(clampLean('nonsense'), 0);
    assert.equal(clampLean(null), 0);
    // And clamping means a wild value cannot produce a wilder reordering than +2.
    //
    // The fixture matters. With a single predicted post any strong lean puts it
    // first, so clamping is invisible and an earlier version of this passed with the
    // clamp removed. Two mildly-predicted posts far apart in time do distinguish:
    // at strength 1 chronology still wins for p5, and at strength 48 it does not.
    const pulses = feed(0.1, 0, 0, 0, 0, 0.2);
    assert.deepEqual(ids(applyLean(pulses, 97)), ids(applyLean(pulses, 2)));
    assert.deepEqual(ids(applyLean(pulses, -97)), ids(applyLean(pulses, -2)));
});

// --- what the reader is told ---------------------------------------------

test('every setting has words, and every setting says nothing is hidden', () => {
    for (const lean of [-2, -1, 1, 2]) {
        const text = describeLean(lean);
        assert.ok(text.length > 0, `lean ${lean} has no description`);
        assert.match(text, /hidden/i, `lean ${lean} does not say nothing is hidden`);
    }
    // Zero is the exception: there is nothing to reassure anyone about, because
    // nothing is being done.
    assert.match(describeLean(0), /order things were posted/i);
});

test('the labels name all five settings distinctly', () => {
    const labels = [-2, -1, 0, 1, 2].map(leanLabel);
    assert.equal(new Set(labels).size, 5);
    assert.equal(leanLabel(0), 'Chronological');
});

test('a post that did not move has nothing to explain', () => {
    assert.equal(describeShift(0, 0.9), null);
});

test('a moved post explains the direction and the reason', () => {
    assert.match(describeShift(4, 0.9), /up 4 places/);
    assert.match(describeShift(4, 0.9), /resonates with you/);
    assert.match(describeShift(-3, -0.9), /down 3 places/);
    assert.match(describeShift(-3, -0.9), /may not resonate/);
});

test('one place is singular', () => {
    assert.match(describeShift(1, 0.5), /up 1 place\b/);
});

test('a post moved only by its neighbours says so', () => {
    // It has no prediction of its own, so claiming a reason about it would be a lie.
    assert.match(describeShift(2, null), /posts around it moved/);
});
