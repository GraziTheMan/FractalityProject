// src/api/graphAdapter.js
//
// Converts between the API wire format and the engine's NodeGraph.
//
// The subtlety this module exists for: the engine's NodeData only keeps
// `id, depth, parentId, childIds, metadata`. The wire format additionally
// carries `energy`, `resonance`, `visual` and `timestamps`. So a naive round
// trip —
//
//     load from API -> NodeGraph -> edit -> save back
//
// silently DESTROYS those four fields, because they never existed on the objects
// being saved. Anyone hitting save would quietly wipe their own energy and
// layout data.
//
// The fix: stash each node's original wire payload when importing, and merge the
// engine's mutable fields back over it when exporting. Nodes created in the
// engine (with no stashed original) get schema defaults instead.

import { NodeGraph, NodeData } from '../data/NodeData.js';

// Keyed by graph, so two loaded maps do not share stashes, and stashes are
// garbage-collected with the graph itself.
const originals = new WeakMap();

/**
 * Build a NodeGraph from an API map response.
 *
 * @param {{nodes: Array, root_id?: string}} apiMap
 * @returns {NodeGraph}
 */
export function apiMapToNodeGraph(apiMap) {
    const nodes = apiMap?.nodes ?? [];

    const graph = NodeGraph.fromJSON({
        nodes: nodes.map((n) => ({
            id: n.id,
            depth: n.depth ?? 0,
            parentId: n.parentId ?? null,
            childIds: n.childIds ?? [],
            emergesFrom: n.emergesFrom ?? [],
            metadata: n.metadata ?? {}
        }))
    });

    // Preserve the fields NodeData does not model
    const stash = new Map();
    for (const node of nodes) {
        stash.set(node.id, {
            energy: node.energy,
            resonance: node.resonance,
            visual: node.visual,
            timestamps: node.timestamps
        });
    }
    originals.set(graph, stash);

    return graph;
}

/**
 * Serialize a NodeGraph into the API's node array.
 *
 * Fields the engine owns (structure, metadata) come from the live graph.
 * Fields it does not model are taken from the stash, so they survive a round
 * trip instead of being reset to defaults.
 *
 * @param {NodeGraph} graph
 * @returns {Array} nodes in wire format
 */
export function nodeGraphToApiNodes(graph) {
    const stash = originals.get(graph) ?? new Map();
    const now = Date.now();

    return Array.from(graph.nodes.values()).map((node) => {
        const preserved = stash.get(node.id) ?? {};

        return {
            id: node.id,
            parentId: node.parentId ?? null,
            childIds: [...(node.childIds ?? [])],
            emergesFrom: [...(node.emergesFrom ?? [])],
            depth: node.depth ?? 0,
            metadata: { ...(node.metadata ?? {}) },

            energy: preserved.energy ?? {
                ATP: 1.0,
                efficiency: 1.0,
                network: 'default'
            },
            resonance: preserved.resonance ?? {
                semanticScore: 0.0,
                tfidfScore: 0.0,
                connections: []
            },
            visual: buildVisual(node, preserved.visual),
            timestamps: {
                created: preserved.timestamps?.created ?? now,
                modified: now,
                lastVisited: preserved.timestamps?.lastVisited ?? null
            }
        };
    });
}

/**
 * Build the `visual` block, with STORED values taking precedence over the live
 * engine ones.
 *
 * That precedence is deliberate and was chosen after a bug: NodeData initialises
 * `color` to `new THREE.Color()`, which is WHITE, and `position` to the origin.
 * Reading the live object first therefore overwrote every saved colour with
 * #ffffff on the first save — silent data loss on exactly the fields this module
 * exists to protect.
 *
 * It is also the right default for what these fields currently mean: the
 * renderer computes colour and scale for display (context-based highlighting),
 * and positions come from the layout engine algorithmically rather than from the
 * user. Nothing is lost by keeping the stored copy.
 *
 * WHEN NODE DRAGGING IS ADDED this must flip for `position`: the live value
 * becomes authoritative, and a per-node dirty flag should decide, rather than
 * comparing against defaults — a node legitimately dragged to the origin or
 * coloured white is indistinguishable from an uninitialised one.
 */
function buildVisual(node, preservedVisual) {
    const stored = preservedVisual ?? {};

    return {
        position: stored.position ?? livePosition(node) ?? { x: 0, y: 0, z: 0 },
        scale: stored.scale ?? (typeof node.scale === 'number' ? node.scale : 1.0),
        color: stored.color ?? colorToHex(node.color) ?? '#00ff00',
        glow: stored.glow ?? 0.0
    };
}

/** node.position is a THREE.Vector3 at runtime. */
function livePosition(node) {
    if (!node.position || typeof node.position.x !== 'number') return null;
    return { x: node.position.x, y: node.position.y, z: node.position.z };
}

/** THREE.Color -> '#rrggbb', or null when unavailable. */
function colorToHex(color) {
    if (!color || typeof color.getHexString !== 'function') return null;
    return `#${color.getHexString()}`;
}

/**
 * Find the root node id of a graph: the shallowest node without a parent.
 */
export function findRootId(graph) {
    let root = null;

    for (const node of graph.nodes.values()) {
        if (node.parentId) continue;
        if (root === null || (node.depth ?? 0) < (root.depth ?? 0)) {
            root = node;
        }
    }

    return root?.id ?? null;
}

/**
 * Build the payload for creating a map from the current graph.
 */
export function graphToCreatePayload(graph, { title, description = '', visibility = 'private' }) {
    return {
        title,
        description,
        visibility,
        nodes: nodeGraphToApiNodes(graph),
        root_id: findRootId(graph)
    };
}

/**
 * Register a graph's preserved fields explicitly.
 * Exposed for tests and for graphs assembled outside apiMapToNodeGraph.
 */
export function _setPreserved(graph, stash) {
    originals.set(graph, stash);
}
