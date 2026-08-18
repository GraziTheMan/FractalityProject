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
/** Movement beyond this many pixels is a drag, not a tap. */
const TAP_SLOP = 10;

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

        this.container.querySelector('.cone-close')
            .addEventListener('click', () => this.hide());

        this._bindGestures();
        this._injectStyles();
        window.addEventListener('resize', this._onResize);
    }

    show() {
        this.init();
        this.container.classList.remove('hidden');
        this.isOpen = true;

        // Open on the tier the 3D view is looking at, so switching surfaces does
        // not lose the user's place.
        const graph = this.getGraph();
        const focused = graph?.getNode(this.getFocusedNode());
        if (focused) this.tierFocus = focused.depth;

        this._resize();
        this._start();
        this.onVisibilityChange(true);
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
    _computeAngles(graph) {
        const angles = new Map();
        const leafCounts = new Map();

        // Leaf counts first, deepest-first, so a parent can read its children's.
        const order = [];
        const roots = graph.getRootNodes();
        const stack = [...roots.map((n) => n.id)];
        const seen = new Set();
        while (stack.length > 0) {
            const id = stack.pop();
            if (seen.has(id)) continue;
            seen.add(id);
            order.push(id);
            for (const childId of graph.getNode(id)?.childIds ?? []) stack.push(childId);
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
    _project(graph, angles) {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        const centreX = width / 2;
        const centreY = height / 2;

        // Keep the whole cone inside a phone's width at the widest tier.
        const maxTier = Math.max(1, graph.stats.maxDepth);
        const scale = Math.min(1, (width * 0.42) / (maxTier * RADIUS_PER_TIER));

        const out = [];
        for (const node of graph.nodes.values()) {
            const angle = (angles.get(node.id) ?? 0) + this.spin;
            const radius = node.depth * RADIUS_PER_TIER * scale;

            // cos gives the near/far axis. Squashing it to 0.28 is the ellipse
            // the cone's circular tier makes when seen nearly edge-on.
            const nearness = Math.cos(angle);
            out.push({
                node,
                x: centreX + radius * Math.sin(angle),
                y: centreY + (node.depth - this.tierFocus) * TIER_HEIGHT * scale
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

        const angles = this._computeAngles(graph);
        const points = this._project(graph, angles);
        const byId = new Map(points.map((p) => [p.node.id, p]));
        const focusedId = this.getFocusedNode();
        const tier = Math.round(this.tierFocus);

        // Tier guides: the ellipse each tier's circle makes at this angle.
        const maxTier = graph.stats.maxDepth;
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

        // Edges, so the cone reads as a tree and not a cloud of dots.
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
        const count = graph.getNodesAtDepth(tier).length;
        const focused = focusedId ? graph.getNode(focusedId) : null;
        const parts = [`Tier ${tier} · ${count} node${count === 1 ? '' : 's'} of ${graph.nodes.size}`];
        if (focused) {
            parts.push(`selected: ${focused.metadata.label || focused.id}`);
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
        canvas.addEventListener('pointercancel', () => { this._drag = null; });

        // A wheel is the desktop equivalent of the vertical drag.
        canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            this.tierFocus = this._clampTier(Math.round(this.tierFocus + Math.sign(event.deltaY)));
        }, { passive: false });
    }

    _clampTier(value) {
        const maxTier = this.getGraph()?.stats.maxDepth ?? 0;
        return Math.max(0, Math.min(maxTier, value));
    }

    _handleTap(x, y) {
        // Nearest hit wins, and _hits is ordered far-to-near, so scanning in
        // reverse prefers whichever node is drawn on top.
        for (let i = this._hits.length - 1; i >= 0; i--) {
            const hit = this._hits[i];
            const dx = x - hit.x;
            const dy = y - hit.y;
            if (dx * dx + dy * dy <= hit.r * hit.r) {
                this.onFocusNode(hit.id);
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
