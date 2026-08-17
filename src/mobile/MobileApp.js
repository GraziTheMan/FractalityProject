// src/mobile/MobileApp.js
// Mobile application shell.

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
