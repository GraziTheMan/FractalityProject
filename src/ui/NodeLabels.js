// src/ui/NodeLabels.js
//
// Readable HTML labels floating over each visible node. The Family View only
// shows a handful of nodes at a time, so projecting their 3D positions to
// screen coordinates and positioning small HTML pills gives crisp, legible
// text at any zoom without per-node textures or extra draw calls.

export class NodeLabels {
    constructor() {
        this.container = null;
        this.pool = [];       // reusable label elements
        this.enabled = true;
    }

    init() {
        if (this.container) return;
        this._injectStyles();
        this.container = document.createElement('div');
        this.container.id = 'node-labels';
        document.body.appendChild(this.container);
    }

    setEnabled(on) {
        this.enabled = on;
        if (this.container) this.container.style.display = on ? '' : 'none';
    }

    /**
     * Reposition/label one element per visible node.
     * @param {Array} nodes  visible nodes (each has .position, .metadata, .opacity)
     * @param {THREE.Camera} camera
     */
    update(nodes, camera) {
        if (!this.enabled || !this.container || !camera) return;

        const w = window.innerWidth;
        const h = window.innerHeight;
        this._ensurePool(nodes.length);

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const el = this.pool[i];

            // Project the node center to normalized device coords.
            const v = node.position.clone().project(camera);
            const behind = v.z > 1 || v.z < -1;
            const faded = node.opacity !== undefined && node.opacity < 0.15;

            if (behind || faded) { el.style.display = 'none'; continue; }

            const x = (v.x * 0.5 + 0.5) * w;
            const y = (-v.y * 0.5 + 0.5) * h;

            const text = labelFor(node);
            if (el._text !== text) { el.textContent = text; el._text = text; }

            // Slightly below the node; emphasize the focus/high-priority label.
            el.style.display = '';
            el.style.transform = `translate(-50%, 0) translate(${x}px, ${y + 14}px)`;
            el.classList.toggle('focus', node.priority >= 3);
        }

        // Hide any leftover pooled labels.
        for (let i = nodes.length; i < this.pool.length; i++) {
            this.pool[i].style.display = 'none';
        }
    }

    _ensurePool(n) {
        while (this.pool.length < n) {
            const el = document.createElement('div');
            el.className = 'node-label';
            this.container.appendChild(el);
            this.pool.push(el);
        }
    }

    _injectStyles() {
        if (document.getElementById('node-labels-styles')) return;
        const style = document.createElement('style');
        style.id = 'node-labels-styles';
        style.textContent = `
            #node-labels {
                position: fixed; inset: 0; overflow: hidden;
                pointer-events: none; z-index: 2;
            }
            .node-label {
                position: absolute; top: 0; left: 0;
                max-width: 160px; padding: 2px 7px;
                font-family: 'Inter', -apple-system, system-ui, sans-serif;
                font-size: 12px; line-height: 1.3; font-weight: 500;
                color: #f4f4f5; background: rgba(10,10,14,0.66);
                border-radius: 6px; white-space: nowrap;
                overflow: hidden; text-overflow: ellipsis;
                text-shadow: 0 1px 2px rgba(0,0,0,0.8);
                transition: none;
            }
            .node-label.focus {
                color: #fff; background: rgba(139,92,246,0.55);
                font-weight: 600; font-size: 13px;
            }
        `;
        document.head.appendChild(style);
    }

    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
        this.pool = [];
    }
}

function labelFor(node) {
    const label = (node.metadata && node.metadata.label) || node.id || '';
    return label.length > 24 ? label.slice(0, 23) + '…' : label;
}
