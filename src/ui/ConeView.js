// src/ui/ConeView.js
//
// The Cone view: a 2D side elevation of the whole map as a cone.
//
// Tier 0 is a single node — the ultimate container — at the apex. Each tier below
// holds more nodes than the one above, so the silhouette widens as it descends.
// That shape is the information: it shows at a glance how the map broadens, which
// the 3D view cannot, because the 3D view deliberately shows only the children of
// whichever parent you have visited.
//
// Two gestures, matching the geometry:
//   * drag horizontally  -> spin the cone about its vertical axis
//   * drag vertically    -> travel up and down the tiers
//
// Nodes are laid out as a cone tree: each subtree owns a wedge of the circle, so
// a branch stays together as you spin and the wedge widths show how the map is
// distributed. Children are centred within their parent's wedge, which means a
// node's horizontal position is meaningful rather than arbitrary.

/** Vertical distance between tiers, in pixels, before zoom. */
const TIER_HEIGHT = 78;
/** How much wider each tier is than the one above it. */
const RADIUS_PER_TIER = 62;
/**
 * How strongly each extra parent pulls a node toward the cone's axis.
 *
 * Tuned so two parents is a visible move inward and four is unmistakable, without a
 * two-parent node — which is the common case — reading as though it were nearly at the
 * centre. One constant, so the whole behaviour is adjustable from here.
 */
const INWARD_PULL_PER_PARENT = 0.6;
/** Movement beyond this many pixels is a drag, not a tap. */
const TAP_SLOP = 10;

/**
 * How far toward the cone's axis a node is pulled by having several parents.
 *
 * 1 for a node with a single parent, decreasing as more streams converge into it. The
 * radial coordinate is therefore not just "how deep" but "how integrated": the rim is
 * maximally differentiated, the axis maximally unified.
 *
 * That is the Crystallization Spectrum drawn as a distance. C_1, physical stability, is
 * the rim; C_4, unified realization, is the axis. The apex sits on the axis because it
 * is total unity, and a node that four things flowed into approaches it for the same
 * reason — so both ends of the axis mean the same thing, which is what makes the
 * diagram say something rather than merely arrange things.
 *
 * A reciprocal rather than a subtraction, so it can never reach or cross zero: a node
 * with fifty parents should approach the axis, never land on it and be indistinguishable
 * from the apex.
 */
function _inwardPull(graph, node) {
    // A node can be DECLARED a reunification point, which puts it on the axis exactly.
    //
    // Declared rather than derived, after trying to derive it. Every rule that suggests
    // itself founders on sibling branches: "is an ancestor of nothing that dead-ends
    // above it" sounds right until a node like Quantum Field Theory — a consequence
    // hanging off the side, not an input — blocks the reunification of something it has
    // nothing to do with. Whether a node is where everything comes back together is a
    // claim about the ontology, not a fact about its edges, so the author makes it.
    //
    // What CAN be derived is the diagnosis: which branches never rejoin. That is
    // reported rather than silently encoded in the geometry.
    if (node.metadata?.onAxis === true) return 0;

    const degree = typeof graph.getConvergenceDegree === 'function'
        ? graph.getConvergenceDegree(node.id)
        // A graph from an older build has no such method. Falling back to "no pull"
        // keeps the cone drawable rather than throwing on every frame.
        : 1;
    if (degree <= 1) return 1;
    return 1 / (1 + (degree - 1) * INWARD_PULL_PER_PARENT);
}

export class ConeView {
    /**
     * @param {object} options
     * @param {() => object|null} options.getGraph
     * @param {() => string|null} [options.getFocusedNode]
     * @param {(nodeId: string) => void} [options.onFocusNode]
     * @param {(msg: string, type?: string) => void} [options.notify]
     * @param {(open: boolean) => void} [options.onVisibilityChange]
     *   Told when the view opens and closes. This covers the whole screen, so
     *   the host can stop the 3D engine rendering frames nobody can see —
     *   which on a phone is battery spent on nothing.
     */
    constructor(options = {}) {
        this.getGraph = options.getGraph ?? (() => null);
        this.getFocusedNode = options.getFocusedNode ?? (() => null);
        this.onFocusNode = options.onFocusNode ?? (() => {});
        this.notify = options.notify ?? ((m) => console.log(m));
        this.onVisibilityChange = options.onVisibilityChange ?? (() => {});

        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.isOpen = false;

        /** Rotation about the cone's axis, radians. */
        this.spin = 0;

        /**
         * The node at this cone's apex, or null for the whole map.
         *
         * Axiom III makes this the right representation rather than a convenience:
         * "Everything is a Fractal Hologram ... because the temporal metric is
         * self-similar across its eigenvalues". If the structure repeats across scales
         * then descending into a node and finding the same structure one scale down is
         * what the model says should happen. Zooming is the scale-coupler.
         */
        this.apexId = null;

        /** Apexes descended through, so going back up retraces the way in. */
        this.trail = [];

        /**
         * Follow a focus change made by another surface.
         *
         * Only another surface. A tap in the cone also changes the focus, and
         * re-aiming on that would snap the node the user just pointed at from
         * wherever they saw it to the front — moving the thing they were looking at
         * as a reward for looking at it.
         */
        this._onFocusChanged = () => {
            if (this._selfInitiatedFocus) {
                this._selfInitiatedFocus = false;
                return;
            }
            if (!this.isOpen) return;   // aimed again on show()
            this.aimAtFocus();
        };
        this._selfInitiatedFocus = false;
        /** Which tier sits at the vertical centre. Fractional while dragging. */
        this.tierFocus = 0;

        /** Screen positions from the last frame, for hit-testing taps. */
        this._hits = [];
        this._frame = null;
        this._drag = null;

        // Bound once so they can be removed in destroy(). An anonymous resize
        // handler per instance is a leak, and this component can outlive a view.
        this._onResize = () => this._resize();
    }

    // --- lifecycle ---------------------------------------------------------

    init() {
        if (this.container) return;

        this.container = document.createElement('div');
        this.container.className = 'cone-view hidden';
        this.container.innerHTML = `
            <canvas class="cone-canvas"></canvas>
            <div class="cone-breadcrumb" hidden></div>
            <div class="cone-readout">
                <span class="cone-tier-label"></span>
                <span class="cone-hint">drag sideways to spin · up and down to change tier</span>
            </div>
            <button class="cone-close" type="button" title="Close the cone view">×</button>
        `;
        document.body.appendChild(this.container);

        this.canvas = this.container.querySelector('.cone-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.tierLabel = this.container.querySelector('.cone-tier-label');
        this.breadcrumbEl = this.container.querySelector('.cone-breadcrumb');

        this.container.querySelector('.cone-close')
            .addEventListener('click', () => {
                // Step up out of a nested cone rather than closing the view outright.
                // Closing from three levels down and reopening at the whole map loses
                // the reader's place for no reason.
                if (!this.exitCone()) this.hide();
            });

        this._bindGestures();
        this._injectStyles();
        window.addEventListener('resize', this._onResize);
        window.addEventListener('fractality:focusChanged', this._onFocusChanged);
    }

    show() {
        this.init();
        this.container.classList.remove('hidden');
        this.isOpen = true;

        // Open on the tier the 3D view is looking at, so switching surfaces does
        // not lose the user's place.
        this.aimAtFocus();

        this._resize();
        this._start();
        this.onVisibilityChange(true);
    }

    /**
     * Turn and scroll the cone until the focused node is front and centre.
     *
     * Highlighting it was not enough. The cone shows one tier's neighbourhood at a
     * time, so selecting a tier-4 node while looking at tier 0 drew a highlight
     * nobody could see, and the two surfaces looked like they were ignoring each
     * other — which was the whole complaint.
     *
     * Spinning as well as scrolling matters: a node on the far side of the cone is
     * drawn small, dim and behind everything, and reads as absent.
     */
    aimAtFocus() {
        const graph = this.getGraph();
        const focused = graph?.getNode(this.getFocusedNode());
        if (!focused) return false;

        const view = this._view(graph);
        // A node outside this cone cannot be aimed at from inside it. Leaving the cone
        // where it is beats scrolling to a tier that does not exist here.
        if (view.ids && !view.ids.has(focused.id)) return false;

        this.tierFocus = this._clampTier(view.depthOf(focused));

        // The wedge angles are recomputed here rather than cached: the graph may
        // have been edited or replaced since the last frame, and aiming with stale
        // angles points at wherever the node used to be.
        const angle = this._computeAngles(graph, view).get(focused.id);
        if (typeof angle === 'number') {
            // The front of the cone is where sin(angle + spin) is 0 and
            // cos(angle + spin) is 1 — see _project. So spin = -angle.
            this.spin = -angle;
        }
        return true;
    }

    // --- descending ---------------------------------------------------------

    /**
     * Make `nodeId` the apex of its own cone.
     *
     * The cone then shows that node and everything it contains, with its own
     * contributors drawn above the apex as an inflow collar. The collar is NOT a tier of
     * this cone: it is what flowed in from outside, and giving it a tier would imply the
     * contributors are contained by a node they only fed.
     *
     * Which cone you are inside is a separate question from what a node emerged from,
     * and the breadcrumb answers it. Drawing the containing cone as a node above the
     * apex would conflate the two — and worse, it would hide the contributors, which are
     * the most interesting fact about an emergent node.
     *
     * @returns {boolean} false if there is nothing to descend into
     */
    enterCone(nodeId) {
        const graph = this.getGraph();
        const node = graph?.getNode(nodeId);
        if (!node) return false;

        // A leaf has no cone of its own: descending would show one point and nothing
        // else, which looks broken rather than empty.
        if ((node.childIds ?? []).length === 0) return false;

        if (this.apexId) this.trail.push(this.apexId);
        this.apexId = nodeId;
        this.tierFocus = 0;
        this.spin = 0;
        this._renderBreadcrumb();

        // Bring the selection in with you. Without this the readout kept naming
        // whatever was selected before — typically a node that is not in this cone at
        // all — so the cone described something it was not showing.
        this._selfInitiatedFocus = true;
        this.onFocusNode(nodeId);
        this._selfInitiatedFocus = false;
        return true;
    }

    /** Go back up one cone. Returns false at the top. */
    exitCone() {
        if (!this.apexId) return false;

        this.apexId = this.trail.pop() ?? null;
        this.tierFocus = 0;
        this.spin = 0;
        // Aim at whatever is focused, so coming back up lands somewhere meaningful
        // rather than at the apex regardless of where the reader had been.
        this._renderBreadcrumb();
        this.aimAtFocus();
        return true;
    }

    /** The chain of apexes from the whole map down to the current one. */
    _renderBreadcrumb() {
        if (!this.breadcrumbEl) return;
        this.breadcrumbEl.replaceChildren();

        if (!this.apexId) {
            this.breadcrumbEl.hidden = true;
            return;
        }
        this.breadcrumbEl.hidden = false;

        const graph = this.getGraph();
        const nameOf = (id) => graph?.getNode(id)?.metadata.label || id;

        const crumbs = [null, ...this.trail, this.apexId];
        crumbs.forEach((id, index) => {
            if (index > 0) {
                const sep = document.createElement('span');
                sep.className = 'cone-crumb-sep';
                sep.textContent = '›';
                this.breadcrumbEl.appendChild(sep);
            }

            const isLast = index === crumbs.length - 1;
            const crumb = document.createElement('button');
            crumb.type = 'button';
            crumb.className = isLast ? 'cone-crumb current' : 'cone-crumb';
            crumb.textContent = id === null ? 'Whole map' : nameOf(id);
            if (isLast) {
                crumb.disabled = true;
            } else {
                crumb.addEventListener('click', () => {
                    // Jump straight to that level rather than stepping up one at a time.
                    this.trail = crumbs.slice(1, index).filter(Boolean);
                    this.apexId = id;
                    this.tierFocus = 0;
                    this.spin = 0;
                    this._renderBreadcrumb();
                    this.aimAtFocus();
                });
            }
            this.breadcrumbEl.appendChild(crumb);
        });
    }

    /**
     * The nodes this cone shows, and their depth relative to its apex.
     *
     * Recomputed every frame rather than cached. The cone redraws from getGraph() each
     * frame precisely so it can never show a stale graph, and caching membership here
     * would reintroduce exactly that: a node added while the cone is open would not
     * appear. It is a walk over one subtree, which costs far less than drawing it.
     *
     * @returns {{ids: Set<string>, depthOf: (node) => number, roots: Array, collar: Array}}
     */
    _view(graph) {
        if (!this.apexId || !graph?.getNode(this.apexId)) {
            return {
                ids: null,          // null means "everything", so no filtering at all
                depthOf: (node) => node.depth,
                roots: graph?.getRootNodes() ?? [],
                collar: [],
            };
        }

        const apex = graph.getNode(this.apexId);
        const ids = new Set([apex.id]);
        const stack = [...(apex.childIds ?? [])];
        while (stack.length > 0) {
            const id = stack.pop();
            if (ids.has(id)) continue;
            const node = graph.getNode(id);
            if (!node) continue;
            ids.add(id);
            for (const childId of node.childIds ?? []) stack.push(childId);
        }

        return {
            ids,
            // Relative to the apex, so the apex is this cone's tier 0. The nodes' real
            // depths are untouched: they belong to the whole map, and rewriting them to
            // suit a view would corrupt the model to draw a picture.
            depthOf: (node) => node.depth - apex.depth,
            roots: [apex],
            collar: graph.getEmergentParents(apex.id),
        };
    }

    hide() {
        if (!this.isOpen && this.container?.classList.contains('hidden')) return;
        if (this.container) this.container.classList.add('hidden');
        this.isOpen = false;
        this._stop();
        this.onVisibilityChange(false);
    }

    toggle() {
        this.isOpen ? this.hide() : this.show();
    }

    destroy() {
        this._stop();
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('fractality:focusChanged', this._onFocusChanged);
        this.container?.remove();
        this.container = null;
    }

    // --- geometry ----------------------------------------------------------

    /**
     * Assign every node an angle around the cone.
     *
     * Each subtree owns a wedge, divided among its children in proportion to how
     * many leaves each contains. Weighting by leaf count rather than splitting
     * evenly stops a branch with one child from claiming as much of the circle as
     * a branch with thirty — which is what makes the widening actually legible.
     *
     * @returns {Map<string, number>} node id -> angle in radians
     */
    _computeAngles(graph, view = null) {
        const angles = new Map();
        const leafCounts = new Map();
        const inView = (id) => !view?.ids || view.ids.has(id);

        // Leaf counts first, deepest-first, so a parent can read its children's.
        const order = [];
        const roots = view ? view.roots : graph.getRootNodes();
        const stack = [...roots.map((n) => n.id)];
        const seen = new Set();
        while (stack.length > 0) {
            const id = stack.pop();
            if (seen.has(id)) continue;
            seen.add(id);
            order.push(id);
            for (const childId of graph.getNode(id)?.childIds ?? []) {
                if (inView(childId)) stack.push(childId);
            }
        }
        for (const id of [...order].reverse()) {
            const node = graph.getNode(id);
            const children = (node?.childIds ?? []).filter((c) => graph.getNode(c));
            leafCounts.set(id, children.length === 0
                ? 1
                : children.reduce((sum, c) => sum + (leafCounts.get(c) ?? 1), 0));
        }

        // Then hand out wedges from the top down.
        const assign = (id, start, end) => {
            const node = graph.getNode(id);
            if (!node) return;
            angles.set(id, (start + end) / 2);

            const children = node.childIds.filter((c) => graph.getNode(c));
            if (children.length === 0) return;

            const total = children.reduce((sum, c) => sum + (leafCounts.get(c) ?? 1), 0) || 1;
            let cursor = start;
            for (const childId of children) {
                const share = ((leafCounts.get(childId) ?? 1) / total) * (end - start);
                assign(childId, cursor, cursor + share);
                cursor += share;
            }
        };

        const rootShare = (Math.PI * 2) / Math.max(1, roots.length);
        roots.forEach((root, i) => assign(root.id, i * rootShare, (i + 1) * rootShare));

        return angles;
    }

    /**
     * Project every node to screen coordinates for the current spin and tier.
     *
     * A side elevation, so the horizontal axis is `sin` of the angle and `cos`
     * only says how near the viewer a node is: that is what makes it a side view
     * of a cone rather than a top-down radial chart.
     */
    _project(graph, angles, view = null) {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        const centreX = width / 2;
        const centreY = height / 2;
        const depthOf = view ? view.depthOf : ((n) => n.depth);

        // Keep the whole cone inside a phone's width at the widest tier.
        const maxTier = Math.max(1, this._maxTier(graph, view));
        const scale = Math.min(1, (width * 0.42) / (maxTier * RADIUS_PER_TIER));

        const out = [];
        for (const node of graph.nodes.values()) {
            if (view?.ids && !view.ids.has(node.id)) continue;
            const depth = depthOf(node);
            const angle = (angles.get(node.id) ?? 0) + this.spin;
            const radius = depth * RADIUS_PER_TIER * scale * _inwardPull(graph, node);

            // cos gives the near/far axis. Squashing it to 0.28 is the ellipse
            // the cone's circular tier makes when seen nearly edge-on.
            const nearness = Math.cos(angle);
            out.push({
                node,
                // The radial coordinate itself, not just where it lands on screen.
                //
                // Worth carrying because x is radius * sin(angle): a node at the front
                // or back of the cone sits at the horizontal centre whatever its
                // radius, so screen position cannot be read as radius. A check that
                // tried to measure integration from x passed only because the angle
                // happened not to be zero.
                radius,
                depth,
                x: centreX + radius * Math.sin(angle),
                y: centreY + (depth - this.tierFocus) * TIER_HEIGHT * scale
                     + radius * 0.28 * nearness,
                nearness,
                scale,
            });
        }

        // Far side first, so near nodes paint over far ones.
        out.sort((a, b) => a.nearness - b.nearness);
        return out;
    }

    // --- rendering ---------------------------------------------------------

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

    _start() {
        if (this._frame) return;
        const tick = () => {
            this._frame = requestAnimationFrame(tick);
            this.render();
        };
        this._frame = requestAnimationFrame(tick);
    }

    _stop() {
        if (this._frame) cancelAnimationFrame(this._frame);
        this._frame = null;
    }

    render() {
        if (!this.ctx || !this.isOpen) return;

        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        const ctx = this.ctx;

        ctx.clearRect(0, 0, width, height);

        const graph = this.getGraph();
        if (!graph || graph.nodes.size === 0) {
            ctx.fillStyle = '#777';
            ctx.font = '14px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No map loaded', width / 2, height / 2);
            this._hits = [];
            return;
        }

        const view = this._view(graph);
        const angles = this._computeAngles(graph, view);
        const points = this._project(graph, angles, view);
        const byId = new Map(points.map((p) => [p.node.id, p]));
        const focusedId = this.getFocusedNode();
        const tier = Math.round(this.tierFocus);

        // Tier guides: the ellipse each tier's circle makes at this angle.
        const maxTier = this._maxTier(graph, view);
        const scale = points[0]?.scale ?? 1;
        for (let d = 0; d <= maxTier; d++) {
            const y = height / 2 + (d - this.tierFocus) * TIER_HEIGHT * scale;
            if (y < -40 || y > height + 40) continue;
            const radius = d * RADIUS_PER_TIER * scale;

            ctx.beginPath();
            ctx.ellipse(width / 2, y, Math.max(1, radius), Math.max(1, radius * 0.28), 0, 0, Math.PI * 2);
            ctx.strokeStyle = d === tier ? 'rgba(0,255,255,0.28)' : 'rgba(255,255,255,0.06)';
            ctx.lineWidth = d === tier ? 1.5 : 1;
            ctx.stroke();
        }

        // The axis: apex straight down through the centre of every tier.
        //
        // Drawn because it is where the radial coordinate is going. Convergent nodes
        // move toward it, so without the line their inward drift has nothing to be
        // inward of, and the geometry reads as noise rather than as integration.
        const apexY = height / 2 + (0 - this.tierFocus) * TIER_HEIGHT * scale;
        const baseY = height / 2 + (maxTier - this.tierFocus) * TIER_HEIGHT * scale;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(width / 2, apexY);
        ctx.lineTo(width / 2, baseY);
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = 'rgba(0,255,255,0.13)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // Containment edges, so the cone reads as a tree and not a cloud of dots.
        ctx.lineWidth = 1;
        for (const point of points) {
            const parent = point.node.parentId ? byId.get(point.node.parentId) : null;
            if (!parent) continue;
            const near = (point.nearness + 1) / 2;
            ctx.beginPath();
            ctx.moveTo(parent.x, parent.y);
            ctx.lineTo(point.x, point.y);
            ctx.strokeStyle = `rgba(120,180,200,${0.06 + near * 0.20})`;
            ctx.stroke();
        }

        // Convergence edges: what flowed into what.
        //
        // Drawn in the accent colour and after the containment edges, so where several
        // cross they read as a funnel into the node rather than as more tree. They are a
        // different relation and the whole reason a node sits off the rim, so drawing
        // them identically to containment would hide the cause of what the eye is
        // already seeing.
        for (const point of points) {
            const sources = point.node.emergesFrom ?? [];
            if (sources.length === 0) continue;

            const near = (point.nearness + 1) / 2;
            for (const sourceId of sources) {
                const source = byId.get(sourceId);
                if (!source) continue;
                ctx.beginPath();
                ctx.moveTo(source.x, source.y);
                ctx.lineTo(point.x, point.y);
                ctx.strokeStyle = `rgba(0,255,255,${0.10 + near * 0.30})`;
                ctx.stroke();
            }
        }

        // Recurrence: the cycle closing back on itself.
        //
        // Drawn as a bowed arc well outside the cone rather than as a straight line
        // through it. A straight line from the base to the apex would run along the axis
        // — the one place in this diagram that already means something — and would read
        // as a containment edge between the two most important nodes.
        for (const point of points) {
            for (const targetId of point.node.resetsTo ?? []) {
                const target = byId.get(targetId);
                if (!target) continue;

                const bulge = Math.max(Math.abs(point.x - width / 2),
                                       Math.abs(target.x - width / 2)) + 110;
                const side = point.x >= width / 2 ? 1 : -1;
                const cx = width / 2 + side * bulge;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
                ctx.quadraticCurveTo(cx, (point.y + target.y) / 2, target.x, target.y);
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = 'rgba(252,211,77,0.42)';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // An arrowhead, because a cycle without a direction is just a line.
                const dx = target.x - cx;
                const dy = target.y - (point.y + target.y) / 2;
                const len = Math.hypot(dx, dy) || 1;
                const ux = dx / len;
                const uy = dy / len;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(target.x, target.y);
                ctx.lineTo(target.x - ux * 9 - uy * 4, target.y - uy * 9 + ux * 4);
                ctx.lineTo(target.x - ux * 9 + uy * 4, target.y - uy * 9 - ux * 4);
                ctx.closePath();
                ctx.fillStyle = 'rgba(252,211,77,0.65)';
                ctx.fill();
                ctx.restore();
            }
        }

        // The inflow collar: what flowed into this cone's apex from outside it.
        //
        // Above the apex, small, with lines converging down into it. Deliberately NOT a
        // tier of this cone — these nodes are not contained by the apex, they fed it, and
        // giving them a tier would say the opposite. Drawn only when descended, since at
        // the whole-map level they are ordinary nodes with their own places.
        this._collarHits = [];
        if (view.collar.length > 0 && byId.has(this.apexId)) {
            const apex = byId.get(this.apexId);
            const spread = Math.min(width * 0.6, 64 * Math.max(1, view.collar.length - 1) + 64);
            const collarY = apex.y - TIER_HEIGHT * 0.72 * scale;

            view.collar.forEach((source, index) => {
                const t = view.collar.length === 1
                    ? 0.5
                    : index / (view.collar.length - 1);
                const x = width / 2 + (t - 0.5) * spread;

                ctx.beginPath();
                ctx.moveTo(x, collarY);
                ctx.lineTo(apex.x, apex.y);
                ctx.strokeStyle = 'rgba(0,255,255,0.35)';
                ctx.lineWidth = 1;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(x, collarY, 4.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0,255,255,0.75)';
                ctx.fill();

                ctx.fillStyle = 'rgba(180,240,255,0.85)';
                ctx.font = '10px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(
                    String(source.metadata.label || source.id).slice(0, 22),
                    x, collarY - 9
                );

                // Tappable, so a contributor can be reached from here.
                this._collarHits.push({ id: source.id, x, y: collarY, r: 12 });
            });
        }

        // Nodes.
        this._hits = [];
        const labelCandidates = [];
        for (const point of points) {
            const near = (point.nearness + 1) / 2;
            const onTier = point.node.depth === tier;
            const isFocused = point.node.id === focusedId;

            const radius = (onTier ? 7 : 5) * (0.65 + near * 0.5);
            const alpha = (onTier ? 0.55 : 0.22) + near * 0.45;

            ctx.beginPath();
            ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = isFocused
                ? `rgba(0,255,255,${Math.min(1, alpha + 0.25)})`
                : `rgba(90,220,160,${alpha})`;
            ctx.fill();

            if (isFocused) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, radius + 4, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(0,255,255,0.8)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            this._hits.push({ id: point.node.id, x: point.x, y: point.y, r: radius + 8 });

            // Labels are collected, not painted yet: they have to be placed
            // against each other, and painting as we go means the last one wins
            // every overlap.
            if (onTier || isFocused) {
                labelCandidates.push({ point, radius, near, isFocused });
            }
        }

        this._paintLabels(ctx, labelCandidates);

        // The readout names the SELECTED node, always.
        //
        // Previously it only gave a tier and a count, and a node's name appeared
        // solely if it happened to be on the focused tier's front third. So
        // renaming a node in the Node Manager and coming here to look at it
        // showed nothing — which is indistinguishable from the cone ignoring the
        // rename. It was not ignoring it; there was nowhere for the new name to
        // appear.
        const count = points.filter((p) => p.depth === tier).length;
        // Only if it is actually in this cone. Naming a node that is not on screen is
        // worse than naming nothing: it reads as a claim about what you are looking at.
        const focusedHere = focusedId && (!view.ids || view.ids.has(focusedId));
        const focused = focusedHere ? graph.getNode(focusedId) : null;
        const shown = view.ids ? view.ids.size : graph.nodes.size;
        const parts = [`Tier ${tier} · ${count} node${count === 1 ? '' : 's'} of ${shown}`];
        if (view.ids) {
            const apex = graph.getNode(this.apexId);
            parts.push(`inside "${apex?.metadata.label || this.apexId}"`);
        }
        if (focused) {
            parts.push(`selected: ${focused.metadata.label || focused.id}`);

            // Why this node sits where it does. A reader who notices a node off the
            // rim should be able to find out what pulled it in without guessing, and
            // the count is the reason.
            const streams = focused.emergesFrom?.length ?? 0;
            if (streams > 0) {
                parts.push(`${streams} stream${streams === 1 ? '' : 's'} converge here`);
            }
            // Otherwise a node sitting exactly on the centre line reads as a rendering
            // accident rather than as the claim it is.
            if (focused.metadata?.onAxis === true) parts.push('on the axis');

            const resets = focused.resetsTo?.length ?? 0;
            if (resets > 0) {
                const names = graph.getResetTargets(focused.id)
                    .map((n) => n.metadata.label || n.id).join(', ');
                parts.push(`cycles back to ${names}`);
            }
        }
        this.tierLabel.textContent = parts.join('  ·  ');
    }

    /**
     * Paint labels, skipping any that would collide with one already placed.
     *
     * The previous rule was "front third of the focused tier only", which left
     * most nodes permanently unnamed — a sweep of every tier through a full
     * rotation labelled 21 of 36. Collision testing means the whole tier can be
     * labelled and only genuinely overlapping text is dropped, so a name is
     * reachable by spinning rather than absent.
     *
     * The selected node is placed first, so it never loses a collision to a
     * neighbour.
     */
    _paintLabels(ctx, candidates) {
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';

        const ordered = [...candidates].sort((a, b) => {
            if (a.isFocused !== b.isFocused) return a.isFocused ? -1 : 1;
            // Then nearest-first: a node at the front of the cone is the one the
            // user is looking at.
            return b.near - a.near;
        });

        const placed = [];
        for (const { point, radius, near, isFocused } of ordered) {
            const text = this._truncate(point.node.metadata.label || point.node.id, 20);
            const width = ctx.measureText(text).width;
            const x = point.x;
            const y = point.y - radius - 5;
            const box = { left: x - width / 2, right: x + width / 2, top: y - 11, bottom: y + 3 };

            const collides = placed.some((other) =>
                box.left < other.right && other.left < box.right
                && box.top < other.bottom && other.top < box.bottom);
            if (collides && !isFocused) continue;

            ctx.fillStyle = isFocused
                ? 'rgba(0,255,255,0.95)'
                : `rgba(255,255,255,${0.4 + near * 0.55})`;
            ctx.fillText(text, x, y);
            placed.push(box);
        }
    }

    _truncate(text, max) {
        return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    }

    // --- gestures ----------------------------------------------------------

    _bindGestures() {
        const canvas = this.canvas;

        // Pointer events cover mouse, touch and pen with one code path, so the
        // gesture behaves the same on a phone and a trackpad.
        canvas.addEventListener('pointerdown', (event) => {
            canvas.setPointerCapture?.(event.pointerId);
            this._drag = {
                startX: event.clientX,
                startY: event.clientY,
                lastX: event.clientX,
                lastY: event.clientY,
                moved: 0,
            };
        });

        canvas.addEventListener('pointermove', (event) => {
            if (!this._drag) return;

            const dx = event.clientX - this._drag.lastX;
            const dy = event.clientY - this._drag.lastY;
            this._drag.lastX = event.clientX;
            this._drag.lastY = event.clientY;
            this._drag.moved += Math.abs(dx) + Math.abs(dy);

            // Horizontal spins, vertical travels the tiers. Both apply at once so
            // a diagonal drag does the sensible thing rather than being rejected.
            this.spin += dx * 0.006;
            this.tierFocus = this._clampTier(this.tierFocus - dy / TIER_HEIGHT);
        });

        const end = (event) => {
            if (!this._drag) return;
            const wasTap = this._drag.moved < TAP_SLOP;
            const { startX, startY } = this._drag;
            this._drag = null;

            if (!wasTap) {
                // Settle on a whole tier: leaving it between two would make the
                // "current tier" readout and the highlighted ring disagree.
                this.tierFocus = this._clampTier(Math.round(this.tierFocus));
                return;
            }

            const rect = canvas.getBoundingClientRect();
            this._handleTap(startX - rect.left, startY - rect.top);
        };

        canvas.addEventListener('pointerup', end);

        // A double tap descends into whatever was tapped.
        //
        // A single tap already means "select", and selecting is how you look around, so
        // descending needs the second tap — the same reason the Node Manager's outline
        // needs one tap to select and two to open the page.
        canvas.addEventListener('dblclick', (event) => {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            for (let i = this._hits.length - 1; i >= 0; i--) {
                const hit = this._hits[i];
                const dx = x - hit.x;
                const dy = y - hit.y;
                if (dx * dx + dy * dy <= hit.r * hit.r) {
                    const graph = this.getGraph();
                    const name = graph?.getNode(hit.id)?.metadata.label || hit.id;
                    if (this.enterCone(hit.id)) {
                        this.notify(`Inside "${name}"`);
                    } else {
                        this.notify(`"${name}" contains nothing to descend into`, 'warning');
                    }
                    return;
                }
            }
        });
        canvas.addEventListener('pointercancel', () => { this._drag = null; });

        // A wheel is the desktop equivalent of the vertical drag.
        canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            this.tierFocus = this._clampTier(Math.round(this.tierFocus + Math.sign(event.deltaY)));
        }, { passive: false });
    }

    /** The deepest tier this cone shows, in its own local numbering. */
    _maxTier(graph, view = null) {
        if (!view?.ids) return graph.stats.maxDepth;
        let max = 0;
        for (const id of view.ids) {
            const node = graph.getNode(id);
            if (node) max = Math.max(max, view.depthOf(node));
        }
        return max;
    }

    _clampTier(value) {
        // The deepest tier of THIS cone, not of the whole map. Using the map's depth
        // inside a descended cone would let you scroll past the bottom into empty space
        // and then wonder where everything went.
        const graph = this.getGraph();
        if (!graph) return 0;
        const maxTier = this._maxTier(graph, this._view(graph));
        return Math.max(0, Math.min(maxTier, value));
    }

    _handleTap(x, y) {
        // The collar first: it is drawn above the apex and over everything, so it should
        // be hit before the nodes underneath it.
        for (const hit of this._collarHits ?? []) {
            const dx = x - hit.x;
            const dy = y - hit.y;
            if (dx * dx + dy * dy <= hit.r * hit.r) {
                this._selfInitiatedFocus = true;
                this.onFocusNode(hit.id);
                this._selfInitiatedFocus = false;
                const label = this.getGraph()?.getNode(hit.id)?.metadata.label;
                if (label) this.notify(`Selected "${label}"`);
                return;
            }
        }

        // Nearest hit wins, and _hits is ordered far-to-near, so scanning in
        // reverse prefers whichever node is drawn on top.
        for (let i = this._hits.length - 1; i >= 0; i--) {
            const hit = this._hits[i];
            const dx = x - hit.x;
            const dy = y - hit.y;
            if (dx * dx + dy * dy <= hit.r * hit.r) {
                this._selfInitiatedFocus = true;
                this.onFocusNode(hit.id);
                this._selfInitiatedFocus = false;
                const label = this.getGraph()?.getNode(hit.id)?.metadata.label;
                if (label) this.notify(`Selected "${label}"`);
                return;
            }
        }
    }

    // --- styles ------------------------------------------------------------

    _injectStyles() {
        if (document.getElementById('cone-view-styles')) return;

        const style = document.createElement('style');
        style.id = 'cone-view-styles';
        style.textContent = `
            .cone-view {
                position: fixed;
                inset: 0;
                /* Clears the dock at whichever edge it is on: bottom on a phone,
                   top on a wide screen. --dock-top-height is 0 when the dock is
                   bottom-anchored, and vice versa. */
                top: var(--dock-top-height, 0px);
                bottom: var(--dock-height, 0px);
                z-index: 900;
                background: #000;
            }
            .cone-view.hidden { display: none; }

            .cone-canvas {
                display: block;
                width: 100%;
                height: 100%;
                /* The gestures are the interface, so the browser must not claim
                   them for scrolling or pinch-zoom first. */
                touch-action: none;
                cursor: grab;
            }
            .cone-canvas:active { cursor: grabbing; }

            .cone-breadcrumb {
                position: absolute;
                top: calc(var(--dock-top-height, 0px) + 10px);
                left: 12px;
                right: 56px;
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 4px;
                z-index: 2;
            }
            .cone-breadcrumb[hidden] { display: none; }
            .cone-crumb {
                background: rgba(0,0,0,0.6);
                border: 1px solid #333;
                border-radius: 999px;
                color: #9dd;
                font-family: inherit;
                font-size: 11px;
                min-height: 26px;
                padding: 2px 10px;
                cursor: pointer;
            }
            .cone-crumb:hover { border-color: #0ff; color: #0ff; }
            /* The cone you are in. Disabled because pressing it would do nothing, and a
               control that does nothing is worse than one that is plainly inert. */
            .cone-crumb.current {
                background: rgba(0,255,255,0.14);
                border-color: #0ff;
                color: #fff;
                cursor: default;
            }
            .cone-crumb-sep { color: #555; font-size: 11px; }

            .cone-readout {
                position: absolute;
                top: 12px;
                left: 12px;
                right: 60px;
                display: flex;
                flex-direction: column;
                gap: 2px;
                pointer-events: none;
            }
            .cone-tier-label {
                color: #0ff;
                font-size: 12px;
                font-weight: 600;
                letter-spacing: 1px;
                text-transform: uppercase;
            }
            .cone-hint { color: #666; font-size: 11px; }

            .cone-close {
                position: absolute;
                top: 10px;
                right: 10px;
                min-width: 40px;
                min-height: 40px;
                background: rgba(0,0,0,0.7);
                border: 1px solid #333;
                border-radius: 8px;
                color: #fff;
                font-size: 20px;
                line-height: 1;
                cursor: pointer;
            }
            .cone-close:hover { border-color: #0ff; }

            @media (max-width: 720px), (max-height: 500px) {
                .cone-readout { top: 10px; left: 10px; }
                .cone-hint { font-size: 10px; }
            }
        `;
        document.head.appendChild(style);
    }
}
