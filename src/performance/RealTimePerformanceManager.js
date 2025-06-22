// src/performance/RealTimePerformanceManager.js
// Production-ready real-time performance management with frame budget enforcement

/**
 * Real-Time Performance Manager
 * Ensures 60 FPS target with adaptive quality and emergency protocols
 */
export class RealTimePerformanceManager {
    constructor(targetFPS = 60) {
        // Performance targets
        this.targetFPS = targetFPS;
        this.targetFrameTime = 1000 / targetFPS; // 16.67ms for 60 FPS
        this.frameBudget = this.targetFrameTime * 0.8; // 80% of frame time for safety
        
        // Frame timing
        this.frameCount = 0;
        this.startTime = performance.now();
        this.lastFrameTime = 0;
        this.frameTimeHistory = new Array(60).fill(16.67); // Rolling 60-frame history
        this.historyIndex = 0;
        
        // Performance metrics
        this.currentFPS = 60;
        this.averageFrameTime = 16.67;
        this.frameTimeVariance = 0;
        this.droppedFrames = 0;
        this.totalFrames = 0;
        
        // Subsystem timing budgets (milliseconds)
        this.budgets = {
            consciousness: 2.0,     // Consciousness processing
            animation: 4.0,         // Animation calculations
            rendering: 8.0,         // WebGL rendering
            ui: 1.0,               // UI updates
            networking: 0.5,       // Protocol/network
            overhead: 1.17         // System overhead (remaining budget)
        };
        
        // Dynamic quality levels
        this.qualityLevel = 1.0;    // 0.1 to 1.0
        this.minQualityLevel = 0.1;
        this.qualitySteps = [0.1, 0.25, 0.5, 0.75, 1.0];
        this.currentQualityIndex = 4; // Start at highest quality
        
        // Adaptive thresholds
        this.thresholds = {
            excellent: this.targetFrameTime * 0.6,  // < 10ms
            good: this.targetFrameTime * 0.8,       // < 13.3ms
            acceptable: this.targetFrameTime,        // < 16.67ms
            poor: this.targetFrameTime * 1.2,       // < 20ms
            critical: this.targetFrameTime * 1.5    // < 25ms
        };
        
        // Emergency protocols
        this.emergencyMode = false;
        this.emergencyThreshold = 5; // 5 consecutive poor frames
        this.poorFrameCount = 0;
        this.recoveryThreshold = 30; // 30 good frames to exit emergency
        this.goodFrameCount = 0;
        
        // Thermal and power awareness
        this.thermalThrottling = false;
        this.powerSaveMode = false;
        this.batteryLevel = 1.0;
        
        // Subsystem managers
        this.subsystemTimers = new Map();
        this.subsystemBudgetExceeded = new Map();
        this.activeTimers = new Set();
        
        // Circuit breaker for subsystems
        this.subsystemErrors = new Map();
        this.maxSubsystemErrors = 5;
        this.disabledSubsystems = new Set();
        
        // Performance monitoring
        this.monitoring = {
            enabled: true,
            sampleInterval: 1000, // 1 second
            lastSample: 0,
            samples: [],
            maxSamples: 300 // 5 minutes of data
        };
        
        // Alert callbacks
        this.alertCallbacks = [];
        
        console.log(`🚀 Real-Time Performance Manager initialized (target: ${targetFPS} FPS)`);
    }
    
    /**
     * Start frame timing with budget enforcement
     */
    startFrame() {
        const now = performance.now();
        this.frameStartTime = now;
        
        // Calculate frame time
        if (this.lastFrameTime > 0) {
            const frameTime = now - this.lastFrameTime;
            this._updateFrameMetrics(frameTime);
        }
        
        this.lastFrameTime = now;
        this.totalFrames++;
        
        // Reset subsystem timers
        this.subsystemTimers.clear();
        this.activeTimers.clear();
        
        // Check if we need to adjust quality
        this._evaluatePerformance();
        
        return {
            frameNumber: this.totalFrames,
            budget: this.frameBudget,
            qualityLevel: this.qualityLevel,
            emergencyMode: this.emergencyMode
        };
    }
    
    /**
     * Start timing a subsystem
     */
    startSubsystem(name) {
        if (this.disabledSubsystems.has(name)) {
            return null; // Subsystem disabled due to errors
        }
        
        const timer = {
            name,
            startTime: performance.now(),
            budget: this.budgets[name] || 1.0,
            exceeded: false
        };
        
        this.subsystemTimers.set(name, timer);
        this.activeTimers.add(name);
        
        return timer;
    }
    
    /**
     * End timing a subsystem and check budget
     */
    endSubsystem(name) {
        const timer = this.subsystemTimers.get(name);
        if (!timer) {
            console.warn(`⚠️ No timer found for subsystem: ${name}`);
            return null;
        }
        
        const endTime = performance.now();
        const duration = endTime - timer.startTime;
        timer.duration = duration;
        timer.exceeded = duration > timer.budget;
        
        this.activeTimers.delete(name);
        
        // Track budget exceeded
        if (timer.exceeded) {
            this.subsystemBudgetExceeded.set(name, 
                (this.subsystemBudgetExceeded.get(name) || 0) + 1);
            
            console.warn(`⏰ ${name} exceeded budget: ${duration.toFixed(2)}ms > ${timer.budget}ms`);
        }
        
        return {
            name: timer.name,
            duration,
            budget: timer.budget,
            exceeded: timer.exceeded,
            efficiency: Math.min(1.0, timer.budget / duration)
        };
    }
    
    /**
     * Check if we can continue processing or need to skip work
     */
    canContinue(subsystemName = 'unknown') {
        const elapsed = performance.now() - this.frameStartTime;
        const remaining = this.frameBudget - elapsed;
        
        // Emergency mode - only critical systems
        if (this.emergencyMode) {
            const criticalSystems = ['rendering', 'consciousness'];
            if (!criticalSystems.includes(subsystemName)) {
                return false;
            }
        }
        
        // Check if disabled
        if (this.disabledSubsystems.has(subsystemName)) {
            return false;
        }
        
        // Budget check
        const subsystemBudget = this.budgets[subsystemName] || 1.0;
        return remaining >= subsystemBudget;
    }
    
    /**
     * Get remaining frame budget
     */
    getRemainingBudget() {
        const elapsed = performance.now() - this.frameStartTime;
        return Math.max(0, this.frameBudget - elapsed);
    }
    
    /**
     * Get performance metrics for subsystem allocation
     */
    getSubsystemMetrics() {
        const metrics = {};
        
        for (const [name, timer] of this.subsystemTimers) {
            metrics[name] = {
                duration: timer.duration || 0,
                budget: timer.budget,
                exceeded: timer.exceeded,
                efficiency: timer.budget / (timer.duration || timer.budget)
            };
        }
        
        return metrics;
    }
    
    /**
     * Force emergency mode for extreme performance issues
     */
    triggerEmergencyMode(reason = 'Performance critical') {
        if (!this.emergencyMode) {
            this.emergencyMode = true;
            this.qualityLevel = this.minQualityLevel;
            this.currentQualityIndex = 0;
            
            console.error(`🚨 EMERGENCY MODE ACTIVATED: ${reason}`);
            this._triggerAlert('EMERGENCY_MODE', { reason, timestamp: performance.now() });
            
            // Reduce all budgets by 50%
            for (const subsystem in this.budgets) {
                this.budgets[subsystem] *= 0.5;
            }
        }
    }
    
    /**
     * Update quality level based on performance
     */
    adjustQuality(direction) {
        const oldQuality = this.qualityLevel;
        
        if (direction === 'down' && this.currentQualityIndex > 0) {
            this.currentQualityIndex--;
            this.qualityLevel = this.qualitySteps[this.currentQualityIndex];
            
            // Adjust budgets for lower quality
            this._adjustBudgetsForQuality();
            
        } else if (direction === 'up' && this.currentQualityIndex < this.qualitySteps.length - 1) {
            this.currentQualityIndex++;
            this.qualityLevel = this.qualitySteps[this.currentQualityIndex];
            
            // Adjust budgets for higher quality
            this._adjustBudgetsForQuality();
        }
        
        if (oldQuality !== this.qualityLevel) {
            console.log(`🎛️ Quality adjusted: ${oldQuality.toFixed(2)} → ${this.qualityLevel.toFixed(2)}`);
            this._triggerAlert('QUALITY_CHANGED', { 
                from: oldQuality, 
                to: this.qualityLevel,
                direction 
            });
        }
    }
    
    /**
     * Handle subsystem error
     */
    reportSubsystemError(subsystemName, error) {
        const errorCount = (this.subsystemErrors.get(subsystemName) || 0) + 1;
        this.subsystemErrors.set(subsystemName, errorCount);
        
        console.error(`❌ Subsystem error in ${subsystemName}:`, error);
        
        // Disable subsystem if too many errors
        if (errorCount >= this.maxSubsystemErrors) {
            this.disabledSubsystems.add(subsystemName);
            console.error(`🚫 Subsystem ${subsystemName} disabled due to excessive errors`);
            
            this._triggerAlert('SUBSYSTEM_DISABLED', {
                subsystem: subsystemName,
                errorCount,
                error: error.message
            });
        }
    }
    
    /**
     * Set thermal throttling state
     */
    setThermalThrottling(enabled, temperature = 0) {
        if (this.thermalThrottling !== enabled) {
            this.thermalThrottling = enabled;
            
            if (enabled) {
                // Reduce budgets for thermal throttling
                for (const subsystem in this.budgets) {
                    this.budgets[subsystem] *= 0.7; // 30% reduction
                }
                
                // Force quality down
                if (this.currentQualityIndex > 1) {
                    this.adjustQuality('down');
                }
                
                console.warn(`🌡️ Thermal throttling enabled (${temperature}°C)`);
            } else {
                // Restore budgets
                this._restoreOriginalBudgets();
                console.log(`❄️ Thermal throttling disabled`);
            }
            
            this._triggerAlert('THERMAL_THROTTLING', { 
                enabled, 
                temperature 
            });
        }
    }
    
    /**
     * Set power save mode
     */
    setPowerSaveMode(enabled, batteryLevel = 1.0) {
        if (this.powerSaveMode !== enabled) {
            this.powerSaveMode = enabled;
            this.batteryLevel = batteryLevel;
            
            if (enabled) {
                // Reduce target FPS and budgets
                this.targetFPS = Math.max(30, this.targetFPS * 0.6); // Reduce to 30-36 FPS
                this.targetFrameTime = 1000 / this.targetFPS;
                this.frameBudget = this.targetFrameTime * 0.8;
                
                // Force quality down
                this.adjustQuality('down');
                
                console.log(`🔋 Power save mode enabled (battery: ${(batteryLevel * 100).toFixed(1)}%)`);
            } else {
                // Restore original targets
                this.targetFPS = 60;
                this.targetFrameTime = 1000 / 60;
                this.frameBudget = this.targetFrameTime * 0.8;
                
                console.log(`🔌 Power save mode disabled`);
            }
            
            this._triggerAlert('POWER_SAVE_MODE', { 
                enabled, 
                batteryLevel 
            });
        }
    }
    
    /**
     * Add performance alert callback
     */
    addAlertCallback(callback) {
        this.alertCallbacks.push(callback);
    }
    
    /**
     * Get comprehensive performance report
     */
    getPerformanceReport() {
        const now = performance.now();
        const uptime = now - this.startTime;
        
        return {
            // Core metrics
            fps: this.currentFPS,
            averageFrameTime: this.averageFrameTime,
            frameTimeVariance: this.frameTimeVariance,
            droppedFrames: this.droppedFrames,
            totalFrames: this.totalFrames,
            uptime: uptime,
            
            // Quality and modes
            qualityLevel: this.qualityLevel,
            emergencyMode: this.emergencyMode,
            thermalThrottling: this.thermalThrottling,
            powerSaveMode: this.powerSaveMode,
            batteryLevel: this.batteryLevel,
            
            // Budget information
            frameBudget: this.frameBudget,
            budgets: { ...this.budgets },
            subsystemMetrics: this.getSubsystemMetrics(),
            
            // Health indicators
            performanceHealth: this._getPerformanceHealth(),
            disabledSubsystems: Array.from(this.disabledSubsystems),
            subsystemErrors: Object.fromEntries(this.subsystemErrors),
            
            // Recent performance samples
            recentSamples: this.monitoring.samples.slice(-10)
        };
    }
    
    /**
     * Start continuous performance monitoring
     */
    startMonitoring() {
        if (!this.monitoring.enabled) return;
        
        const monitor = () => {
            const now = performance.now();
            
            if (now - this.monitoring.lastSample >= this.monitoring.sampleInterval) {
                this._collectPerformanceSample();
                this.monitoring.lastSample = now;
            }
            
            // Continue monitoring
            requestAnimationFrame(monitor);
        };
        
        requestAnimationFrame(monitor);
        console.log('📊 Performance monitoring started');
    }
    
    // Private methods
    
    /**
     * Update frame timing metrics
     */
    _updateFrameMetrics(frameTime) {
        // Update history
        this.frameTimeHistory[this.historyIndex] = frameTime;
        this.historyIndex = (this.historyIndex + 1) % this.frameTimeHistory.length;
        
        // Calculate rolling average
        this.averageFrameTime = this.frameTimeHistory.reduce((a, b) => a + b) / this.frameTimeHistory.length;
        
        // Calculate FPS
        this.currentFPS = 1000 / this.averageFrameTime;
        
        // Calculate variance
        const variance = this.frameTimeHistory.reduce((sum, time) => {
            return sum + Math.pow(time - this.averageFrameTime, 2);
        }, 0) / this.frameTimeHistory.length;
        this.frameTimeVariance = Math.sqrt(variance);
        
        // Track dropped frames
        if (frameTime > this.targetFrameTime * 1.5) {
            this.droppedFrames++;
        }
        
        this.frameCount++;
    }
    
    /**
     * Evaluate performance and adjust accordingly
     */
    _evaluatePerformance() {
        const frameTime = this.averageFrameTime;
        
        // Determine performance level
        let performanceLevel;
        if (frameTime <= this.thresholds.excellent) {
            performanceLevel = 'excellent';
        } else if (frameTime <= this.thresholds.good) {
            performanceLevel = 'good';
        } else if (frameTime <= this.thresholds.acceptable) {
            performanceLevel = 'acceptable';
        } else if (frameTime <= this.thresholds.poor) {
            performanceLevel = 'poor';
        } else {
            performanceLevel = 'critical';
        }
        
        // Handle poor performance
        if (performanceLevel === 'poor' || performanceLevel === 'critical') {
            this.poorFrameCount++;
            this.goodFrameCount = 0;
            
            // Trigger emergency mode if needed
            if (this.poorFrameCount >= this.emergencyThreshold && !this.emergencyMode) {
                this.triggerEmergencyMode(`${this.poorFrameCount} consecutive poor frames`);
            } else if (!this.emergencyMode) {
                // Gradual quality reduction
                this.adjustQuality('down');
            }
            
        } else if (performanceLevel === 'excellent' || performanceLevel === 'good') {
            this.goodFrameCount++;
            this.poorFrameCount = 0;
            
            // Exit emergency mode if performance recovered
            if (this.emergencyMode && this.goodFrameCount >= this.recoveryThreshold) {
                this._exitEmergencyMode();
            } else if (!this.emergencyMode && this.goodFrameCount >= 10) {
                // Gradual quality increase
                this.adjustQuality('up');
                this.goodFrameCount = 0; // Reset to prevent constant increases
            }
        } else {
            // Acceptable performance - reset counters
            this.poorFrameCount = 0;
            this.goodFrameCount = 0;
        }
    }
    
    /**
     * Exit emergency mode
     */
    _exitEmergencyMode() {
        this.emergencyMode = false;
        this.goodFrameCount = 0;
        
        // Restore budgets
        this._restoreOriginalBudgets();
        
        console.log('✅ Emergency mode deactivated - performance recovered');
        this._triggerAlert('EMERGENCY_MODE_EXIT', { 
            timestamp: performance.now(),
            recoveryFrames: this.recoveryThreshold
        });
    }
    
    /**
     * Adjust budgets based on quality level
     */
    _adjustBudgetsForQuality() {
        const qualityFactor = this.qualityLevel;
        
        // Scale budgets with quality (except consciousness - always preserve)
        this.budgets.animation = 4.0 * qualityFactor;
        this.budgets.rendering = 8.0 * qualityFactor;
        this.budgets.ui = 1.0 * Math.max(0.5, qualityFactor); // Min 50% for UI
        // Keep consciousness budget stable for user experience
    }
    
    /**
     * Restore original budgets
     */
    _restoreOriginalBudgets() {
        this.budgets = {
            consciousness: 2.0,
            animation: 4.0,
            rendering: 8.0,
            ui: 1.0,
            networking: 0.5,
            overhead: 1.17
        };
        
        // Re-apply quality scaling
        this._adjustBudgetsForQuality();
    }
    
    /**
     * Get overall performance health score
     */
    _getPerformanceHealth() {
        let score = 1.0;
        
        // FPS impact
        const fpsRatio = this.currentFPS / this.targetFPS;
        score *= Math.min(1.0, fpsRatio);
        
        // Frame variance impact
        const maxVariance = 5.0; // 5ms variance threshold
        const varianceImpact = Math.max(0, 1.0 - (this.frameTimeVariance / maxVariance));
        score *= varianceImpact;
        
        // Dropped frames impact
        const dropRate = this.droppedFrames / Math.max(1, this.totalFrames);
        score *= Math.max(0, 1.0 - (dropRate * 10)); // 10% drop rate = 0 score
        
        // Emergency mode impact
        if (this.emergencyMode) {
            score *= 0.3; // Heavy penalty
        }
        
        // Disabled subsystems impact
        const disabledPenalty = this.disabledSubsystems.size * 0.1;
        score = Math.max(0, score - disabledPenalty);
        
        return Math.max(0, Math.min(1.0, score));
    }
    
    /**
     * Collect performance sample for monitoring
     */
    _collectPerformanceSample() {
        const sample = {
            timestamp: performance.now(),
            fps: this.currentFPS,
            frameTime: this.averageFrameTime,
            qualityLevel: this.qualityLevel,
            emergencyMode: this.emergencyMode,
            thermalThrottling: this.thermalThrottling,
            powerSaveMode: this.powerSaveMode,
            healthScore: this._getPerformanceHealth()
        };
        
        this.monitoring.samples.push(sample);
        
        // Trim old samples
        if (this.monitoring.samples.length > this.monitoring.maxSamples) {
            this.monitoring.samples.shift();
        }
    }
    
    /**
     * Trigger performance alert
     */
    _triggerAlert(type, data) {
        const alert = {
            type,
            timestamp: performance.now(),
            data
        };
        
        for (const callback of this.alertCallbacks) {
            try {
                callback(alert);
            } catch (error) {
                console.error('Performance alert callback error:', error);
            }
        }
    }
}

/**
 * Frame-based task scheduler with priority and time-slicing
 */
export class FrameTaskScheduler {
    constructor(performanceManager) {
        this.performanceManager = performanceManager;
        this.taskQueue = [];
        this.runningTasks = new Map();
        this.completedTasks = new Set();
        
        // Task priorities
        this.priorities = {
            CRITICAL: 0,    // Must complete this frame
            HIGH: 1,        // Complete within 2 frames
            NORMAL: 2,      // Complete within 5 frames
            LOW: 3,         // Complete when budget allows
            IDLE: 4         // Only when idle
        };
    }
    
    /**
     * Schedule a task with priority and time budget
     */
    scheduleTask(id, taskFn, priority = this.priorities.NORMAL, maxTime = 2.0) {
        const task = {
            id,
            taskFn,
            priority,
            maxTime,
            created: performance.now(),
            attempts: 0,
            completed: false
        };
        
        // Insert by priority
        const insertIndex = this.taskQueue.findIndex(t => t.priority > priority);
        if (insertIndex === -1) {
            this.taskQueue.push(task);
        } else {
            this.taskQueue.splice(insertIndex, 0, task);
        }
    }
    
    /**
     * Process tasks within available frame budget
     */
    processTasks() {
        const remaining = this.performanceManager.getRemainingBudget();
        const minTaskTime = 0.5; // Minimum 0.5ms per task
        
        if (remaining < minTaskTime) {
            return; // Not enough budget
        }
        
        const startTime = performance.now();
        
        while (this.taskQueue.length > 0 && (performance.now() - startTime) < remaining) {
            const task = this.taskQueue.shift();
            
            try {
                const taskStart = performance.now();
                const result = task.taskFn();
                const taskTime = performance.now() - taskStart;
                
                if (result === 'incomplete' && taskTime < task.maxTime) {
                    // Task needs more time - reschedule
                    task.attempts++;
                    if (task.attempts < 5) { // Max 5 attempts
                        this.taskQueue.unshift(task); // Back to front
                    }
                } else {
                    // Task completed or timed out
                    task.completed = true;
                    this.completedTasks.add(task.id);
                }
                
            } catch (error) {
                console.error(`Task ${task.id} failed:`, error);
                this.performanceManager.reportSubsystemError('task_scheduler', error);
            }
            
            // Check if we've used up our budget
            if ((performance.now() - startTime) >= remaining * 0.8) {
                break;
            }
        }
    }
    
    /**
     * Clear completed tasks
     */
    clearCompleted() {
        this.completedTasks.clear();
    }
    
    /**
     * Get scheduler statistics
     */
    getStats() {
        return {
            queueLength: this.taskQueue.length,
            completedCount: this.completedTasks.size,
            runningCount: this.runningTasks.size,
            priorities: Object.keys(this.priorities).map(key => ({
                name: key,
                count: this.taskQueue.filter(t => t.priority === this.priorities[key]).length
            }))
        };
    }
}

/**
 * Adaptive quality manager that interfaces with rendering systems
 */
export class AdaptiveQualityManager {
    constructor(performanceManager) {
        this.performanceManager = performanceManager;
        this.qualitySettings = {
            nodeCount: 1.0,        // Node visibility multiplier
            geometryDetail: 1.0,   // Geometry subdivision level
            shadowQuality: 1.0,    // Shadow resolution
            antialiasing: 1.0,     // AA sample count
            effectsIntensity: 1.0, // Post-processing effects
            animationSmoothing: 1.0 // Animation interpolation
        };
        
        this.originalSettings = { ...this.qualitySettings };
    }
    
    /**
     * Update quality settings based on performance level
     */
    updateQuality(qualityLevel) {
        const level = Math.max(0.1, Math.min(1.0, qualityLevel));
        
        // Apply non-linear scaling for different aspects
        this.qualitySettings.nodeCount = this._applyQualityCurve(level, 'nodeCount');
        this.qualitySettings.geometryDetail = this._applyQualityCurve(level, 'geometryDetail');
        this.qualitySettings.shadowQuality = this._applyQualityCurve(level, 'shadowQuality');
        this.qualitySettings.antialiasing = this._applyQualityCurve(level, 'antialiasing');
        this.qualitySettings.effectsIntensity = this._applyQualityCurve(level, 'effectsIntensity');
        this.qualitySettings.animationSmoothing = this._applyQualityCurve(level, 'animationSmoothing');
    }
    
    /**
     * Apply quality curve based on setting type
     */
    _applyQualityCurve(level, settingType) {
        switch (settingType) {
            case 'nodeCount':
                // Preserve most nodes until very low quality
                return level < 0.3 ? level * 2 : Math.min(1.0, 0.6 + level * 0.4);
            
            case 'geometryDetail':
                // Reduce geometry detail more aggressively
                return Math.pow(level, 1.5);
            
            case 'shadowQuality':
                // Shadows are expensive - reduce early
                return level < 0.5 ? 0 : Math.pow(level, 2);
            
            case 'antialiasing':
                // Step function for AA
                return level < 0.25 ? 0 : level < 0.5 ? 0.5 : 1.0;
            
            case 'effectsIntensity':
                // Linear reduction for effects
                return level;
            
            case 'animationSmoothing':
                // Keep smooth until very low quality
                return level < 0.2 ? 0.2 : level;
            
            default:
                return level;
        }
    }
    
    /**
     * Get current quality settings
     */
    getQualitySettings() {
        return { ...this.qualitySettings };
    }
    
    /**
     * Check if specific feature should be enabled
     */
    shouldEnable(feature) {
        const threshold = {
            shadows: 0.5,
            antialiasing: 0.25,
            postprocessing: 0.3,
            particleEffects: 0.4,
            reflections: 0.7
        };
        
        const setting = this.qualitySettings[feature] || this.performanceManager.qualityLevel;
        return setting >= (threshold[feature] || 0.5);
    }
}

// Usage example with integration
export function createProductionPerformanceSystem() {
    // Create performance manager
    const perfManager = new RealTimePerformanceManager(60);
    
    // Create task scheduler
    const taskScheduler = new FrameTaskScheduler(perfManager);
    
    // Create quality manager
    const qualityManager = new AdaptiveQualityManager(perfManager);
    
    // Add performance alerts
    perfManager.addAlertCallback((alert) => {
        console.log(`🔔 Performance Alert: ${alert.type}`, alert.data);
        
        // Update quality based on performance
        if (alert.type === 'QUALITY_CHANGED') {
            qualityManager.updateQuality(alert.data.to);
        }
    });
    
    // Start monitoring
    perfManager.startMonitoring();
    
    return {
        perfManager,
        taskScheduler,
        qualityManager,
        
        // Main frame processing function
        processFrame() {
            // Start frame timing
            const frameInfo = perfManager.startFrame();
            
            try {
                // Process scheduled tasks
                if (perfManager.canContinue('task_scheduler')) {
                    perfManager.startSubsystem('task_scheduler');
                    taskScheduler.processTasks();
                    perfManager.endSubsystem('task_scheduler');
                }
                
                return {
                    success: true,
                    frameInfo,
                    qualitySettings: qualityManager.getQualitySettings(),
                    performance: perfManager.getPerformanceReport()
                };
                
            } catch (error) {
                perfManager.reportSubsystemError('frame_processing', error);
                return {
                    success: false,
                    error: error.message,
                    frameInfo
                };
            }
        }
    };
}

// Integration with Three.js renderer
export function integrateWithRenderer(renderer, performanceSystem) {
    const { perfManager, qualityManager } = performanceSystem;
    
    // Override renderer methods to add performance tracking
    const originalRender = renderer.render;
    renderer.render = function(scene, camera) {
        if (!perfManager.canContinue('rendering')) {
            return; // Skip rendering if no budget
        }
        
        perfManager.startSubsystem('rendering');
        
        try {
            // Adjust render quality based on performance
            const quality = qualityManager.getQualitySettings();
            
            // Adjust pixel ratio for performance
            const basePixelRatio = window.devicePixelRatio || 1;
            const adjustedPixelRatio = basePixelRatio * quality.antialiasing;
            renderer.setPixelRatio(Math.min(2, adjustedPixelRatio));
            
            // Adjust shadow map size
            if (renderer.shadowMap && quality.shadowQuality > 0) {
                const shadowMapSize = Math.floor(1024 * quality.shadowQuality);
                renderer.shadowMap.setSize(shadowMapSize, shadowMapSize);
                renderer.shadowMap.enabled = true;
            } else if (renderer.shadowMap) {
                renderer.shadowMap.enabled = false;
            }
            
            // Call original render
            originalRender.call(this, scene, camera);
            
        } finally {
            perfManager.endSubsystem('rendering');
        }
    };
    
    console.log('🎨 Renderer integrated with performance system');
}