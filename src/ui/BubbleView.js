// src/ui/BubbleView.js — traverse a map by entering bubbles.
//
// This replaces five 3D layouts (family, goldenSpiral, fibonacciSphere,
// fractalTree, cosmicWeb) with one view. They were five arrangements of the same
// shaded spheres, answering a question nobody was asking — "how should the whole
// graph be scattered in space?" — while the question people actually have is
// "what is inside this?".
//
// So this shows ONE level at a time: the children of the bubble you are in, and
// nothing else. Entering a bubble is the only navigation, and coming back out is
// the only way to undo it. A map of ten thousand nodes looks exactly as simple as
// a map of ten, because at any moment you are looking at one node's children.
//
// Circles rather than spheres, for three reasons that all turn out to be the same
// reason. A flat circle has an interior you can write a name inside, so a bubble
// says what it is without a label floating beside it. A 2D canvas draws a few
// dozen circles without a frame budget worth managing. And a circle has no
// lighting, no camera and no material, so there is nothing to tune — which is why
// the five layouts were tunable and still unsatisfying.
//
// The animation is the one piece of deliberate artifice: clicking a bubble grows
// it toward the screen and fades it out, then fades its children in. That reads as
// passing THROUGH a surface into what it contains, which is what the hierarchy
// means. It is the same descent the cone view makes when you enter an emergent
// node, drawn as a first-person journey instead of a diagram.

/** How long entering or leaving a bubble takes, milliseconds. */
const TRANSITION_MS = 480;

/**
 * How far through the transition the outgoing set has finished leaving.
 *
 * Less than 1 on purpose: the incoming set starts arriving before the outgoing
 * one has gone, so the two overlap and the motion reads as continuous rather
 * than as two separate animations played in sequence.
 */
const HANDOVER = 0.55;

/** Radius of a bubble as a fraction of the smaller viewport dimension. */
const MAX_RADIUS_FRACTION = 0.34;
const MIN_RADIUS = 26;

/** Gap between neighbouring bubbles, as a fraction of their radius. */
const GAP = 0.28;

export class BubbleView {
    /**
     * @param {object} options
     * @param {() => object|null} options.getGraph
     * @param {() => string|null} [options.getFocusedNode]
     * @param {(nodeId: string) => void} [options.onFocusNode]
     * @param {(msg: string, type?: string) => void} [options.notify]
     * @param {(open: boolean) => void} [options.onVisibilityChange]
     *   This covers the whole screen, so the host can stop the 3D engine drawing
     *   frames nobody can see.
     */
    constructor(options = {}) {
        this.getGraph = options.getGraph ?? (() => null);
        this.getFocusedNode = options.getFocusedNode ?? (() => null);
        this.onFocusNode = options.onFocusNode ?? (() => {});
        this.notify = options.notify ?? ((m) => console.log(m));
        this.onVisibilityChange = options.onVisibilityChange ?? (() => {});
        /**
         * What "leave this view" means.
         *
         * Not hide(): there is nothing behind these views to fall back to, so a
         * bare hide leaves a black screen with a dock floating on it. The host
         * decides where leaving goes — today, back to the default screen.
         */
        this.onClose = options.onClose ?? (() => this.hide());

        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.isOpen = false;
        this._raf = null;

        /**
         * The bubbles entered so far, outermost first.
         *
         * Empty means "the top level", which shows the map's roots. The last entry
         * is the bubble whose inside is on screen. A stack rather than a single
         * current id, so coming out retraces the way in rather than guessing a
         * parent — and a node reached through `emergesFrom` has several parents, so
         * guessing would be wrong for exactly the nodes this project cares about.
         */
        this.path = [];

        /** In-flight enter/exit, or null. */
        this._transition = null;

        /** Circles as last drawn, for hit testing. */
        this._hits = [];

        this._onResize = () => this._resize();
    }

    // --- lifecycle ---------------------------------------------------------

    init() {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = 'bubble-view hidden';
        this.container.innerHTML = `
            <canvas class="bubble-canvas"></canvas>
            <div class="bubble-trail"></div>
            <div class="bubble-readout">
                <span class="bubble-where"></span>
                <span class="bubble-hint">tap a bubble to go inside it</span>
            </div>
            <button class="bubble-up" type="button" hidden
                title="Come back out one level">↑ Out</button>
            <button class="bubble-close" type="button"
                title="Back to the cone view">×</button>
        `;
        document.body.appendChild(this.container);

        this.canvas = this.container.querySelector('.bubble-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.trailEl = this.container.querySelector('.bubble-trail');
        this.whereEl = this.container.querySelector('.bubble-where');
        this.upButton = this.container.querySelector('.bubble-up');

        this.upButton.addEventListener('click', () => this.exitBubble());
        this.container.querySelector('.bubble-close')
            .addEventListener('click', () => this.onClose());

        this._bindGestures();
        this._injectStyles();
        window.addEventListener('resize', this._onResize);
    }

    show() {
        this.init();
        this.container.classList.remove('hidden');
        this.isOpen = true;
        this._resize();

        // Open where the reader already is. If something is selected elsewhere,
        // start inside its parent so the selection is one of the bubbles on
        // screen — arriving at the root and making them walk back down to where
        // they were is a worse first frame.
        this.path = this._pathToFocus();

        this._transition = null;
        this._renderChrome();
        this.onVisibilityChange(true);
        this._loop();
    }

    hide() {
        if (!this.container) return;
        this.container.classList.add('hidden');
        this.isOpen = false;
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
        this.onVisibilityChange(false);
    }

    toggle() {
        if (this.isOpen) this.hide();
        else this.show();
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
        window.removeEventListener('resize', this._onResize);
        this.container?.remove();
        this.container = null;
    }

    _resize() {
        if (!this.canvas) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.canvas.width = Math.max(1, Math.round(width * ratio));
        this.canvas.height = Math.max(1, Math.round(height * ratio));
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    // --- what is on screen -------------------------------------------------

    /** The bubble whose inside is showing, or null at the top level. */
    get currentId() {
        return this.path.length > 0 ? this.path[this.path.length - 1] : null;
    }

    /**
     * What is inside a bubble: its children, AND anything that emerges from it.
     *
     * A node IS inside every one of its parents at once, and that is not a
     * compromise — it is what the model means. Consciousness cannot exist without
     * all four operators, so it does not live in one of them with references from
     * the others; it occupies their overlap, and the overlap is inside each. Enter
     * any operator and it is there.
     *
     * This reads as paradoxical only if a bubble is a box. It is a region, and
     * regions intersect. The reason the same idea defeated an earlier attempt at
     * drawing this is topological rather than conceptual: overlapping REGIONS stop
     * being separable past three sets, and Consciousness has six contributors, so
     * no arrangement of six shapes in a plane shows every intersection. Reaching
     * the shared node through any parent sidesteps that entirely — the intersection
     * never has to be drawn, only entered.
     *
     * Deliberately NOT `resetsTo`: recurrence may be circular, and following it
     * here would make the last tier contain the first, so descending would never
     * end.
     */
    _contentsOf(nodeId) {
        const graph = this.getGraph();
        if (!graph) return [];

        if (nodeId === null) return graph.getRootNodes?.() ?? [];

        const contained = graph.getChildren?.(nodeId) ?? [];
        const emergent = graph.getEmergentChildren?.(nodeId) ?? [];

        // A node can be both — contained by this one AND listing it as a stream —
        // so the set is deduplicated by id rather than concatenated.
        const seen = new Set(contained.map((n) => n.id));
        return [...contained, ...emergent.filter((n) => !seen.has(n.id))];
    }

    _visible() {
        return this._contentsOf(this.currentId);
    }

    /** Where to start when opening, so the reader's selection is on screen. */
    _pathToFocus() {
        const graph = this.getGraph();
        const focusId = this.getFocusedNode();
        if (!graph || !focusId) return [];

        const node = graph.getNode?.(focusId);
        if (!node) return [];

        // Walk up by containment to the root, then reverse: the ancestors of the
        // selection ARE the path that has it on screen.
        const up = [];
        let cursor = node.parentId ? graph.getNode(node.parentId) : null;
        const guard = new Set();
        while (cursor && !guard.has(cursor.id)) {
            guard.add(cursor.id);
            up.push(cursor.id);
            cursor = cursor.parentId ? graph.getNode(cursor.parentId) : null;
        }
        return up.reverse();
    }

    // --- navigation --------------------------------------------------------

    /**
     * Go inside a bubble.
     *
     * Refuses a bubble with nothing in it, and says so rather than playing the
     * animation and arriving at an empty screen. "Nothing happened" and "this is
     * empty" look identical otherwise.
     */
    enterBubble(nodeId) {
        const graph = this.getGraph();
        if (!graph || this._transition) return false;

        const node = graph.getNode?.(nodeId);
        if (!node) return false;

        const children = this._contentsOf(nodeId);
        if (children.length === 0) {
            const name = node.metadata?.label || node.id;
            this.notify(`"${name}" contains nothing yet`, 'info');
            return false;
        }

        this._selectFromHere(nodeId);
        this._transition = {
            kind: 'enter',
            focusId: nodeId,
            startedAt: performance.now(),
            outgoing: this._visible().map((n) => n.id),
        };
        this.path = [...this.path, nodeId];
        this._renderChrome();
        return true;
    }

    /** Come back out one level. Returns false at the top. */
    exitBubble() {
        if (this.path.length === 0 || this._transition) return false;

        const leaving = this.currentId;
        this.path = this.path.slice(0, -1);
        this._transition = {
            kind: 'exit',
            focusId: leaving,
            startedAt: performance.now(),
            outgoing: [],
        };
        this._selectFromHere(leaving);
        this._renderChrome();
        return true;
    }

    /** Jump straight to a depth in the trail. */
    goToDepth(depth) {
        if (this._transition) return false;
        const target = Math.max(0, Math.min(this.path.length, depth));
        if (target === this.path.length) return false;

        this._transition = {
            kind: 'exit',
            focusId: this.path[target] ?? null,
            startedAt: performance.now(),
            outgoing: [],
        };
        this.path = this.path.slice(0, target);
        this._renderChrome();
        return true;
    }

    /**
     * Tell the rest of the app what is selected, and remember that we did.
     *
     * Without the flag a focus change made here would come back as an external
     * one and re-aim the view at itself.
     */
    _selectFromHere(nodeId) {
        if (!nodeId) return;
        this._selfInitiatedFocus = true;
        this.onFocusNode(nodeId);
    }

    // --- layout ------------------------------------------------------------

    /**
     * Place N bubbles in the frame.
     *
     * One goes in the middle, which is the first frame of a fresh map: a single
     * circle called "The Fractiverse". Any more go on a ring, sized so they do not
     * touch. The ring's radius is set BY the bubble radius rather than the other
     * way round — solving `spacing >= 2r(1+GAP)` for a ring of n — so bubbles stay
     * as large as they can be instead of shrinking to fit a fixed circle.
     */
    _layout(count, width, height) {
        if (count <= 0) return [];

        const cx = width / 2;
        const cy = height / 2;
        const limit = Math.min(width, height) * MAX_RADIUS_FRACTION;

        if (count === 1) {
            return [{ x: cx, y: cy, r: limit }];
        }

        // Chord between neighbours on a ring of radius R is 2R·sin(π/n), and we
        // need that to be at least 2r(1 + GAP).
        const sin = Math.sin(Math.PI / count);

        // The ring must also fit on screen with its bubbles: R + r <= usable.
        const usable = Math.min(width, height) / 2 - 12;
        // R = r(1+GAP)/sin, so r(1+GAP)/sin + r <= usable
        let r = usable / ((1 + GAP) / sin + 1);
        r = Math.max(MIN_RADIUS, Math.min(limit, r));

        const ring = Math.min(usable - r, (r * (1 + GAP)) / sin);

        const out = [];
        for (let i = 0; i < count; i++) {
            // Start at the top and go clockwise, so the first child is where a
            // reader looks first rather than out to the right.
            const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
            out.push({
                x: cx + ring * Math.cos(angle),
                y: cy + ring * Math.sin(angle),
                r,
            });
        }
        return out;
    }

    // --- drawing -----------------------------------------------------------

    _loop() {
        if (!this.isOpen) return;
        this._render();
        this._raf = requestAnimationFrame(() => this._loop());
    }

    _render() {
        const ctx = this.ctx;
        if (!ctx) return;

        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#070a10';
        ctx.fillRect(0, 0, width, height);

        const graph = this.getGraph();
        if (!graph) return;

        let progress = 1;
        if (this._transition) {
            progress = Math.min(1, (performance.now() - this._transition.startedAt) / TRANSITION_MS);
            if (progress >= 1) {
                this._transition = null;
                this._renderChrome();
            }
        }

        const transition = this._transition;
        this._hits = [];

        // The set being left behind, drawn growing past the viewer on the way in
        // and shrinking away on the way out.
        if (transition && progress < HANDOVER) {
            const t = progress / HANDOVER;
            const leaving = transition.kind === 'enter'
                ? transition.outgoing.map((id) => graph.getNode(id)).filter(Boolean)
                : [];
            if (leaving.length > 0) {
                const spots = this._layout(leaving.length, width, height);
                leaving.forEach((node, i) => {
                    const spot = spots[i];
                    const isFocus = node.id === transition.focusId;
                    // The bubble being entered rushes at the viewer; its siblings
                    // just fade, because two things moving in different directions
                    // would read as the set scattering rather than as passing into
                    // one of them.
                    const grow = isFocus ? 1 + t * 5 : 1;
                    this._drawBubble(ctx, node, {
                        x: spot.x + (spot.x - width / 2) * (isFocus ? 0 : t * 0.4),
                        y: spot.y + (spot.y - height / 2) * (isFocus ? 0 : t * 0.4),
                        r: spot.r * grow,
                        alpha: 1 - t,
                        interactive: false,
                    });
                });
            }
        }

        // The set arriving.
        const arrivingAt = transition ? Math.max(0, (progress - HANDOVER * 0.8) / (1 - HANDOVER * 0.8)) : 1;
        if (arrivingAt > 0) {
            const nodes = this._visible();
            const spots = this._layout(nodes.length, width, height);
            const focusId = this.getFocusedNode();

            nodes.forEach((node, i) => {
                const spot = spots[i];
                // Entering arrives from small (you are inside now, they grow to
                // meet you); leaving arrives from large (you are backing away).
                const from = transition?.kind === 'exit' ? 1.8 : 0.45;
                const factor = from + (1 - from) * arrivingAt;
                const placed = {
                    x: width / 2 + (spot.x - width / 2) * factor,
                    y: height / 2 + (spot.y - height / 2) * factor,
                    r: spot.r * factor,
                    alpha: arrivingAt,
                    interactive: !transition,
                    selected: node.id === focusId,
                };
                this._drawBubble(ctx, node, placed);
                if (placed.interactive) {
                    this._hits.push({ id: node.id, x: placed.x, y: placed.y, r: placed.r });
                }
            });

            if (nodes.length === 0) this._drawEmpty(ctx, width, height);
        }
    }

    _drawBubble(ctx, node, placed) {
        const { x, y, r, alpha } = placed;
        if (r <= 0 || alpha <= 0) return;

        const graph = this.getGraph();
        // Counted the same way entering counts, or the face says "2 inside" and
        // then shows five.
        const childCount = this._contentsOf(node.id).length;
        // How many places this same bubble can be reached from. More than one is
        // worth showing: it is the visible trace of a node occupying an overlap.
        const homes = graph?.getAllParentIds?.(node.id)?.length ?? 0;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = placed.selected ? 'rgba(0,60,68,0.55)' : 'rgba(16,28,34,0.55)';
        ctx.fill();
        // A bubble with nothing inside is drawn thinner rather than differently
        // coloured: colour is spent on selection here, and a second meaning on the
        // same channel would make neither readable.
        ctx.lineWidth = childCount > 0 ? 2 : 1;
        ctx.strokeStyle = placed.selected
            ? 'rgba(0,255,255,0.9)'
            : childCount > 0 ? 'rgba(90,220,180,0.65)' : 'rgba(120,140,150,0.45)';
        ctx.stroke();

        // A second, offset ring for a bubble that is inside more than one thing.
        // Offset rather than merely thicker, because the doubling is the point:
        // this circle is also somewhere else, and you can get here from there.
        if (homes > 1) {
            ctx.beginPath();
            ctx.arc(x, y, r + 5, 0, Math.PI * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = placed.selected
                ? 'rgba(0,255,255,0.45)'
                : 'rgba(90,220,180,0.32)';
            ctx.stroke();
        }

        // Whether the count will be drawn has to be decided BEFORE the label,
        // because the label needs to know not to grow into that space. Drawing
        // both independently put a four-line name straight through the caption.
        const showsCount = childCount > 0 && r > 34;

        this._drawLabel(
            ctx,
            node.metadata?.label || node.id,
            x,
            showsCount ? y - r * 0.12 : y,
            r,
            placed.selected,
            showsCount ? r * 0.85 : r * 1.15
        );

        // How many are inside, under the name. The point of the view is going in,
        // so "is there anything in there" is the one fact worth carrying.
        if (showsCount) {
            ctx.font = `${Math.max(9, Math.round(r * 0.16))}px system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(150,190,200,0.75)';
            ctx.textAlign = 'center';
            ctx.fillText(`${childCount} inside`, x, y + r * 0.62);
        }

        // Named, not just ringed: "also in 3" answers the question the double ring
        // raises, which is "also in what?" — the trail answers the rest.
        if (homes > 1 && r > 44) {
            ctx.font = `${Math.max(8, Math.round(r * 0.13))}px system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(120,200,180,0.7)';
            ctx.textAlign = 'center';
            ctx.fillText(`also in ${homes - 1}`, x, y - r * 0.66);
        }

        ctx.restore();
    }

    /**
     * The name, inside the circle.
     *
     * This is the whole reason for flat circles over spheres, so it has to work
     * for a long name in a small bubble: wrap on words, then shrink, then clip
     * with an ellipsis. The order matters — shrinking first makes short names
     * needlessly tiny, and clipping first throws away words that would have fitted
     * on a second line.
     */
    _drawLabel(ctx, text, x, y, r, selected, allowance = r * 1.15) {
        const usable = r * 1.5;          // a chord, not the diameter
        let size = Math.max(10, Math.round(r * 0.3));
        let lines = [];

        for (; size >= 9; size -= 1) {
            ctx.font = `${size}px system-ui, sans-serif`;
            lines = this._wrap(ctx, text, usable);
            // Keep it to the middle of the circle so it never touches the edge,
            // and out of whatever the caller has reserved below.
            if (lines.length * size * 1.2 <= allowance) break;
        }

        const maxLines = Math.max(1, Math.floor(allowance / (size * 1.2)));
        if (lines.length > maxLines) {
            lines = lines.slice(0, maxLines);
            const last = lines.length - 1;
            let tail = lines[last];
            while (tail.length > 1 && ctx.measureText(`${tail}…`).width > usable) {
                tail = tail.slice(0, -1);
            }
            lines[last] = `${tail}…`;
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = selected ? 'rgba(190,255,255,0.98)' : 'rgba(226,238,242,0.95)';
        const height = lines.length * size * 1.2;
        lines.forEach((line, i) => {
            ctx.fillText(line, x, y - height / 2 + size * 0.6 + i * size * 1.2);
        });
        ctx.textBaseline = 'alphabetic';
    }

    /** Greedy word wrap. A single word longer than the line is left long; the caller clips. */
    _wrap(ctx, text, maxWidth) {
        const words = String(text).split(/\s+/).filter(Boolean);
        if (words.length === 0) return [''];

        const lines = [];
        let line = words[0];
        for (let i = 1; i < words.length; i++) {
            const candidate = `${line} ${words[i]}`;
            if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
            else { lines.push(line); line = words[i]; }
        }
        lines.push(line);
        return lines;
    }

    _drawEmpty(ctx, width, height) {
        ctx.font = '13px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(160,180,190,0.8)';
        ctx.textAlign = 'center';
        ctx.fillText('Nothing in here yet', width / 2, height / 2);
    }

    // --- chrome ------------------------------------------------------------

    _renderChrome() {
        if (!this.container) return;
        const graph = this.getGraph();
        const nameOf = (id) => graph?.getNode(id)?.metadata?.label || id;

        this.upButton.hidden = this.path.length === 0;

        // The trail, as buttons: a reader three levels down should not have to
        // press Out three times to get back to the top.
        this.trailEl.textContent = '';
        const crumb = (label, depth) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'bubble-crumb';
            button.textContent = label;
            button.disabled = depth === this.path.length;
            button.addEventListener('click', () => this.goToDepth(depth));
            return button;
        };
        this.trailEl.appendChild(crumb('Top', 0));
        this.path.forEach((id, i) => {
            const sep = document.createElement('span');
            sep.className = 'bubble-sep';
            sep.textContent = '›';
            this.trailEl.appendChild(sep);
            this.trailEl.appendChild(crumb(nameOf(id), i + 1));
        });

        const count = this._visible().length;
        const noun = count === 1 ? 'bubble' : 'bubbles';
        this.whereEl.textContent = this.currentId === null
            ? `Top level · ${count} ${noun}`
            : `Inside "${nameOf(this.currentId)}" · ${count} ${noun}`;
    }

    // --- gestures ----------------------------------------------------------

    _bindGestures() {
        const canvas = this.canvas;

        canvas.addEventListener('pointerdown', (event) => {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const hit = this._hitTest(x, y);
            if (hit) this.enterBubble(hit.id);
        });

        // Escape and a right-click both come back out, because "go back" is the
        // only thing this view can undo and it should be hard to miss.
        this._onKeyDown = (event) => {
            if (!this.isOpen) return;
            if (event.key === 'Escape') {
                // Come out one level; at the top, leave the view entirely.
                if (!this.exitBubble()) this.onClose();
            }
        };
        document.addEventListener('keydown', this._onKeyDown);

        canvas.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            this.exitBubble();
        });
    }

    _hitTest(x, y) {
        // Nearest first, so overlapping circles resolve to the one whose centre is
        // closest rather than to whichever was drawn last.
        let best = null;
        let bestDistance = Infinity;
        for (const hit of this._hits) {
            const dx = x - hit.x;
            const dy = y - hit.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= hit.r && distance < bestDistance) {
                best = hit;
                bestDistance = distance;
            }
        }
        return best;
    }

    // --- styles ------------------------------------------------------------

    _injectStyles() {
        if (document.getElementById('bubble-view-styles')) return;
        const style = document.createElement('style');
        style.id = 'bubble-view-styles';
        style.textContent = `
            .bubble-view {
                position: fixed;
                inset: 0;
                top: var(--dock-top-height, 0px);
                bottom: var(--dock-height, 0px);
                /* 900, matching the cone view: these two are CONTENT, so they sit
                   under the panels (1001) and the HUD (1000). The full order is
                   written out in ConeView's stylesheet. Overlap with the HUD in the
                   top-right is handled by --hud-inset, not by climbing the stack —
                   1100 put both views over every panel. */
                z-index: 900;
                background: #070a10;
            }
            .bubble-view.hidden { display: none; }

            .bubble-canvas { display: block; width: 100%; height: 100%; }

            .bubble-trail {
                position: absolute;
                top: 10px;
                left: 12px;
                right: calc(var(--hud-inset, 0px) + 110px);
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 4px;
                font-size: 12px;
            }
            .bubble-crumb {
                background: rgba(0,0,0,0.55);
                border: 1px solid #2a3a40;
                border-radius: 6px;
                color: #9fb;
                padding: 4px 8px;
                font-size: 12px;
                cursor: pointer;
            }
            .bubble-crumb:disabled { color: #cff; border-color: #0ff; cursor: default; }
            .bubble-crumb:hover:not(:disabled) { border-color: #0ff; }
            .bubble-sep { color: #4a5a60; }

            .bubble-readout {
                position: absolute;
                left: 12px;
                bottom: 12px;
                display: flex;
                flex-direction: column;
                gap: 2px;
                pointer-events: none;
            }
            .bubble-where {
                color: #0ff;
                font-size: 12px;
                letter-spacing: 0.04em;
                text-transform: uppercase;
            }
            .bubble-hint { color: #6a7f88; font-size: 11px; }

            .bubble-up, .bubble-close {
                position: absolute;
                top: 10px;
                min-height: 40px;
                background: rgba(0,0,0,0.7);
                border: 1px solid #333;
                border-radius: 8px;
                color: #fff;
                line-height: 1;
                cursor: pointer;
            }
            /* --hud-inset is the performance dashboard's width while it shows, so
               these slide inboard of it instead of under it. */
            .bubble-up {
                right: calc(var(--hud-inset, 0px) + 58px);
                padding: 0 12px; font-size: 12px; color: #9fb;
            }
            .bubble-close {
                right: calc(var(--hud-inset, 0px) + 10px);
                min-width: 40px; font-size: 20px;
            }
            .bubble-up:hover, .bubble-close:hover { border-color: #0ff; }

            @media (max-width: 720px), (max-height: 500px) {
                .bubble-trail { right: 12px; top: 58px; }
                .bubble-hint { font-size: 10px; }
            }
        `;
        document.head.appendChild(style);
    }
}
