// src/engine/FractalityState.js

/**
 * FractalityState - Central State Management
 * Claude's Domain: Clean, efficient, predictable state
 * 
 * This is the single source of truth for the application state.
 * All state changes flow through here.
 */
export class FractalityState {
    constructor() {
        // Navigation State
        this.focusNode = null;
        this.previousFocus = null;
        this.navigationHistory = [];
        this.maxHistoryLength = 20;
        
        // View Configuration
        this.viewConfig = {
            maxSiblings: 5,
            maxChildren: 7,
            showParent: true,
            showGrandparent: false,
            contextDepth: 2
        };
        
        // Layout State
        this.layoutConfig = {
            parentOffset: [0, 0, -10],
            siblingRadius: 8,
            childrenRadius: 5,
            spiralTightness: 1.0
        };
        
        // Animation State
        this.animationState = 'idle'; // 'idle', 'transitioning', 'loading'
        this.transitionProgress = 0;
        this.transitionStartTime = 0;
        this.transitionDuration = 1000; // ms
        
        // Interaction State
        this.hoveredNode = null;
        this.selectedNodes = new Set();
        this.interactionMode = 'navigate'; // 'navigate', 'select', 'explore'
        
        // System State
        this.needsLayout = true;
        this.dataLoaded = false;
        this.engineState = 'initializing'; // 'initializing', 'ready', 'error'
        
        // Performance State
        this.qualityMode = 'auto'; // 'auto', 'high', 'medium', 'low'
        this.targetFPS = 60;
        this.actualFPS = 0;
        
        // Feature Flags
        this.features = {
            caceEnabled: true,
            animationsEnabled: true,
            contextualVisuals: true,
            adaptiveQuality: true,
            debugMode: false
        };
        
        // State Change Listeners
        this._listeners = new Map();
        this._stateVersion = 0;
    }
    
    /**
     * Set focus node with validation
     */
    setFocus(nodeId) {
        if (nodeId === this.focusNode) return false;
        
        // Store previous state
        const previousState = {
            focusNode: this.focusNode,
            timestamp: Date.now()
        };
        
        // Update focus
        this.previousFocus = this.focusNode;
        this.focusNode = nodeId;
        
        // Update history
        this._updateNavigationHistory(previousState);
        
        // Mark for layout recalculation
        this.needsLayout = true;
        
        // Reset animation state
        this.animationState = 'transitioning';
        this.transitionProgress = 0;
        this.transitionStartTime = Date.now();
        
        // Notify listeners
        this._notifyListeners('focusChanged', {
            previous: this.previousFocus,
            current: this.focusNode
        });
        
        this._incrementVersion();
        return true;
    }
    
    /**
     * Update navigation history
     */
    _updateNavigationHistory(state) {
        this.navigationHistory.push({
            ...state,
            stateVersion: this._stateVersion
        });
        
        // Trim history if too long
        if (this.navigationHistory.length > this.maxHistoryLength) {
            this.navigationHistory.shift();
        }
    }
    
    /**
     * Navigate back in history
     */
    navigateBack() {
        if (this.navigationHistory.length === 0) return false;
        
        const previousState = this.navigationHistory.pop();
        if (previousState && previousState.focusNode) {
            this.setFocus(previousState.focusNode);
            return true;
        }
        
        return false;
    }
    
    /**
     * Update view configuration
     */
    updateViewConfig(updates) {
        const changed = this._deepMerge(this.viewConfig, updates);
        
        if (changed) {
            this.needsLayout = true;
            this._notifyListeners('viewConfigChanged', this.viewConfig);
            this._incrementVersion();
        }
        
        return changed;
    }
    
    /**
     * Update layout configuration
     */
    updateLayoutConfig(updates) {
        const changed = this._deepMerge(this.layoutConfig, updates);
        
        if (changed) {
            this.needsLayout = true;
            this._notifyListeners('layoutConfigChanged', this.layoutConfig);
            this._incrementVersion();
        }
        
        return changed;
    }
    
    /**
     * Set animation progress
     */
    updateAnimationProgress(deltaTime) {
        if (this.animationState !== 'transitioning') return;
        
        const elapsed = Date.now() - this.transitionStartTime;
        this.transitionProgress = Math.min(1, elapsed / this.transitionDuration);
        
        if (this.transitionProgress >= 1) {
            this.animationState = 'idle';
            this._notifyListeners('transitionComplete', {
                focusNode: this.focusNode
            });
        }
    }
    
    /**
     * Toggle selection of a node
     */
    toggleNodeSelection(nodeId) {
        if (this.selectedNodes.has(nodeId)) {
            this.selectedNodes.delete(nodeId);
            this._notifyListeners('nodeDeselected', { nodeId });
        } else {
            this.selectedNodes.add(nodeId);
            this._notifyListeners('nodeSelected', { nodeId });
        }
        
        this._incrementVersion();
    }
    
    /**
     * Clear all selections
     */
    clearSelections() {
        if (this.selectedNodes.size === 0) return;
        
        this.selectedNodes.clear();
        this._notifyListeners('selectionsCleared', {});
        this._incrementVersion();
    }
    
    /**
     * Set interaction mode
     */
    setInteractionMode(mode) {
        const validModes = ['navigate', 'select', 'explore'];
        if (!validModes.includes(mode)) {
            console.warn(`Invalid interaction mode: ${mode}`);
            return false;
        }
        
        if (this.interactionMode === mode) return false;
        
        const previousMode = this.interactionMode;
        this.interactionMode = mode;
        
        // Clear selections when leaving select mode
        if (previousMode === 'select' && mode !== 'select') {
            this.clearSelections();
        }
        
        this._notifyListeners('interactionModeChanged', {
            previous: previousMode,
            current: mode
        });
        
        this._incrementVersion();
        return true;
    }
    
    /**
     * Update feature flags
     */
    setFeature(feature, enabled) {
        if (!(feature in this.features)) {
            console.warn(`Unknown feature: ${feature}`);
            return false;
        }
        
        if (this.features[feature] === enabled) return false;
        
        this.features[feature] = enabled;
        this._notifyListeners('featureToggled', { feature, enabled });
        this._incrementVersion();
        
        return true;
    }
    
    /**
     * Update performance metrics
     */
    updatePerformanceMetrics(metrics) {
        this.actualFPS = metrics.fps || this.actualFPS;
        
        // Auto-adjust quality if needed
        if (this.features.adaptiveQuality && this.qualityMode === 'auto') {
            if (this.actualFPS < this.targetFPS * 0.8) {
                this._notifyListeners('qualityAdjustmentNeeded', { 
                    direction: 'decrease',
                    currentFPS: this.actualFPS,
                    targetFPS: this.targetFPS
                });
            } else if (this.actualFPS >= this.targetFPS * 0.95) {
                this._notifyListeners('qualityAdjustmentNeeded', { 
                    direction: 'increase',
                    currentFPS: this.actualFPS,
                    targetFPS: this.targetFPS
                });
            }
        }
    }
    
    /**
     * Reset state to initial values
     */
    reset() {
        this.focusNode = null;
        this.previousFocus = null;
        this.navigationHistory = [];
        this.selectedNodes.clear();
        this.hoveredNode = null;
        this.animationState = 'idle';
        this.transitionProgress = 0;
        this.needsLayout = true;
        this.engineState = 'ready';
        
        this._notifyListeners('stateReset', {});
        this._incrementVersion();
    }
    
    /**
     * Subscribe to state changes
     */
    subscribe(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        
        this._listeners.get(event).add(callback);
        
        // Return unsubscribe function
        return () => {
            const listeners = this._listeners.get(event);
            if (listeners) {
                listeners.delete(callback);
            }
        };
    }
    
    /**
     * Notify listeners of state change
     */
    _notifyListeners(event, data) {
        const listeners = this._listeners.get(event);
        if (!listeners) return;
        
        listeners.forEach(callback => {
            try {
                callback(data, this);
            } catch (error) {
                console.error(`Error in state listener for ${event}:`, error);
            }
        });
        
        // Also notify global listeners
        const globalListeners = this._listeners.get('*');
        if (globalListeners) {
            globalListeners.forEach(callback => {
                try {
                    callback({ event, data }, this);
                } catch (error) {
                    console.error('Error in global state listener:', error);
                }
            });
        }
    }
    
    /**
     * Deep merge helper
     */
    _deepMerge(target, source) {
        let changed = false;
        
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                if (this._deepMerge(target[key], source[key])) {
                    changed = true;
                }
            } else if (target[key] !== source[key]) {
                target[key] = source[key];
                changed = true;
            }
        }
        
        return changed;
    }
    
    /**
     * Increment state version
     */
    _incrementVersion() {
        this._stateVersion++;
    }
    
    /**
     * Get current state snapshot
     */
    getSnapshot() {
        return {
            version: this._stateVersion,
            focusNode: this.focusNode,
            previousFocus: this.previousFocus,
            animationState: this.animationState,
            transitionProgress: this.transitionProgress,
            selectedNodes: Array.from(this.selectedNodes),
            interactionMode: this.interactionMode,
            hoveredNode: this.hoveredNode,
            viewConfig: { ...this.viewConfig },
            layoutConfig: { ...this.layoutConfig },
            features: { ...this.features },
            engineState: this.engineState,
            needsLayout: this.needsLayout
        };
    }
    
    /**
     * Load state from snapshot
     */
    loadSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return false;
        
        // Validate and apply snapshot
        if (snapshot.focusNode !== undefined) this.focusNode = snapshot.focusNode;
        if (snapshot.previousFocus !== undefined) this.previousFocus = snapshot.previousFocus;
        if (snapshot.animationState) this.animationState = snapshot.animationState;
        if (snapshot.selectedNodes) {
            this.selectedNodes = new Set(snapshot.selectedNodes);
        }
        if (snapshot.viewConfig) this._deepMerge(this.viewConfig, snapshot.viewConfig);
        if (snapshot.layoutConfig) this._deepMerge(this.layoutConfig, snapshot.layoutConfig);
        if (snapshot.features) this._deepMerge(this.features, snapshot.features);
        
        this._notifyListeners('snapshotLoaded', { snapshot });
        this._incrementVersion();
        
        return true;
    }
}