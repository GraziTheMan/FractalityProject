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

        /**
         * Additional parents this node emerged from, beyond `parentId`.
         *
         * The two are different relations and the distinction is the point:
         *
         *   parentId    the CONTAINING scale. Which cone am I inside, and where do I
         *               live in the outline. Exactly one, so the hierarchy stays a
         *               tree you can file things in.
         *   emergesFrom CONTRIBUTING streams. What flowed together to make me. Any
         *               number, which is what makes the graph a DAG.
         *
         * "Consciousness" is inside The Fractiverse (one containing scale) and
         * emerges from four axioms (four contributing streams). Collapsing those into
         * one relation loses whichever half you collapse.
         */
        this.emergesFrom = [];

        /**
         * Nodes this one cycles back to, closing a loop the hierarchy cannot hold.
         *
         * A third relation, and the only one that is allowed to be circular. Axiom II
         * says persistence comes from "a recurrent cycle" and that death is "the
         * mandatory refresh rate of the information field" — so terminal entropy
         * resetting into a new beginning is central rather than incidental. But tiers
         * are 1 + max(parents), which requires an acyclic graph: a loop leaves every
         * node in it unplaceable.
         *
         * The resolution is that this edge is NOT a parent relation. It is excluded
         * from getAllParentIds, from tier computation and from the cycle guard, so it
         * can say "this returns to that" without any claim that one derives from the
         * other. It is drawn, and it is never traversed for depth.
         */
        this.resetsTo = [];
        
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
            // Omitted when empty. Most nodes in a large map converge from nothing,
            // and an empty array on every one is bytes in every export and every row.
            ...(this.emergesFrom.length ? { emergesFrom: [...this.emergesFrom] } : {}),
            ...(this.resetsTo.length ? { resetsTo: [...this.resetsTo] } : {}),
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
        node.emergesFrom = [...(data.emergesFrom || [])];
        node.resetsTo = [...(data.resetsTo || [])];
        return node;
    }
    
    /**
     * Calculate memory footprint (bytes)
     */
    getMemorySize() {
        // Rough estimation
        const baseSize = 100; // Base object overhead
        // Content is the only field with no natural bound — a node's markdown page
        // can be longer than everything else about the map put together, so
        // leaving it out of the estimate would make the memory reading useless
        // for exactly the maps that need watching.
        const stringSize = (
            this.id.length
            + (this.metadata.label?.length || 0)
            + (this.metadata.content?.length || 0)
        ) * 2; // UTF-16
        const arraySize = (this.childIds.length + this.siblingIds.length) * 8; // References
        const vectorSize = 3 * 4 * 3; // Three Vector3 objects
        
        return baseSize + stringSize + arraySize + vectorSize;
    }

    /**
     * This node's markdown page, or '' if it has none.
     *
     * A getter rather than a defaulted field: an absent key costs nothing in an
     * export, and most nodes in a large map will never have a page. Callers get
     * a string either way.
     */
    get content() {
        return this.metadata.content ?? '';
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
        // Source -> nodes that emerged from it. The reverse of node.emergesFrom.
        this.emergenceIndex = new Map();
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
     * Every CONTAINMENT descendant of `nodeId`, deepest-last.
     *
     * Follows childIds only, deliberately. Deleting a container should remove what it
     * contains, not everything that ever emerged from it — a node that draws on
     * "Duality" as one of four streams is not inside Duality and must survive it.
     * For reachability across both relations, which is what a cycle check needs, see
     * wouldCreateCycle.
     *
     * Cycle-safe: a `parentId`/`childIds` pair that disagrees, or a map edited
     * by hand, can describe a loop.
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
        // Removing a node can remove a contributor, which lets everything downstream
        // of it rise. Recomputed rather than patched: the effect is not local.
        this.recomputeTiers();
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
        //
        // Checked across BOTH relations. getDescendantIds follows childIds only, so it
        // cannot see a loop that leaves through an emergence edge and comes back — and
        // that loop is exactly what convergent parents made possible.
        if (newParentId !== null && this.wouldCreateCycle(nodeId, newParentId)) {
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

    /**
     * Set a node's markdown page.
     *
     * An empty page deletes the key rather than storing ''. Most nodes of a large
     * map will never have a page, and a stored empty string would be written to
     * every export, every Turtle file and every Neo4j row for no gain.
     *
     * Unlike renameNode, blank is a legitimate value here: clearing a page you
     * wrote is a thing you may want to do, whereas clearing a label leaves a node
     * you cannot identify.
     *
     * @param {string} nodeId
     * @param {string} markdown
     * @returns {boolean} false if there is no such node
     */
    setContent(nodeId, markdown) {
        const node = this.nodes.get(nodeId);
        if (!node) return false;

        const text = String(markdown ?? '');
        if (text.trim()) {
            node.metadata.content = text;
        } else {
            delete node.metadata.content;
        }
        return true;
    }

    // --- convergent emergence ----------------------------------------------
    //
    // A node's containing scale is `parentId`; the streams that flowed together to
    // make it are `emergesFrom`. Both are parents; only the first is a home.

    /** Every id this node descends from, by either relation. */
    getAllParentIds(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return [];

        const out = [];
        if (node.parentId && this.nodes.has(node.parentId)) out.push(node.parentId);
        for (const id of node.emergesFrom) {
            if (id !== node.id && this.nodes.has(id) && !out.includes(id)) out.push(id);
        }
        return out;
    }

    /** The nodes this one emerged from, excluding its containing parent. */
    getEmergentParents(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return [];
        return node.emergesFrom
            .map((id) => this.nodes.get(id))
            .filter(Boolean);
    }

    /** The nodes that emerged from this one, i.e. converged out of it. */
    getEmergentChildren(nodeId) {
        return [...(this.emergenceIndex.get(nodeId) ?? [])]
            .map((id) => this.nodes.get(id))
            .filter(Boolean);
    }

    /**
     * How many streams converge into this node, counting its containing parent.
     *
     * The cone reads this as a radius: one parent sits at the rim, many parents sit
     * near the axis. So this is not a statistic, it is a coordinate.
     */
    getConvergenceDegree(nodeId) {
        return this.getAllParentIds(nodeId).length;
    }

    /**
     * Would making `parentId` a parent of `nodeId` close a loop?
     *
     * Walks DOWN from nodeId across both relations. `getDescendantIds` follows
     * childIds only, so it cannot see a loop that runs out through an emergence edge
     * and back — which is precisely the loop this relation makes possible.
     */
    wouldCreateCycle(nodeId, parentId) {
        if (!parentId || parentId === nodeId) return true;

        const stack = [nodeId];
        const seen = new Set();
        while (stack.length > 0) {
            const id = stack.pop();
            if (id === parentId) return true;
            if (seen.has(id)) continue;
            seen.add(id);

            const node = this.nodes.get(id);
            if (!node) continue;
            for (const childId of node.childIds) stack.push(childId);
            for (const emergentId of this.emergenceIndex.get(id) ?? []) stack.push(emergentId);
        }
        return false;
    }

    /**
     * Record that `nodeId` emerged partly from `sourceId`.
     *
     * Refused when it would close a loop, when the source is the node itself, or when
     * the source is already the containing parent — that relation is already recorded
     * and stating it twice would count it twice in the convergence degree, moving the
     * node toward the axis for no reason.
     *
     * Tiers are recomputed, because a new contributor can push this node and
     * everything below it deeper.
     *
     * @returns {boolean} false if refused
     */
    addEmergence(nodeId, sourceId) {
        const node = this.nodes.get(nodeId);
        if (!node || !this.nodes.has(sourceId)) return false;
        if (sourceId === nodeId) return false;
        if (sourceId === node.parentId) return false;
        if (node.emergesFrom.includes(sourceId)) return false;
        if (this.wouldCreateCycle(nodeId, sourceId)) return false;

        node.emergesFrom.push(sourceId);
        if (!this.emergenceIndex.has(sourceId)) this.emergenceIndex.set(sourceId, new Set());
        this.emergenceIndex.get(sourceId).add(nodeId);

        this.recomputeTiers();
        this.updateStats();
        return true;
    }

    /** Remove one convergent parent. Tiers may rise as a result. */
    removeEmergence(nodeId, sourceId) {
        const node = this.nodes.get(nodeId);
        if (!node) return false;

        const at = node.emergesFrom.indexOf(sourceId);
        if (at < 0) return false;

        node.emergesFrom.splice(at, 1);
        this.emergenceIndex.get(sourceId)?.delete(nodeId);

        this.recomputeTiers();
        this.updateStats();
        return true;
    }

    // --- recurrence ---------------------------------------------------------
    //
    // The one relation that may be circular, because the framework it serves is.

    /**
     * Record that `nodeId` cycles back to `targetId`.
     *
     * Deliberately permits what addEmergence refuses. A cycle is the point: heat death
     * returning to a new beginning is a loop, and forbidding it would mean the format
     * cannot state the thing Axiom II is about.
     *
     * Safe because this edge bears no tier. Nothing downstream reads it when computing
     * depth, so a loop here cannot make a node unplaceable.
     *
     * @returns {boolean} false only for a missing node, a self-reference, or a duplicate
     */
    addReset(nodeId, targetId) {
        const node = this.nodes.get(nodeId);
        if (!node || !this.nodes.has(targetId)) return false;
        // A node resetting to itself says nothing and would draw an arc to nowhere.
        if (targetId === nodeId) return false;
        if (node.resetsTo.includes(targetId)) return false;

        node.resetsTo.push(targetId);
        return true;
    }

    /** Remove a recurrence edge. */
    removeReset(nodeId, targetId) {
        const node = this.nodes.get(nodeId);
        if (!node) return false;
        const at = node.resetsTo.indexOf(targetId);
        if (at < 0) return false;
        node.resetsTo.splice(at, 1);
        return true;
    }

    /** The nodes this one cycles back to. */
    getResetTargets(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return [];
        return node.resetsTo.map((id) => this.nodes.get(id)).filter(Boolean);
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
        this.emergenceIndex.clear();

        for (const node of this.nodes.values()) {
            if (node.parentId && this.nodes.has(node.parentId)) {
                if (!this.childIndex.has(node.parentId)) {
                    this.childIndex.set(node.parentId, new Set());
                }
                this.childIndex.get(node.parentId).add(node.id);
            }
            // The reverse of emergesFrom: what flows OUT of this node by convergence.
            // Stored because the cone needs it per frame and walking every node's
            // emergesFrom to answer it would be quadratic.
            for (const sourceId of node.emergesFrom) {
                if (!this.nodes.has(sourceId)) continue;
                if (!this.emergenceIndex.has(sourceId)) {
                    this.emergenceIndex.set(sourceId, new Set());
                }
                this.emergenceIndex.get(sourceId).add(node.id);
            }
        }

        this.recomputeTiers();
        for (const node of this.nodes.values()) this._refreshSiblings(node.id);
        this.updateStats();
    }

    /**
     * Recompute every node's tier as 1 + the deepest of ALL its parents.
     *
     *     tier(node) = 1 + max(tier(p) for p in [parentId, ...emergesFrom])
     *
     * Taking the max over both relations rather than following parentId alone is what
     * makes the geometry mean anything: emergence can then never be drawn above
     * something that feeds into it. A node contained by a tier-1 parent but fed by a
     * tier-5 stream belongs at tier 6, not tier 2.
     *
     * Done by Kahn's algorithm over the union of both edge types. A breadth-first walk
     * down parentId — which is what this used to be — cannot express "wait until every
     * contributor is known", and would settle on whichever depth it reached first.
     *
     * Nodes in a cycle are left at tier 0 and reported. The mutators refuse to create
     * one, but an imported file or a hand-edited row can still contain one, and
     * hanging is not an acceptable response to bad data.
     *
     * @returns {string[]} ids that could not be placed, i.e. are in or below a cycle
     */
    recomputeTiers() {
        const parentsOf = (node) => {
            const out = [];
            if (node.parentId && this.nodes.has(node.parentId)) out.push(node.parentId);
            for (const id of node.emergesFrom) {
                if (id !== node.id && this.nodes.has(id)) out.push(id);
            }
            return out;
        };

        const remaining = new Map();   // id -> how many parents are not yet placed
        const dependents = new Map();  // parent id -> ids waiting on it
        const ready = [];

        for (const node of this.nodes.values()) {
            const parents = parentsOf(node);
            remaining.set(node.id, parents.length);
            for (const parentId of parents) {
                if (!dependents.has(parentId)) dependents.set(parentId, []);
                dependents.get(parentId).push(node.id);
            }
            if (parents.length === 0) ready.push(node.id);
        }

        const tier = new Map();
        while (ready.length > 0) {
            const id = ready.pop();
            const node = this.nodes.get(id);
            const parents = parentsOf(node);
            tier.set(id, parents.length === 0
                ? 0
                : 1 + Math.max(...parents.map((p) => tier.get(p) ?? 0)));

            for (const childId of dependents.get(id) ?? []) {
                remaining.set(childId, remaining.get(childId) - 1);
                if (remaining.get(childId) === 0) ready.push(childId);
            }
        }

        const unplaced = [];
        for (const node of this.nodes.values()) {
            const depth = tier.has(node.id) ? tier.get(node.id) : 0;
            if (!tier.has(node.id)) unplaced.push(node.id);
            if (node.depth !== depth) node.depth = depth;
        }

        // Rebuilt wholesale rather than patched: every tier may have changed, and a
        // partially updated index is worse than a slower rebuild.
        this.depthIndex.clear();
        for (const node of this.nodes.values()) {
            if (!this.depthIndex.has(node.depth)) this.depthIndex.set(node.depth, new Set());
            this.depthIndex.get(node.depth).add(node.id);
        }

        if (unplaced.length > 0) {
            console.warn(
                `${unplaced.length} node(s) are in or below a cycle and could not be `
                + `placed on a tier: ${unplaced.slice(0, 5).join(', ')}`
                + (unplaced.length > 5 ? ', …' : '')
            );
        }
        return unplaced;
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

        // Anything that emerged from this node now names a parent that is gone. Left
        // dangling, the tier computation would quietly skip it — so the node would keep
        // a tier it no longer earns — and the API would refuse to save the map at all.
        for (const dependentId of this.emergenceIndex.get(nodeId) ?? []) {
            const dependent = this.nodes.get(dependentId);
            if (!dependent) continue;
            const at = dependent.emergesFrom.indexOf(nodeId);
            if (at >= 0) dependent.emergesFrom.splice(at, 1);
        }
        this.emergenceIndex.delete(nodeId);

        // And this node's own outgoing references leave the reverse index.
        for (const sourceId of node.emergesFrom) {
            this.emergenceIndex.get(sourceId)?.delete(nodeId);
        }

        // Recurrence edges pointing at it, which bear no tier but would still be drawn
        // as an arc to a node that is gone.
        for (const other of this.nodes.values()) {
            const at = other.resetsTo.indexOf(nodeId);
            if (at >= 0) other.resetsTo.splice(at, 1);
        }

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