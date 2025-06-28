// src/shared/NodeSchema.js
// Unified node structure for the entire Fractality platform

/**
 * Core node structure used across CLI, UI, and engines
 * This is the single source of truth for node data
 */
export class FractalNode {
    constructor(data = {}) {
        // Core identifiers
        this.id = data.id || this.generateId();
        this.parentId = data.parentId || null;
        
        // Standardized relationship naming
        this.children = data.children || [];  // Array of child IDs
        
        // Core metadata
        this.metadata = {
            label: data.label || data.name || '',
            type: data.type || 'default',
            tags: data.tags || [],
            description: data.description || data.info || '',
            ...data.metadata  // Allow additional metadata
        };
        
        // Computed properties
        this.depth = data.depth || 0;
        
        // Energy and consciousness properties
        this.energy = {
            ATP: data.ATP || 1.0,
            efficiency: data.efficiency || 1.0,
            network: data.network || 'default'
        };
        
        // Resonance properties
        this.resonance = {
            semanticScore: data.semanticScore || 0.0,
            tfidfScore: data.tfidfScore || 0.0,
            connections: data.connections || []
        };
        
        // Visual properties
        this.visual = {
            position: data.position || { x: 0, y: 0, z: 0 },
            scale: data.scale || 1.0,
            color: data.color || '#00ff00',
            glow: data.glow || 0.0
        };
        
        // Timestamps
        this.timestamps = {
            created: data.created || Date.now(),
            modified: data.modified || Date.now(),
            lastVisited: data.lastVisited || null
        };
    }
    
    generateId() {
        return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Standardized getters
    get childIds() {
        return this.children;  // Backward compatibility
    }
    
    set childIds(value) {
        this.children = value;  // Backward compatibility
    }
    
    // Add child with validation
    addChild(childId) {
        if (!this.children.includes(childId)) {
            this.children.push(childId);
            this.timestamps.modified = Date.now();
        }
    }
    
    // Remove child
    removeChild(childId) {
        const index = this.children.indexOf(childId);
        if (index > -1) {
            this.children.splice(index, 1);
            this.timestamps.modified = Date.now();
        }
    }
    
    // Export to different formats
    toJSON() {
        return {
            id: this.id,
            parentId: this.parentId,
            childIds: this.children,  // Use old name for compatibility
            depth: this.depth,
            metadata: this.metadata,
            energy: this.energy,
            resonance: this.resonance,
            visual: this.visual,
            timestamps: this.timestamps
        };
    }
    
    // Import from old format
    static fromLegacy(oldNode) {
        return new FractalNode({
            id: oldNode.id,
            parentId: oldNode.parentId,
            children: oldNode.childIds || oldNode.children || [],
            depth: oldNode.depth,
            label: oldNode.metadata?.label || oldNode.name,
            type: oldNode.metadata?.type || oldNode.type,
            tags: oldNode.metadata?.tags || oldNode.tags || [],
            description: oldNode.metadata?.description || oldNode.info,
            ...oldNode
        });
    }
    
    // Validate node structure
    validate() {
        const errors = [];
        
        if (!this.id) errors.push('Node must have an ID');
        if (typeof this.depth !== 'number') errors.push('Depth must be a number');
        if (!Array.isArray(this.children)) errors.push('Children must be an array');
        if (this.parentId === this.id) errors.push('Node cannot be its own parent');
        if (this.children.includes(this.id)) errors.push('Node cannot be its own child');
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}

/**
 * Node collection manager with deduplication
 */
export class NodeCollection {
    constructor() {
        this.nodes = new Map();
        this.index = {
            byParent: new Map(),
            byType: new Map(),
            byTag: new Map()
        };
    }
    
    // Add node with deduplication
    addNode(nodeData) {
        const node = nodeData instanceof FractalNode 
            ? nodeData 
            : new FractalNode(nodeData);
            
        const validation = node.validate();
        if (!validation.valid) {
            console.error('Invalid node:', validation.errors);
            return null;
        }
        
        // Check for duplicates
        if (this.nodes.has(node.id)) {
            console.warn(`Node ${node.id} already exists, updating instead`);
            return this.updateNode(node.id, node);
        }
        
        // Add to main collection
        this.nodes.set(node.id, node);
        
        // Update indices
        this.updateIndices(node);
        
        return node;
    }
    
    // Update existing node
    updateNode(nodeId, updates) {
        const node = this.nodes.get(nodeId);
        if (!node) return null;
        
        // Remove from indices
        this.removeFromIndices(node);
        
        // Apply updates
        Object.assign(node, updates);
        node.timestamps.modified = Date.now();
        
        // Re-add to indices
        this.updateIndices(node);
        
        return node;
    }
    
    // Get node by ID
    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }
    
    // Get children of a node
    getChildren(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return [];
        
        return node.children
            .map(childId => this.nodes.get(childId))
            .filter(child => child !== undefined);
    }
    
    // Get siblings of a node
    getSiblings(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node || !node.parentId) return [];
        
        const parent = this.nodes.get(node.parentId);
        if (!parent) return [];
        
        return parent.children
            .filter(childId => childId !== nodeId)
            .map(childId => this.nodes.get(childId))
            .filter(sibling => sibling !== undefined);
    }
    
    // Find nodes by criteria
    findNodes(criteria) {
        const results = [];
        
        if (criteria.type) {
            const byType = this.index.byType.get(criteria.type) || new Set();
            byType.forEach(nodeId => {
                const node = this.nodes.get(nodeId);
                if (node && this.matchesCriteria(node, criteria)) {
                    results.push(node);
                }
            });
        } else {
            // Search all nodes
            this.nodes.forEach(node => {
                if (this.matchesCriteria(node, criteria)) {
                    results.push(node);
                }
            });
        }
        
        return results;
    }
    
    // Private: Update indices
    updateIndices(node) {
        // By parent
        if (node.parentId) {
            if (!this.index.byParent.has(node.parentId)) {
                this.index.byParent.set(node.parentId, new Set());
            }
            this.index.byParent.get(node.parentId).add(node.id);
        }
        
        // By type
        if (node.metadata.type) {
            if (!this.index.byType.has(node.metadata.type)) {
                this.index.byType.set(node.metadata.type, new Set());
            }
            this.index.byType.get(node.metadata.type).add(node.id);
        }
        
        // By tags
        node.metadata.tags.forEach(tag => {
            if (!this.index.byTag.has(tag)) {
                this.index.byTag.set(tag, new Set());
            }
            this.index.byTag.get(tag).add(node.id);
        });
    }
    
    // Private: Remove from indices
    removeFromIndices(node) {
        if (node.parentId && this.index.byParent.has(node.parentId)) {
            this.index.byParent.get(node.parentId).delete(node.id);
        }
        
        if (node.metadata.type && this.index.byType.has(node.metadata.type)) {
            this.index.byType.get(node.metadata.type).delete(node.id);
        }
        
        node.metadata.tags.forEach(tag => {
            if (this.index.byTag.has(tag)) {
                this.index.byTag.get(tag).delete(node.id);
            }
        });
    }
    
    // Private: Check if node matches criteria
    matchesCriteria(node, criteria) {
        if (criteria.type && node.metadata.type !== criteria.type) return false;
        if (criteria.tag && !node.metadata.tags.includes(criteria.tag)) return false;
        if (criteria.minDepth && node.depth < criteria.minDepth) return false;
        if (criteria.maxDepth && node.depth > criteria.maxDepth) return false;
        
        return true;
    }
    
    // Export all nodes
    exportAll() {
        return Array.from(this.nodes.values()).map(node => node.toJSON());
    }
    
    // Import nodes with deduplication
    importNodes(nodesData, options = {}) {
        const results = {
            added: 0,
            updated: 0,
            errors: []
        };
        
        nodesData.forEach(nodeData => {
            try {
                const existing = this.nodes.has(nodeData.id);
                const node = this.addNode(nodeData);
                
                if (node) {
                    if (existing) {
                        results.updated++;
                    } else {
                        results.added++;
                    }
                }
            } catch (error) {
                results.errors.push({
                    nodeId: nodeData.id,
                    error: error.message
                });
            }
        });
        
        return results;
    }
}

// Singleton instance for global use
export const globalNodeCollection = new NodeCollection();

// Migration utilities
export const NodeMigration = {
    // Convert old format to new
    migrateNode(oldNode) {
        return FractalNode.fromLegacy(oldNode);
    },
    
    // Batch migrate
    migrateNodes(oldNodes) {
        return oldNodes.map(node => this.migrateNode(node));
    },
    
    // Detect format
    detectFormat(node) {
        if (node instanceof FractalNode) return 'current';
        if (node.childIds && !node.children) return 'legacy';
        if (node.children && !node.childIds) return 'modern';
        return 'unknown';
    }
};