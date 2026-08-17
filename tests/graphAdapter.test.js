// tests/graphAdapter.test.js
//
// The reason this adapter exists: the engine's NodeData only models
// id/depth/parentId/childIds/metadata, while the API wire format also carries
// energy, resonance, visual and timestamps. Without preservation, a
// load -> edit -> save cycle silently wipes all four. These tests pin that.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    apiMapToNodeGraph,
    nodeGraphToApiNodes,
    findRootId,
    graphToCreatePayload
} from '../src/api/graphAdapter.js';
import { NodeData } from '../src/data/NodeData.js';

function apiNode(id, overrides = {}) {
    return {
        id,
        parentId: null,
        childIds: [],
        depth: 0,
        metadata: { label: id, type: 'default', tags: [], description: '' },
        energy: { ATP: 1.0, efficiency: 1.0, network: 'default' },
        resonance: { semanticScore: 0, tfidfScore: 0, connections: [] },
        visual: { position: { x: 0, y: 0, z: 0 }, scale: 1, color: '#00ff00', glow: 0 },
        timestamps: { created: 1000, modified: 1000, lastVisited: null },
        ...overrides
    };
}

const sampleMap = {
    id: 'map-1',
    title: 'Test',
    root_id: 'root',
    nodes: [
        apiNode('root', { childIds: ['child'] }),
        apiNode('child', { parentId: 'root', depth: 1 })
    ]
};

test('apiMapToNodeGraph builds a traversable graph', () => {
    const graph = apiMapToNodeGraph(sampleMap);

    assert.equal(graph.nodes.size, 2);
    assert.equal(graph.getNode('root').childIds[0], 'child');
    assert.equal(graph.getNode('child').parentId, 'root');
    assert.equal(graph.getNode('child').depth, 1);
});

test('apiMapToNodeGraph tolerates a map with no nodes', () => {
    const graph = apiMapToNodeGraph({ id: 'empty', nodes: [] });
    assert.equal(graph.nodes.size, 0);
    assert.deepEqual(nodeGraphToApiNodes(graph), []);
});

test('apiMapToNodeGraph tolerates missing optional fields', () => {
    const graph = apiMapToNodeGraph({ nodes: [{ id: 'bare' }] });
    const node = graph.getNode('bare');

    assert.equal(node.depth, 0);
    assert.equal(node.parentId, null);
    assert.deepEqual(node.childIds, []);
});

test('round trip preserves energy, resonance and timestamps', () => {
    // The regression this module was written to prevent
    const original = {
        nodes: [
            apiNode('a', {
                energy: { ATP: 0.42, efficiency: 0.9, network: 'executive' },
                resonance: { semanticScore: 0.77, tfidfScore: 0.2, connections: ['b'] },
                timestamps: { created: 12345, modified: 12345, lastVisited: 999 }
            })
        ]
    };

    const graph = apiMapToNodeGraph(original);
    const [saved] = nodeGraphToApiNodes(graph);

    assert.equal(saved.energy.ATP, 0.42);
    assert.equal(saved.energy.network, 'executive');
    assert.equal(saved.resonance.semanticScore, 0.77);
    assert.deepEqual(saved.resonance.connections, ['b']);

    // created and lastVisited survive; modified is bumped
    assert.equal(saved.timestamps.created, 12345);
    assert.equal(saved.timestamps.lastVisited, 999);
    assert.ok(saved.timestamps.modified >= 12345);
});

test('round trip preserves stored visual state when the engine has not moved a node', () => {
    const original = {
        nodes: [
            apiNode('a', {
                visual: {
                    position: { x: 5, y: 6, z: 7 },
                    scale: 3,
                    color: '#ff00ff',
                    glow: 0.5
                }
            })
        ]
    };

    const graph = apiMapToNodeGraph(original);
    const [saved] = nodeGraphToApiNodes(graph);

    assert.deepEqual(saved.visual.position, { x: 5, y: 6, z: 7 });
    assert.equal(saved.visual.color, '#ff00ff');
    assert.equal(saved.visual.glow, 0.5);
});

test('stored visual state is not clobbered by engine defaults', () => {
    // Regression: NodeData initialises color to new THREE.Color(), which is
    // WHITE, and position to the origin. Reading the live object first
    // overwrote every saved colour with #ffffff on the first save.
    const graph = apiMapToNodeGraph({
        nodes: [
            apiNode('a', {
                visual: { position: { x: 1, y: 2, z: 3 }, scale: 4, color: '#ff00ff', glow: 0.5 }
            })
        ]
    });

    // Whatever the engine has done to the runtime object...
    const node = graph.getNode('a');
    node.position.set(10, 20, 30);

    const [saved] = nodeGraphToApiNodes(graph);

    // ...the persisted values win, so nothing is silently lost
    assert.deepEqual(saved.visual.position, { x: 1, y: 2, z: 3 });
    assert.equal(saved.visual.scale, 4);
    assert.equal(saved.visual.color, '#ff00ff');
    assert.equal(saved.visual.glow, 0.5);
});

test('nodes created in the engine get schema defaults, not undefined', () => {
    const graph = apiMapToNodeGraph({ nodes: [apiNode('a')] });

    // Add a node the way the app would, bypassing the API entirely
    const fresh = new NodeData('fresh', 1, { label: 'Fresh' });
    graph.addNode(fresh);

    const saved = nodeGraphToApiNodes(graph);
    const freshSaved = saved.find((n) => n.id === 'fresh');

    assert.equal(freshSaved.energy.ATP, 1.0);
    assert.equal(freshSaved.energy.network, 'default');
    assert.deepEqual(freshSaved.resonance.connections, []);
    assert.equal(freshSaved.visual.scale, 1.0);
    assert.ok(freshSaved.timestamps.created > 0);
    // A node with no stored colour falls back to the engine's, then the default
    assert.match(freshSaved.visual.color, /^#[0-9a-f]{6}$/);
});

test('metadata survives the round trip, including extra fields', () => {
    const graph = apiMapToNodeGraph({
        nodes: [
            apiNode('a', {
                metadata: {
                    label: 'Labelled',
                    type: 'concept',
                    tags: ['x', 'y'],
                    description: 'desc',
                    customField: 'kept'
                }
            })
        ]
    });

    const [saved] = nodeGraphToApiNodes(graph);
    assert.equal(saved.metadata.label, 'Labelled');
    assert.equal(saved.metadata.type, 'concept');
    assert.deepEqual(saved.metadata.tags, ['x', 'y']);
    assert.equal(saved.metadata.customField, 'kept');
});

test('two graphs do not share preserved state', () => {
    const first = apiMapToNodeGraph({
        nodes: [apiNode('a', { energy: { ATP: 0.1, efficiency: 1, network: 'first' } })]
    });
    const second = apiMapToNodeGraph({
        nodes: [apiNode('a', { energy: { ATP: 0.9, efficiency: 1, network: 'second' } })]
    });

    assert.equal(nodeGraphToApiNodes(first)[0].energy.network, 'first');
    assert.equal(nodeGraphToApiNodes(second)[0].energy.network, 'second');
});

// --- root detection --------------------------------------------------------

test('findRootId picks the parentless node', () => {
    const graph = apiMapToNodeGraph(sampleMap);
    assert.equal(findRootId(graph), 'root');
});

test('findRootId prefers the shallowest parentless node', () => {
    const graph = apiMapToNodeGraph({
        nodes: [apiNode('deep', { depth: 5 }), apiNode('shallow', { depth: 0 })]
    });
    assert.equal(findRootId(graph), 'shallow');
});

test('findRootId returns null when every node has a parent', () => {
    const graph = apiMapToNodeGraph({
        nodes: [apiNode('a', { parentId: 'b' }), apiNode('b', { parentId: 'a' })]
    });
    assert.equal(findRootId(graph), null);
});

// --- create payload --------------------------------------------------------

test('graphToCreatePayload produces a complete create body', () => {
    const graph = apiMapToNodeGraph(sampleMap);
    const payload = graphToCreatePayload(graph, { title: 'My Map' });

    assert.equal(payload.title, 'My Map');
    assert.equal(payload.visibility, 'private');
    assert.equal(payload.root_id, 'root');
    assert.equal(payload.nodes.length, 2);
});

test('graphToCreatePayload passes visibility through', () => {
    const graph = apiMapToNodeGraph(sampleMap);
    const payload = graphToCreatePayload(graph, { title: 'Open', visibility: 'public' });
    assert.equal(payload.visibility, 'public');
});
