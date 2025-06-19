// src/intelligence/FamilyViewController.js

/**
 * FamilyViewController - Manages the Family View navigation metaphor
 * 
 * Determines which nodes are visible based on the focus node and
 * their family relationships (parent, siblings, children).
 */
export class FamilyViewController {
    constructor() {
        this.nodeGraph = null;
        
        // Default view configuration
        this.defaultConfig = {
            maxSiblings: 5,
            maxChildren: 7,
            showParent: true,
            showGrandparent: false,
            contextDepth: 2,
            priorityBoost: {
                focus: 3.0,
                parent: 2.0,
                children: 1.5,
                siblings: 1.0,
                grandparent: 0.8
            }
        };
        
        // Visibility strategy
        this.visibilityStrategy = 'family'; // 'family', 'radial', 'hierarchical'
        
        // Node selection cache
        this.selectionCache = new Map();
        this.cacheTimeout = 1000; // 1 second
    }
    
    /**
     * Set the node graph reference
     */
    setNodeGraph(nodeGraph) {
        this.nodeGraph = nodeGraph;
        this.clearCache();
    }
    
    /**
     * Get visible nodes based on focus node
     */
    getVisibleNodes(focusNodeId, config = {}) {
        if (!this.nodeGraph || !focusNodeId) return [];
        
        // Check cache
        const cacheKey = `${focusNodeId}-${JSON.stringify(config)}`;
        const cached = this.selectionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.nodes;
        }
        
        // Merge with default config
        const viewConfig = { ...this.defaultConfig, ...config };
        
        // Get visible nodes based on strategy
        let visibleNodes;
        switch (this.visibilityStrategy) {
            case 'radial':
                visibleNodes = this._getRadialVisibleNodes(focusNodeId, viewConfig);
                break;
            case 'hierarchical':
                visibleNodes = this._getHierarchicalVisibleNodes(focusNodeId, viewConfig);
                break;
            case 'family':
            default:
                visibleNodes = this._getFamilyVisibleNodes(focusNodeId, viewConfig);
                break;
        }
        
        // Cache result
        this.selectionCache.set(cacheKey, {
            nodes: visibleNodes,
            timestamp: Date.now()
        });
        
        // Clean old cache entries
        this._cleanCache();
        
        return visibleNodes;
    }
    
    /**
     * Get visible nodes using family view strategy
     */
    _getFamilyVisibleNodes(focusNodeId, config) {
        const visibleNodes = [];
        const visibleSet = new Set();
        
        // 1. Focus node (always visible)
        const focusNode = this.nodeGraph.getNode(focusNodeId);
        if (!focusNode) return [];
        
        visibleNodes.push(focusNode);
        visibleSet.add(focusNodeId);
        
        // 2. Parent node
        if (config.showParent && focusNode.parentId) {
            const parent = this.nodeGraph.getNode(focusNode.parentId);
            if (parent && !visibleSet.has(parent.id)) {
                visibleNodes.push(parent);
                visibleSet.add(parent.id);
                
                // 3. Grandparent (optional)
                if (config.showGrandparent && parent.parentId) {
                    const grandparent = this.nodeGraph.getNode(parent.parentId);
                    if (grandparent && !visibleSet.has(grandparent.id)) {
                        visibleNodes.push(grandparent);
                        visibleSet.add(grandparent.id);
                    }
                }
            }
        }
        
        // 4. Siblings
        const siblings = this._getSiblings(focusNode, config.maxSiblings);
        siblings.forEach(sibling => {
            if (!visibleSet.has(sibling.id)) {
                visibleNodes.push(sibling);
                visibleSet.add(sibling.id);
            }
        });
        
        // 5. Children
        const children = this._getChildren(focusNode, config.maxChildren);
        children.forEach(child => {
            if (!visibleSet.has(child.id)) {
                visibleNodes.push(child);
                visibleSet.add(child.id);
            }
        });
        
        // 6. Context nodes (optional - nodes within contextDepth)
        if (config.contextDepth > 0) {
            const contextNodes = this._getContextNodes(focusNode, config.contextDepth, visibleSet);
            contextNodes.forEach(node => {
                if (!visibleSet.has(node.id)) {
                    visibleNodes.push(node);
                    visibleSet.add(node.id);
                }
            });
        }
        
        return visibleNodes;
    }
    
    /**
     * Get visible nodes using radial strategy
     */
    _getRadialVisibleNodes(focusNodeId, config) {
        // TODO: Implement radial visibility strategy
        // For now, fallback to family view
        return this._getFamilyVisibleNodes(focusNodeId, config);
    }
    
    /**
     * Get visible nodes using hierarchical strategy
     */
    _getHierarchicalVisibleNodes(focusNodeId, config) {
        // TODO: Implement hierarchical visibility strategy
        // For now, fallback to family view
        return this._getFamilyVisibleNodes(focusNodeId, config);
    }
    
    /**
     * Get siblings of a node
     */
    _getSiblings(node, maxCount) {
        if (!node.parentId) return [];
        
        const siblings = this.nodeGraph.getSiblings(node.id);
        
        // Sort siblings by some criteria (e.g., ID, metadata)
        siblings.sort((a, b) => {
            // Prefer siblings with more children
            const aChildren = a.childIds.length;
            const bChildren = b.childIds.length;
            if (aChildren !== bChildren) return bChildren - aChildren;
            
            // Otherwise sort by ID
            return a.id.localeCompare(b.id);
        });
        
        return siblings.slice(0, maxCount);
    }
    
    /**
     * Get children of a node
     */
    _getChildren(node, maxCount) {
        const children = this.nodeGraph.getChildren(node.id);
        
        // Sort children by importance
        children.sort((a, b) => {
            // Prefer children with more descendants
            const aChildren = a.childIds.length;
            const bChildren = b.childIds.length;
            if (aChildren !== bChildren) return bChildren - aChildren;
            
            // Otherwise sort by ID
            return a.id.localeCompare(b.id);
        });
        
        return children.slice(0, maxCount);
    }
    
    /**
     * Get context nodes within a certain depth
     */
    _getContextNodes(focusNode, maxDepth, excludeSet) {
        const contextNodes = [];
        const visited = new Set(excludeSet);
        const queue = [{
            node: focusNode,
            depth: 0
        }];
        
        while (queue.length > 0) {
            const { node, depth } = queue.shift();
            
            if (depth >= maxDepth) continue;
            
            // Add parent's siblings (aunts/uncles)
            if (node.parentId) {
                const parentSiblings = this.nodeGraph.getSiblings(node.parentId);
                parentSiblings.forEach(sibling => {
                    if (!visited.has(sibling.id)) {
                        contextNodes.push(sibling);
                        visited.add(sibling.id);
                    }
                });
            }
            
            // Add children's children (grandchildren)
            node.childIds.forEach(childId => {
                const child = this.nodeGraph.getNode(childId);
                if (child && !visited.has(child.id)) {
                    queue.push({ node: child, depth: depth + 1 });
                }
            });
        }
        
        return contextNodes;
    }
    
    /**
     * Get node priority for visual emphasis
     */
    getNodePriority(nodeId, focusNodeId) {
        if (!this.nodeGraph) return 1;
        
        const config = this.defaultConfig.priorityBoost;
        
        // Focus node gets highest priority
        if (nodeId === focusNodeId) {
            return config.focus;
        }
        
        const focusNode = this.nodeGraph.getNode(focusNodeId);
        if (!focusNode) return 1;
        
        // Parent gets high priority
        if (nodeId === focusNode.parentId) {
            return config.parent;
        }
        
        // Children get medium-high priority
        if (focusNode.childIds.includes(nodeId)) {
            return config.children;
        }
        
        // Siblings get medium priority
        if (focusNode.parentId) {
            const siblings = this.nodeGraph.getSiblings(focusNodeId);
            if (siblings.some(s => s.id === nodeId)) {
                return config.siblings;
            }
        }
        
        // Grandparent gets lower priority
        if (focusNode.parentId) {
            const parent = this.nodeGraph.getNode(focusNode.parentId);
            if (parent && nodeId === parent.parentId) {
                return config.grandparent;
            }
        }
        
        // Default priority
        return 1.0;
    }
    
    /**
     * Get family relationship type
     */
    getRelationship(nodeId, focusNodeId) {
        if (nodeId === focusNodeId) return 'self';
        
        const focusNode = this.nodeGraph.getNode(focusNodeId);
        if (!focusNode) return 'none';
        
        if (nodeId === focusNode.parentId) return 'parent';
        
        if (focusNode.childIds.includes(nodeId)) return 'child';
        
        if (focusNode.parentId) {
            const siblings = this.nodeGraph.getSiblings(focusNodeId);
            if (siblings.some(s => s.id === nodeId)) return 'sibling';
            
            const parent = this.nodeGraph.getNode(focusNode.parentId);
            if (parent && nodeId === parent.parentId) return 'grandparent';
        }
        
        return 'other';
    }
    
    /**
     * Set visibility strategy
     */
    setVisibilityStrategy(strategy) {
        const validStrategies = ['family', 'radial', 'hierarchical'];
        if (!validStrategies.includes(strategy)) {
            console.warn(`Invalid visibility strategy: ${strategy}`);
            return false;
        }
        
        this.visibilityStrategy = strategy;
        this.clearCache();
        return true;
    }
    
    /**
     * Update default configuration
     */
    updateDefaultConfig(updates) {
        Object.assign(this.defaultConfig, updates);
        this.clearCache();
    }
    
    /**
     * Clear selection cache
     */
    clearCache() {
        this.selectionCache.clear();
    }
    
    /**
     * Clean old cache entries
     */
    _cleanCache() {
        const now = Date.now();
        const expiredKeys = [];
        
        this.selectionCache.forEach((value, key) => {
            if (now - value.timestamp > this.cacheTimeout) {
                expiredKeys.push(key);
            }
        });
        
        expiredKeys.forEach(key => this.selectionCache.delete(key));
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            strategy: this.visibilityStrategy,
            cacheSize: this.selectionCache.size,
            config: { ...this.defaultConfig }
        };
    }
}