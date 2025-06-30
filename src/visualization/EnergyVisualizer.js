// src/visualization/EnergyVisualizer.js
import { loadThreeJS, getEnvironmentInfo } from '../utils/ThreeJSLoader.js';

/**
 * EnergyVisualizer - Visualizes mitochondrial-inspired energy flow
 * Creates particle effects and visual indicators for the three consciousness networks
 */
export class EnergyVisualizer {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        
        // Energy particle systems for each network
        this.particleSystems = {
            executive: null,
            memory: null,
            sensory: null
        };
        
        // Energy flow lines between nodes
        this.energyFlows = new Map();
        
        // Network colors (matching mitochondrial networks)
        this.networkColors = {
            executive: new THREE.Color('#ff00ff'), // Magenta
            memory: new THREE.Color('#00ffff'),    // Cyan
            sensory: new THREE.Color('#ffff00')    // Yellow
        };
        
        // Particle configuration
        this.particleConfig = {
            count: 1000,
            size: 0.1,
            speed: 0.5,
            spread: 50
        };
        
        // Energy field texture
        this.energyFieldTexture = null;
        
        // Animation state
        this.time = 0;
        
        this.init();
    }
    
    /**
     * Initialize all visualization components
     */
    init() {
        this.createParticleSystems();
        this.createEnergyFieldTexture();
        this.setupShaders();
    }
    
    /**
     * Create particle systems for each consciousness network
     */
    createParticleSystems() {
        Object.keys(this.networkColors).forEach(network => {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(this.particleConfig.count * 3);
            const velocities = new Float32Array(this.particleConfig.count * 3);
            const energyLevels = new Float32Array(this.particleConfig.count);
            
            // Initialize particles randomly
            for (let i = 0; i < this.particleConfig.count; i++) {
                const i3 = i * 3;
                
                // Random position within spread
                positions[i3] = (Math.random() - 0.5) * this.particleConfig.spread;
                positions[i3 + 1] = (Math.random() - 0.5) * this.particleConfig.spread;
                positions[i3 + 2] = (Math.random() - 0.5) * this.particleConfig.spread;
                
                // Random velocity
                velocities[i3] = (Math.random() - 0.5) * this.particleConfig.speed;
                velocities[i3 + 1] = (Math.random() - 0.5) * this.particleConfig.speed;
                velocities[i3 + 2] = (Math.random() - 0.5) * this.particleConfig.speed;
                
                // Random energy level
                energyLevels[i] = Math.random();
            }
            
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
            geometry.setAttribute('energy', new THREE.BufferAttribute(energyLevels, 1));
            
            // Custom shader material for energy particles
            const material = new THREE.ShaderMaterial({
                uniforms: {
                    color: { value: this.networkColors[network] },
                    time: { value: 0 },
                    size: { value: this.particleConfig.size }
                },
                vertexShader: this.getParticleVertexShader(),
                fragmentShader: this.getParticleFragmentShader(),
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            
            const particleSystem = new THREE.Points(geometry, material);
            particleSystem.name = `${network}Particles`;
            
            this.particleSystems[network] = particleSystem;
            this.scene.add(particleSystem);
        });
    }
    
    /**
     * Create energy field texture for background visualization
     */
    createEnergyFieldTexture() {
        const size = 256;
        const data = new Uint8Array(size * size * 4);
        
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const idx = (i * size + j) * 4;
                
                // Create fractal noise pattern
                const noise = this.fractalNoise(i / size, j / size, 4);
                const energy = Math.max(0, Math.min(255, noise * 255));
                
                data[idx] = energy;     // R
                data[idx + 1] = energy; // G
                data[idx + 2] = energy; // B
                data[idx + 3] = energy; // A
            }
        }
        
        this.energyFieldTexture = new THREE.DataTexture(
            data, size, size, THREE.RGBAFormat
        );
        this.energyFieldTexture.needsUpdate = true;
    }
    
    /**
     * Update all visualizations
     */
    update(deltaTime, consciousnessData) {
        this.time += deltaTime;
        
        // Update particle systems
        this.updateParticles(deltaTime, consciousnessData);
        
        // Update energy flows between connected nodes
        this.updateEnergyFlows(consciousnessData);
        
        // Update shader uniforms
        Object.values(this.particleSystems).forEach(system => {
            if (system.material.uniforms.time) {
                system.material.uniforms.time.value = this.time;
            }
        });
    }
    
    /**
     * Update particle positions based on energy flow
     */
    updateParticles(deltaTime, consciousnessData) {
        if (!consciousnessData) return;
        
        Object.entries(this.particleSystems).forEach(([network, system]) => {
            const positions = system.geometry.attributes.position.array;
            const velocities = system.geometry.attributes.velocity.array;
            const energyLevels = system.geometry.attributes.energy.array;
            
            // Get nodes in this network
            const networkNodes = consciousnessData.networks[network]?.nodes || new Set();
            const nodePositions = Array.from(networkNodes).map(nodeId => {
                const node = consciousnessData.nodes.get(nodeId);
                return node ? node.position : null;
            }).filter(pos => pos !== null);
            
            for (let i = 0; i < this.particleConfig.count; i++) {
                const i3 = i * 3;
                
                // Update position
                positions[i3] += velocities[i3] * deltaTime;
                positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
                positions[i3 + 2] += velocities[i3 + 2] * deltaTime;
                
                // Attract particles to nodes in their network
                if (nodePositions.length > 0) {
                    const targetNode = nodePositions[i % nodePositions.length];
                    const dx = targetNode.x - positions[i3];
                    const dy = targetNode.y - positions[i3 + 1];
                    const dz = targetNode.z - positions[i3 + 2];
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    
                    if (distance > 0.1) {
                        const attraction = 0.5 * deltaTime / distance;
                        velocities[i3] += dx * attraction;
                        velocities[i3 + 1] += dy * attraction;
                        velocities[i3 + 2] += dz * attraction;
                    }
                }
                
                // Add some turbulence
                velocities[i3] += (Math.random() - 0.5) * 0.1 * deltaTime;
                velocities[i3 + 1] += (Math.random() - 0.5) * 0.1 * deltaTime;
                velocities[i3 + 2] += (Math.random() - 0.5) * 0.1 * deltaTime;
                
                // Damping
                velocities[i3] *= 0.98;
                velocities[i3 + 1] *= 0.98;
                velocities[i3 + 2] *= 0.98;
                
                // Update energy based on network activity
                const networkEnergy = consciousnessData.networks[network]?.totalEnergy || 0;
                energyLevels[i] = 0.5 + 0.5 * Math.sin(this.time + i * 0.1) * 
                                  (networkEnergy / 500); // Normalize to 0-1
                
                // Respawn particles that drift too far
                const maxDist = this.particleConfig.spread;
                if (Math.abs(positions[i3]) > maxDist ||
                    Math.abs(positions[i3 + 1]) > maxDist ||
                    Math.abs(positions[i3 + 2]) > maxDist) {
                    
                    positions[i3] = (Math.random() - 0.5) * maxDist;
                    positions[i3 + 1] = (Math.random() - 0.5) * maxDist;
                    positions[i3 + 2] = (Math.random() - 0.5) * maxDist;
                }
            }
            
            system.geometry.attributes.position.needsUpdate = true;
            system.geometry.attributes.velocity.needsUpdate = true;
            system.geometry.attributes.energy.needsUpdate = true;
        });
    }
    
    /**
     * Update energy flow visualizations between nodes
     */
    updateEnergyFlows(consciousnessData) {
        if (!consciousnessData || !consciousnessData.nodes) return;
        
        // Clear old flows
        this.energyFlows.forEach(flow => {
            this.scene.remove(flow);
            flow.geometry.dispose();
            flow.material.dispose();
        });
        this.energyFlows.clear();
        
        // Create flows for strong connections
        consciousnessData.nodes.forEach((node, nodeId) => {
            if (!node.connections) return;
            
            node.connections.forEach((strength, targetId) => {
                if (strength > 0.5) { // Only show strong connections
                    const targetNode = consciousnessData.nodes.get(targetId);
                    if (!targetNode) return;
                    
                    // Create energy flow line
                    const geometry = new THREE.BufferGeometry();
                    const points = [
                        new THREE.Vector3(node.position.x, node.position.y, node.position.z),
                        new THREE.Vector3(targetNode.position.x, targetNode.position.y, targetNode.position.z)
                    ];
                    geometry.setFromPoints(points);
                    
                    // Color based on source node's network
                    const network = node.network || 'executive';
                    const color = this.networkColors[network].clone();
                    color.multiplyScalar(strength); // Brightness based on connection strength
                    
                    const material = new THREE.LineBasicMaterial({
                        color: color,
                        opacity: strength * 0.5,
                        transparent: true,
                        blending: THREE.AdditiveBlending
                    });
                    
                    const flow = new THREE.Line(geometry, material);
                    this.energyFlows.set(`${nodeId}-${targetId}`, flow);
                    this.scene.add(flow);
                }
            });
        });
    }
    
    /**
     * Create energy burst effect at a position
     */
    createEnergyBurst(position, network = 'executive', intensity = 1.0) {
        const burstParticles = 50;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(burstParticles * 3);
        const velocities = new Float32Array(burstParticles * 3);
        
        for (let i = 0; i < burstParticles; i++) {
            const i3 = i * 3;
            
            // Start at burst position
            positions[i3] = position.x;
            positions[i3 + 1] = position.y;
            positions[i3 + 2] = position.z;
            
            // Random outward velocity
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const speed = intensity * (0.5 + Math.random() * 0.5);
            
            velocities[i3] = Math.sin(phi) * Math.cos(theta) * speed;
            velocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
            velocities[i3 + 2] = Math.cos(phi) * speed;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        
        const material = new THREE.PointsMaterial({
            color: this.networkColors[network],
            size: 0.2,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });
        
        const burst = new THREE.Points(geometry, material);
        this.scene.add(burst);
        
        // Animate burst
        const animateBurst = () => {
            const positions = burst.geometry.attributes.position.array;
            const velocities = burst.geometry.attributes.velocity.array;
            
            for (let i = 0; i < burstParticles * 3; i += 3) {
                positions[i] += velocities[i] * 0.016;
                positions[i + 1] += velocities[i + 1] * 0.016;
                positions[i + 2] += velocities[i + 2] * 0.016;
                
                // Damping
                velocities[i] *= 0.98;
                velocities[i + 1] *= 0.98;
                velocities[i + 2] *= 0.98;
            }
            
            burst.geometry.attributes.position.needsUpdate = true;
            
            // Fade out
            material.opacity *= 0.95;
            
            if (material.opacity > 0.01) {
                requestAnimationFrame(animateBurst);
            } else {
                this.scene.remove(burst);
                burst.geometry.dispose();
                burst.material.dispose();
            }
        };
        
        animateBurst();
    }
    
    /**
     * Particle vertex shader
     */
    getParticleVertexShader() {
        return `
            attribute float energy;
            attribute vec3 velocity;
            
            uniform float time;
            uniform float size;
            
            varying float vEnergy;
            varying vec3 vVelocity;
            
            void main() {
                vEnergy = energy;
                vVelocity = velocity;
                
                vec3 pos = position;
                
                // Pulse based on energy
                float pulse = 1.0 + 0.2 * sin(time * 3.0 + position.x * 0.1);
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                
                // Size based on energy and distance
                gl_PointSize = size * pulse * energy * (300.0 / -mvPosition.z);
            }
        `;
    }
    
    /**
     * Particle fragment shader
     */
    getParticleFragmentShader() {
        return `
            uniform vec3 color;
            uniform float time;
            
            varying float vEnergy;
            varying vec3 vVelocity;
            
            void main() {
                // Circular particle shape
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;
                
                // Glow effect
                float glow = 1.0 - dist * 2.0;
                glow = pow(glow, 2.0);
                
                // Color based on energy and velocity
                vec3 finalColor = color;
                float speed = length(vVelocity);
                finalColor += vec3(speed * 0.5, speed * 0.3, 0.0);
                
                // Pulse
                float pulse = 0.8 + 0.2 * sin(time * 5.0 + vEnergy * 10.0);
                
                gl_FragColor = vec4(finalColor, glow * vEnergy * pulse);
            }
        `;
    }
    
    /**
     * Simple fractal noise for texture generation
     */
    fractalNoise(x, y, octaves) {
        let noise = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            noise += amplitude * this.simpleNoise(x * frequency, y * frequency);
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }
        
        return noise / maxValue;
    }
    
    /**
     * Simple 2D noise function
     */
    simpleNoise(x, y) {
        const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return (n - Math.floor(n)) * 2 - 1;
    }
    
    /**
     * Set network visibility
     */
    setNetworkVisibility(network, visible) {
        if (this.particleSystems[network]) {
            this.particleSystems[network].visible = visible;
        }
    }
    
    /**
     * Update network energy levels (for visual feedback)
     */
    updateNetworkEnergy(network, energyLevel) {
        if (this.particleSystems[network]) {
            const material = this.particleSystems[network].material;
            
            // Modulate color brightness based on energy
            const baseColor = this.networkColors[network];
            const energizedColor = baseColor.clone().multiplyScalar(0.5 + 0.5 * energyLevel);
            material.uniforms.color.value = energizedColor;
        }
    }
    
    /**
     * Cleanup
     */
    dispose() {
        // Dispose particle systems
        Object.values(this.particleSystems).forEach(system => {
            this.scene.remove(system);
            system.geometry.dispose();
            system.material.dispose();
        });
        
        // Dispose energy flows
        this.energyFlows.forEach(flow => {
            this.scene.remove(flow);
            flow.geometry.dispose();
            flow.material.dispose();
        });
        
        // Dispose textures
        if (this.energyFieldTexture) {
            this.energyFieldTexture.dispose();
        }
    }
}
