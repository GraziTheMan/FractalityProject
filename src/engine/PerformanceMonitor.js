// src/engine/PerformanceMonitor.js

/**
 * PerformanceMonitor - Comprehensive Performance Tracking
 * Claude's Domain: Measure everything, optimize ruthlessly
 * 
 * Tracks frame times, memory usage, and provides performance budgets
 * for all subsystems to ensure smooth 60 FPS operation.
 */
export class PerformanceMonitor {
    constructor() {
        // Frame metrics
        this.frameCount = 0;
        this.frameTime = 0;
        this.frameStart = 0;
        this.lastFrameTime = performance.now();
        this.deltaTime = 0;
        
        // FPS tracking
        this.currentFPS = 0;
        this.fpsUpdateInterval = 1000; // Update FPS every second
        this.lastFPSUpdate = performance.now();
        this.framesSinceLastUpdate = 0;
        
        // Frame time samples for averaging
        this.frameSamples = [];
        this.maxSamples = 60;
        this.averageFrameTime = 16.67;
        
        // Performance budgets (milliseconds)
        this.budgets = {
            total: 16.67,      // 60 FPS target
            animation: 4,       // Animation system budget
            layout: 2,          // Layout calculation budget
            rendering: 8,       // Rendering budget
            ui: 1,             // UI update budget
            overhead: 1.67     // System overhead
        };
        
        // Subsystem timing
        this.subsystemTimings = {
            animation: 0,
            layout: 0,
            rendering: 0,
            ui: 0,
            cace: 0,
            other: 0
        };
        
        // Memory tracking
        this.memoryStats = {
            used: 0,
            limit: 0,
            lastUpdate: 0,
            updateInterval: 1000 // Update memory stats every second
        };
        
        // Performance history
        this.history = {
            fps: new RollingAverage(120),      // 2 minutes at 60 FPS
            frameTime: new RollingAverage(120),
            memory: new RollingAverage(60)     // 1 minute
        };
        
        // Performance thresholds
        this.thresholds = {
            critical: 33.33,    // 30 FPS
            warning: 20,        // 50 FPS
            target: 16.67,      // 60 FPS
            optimal: 11.11      // 90 FPS
        };
        
        // Calibration data
        this.calibrationData = {
            deviceScore: 1.0,
            completed: false
        };
        
        // Performance events
        this.performanceEvents = [];
        this.maxEvents = 100;
    }
    
    /**
     * Start frame measurement
     */
    startFrame() {
        this.frameStart = performance.now();
        this.deltaTime = this.frameStart - this.lastFrameTime;
        this.lastFrameTime = this.frameStart;
        
        // Reset subsystem timings
        Object.keys(this.subsystemTimings).forEach(key => {
            this.subsystemTimings[key] = 0;
        });
    }
    
    /**
     * End frame measurement
     */
    endFrame() {
        const now = performance.now();
        this.frameTime = now - this.frameStart;
        
        // Update samples
        this.frameSamples.push(this.frameTime);
        if (this.frameSamples.length > this.maxSamples) {
            this.frameSamples.shift();
        }
        
        // Calculate average
        this.averageFrameTime = this.frameSamples.reduce((a, b) => a + b, 0) / this.frameSamples.length;
        
        // Update FPS
        this.framesSinceLastUpdate++;
        if (now - this.lastFPSUpdate >= this.fpsUpdateInterval) {
            this.currentFPS = Math.round(this.framesSinceLastUpdate * 1000 / (now - this.lastFPSUpdate));
            this.framesSinceLastUpdate = 0;
            this.lastFPSUpdate = now;
            
            // Update history
            this.history.fps.add(this.currentFPS);
            this.history.frameTime.add(this.averageFrameTime);
        }
        
        // Update memory stats
        this._updateMemoryStats();
        
        // Check for performance events
        this._checkPerformanceEvents();
        
        this.frameCount++;
    }
    
    /**
     * Start timing a subsystem
     */
    startTiming(subsystem) {
        return {
            subsystem,
            start: performance.now()
        };
    }
    
    /**
     * End timing a subsystem
     */
    endTiming(timing) {
        const duration = performance.now() - timing.start;
        this.subsystemTimings[timing.subsystem] = 
            (this.subsystemTimings[timing.subsystem] || 0) + duration;
        return duration;
    }
    
    /**
     * Measure a function's execution time
     */
    measure(subsystem, fn) {
        const timing = this.startTiming(subsystem);
        const result = fn();
        this.endTiming(timing);
        return result;
    }
    
    /**
     * Async measure
     */
    async measureAsync(subsystem, fn) {
        const timing = this.startTiming(subsystem);
        const result = await fn();
        this.endTiming(timing);
        return result;
    }
    
    /**
     * Get performance budget for a subsystem
     */
    getBudget(subsystem) {
        return this.budgets[subsystem] || 0;
    }
    
    /**
     * Get remaining frame budget
     */
    getRemainingBudget() {
        const elapsed = performance.now() - this.frameStart;
        return Math.max(0, this.budgets.total - elapsed);
    }
    
    /**
     * Check if we can continue processing this frame
     */
    canContinue() {
        return this.getRemainingBudget() > 2; // Leave 2ms buffer
    }
    
    /**
     * Get animation time budget based on current performance
     */
    getAnimationBudget() {
        const remainingBudget = this.getRemainingBudget();
        const animationBudget = this.budgets.animation;
        
        // Scale animation budget based on remaining frame time
        const scaleFactor = Math.min(1, remainingBudget / this.budgets.total);
        
        return {
            time: animationBudget * scaleFactor,
            scale: scaleFactor
        };
    }
    
    /**
     * Update memory statistics
     */
    _updateMemoryStats() {
        const now = performance.now();
        
        if (now - this.memoryStats.lastUpdate > this.memoryStats.updateInterval) {
            if (performance.memory) {
                this.memoryStats.used = performance.memory.usedJSHeapSize;
                this.memoryStats.limit = performance.memory.jsHeapSizeLimit;
                this.history.memory.add(this.memoryStats.used / 1048576); // Convert to MB
            }
            
            this.memoryStats.lastUpdate = now;
        }
    }
    
    /**
     * Get memory usage in MB
     */
    getMemoryUsage() {
        return Math.round(this.memoryStats.used / 1048576);
    }
    
    /**
     * Get memory usage percentage
     */
    getMemoryPercentage() {
        if (this.memoryStats.limit === 0) return 0;
        return Math.round((this.memoryStats.used / this.memoryStats.limit) * 100);
    }
    
    /**
     * Calibrate performance (run on startup)
     */
    async calibrate() {
        console.log('🔧 Calibrating device performance...');
        
        const calibrationStart = performance.now();
        const testIterations = 1000000;
        
        // Simple CPU test
        let sum = 0;
        for (let i = 0; i < testIterations; i++) {
            sum += Math.sqrt(i) * Math.sin(i);
        }
        
        const calibrationTime = performance.now() - calibrationStart;
        
        // Calculate device score (baseline = 10ms)
        this.calibrationData.deviceScore = 10 / calibrationTime;
        this.calibrationData.completed = true;
        
        // Adjust budgets based on device score
        this._adjustBudgetsForDevice();
        
        console.log(`✅ Calibration complete. Device score: ${this.calibrationData.deviceScore.toFixed(2)}`);
        
        return this.calibrationData;
    }
    
    /**
     * Adjust performance budgets based on device capabilities
     */
    _adjustBudgetsForDevice() {
        const score = this.calibrationData.deviceScore;
        
        if (score < 0.5) {
            // Low-end device
            this.budgets.total = 33.33; // Target 30 FPS
            this.budgets.animation = 2;
            this.budgets.rendering = 4;
        } else if (score < 1.0) {
            // Mid-range device
            this.budgets.total = 20; // Target 50 FPS
            this.budgets.animation = 3;
            this.budgets.rendering = 6;
        }
        // High-end devices keep default 60 FPS target
    }
    
    /**
     * Check for performance events
     */
    _checkPerformanceEvents() {
        // Frame drop detection
        if (this.frameTime > this.thresholds.critical) {
            this._addPerformanceEvent({
                type: 'frame_drop',
                severity: 'critical',
                frameTime: this.frameTime,
                timestamp: performance.now()
            });
        } else if (this.frameTime > this.thresholds.warning) {
            this._addPerformanceEvent({
                type: 'frame_warning',
                severity: 'warning',
                frameTime: this.frameTime,
                timestamp: performance.now()
            });
        }
        
        // Memory pressure detection
        const memoryPercentage = this.getMemoryPercentage();
        if (memoryPercentage > 90) {
            this._addPerformanceEvent({
                type: 'memory_pressure',
                severity: 'critical',
                memoryUsage: this.getMemoryUsage(),
                percentage: memoryPercentage,
                timestamp: performance.now()
            });
        }
    }
    
    /**
     * Add performance event
     */
    _addPerformanceEvent(event) {
        this.performanceEvents.push(event);
        
        // Trim old events
        if (this.performanceEvents.length > this.maxEvents) {
            this.performanceEvents.shift();
        }
        
        // Emit event for logging/monitoring
        window.dispatchEvent(new CustomEvent('fractality:performance', { 
            detail: event 
        }));
    }
    
    /**
     * Get performance summary
     */
    getSummary() {
        return {
            fps: this.currentFPS,
            frameTime: this.averageFrameTime.toFixed(2),
            memory: this.getMemoryUsage(),
            memoryPercentage: this.getMemoryPercentage(),
            deviceScore: this.calibrationData.deviceScore.toFixed(2),
            subsystems: { ...this.subsystemTimings },
            status: this._getPerformanceStatus()
        };
    }
    
    /**
     * Get performance status
     */
    _getPerformanceStatus() {
        if (this.averageFrameTime <= this.thresholds.optimal) return 'optimal';
        if (this.averageFrameTime <= this.thresholds.target) return 'good';
        if (this.averageFrameTime <= this.thresholds.warning) return 'fair';
        if (this.averageFrameTime <= this.thresholds.critical) return 'poor';
        return 'critical';
    }
    
    /**
     * Export performance data for analysis
     */
    exportData() {
        return {
            summary: this.getSummary(),
            history: {
                fps: this.history.fps.getAll(),
                frameTime: this.history.frameTime.getAll(),
                memory: this.history.memory.getAll()
            },
            events: this.performanceEvents,
            calibration: this.calibrationData,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Reset performance data
     */
    reset() {
        this.frameSamples = [];
        this.performanceEvents = [];
        this.history.fps.clear();
        this.history.frameTime.clear();
        this.history.memory.clear();
        this.frameCount = 0;
    }
}

/**
 * Rolling average helper class
 */
class RollingAverage {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.values = [];
        this.sum = 0;
    }
    
    add(value) {
        this.values.push(value);
        this.sum += value;
        
        if (this.values.length > this.maxSize) {
            this.sum -= this.values.shift();
        }
    }
    
    get average() {
        return this.values.length > 0 ? this.sum / this.values.length : 0;
    }
    
    get min() {
        return this.values.length > 0 ? Math.min(...this.values) : 0;
    }
    
    get max() {
        return this.values.length > 0 ? Math.max(...this.values) : 0;
    }
    
    getAll() {
        return [...this.values];
    }
    
    clear() {
        this.values = [];
        this.sum = 0;
    }
}