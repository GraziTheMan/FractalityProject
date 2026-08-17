// src/visualization/ParticleFieldRenderer.js
// Lightweight 2D canvas particle field used as the mobile background effect.
//
// Deliberately canvas-2D rather than Three.js: this runs behind the mobile UI
// on low-end devices, so it must stay cheap and must not pull in a WebGL
// context that competes with the main FractalityRenderer.

export class ParticleFieldRenderer {
    constructor(options = {}) {
        this.canvas = options.canvas;
        if (!this.canvas) throw new Error('ParticleFieldRenderer requires a canvas');

        this.ctx = this.canvas.getContext('2d');
        this.particleCount = options.particleCount ?? 50;
        this.particleColor = options.particleColor || '#8b5cf6';
        this.maxSpeed = options.maxSpeed ?? 0.15;
        this.linkDistance = options.linkDistance ?? 90;

        this.particles = [];
        this.running = false;
        this.animationFrame = null;

        // FPS tracking
        this._lastFrame = 0;
        this._fps = 0;

        this._onResize = () => this._resize();
        this._resize();
        this._seedParticles();
    }

    start() {
        if (this.running) return;
        this.running = true;

        window.addEventListener('resize', this._onResize);
        this._lastFrame = performance.now();
        this._loop(this._lastFrame);
    }

    pause() {
        this.running = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    resume() {
        if (this.running) return;
        this.running = true;
        this._lastFrame = performance.now();
        this._loop(this._lastFrame);
    }

    /**
     * Most recent measured frames-per-second (0 while paused).
     */
    getFPS() {
        return Math.round(this._fps);
    }

    destroy() {
        this.pause();
        window.removeEventListener('resize', this._onResize);
        this.particles = [];

        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this.ctx = null;
        this.canvas = null;
    }

    // --- internals -------------------------------------------------------

    _resize() {
        // Match the backing store to the CSS size, accounting for DPR, but cap
        // DPR at 2 so retina phones don't pay for 3x pixels on a background.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = this.canvas.getBoundingClientRect();

        this.width = rect.width || window.innerWidth;
        this.height = rect.height || window.innerHeight;

        this.canvas.width = Math.floor(this.width * dpr);
        this.canvas.height = Math.floor(this.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    _seedParticles() {
        this.particles = Array.from({ length: this.particleCount }, () => ({
            x: Math.random() * this.width,
            y: Math.random() * this.height,
            vx: (Math.random() - 0.5) * this.maxSpeed * 2,
            vy: (Math.random() - 0.5) * this.maxSpeed * 2,
            r: 1 + Math.random() * 1.5
        }));
    }

    _loop(now) {
        if (!this.running) return;

        const delta = now - this._lastFrame;
        this._lastFrame = now;
        if (delta > 0) {
            // Exponential moving average keeps the readout stable
            this._fps = this._fps === 0 ? 1000 / delta : this._fps * 0.9 + (1000 / delta) * 0.1;
        }

        this._update(delta);
        this._draw();

        this.animationFrame = requestAnimationFrame((t) => this._loop(t));
    }

    _update(delta) {
        // Normalise motion to a 60fps step so speed is frame-rate independent
        const step = Math.min(delta, 50) / 16.67;

        for (const p of this.particles) {
            p.x += p.vx * step;
            p.y += p.vy * step;

            // Wrap rather than bounce: no visible edges on a background field
            if (p.x < 0) p.x += this.width;
            else if (p.x > this.width) p.x -= this.width;
            if (p.y < 0) p.y += this.height;
            else if (p.y > this.height) p.y -= this.height;
        }
    }

    _draw() {
        const ctx = this.ctx;
        if (!ctx) return;

        ctx.clearRect(0, 0, this.width, this.height);

        // Connecting lines first, so dots sit on top
        ctx.strokeStyle = this.particleColor;
        ctx.lineWidth = 0.5;

        for (let i = 0; i < this.particles.length; i++) {
            const a = this.particles[i];

            for (let j = i + 1; j < this.particles.length; j++) {
                const b = this.particles[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const distSq = dx * dx + dy * dy;

                if (distSq > this.linkDistance * this.linkDistance) continue;

                const dist = Math.sqrt(distSq);
                ctx.globalAlpha = (1 - dist / this.linkDistance) * 0.25;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }

        ctx.globalAlpha = 0.7;
        ctx.fillStyle = this.particleColor;
        for (const p of this.particles) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
    }
}
