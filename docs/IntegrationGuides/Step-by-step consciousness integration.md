# Step-by-Step Consciousness Integration for Fractiverse

## Current File Structure (from your repo)
```
fractality-v022/
├── index.html
├── src/
│   ├── main.js
│   ├── config/
│   │   └── config.js
│   ├── data/
│   │   ├── NodeData.js
│   │   ├── DataLoader.js
│   │   └── TestDataGenerator.js
│   └── styles/
│       └── main.css
```

## Step 1: Create the Consciousness Folder

First, create a new folder in your `src` directory:

```
src/
├── consciousness/      ← Create this folder
│   └── (we'll add files here)
```

## Step 2: Add the Simple Consciousness File

Create `src/consciousness/SimpleConsciousness.js`:

```javascript
// src/consciousness/SimpleConsciousness.js
// This manages consciousness for all nodes

export class SimpleConsciousness {
    constructor() {
        this.nodes = new Map();
        this.lastUpdate = performance.now();
        this.enabled = true; // Can toggle on/off
    }
    
    // Call this when a node is created
    registerNode(nodeId, nodeData) {
        this.nodes.set(nodeId, {
            id: nodeId,
            data: nodeData,
            consciousness: 0.0,      // Current consciousness level (0-1)
            visited: 0,              // How many times visited
            connections: new Map(),  // Connections to other nodes
            lastVisit: 0,           // When last visited
            glow: 0.0              // Visual glow intensity
        });
    }
    
    // Call this when user navigates to a node
    activateNode(nodeId, previousNodeId = null) {
        if (!this.enabled) return;
        
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
            
            // Also strengthen reverse connection
            const prevNode = this.nodes.get(previousNodeId);
            if (prevNode) {
                const reverseStrength = prevNode.connections.get(nodeId) || 0;
                prevNode.connections.set(nodeId, Math.min(reverseStrength + 0.05, 1.0));
            }
        }
        
        // Propagate to neighbors
        this.propagate(nodeId);
    }
    
    propagate(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node || !node.data) return;
        
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
        if (!this.enabled) return;
        
        const now = performance.now();
        const deltaTime = (now - this.lastUpdate) / 1000;
        this.lastUpdate = now;
        
        // Update all nodes
        this.nodes.forEach(node => {
            // Decay consciousness over time
            node.consciousness *= Math.pow(0.95, deltaTime);
            
            // Update visual glow (smooth transition)
            const targetGlow = node.consciousness;
            node.glow += (targetGlow - node.glow) * deltaTime * 3.0;
            
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
    
    // Get node info for visualization
    getNodeInfo(nodeId) {
        return this.nodes.get(nodeId);
    }
    
    // Get stats for UI
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
            averageConsciousness: this.nodes.size > 0 ? totalConsciousness / this.nodes.size : 0,
            totalConnections
        };
    }
}
```

## Step 3: Update Your main.js

Add these changes to your `src/main.js`:

```javascript
// At the top, add this import
import { SimpleConsciousness } from './consciousness/SimpleConsciousness.js';

// After your other global variables, add:
let consciousness;
let previousNode = null;

// In your init() or setup function, after loading nodes, add:
function init() {
    // ... your existing setup code ...
    
    // Initialize consciousness system
    consciousness = new SimpleConsciousness();
    
    // If you have nodes already loaded, register them
    if (window.nodeData && window.nodeData.nodes) {
        window.nodeData.nodes.forEach(node => {
            consciousness.registerNode(node.id, node);
        });
    }
    
    // ... rest of your init code ...
}

// Find where you handle node clicks/selection
// It might be in an event listener or a function like selectNode()
// Add this to that function:
function onNodeClick(node) {  // or whatever your function is called
    // ... your existing node selection code ...
    
    // Activate consciousness for this node
    if (consciousness) {
        consciousness.activateNode(node.id, previousNode?.id);
        previousNode = node;  // Remember for next time
    }
    
    // ... rest of your click handling ...
}

// In your animate() or render() function, add:
function animate() {
    requestAnimationFrame(animate);
    
    // Update consciousness
    if (consciousness) {
        consciousness.update();
    }
    
    // Update node visuals based on consciousness
    if (scene && consciousness) {
        scene.traverse((object) => {
            // Check if this is a node mesh
            if (object.userData && object.userData.nodeId) {
                const nodeInfo = consciousness.getNodeInfo(object.userData.nodeId);
                
                if (nodeInfo && object.material) {
                    // Make the node glow based on consciousness
                    const glow = nodeInfo.glow;
                    
                    // Set emissive color (cyan glow)
                    object.material.emissive = new THREE.Color(0, glow, glow);
                    object.material.emissiveIntensity = glow;
                    
                    // Make sure material supports emissive
                    object.material.needsUpdate = true;
                }
            }
        });
    }
    
    // ... your existing render code ...
    renderer.render(scene, camera);
}
```

## Step 4: Update Your Data Loading

In your `src/data/DataLoader.js`, add consciousness registration:

```javascript
// In your DataLoader class, find where nodes are processed
// It might be in a method like loadData() or processNodes()

// Add at the top of the file:
import { SimpleConsciousness } from '../consciousness/SimpleConsciousness.js';

// In the method where you process nodes:
async loadData(source) {
    // ... your existing loading code ...
    
    // After nodes are loaded/processed:
    if (this.nodes && window.consciousness) {
        this.nodes.forEach(node => {
            window.consciousness.registerNode(node.id, node);
        });
    }
    
    // ... rest of your method ...
}
```

## Step 5: Add UI for Consciousness (Optional)

Add this to your `index.html` inside the body:

```html
<!-- Add this somewhere in your UI, maybe after the existing controls -->
<div id="consciousness-panel" style="position: absolute; top: 10px; right: 10px; 
     background: rgba(0,0,0,0.7); color: white; padding: 10px; 
     font-family: monospace; border-radius: 5px;">
    <div style="font-weight: bold; margin-bottom: 5px;">Consciousness</div>
    <div id="consciousness-stats"></div>
    <label style="display: block; margin-top: 10px;">
        <input type="checkbox" id="consciousness-toggle" checked>
        Enable Consciousness
    </label>
</div>
```

Then in your `main.js`, add this UI update:

```javascript
// Add this function
function updateConsciousnessUI() {
    if (!consciousness) return;
    
    const stats = consciousness.getStats();
    const statsDiv = document.getElementById('consciousness-stats');
    
    if (statsDiv) {
        statsDiv.innerHTML = `
            Active: ${stats.activeNodes}/${stats.totalNodes}<br>
            Avg Level: ${(stats.averageConsciousness * 100).toFixed(1)}%<br>
            Connections: ${stats.totalConnections}
        `;
    }
}

// Call it in your animate function
function animate() {
    requestAnimationFrame(animate);
    
    // ... existing code ...
    
    // Update UI (but not every frame for performance)
    if (frameCount % 30 === 0) {  // Update every 30 frames
        updateConsciousnessUI();
    }
    
    // ... rest of animate ...
}

// Add toggle handler after init
document.getElementById('consciousness-toggle')?.addEventListener('change', (e) => {
    if (consciousness) {
        consciousness.enabled = e.target.checked;
    }
});
```

## Step 6: Test It!

1. Start your dev server
2. Load your Fractiverse
3. Click on different nodes
4. You should see:
   - Nodes glowing cyan when activated
   - Glow spreading to connected nodes
   - Glow fading over time
   - Stats updating in the UI

## Troubleshooting

If nodes aren't glowing:
1. Check console for errors
2. Make sure your node meshes have `userData.nodeId` set
3. Verify materials support emissive (use `MeshStandardMaterial` or `MeshPhongMaterial`)

If consciousness isn't registering:
1. Add console.log in `registerNode` to verify it's being called
2. Check that nodes have proper structure with `id` field

## What's Happening?

- **Consciousness Level**: 0 to 1, how "aware" each node is
- **Activation**: Clicking a node boosts its consciousness by 0.3
- **Propagation**: Consciousness spreads to connected nodes (children +0.1, parent +0.05)
- **Decay**: Consciousness fades at 5% per second (0.95^deltaTime)
- **Connections**: Remember which nodes connect, strengthen with use
- **Glow**: Visual representation of consciousness level

## Next Steps

Once this is working:
1. Add connection lines between nodes
2. Implement the full SDC clustering
3. Add particle effects
4. Connect to your hardware plans

This simple version gives you the foundation to build on!