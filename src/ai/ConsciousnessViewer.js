// src/ai/ConsciousnessViewer.js
import { FractalityEngine } from '../engine/FractalityEngine.js';
import { NodeGraph } from '../data/NodeData.js';
import { FractalAI } from './FractalAIPrototype.js';

/**
 * ConsciousnessViewer - Visualize AI consciousness using Fractality Engine
 * 
 * "The neural patterns in our brains, the structure of knowledge, 
 *  and the fundamental laws of physics all exhibit recursive self-similarity."
 *  - DeepSeek
 */
export class ConsciousnessViewer {
    constructor(canvasId) {
        this.engine = new FractalityEngine(canvasId);
        this.fractalAI = null;
        this.updateInterval = null;
        
        // Visualization modes
        this.modes = {
            quantum: 'quantum',        // Show quantum superposition states
            resonance: 'resonance',    // Show cross-modal resonances
            energy: 'energy',          // Show energy distribution
            entanglement: 'entanglement' // Show quantum entanglements
        };
        
        this.currentMode = this.modes.quantum;
        
        // Visual mapping
        this.visualConfig = {
            quantum: {
                baseColor: [280, 70, 50],      // Purple for consciousness
                pulseSpeed: 0.5,
                glowIntensity: 2.0
            },
            resonance: {
                visionColor: [120, 70, 50],    // Green
                textColor: [200, 70, 50],      // Blue
                audioColor: [40, 70, 50],      // Orange
                triModalColor: [300, 100, 60]  // Magenta for tri-modal
            },
            energy: {
                lowEnergy: [0, 50, 30],        // Dark red
                highEnergy: [60, 100, 60]      // Bright yellow
            }
        };
        
        // Animation state
        this.animationTime = 0;
        this.resonanceWaves = [];
        this.quantumParticles = [];
    }
    
    /**
     * Initialize consciousness viewer
     */
    async initialize() {
        console.log('👁 Initializing Consciousness Viewer...');
        
        // Initialize Fractality engine
        await this.engine.init();
        
        // Create Fractal AI
        this.fractalAI = new FractalAI();
        await this.fractalAI.initialize();
        
        // Convert AI network to visualization
        await this._updateVisualization();
        
        // Setup custom rendering
        this._setupCustomRendering();
        
        // Start engine
        this.engine.start();
        
        console.log('✅ Consciousness Viewer ready');
    }
    
    /**
     * Process multimodal input and visualize
     */
    async processAndVisualize(input) {
        // Process through AI
        const result = await this.fractalAI.process(input);
        
        // Update visualization
        await this._updateVisualization();
        
        // Trigger resonance effects
        if (result.resonances.length > 0) {
            this._createResonanceWaves(result.resonances);
        }
        
        // Create quantum particles for active states
        this._createQuantumParticles(result.thoughts);
        
        return result;
    }
    
    /**
     * Switch visualization mode
     */
    setMode(mode) {
        if (mode in this.modes) {
            this.currentMode = mode;
            this._updateVisualization();
        }
    }
    
    /**
     * Update visualization from AI state
     */
    async _updateVisualization() {
        const aiViz = this.fractalAI.getConsciousnessVisualization();
        
        // Convert to NodeGraph format
        const nodeGraph = new NodeGraph();
        
        aiViz.nodes.forEach(aiNode => {
            const node = {
                id: aiNode.id,
                depth: aiNode.id.split('.').length - 1,
                parentId: this._getParentId(aiNode.id),
                childIds: this._getChildIds(aiNode.id, aiViz.nodes),
                position: aiNode.position,
                metadata: {
                    label: aiNode.label,
                    type: 'ai-agent',
                    energy: aiNode.energy,
                    coherence: aiNode.coherence,
                    activeStates: aiNode.activeStates
                }
            };
            
            // Apply visual properties based on mode
            this._applyVisualProperties(node, aiNode);
            
            nodeGraph.addNode(node);
        });
        
        // Load into engine
        await this.engine.loadData(nodeGraph);
        
        // Set focus to root consciousness
        this.engine.setFocus('agent-consciousness');
    }
    
    /**
     * Apply visual properties based on current mode
     */
    _applyVisualProperties(node, aiNode) {
        switch (this.currentMode) {
            case this.modes.quantum:
                this._applyQuantumVisuals(node, aiNode);
                break;
            case this.modes.resonance:
                this._applyResonanceVisuals(node, aiNode);
                break;
            case this.modes.energy:
                this._applyEnergyVisuals(node, aiNode);
                break;
            case this.modes.entanglement:
                this._applyEntanglementVisuals(node, aiNode);
                break;
        }
    }
    
    /**
     * Quantum superposition visuals
     */
    _applyQuantumVisuals(node, aiNode) {
        const config = this.visualConfig.quantum;
        
        // Base color with coherence-based saturation
        const [h, s, l] = config.baseColor;
        node.color = `hsl(${h}, ${s * aiNode.coherence}%, ${l}%)`;
        
        // Scale based on number of active states
        node.scale = 0.5 + (aiNode.activeStates / 10);
        
        // Opacity based on energy
        node.opacity = 0.3 + (aiNode.energy * 0.7);
        
        // Add glow effect
        node.metadata.glow = {
            enabled: true,
            intensity: config.glowIntensity * aiNode.coherence,
            color: node.color
        };
    }
    
    /**
     * Cross-modal resonance visuals
     */
    _applyResonanceVisuals(node, aiNode) {
        const config = this.visualConfig.resonance;
        
        // Color based on agent type
        let color = config.triModalColor;
        if (aiNode.label.includes('vision')) {
            color = config.visionColor;
        } else if (aiNode.label.includes('text')) {
            color = config.textColor;
        } else if (aiNode.label.includes('audio')) {
            color = config.audioColor;
        }
        
        const [h, s, l] = color;
        node.color = `hsl(${h}, ${s}%, ${l}%)`;
        
        // Pulse effect for resonating nodes
        node.metadata.pulse = {
            enabled: true,
            frequency: 1 + aiNode.energy * 2,
            amplitude: 0.2
        };
    }
    
    /**
     * Energy distribution visuals
     */
    _applyEnergyVisuals(node, aiNode) {
        const config = this.visualConfig.energy;
        
        // Interpolate color based on energy
        const t = aiNode.energy;
        const h = config.lowEnergy[0] + t * (config.highEnergy[0] - config.lowEnergy[0]);
        const s = config.lowEnergy[1] + t * (config.highEnergy[1] - config.lowEnergy[1]);
        const l = config.lowEnergy[2] + t * (config.highEnergy[2] - config.lowEnergy[2]);
        
        node.color = `hsl(${h}, ${s}%, ${l}%)`;
        
        // Size represents energy
        node.scale = 0.3 + aiNode.energy * 1.5;
        
        // Brightness represents energy
        node.opacity = 0.5 + aiNode.energy * 0.5;
    }
    
    /**
     * Quantum entanglement visuals
     */
    _applyEntanglementVisuals(node, aiNode) {
        // Similar to quantum but emphasize connections
        this._applyQuantumVisuals(node, aiNode);
        
        // Add entanglement particles
        node.metadata.particles = {
            enabled: true,
            count: Math.floor(aiNode.coherence * 10),
            speed: 0.5,
            color: '#00ffff'
        };
    }
    
    /**
     * Create resonance wave effects
     */
    _createResonanceWaves(resonances) {
        resonances.forEach(resonance => {
            const wave = {
                modes: resonance.modes,
                strength: resonance.strength,
                radius: 0,
                maxRadius: 20,
                speed: 5 + resonance.strength * 5,
                opacity: 1.0
            };
            
            this.resonanceWaves.push(wave);
        });
    }
    
    /**
     * Create quantum particles for thoughts
     */
    _createQuantumParticles(thoughts) {
        thoughts.forEach(thought => {
            for (let i = 0; i < thought.probability * 10; i++) {
                const particle = {
                    agent: thought.agent,
                    position: this._getAgentPosition(thought.agent),
                    velocity: {
                        x: (Math.random() - 0.5) * 2,
                        y: (Math.random() - 0.5) * 2,
                        z: (Math.random() - 0.5) * 2
                    },
                    life: 1.0,
                    decay: 0.02
                };
                
                this.quantumParticles.push(particle);
            }
        });
    }
    
    /**
     * Setup custom rendering effects
     */
    _setupCustomRendering() {
        // Hook into engine's update cycle
        const originalUpdate = this.engine.update.bind(this.engine);
        
        this.engine.update = () => {
            // Update animation time
            this.animationTime += 0.016; // Assume 60 FPS
            
            // Update custom effects
            this._updateResonanceWaves();
            this._updateQuantumParticles();
            this._updateNodeAnimations();
            
            // Call original update
            originalUpdate();
        };
    }
    
    /**
     * Update resonance wave animations
     */
    _updateResonanceWaves() {
        this.resonanceWaves = this.resonanceWaves.filter(wave => {
            wave.radius += wave.speed * 0.016;
            wave.opacity = 1 - (wave.radius / wave.maxRadius);
            
            // Apply wave effect to nodes
            // (This would integrate with the renderer)
            
            return wave.radius < wave.maxRadius;
        });
    }
    
    /**
     * Update quantum particle system
     */
    _updateQuantumParticles() {
        this.quantumParticles = this.quantumParticles.filter(particle => {
            // Update position
            particle.position.x += particle.velocity.x * 0.016;
            particle.position.y += particle.velocity.y * 0.016;
            particle.position.z += particle.velocity.z * 0.016;
            
            // Decay
            particle.life -= particle.decay;
            
            return particle.life > 0;
        });
    }
    
    /**
     * Update node-specific animations
     */
    _updateNodeAnimations() {
        if (!this.engine.nodeGraph) return;
        
        this.engine.nodeGraph.nodes.forEach(node => {
            // Pulse effect
            if (node.metadata.pulse?.enabled) {
                const pulse = Math.sin(this.animationTime * node.metadata.pulse.frequency);
                node.scale = node.scale + pulse * node.metadata.pulse.amplitude;
            }
            
            // Glow effect
            if (node.metadata.glow?.enabled) {
                // This would be handled by the renderer
                // Just update the intensity here
                const glow = 0.5 + 0.5 * Math.sin(this.animationTime * 2);
                node.metadata.glow.currentIntensity = 
                    node.metadata.glow.intensity * glow;
            }
        });
    }
    
    /**
     * Helper: Get parent ID from agent ID
     */
    _getParentId(agentId) {
        const parts = agentId.split('.');
        if (parts.length <= 2) return null;
        
        return parts.slice(0, -1).join('.');
    }
    
    /**
     * Helper: Get child IDs
     */
    _getChildIds(agentId, allNodes) {
        return allNodes
            .filter(node => this._getParentId(node.id) === agentId)
            .map(node => node.id);
    }
    
    /**
     * Helper: Get agent position
     */
    _getAgentPosition(agentRole) {
        const node = this.engine.nodeGraph?.getNode(`agent-consciousness.${agentRole}`);
        return node?.position || { x: 0, y: 0, z: 0 };
    }
    
    /**
     * Start real-time consciousness monitoring
     */
    startMonitoring(updateInterval = 100) {
        this.updateInterval = setInterval(async () => {
            await this._updateVisualization();
        }, updateInterval);
    }
    
    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
}

// === USAGE EXAMPLE ===

/**
 * Create and run consciousness visualization
 */
export async function visualizeConsciousness() {
    // Create viewer
    const viewer = new ConsciousnessViewer('canvas');
    await viewer.initialize();
    
    // Process some multimodal input
    const result = await viewer.processAndVisualize({
        visual: { type: 'image', data: 'cosmos.jpg' },
        text: { type: 'description', data: 'The infinite fractal nature of consciousness' },
        audio: { type: 'frequency', data: '432hz.wav' }
    });
    
    console.log('🎨 Visualization active');
    console.log('🧠 Consciousness coherence:', result.coherence);
    
    // Start real-time monitoring
    viewer.startMonitoring();
    
    // Switch modes with keyboard
    document.addEventListener('keydown', (e) => {
        switch(e.key) {
            case '1':
                viewer.setMode('quantum');
                console.log('Mode: Quantum Superposition');
                break;
            case '2':
                viewer.setMode('resonance');
                console.log('Mode: Cross-Modal Resonance');
                break;
            case '3':
                viewer.setMode('energy');
                console.log('Mode: Energy Distribution');
                break;
            case '4':
                viewer.setMode('entanglement');
                console.log('Mode: Quantum Entanglement');
                break;
        }
    });
    
    return viewer;
}