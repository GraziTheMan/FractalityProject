// src/data/NodeData.js
import * as THREE from 'three';

/**
 * Core node data structure
 * Ultra-lean design - only essential properties
 */
export class NodeData {
    constructor(id, depth = 0, metadata = {}) {
        // Essential identifiers
        this.id = id;
        this.depth = depth;
        this.parentId = null;
        this.childIds = [];
        this.siblingIds = [];
        
        // Visual state
        this.position = new THREE.Vector3();
        this.targetPosition = new THREE.Vector3();
        this.opacity = 1;
        this.targetOpacity = 1;
        this.scale = 1;
        this.color = new THREE.Color();
        this.priority = 1;
        
        // Metadata (extensible)
        this.metadata = {
            label: metadata.label || `Node ${id}`,
            type: metadata.type || 'default',
            created: metadata.created || Date.now(),
            tags: metadata.tags || [],
            ...metadata
        };
    }
    
    /**
     * Serialize node for storage/transmission
     */
    toJSON() {
        return {
            id: this.id,
            depth: this.depth,
            parentId: this.parentId,
            childIds: this.childIds,
            metadata: this.metadata
        };
    }
    
    /**
     * Create node from serialized data
     */
    static fromJSON(data) {
        const node = new NodeData(data.id, data.depth, data.metadata);
        node.parentId = data.parentId;
        node.childIds = data.childIds || [];
        return node;
    }
    
    /**
     * Calculate memory footprint (bytes)
     */
    getMemorySize() {
        // Rough estimation
        const baseSize = 100; // Base object overhead
        const stringSize = (this.id.length + (this.metadata.label?.length || 0)) * 2; // UTF-16
        const arraySize = (this.childIds.length + this.siblingIds.length) * 8; // References
        const vectorSize = 3 * 4 * 3; // Three Vector3 objects
        
        return baseSize + stringSize + arraySize + vectorSize;
    }
}

/**
 * Node collection with efficient lookups
 */
export class NodeGraph {
    constructor() {
        this.nodes = new Map();
        this.childIndex = new Map(); // Parent -> Children mapping
        this.depthIndex = new Map(); // Depth -> Nodes mapping
        this.stats = {
            totalNodes: 0,
            maxDepth: 0,
            averageChildren: 0
        };
    }
    
    /**
     * Add node to graph
     */
    addNode(node) {
        this.nodes.set(node.id, node);
        
        // Update indices
        if (node.parentId) {
            if (!this.childIndex.has(node.parentId)) {
                this.childIndex.set(node.parentId, new Set());
            }
            this.childIndex.get(node.parentId).add(node.id);
        }
        
        if (!this.depthIndex.has(node.depth)) {
            this.depthIndex.set(node.depth, new Set());
        }
        this.depthIndex.get(node.depth).add(node.id);
        
        // Update stats
        this.updateStats();
    }
    
    /**
     * Get node by ID
     */
    getNode(id) {
        return this.nodes.get(id);
    }
    
    /**
     * Get children of a node
     */
    getChildren(nodeId) {
        const childIds = this.childIndex.get(nodeId);
        if (!childIds) return [];
        
        return Array.from(childIds).map(id => this.nodes.get(id)).filter(Boolean);
    }
    
    /**
     * Get siblings of a node
     */
    getSiblings(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node || !node.parentId) return [];
        
        const siblings = this.getChildren(node.parentId);
        return siblings.filter(sibling => sibling.id !== nodeId);
    }
    
    /**
     * Get all nodes at a specific depth
     */
    getNodesAtDepth(depth) {
        const nodeIds = this.depthIndex.get(depth);
        if (!nodeIds) return [];
        
        return Array.from(nodeIds).map(id => this.nodes.get(id)).filter(Boolean);
    }
    
    /**
     * Update graph statistics
     */
    updateStats() {
        this.stats.totalNodes = this.nodes.size;
        this.stats.maxDepth = Math.max(...Array.from(this.depthIndex.keys()));
        
        let totalChildren = 0;
        let parentsCount = 0;
        
        this.childIndex.forEach((children, parentId) => {
            totalChildren += children.size;
            parentsCount++;
        });
        
        this.stats.averageChildren = parentsCount > 0 ? totalChildren / parentsCount : 0;
    }
    
    /**
     * Serialize entire graph
     */
    toJSON() {
        const nodesArray = Array.from(this.nodes.values()).map(node => node.toJSON());
        return {
            nodes: nodesArray,
            stats: this.stats,
            version: '0.2.2'
        };
    }
    
    /**
     * Load graph from serialized data
     */
    static fromJSON(data) {
        const graph = new NodeGraph();
        
        // First pass: create all nodes
        data.nodes.forEach(nodeData => {
            const node = NodeData.fromJSON(nodeData);
            graph.nodes.set(node.id, node);
        });
        
        // Second pass: rebuild indices and relationships
        data.nodes.forEach(nodeData => {
            const node = graph.nodes.get(nodeData.id);
            if (node) {
                graph.addNode(node);
                
                // Rebuild sibling relationships
                if (node.parentId) {
                    const siblings = graph.getSiblings(node.id);
                    node.siblingIds = siblings.map(s => s.id);
                }
            }
        });
        
        return graph;
    }
    
    /**
     * Get memory usage estimate
     */
    getMemoryUsage() {
        let totalMemory = 0;
        this.nodes.forEach(node => {
            totalMemory += node.getMemorySize();
        });
        return totalMemory;
    }
    
    /**
     * Clear all data
     */
    clear() {
        this.nodes.clear();
        this.childIndex.clear();
        this.depthIndex.clear();
        this.stats = {
            totalNodes: 0,
            maxDepth: 0,
            averageChildren: 0
        };
    }
} 