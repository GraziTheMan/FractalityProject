// src/intelligence/AnimationEngine.js
// Centralized animation controller — declarative CSS-transition helpers.

export class AnimationEngine {
    constructor() {
        this.animations = new WeakMap();
        this.defaultDuration = 300;
        this.defaultEasing = 'cubic-bezier(0.4, 0, 0.2, 1)';
    }

    fadeIn(element, delay = 0) {
        this._animate(element, {
            from: { opacity: 0 },
            to: { opacity: 1 },
            delay
        });
    }

    fadeOut(element, delay = 0) {
        this._animate(element, {
            from: { opacity: 1 },
            to: { opacity: 0 },
            delay
        });
    }

    fadeInUp(element, delay = 0) {
        this._animate(element, {
            from: { opacity: 0, transform: 'translateY(20px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
            delay
        });
    }

    scaleIn(element, delay = 0) {
        this._animate(element, {
            from: { opacity: 0, transform: 'translate(-50%, -50%) scale(0)' },
            to: { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
            delay
        });
    }

    slideInTop(element) {
        this._animate(element, {
            from: { transform: 'translateY(-100%)', opacity: 0 },
            to: { transform: 'translateY(0)', opacity: 1 }
        });
    }

    bounceIn(element) {
        element.style.animation = 'bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    }

    staggerIn(elements, staggerDelay = 50) {
        elements.forEach((element, index) => {
            if (element.classList.contains('connection-line')) {
                this.fadeIn(element, index * staggerDelay);
            } else {
                element.classList.add('visible');
                element.style.transitionDelay = `${index * staggerDelay}ms`;
            }
        });
    }

    _animate(element, options) {
        const { from, to, delay = 0, duration = this.defaultDuration } = options;

        // Set initial state
        Object.assign(element.style, from);

        // Force reflow
        void element.offsetWidth;

        // Set transition
        element.style.transition = `all ${duration}ms ${this.defaultEasing} ${delay}ms`;

        // Apply final state
        requestAnimationFrame(() => {
            Object.assign(element.style, to);
        });

        // Store animation data
        this.animations.set(element, { start: Date.now(), duration, delay });
    }

    cancelAll(element) {
        element.style.transition = '';
        this.animations.delete(element);
    }
}
