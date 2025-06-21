// src/intelligence/CACEEngine.js

/**
 * CACE - Context And Complexity Engine
 * Pronounced "cake" 🎂
 * 
 * Enhanced with mitochondrial-inspired energy principles.
 * Calculates context scores for nodes based on their relationships,
 * complexity, importance, and metabolic energy patterns.
 */
export class CACEEngine {
    constructor() {
        // Context calculation parameters
        this.config = {
            // Weights for different factors (now energy-aware)
            weights: {
                descendants: 0.25,      // Network complexity
                depth: 0.15,           // Depth in hierarchy
                connections: 0.15,     // Number of connections
                siblingRank: 0.10,     // Position among siblings
                recentAccess: 0.10,    // How recently accessed
                energy: 0.25           // NEW: Metabolic energy factor
            },
            
            // Complexity thresholds
            complexity: {
                simple: 5,         // < 5 descendants
                moderate: 20,      // 5-20 descendants
                complex: 50,       // 20-50 descendants
                hypercomplex: 100  // > 50 descendants
            },
            
            // Context decay over time
            temporal: {
                recentWindow: 5000,    // 5 seconds
                decayRate: 0.95        // Per second
            },
            
            // NEW: Energy configuration (mitochondrial-inspired)
            energy: {
                // Node type energy profiles (mitochondrial density)
                profiles: {
                    'executive': 0.9,      // Highest energy needs
                    'integration': 0.85,   // Integration hubs
                    'memory': 0.7,         // Memory storage
                    'processing': 0.6,     // Active processing
                    'routing': 0.5,        // Connection nodes
                    'sensory': 0.4,        // Input nodes
                    'default': 0.5         // Unknown types
                },
                
                // Three consciousness networks (like brain's mitochondrial networks)
                networks: {
                    executive: {
                        color: '#ff00ff',
                        energyShare: 0.5,
                        nodes: new Set()
                    },
                    memory: {
                        color: '#00ffff', 
                        energyShare: 0.3,
                        nodes: new Set()
                    },
                    sensory: {
                        color: '#ffff00',
                        energyShare: 0.2,
                        nodes: new Set()
                    }
                },
                
                // Metabolic parameters
                metabolic: {
                    atpProductionRate: 0.7,    // Energy generation efficiency
                    atpConsumptionBase: 0.1,   // Base energy use
                    fusionThreshold: 0.8,      // When nodes should merge energy
                    fissionThreshold: 0.2       // When nodes should split
                }
            }
        };
        
        // Node analysis cache
        this.analysisCache = new Map();
        this.cacheTimeout = 5000; // 5 seconds
        
        // Access history for temporal context
        this.accessHistory = new Map();
        this.maxHistorySize = 1000;
        
        // NEW: Energy state tracking
        this.energyState = {
            totalAvailable: 1000,      // Total system energy
            distributed: 0,            // Energy assigned to nodes
            efficiency: 1.0            // System efficiency
        };
        
        // Global graph statistics
        this.graphStats = {
            totalNodes: 0,
            maxDepth: 0,
            averageConnections: 0,
            complexityDistribution: {
                simple: 0,
                moderate: 0,
                complex: 0,
                hypercomplex: 0
            },
            // NEW: Energy statistics
            energyDistribution: {
                executive: 0,
                memory: 0,
                sensory: 0
            }
        };
    }
    
    /**
     * Analyze the entire graph structure (enhanced with energy analysis)
     */
    analyzeGraph(nodeGraph) {
        console.log('🎂 CACE: Analyzing graph structure with energy profiles...');
        
        // Reset stats
        this.graphStats.totalNodes = nodeGraph.nodes.size;
        this.graphStats.maxDepth = 0;
        this.graphStats.complexityDistribution = {
            simple: 0,
            moderate: 0,
            complex: 0,
            hypercomplex: 0
        };
        
        let totalConnections = 0;
        
        // Clear network assignments
        Object.values(this.config.energy.networks).forEach(network => {
            network.nodes.clear();
        });
        
        // Analyze each node
        nodeGraph.nodes.forEach(node => {
            // Update max depth
            this.graphStats.maxDepth = Math.max(this.graphStats.maxDepth, node.depth);
            
            // Count connections
            const connectionCount = node.childIds.length + (node.parentId ? 1 : 0);
            totalConnections += connectionCount;
            
            // Analyze complexity
            const descendants = this._countDescendants(nodeGraph, node.id);
            this._categorizeComplexity(descendants);
            
            // NEW: Assign to consciousness network based on characteristics
            this._assignToNetwork(node, descendants, connectionCount);
            
            // NEW: Calculate metabolic profile
            const metabolicProfile = this._calculateMetabolicProfile(node, descendants);
            
            // Cache analysis
            this._cacheNodeAnalysis(node.id, {
                descendants,
                connectionCount,
                metabolicProfile,
                timestamp: Date.now()
            });
        });
        
        this.graphStats.averageConnections = totalConnections / this.graphStats.totalNodes;
        
        // NEW: Calculate energy distribution
        this._calculateEnergyDistribution();
        
        console.log('✅ CACE: Graph analysis complete', this.graphStats);
    }
    
    /**
     * Calculate context scores for visible nodes (now with energy awareness)
     */
    calculateContext(visibleNodes, focusNodeId) {
        const contextScores = new Map();
        const focusNode = visibleNodes.find(n => n.id === focusNodeId);
        
        if (!focusNode) return contextScores;
        
        // Record access
        this._recordAccess(focusNodeId);
        
        // NEW: Update energy state based on focus
        this._updateEnergyForFocus(focusNodeId);
        
        // Calculate scores for each visible node
        visibleNodes.forEach(node => {
            const score = this._calculateNodeContext(node, focusNode, visibleNodes);
            contextScores.set(node.id, score);
        });
        
        // Normalize scores to 0-1 range
        this._normalizeScores(contextScores);
        
        // NEW: Apply energy modulation
        this._applyEnergyModulation(contextScores, visibleNodes);
        
        return contextScores;
    }
    
    /**
     * Calculate context score for a single node (enhanced with energy)
     */
    _calculateNodeContext(node, focusNode, visibleNodes) {
        const weights = this.config.weights;
        let score = 0;
        
        // 1. Descendant complexity
        const analysis = this._getNodeAnalysis(node.id);
        const descendantScore = Math.min(1, analysis.descendants / 50);
        score += descendantScore * weights.descendants;
        
        // 2. Depth difference from focus
        const depthDiff = Math.abs(node.depth - focusNode.depth);
        const depthScore = 1 - Math.min(1, depthDiff / 5);
        score += depthScore * weights.depth;
        
        // 3. Connection richness
        const connectionScore = Math.min(1, analysis.connectionCount / 10);
        score += connectionScore * weights.connections;
        
        // 4. Sibling rank (position among siblings)
        const siblingScore = this._calculateSiblingScore(node, visibleNodes);
        score += siblingScore * weights.siblingRank;
        
        // 5. Recent access score
        const accessScore = this._calculateAccessScore(node.id);
        score += accessScore * weights.recentAccess;
        
        // 6. NEW: Energy score based on metabolic profile
        const energyScore = this._calculateEnergyScore(node, analysis);
        score += energyScore * weights.energy;
        
        return score;
    }
    
    /**
     * NEW: Calculate energy score based on metabolic profile
     */
    _calculateEnergyScore(node, analysis) {
        if (!analysis.metabolicProfile) return 0.5;
        
        const profile = analysis.metabolicProfile;
        
        // Energy score based on:
        // - Available ATP (energy reserves)
        // - Production efficiency
        // - Network assignment priority
        
        let energyScore = profile.atpAvailable / profile.atpCapacity;
        energyScore *= profile.efficiency;
        
        // Boost for nodes in high-priority networks
        const network = this._getNodeNetwork(node.id);
        if (network === 'executive') {
            energyScore *= 1.2;
        } else if (network === 'memory') {
            energyScore *= 1.1;
        }
        
        return Math.min(1, energyScore);
    }
    
    /**
     * NEW: Calculate metabolic profile for a node
     */
    _calculateMetabolicProfile(node, descendants) {
        const nodeType = node.metadata?.type || 'default';
        const mitochodrialDensity = this.config.energy.profiles[nodeType] || 
                                   this.config.energy.profiles.default;
        
        // Base metabolic rate depends on complexity
        const complexityFactor = Math.min(1, descendants / 100);
        const baseConsumption = this.config.energy.metabolic.atpConsumptionBase;
        
        return {
            mitochodrialDensity,
            atpCapacity: mitochodrialDensity * 100,
            atpAvailable: mitochodrialDensity * 100 * 0.8, // Start at 80% capacity
            atpProduction: mitochodrialDensity * this.config.energy.metabolic.atpProductionRate,
            atpConsumption: baseConsumption * (1 + complexityFactor),
            efficiency: 0.7 + (mitochodrialDensity * 0.3), // 70-100% efficiency
            temperature: 37.0 // Baseline temperature (activity level)
        };
    }
    
    /**
     * NEW: Assign node to consciousness network
     */
    _assignToNetwork(node, descendants, connectionCount) {
        const depth = node.depth;
        const complexity = descendants;
        
        // Executive network: High-level nodes with many descendants
        if (depth <= 2 && complexity > 20) {
            this.config.energy.networks.executive.nodes.add(node.id);
        }
        // Memory network: Mid-level nodes with moderate complexity
        else if (depth >= 2 && depth <= 5 && complexity > 5) {
            this.config.energy.networks.memory.nodes.add(node.id);
        }
        // Sensory network: Leaf nodes and input processors
        else {
            this.config.energy.networks.sensory.nodes.add(node.id);
        }
    }
    
    /**
     * NEW: Calculate system-wide energy distribution
     */
    _calculateEnergyDistribution() {
        const networks = this.config.energy.networks;
        
        // Count nodes in each network
        const totals = {
            executive: networks.executive.nodes.size,
            memory: networks.memory.nodes.size,
            sensory: networks.sensory.nodes.size
        };
        
        const totalNodes = totals.executive + totals.memory + totals.sensory;
        
        if (totalNodes > 0) {
            this.graphStats.energyDistribution = {
                executive: totals.executive / totalNodes,
                memory: totals.memory / totalNodes,
                sensory: totals.sensory / totalNodes
            };
        }
        
        // Distribute available energy according to network shares
        this.energyState.distributed = 0;
        Object.entries(networks).forEach(([networkName, network]) => {
            const nodeCount = network.nodes.size;
            const energyAllocation = this.energyState.totalAvailable * network.energyShare;
            const energyPerNode = nodeCount > 0 ? energyAllocation / nodeCount : 0;
            
            // Store for later use
            network.energyPerNode = energyPerNode;
            this.energyState.distributed += nodeCount * energyPerNode;
        });
    }
    
    /**
     * NEW: Update energy state when focus changes
     */
    _updateEnergyForFocus(focusNodeId) {
        // Increase energy allocation to focused node's network
        const network = this._getNodeNetwork(focusNodeId);
        if (!network) return;
        
        // Temporarily boost energy to focused network
        const boost = 0.2; // 20% boost
        const networks = this.config.energy.networks;
        
        // Redistribute energy shares
        if (network === 'executive') {
            networks.executive.energyShare = 0.5 + boost;
            networks.memory.energyShare = 0.3 - boost/2;
            networks.sensory.energyShare = 0.2 - boost/2;
        } else if (network === 'memory') {
            networks.executive.energyShare = 0.5 - boost/2;
            networks.memory.energyShare = 0.3 + boost;
            networks.sensory.energyShare = 0.2 - boost/2;
        } else if (network === 'sensory') {
            networks.executive.energyShare = 0.5 - boost/2;
            networks.memory.energyShare = 0.3 - boost/2;
            networks.sensory.energyShare = 0.2 + boost;
        }
        
        // Recalculate distribution
        this._calculateEnergyDistribution();
    }
    
    /**
     * NEW: Apply energy modulation to context scores
     */
    _applyEnergyModulation(scores, visibleNodes) {
        visibleNodes.forEach(node => {
            const currentScore = scores.get(node.id) || 0;
            const analysis = this._getNodeAnalysis(node.id);
            
            if (analysis.metabolicProfile) {
                // Modulate score based on available energy
                const energyRatio = analysis.metabolicProfile.atpAvailable / 
                                   analysis.metabolicProfile.atpCapacity;
                
                // Low energy reduces context score
                const modulated = currentScore * (0.5 + 0.5 * energyRatio);
                scores.set(node.id, modulated);
            }
        });
    }
    
    /**
     * NEW: Get which network a node belongs to
     */
    _getNodeNetwork(nodeId) {
        const networks = this.config.energy.networks;
        
        if (networks.executive.nodes.has(nodeId)) return 'executive';
        if (networks.memory.nodes.has(nodeId)) return 'memory';
        if (networks.sensory.nodes.has(nodeId)) return 'sensory';
        
        return null;
    }
    
    /**
     * NEW: Update metabolic state over time
     */
    updateMetabolicState(deltaTime) {
        this.analysisCache.forEach((analysis, nodeId) => {
            if (!analysis.metabolicProfile) return;
            
            const profile = analysis.metabolicProfile;
            
            // ATP production
            const produced = profile.atpProduction * deltaTime;
            
            // ATP consumption (increases with temperature/activity)
            const consumed = profile.atpConsumption * deltaTime * 
                           (profile.temperature / 37.0);
            
            // Update available ATP
            profile.atpAvailable += produced - consumed;
            profile.atpAvailable = Math.max(0, 
                Math.min(profile.atpCapacity, profile.atpAvailable));
            
            // Check for fusion/fission conditions
            const atpRatio = profile.atpAvailable / profile.atpCapacity;
            
            if (atpRatio < this.config.energy.metabolic.fissionThreshold) {
                // Node is energy-starved, might need to fission
                profile.needsFission = true;
            } else if (atpRatio > this.config.energy.metabolic.fusionThreshold) {
                // Node has excess energy, could fuse
                profile.canFuse = true;
            }
            
            // Update efficiency based on energy state
            profile.efficiency = 0.5 + 0.5 * atpRatio;
        });
    }
    
    /**
     * Calculate sibling rank score
     */
    _calculateSiblingScore(node, visibleNodes) {
        if (!node.parentId) return 1; // Root node
        
        const siblings = visibleNodes.filter(n => 
            n.parentId === node.parentId && n.id !== node.id
        );
        
        if (siblings.length === 0) return 1;
        
        // Sort siblings by some criteria (e.g., ID, creation time)
        siblings.sort((a, b) => a.id.localeCompare(b.id));
        const rank = siblings.findIndex(s => s.id === node.id);
        
        // Earlier siblings get higher scores
        return 1 - (rank / siblings.length);
    }
    
    /**
     * Calculate temporal access score
     */
    _calculateAccessScore(nodeId) {
        const lastAccess = this.accessHistory.get(nodeId);
        if (!lastAccess) return 0;
        
        const timeSinceAccess = Date.now() - lastAccess;
        if (timeSinceAccess > this.config.temporal.recentWindow) return 0;
        
        // Exponential decay
        const decayFactor = Math.pow(
            this.config.temporal.decayRate,
            timeSinceAccess / 1000
        );
        
        return decayFactor;
    }
    
    /**
     * Count descendants recursively
     */
    _countDescendants(nodeGraph, nodeId, visited = new Set()) {
        if (visited.has(nodeId)) return 0;
        visited.add(nodeId);
        
        const node = nodeGraph.getNode(nodeId);
        if (!node) return 0;
        
        let count = node.childIds.length;
        
        node.childIds.forEach(childId => {
            count += this._countDescendants(nodeGraph, childId, visited);
        });
        
        return count;
    }
    
    /**
     * Categorize complexity level
     */
    _categorizeComplexity(descendantCount) {
        const levels = this.config.complexity;
        
        if (descendantCount < levels.simple) {
            this.graphStats.complexityDistribution.simple++;
        } else if (descendantCount < levels.moderate) {
            this.graphStats.complexityDistribution.moderate++;
        } else if (descendantCount < levels.complex) {
            this.graphStats.complexityDistribution.complex++;
        } else {
            this.graphStats.complexityDistribution.hypercomplex++;
        }
    }
    
    /**
     * Cache node analysis results
     */
    _cacheNodeAnalysis(nodeId, analysis) {
        this.analysisCache.set(nodeId, {
            ...analysis,
            timestamp: Date.now()
        });
        
        // Clean old cache entries
        if (this.analysisCache.size > this.maxHistorySize) {
            const oldestKey = this.analysisCache.keys().next().value;
            this.analysisCache.delete(oldestKey);
        }
    }
    
    /**
     * Get cached node analysis
     */
    _getNodeAnalysis(nodeId) {
        const cached = this.analysisCache.get(nodeId);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached;
        }
        
        // Return default if not cached
        return {
            descendants: 0,
            connectionCount: 1,
            metabolicProfile: null,
            timestamp: Date.now()
        };
    }
    
    /**
     * Record node access for temporal scoring
     */
    _recordAccess(nodeId) {
        this.accessHistory.set(nodeId, Date.now());
        
        // Trim history if too large
        if (this.accessHistory.size > this.maxHistorySize) {
            // Remove oldest entries
            const entries = Array.from(this.accessHistory.entries());
            entries.sort((a, b) => a[1] - b[1]);
            
            const toRemove = entries.slice(0, entries.length - this.maxHistorySize);
            toRemove.forEach(([key]) => this.accessHistory.delete(key));
        }
    }
    
    /**
     * Normalize scores to 0-1 range
     */
    _normalizeScores(scores) {
        if (scores.size === 0) return;
        
        // Find min and max
        let min = Infinity;
        let max = -Infinity;
        
        scores.forEach(score => {
            min = Math.min(min, score);
            max = Math.max(max, score);
        });
        
        // Avoid division by zero
        const range = max - min;
        if (range === 0) {
            scores.forEach((score, key) => scores.set(key, 0.5));
            return;
        }
        
        // Normalize
        scores.forEach((score, key) => {
            scores.set(key, (score - min) / range);
        });
    }
    
    /**
     * Get complexity level for a node
     */
    getComplexityLevel(nodeId) {
        const analysis = this._getNodeAnalysis(nodeId);
        const descendants = analysis.descendants;
        const levels = this.config.complexity;
        
        if (descendants < levels.simple) return 'simple';
        if (descendants < levels.moderate) return 'moderate';
        if (descendants < levels.complex) return 'complex';
        return 'hypercomplex';
    }
    
    /**
     * Get CACE recommendations for navigation (enhanced with energy awareness)
     */
    getNavigationHints(currentNodeId, visibleNodes) {
        const hints = {
            recommended: [],
            avoid: [],
            explore: [],
            energyNeeded: []  // NEW: Nodes that need energy boost
        };
        
        visibleNodes.forEach(node => {
            const analysis = this._getNodeAnalysis(node.id);
            const accessScore = this._calculateAccessScore(node.id);
            
            // NEW: Check energy state
            if (analysis.metabolicProfile) {
                const energyRatio = analysis.metabolicProfile.atpAvailable / 
                                   analysis.metabolicProfile.atpCapacity;
                
                if (energyRatio < 0.3) {
                    hints.energyNeeded.push({
                        nodeId: node.id,
                        reason: 'low_energy',
                        energyRatio
                    });
                }
            }
            
            // Recommend unexplored complex nodes with good energy
            if (analysis.descendants > 20 && accessScore < 0.1 && 
                analysis.metabolicProfile?.efficiency > 0.7) {
                hints.explore.push({
                    nodeId: node.id,
                    reason: 'unexplored_complex_energized',
                    score: analysis.descendants * analysis.metabolicProfile.efficiency
                });
            }
            
            // Recommend recently accessed nodes
            if (accessScore > 0.7) {
                hints.recommended.push({
                    nodeId: node.id,
                    reason: 'recent_access',
                    score: accessScore
                });
            }
            
            // Avoid simple leaves unless necessary
            if (analysis.descendants === 0 && node.depth > 3) {
                hints.avoid.push({
                    nodeId: node.id,
                    reason: 'deep_leaf',
                    score: node.depth
                });
            }
        });
        
        // Sort by score
        hints.recommended.sort((a, b) => b.score - a.score);
        hints.explore.sort((a, b) => b.score - a.score);
        hints.energyNeeded.sort((a, b) => a.energyRatio - b.energyRatio);
        
        return hints;
    }
    
    /**
     * Update configuration
     */
    updateConfig(updates) {
        Object.assign(this.config, updates);
    }
    
    /**
     * Clear all caches
     */
    clearCache() {
        this.analysisCache.clear();
        this.accessHistory.clear();
    }
    
    /**
     * Get CACE statistics (enhanced with energy data)
     */
    getStats() {
        return {
            graphStats: { ...this.graphStats },
            cacheSize: this.analysisCache.size,
            historySize: this.accessHistory.size,
            config: { ...this.config },
            energyState: { ...this.energyState },
            networkSizes: {
                executive: this.config.energy.networks.executive.nodes.size,
                memory: this.config.energy.networks.memory.nodes.size,
                sensory: this.config.energy.networks.sensory.nodes.size
            }
        };
    }
}