// src/ui/ResonanceControl.js
//
// How a reader says what a post did to them, and what the app says back.
//
// Two pieces, deliberately not symmetrical:
//
//   * The SLIDER is what you give. Five notches, 0 in the middle, dissonant to
//     the left and resonant to the right. It replaces a single "resonate" button,
//     which could only ever mean approval — and a scale that has no way to say
//     "this did not land for me" collects agreement rather than reactions.
//
//   * The GAUGE is what you get. It shows what THIS reader is predicted to make of
//     the post, computed from their own past ratings. It is not a score for the
//     post and it is not anyone else's opinion of it: two readers looking at the
//     same post should see different gauges, and if they ever see the same one
//     something has gone wrong with the model.
//
// What is deliberately absent everywhere in this file: any count. No number of
// people who rated a post, no average of how they rated it, and none for the
// author of the post either. A visible tally is the thing that turns writing into
// competing, and once the number exists somebody will render it.
//
// The scale runs -2..+2 rather than 1..5 so that "no opinion" is the middle and
// the default, rather than a low score. A reader who never touches the slider has
// said nothing, not "one star".

/** The notches, in order. `label` is what a screen reader says. */
export const NOTCHES = [
    { value: -2, mark: '2', label: 'Strongly dissonant' },
    { value: -1, mark: '1', label: 'Dissonant' },
    { value: 0, mark: '0', label: 'Neutral — no opinion' },
    { value: 1, mark: '1', label: 'Resonant' },
    { value: 2, mark: '2', label: 'Strongly resonant' },
];

/**
 * Below this the gauge is not drawn.
 *
 * The API already refuses to predict without enough history, sending null. This is
 * a second gate on how *firmly* it predicted: a barely-supported guess drawn faintly
 * still reads as the app having an opinion about you.
 */
const MIN_CONFIDENCE_TO_DRAW = 0.15;

/**
 * Build the five-notch slider for one pulse.
 *
 * Also used for the feed's lean control, which is the same scale applied to the
 * whole feed rather than one post — hence the label option: a screen reader must not
 * be told the feed slider is asking about "this" post.
 *
 * @param {object} options
 * @param {number} options.value current rating, -2..+2
 * @param {boolean} options.enabled false for a reader who is not signed in
 * @param {string} [options.label] what the group is asking
 * @param {(value: number) => void} options.onChange
 * @returns {HTMLElement}
 */
export function createResonanceSlider({
    value = 0,
    enabled = true,
    label = 'How much does this resonate with you?',
    onChange,
} = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'pulsefeed-resonance';

    const left = document.createElement('span');
    left.className = 'pulsefeed-resonance-end';
    left.textContent = 'Dissonant';

    const right = document.createElement('span');
    right.className = 'pulsefeed-resonance-end';
    right.textContent = 'Resonant';

    const track = document.createElement('div');
    track.className = 'pulsefeed-notches';
    track.setAttribute('role', 'radiogroup');
    track.setAttribute('aria-label', label);

    const current = clamp(value);

    for (const notch of NOTCHES) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pulsefeed-notch';
        button.dataset.value = String(notch.value);
        // The mark is the digit; the sign is carried by which side it is on, which
        // is what the two end labels are for. Writing "-2" in a 20px target reads
        // as a hyphen at a glance.
        button.textContent = notch.mark;
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-label', notch.label);
        button.setAttribute('aria-checked', String(notch.value === current));
        button.title = notch.label;

        if (notch.value < 0) button.classList.add('dissonant');
        if (notch.value > 0) button.classList.add('resonant');
        if (notch.value === 0) button.classList.add('neutral');
        if (notch.value === current) button.classList.add('chosen');

        if (!enabled) {
            // Not the disabled attribute: a disabled button swallows its own click,
            // so a reader who is not signed in would get no explanation for why
            // nothing happened.
            button.classList.add('unavailable');
            button.setAttribute('aria-disabled', 'true');
        }

        button.addEventListener('click', () => {
            // Pressing the notch you are already on clears the rating. That is the
            // only way back to "no opinion" once you have given one, and hiding it
            // behind a separate control for an action this rare would be worse.
            const next = notch.value === current ? 0 : notch.value;
            onChange?.(next);
        });

        track.appendChild(button);
    }

    wrap.append(left, track, right);
    return wrap;
}

/**
 * Build the gauge showing what this reader is predicted to make of the post.
 *
 * Returns null when there is nothing honest to draw — no prediction, or not enough
 * behind it. A caller that appends the result must handle null; that is the point,
 * because "we do not know yet" is the normal state for a new reader and it must
 * look like absence rather than like zero.
 *
 * @param {object} options
 * @param {number|null} options.predicted -1..+1, or null
 * @param {number} options.confidence 0..1
 * @returns {HTMLElement|null}
 */
export function createResonanceGauge({ predicted, confidence = 0 } = {}) {
    if (predicted === null || predicted === undefined) return null;
    if (!(confidence >= MIN_CONFIDENCE_TO_DRAW)) return null;

    const value = Math.max(-1, Math.min(1, Number(predicted)));
    const resonant = value >= 0;

    const wrap = document.createElement('span');
    wrap.className = `pulsefeed-gauge ${resonant ? 'resonant' : 'dissonant'}`;

    // An SVG arc rather than a filled circle: the arc has a natural empty state
    // and a natural direction, so "a little" and "a lot" are the same shape at
    // different lengths rather than two different pictures.
    const SIZE = 22;
    const R = 8;
    const CIRC = 2 * Math.PI * R;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('width', String(SIZE));
    svg.setAttribute('height', String(SIZE));
    svg.setAttribute('aria-hidden', 'true');

    const back = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    back.setAttribute('cx', String(SIZE / 2));
    back.setAttribute('cy', String(SIZE / 2));
    back.setAttribute('r', String(R));
    back.setAttribute('class', 'pulsefeed-gauge-track');
    svg.appendChild(back);

    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    arc.setAttribute('cx', String(SIZE / 2));
    arc.setAttribute('cy', String(SIZE / 2));
    arc.setAttribute('r', String(R));
    arc.setAttribute('class', 'pulsefeed-gauge-arc');
    // Magnitude, not sign: how far from neutral in either direction. Which
    // direction is carried by colour, because an arc that grows one way for
    // resonance and the other for dissonance is two charts in one place.
    const magnitude = Math.abs(value);
    arc.setAttribute('stroke-dasharray', `${(CIRC * magnitude).toFixed(2)} ${CIRC.toFixed(2)}`);
    // Start at the top and go clockwise, which is where a reader expects zero.
    arc.setAttribute('transform', `rotate(-90 ${SIZE / 2} ${SIZE / 2})`);
    // Confidence dims the whole arc rather than shortening it: a firm guess of
    // "slightly" and a vague guess of "strongly" are different things and must not
    // draw the same.
    arc.style.opacity = String(0.35 + 0.65 * Math.min(1, confidence));
    svg.appendChild(arc);

    wrap.appendChild(svg);
    wrap.title = describePrediction(value, confidence);
    return wrap;
}

/**
 * Words for a gauge, used as its tooltip.
 *
 * Hedged on purpose. This is a guess from a handful of ratings, and stating it
 * flatly ("you will like this") would claim more than the model can support.
 */
export function describePrediction(value, confidence = 0) {
    const magnitude = Math.abs(value);
    const strength = magnitude >= 0.6 ? 'strongly'
        : magnitude >= 0.25 ? ''
        : 'slightly';
    const direction = value >= 0 ? 'resonate' : 'be dissonant';
    const hedge = confidence >= 0.6 ? 'Likely to' : 'Might';

    const words = [hedge, strength, direction].filter(Boolean).join(' ');
    return `${words} with you, going by what you have rated. `
        + 'Only you see this — it is not a score for the post.';
}

function clamp(value) {
    const n = Math.round(Number(value) || 0);
    return Math.max(-2, Math.min(2, n));
}
