// ============================================
// COMPLETE EXECUTIVE CONTROL SYSTEM
// For The Fractality Platform
// ============================================

// ============================================
// File: executive-worker.js
// This runs in an isolated Web Worker
// ============================================

class IsolatedExecutiveCore {
  constructor() {
    // The executive has NO access to platform data
    // Only abstract metrics and patterns
    this.state = {
      metrics: {
        platform: {},
        observer: {},
        timestamp: Date.now()
      },
      patterns: new Map(),
      resources: {
        total: 1.0,
        allocated: { platform: 0.7, observer: 0.3 }
      },
      goals: {
        primary: 'maintain_coherence',
        secondary: ['optimize_performance', 'discover_patterns'],
        weights: { coherence: 0.9, performance: 0.7, discovery: 0.6 }
      }
    };
    
    // Decision making
    this.decisionHistory = [];
    this.learningRate = 0.1;
    this.fatigueLevel = 0;
    
    // Conflict detection
    this.conflictThresholds = {
      resource: 0.2,      // 20% overallocation
      performance: 0.4,   // 40% below target
      coherence: 0.5      // 50% coherence loss
    };
    
    // Start decision loop
    this.startDecisionCycle();
  }
  
  startDecisionCycle() {
    // Run decisions every 100ms (10Hz)
    setInterval(() => this.makeDecisions(), 100);
    
    // Run learning every second
    setInterval(() => this.learn(), 1000);
    
    // Run predictive analysis every 5 seconds
    setInterval(() => this.predict(), 5000);
  }
  
  // Main decision-making logic
  makeDecisions() {
    const startTime = Date.now();
    
    // Skip if too fatigued
    if (this.fatigueLevel > 0.9) {
      this.rest();
      return;
    }
    
    // 1. Analyze current state
    const analysis = this.analyzeState();
    
    // 2. Detect issues
    const issues = this.detectIssues(analysis);
    
    // 3. Check for conflicts
    const conflicts = this.detectConflicts();
    
    // 4. Make decisions
    const decisions = this.prioritizeDecisions(issues, conflicts);
    
    // 5. Execute top decision
    if (decisions.length > 0) {
      const decision = decisions[0];
      this.executeDecision(decision);
      
      // Increase fatigue based on decision complexity
      this.fatigueLevel += decision.complexity * 0.1;
    }
    
    // Track decision time
    const decisionTime = Date.now() - startTime;
    this.updatePerformanceMetrics(decisionTime);
  }
  
  analyzeState() {
    const platform = this.state.metrics.platform;
    const observer = this.state.metrics.observer;
    
    return {
      // Overall system health
      health: {
        performance: this.calculatePerformanceHealth(platform),
        coherence: platform.coherence || 0,
        energy: this.calculateEnergyEfficiency(),
        learning: observer.learningRate || 0
      },
      
      // Trends
      trends: {
        performance: this.calculateTrend('fps'),
        nodeGrowth: this.calculateTrend('nodeCount'),
        userActivity: this.calculateTrend('interactionRate')
      },
      
      // Resource usage
      resources: {
        platformDemand: platform.resourceDemand || 0.5,
        observerDemand: observer.resourceDemand || 0.3,
        available: this.state.resources.total
      }
    };
  }
  
  detectIssues(analysis) {
    const issues = [];
    
    // Performance issues
    if (analysis.health.performance < 0.6) {
      issues.push({
        type: 'performance_degradation',
        severity: 1 - analysis.health.performance,
        metrics: ['fps', 'latency']
      });
    }
    
    // Coherence issues
    if (analysis.health.coherence < 0.5) {
      issues.push({
        type: 'coherence_loss',  
        severity: 1 - analysis.health.coherence,
        metrics: ['fieldCoherence', 'connectionStrength']
      });
    }
    
    // Energy inefficiency
    if (analysis.health.energy < 0.7) {
      issues.push({
        type: 'energy_inefficiency',
        severity: 1 - analysis.health.energy,
        metrics: ['energyWaste', 'allocationMismatch']
      });
    }
    
    // User overwhelm detection
    const overwhelm = this.detectUserOverwhelm();
    if (overwhelm > 0.7) {
      issues.push({
        type: 'user_overwhelm',
        severity: overwhelm,
        metrics: ['nodeCount', 'interactionRate', 'dwellTime']
      });
    }
    
    return issues.sort((a, b) => b.severity - a.severity);
  }
  
  detectConflicts() {
    const conflicts = [];
    const platform = this.state.metrics.platform;
    const observer = this.state.metrics.observer;
    
    // Resource competition
    const totalDemand = (platform.resourceDemand || 0) + (observer.resourceDemand || 0);
    if (totalDemand > this.state.resources.total + this.conflictThresholds.resource) {
      conflicts.push({
        type: 'resource_competition',
        parties: ['platform', 'observer'],
        severity: totalDemand - this.state.resources.total,
        currentAllocation: this.state.resources.allocated
      });
    }
    
    // Goal conflicts
    if (platform.userIntent === 'focused_search' && this.state.goals.primary === 'exploration') {
      conflicts.push({
        type: 'goal_misalignment',
        parties: ['user_intent', 'system_goal'],
        severity: 0.6
      });
    }
    
    return conflicts;
  }
  
  prioritizeDecisions(issues, conflicts) {
    const decisions = [];
    
    // Handle conflicts first
    conflicts.forEach(conflict => {
      const resolution = this.resolveConflict(conflict);
      if (resolution) {
        decisions.push({
          ...resolution,
          priority: conflict.severity * 1.5, // Conflicts get priority boost
          source: 'conflict_resolution'
        });
      }
    });
    
    // Then handle issues
    issues.forEach(issue => {
      const actions = this.generateActions(issue);
      actions.forEach(action => {
        decisions.push({
          ...action,
          priority: issue.severity,
          source: 'issue_resolution'
        });
      });
    });
    
    // Sort by priority
    return decisions.sort((a, b) => b.priority - a.priority);
  }
  
  resolveConflict(conflict) {
    switch(conflict.type) {
      case 'resource_competition':
        return this.resolveResourceCompetition(conflict);
      
      case 'goal_misalignment':
        return this.resolveGoalMisalignment(conflict);
      
      default:
        return null;
    }
  }
  
  resolveResourceCompetition(conflict) {
    const platform = this.state.metrics.platform;
    const observer = this.state.metrics.observer;
    
    // Dynamic allocation based on activity
    if (platform.userActivity === 'high') {
      // User actively engaged - prioritize platform
      return {
        type: 'resource_reallocation',
        target: 'both',
        command: 'reallocate_resources',
        parameters: {
          platform: 0.75,
          observer: 0.25,
          transitionTime: 2000
        },
        complexity: 0.5,
        reasoning: 'High user activity - prioritizing interaction'
      };
    } else {
      // Low activity - let observer learn
      return {
        type: 'resource_reallocation',
        target: 'both',
        command: 'reallocate_resources',
        parameters: {
          platform: 0.4,
          observer: 0.6,
          transitionTime: 3000
        },
        complexity: 0.5,
        reasoning: 'Low activity - enabling background learning'
      };
    }
  }
  
  generateActions(issue) {
    switch(issue.type) {
      case 'performance_degradation':
        return this.generatePerformanceActions(issue);
      
      case 'coherence_loss':
        return this.generateCoherenceActions(issue);
      
      case 'user_overwhelm':
        return this.generateOverwhelmActions(issue);
      
      case 'energy_inefficiency':
        return this.generateEnergyActions(issue);
      
      default:
        return [];
    }
  }
  
  generatePerformanceActions(issue) {
    const actions = [];
    const fps = this.state.metrics.platform.fps || 60;
    
    if (fps < 20) {
      // Critical performance - emergency measures
      actions.push({
        type: 'emergency_optimization',
        target: 'platform',
        command: 'emergency_performance_mode',
        parameters: {
          cullDistantNodes: true,
          maxVisibleNodes: 50,
          disableEffects: ['particles', 'animations', 'transitions'],
          reduceLOD: 2
        },
        complexity: 0.8,
        reasoning: 'Critical performance - applying emergency optimizations'
      });
    } else if (fps < 30) {
      // Poor performance - gradual degradation
      actions.push({
        type: 'graceful_degradation',
        target: 'platform',
        command: 'reduce_quality',
        parameters: {
          particleCount: 0.5,
          animationSpeed: 0.7,
          maxVisibleNodes: 100
        },
        complexity: 0.5,
        reasoning: 'Sub-optimal performance - reducing quality'
      });
    }
    
    return actions;
  }
  
  generateCoherenceActions(issue) {
    return [{
      type: 'coherence_restoration',
      target: 'platform',
      command: 'boost_coherence',
      parameters: {
        strengthenConnections: true,
        coherenceBoost: 1.5,
        focusOnCore: true,
        pruneWeakLinks: 0.1
      },
      complexity: 0.6,
      reasoning: 'Low coherence detected - strengthening field connections'
    }];
  }
  
  generateOverwhelmActions(issue) {
    return [{
      type: 'cognitive_load_reduction',
      target: 'both',
      command: 'simplify_experience',
      parameters: {
        platform: {
          maxNodes: 50,
          highlightImportant: true,
          dimPeripheral: 0.3,
          slowAnimations: 0.6
        },
        observer: {
          pauseComplexAnalysis: true,
          focusOnPrimary: true
        }
      },
      complexity: 0.7,
      reasoning: 'User showing overwhelm signs - simplifying interface'
    }];
  }
  
  executeDecision(decision) {
    // Record decision for learning
    this.recordDecision(decision);
    
    // Send command to appropriate target
    self.postMessage({
      type: 'EXECUTIVE_COMMAND',
      decision: decision,
      timestamp: Date.now()
    });
  }
  
  // Learning system
  learn() {
    // Reduce fatigue over time
    this.fatigueLevel *= 0.9;
    
    // Analyze recent decisions
    const recentDecisions = this.getRecentDecisions(10);
    if (recentDecisions.length === 0) return;
    
    // Calculate effectiveness
    recentDecisions.forEach(decision => {
      const effectiveness = this.calculateEffectiveness(decision);
      this.updateStrategy(decision, effectiveness);
    });
  }
  
  calculateEffectiveness(decision) {
    // Compare predicted vs actual outcomes
    const predicted = decision.expectedOutcome || {};
    const actual = this.getCurrentMetrics();
    
    let score = 0;
    let count = 0;
    
    Object.keys(predicted).forEach(key => {
      if (actual[key] !== undefined) {
        const diff = Math.abs(predicted[key] - actual[key]);
        const maxDiff = Math.abs(predicted[key]);
        score += 1 - (diff / (maxDiff || 1));
        count++;
      }
    });
    
    return count > 0 ? score / count : 0.5;
  }
  
  // Helper methods
  calculatePerformanceHealth(platform) {
    const fps = platform.fps || 60;
    const targetFps = 60;
    return Math.min(1, fps / targetFps);
  }
  
  calculateEnergyEfficiency() {
    const allocated = this.state.resources.allocated;
    const used = {
      platform: this.state.metrics.platform.energyUsed || 0,
      observer: this.state.metrics.observer.energyUsed || 0
    };
    
    const efficiency = 
      (used.platform / (allocated.platform || 1) + 
       used.observer / (allocated.observer || 1)) / 2;
    
    return Math.min(1, efficiency);
  }
  
  detectUserOverwhelm() {
    const platform = this.state.metrics.platform;
    const nodeCount = platform.nodeCount || 0;
    const interactionRate = platform.interactionRate || 0;
    const dwellTime = platform.avgDwellTime || 0;
    
    // High nodes + low interaction + long dwell = overwhelm
    const overwhelm = 
      (nodeCount / 200) * 0.4 +
      (1 - Math.min(1, interactionRate / 5)) * 0.3 +
      (Math.min(1, dwellTime / 5000)) * 0.3;
    
    return Math.min(1, overwhelm);
  }
  
  rest() {
    // Executive rest period
    this.fatigueLevel *= 0.8;
  }
  
  // Message handling from main thread
  handleMessage(event) {
    const { type, data } = event.data;
    
    switch(type) {
      case 'STATE_REPORT':
        this.updateState(data);
        break;
        
      case 'FEEDBACK':
        this.processFeedback(data);
        break;
        
      case 'GOAL_UPDATE':
        this.updateGoals(data);
        break;
        
      case 'SHUTDOWN':
        this.shutdown();
        break;
    }
  }
  
  updateState(reports) {
    // Update metrics from platform and observer
    if (reports.platform) {
      this.state.metrics.platform = reports.platform;
    }
    
    if (reports.observer) {
      this.state.metrics.observer = reports.observer;
    }
    
    this.state.metrics.timestamp = Date.now();
  }
  
  recordDecision(decision) {
    this.decisionHistory.push({
      decision: decision,
      timestamp: Date.now(),
      context: {
        health: this.analyzeState().health,
        fatigue: this.fatigueLevel
      }
    });
    
    // Keep history limited
    if (this.decisionHistory.length > 100) {
      this.decisionHistory.shift();
    }
  }
  
  getRecentDecisions(count) {
    return this.decisionHistory.slice(-count);
  }
  
  calculateTrend(metric) {
    // Simplified trend calculation
    // In production, use proper time series analysis
    return 0; // Placeholder
  }
}

// Initialize the executive
const executive = new IsolatedExecutiveCore();

// Set up message handling
self.addEventListener('message', (e) => executive.handleMessage(e));

// ============================================
// File: executive-liaison.js
// This runs in the main thread
// ============================================

class ExecutiveLiaison {
  constructor(platform, observer) {
    this.platform = platform;
    this.observer = observer;
    
    // Create worker
    this.worker = new Worker('executive-worker.js');
    
    // Command queue for rate limiting
    this.commandQueue = [];
    this.commandRate = 100; // ms between commands
    
    // Set up communication
    this.worker.onmessage = this.handleExecutiveCommand.bind(this);
    
    // Start reporting
    this.startReporting();
    
    // Start command processor
    this.startCommandProcessor();
  }
  
  startReporting() {
    // Report state every 100ms
    setInterval(() => {
      const report = {
        platform: this.gatherPlatformMetrics(),
        observer: this.gatherObserverMetrics()
      };
      
      this.worker.postMessage({
        type: 'STATE_REPORT',
        data: report
      });
    }, 100);
  }
  
  gatherPlatformMetrics() {
    // Only gather statistics, no actual data
    return {
      // Performance metrics
      fps: this.platform.performance?.fps || 60,
      frameTime: this.platform.performance?.frameTime || 16,
      drawCalls: this.platform.performance?.drawCalls || 0,
      
      // System metrics
      nodeCount: this.platform.nodes?.size || 0,
      visibleNodes: this.platform.visibleNodes?.length || 0,
      connectionCount: this.platform.connections?.size || 0,
      
      // Energy metrics
      totalEnergy: this.platform.totalEnergy || 1000,
      avgEnergy: this.platform.getAverageEnergy?.() || 0.5,
      energyUsed: this.platform.energyConsumed || 0,
      resourceDemand: this.platform.energyDemand || 0.5,
      
      // Coherence metrics
      coherence: this.platform.fieldCoherence || 0.5,
      fieldStrength: this.platform.fieldStrength || 0.5,
      
      // User activity
      userActivity: this.detectUserActivity(),
      interactionRate: this.platform.interactionRate || 0,
      avgDwellTime: this.platform.avgDwellTime || 0,
      lastInteraction: Date.now() - (this.platform.lastInteraction || Date.now()),
      
      // Intent detection
      userIntent: this.detectUserIntent()
    };
  }
  
  gatherObserverMetrics() {
    if (!this.observer) {
      return {
        active: false,
        resourceDemand: 0
      };
    }
    
    return {
      // Learning metrics
      patternsDetected: this.observer.patternCount || 0,
      learningRate: this.observer.learningRate || 0,
      confidence: this.observer.avgConfidence || 0,
      
      // Resource usage
      resourceDemand: this.observer.resourceDemand || 0.3,
      energyUsed: this.observer.energyUsed || 0,
      
      // Insights
      recentInsights: this.observer.recentInsights?.length || 0,
      insightQuality: this.observer.avgInsightQuality || 0
    };
  }
  
  detectUserActivity() {
    const lastInteraction = Date.now() - (this.platform.lastInteraction || Date.now());
    const rate = this.platform.interactionRate || 0;
    
    if (lastInteraction > 5000) return 'idle';
    if (rate < 1) return 'low';
    if (rate < 3) return 'medium';
    return 'high';
  }
  
  detectUserIntent() {
    // Simple heuristic - in production use ML
    const depth = this.platform.navigationDepth || 0;
    const breadth = this.platform.explorationBreadth || 0;
    
    if (depth > breadth * 2) return 'focused_search';
    if (breadth > depth * 2) return 'exploration';
    return 'balanced';
  }
  
  handleExecutiveCommand(event) {
    const { decision } = event.data;
    
    if (!decision) return;
    
    // Queue command for processing
    this.commandQueue.push({
      decision: decision,
      received: Date.now()
    });
  }
  
  startCommandProcessor() {
    setInterval(() => {
      if (this.commandQueue.length === 0) return;
      
      const command = this.commandQueue.shift();
      this.executeCommand(command.decision);
    }, this.commandRate);
  }
  
  executeCommand(decision) {
    console.log('Executive Decision:', decision);
    
    const { target, command, parameters } = decision;
    
    // Route to appropriate target
    if (target === 'platform' || target === 'both') {
      this.executePlatformCommand(command, parameters);
    }
    
    if (target === 'observer' || target === 'both') {
      this.executeObserverCommand(command, parameters);
    }
    
    // Send feedback
    setTimeout(() => {
      this.sendFeedback(decision);
    }, 1000);
  }
  
  executePlatformCommand(command, params) {
    if (!this.platform) return;
    
    switch(command) {
      case 'reallocate_resources':
        if (params.platform !== undefined) {
          this.platform.setEnergyAllocation?.(params.platform);
        }
        break;
        
      case 'emergency_performance_mode':
        this.platform.enableEmergencyMode?.(params);
        break;
        
      case 'reduce_quality':
        this.platform.setQuality?.(params);
        break;
        
      case 'boost_coherence':
        this.platform.boostCoherence?.(params);
        break;
        
      case 'simplify_experience':
        this.platform.simplifyView?.(params.platform);
        break;
        
      default:
        console.warn('Unknown platform command:', command);
    }
  }
  
  executeObserverCommand(command, params) {
    if (!this.observer) return;
    
    switch(command) {
      case 'reallocate_resources':
        if (params.observer !== undefined) {
          this.observer.setResourceAllocation?.(params.observer);
        }
        break;
        
      case 'simplify_experience':
        this.observer.simplifyAnalysis?.(params.observer);
        break;
        
      default:
        console.warn('Unknown observer command:', command);
    }
  }
  
  sendFeedback(decision) {
    // Gather outcome metrics
    const outcome = {
      fps: this.platform.performance?.fps,
      coherence: this.platform.fieldCoherence,
      userActivity: this.detectUserActivity()
    };
    
    this.worker.postMessage({
      type: 'FEEDBACK',
      data: {
        decisionId: decision.id,
        outcome: outcome,
        success: this.evaluateSuccess(decision, outcome)
      }
    });
  }
  
  evaluateSuccess(decision, outcome) {
    // Simple success evaluation
    // In production, use more sophisticated metrics
    if (decision.type === 'emergency_optimization') {
      return outcome.fps > 30;
    }
    
    if (decision.type === 'coherence_restoration') {
      return outcome.coherence > 0.6;
    }
    
    return true; // Default to success
  }
  
  shutdown() {
    this.worker.postMessage({ type: 'SHUTDOWN' });
    this.worker.terminate();
  }
}

// ============================================
// File: executive-integration.js
// Integration with Fractality Platform
// ============================================

class ExecutiveIntegration {
  constructor() {
    this.enabled = true;
    this.liaison = null;
  }
  
  initialize(platform, observer) {
    if (!this.enabled) return;
    
    try {
      // Create the executive liaison
      this.liaison = new ExecutiveLiaison(platform, observer);
      
      // Add helper methods to platform
      this.enhancePlatform(platform);
      
      // Add helper methods to observer
      if (observer) {
        this.enhanceObserver(observer);
      }
      
      console.log('✅ Executive Control System initialized');
    } catch (error) {
      console.error('Failed to initialize Executive:', error);
      this.enabled = false;
    }
  }
  
  enhancePlatform(platform) {
    // Add methods the executive can call
    
    platform.setEnergyAllocation = function(allocation) {
      const total = platform.totalEnergy || 1000;
      platform.availableEnergy = total * allocation;
      console.log(`Platform energy allocation: ${(allocation * 100).toFixed(1)}%`);
    };
    
    platform.enableEmergencyMode = function(params) {
      console.log('🚨 Emergency performance mode activated', params);
      
      if (params.cullDistantNodes) {
        platform.maxRenderDistance = 5;
      }
      
      if (params.maxVisibleNodes) {
        platform.maxVisibleNodes = params.maxVisibleNodes;
      }
      
      if (params.disableEffects) {
        params.disableEffects.forEach(effect => {
          platform.effects[effect] = false;
        });
      }
    };
    
    platform.setQuality = function(params) {
      Object.assign(platform.quality, params);
      platform.needsUpdate = true;
    };
    
    platform.boostCoherence = function(params) {
      if (params.coherenceBoost) {
        platform.fieldCoherence *= params.coherenceBoost;
      }
      
      if (params.strengthenConnections) {
        platform.connectionStrength *= 1.2;
      }
    };
    
    platform.simplifyView = function(params) {
      if (params.maxNodes) {
        platform.visibleNodeLimit = params.maxNodes;
      }
      
      if (params.dimPeripheral) {
        platform.peripheralOpacity = params.dimPeripheral;
      }
      
      if (params.slowAnimations) {
        platform.animationSpeed = params.slowAnimations;
      }
    };
    
    // Add metric collection helpers
    platform.getAverageEnergy = function() {
      if (!platform.nodes) return 0.5;
      
      let total = 0;
      let count = 0;
      
      platform.nodes.forEach(node => {
        total += node.energy || 0;
        count++;
      });
      
      return count > 0 ? total / count : 0.5;
    };
  }
  
  enhanceObserver(observer) {
    observer.setResourceAllocation = function(allocation) {
      observer.resourceBudget = allocation;
      console.log(`Observer resource allocation: ${(allocation * 100).toFixed(1)}%`);
    };
    
    observer.simplifyAnalysis = function(params) {
      if (params.pauseComplexAnalysis) {
        observer.complexAnalysisEnabled = false;
      }
      
      if (params.focusOnPrimary) {
        observer.analysisMode = 'primary_only';
      }
    };
  }
  
  shutdown() {
    if (this.liaison) {
      this.liaison.shutdown();
      this.liaison = null;
    }
  }
}

// ============================================
// File: example-usage.js
// How to integrate with your platform
// ============================================

// Example integration with your existing platform
class FractalityPlatformWithExecutive {
  constructor() {
    // Your existing platform initialization
    this.nodes = new Map();
    this.performance = { fps: 60, frameTime: 16 };
    this.fieldCoherence = 1.0;
    this.totalEnergy = 1000;
    
    // ... other platform setup ...
    
    // ML Observer (if you have one)
    this.mlObserver = null; // Optional
    
    // Initialize Executive Control
    this.executive = new ExecutiveIntegration();
  }
  
  async initialize() {
    // Your existing initialization
    await this.loadData();
    await this.setupRendering();
    
    // Initialize Executive after platform is ready
    this.executive.initialize(this, this.mlObserver);
  }
  
  // Your existing methods continue to work normally
  updateNodes() {
    // The executive observes through metrics only
    // Your actual implementation is unchanged
  }
  
  shutdown() {
    // Clean shutdown
    this.executive.shutdown();
    // ... other cleanup ...
  }
}

// ============================================
// Usage Example
// ============================================

// Create your platform with executive control
const platform = new FractalityPlatformWithExecutive();

// Initialize everything
platform.initialize().then(() => {
  console.log('Platform running with Executive Control');
  
  // The executive will now:
  // - Monitor performance and coherence
  // - Detect issues like low FPS or user overwhelm
  // - Make decisions to optimize the experience
  // - Learn from outcomes to improve over time
  
  // You can also manually trigger executive actions:
  // platform.executive.liaison.worker.postMessage({
  //   type: 'GOAL_UPDATE',
  //   data: { primary: 'exploration' }
  // });
});

// ============================================
// Testing Utilities
// ============================================

class ExecutiveTester {
  static simulatePerformanceDrop(platform) {
    // Simulate low FPS
    platform.performance.fps = 15;
    console.log('🧪 Simulated performance drop to 15 FPS');
    // Executive should respond with emergency optimizations
  }
  
  static simulateUserOverwhelm(platform) {
    // Simulate high complexity
    platform.nodes = new Map();
    for (let i = 0; i < 500; i++) {
      platform.nodes.set(i, { id: i, energy: Math.random() });
    }
    platform.interactionRate = 0.2; // Low interaction
    platform.avgDwellTime = 8000; // Long dwell time
    
    console.log('🧪 Simulated user overwhelm scenario');
    // Executive should simplify the experience
  }
  
  static simulateResourceConflict(platform, observer) {
    // Both systems want more resources
    platform.energyDemand = 0.8;
    observer.resourceDemand = 0.7;
    
    console.log('🧪 Simulated resource conflict');
    // Executive should resolve the conflict
  }
  
  static runTestScenarios(platform) {
    console.log('🧪 Running Executive Control test scenarios...\n');
    
    // Test 1: Performance degradation
    setTimeout(() => this.simulatePerformanceDrop(platform), 2000);
    
    // Test 2: User overwhelm
    setTimeout(() => this.simulateUserOverwhelm(platform), 5000);
    
    // Test 3: Resource conflict
    setTimeout(() => this.simulateResourceConflict(platform, platform.mlObserver), 8000);
    
    // Monitor executive decisions
    const originalLog = console.log;
    console.log = function(...args) {
      if (args[0] && args[0].includes('Executive Decision:')) {
        originalLog('🎯', ...args);
      } else {
        originalLog(...args);
      }
    };
  }
}

// ============================================
// Configuration Options
// ============================================

const ExecutiveConfig = {
  // Decision making
  decisionRate: 100,        // ms between decisions
  learningRate: 0.1,        // How fast to adapt
  fatigueRate: 0.1,         // How fast executive tires
  
  // Thresholds
  performanceThreshold: 30,  // FPS below this triggers action
  coherenceThreshold: 0.5,   // Coherence below this triggers action
  overwhelmThreshold: 0.7,    // User overwhelm above this triggers action
  
  // Resource allocation
  defaultAllocation: {
    platform: 0.7,
    observer: 0.3
  },
  
  // Goals
  defaultGoals: {
    primary: 'maintain_coherence',
    weights: {
      coherence: 0.9,
      performance: 0.7,
      discovery: 0.6,
      efficiency: 0.8
    }
  }
};

// Export everything for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ExecutiveLiaison,
    ExecutiveIntegration,
    ExecutiveTester,
    ExecutiveConfig
  };
}