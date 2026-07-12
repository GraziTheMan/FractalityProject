// src/visualization/CameraControls.js
//
// Lightweight orbit/zoom controls for touch and mouse, built on the renderer's
// existing camera-follow model: the camera sits at `cameraTarget + cameraOffset`
// and looks at the target, so orbiting = rotating the offset around the target
// and zooming = scaling the offset's length. No OrbitControls dependency.
//
// Tap vs. drag: a press that doesn't move past a threshold is reported via the
// onTap callback (node selection); anything that moves is an orbit and never
// selects.

import * as THREE from 'three';

export class CameraControls {
    /**
     * @param {FractalityRenderer} renderer  provides .cameraOffset (THREE.Vector3)
     * @param {HTMLCanvasElement} canvas
     * @param {(x:number,y:number)=>void} onTap  called on a non-drag tap/click
     */
    constructor(renderer, canvas, onTap = null) {
        this.renderer = renderer;
        this.canvas = canvas;
        this.onTap = onTap;

        this.rotateSpeed = 0.005;
        this.minRadius = 3;
        this.maxRadius = 150;
        this.tapThreshold = 8; // px of movement before a press becomes a drag

        this._spherical = new THREE.Spherical();
        this._dragging = false;
        this._moved = false;
        this._start = { x: 0, y: 0 };
        this._last = { x: 0, y: 0 };
        this._pinchDist = 0;
        this._handlers = [];

        this._bind();
    }

    /** True if the most recent gesture was a drag (so callers can skip select). */
    get moved() { return this._moved; }

    _on(target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        this._handlers.push([target, type, fn, opts]);
    }

    _bind() {
        const c = this.canvas;
        // Mouse
        this._on(c, 'mousedown', (e) => this._down(e.clientX, e.clientY));
        this._on(window, 'mousemove', (e) => { if (this._dragging) this._move(e.clientX, e.clientY); });
        this._on(window, 'mouseup', () => this._up());
        this._on(c, 'wheel', (e) => { e.preventDefault(); this._zoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
        // Touch
        this._on(c, 'touchstart', (e) => this._touchStart(e), { passive: false });
        this._on(c, 'touchmove', (e) => this._touchMove(e), { passive: false });
        this._on(c, 'touchend', (e) => this._touchEnd(e));
    }

    // --- press lifecycle (shared by mouse + single-touch) ---
    _down(x, y) {
        this._dragging = true;
        this._moved = false;
        this._start.x = this._last.x = x;
        this._start.y = this._last.y = y;
    }

    _move(x, y) {
        const totalDx = x - this._start.x;
        const totalDy = y - this._start.y;
        if (!this._moved && Math.hypot(totalDx, totalDy) > this.tapThreshold) {
            this._moved = true;
        }
        if (this._moved) {
            this._orbit(x - this._last.x, y - this._last.y);
        }
        this._last.x = x;
        this._last.y = y;
    }

    _up() {
        if (this._dragging && !this._moved && this.onTap) {
            this.onTap(this._start.x, this._start.y);
        }
        this._dragging = false;
    }

    // --- orbit / zoom on the camera offset ---
    _orbit(dx, dy) {
        const s = this._spherical.setFromVector3(this.renderer.cameraOffset);
        s.theta -= dx * this.rotateSpeed;
        s.phi -= dy * this.rotateSpeed;
        s.phi = Math.max(0.15, Math.min(Math.PI - 0.15, s.phi));
        s.makeSafe();
        this.renderer.cameraOffset.setFromSpherical(s);
    }

    _zoom(factor) {
        const s = this._spherical.setFromVector3(this.renderer.cameraOffset);
        s.radius = Math.max(this.minRadius, Math.min(this.maxRadius, s.radius * factor));
        this.renderer.cameraOffset.setFromSpherical(s);
    }

    // --- touch ---
    _touchStart(e) {
        if (e.touches.length === 1) {
            this._down(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2) {
            this._dragging = false;
            this._moved = true; // pinch is never a tap
            this._pinchDist = this._dist(e.touches);
        }
    }

    _touchMove(e) {
        if (e.touches.length === 1 && this._dragging) {
            e.preventDefault();
            this._move(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const d = this._dist(e.touches);
            if (this._pinchDist) this._zoom(this._pinchDist / d);
            this._pinchDist = d;
        }
    }

    _touchEnd(e) {
        if (e.touches.length === 0) this._up();
    }

    _dist(t) {
        return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    }

    destroy() {
        for (const [target, type, fn, opts] of this._handlers) {
            target.removeEventListener(type, fn, opts);
        }
        this._handlers = [];
    }
}
