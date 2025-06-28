# Executive Control System - Setup & Integration Guide

## Overview

This guide walks you through integrating the Executive Control System into your Fractality platform. The system adds a "prefrontal cortex" that makes high-level decisions about resource allocation, conflict resolution, and system optimization.

---

## File Structure

```
fractality-project/
├── src/
│   ├── executive/
│   │   ├── executive-worker.js      # Isolated executive brain
│   │   ├── executive-liaison.js     # Main thread coordinator
│   │   ├── executive-integration.js # Platform integration
│   │   └── executive-config.js      # Configuration
│   ├── main.js                      # Your existing entry point
│   └── ...
├── demos/
│   └── executive-demo.html          # Interactive demo
└── docs/
    └── executive-setup.md           # This file
```

---

## Step 1: Create the Executive Worker

Create `src/executive/executive-worker.js`:

```javascript
// This file contains the isolated executive brain
// Copy the IsolatedExecutiveCore class from the complete implementation
```

**Key Points:**
- Runs in Web Worker (completely isolated)
- Never sees actual user data
- Makes decisions based on statistics only
- Implements learning and fatigue

---

## Step 2: Create the Liaison

Create `src/executive/executive-liaison.js`:

```javascript
// This file coordinates between platform and executive
// Copy the ExecutiveLiaison class from the complete implementation
```

**Key Points:**
- Gathers metrics from platform/observer
- Sends sanitized reports to executive
- Executes commands from executive
- Manages communication timing

---

## Step 3: Integration Layer

Create `src/executive/executive-integration.js`:

```javascript
// This file provides easy integration
// Copy the ExecutiveIntegration class from the complete implementation
```

---

## Step 4: Modify Your Platform

### 4.1 In your main platform class:

```javascript
import { ExecutiveIntegration } from './executive/executive-integration.js';

class FractalityPlatform {
  constructor() {
    // Your existing code...
    
    // Add executive
    this.executive = new ExecutiveIntegration();
  }
  
  async initialize() {
    // Your existing initialization...
    
    // Initialize executive after platform is ready
    this.executive.initialize(this, this.mlObserver);
  }
  
  // Add these helper methods for the executive
  getAverageEnergy() {
    // Return average energy across all nodes
    let total = 0, count = 0;
    this.nodes.forEach(node => {
      total += node.energy || 0;
      count++;
    });
    return count > 0 ? total / count : 0.5;
  }
  
  // Add metric properties the executive expects
  get interactionRate() {
    // Calculate interactions per second
    return this._interactionCount / ((Date.now() - this._startTime) / 1000);
  }
}
```

### 4.2 Add command handlers:

```javascript
// These methods will be called by the executive
setEnergyAllocation(allocation) {
  this.energyBudget = this.totalEnergy * allocation;
  console.log(`Energy allocation: ${(allocation * 100).toFixed(1)}%`);
}

enableEmergencyMode(params) {
  if (params.cullDistantNodes) {
    this.cullDistantNodes();
  }
  if (params.maxVisibleNodes) {
    this.setMaxVisibleNodes(params.maxVisibleNodes);
  }
  // etc...
}

boostCoherence(params) {
  this.fieldCoherence *= params.coherenceBoost || 1.5;
  // Trigger any coherence-related updates
}
```

---

## Step 5: Configuration

Create `src/executive/executive-config.js`:

```javascript
export const ExecutiveConfig = {
  // Decision making
  decisionRate: 100,        // ms between decisions
  learningRate: 0.1,        // How fast to adapt
  
  // Performance thresholds
  performance: {
    criticalFPS: 20,
    poorFPS: 30,
    targetFPS: 60
  },
  
  // Coherence thresholds
  coherence: {
    minimum: 0.5,
    target: 0.8
  },
  
  // User overwhelm detection
  overwhelm: {
    nodeCountFactor: 200,    // Nodes above this contribute to overwhelm
    interactionThreshold: 1, // Interactions/sec below this = overwhelm
    dwellTimeThreshold: 5000 // ms dwelling = possible confusion
  },
  
  // Resource allocation
  resources: {
    default: { platform: 0.7, observer: 0.3 },
    activeUse: { platform: 0.8, observer: 0.2 },
    learning: { platform: 0.4, observer: 0.6 }
  }
};
```

---

## Step 6: Testing

### 6.1 Basic Test

```javascript
// In your console or test file
import { ExecutiveTester } from './executive/executive-integration.js';

// Run automated tests
ExecutiveTester.runTestScenarios(platform);
```

### 6.2 Manual Testing

1. Open the demo (`executive-demo.html`) to see the system in action
2. Use the test buttons to simulate scenarios
3. Watch the executive make decisions in real-time

### 6.3 Integration Test

```javascript
// Verify executive is working
console.log('Executive active:', platform.executive.enabled);

// Trigger a scenario
platform.performance.fps = 15; // Simulate low FPS

// Watch console for executive decisions
```

---

## Step 7: Monitoring & Debugging

### 7.1 Executive Dashboard

Add to your UI:

```javascript
class ExecutiveDashboard {
  constructor(executive) {
    this.executive = executive;
    this.element = this.createElement();
  }
  
  createElement() {
    const div = document.createElement('div');
    div.className = 'executive-dashboard';
    div.innerHTML = `
      <h3>Executive Control</h3>
      <div class="exec-status">
        <span class="status-dot"></span>
        <span class="status-text">Active</span>
      </div>
      <div class="exec-metrics">
        <div>Decisions: <span id="exec-decisions">0</span></div>
        <div>Fatigue: <span id="exec-fatigue">0%</span></div>
      </div>
    `;
    return div;
  }
}
```

### 7.2 Debug Logging

```javascript
// Enable detailed logging
window.DEBUG_EXECUTIVE = true;

// In executive-liaison.js
if (window.DEBUG_EXECUTIVE) {
  console.log('Executive Report:', report);
  console.log('Executive Decision:', decision);
}
```

---

## Step 8: Performance Optimization

### 8.1 Throttling

```javascript
// Limit executive overhead
const EXECUTIVE_REPORT_RATE = 100; // ms
const EXECUTIVE_DECISION_RATE = 100; // ms

// Use throttling in liaison
this.reportThrottled = throttle(this.report, EXECUTIVE_REPORT_RATE);
```

### 8.2 Conditional Activation

```javascript
// Only activate executive when needed
if (platform.nodes.size > 50 || platform.complexity > 0.7) {
  this.executive.activate();
} else {
  this.executive.deactivate();
}
```

---

## Step 9: ML Observer Integration

If you have the ML Observer from the parallel pattern:

```javascript
// In ML Observer
reportToExecutive(insight) {
  platform.executive.liaison.worker.postMessage({
    type: 'ML_INSIGHT',
    data: {
      pattern: insight.type,
      confidence: insight.confidence,
      suggestion: insight.action
    }
  });
}

// In Executive Worker
handleMLInsight(insight) {
  // Use ML insights for better decisions
  if (insight.confidence > 0.8) {
    this.adjustStrategy(insight.suggestion);
  }
}
```

---

## Step 10: Production Considerations

### 10.1 Graceful Degradation

```javascript
// Handle worker unavailability
if (!window.Worker) {
  console.warn('Web Workers not supported - Executive disabled');
  this.executive.enabled = false;
  return;
}
```

### 10.2 Error Handling

```javascript
// In liaison
this.worker.onerror = (error) => {
  console.error('Executive error:', error);
  this.restartExecutive();
};

restartExecutive() {
  this.worker.terminate();
  this.worker = new Worker('executive-worker.js');
  // Re-initialize...
}
```

### 10.3 Resource Limits

```javascript
// Prevent executive from consuming too many resources
const MAX_EXECUTIVE_CPU = 0.02; // 2% max
const MAX_DECISIONS_PER_SECOND = 10;

// Monitor and throttle if needed
```

---

## Common Integration Patterns

### Pattern 1: Minimal Integration

```javascript
// Just performance optimization
this.executive.goals = { primary: 'performance' };
```

### Pattern 2: Full Cognitive Management

```javascript
// Complete consciousness management
this.executive.goals = {
  primary: 'user_experience',
  weights: {
    performance: 0.3,
    coherence: 0.3,
    discovery: 0.2,
    wellbeing: 0.2
  }
};
```

### Pattern 3: Research Mode

```javascript
// Maximize learning and pattern discovery
this.executive.goals = {
  primary: 'research',
  allowExperimentation: true,
  logAllDecisions: true
};
```

---

## Troubleshooting

### Issue: Executive not making decisions

1. Check Worker is loaded: `navigator.serviceWorker.controller`
2. Verify metrics are being sent: Add console.log in `gatherPlatformMetrics`
3. Check thresholds in config

### Issue: Decisions not being executed

1. Verify command handlers exist on platform
2. Check command names match between executive and platform
3. Look for errors in console

### Issue: High CPU usage

1. Increase decision interval
2. Reduce metric reporting frequency
3. Simplify decision logic

---

## Next Steps

1. **Start Simple**: Begin with just performance optimization
2. **Add Gradually**: Enable more decision types as you test
3. **Customize**: Adjust thresholds for your specific use case
4. **Learn**: Let the executive learn from user patterns
5. **Expand**: Add new decision types and commands

The Executive Control System is designed to enhance, not replace, your platform's core functionality. It should feel like your platform gained wisdom, not complexity.

---

## Questions?

The system is designed to be self-explanatory through its operation. Watch the decisions it makes, and you'll understand how it thinks. The beauty is in the emergence of intelligent behavior from simple rules and learning.

*"The best executive is one you forget is there—until you realize everything is running smoothly."*