// src/intelligence/CACEEngine.js

/**
 * CACE - Context And Complexity Engine
 * Pronounced "cake" 🎂
 * 
 * Calculates context scores for nodes based on their relationships,
 * complexity, and importance within the fractal structure.
 */
export class CACEEngine {
    constructor() {
        // Context calculation parameters
        this.config = {
            // Weights for different factors
            weights: {
                descendants: 0.3,      // Number of descendants
                depth: 0.2,           // Depth in hierarchy
                connections: 0.2,     // Number of connections
                siblingRank: 0.15,    // Position among siblings
                recentAccess: 0.15    // How recently accessed
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
            }
        };
        
        // Node analysis cache
        this.analysisCache = new Map();
        this.cacheTimeout = 5000; // 5 seconds
        
        // Access history for temporal context
        this.accessHistory = new Map();
        this.maxHistorySize = 1000;
        
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
            }
        };
    }
    
    /**
     * Analyze the entire graph structure
     */
    analyzeGraph(nodeGraph) {
        console.log('🎂 CACE: Analyzing graph structure...');
        
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
            
            // Cache analysis
            this._cacheNodeAnalysis(node.id, {
                descendants,
                connectionCount,
                timestamp: Date.now()
            });
        });
        
        this.graphStats.averageConnections = totalConnections / this.graphStats.totalNodes;
        
        console.log('✅ CACE: Graph analysis complete', this.graphStats);
    }
    
    /**
     * Calculate context scores for visible nodes
     */
    calculateContext(visibleNodes, focusNodeId) {
        const contextScores = new Map();
        const focusNode = visibleNodes.find(n => n.id === focusNodeId);
        
        if (!focusNode) return contextScores;
        
        // Record access
        this._recordAccess(focusNodeId);
        
        // Calculate scores for each visible node
        visibleNodes.forEach(node => {
            const score = this._calculateNodeContext(node, focusNode, visibleNodes);
            contextScores.set(node.id, score);
        });
        
        // Normalize scores to 0-1 range
        this._normalizeScores(contextScores);
        
        return contextScores;
    }
    
    /**
     * Calculate context score for a single node
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
        
        return score;
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
     * Get CACE recommendations for navigation
     */
    getNavigationHints(currentNodeId, visibleNodes) {
        const hints = {
            recommended: [],
            avoid: [],
            explore: []
        };
        
        visibleNodes.forEach(node => {
            const analysis = this._getNodeAnalysis(node.id);
            const accessScore = this._calculateAccessScore(node.id);
            
            // Recommend unexplored complex nodes
            if (analysis.descendants > 20 && accessScore < 0.1) {
                hints.explore.push({
                    nodeId: node.id,
                    reason: 'unexplored_complex',
                    score: analysis.descendants
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
     * Get CACE statistics
     */
    getStats() {
        return {
            graphStats: { ...this.graphStats },
            cacheSize: this.analysisCache.size,
            historySize: this.accessHistory.size,
            config: { ...this.config }
        };
    }
}