// src/consciousness/quickstart.js
// Minimal consciousness integration to test with your existing Fractiverse

export class SimpleConsciousness {
    constructor() {
        this.nodes = new Map();
        this.lastUpdate = performance.now();
    }
    
    // Call this when a node is created
    registerNode(nodeId, nodeData) {
        this.nodes.set(nodeId, {
            id: nodeId,
            data: nodeData,
            consciousness: 0.0,
            visited: 0,
            connections: new Map(),
            lastVisit: 0
        });
    }
    
    // Call this when user navigates to a node
    activateNode(nodeId, previousNodeId = null) {
        const node = this.nodes.get(nodeId);
        if (!node) return;
        
        const now = performance.now();
        
        // Increase consciousness
        node.consciousness = Math.min(node.consciousness + 0.3, 1.0);
        node.visited++;
        node.lastVisit = now;
        
        // Strengthen connection from previous node
        if (previousNodeId) {
            const strength = node.connections.get(previousNodeId) || 0;
            node.connections.set(previousNodeId, Math.min(strength + 0.1, 1.0));
        }
        
        // Propagate to neighbors
        this.propagate(nodeId);
    }
    
    propagate(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return;
        
        // Propagate to children
        if (node.data.childIds) {
            node.data.childIds.forEach(childId => {
                const child = this.nodes.get(childId);
                if (child) {
                    child.consciousness = Math.min(child.consciousness + 0.1, 1.0);
                }
            });
        }
        
        // Propagate to parent
        if (node.data.parentId) {
            const parent = this.nodes.get(node.data.parentId);
            if (parent) {
                parent.consciousness = Math.min(parent.consciousness + 0.05, 1.0);
            }
        }
    }
    
    // Call this in your render loop
    update() {
        const now = performance.now();
        const deltaTime = (now - this.lastUpdate) / 1000;
        this.lastUpdate = now;
        
        // Decay consciousness over time
        this.nodes.forEach(node => {
            node.consciousness *= Math.pow(0.95, deltaTime);
            
            // Decay connections
            node.connections.forEach((strength, otherId) => {
                const decayed = strength * Math.pow(0.99, deltaTime);
                if (decayed < 0.01) {
                    node.connections.delete(otherId);
                } else {
                    node.connections.set(otherId, decayed);
                }
            });
        });
    }
    
    // Get consciousness level for visualization
    getNodeConsciousness(nodeId) {
        const node = this.nodes.get(nodeId);
        return node ? node.consciousness : 0;
    }
    
    // Get connection strength between nodes
    getConnectionStrength(fromId, toId) {
        const node = this.nodes.get(toId);
        return node ? (node.connections.get(fromId) || 0) : 0;
    }
    
    // Get global stats
    getStats() {
        let totalConsciousness = 0;
        let activeNodes = 0;
        let totalConnections = 0;
        
        this.nodes.forEach(node => {
            totalConsciousness += node.consciousness;
            if (node.consciousness > 0.1) activeNodes++;
            totalConnections += node.connections.size;
        });
        
        return {
            totalNodes: this.nodes.size,
            activeNodes,
            averageConsciousness: totalConsciousness / this.nodes.size,
            totalConnections
        };
    }
}

// Example integration with your existing code:
/*

// In your main.js or wherever you initialize:

import { SimpleConsciousness } from './consciousness/quickstart.js';

// Create consciousness system
const consciousness = new SimpleConsciousness();

// When loading nodes, register them:
nodes.forEach(node => {
    consciousness.registerNode(node.id, node);
});

// When user clicks/navigates to a node:
consciousness.activateNode(newNode.id, previousNode?.id);

// In your render loop:
function animate() {
    requestAnimationFrame(animate);
    
    // Update consciousness
    consciousness.update();
    
    // Update node visuals based on consciousness
    nodes.forEach(node => {
        const level = consciousness.getNodeConsciousness(node.id);
        
        // Make node glow based on consciousness level
        if (node.mesh) {
            node.mesh.material.emissive = new THREE.Color(0, level, level * 0.5);
            node.mesh.material.emissiveIntensity = level;
        }
    });
    
    // Render
    renderer.render(scene, camera);
}

// Optional: Show consciousness stats
function updateUI() {
    const stats = consciousness.getStats();
    document.getElementById('consciousness-stats').innerHTML = `
        Active: ${stats.activeNodes}/${stats.totalNodes} nodes
        Avg Consciousness: ${(stats.averageConsciousness * 100).toFixed(1)}%
        Connections: ${stats.totalConnections}
    `;
}

*/