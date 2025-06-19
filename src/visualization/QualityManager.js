// src/visualization/QualityManager.js

/**
 * QualityManager - Adaptive Rendering Quality
 * 
 * Monitors performance and automatically adjusts rendering quality
 * to maintain target frame rate.
 */
export class QualityManager {
    constructor(renderer, performanceMonitor) {
        this.renderer = renderer;
        this.performance = performanceMonitor;
        
        // Quality levels
        this.qualityLevels = {
            ultra: 1.0,
            high: 0.85,
            medium: 0.7,
            low: 0.5,
            minimum: 0.3
        };
        
        // Current quality state
        this.currentQuality = this.qualityLevels.high;
        this.currentLevel = 'high';
        this.targetQuality = this.currentQuality;
        
        // Adaptive settings
        this.adaptive = {
            enabled: true,
            targetFPS: 60,
            minFPS: 30,
            sampleWindow: 60,      // frames
            adjustmentRate: 0.05,
            adjustmentDelay: 1000, // ms between adjustments
            lastAdjustment: 0
        };
        
        // Quality features toggle
        this.features = {
            shadows: { threshold: 0.7, enabled: true },
            antialias: { threshold: 0.6, enabled: true },
            highPolyGeometry: { threshold: 0.5, enabled: true },
            postProcessing: { threshold: 0.8, enabled: false },
            particles: { threshold: 0.9, enabled: false },
            reflections: { threshold: 0.85, enabled: false }
        };
        
        // Performance history
        this.fpsHistory = [];
        this.maxHistoryLength = 120;
        
        // Quality change listeners
        this.listeners = new Set();
    }
    
    /**
     * Update quality based on performance
     */
    update() {
        if (!this.adaptive.enabled) return;
        
        const now = performance.now();
        
        // Check if enough time has passed since last adjustment
        if (now - this.adaptive.lastAdjustment < this.adaptive.adjustmentDelay) {
            return;
        }
        
        // Get current FPS
        const currentFPS = this.performance.currentFPS;
        
        // Add to history
        this.fpsHistory.push(currentFPS);
        if (this.fpsHistory.length > this.maxHistoryLength) {
            this.fpsHistory.shift();
        }
        
        // Need enough samples
        if (this.fpsHistory.length < this.adaptive.sampleWindow) {
            return;
        }
        
        // Calculate average FPS over sample window
        const recentSamples = this.fpsHistory.slice(-this.adaptive.sampleWindow);
        const averageFPS = recentSamples.reduce((a, b) => a + b, 0) / recentSamples.length;
        
        // Determine quality adjustment
        let adjustment = 0;
        
        if (averageFPS < this.adaptive.minFPS) {
            // Critical performance - larger decrease
            adjustment = -this.adaptive.adjustmentRate * 2;
        } else if (averageFPS < this.adaptive.targetFPS * 0.9) {
            // Below target - decrease quality
            adjustment = -this.adaptive.adjustmentRate;
        } else if (averageFPS > this.adaptive.targetFPS * 0.95 && this.currentQuality < 1.0) {
            // Above target with headroom - increase quality
            adjustment = this.adaptive.adjustmentRate;
        }
        
        if (adjustment !== 0) {
            this._adjustQuality(adjustment);
            this.adaptive.lastAdjustment = now;
        }
    }
    
    /**
     * Adjust quality by delta
     */
    _adjustQuality(delta) {
        const previousQuality = this.currentQuality;
        this.targetQuality = Math.max(0.1, Math.min(1.0, this.currentQuality + delta));
        
        // Smooth transition
        this.currentQuality = this._lerp(this.currentQuality, this.targetQuality, 0.5);
        
        // Update level name
        this._updateQualityLevel();
        
        // Apply quality settings
        this._applyQualitySettings();
        
        // Notify listeners
        if (Math.abs(previousQuality - this.currentQuality) > 0.01) {
            this._notifyListeners({
                quality: this.currentQuality,
                level: this.currentLevel,
                features: this._getEnabledFeatures()
            });
        }
    }
    
    /**
     * Set quality directly
     */
    setQuality(quality) {
        this.currentQuality = Math.max(0.1, Math.min(1.0, quality));
        this.targetQuality = this.currentQuality;
        
        this._updateQualityLevel();
        this._applyQualitySettings();
        
        this._notifyListeners({
            quality: this.currentQuality,
            level: this.currentLevel,
            features: this._getEnabledFeatures()
        });
        
        return this.currentQuality;
    }
    
    /**
     * Set quality by level name
     */
    setQualityLevel(level) {
        if (level in this.qualityLevels) {
            return this.setQuality(this.qualityLevels[level]);
        }
        
        console.warn(`Unknown quality level: ${level}`);
        return this.currentQuality;
    }
    
    /**
     * Toggle quality between high and low
     */
    toggle() {
        if (this.currentQuality > 0.6) {
            return this.setQualityLevel('low');
        } else {
            return this.setQualityLevel('high');
        }
    }
    
    /**
     * Increase quality by one level
     */
    increaseQuality() {
        const levels = Object.entries(this.qualityLevels)
            .sort((a, b) => a[1] - b[1]);
        
        for (let i = 0; i < levels.length; i++) {
            if (levels[i][1] > this.currentQuality) {
                return this.setQualityLevel(levels[i][0]);
            }
        }
        
        return this.setQualityLevel('ultra');
    }
    
    /**
     * Decrease quality by one level
     */
    decreaseQuality() {
        const levels = Object.entries(this.qualityLevels)
            .sort((a, b) => b[1] - a[1]);
        
        for (let i = 0; i < levels.length; i++) {
            if (levels[i][1] < this.currentQuality) {
                return this.setQualityLevel(levels[i][0]);
            }
        }
        
        return this.setQualityLevel('minimum');
    }
    
    /**
     * Update quality level name
     */
    _updateQualityLevel() {
        let closestLevel = 'medium';
        let closestDistance = Infinity;
        
        for (const [level, value] of Object.entries(this.qualityLevels)) {
            const distance = Math.abs(value - this.currentQuality);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestLevel = level;
            }
        }
        
        this.currentLevel = closestLevel;
    }
    
    /**
     * Apply quality settings to renderer
     */
    _applyQualitySettings() {
        // Update renderer quality
        this.renderer.setQuality(this.currentQuality);
        
        // Toggle features based on quality
        for (const [feature, config] of Object.entries(this.features)) {
            const shouldEnable = this.currentQuality >= config.threshold;
            
            if (config.enabled !== shouldEnable) {
                config.enabled = shouldEnable;
                this._toggleFeature(feature, shouldEnable);
            }
        }
    }
    
    /**
     * Toggle specific rendering feature
     */
    _toggleFeature(feature, enabled) {
        switch (feature) {
            case 'shadows':
                this.renderer.shadowsEnabled = enabled;
                if (this.renderer.renderer) {
                    this.renderer.renderer.shadowMap.enabled = enabled;
                }
                break;
                
            case 'antialias':
                // Antialiasing requires renderer recreation, so we just track it
                this.renderer.antialias = enabled;
                break;
                
            case 'highPolyGeometry':
                // Trigger geometry update in renderer
                if (!enabled) {
                    this.renderer._createLowPolyGeometry();
                } else {
                    this.renderer._createGeometry();
                }
                break;
                
            case 'postProcessing':
                // Future: Enable/disable post-processing passes
                break;
                
            case 'particles':
                // Future: Enable/disable particle effects
                break;
                
            case 'reflections':
                // Future: Enable/disable screen-space reflections
                break;
        }
    }
    
    /**
     * Get enabled features
     */
    _getEnabledFeatures() {
        const enabled = [];
        
        for (const [feature, config] of Object.entries(this.features)) {
            if (config.enabled) {
                enabled.push(feature);
            }
        }
        
        return enabled;
    }
    
    /**
     * Set adaptive quality enabled
     */
    setAdaptive(enabled) {
        this.adaptive.enabled = enabled;
    }
    
    /**
     * Update adaptive settings
     */
    updateAdaptiveSettings(settings) {
        Object.assign(this.adaptive, settings);
    }
    
    /**
     * Add quality change listener
     */
    addListener(callback) {
        this.listeners.add(callback);
        
        // Return unsubscribe function
        return () => {
            this.listeners.delete(callback);
        };
    }
    
    /**
     * Notify listeners of quality change
     */
    _notifyListeners(data) {
        this.listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error('Error in quality change listener:', error);
            }
        });
    }
    
    /**
     * Linear interpolation helper
     */
    _lerp(a, b, t) {
        return a + (b - a) * t;
    }
    
    /**
     * Get quality statistics
     */
    getStats() {
        const avgFPS = this.fpsHistory.length > 0 ?
            this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length : 0;
        
        return {
            currentQuality: this.currentQuality,
            currentLevel: this.currentLevel,
            targetQuality: this.targetQuality,
            adaptiveEnabled: this.adaptive.enabled,
            averageFPS: avgFPS.toFixed(1),
            enabledFeatures: this._getEnabledFeatures(),
            qualityLevels: { ...this.qualityLevels }
        };
    }
    
    /**
     * Reset quality manager
     */
    reset() {
        this.currentQuality = this.qualityLevels.high;
        this.targetQuality = this.currentQuality;
        this.currentLevel = 'high';
        this.fpsHistory = [];
        this.adaptive.lastAdjustment = 0;
        
        this._applyQualitySettings();
    }
}