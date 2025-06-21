// src/consciousness/SimpleConsciousness.js
// Enhanced with mitochondrial-inspired energy dynamics

export class SimpleConsciousness {
    constructor() {
        this.nodes = new Map();
        this.lastUpdate = performance.now();
        this.enabled = true;
        
        // Mitochondrial-inspired energy system
        this.energy = {
            total: 1000,                    // Total system ATP
            baseProduction: 50,             // ATP/second base production
            productionEfficiency: 0.7,      // How well we convert resources to ATP
            temperature: 37.0,              // System temperature (activity level)
            metabolicRate: 1.0              // Overall metabolic multiplier
        };
        
        // Three consciousness networks (like brain's mitochondrial networks)
        this.networks = {
            executive: {
                color: '#ff00ff',
                energyShare: 0.5,
                nodes: new Set(),
                totalEnergy: 0
            },
            memory: {
                color: '#00ffff',
                energyShare: 0.3,
                nodes: new Set(),
                totalEnergy: 0
            },
            sensory: {
                color: '#ffff00',
                energyShare: 0.2,
                nodes: new Set(),
                totalEnergy: 0
            }
        };
        
        // Mitochondrial dynamics
        this.fusion = {
            enabled: true,
            threshold: 0.8,      // When nodes should share energy
            rate: 0.1            // How fast energy transfers
        };
        
        this.fission = {
            enabled: true,
            threshold: 0.2,      // When nodes are energy-starved
            penalty: 0.5         // Consciousness reduction when starved
        };
    }
    
    // Enhanced node registration with metabolic profile
    registerNode(nodeId, nodeData) {
        const nodeType = nodeData.metadata?.type || 'default';
        const mitochondrialDensity = this.getMitochondrialDensity(nodeType);
        
        const node = {
            id: nodeId,
            data: nodeData,
            consciousness: 0.0,
            visited: 0,
            connections: new Map(),
            lastVisit: 0,
            glow: 0.0,
            
            // Mitochondrial-inspired properties
            metabolic: {
                mitochondrialDensity,           // 0-1, how many mitochondria
                atpCapacity: mitochondrialDensity * 100,  // Max ATP storage
                atpAvailable: mitochondrialDensity * 80,  // Current ATP (start at 80%)
                atpProduction: mitochondrialDensity * 5,  // ATP/second
                atpConsumption: 1.0,            // Base consumption rate
                efficiency: 0.7 + (mitochondrialDensity * 0.3), // 70-100%
                temperature: 37.0,              // Local temperature
                health: 1.0                     // Mitochondrial health
            },
            
            // Network assignment
            network: this.assignNetwork(nodeData, nodeType)
        };
        
        this.nodes.set(nodeId, node);
        this.networks[node.network].nodes.add(nodeId);
    }
    
    // Get mitochondrial density based on node type
    getMitochondrialDensity(nodeType) {
        const densities = {
            'executive': 0.9,      // Highest density
            'integration': 0.85,
            'memory': 0.7,
            'processing': 0.6,
            'routing': 0.5,
            'sensory': 0.4,
            'default': 0.5
        };
        return densities[nodeType] || densities.default;
    }
    
    // Assign node to consciousness network
    assignNetwork(nodeData, nodeType) {
        // Executive network: high-level decision nodes
        if (nodeData.depth <= 2 || nodeType === 'executive' || nodeType === 'integration') {
            return 'executive';
        }
        // Memory network: storage and recall
        else if (nodeType === 'memory' || (nodeData.depth >= 3 && nodeData.depth <= 5)) {
            return 'memory';
        }
        // Sensory network: input and leaf nodes
        else {
            return 'sensory';
        }
    }
    
    // Enhanced activation with energy dynamics
    activateNode(nodeId, previousNodeId = null) {
        if (!this.enabled) return;
        
        const node = this.nodes.get(nodeId);
        if (!node) return;
        
        const now = performance.now();
        
        // Check if node has enough energy to activate
        const activationCost = 10; // ATP cost to activate
        if (node.metabolic.atpAvailable < activationCost) {
            // Try to borrow energy from network
            this.borrowEnergy(node, activationCost);
        }
        
        if (node.metabolic.atpAvailable >= activationCost) {
            // Consume ATP for activation
            node.metabolic.atpAvailable -= activationCost;
            
            // Increase consciousness based on available energy
            const energyRatio = node.metabolic.atpAvailable / node.metabolic.atpCapacity;
            const consciousnessBoost = 0.3 * energyRatio * node.metabolic.efficiency;
            node.consciousness = Math.min(node.consciousness + consciousnessBoost, 1.0);
            
            // Increase local temperature (activity)
            node.metabolic.temperature = Math.min(node.metabolic.temperature + 0.5, 40.0);
            
            node.visited++;
            node.lastVisit = now;
        } else {
            // Energy-starved activation (reduced effect)
            node.consciousness = Math.min(node.consciousness + 0.1, 0.5);
            node.metabolic.health *= 0.95; // Damage from energy starvation
        }
        
        // Strengthen connections with energy exchange
        if (previousNodeId) {
            this.strengthenConnection(node, previousNodeId);
        }
        
        // Propagate with energy awareness
        this.propagateWithEnergy(nodeId);
    }
    
    // Borrow energy from network pool
    borrowEnergy(node, amount) {
        const network = this.networks[node.network];
        if (network.totalEnergy >= amount) {
            network.totalEnergy -= amount;
            node.metabolic.atpAvailable += amount;
            return true;
        }
        return false;
    }
    
    // Strengthen connection with mitochondrial fusion possibility
    strengthenConnection(node, otherNodeId) {
        const otherNode = this.nodes.get(otherNodeId);
        if (!otherNode) return;
        
        // Update connection strength
        const strength = node.connections.get(otherNodeId) || 0;
        node.connections.set(otherNodeId, Math.min(strength + 0.1, 1.0));
        
        // Reciprocal connection
        const reverseStrength = otherNode.connections.get(node.id) || 0;
        otherNode.connections.set(node.id, Math.min(reverseStrength + 0.05, 1.0));
        
        // Check for mitochondrial fusion opportunity
        if (this.fusion.enabled && strength > this.fusion.threshold) {
            this.attemptMitochondrialFusion(node, otherNode);
        }
    }
    
    // Mitochondrial fusion - energy sharing between strongly connected nodes
    attemptMitochondrialFusion(node1, node2) {
        const ratio1 = node1.metabolic.atpAvailable / node1.metabolic.atpCapacity;
        const ratio2 = node2.metabolic.atpAvailable / node2.metabolic.atpCapacity;
        
        // Transfer energy from higher to lower
        if (Math.abs(ratio1 - ratio2) > 0.2) {
            const donor = ratio1 > ratio2 ? node1 : node2;
            const receiver = ratio1 > ratio2 ? node2 : node1;
            
            const transferAmount = (donor.metabolic.atpAvailable - receiver.metabolic.atpAvailable) * 
                                 this.fusion.rate;
            
            donor.metabolic.atpAvailable -= transferAmount;
            receiver.metabolic.atpAvailable += transferAmount;
            
            // Fusion improves efficiency
            donor.metabolic.efficiency = Math.min(donor.metabolic.efficiency * 1.01, 1.0);
            receiver.metabolic.efficiency = Math.min(receiver.metabolic.efficiency * 1.01, 1.0);
        }
    }
    
    // Energy-aware propagation
    propagateWithEnergy(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node || !node.data) return;
        
        // Energy cost for propagation
        const propagationCost = 2; // ATP per connection
        
        // Propagate to children if we have energy
        if (node.data.childIds && node.metabolic.atpAvailable > propagationCost * node.data.childIds.length) {
            node.data.childIds.forEach(childId => {
                const child = this.nodes.get(childId);
                if (child) {
                    // Transfer some consciousness with energy cost
                    const transfer = 0.1 * node.metabolic.efficiency;
                    child.consciousness = Math.min(child.consciousness + transfer, 1.0);
                    node.metabolic.atpAvailable -= propagationCost;
                    
                    // Small energy gift to child
                    child.metabolic.atpAvailable = Math.min(
                        child.metabolic.atpAvailable + 1,
                        child.metabolic.atpCapacity
                    );
                }
            });
        }
        
        // Propagate to parent (lower cost)
        if (node.data.parentId && node.metabolic.atpAvailable > propagationCost) {
            const parent = this.nodes.get(node.data.parentId);
            if (parent) {
                parent.consciousness = Math.min(parent.consciousness + 0.05, 1.0);
                node.metabolic.atpAvailable -= propagationCost;
            }
        }
    }
    
    // Main update loop with metabolic processes
    update() {
        if (!this.enabled) return;
        
        const now = performance.now();
        const deltaTime = (now - this.lastUpdate) / 1000;
        this.lastUpdate = now;
        
        // Update system-wide energy production
        this.updateSystemEnergy(deltaTime);
        
        // Update all nodes
        this.nodes.forEach(node => {
            // Metabolic processes
            this.updateNodeMetabolism(node, deltaTime);
            
            // Consciousness decay (energy-dependent)
            const healthFactor = node.metabolic.health;
            const energyFactor = node.metabolic.atpAvailable / node.metabolic.atpCapacity;
            const decayRate = 0.95 * healthFactor * (0.5 + 0.5 * energyFactor);
            node.consciousness *= Math.pow(decayRate, deltaTime);
            
            // Update visual glow
            const targetGlow = node.consciousness * energyFactor;
            node.glow += (targetGlow - node.glow) * deltaTime * 3.0;
            
            // Temperature regulation
            node.metabolic.temperature += (37.0 - node.metabolic.temperature) * deltaTime * 0.5;
            
            // Connection decay
            this.updateConnections(node, deltaTime);
            
            // Check for mitochondrial fission (emergency energy state)
            if (this.fission.enabled && energyFactor < this.fission.threshold) {
                this.handleMitochondrialFission(node);
            }
        });
        
        // Distribute network energy pools
        this.distributeNetworkEnergy();
    }
    
    // Update system-wide energy production
    updateSystemEnergy(deltaTime) {
        // Base ATP production
        const produced = this.energy.baseProduction * 
                        this.energy.productionEfficiency * 
                        this.energy.metabolicRate * 
                        deltaTime;
        
        this.energy.total = Math.min(this.energy.total + produced, 2000);
        
        // Distribute to network pools
        Object.entries(this.networks).forEach(([name, network]) => {
            const allocation = produced * network.energyShare;
            network.totalEnergy = Math.min(network.totalEnergy + allocation, 500);
        });
    }
    
    // Update individual node metabolism
    updateNodeMetabolism(node, deltaTime) {
        const metabolic = node.metabolic;
        
        // ATP production (temperature-dependent)
        const tempFactor = metabolic.temperature / 37.0;
        const produced = metabolic.atpProduction * 
                        metabolic.efficiency * 
                        metabolic.health * 
                        tempFactor * 
                        deltaTime;
        
        // ATP consumption (activity-dependent)
        const activityFactor = node.consciousness + 0.1;
        const consumed = metabolic.atpConsumption * 
                        activityFactor * 
                        tempFactor * 
                        deltaTime;
        
        // Update ATP levels
        metabolic.atpAvailable += produced - consumed;
        metabolic.atpAvailable = Math.max(0, Math.min(metabolic.atpCapacity, metabolic.atpAvailable));
        
        // Health degrades if energy-starved
        if (metabolic.atpAvailable / metabolic.atpCapacity < 0.2) {
            metabolic.health *= Math.pow(0.99, deltaTime);
        } else if (metabolic.atpAvailable / metabolic.atpCapacity > 0.8) {
            // Health slowly recovers with good energy
            metabolic.health = Math.min(metabolic.health * Math.pow(1.01, deltaTime), 1.0);
        }
    }
    
    // Update connections with energy considerations
    updateConnections(node, deltaTime) {
        node.connections.forEach((strength, otherId) => {
            // Maintaining connections costs energy
            const maintenanceCost = 0.1 * strength * deltaTime;
            
            if (node.metabolic.atpAvailable > maintenanceCost) {
                // Pay maintenance cost
                node.metabolic.atpAvailable -= maintenanceCost;
                
                // Normal decay
                const decayed = strength * Math.pow(0.99, deltaTime);
                if (decayed < 0.01) {
                    node.connections.delete(otherId);
                } else {
                    node.connections.set(otherId, decayed);
                }
            } else {
                // Can't maintain - faster decay
                const decayed = strength * Math.pow(0.95, deltaTime);
                if (decayed < 0.01) {
                    node.connections.delete(otherId);
                } else {
                    node.connections.set(otherId, decayed);
                }
            }
        });
    }
    
    // Handle emergency energy state
    handleMitochondrialFission(node) {
        // Reduce consciousness dramatically
        node.consciousness *= this.fission.penalty;
        
        // Try to get emergency energy from network
        const emergencyAmount = 20;
        if (this.borrowEnergy(node, emergencyAmount)) {
            node.metabolic.health *= 0.98; // Small health penalty
        } else {
            // Severe health penalty if no energy available
            node.metabolic.health *= 0.90;
        }
    }
    
    // Distribute excess energy from network pools
    distributeNetworkEnergy() {
        Object.entries(this.networks).forEach(([name, network]) => {
            if (network.nodes.size === 0) return;
            
            // Find nodes that need energy
            const needyNodes = [];
            network.nodes.forEach(nodeId => {
                const node = this.nodes.get(nodeId);
                if (node) {
                    const ratio = node.metabolic.atpAvailable / node.metabolic.atpCapacity;
                    if (ratio < 0.5) {
                        needyNodes.push({ node, ratio });
                    }
                }
            });
            
            // Distribute excess energy to needy nodes
            if (needyNodes.length > 0 && network.totalEnergy > 100) {
                const sharePerNode = Math.min(10, network.totalEnergy / needyNodes.length);
                needyNodes.forEach(({ node }) => {
                    const amount = Math.min(sharePerNode, node.metabolic.atpCapacity - node.metabolic.atpAvailable);
                    node.metabolic.atpAvailable += amount;
                    network.totalEnergy -= amount;
                });
            }
        });
    }
    
    // Get node info for visualization (enhanced)
    getNodeInfo(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return null;
        
        return {
            ...node,
            energyRatio: node.metabolic.atpAvailable / node.metabolic.atpCapacity,
            networkColor: this.networks[node.network].color,
            isEnergyStarved: node.metabolic.atpAvailable / node.metabolic.atpCapacity < 0.3,
            isEnergyRich: node.metabolic.atpAvailable / node.metabolic.atpCapacity > 0.8
        };
    }
    
    // Get enhanced statistics
    getStats() {
        let totalConsciousness = 0;
        let activeNodes = 0;
        let totalConnections = 0;
        let totalATP = 0;
        let healthyNodes = 0;
        
        // Network-specific stats
        const networkStats = {
            executive: { nodes: 0, consciousness: 0, energy: 0 },
            memory: { nodes: 0, consciousness: 0, energy: 0 },
            sensory: { nodes: 0, consciousness: 0, energy: 0 }
        };
        
        this.nodes.forEach(node => {
            totalConsciousness += node.consciousness;
            if (node.consciousness > 0.1) activeNodes++;
            totalConnections += node.connections.size;
            totalATP += node.metabolic.atpAvailable;
            if (node.metabolic.health > 0.8) healthyNodes++;
            
            // Network stats
            const network = networkStats[node.network];
            if (network) {
                network.nodes++;
                network.consciousness += node.consciousness;
                network.energy += node.metabolic.atpAvailable;
            }
        });
        
        return {
            totalNodes: this.nodes.size,
            activeNodes,
            averageConsciousness: this.nodes.size > 0 ? totalConsciousness / this.nodes.size : 0,
            totalConnections,
            
            // Energy stats
            systemEnergy: this.energy.total,
            totalNodeATP: totalATP,
            averageATP: this.nodes.size > 0 ? totalATP / this.nodes.size : 0,
            healthyNodes,
            healthPercentage: this.nodes.size > 0 ? (healthyNodes / this.nodes.size) * 100 : 0,
            
            // Network breakdown
            networks: networkStats,
            
            // System health
            metabolicRate: this.energy.metabolicRate,
            temperature: this.energy.temperature
        };
    }
    
    // Set system metabolic rate (for global activity control)
    setMetabolicRate(rate) {
        this.energy.metabolicRate = Math.max(0.1, Math.min(2.0, rate));
    }
    
    // Emergency energy boost (like adrenaline)
    energyBoost() {
        this.energy.total += 200;
        this.energy.temperature = 38.5; // Increase activity
        this.energy.metabolicRate = 1.5; // Boost metabolism
        
        // Boost all networks
        Object.values(this.networks).forEach(network => {
            network.totalEnergy += 50;
        });
    }
}