// src/mobile/MobileApp.js
// Main mobile application orchestrator

import { MenuController } from '../ui/MenuController.js';
import { ResonanceFeedController } from '../ui/ResonanceFeedController.js';
import { EventBus } from '../core/EventBus.js';
import { ParticleFieldRenderer } from '../visualization/ParticleFieldRenderer.js';
import { MobileConfig } from '../config/MobileConfig.js';
import { ResonanceEngine } from '../intelligence/ResonanceEngine.js';

export class MobileApp {
    constructor() {
        // Core services
        this.eventBus = new EventBus();
        this.config = new MobileConfig();
        this.resonanceEngine = new ResonanceEngine({
            eventBus: this.eventBus
        });

        // UI Controllers
        this.menuController = null;
        this.feedController = null;
        this.particleField = null;

        // State
        this.state = {
            initialized: false,
            currentView: 'main'
        };
    }

    async init() {
        if (this.state.initialized) return;

        try {
            // Initialize visual effects
            this._initParticleField();

            // Initialize UI controllers
            this._initMenuController();
            this._initFeedController();

            // Setup global event handlers
            this._setupGlobalEvents();

            // Connect to resonance network
            await this.resonanceEngine.connect();

            this.state.initialized = true;
            this.eventBus.emit('app:ready');

        } catch (error) {
            console.error('Failed to initialize mobile app:', error);
            this.eventBus.emit('app:error', error);
        }
    }

    _initParticleField() {
        const canvas = document.getElementById('particle-field');
        if (canvas) {
            this.particleField = new ParticleFieldRenderer({
                canvas,
                particleCount: 50,
                particleColor: this.config.theme.colors.primary
            });
            this.particleField.start();
        }
    }

    _initMenuController() {
        this.menuController = new MenuController({
            eventBus: this.eventBus,
            categories: this.config.menuCategories,
            handedness: this.config.getHandedness(),
            animationDuration: this.config.animations.duration
        });

        // Handle menu actions
        this.eventBus.on('action:execute', ({ action, data }) => {
            this._handleAction(action, data);
        });
    }

    _initFeedController() {
        this.feedController = new ResonanceFeedController({
            eventBus: this.eventBus,
            resonanceEngine: this.resonanceEngine,
            refreshInterval: this.config.feed.refreshInterval
        });

        // Handle feed events
        this.eventBus.on('pulse:view', (pulse) => {
            this._navigateToPulse(pulse);
        });

        this.eventBus.on('compose:open', ({ type }) => {
            this._openComposer(type);
        });
    }

    _setupGlobalEvents() {
        // Prevent double-tap zoom
        this._preventDoubleTapZoom();

        // Handle app lifecycle
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this._handleAppBackground();
            } else {
                this._handleAppForeground();
            }
        });

        // Handle orientation changes
        window.addEventListener('orientationchange', () => {
            this._handleOrientationChange();
        });

        // Performance monitoring
        if (this.config.debug.performanceMonitoring) {
            this._startPerformanceMonitoring();
        }
    }

    _handleAction(action, data) {
        const [category, subaction] = action.split(':');

        switch (category) {
            case 'view':
                this._switchView(subaction);
                break;
            case 'editor':
                this._openEditor(subaction);
                break;
            case 'consciousness':
                this._accessConsciousness(subaction);
                break;
            default:
                console.warn('Unknown action:', action);
        }
    }

    _switchView(viewType) {
        this.state.currentView = viewType;
        this.eventBus.emit('view:change', viewType);

        // In a full implementation, this would transition to different visualizations
        console.log('Switching to view:', viewType);
    }

    _openEditor(editorType) {
        this.eventBus.emit('editor:open', { type: editorType });
    }

    _accessConsciousness(fieldType) {
        this.eventBus.emit('consciousness:access', { field: fieldType });
    }

    _navigateToPulse(pulse) {
        // In full implementation, this would open a detailed view
        console.log('Navigating to pulse:', pulse.id);
    }

    _openComposer(type) {
        // In full implementation, this would open the pulse composer
        console.log('Opening composer for:', type);
    }

    _preventDoubleTapZoom() {
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
    }

    _handleAppBackground() {
        // Pause animations and reduce activity
        if (this.particleField) {
            this.particleField.pause();
        }
        this.resonanceEngine.enterLowPowerMode();
    }

    _handleAppForeground() {
        // Resume animations
        if (this.particleField) {
            this.particleField.resume();
        }
        this.resonanceEngine.exitLowPowerMode();
    }

    _handleOrientationChange() {
        const orientation = window.orientation;
        this.eventBus.emit('orientation:change', orientation);
    }

    _startPerformanceMonitoring() {
        setInterval(() => {
            const metrics = {
                memory: performance.memory?.usedJSHeapSize,
                fps: this.particleField?.getFPS(),
                connectionLatency: this.resonanceEngine.getLatency()
            };
            
            this.eventBus.emit('performance:metrics', metrics);
        }, 5000);
    }

    destroy() {
        this.menuController?.destroy();
        this.feedController?.destroy();
        this.particleField?.destroy();
        this.resonanceEngine?.disconnect();
    }
}

// ===========================
// src/ui/HapticFeedback.js
// Haptic feedback service

export class HapticFeedback {
    constructor(enabled = true) {
        this.enabled = enabled && 'vibrate' in navigator;
        this.patterns = {
            light: [10],
            medium: [20],
            heavy: [30],
            double: [20, 50, 20],
            success: [10, 50, 10, 50, 10],
            warning: [50, 100, 50],
            error: [100, 50, 100, 50, 100]
        };
    }

    trigger(pattern = 'light') {
        if (!this.enabled) return;
        
        const vibrationPattern = this.patterns[pattern] || this.patterns.light;
        navigator.vibrate(vibrationPattern);
    }

    custom(pattern) {
        if (!this.enabled) return;
        navigator.vibrate(pattern);
    }

    disable() {
        this.enabled = false;
    }

    enable() {
        this.enabled = 'vibrate' in navigator;
    }
}

// ===========================
// src/intelligence/AnimationEngine.js
// Centralized animation controller

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

// ===========================
// src/core/EventBus.js
// Central event system

export class EventBus {
    constructor() {
        this.events = new Map();
        this.debug = false;
    }

    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event).add(handler);
        
        return () => this.off(event, handler);
    }

    off(event, handler) {
        const handlers = this.events.get(event);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.events.delete(event);
            }
        }
    }

    emit(event, data) {
        if (this.debug) {
            console.log(`[EventBus] ${event}`, data);
        }
        
        const handlers = this.events.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    once(event, handler) {
        const wrappedHandler = (data) => {
            handler(data);
            this.off(event, wrappedHandler);
        };
        this.on(event, wrappedHandler);
    }

    clear() {
        this.events.clear();
    }
}

// ===========================
// src/config/MobileConfig.js
// Centralized configuration

export class MobileConfig {
    constructor() {
        this.theme = {
            colors: {
                primary: '#8b5cf6',
                secondary: '#6ee7b7',
                background: {
                    dark: '#0a0a0a',
                    medium: '#1a1a1a',
                    light: '#2a2a2a'
                },
                text: {
                    primary: '#e4e4e7',
                    secondary: '#a1a1aa'
                }
            }
        };

        this.animations = {
            duration: 300,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        };

        this.feed = {
            refreshInterval: 30000,
            itemsPerPage: 20
        };

        this.menuCategories = [
            {
                id: 'bubble_view',
                icon: '🌐',
                label: 'Bubble View',
                color: this.theme.colors.primary,
                subnodes: [
                    { id: 'resonance_map', label: '🔮 Resonance', action: 'view:resonance' },
                    { id: 'gravity_map', label: '🌌 Gravity', action: 'view:gravity' },
                    { id: 'energy_field', label: '⚡ Energy', action: 'view:energy' }
                ]
            },
            {
                id: 'editor',
                icon: '🧠',
                label: 'Node Editor',
                color: this.theme.colors.secondary,
                subnodes: [
                    { id: 'ai_drawer', label: '🤖 AI Assist', action: 'editor:ai' },
                    { id: 'manual_entry', label: '✍️ Manual', action: 'editor:manual' },
                    { id: 'voice_input', label: '🎤 Voice', action: 'editor:voice' }
                ]
            },
            {
                id: 'resonance_feed',
                icon: '📡',
                label: 'Feed',
                color: '#f59e0b',
                action: 'openFeed'
            },
            {
                id: 'consciousness',
                icon: '🌟',
                label: 'Consciousness',
                color: '#ec4899',
                subnodes: [
                    { id: 'personal_field', label: '👤 Personal', action: 'consciousness:personal' },
                    { id: 'collective_field', label: '🌍 Collective', action: 'consciousness:collective' },
                    { id: 'quantum_state', label: '⚛️ Quantum', action: 'consciousness:quantum' }
                ]
            }
        ];

        this.debug = {
            performanceMonitoring: true,
            eventLogging: false
        };
    }

    getHandedness() {
        return localStorage.getItem('handedness') || 'right';
    }

    setHandedness(hand) {
        localStorage.setItem('handedness', hand);
    }
}

// ===========================
// Entry point: mobile-entry.js

import { MobileApp } from '../src/mobile/MobileApp.js';

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    window.fractalityMobile = new MobileApp();
    await window.fractalityMobile.init();
    
    console.log('✨ Fractality Mobile initialized');
});