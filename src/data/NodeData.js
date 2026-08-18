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
        // `childIds` on the parent is the ordered authority; childIndex is a
        // Set, so it can answer "is X a child of Y" quickly but cannot express
        // order. Order matters as soon as nodes can be rearranged — an outline
        // where "move up" does nothing is not an outline.
        const node = this.nodes.get(nodeId);
        if (node && Array.isArray(node.childIds) && node.childIds.length > 0) {
            return node.childIds.map(id => this.nodes.get(id)).filter(Boolean);
        }

        // Fall back to the index for graphs built by only setting parentId.
        const indexed = this.childIndex.get(nodeId);
        if (!indexed) return [];
        return Array.from(indexed).map(id => this.nodes.get(id)).filter(Boolean);
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
        // Math.max() of nothing is -Infinity, which then propagates into
        // anything that reads maxDepth. An empty graph has no depth.
        const depths = Array.from(this.depthIndex.keys());
        this.stats.maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
        
        let totalChildren = 0;
        let parentsCount = 0;
        
        this.childIndex.forEach((children, parentId) => {
            totalChildren += children.size;
            parentsCount++;
        });
        
        this.stats.averageChildren = parentsCount > 0 ? totalChildren / parentsCount : 0;
    }
    
    // === mutation =========================================================
    //
    // Everything below exists for the Node Manager: the outline view that edits
    // the graph's actual structure, as opposed to the 3D view which only shows
    // one parent's children at a time.
    //
    // Two invariants hold across all of it:
    //
    //   1. `parent.childIds` is the ordered authority for children. `childIndex`
    //      and `depthIndex` are derived, and every mutation keeps them in step.
    //   2. `depth` IS the tier. Reparenting therefore has to renumber the whole
    //      moved subtree, not just the node that moved.

    /**
     * An id nothing else is using.
     *
     * Counts upward from the graph size rather than from 0 so repeated calls on
     * a large graph do not scan from the start every time.
     */
    generateNodeId(prefix = 'node') {
        let n = this.nodes.size + 1;
        let id = `${prefix}-${n}`;
        while (this.nodes.has(id)) {
            n++;
            id = `${prefix}-${n}`;
        }
        return id;
    }

    /**
     * Every descendant of `nodeId`, deepest-last.
     *
     * Cycle-safe: a `parentId`/`childIds` pair that disagrees, or a map edited
     * by hand, can describe a loop, and this is used by the guard that stops
     * reparenting from creating one.
     */
    getDescendantIds(nodeId) {
        const out = [];
        const seen = new Set([nodeId]);
        const queue = [...(this.nodes.get(nodeId)?.childIds ?? [])];

        while (queue.length > 0) {
            const id = queue.shift();
            if (seen.has(id)) continue;
            seen.add(id);
            if (!this.nodes.has(id)) continue;
            out.push(id);
            queue.push(...(this.nodes.get(id).childIds ?? []));
        }
        return out;
    }

    /**
     * Create a node and attach it under `parentId`.
     *
     * @param {object} options
     * @param {string|null} [options.parentId] null makes another root
     * @param {string} [options.label]
     * @param {string} [options.id] generated when absent
     * @param {number} [options.index] position among siblings; appended if absent
     * @returns {NodeData|null} null if the parent does not exist
     */
    createNode({ parentId = null, label, id, index, type } = {}) {
        if (parentId !== null && !this.nodes.has(parentId)) return null;

        const parent = parentId === null ? null : this.nodes.get(parentId);
        const nodeId = id ?? this.generateNodeId();
        if (this.nodes.has(nodeId)) return null;

        const depth = parent ? parent.depth + 1 : 0;
        const node = new NodeData(nodeId, depth, {
            label: label ?? `Node ${nodeId}`,
            type: type ?? 'default'
        });
        node.parentId = parentId;

        this.nodes.set(nodeId, node);
        this._indexNode(node);

        if (parent) {
            const at = Number.isInteger(index)
                ? Math.max(0, Math.min(index, parent.childIds.length))
                : parent.childIds.length;
            parent.childIds.splice(at, 0, nodeId);
        }

        this._refreshSiblings(parentId);
        this.updateStats();
        return node;
    }

    /**
     * Remove a node.
     *
     * @param {string} nodeId
     * @param {object} [options]
     * @param {'cascade'|'promote'} [options.strategy]
     *   'cascade' removes the subtree — what deleting a folder does.
     *   'promote' keeps the children, attaching them where the node was, which
     *   is what you want when a node was only ever a grouping you no longer need.
     * @returns {string[]} the ids actually removed
     */
    removeNode(nodeId, { strategy = 'cascade' } = {}) {
        const node = this.nodes.get(nodeId);
        if (!node) return [];

        const parentId = node.parentId;
        const parent = parentId ? this.nodes.get(parentId) : null;
        const positionInParent = parent ? parent.childIds.indexOf(nodeId) : -1;

        let removed;
        if (strategy === 'promote') {
            // Splice the children into the hole this node leaves, so their order
            // relative to their former uncles is preserved.
            const orphans = [...node.childIds];
            for (const childId of orphans) {
                const child = this.nodes.get(childId);
                if (child) child.parentId = parentId;
            }
            if (parent && positionInParent >= 0) {
                parent.childIds.splice(positionInParent, 1, ...orphans);
            }
            node.childIds = [];
            this._deleteNode(nodeId);
            removed = [nodeId];

            // The promoted subtrees all sit one tier higher now.
            for (const childId of orphans) this._renumberSubtree(childId);
        } else {
            removed = [nodeId, ...this.getDescendantIds(nodeId)];
            for (const id of removed) this._deleteNode(id);
            if (parent && positionInParent >= 0) {
                parent.childIds.splice(positionInParent, 1);
            }
        }

        this._refreshSiblings(parentId);
        this.updateStats();
        return removed;
    }

    /**
     * Reparent a node, renumbering its subtree's tiers.
     *
     * @param {string} nodeId
     * @param {string|null} newParentId null promotes it to a root
     * @param {object} [options]
     * @param {number} [options.index] position among the new siblings
     * @returns {boolean} false if the move is impossible or would form a cycle
     */
    setParent(nodeId, newParentId, { index } = {}) {
        const node = this.nodes.get(nodeId);
        if (!node) return false;
        if (newParentId === nodeId) return false;
        if (newParentId !== null && !this.nodes.has(newParentId)) return false;

        // Moving a node inside its own subtree would detach that subtree from
        // the graph entirely and loop forever on any traversal.
        if (newParentId !== null && this.getDescendantIds(nodeId).includes(newParentId)) {
            return false;
        }

        const oldParentId = node.parentId;
        const oldParent = oldParentId ? this.nodes.get(oldParentId) : null;
        if (oldParent) {
            const at = oldParent.childIds.indexOf(nodeId);
            if (at >= 0) oldParent.childIds.splice(at, 1);
        }
        if (oldParentId && this.childIndex.has(oldParentId)) {
            this.childIndex.get(oldParentId).delete(nodeId);
        }

        node.parentId = newParentId;

        const newParent = newParentId === null ? null : this.nodes.get(newParentId);
        if (newParent) {
            const at = Number.isInteger(index)
                ? Math.max(0, Math.min(index, newParent.childIds.length))
                : newParent.childIds.length;
            newParent.childIds.splice(at, 0, nodeId);

            if (!this.childIndex.has(newParentId)) this.childIndex.set(newParentId, new Set());
            this.childIndex.get(newParentId).add(nodeId);
        }

        this._renumberSubtree(nodeId);
        this._refreshSiblings(oldParentId);
        this._refreshSiblings(newParentId);
        this.updateStats();
        return true;
    }

    /**
     * Move a node earlier or later among its siblings.
     *
     * @param {string} nodeId
     * @param {number} offset -1 for up, +1 for down
     * @returns {boolean} false at the ends of the list
     */
    moveWithinSiblings(nodeId, offset) {
        const node = this.nodes.get(nodeId);
        if (!node?.parentId) return false;

        const parent = this.nodes.get(node.parentId);
        if (!parent) return false;

        const from = parent.childIds.indexOf(nodeId);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= parent.childIds.length) return false;

        parent.childIds.splice(from, 1);
        parent.childIds.splice(to, 0, nodeId);
        this._refreshSiblings(node.parentId);
        return true;
    }

    /**
     * Move a node up one tier: its parent becomes its grandparent.
     *
     * Placed directly after its former parent, which is where an outliner puts
     * it and keeps reading order intact.
     *
     * @returns {boolean} false for a node already at tier 0
     */
    promote(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node?.parentId) return false;

        const parent = this.nodes.get(node.parentId);
        if (!parent) return false;

        const grandparentId = parent.parentId;
        const grandparent = grandparentId ? this.nodes.get(grandparentId) : null;
        const index = grandparent
            ? grandparent.childIds.indexOf(parent.id) + 1
            : undefined;

        return this.setParent(nodeId, grandparentId ?? null, { index });
    }

    /**
     * Move a node down one tier: it becomes a child of the sibling above it.
     *
     * @returns {boolean} false when there is no sibling above to move into
     */
    demote(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node?.parentId) return false;

        const parent = this.nodes.get(node.parentId);
        if (!parent) return false;

        const at = parent.childIds.indexOf(nodeId);
        // Only the preceding sibling. Using the following one instead would
        // reorder the outline as a side effect of an indent.
        if (at <= 0) return false;

        return this.setParent(nodeId, parent.childIds[at - 1]);
    }

    /** Change a node's label. */
    renameNode(nodeId, label) {
        const node = this.nodes.get(nodeId);
        if (!node) return false;
        node.metadata.label = String(label ?? '').trim() || node.metadata.label;
        return true;
    }

    /** Nodes with no parent — the tops of the tiers. */
    getRootNodes() {
        return Array.from(this.nodes.values()).filter(n => !n.parentId);
    }

    /**
     * Recompute every derived index from nodes + parentId/childIds.
     *
     * The escape hatch after a bulk import, or any edit made without going
     * through the methods above.
     */
    rebuildIndices() {
        this.childIndex.clear();
        this.depthIndex.clear();

        for (const node of this.nodes.values()) {
            if (node.parentId && this.nodes.has(node.parentId)) {
                if (!this.childIndex.has(node.parentId)) {
                    this.childIndex.set(node.parentId, new Set());
                }
                this.childIndex.get(node.parentId).add(node.id);
            }
            if (!this.depthIndex.has(node.depth)) this.depthIndex.set(node.depth, new Set());
            this.depthIndex.get(node.depth).add(node.id);
        }

        for (const root of this.getRootNodes()) this._renumberSubtree(root.id);
        for (const node of this.nodes.values()) this._refreshSiblings(node.id);
        this.updateStats();
    }

    // --- mutation internals ------------------------------------------------

    _indexNode(node) {
        if (node.parentId) {
            if (!this.childIndex.has(node.parentId)) {
                this.childIndex.set(node.parentId, new Set());
            }
            this.childIndex.get(node.parentId).add(node.id);
        }
        if (!this.depthIndex.has(node.depth)) this.depthIndex.set(node.depth, new Set());
        this.depthIndex.get(node.depth).add(node.id);
    }

    _deleteNode(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return;

        this.depthIndex.get(node.depth)?.delete(nodeId);
        if (node.parentId) this.childIndex.get(node.parentId)?.delete(nodeId);
        this.childIndex.delete(nodeId);
        this.nodes.delete(nodeId);
    }

    /**
     * Renumber depths from `rootId` down, keeping depthIndex correct.
     *
     * Iterative rather than recursive: a deep chain of nodes is entirely
     * possible in a user-built map, and this must not depend on stack depth.
     */
    _renumberSubtree(rootId) {
        const root = this.nodes.get(rootId);
        if (!root) return;

        const parent = root.parentId ? this.nodes.get(root.parentId) : null;
        const queue = [[rootId, parent ? parent.depth + 1 : 0]];
        const seen = new Set();

        while (queue.length > 0) {
            const [id, depth] = queue.shift();
            if (seen.has(id)) continue;
            seen.add(id);

            const node = this.nodes.get(id);
            if (!node) continue;

            if (node.depth !== depth) {
                this.depthIndex.get(node.depth)?.delete(id);
                node.depth = depth;
                if (!this.depthIndex.has(depth)) this.depthIndex.set(depth, new Set());
                this.depthIndex.get(depth).add(id);
            }

            for (const childId of node.childIds) queue.push([childId, depth + 1]);
        }
    }

    /** Keep siblingIds current for the children of one parent. */
    _refreshSiblings(parentId) {
        if (!parentId) {
            // Roots are each other's siblings.
            const roots = this.getRootNodes();
            const ids = roots.map(n => n.id);
            for (const root of roots) {
                root.siblingIds = ids.filter(id => id !== root.id);
            }
            return;
        }

        const parent = this.nodes.get(parentId);
        if (!parent) return;
        for (const childId of parent.childIds) {
            const child = this.nodes.get(childId);
            if (child) child.siblingIds = parent.childIds.filter(id => id !== childId);
        }
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