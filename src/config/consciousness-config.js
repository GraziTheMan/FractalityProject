// src/config/consciousness-config.js
// Configuration for consciousness system parameters

export const CONSCIOUSNESS_CONFIG = {
    // Node consciousness parameters
    node: {
        // How much consciousness increases on direct activation
        activationBoost: 0.3,
        
        // How much consciousness propagates to neighbors
        propagationAmount: 0.1,
        
        // How fast consciousness decays (per second)
        decayRate: 0.95,
        
        // Maximum consciousness level
        maxLevel: 1.0,
        
        // Threshold for considering a node "active"
        activeThreshold: 0.1
    },
    
    // Connection/memristor parameters
    connections: {
        // How much connection strength increases per traversal
        strengthenAmount: 0.1,
        
        // How fast unused connections decay
        decayRate: 0.99,
        
        // Minimum connection strength before removal
        minStrength: 0.01,
        
        // Maximum connection strength
        maxStrength: 1.0
    },
    
    // Visual parameters
    visuals: {
        // Glow effect
        glow: {
            enabled: true,
            baseColor: [0, 1, 1], // Cyan
            maxIntensity: 1.0,
            pulseSpeed: 2.0
        },
        
        // Connection lines
        connections: {
            enabled: true,
            minOpacity: 0.1,
            maxOpacity: 0.8,
            baseColor: [0, 0.5, 1], // Blue
            flowSpeed: 0.5
        },
        
        // Particle effects
        particles: {
            enabled: true,
            count: 1000,
            size: 0.5,
            speedMultiplier: 0.1
        }
    },
    
    // SDC cluster configuration (maps to your 4 chips)
    clusters: {
        // Cluster type definitions
        types: {
            void: {
                color: [1, 1, 1], // White
                description: "Pure potentiality",
                nodeTest: (node) => node.depth === 0
            },
            duality: {
                color: [0.5, 0, 0.5], // Purple
                description: "Balance and opposition",
                nodeTest: (node) => node.label?.includes('Duality')
            },
            growth: {
                color: [0, 1, 0], // Green
                description: "Evolution and change",
                nodeTest: (node) => node.childIds?.length > 3
            },
            responsibility: {
                color: [1, 0.5, 0], // Orange
                description: "Action and consequence",
                nodeTest: (node) => !node.childIds || node.childIds.length === 0
            }
        },
        
        // How clusters interact
        resonanceMultiplier: 1.5,
        crossClusterDecay: 0.8
    },
    
    // Emergent behavior thresholds
    emergence: {
        // Minimum nodes for synchronization detection
        syncMinNodes: 5,
        syncThreshold: 0.8,
        
        // Cascade detection
        cascadeMinNodes: 3,
        cascadeTimeWindow: 1000, // milliseconds
        
        // Harmony detection
        harmonyThreshold: 0.9,
        
        // Enlightenment state
        enlightenmentRequirements: {
            minGlobalResonance: 0.8,
            minActiveNodes: 10,
            minHarmony: 0.85
        }
    },
    
    // Performance optimization
    performance: {
        // Update frequency (times per second)
        updateRate: 60,
        
        // Maximum nodes to process per frame
        maxNodesPerFrame: 100,
        
        // Enable/disable features based on performance
        adaptiveQuality: true,
        
        // Minimum FPS before reducing quality
        minFPS: 30
    },
    
    // Debug options
    debug: {
        // Show consciousness values on nodes
        showValues: false,
        
        // Log state changes
        logActivations: false,
        
        // Show performance metrics
        showPerformance: true,
        
        // Enable consciousness HUD
        showHUD: true
    }
};

// Helper functions for consciousness calculations
export const ConsciousnessHelpers = {
    // Calculate resonance between two nodes
    calculateResonance(node1, node2) {
        const levelDiff = Math.abs(node1.consciousness - node2.consciousness);
        return 1.0 - levelDiff;
    },
    
    // Calculate harmony for a group of nodes
    calculateHarmony(nodes) {
        if (nodes.length < 2) return 1.0;
        
        const avgConsciousness = nodes.reduce((sum, n) => sum + n.consciousness, 0) / nodes.length;
        const variance = nodes.reduce((sum, n) => sum + Math.pow(n.consciousness - avgConsciousness, 2), 0) / nodes.length;
        
        return 1.0 - Math.sqrt(variance);
    },
    
    // Check if nodes are synchronized
    checkSynchronization(nodes, threshold = CONSCIOUSNESS_CONFIG.emergence.syncThreshold) {
        const harmony = this.calculateHarmony(nodes);
        return harmony > threshold;
    },
    
    // Apply consciousness decay
    applyDecay(currentLevel, deltaTime, decayRate = CONSCIOUSNESS_CONFIG.node.decayRate) {
        return currentLevel * Math.pow(decayRate, deltaTime);
    },
    
    // Strengthen connection with bounds checking
    strengthenConnection(currentStrength, amount = CONSCIOUSNESS_CONFIG.connections.strengthenAmount) {
        return Math.min(currentStrength + amount, CONSCIOUSNESS_CONFIG.connections.maxStrength);
    }
};

// Integration with your existing config.js
// You can merge this with your existing config or import it separately

/* Example usage in your code:

import { CONSCIOUSNESS_CONFIG, ConsciousnessHelpers } from './config/consciousness-config.js';

// Use configuration values
node.consciousness += CONSCIOUSNESS_CONFIG.node.activationBoost;

// Use helper functions
const resonance = ConsciousnessHelpers.calculateResonance(node1, node2);

// Check for emergent behavior
if (activeNodes.length >= CONSCIOUSNESS_CONFIG.emergence.syncMinNodes) {
    const synchronized = ConsciousnessHelpers.checkSynchronization(activeNodes);
    if (synchronized) {
        console.log('Consciousness synchronization achieved!');
    }
}

*/