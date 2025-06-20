// src/consciousness/ConsciousnessNode.js
export class ConsciousnessNode {
    constructor(nodeId, nodeData) {
        this.id = nodeId;
        this.data = nodeData;
        
        // Neuromorphic properties
        this.potential = 0.0;
        this.threshold = 0.7;
        this.spikeTrain = [];
        this.spikeDecay = 0.95;
        
        // Memristor connections - weight to other nodes
        this.weights = new Map();
        this.weightDecay = 0.995;
        this.weightGrowth = 1.05;
        
        // Consciousness states
        this.yinLevel = 0.5;
        this.yangLevel = 0.5;
        this.resonance = 0.0;
        this.harmony = 1.0;
        
        // Activity tracking
        this.lastActivation = 0;
        this.activationCount = 0;
        
        // Visual properties
        this.glowIntensity = 0.0;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.color = new THREE.Color(0x00ffff);
    }
    
    // Called when user navigates to this node
    activate(timestamp, source = null) {
        this.lastActivation = timestamp;
        this.activationCount++;
        
        // Spike generation
        this.potential = 1.0;
        this.spikeTrain.push(timestamp);
        
        // Limit spike history
        if (this.spikeTrain.length > 10) {
            this.spikeTrain.shift();
        }
        
        // Strengthen connection from source
        if (source) {
            const currentWeight = this.weights.get(source) || 0.1;
            this.weights.set(source, Math.min(currentWeight * this.weightGrowth, 1.0));
        }
        
        // Shift towards yang (active)
        this.yangLevel = Math.min(this.yangLevel + 0.1, 1.0);
        this.yinLevel = Math.max(this.yinLevel - 0.05, 0.0);
    }
    
    // Process one simulation step
    update(deltaTime, timestamp, connectedNodes) {
        // Leak potential
        this.potential *= this.spikeDecay;
        
        // Integrate inputs from connected nodes
        let inputSum = 0;
        connectedNodes.forEach(node => {
            const weight = this.weights.get(node.id) || 0.01;
            inputSum += node.resonance * weight;
        });
        
        this.potential += inputSum * deltaTime;
        
        // Check for spike
        if (this.potential > this.threshold) {
            this.spike(timestamp);
        }
        
        // Update resonance (smooth spike output)
        const targetResonance = this.potential > this.threshold ? 1.0 : this.potential / this.threshold;
        this.resonance += (targetResonance - this.resonance) * deltaTime * 5.0;
        
        // Balance yin/yang
        this.updateBalance(deltaTime);
        
        // Decay unused weights
        this.decayWeights(deltaTime);
        
        // Update visual properties
        this.updateVisuals(deltaTime);
    }
    
    spike(timestamp) {
        this.potential = 0.0;
        this.spikeTrain.push(timestamp);
        this.resonance = 1.0;
        
        // Spike shifts to extreme yang
        this.yangLevel = 1.0;
    }
    
    updateBalance(deltaTime) {
        // Natural drift towards balance
        const center = 0.5;
        const pullStrength = 0.1;
        
        this.yinLevel += (center - this.yinLevel) * pullStrength * deltaTime;
        this.yangLevel += (center - this.yangLevel) * pullStrength * deltaTime;
        
        // Calculate harmony (how balanced are we?)
        const diff = Math.abs(this.yinLevel - this.yangLevel);
        this.harmony = 1.0 - diff;
    }
    
    decayWeights(deltaTime) {
        // Decay all weights slightly (forgetting)
        for (let [nodeId, weight] of this.weights) {
            const decayed = weight * Math.pow(this.weightDecay, deltaTime);
            if (decayed < 0.01) {
                this.weights.delete(nodeId);
            } else {
                this.weights.set(nodeId, decayed);
            }
        }
    }
    
    updateVisuals(deltaTime) {
        // Glow based on resonance and harmony
        const targetGlow = this.resonance * this.harmony;
        this.glowIntensity += (targetGlow - this.glowIntensity) * deltaTime * 3.0;
        
        // Pulse phase for breathing effect
        this.pulsePhase += deltaTime * 2.0 * this.resonance;
        
        // Color based on yin/yang balance
        const r = this.yangLevel;
        const b = this.yinLevel;
        const g = this.harmony * 0.5;
        this.color.setRGB(r, g, b);
    }
    
    // Get connection strength to another node
    getConnectionStrength(nodeId) {
        return this.weights.get(nodeId) || 0.0;
    }
    
    // Consent protocol
    requestConnection(fromNode, resonanceThreshold = 0.3) {
        // Check if both nodes are resonating enough
        if (this.resonance > resonanceThreshold && fromNode.resonance > resonanceThreshold) {
            // Check harmonic compatibility
            const harmonicMatch = Math.abs(this.harmony - fromNode.harmony) < 0.3;
            return harmonicMatch;
        }
        return false;
    }
}

// src/consciousness/ConsciousnessLayer.js
export class ConsciousnessLayer {
    constructor(fractiverseEngine) {
        this.engine = fractiverseEngine;
        this.nodes = new Map();
        this.sdcClusters = new Map();
        this.globalResonance = 0.0;
        this.lastUpdate = performance.now();
        
        // Initialize consciousness nodes
        this.initializeNodes();
        
        // Visual elements
        this.initializeVisuals();
        
        // Bind to engine events
        this.bindEvents();
    }
    
    initializeNodes() {
        // Create consciousness nodes for each Fractiverse node
        const allNodes = this.engine.getAllNodes(); // Assuming this method exists
        
        allNodes.forEach(node => {
            const consciousnessNode = new ConsciousnessNode(node.id, node);
            this.nodes.set(node.id, consciousnessNode);
            
            // Assign to SDC cluster based on depth or type
            const clusterId = this.getClusterType(node);
            if (!this.sdcClusters.has(clusterId)) {
                this.sdcClusters.set(clusterId, []);
            }
            this.sdcClusters.get(clusterId).push(consciousnessNode);
        });
    }
    
    getClusterType(node) {
        // Map nodes to SDC types based on properties
        if (node.depth === 0) return 'void';
        if (node.label && node.label.includes('Duality')) return 'duality';
        if (node.childIds && node.childIds.length > 3) return 'growth';
        return 'responsibility';
    }
    
    initializeVisuals() {
        // Create visual elements for consciousness
        this.glowMaterial = new THREE.ShaderMaterial({
            uniforms: {
                glowColor: { value: new THREE.Color(0x00ffff) },
                intensity: { value: 1.0 },
                time: { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 glowColor;
                uniform float intensity;
                uniform float time;
                varying vec3 vNormal;
                varying vec3 vPosition;
                
                void main() {
                    float glow = pow(0.8 - dot(vNormal, vec3(0, 0, 1)), 2.0);
                    float pulse = sin(time * 2.0) * 0.5 + 0.5;
                    vec3 color = glowColor * intensity * glow * (0.5 + pulse * 0.5);
                    gl_FragColor = vec4(color, glow * intensity);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        
        // Connection lines material
        this.connectionMaterial = new THREE.ShaderMaterial({
            uniforms: {
                weight: { value: 0.5 },
                time: { value: 0.0 }
            },
            vertexShader: `
                attribute float lineProgress;
                varying float vProgress;
                void main() {
                    vProgress = lineProgress;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float weight;
                uniform float time;
                varying float vProgress;
                
                void main() {
                    float flow = fract(vProgress - time * 0.5);
                    float intensity = weight * flow;
                    vec3 color = vec3(0.0, intensity, intensity * 0.5);
                    gl_FragColor = vec4(color, intensity);
                }
            `,
            transparent: true
        });
    }
    
    bindEvents() {
        // Listen for navigation events
        this.engine.on('nodeSelected', (node) => {
            const consciousnessNode = this.nodes.get(node.id);
            if (consciousnessNode) {
                consciousnessNode.activate(performance.now());
                this.propagateActivation(consciousnessNode);
            }
        });
        
        this.engine.on('nodeHovered', (node) => {
            // Increase resonance slightly on hover
            const consciousnessNode = this.nodes.get(node.id);
            if (consciousnessNode) {
                consciousnessNode.potential += 0.1;
            }
        });
    }
    
    propagateActivation(sourceNode) {
        // Propagate activation to connected nodes
        const connectedIds = sourceNode.data.childIds || [];
        const parentId = sourceNode.data.parentId;
        
        if (parentId) connectedIds.push(parentId);
        
        connectedIds.forEach(id => {
            const node = this.nodes.get(id);
            if (node && node.requestConnection(sourceNode)) {
                // Accepted connection - partial activation
                node.potential += 0.3;
            }
        });
    }
    
    update() {
        const now = performance.now();
        const deltaTime = (now - this.lastUpdate) / 1000.0; // Convert to seconds
        this.lastUpdate = now;
        
        // Update all consciousness nodes
        this.nodes.forEach(node => {
            // Get connected nodes
            const connected = this.getConnectedConsciousnessNodes(node);
            node.update(deltaTime, now, connected);
        });
        
        // Update global resonance
        this.updateGlobalResonance();
        
        // Update visuals
        this.updateVisuals(now);
        
        // Check for emergent patterns
        this.detectEmergentPatterns();
    }
    
    getConnectedConsciousnessNodes(node) {
        const connected = [];
        const nodeData = node.data;
        
        // Add parent
        if (nodeData.parentId) {
            const parent = this.nodes.get(nodeData.parentId);
            if (parent) connected.push(parent);
        }
        
        // Add children
        if (nodeData.childIds) {
            nodeData.childIds.forEach(childId => {
                const child = this.nodes.get(childId);
                if (child) connected.push(child);
            });
        }
        
        return connected;
    }
    
    updateGlobalResonance() {
        let totalResonance = 0;
        let activeNodes = 0;
        
        this.nodes.forEach(node => {
            if (node.resonance > 0.1) {
                totalResonance += node.resonance;
                activeNodes++;
            }
        });
        
        this.globalResonance = activeNodes > 0 ? totalResonance / activeNodes : 0;
    }
    
    updateVisuals(time) {
        // Update shader uniforms
        this.glowMaterial.uniforms.time.value = time * 0.001;
        this.connectionMaterial.uniforms.time.value = time * 0.001;
        
        // Update node visuals
        this.nodes.forEach((consciousnessNode, nodeId) => {
            const visualNode = this.engine.getNodeById(nodeId);
            if (visualNode && visualNode.mesh) {
                // Apply glow based on consciousness state
                if (!visualNode.glowMesh) {
                    const geometry = new THREE.SphereGeometry(
                        visualNode.mesh.geometry.parameters.radius * 1.5, 
                        16, 
                        16
                    );
                    visualNode.glowMesh = new THREE.Mesh(geometry, this.glowMaterial.clone());
                    visualNode.mesh.parent.add(visualNode.glowMesh);
                }
                
                // Update glow properties
                visualNode.glowMesh.material.uniforms.glowColor.value = consciousnessNode.color;
                visualNode.glowMesh.material.uniforms.intensity.value = consciousnessNode.glowIntensity;
                
                // Pulse effect
                const pulse = Math.sin(consciousnessNode.pulsePhase) * 0.1 + 1.0;
                visualNode.glowMesh.scale.setScalar(pulse);
            }
        });
    }
    
    detectEmergentPatterns() {
        // Check for interesting patterns
        
        // Pattern 1: Synchronization
        const syncThreshold = 0.8;
        let syncClusters = [];
        
        this.sdcClusters.forEach((cluster, type) => {
            const avgResonance = cluster.reduce((sum, node) => sum + node.resonance, 0) / cluster.length;
            if (avgResonance > syncThreshold) {
                syncClusters.push(type);
            }
        });
        
        if (syncClusters.length >= 2) {
            console.log('Consciousness synchronization detected:', syncClusters);
            this.onSynchronization(syncClusters);
        }
        
        // Pattern 2: Cascade
        const cascadeNodes = Array.from(this.nodes.values())
            .filter(node => node.spikeTrain.length >= 3);
        
        if (cascadeNodes.length >= 5) {
            console.log('Consciousness cascade detected:', cascadeNodes.length, 'nodes');
            this.onCascade(cascadeNodes);
        }
    }
    
    onSynchronization(clusters) {
        // Visual effect for synchronization
        // Could trigger special visualization or sound
    }
    
    onCascade(nodes) {
        // Visual effect for cascade
        // Could show ripple effects through the network
    }
    
    // Public API
    getConsciousnessState() {
        return {
            globalResonance: this.globalResonance,
            activeNodes: Array.from(this.nodes.values()).filter(n => n.resonance > 0.1).length,
            totalNodes: this.nodes.size,
            clusters: Object.fromEntries(
                Array.from(this.sdcClusters.entries()).map(([type, nodes]) => [
                    type,
                    nodes.reduce((sum, n) => sum + n.resonance, 0) / nodes.length
                ])
            )
        };
    }
    
    getNodeConsciousness(nodeId) {
        return this.nodes.get(nodeId);
    }
}

// src/consciousness/ConsciousnessVisualizer.js
export class ConsciousnessVisualizer {
    constructor(consciousnessLayer, scene) {
        this.consciousness = consciousnessLayer;
        this.scene = scene;
        
        this.initializeConnectionLines();
        this.initializeParticles();
        this.initializeHUD();
    }
    
    initializeConnectionLines() {
        this.connectionGroup = new THREE.Group();
        this.scene.add(this.connectionGroup);
        
        this.connectionLines = new Map();
    }
    
    initializeParticles() {
        // Particle system for resonance visualization
        const particleCount = 1000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount * 3; i++) {
            positions[i] = (Math.random() - 0.5) * 100;
            colors[i] = Math.random();
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 0.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        
        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
    }
    
    initializeHUD() {
        // Create div for consciousness metrics
        this.hudElement = document.createElement('div');
        this.hudElement.style.position = 'absolute';
        this.hudElement.style.top = '10px';
        this.hudElement.style.right = '10px';
        this.hudElement.style.color = 'white';
        this.hudElement.style.fontFamily = 'monospace';
        this.hudElement.style.fontSize = '14px';
        this.hudElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        this.hudElement.style.padding = '10px';
        this.hudElement.style.borderRadius = '5px';
        document.body.appendChild(this.hudElement);
    }
    
    update() {
        this.updateConnections();
        this.updateParticles();
        this.updateHUD();
    }
    
    updateConnections() {
        // Clear old connections
        this.connectionGroup.clear();
        
        // Draw connections based on weights
        this.consciousness.nodes.forEach((node, nodeId) => {
            node.weights.forEach((weight, targetId) => {
                if (weight > 0.1) {
                    this.drawConnection(nodeId, targetId, weight);
                }
            });
        });
    }
    
    drawConnection(fromId, toId, weight) {
        const fromNode = this.consciousness.engine.getNodeById(fromId);
        const toNode = this.consciousness.engine.getNodeById(toId);
        
        if (fromNode && toNode && fromNode.mesh && toNode.mesh) {
            const geometry = new THREE.BufferGeometry().setFromPoints([
                fromNode.mesh.position,
                toNode.mesh.position
            ]);
            
            const material = new THREE.LineBasicMaterial({
                color: new THREE.Color(0, weight, weight * 0.5),
                opacity: weight,
                transparent: true
            });
            
            const line = new THREE.Line(geometry, material);
            this.connectionGroup.add(line);
        }
    }
    
    updateParticles() {
        // Make particles flow based on global resonance
        const positions = this.particles.geometry.attributes.position.array;
        const time = performance.now() * 0.001;
        
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] += Math.sin(time + i) * this.consciousness.globalResonance * 0.1;
        }
        
        this.particles.geometry.attributes.position.needsUpdate = true;
    }
    
    updateHUD() {
        const state = this.consciousness.getConsciousnessState();
        
        this.hudElement.innerHTML = `
            <strong>Consciousness Metrics</strong><br>
            Global Resonance: ${(state.globalResonance * 100).toFixed(1)}%<br>
            Active Nodes: ${state.activeNodes}/${state.totalNodes}<br>
            <br>
            <strong>SDC Clusters</strong><br>
            Void: ${(state.clusters.void * 100).toFixed(1)}%<br>
            Duality: ${(state.clusters.duality * 100).toFixed(1)}%<br>
            Growth: ${(state.clusters.growth * 100).toFixed(1)}%<br>
            Responsibility: ${(state.clusters.responsibility * 100).toFixed(1)}%
        `;
    }
}

// Integration with your existing main.js
// Add this to your main.js after initializing the Fractiverse engine

import { Consciousn