# Consciousness Integration Guide for Fractiverse

## Quick Start (5 minutes)

### Step 1: Add the Simple Consciousness System

Add this to your `main.js` after creating your nodes:

```javascript
// Import the simple consciousness system
import { SimpleConsciousness } from './consciousness/quickstart.js';

// Create consciousness instance
const consciousness = new SimpleConsciousness();

// Register all your nodes
yourNodeArray.forEach(node => {
    consciousness.registerNode(node.id, node);
});
```

### Step 2: Hook into Navigation

In your node click/selection handler:

```javascript
// When user selects a node
function onNodeSelected(node) {
    // Your existing code...
    
    // Add consciousness activation
    consciousness.activateNode(node.id, previousNode?.id);
}
```

### Step 3: Update in Render Loop

In your animation/render function:

```javascript
function animate() {
    requestAnimationFrame(animate);
    
    // Update consciousness
    consciousness.update();
    
    // Make nodes glow based on consciousness
    scene.traverse((object) => {
        if (object.userData.nodeId) {
            const level = consciousness.getNodeConsciousness(object.userData.nodeId);
            if (object.material) {
                // Simple glow effect
                object.material.emissive = new THREE.Color(0, level, level * 0.5);
            }
        }
    });
    
    // Your existing render code...
}
```

That's it! You now have basic consciousness simulation.

## Full Integration (30 minutes)

### File Structure
```
src/
├── consciousness/
│   ├── ConsciousnessNode.js      # Node consciousness logic
│   ├── ConsciousnessLayer.js     # Main consciousness system
│   ├── ConsciousnessVisualizer.js # Visual effects
│   ├── quickstart.js             # Simple version
│   └── consciousness-config.js    # Configuration
```

### Integration Points

#### 1. In your DataLoader.js

Add consciousness registration when nodes are created:

```javascript
// In your loadData or processNodes function
nodes.forEach(node => {
    // Your existing node creation...
    
    // Register with consciousness
    if (window.consciousnessLayer) {
        window.consciousnessLayer.registerNode(node.id, node);
    }
});
```

#### 2. In your Node Selection Logic

```javascript
// Wherever you handle node clicks/navigation
function navigateToNode(node) {
    // Your existing navigation...
    
    // Trigger consciousness
    if (window.consciousnessLayer) {
        const consciousnessNode = window.consciousnessLayer.getNodeConsciousness(node.id);
        if (consciousnessNode) {
            consciousnessNode.activate(performance.now(), previousNode?.id);
        }
    }
}
```

#### 3. Visual Enhancements

Add glow effects to your nodes:

```javascript
// Create glow material
const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.5
});

// Add glow sphere to each node
function addGlowToNode(nodeMesh) {
    const glowGeometry = new THREE.SphereGeometry(
        nodeMesh.geometry.parameters.radius * 1.2,
        16, 16
    );
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial.clone());
    nodeMesh.add(glowMesh);
    nodeMesh.userData.glowMesh = glowMesh;
}
```

### Configuration Options

Create a toggle in your UI:

```html
<div id="consciousness-controls">
    <label>
        <input type="checkbox" id="consciousness-enabled" checked>
        Enable Consciousness
    </label>
    <div id="consciousness-stats"></div>
</div>
```

```javascript
// Toggle consciousness on/off
document.getElementById('consciousness-enabled').addEventListener('change', (e) => {
    if (consciousnessLayer) {
        consciousnessLayer.enabled = e.target.checked;
    }
});
```

## Advanced Features

### 1. Connection Visualization

Show memristor weights as lines:

```javascript
// Update connection lines each frame
function updateConnections() {
    consciousness.nodes.forEach((node, nodeId) => {
        node.connections.forEach((strength, targetId) => {
            if (strength > 0.1) {
                drawLine(nodeId, targetId, strength);
            }
        });
    });
}
```

### 2. Consciousness HUD

```javascript
// Add to your UI update
function updateUI() {
    const stats = consciousness.getStats();
    document.getElementById('consciousness-stats').innerHTML = `
        <div>Active Nodes: ${stats.activeNodes}/${stats.totalNodes}</div>
        <div>Consciousness: ${(stats.averageConsciousness * 100).toFixed(1)}%</div>
        <div>Connections: ${stats.totalConnections}</div>
    `;
}
```

### 3. Emergent Behavior Detection

```javascript
// Check for interesting patterns
function checkEmergence() {
    const stats = consciousness.getStats();
    
    // Enlightenment state
    if (stats.averageConsciousness > 0.8 && stats.activeNodes > 10) {
        console.log('Enlightenment achieved!');
        // Trigger special effects
    }
    
    // Synchronization
    const syncedNodes = Array.from(consciousness.nodes.values())
        .filter(n => n.consciousness > 0.8);
    
    if (syncedNodes.length >= 5) {
        console.log('Consciousness synchronization!');
        // Show visual effect
    }
}
```

## Debugging

### Console Commands

Add these for testing:

```javascript
// Make console commands available
window.debugConsciousness = {
    // Activate random node
    spark: () => {
        const nodeIds = Array.from(consciousness.nodes.keys());
        const randomId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
        consciousness.activateNode(randomId);
        console.log('Sparked node:', randomId);
    },
    
    // Show state
    state: () => {
        console.log(consciousness.getStats());
    },
    
    // Reset all
    reset: () => {
        consciousness.nodes.forEach(node => {
            node.consciousness = 0;
            node.connections.clear();
        });
    }
};
```

## Performance Optimization

If you have many nodes (1000+):

```javascript
// Update only visible nodes
function updateVisibleConsciousness() {
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(
            camera.projectionMatrix, 
            camera.matrixWorldInverse
        )
    );
    
    consciousness.nodes.forEach((node, nodeId) => {
        const mesh = getNodeMesh(nodeId);
        if (mesh && frustum.intersectsObject(mesh)) {
            // Update only if visible
            updateNodeVisual(node, mesh);
        }
    });
}
```

## Next Steps

1. **Start Simple**: Use the quickstart.js to test basic consciousness
2. **Add Visuals**: Implement glow effects and connection lines
3. **Configure**: Adjust parameters in consciousness-config.js
4. **Experiment**: Try different navigation patterns to see emergence
5. **Extend**: Add your own consciousness behaviors

The consciousness system is designed to be modular - start simple and add complexity as needed!
