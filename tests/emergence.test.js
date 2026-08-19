// tests/emergence.test.js
//
// Convergent emergence: a node with more than one parent.
//
// The model keeps two relations apart on purpose:
//
//   parentId     the CONTAINING scale — which cone am I inside, where do I live in
//                the outline. Exactly one, so the hierarchy stays fileable.
//   emergesFrom  CONTRIBUTING streams — what flowed together to make me. Any number,
//                which is what turns the tree into a DAG.
//
// "Consciousness" is inside The Fractiverse and emerges from four axioms. Collapse
// those into one relation and you lose whichever half you collapsed.
//
// Most of what follows is about the two things a DAG breaks that a tree did not:
// tiers can no longer be found by walking down from a root, and cycles can now close
// through an edge that childIds knows nothing about.

import test from 'node:test';
import assert from 'node:assert/strict';

import { NodeData, NodeGraph } from '../src/data/NodeData.js';

/** A graph builder that takes containment only; emergence is added by the tests. */
function graph(spec) {
    const g = new NodeGraph();
    for (const [id, parentId] of spec) {
        const node = new NodeData(id, 0, { label: id });
        node.parentId = parentId;
        g.nodes.set(id, node);
        if (parentId) g.nodes.get(parentId).childIds.push(id);
    }
    g.rebuildIndices();
    return g;
}

/** The shape the user described: four axioms converging into consciousness. */
function fractiverse() {
    const g = graph([
        ['fractiverse', null],
        ['axiom-i', 'fractiverse'],
        ['axiom-ii', 'fractiverse'],
        ['axiom-iii', 'fractiverse'],
        ['axiom-iv', 'fractiverse'],
        ['consciousness', 'fractiverse'],
        ['qualia', 'consciousness'],
    ]);
    for (const axiom of ['axiom-i', 'axiom-ii', 'axiom-iii', 'axiom-iv']) {
        assert.equal(g.addEmergence('consciousness', axiom), true, axiom);
    }
    return g;
}

const tier = (g, id) => g.getNode(id).depth;

// --- the two relations are distinct ---------------------------------------

test('a node can be contained by one parent and emerge from several', () => {
    const g = fractiverse();
    assert.equal(g.getNode('consciousness').parentId, 'fractiverse');
    assert.deepEqual(g.getNode('consciousness').emergesFrom,
        ['axiom-i', 'axiom-ii', 'axiom-iii', 'axiom-iv']);
    assert.equal(g.getAllParentIds('consciousness').length, 5);
});

test('emergence does not make the node a child of its contributors', () => {
    // It is not filed under them. That is the whole reason parentId stays singular:
    // the outline still has one home per node.
    const g = fractiverse();
    assert.equal(g.getNode('axiom-i').childIds.includes('consciousness'), false);
    assert.equal(g.getChildren('fractiverse').map((n) => n.id).includes('consciousness'), true);
});

test('the reverse direction is available without scanning every node', () => {
    const g = fractiverse();
    assert.deepEqual(g.getEmergentChildren('axiom-i').map((n) => n.id), ['consciousness']);
    assert.deepEqual(g.getEmergentParents('consciousness').map((n) => n.id),
        ['axiom-i', 'axiom-ii', 'axiom-iii', 'axiom-iv']);
    assert.deepEqual(g.getEmergentChildren('qualia'), []);
});

test('convergence degree counts the containing parent too', () => {
    // The cone reads this as a radius, so it is a coordinate rather than a statistic.
    const g = fractiverse();
    assert.equal(g.getConvergenceDegree('consciousness'), 5);
    assert.equal(g.getConvergenceDegree('axiom-i'), 1);
    assert.equal(g.getConvergenceDegree('fractiverse'), 0);
});

// --- tiers ----------------------------------------------------------------

test('a tier is one below the DEEPEST parent, not below the container', () => {
    // The rule that makes the geometry mean something: emergence can never be drawn
    // above something that feeds it. Walking down from the root would have put
    // consciousness at tier 1, level with the axioms it emerged from.
    const g = fractiverse();
    assert.equal(tier(g, 'fractiverse'), 0);
    assert.equal(tier(g, 'axiom-i'), 1);
    assert.equal(tier(g, 'consciousness'), 2);
    assert.equal(tier(g, 'qualia'), 3);
});

test('a deep contributor pushes an emergent node below it', () => {
    const g = graph([
        ['root', null],
        ['shallow', 'root'],
        ['mid', 'root'],
        ['deep', 'mid'],
        ['deeper', 'deep'],
        ['emergent', 'root'],       // contained at tier 1
    ]);
    g.addEmergence('emergent', 'shallow');
    assert.equal(tier(g, 'emergent'), 2);

    g.addEmergence('emergent', 'deeper');   // tier 3
    assert.equal(tier(g, 'emergent'), 4, 'it must sit below its deepest contributor');
});

test('tiers of everything downstream move with it', () => {
    const g = graph([
        ['root', null], ['a', 'root'], ['deep', 'a'], ['deeper', 'deep'],
        ['emergent', 'root'], ['child', 'emergent'], ['grandchild', 'child'],
    ]);
    assert.equal(tier(g, 'grandchild'), 3);

    g.addEmergence('emergent', 'deeper');
    assert.equal(tier(g, 'emergent'), 4);
    assert.equal(tier(g, 'child'), 5);
    assert.equal(tier(g, 'grandchild'), 6);
});

test('removing a contributor lets the tiers rise again', () => {
    const g = graph([
        ['root', null], ['a', 'root'], ['deep', 'a'], ['emergent', 'root'], ['child', 'emergent'],
    ]);
    g.addEmergence('emergent', 'deep');
    assert.equal(tier(g, 'emergent'), 3);

    assert.equal(g.removeEmergence('emergent', 'deep'), true);
    assert.equal(tier(g, 'emergent'), 1);
    assert.equal(tier(g, 'child'), 2);
});

test('the depth index agrees with every node after a recompute', () => {
    const g = fractiverse();
    for (const node of g.nodes.values()) {
        assert.ok(g.depthIndex.get(node.depth)?.has(node.id),
            `${node.id} is at tier ${node.depth} but not indexed there`);
    }
    // And nothing is indexed at a tier it does not occupy.
    for (const [depth, ids] of g.depthIndex) {
        for (const id of ids) assert.equal(g.getNode(id).depth, depth);
    }
});

test('the tier invariant holds: every parent is strictly above its child', () => {
    const g = fractiverse();
    for (const node of g.nodes.values()) {
        for (const parentId of g.getAllParentIds(node.id)) {
            assert.ok(g.getNode(parentId).depth < node.depth,
                `${parentId} (tier ${g.getNode(parentId).depth}) must be above `
                + `${node.id} (tier ${node.depth})`);
        }
    }
});

// --- cycles ---------------------------------------------------------------

test('emergence from a descendant is refused', () => {
    const g = graph([['root', null], ['a', 'root'], ['b', 'a']]);
    assert.equal(g.addEmergence('a', 'b'), false, 'a cannot emerge from its own child');
    assert.deepEqual(g.getNode('a').emergesFrom, []);
});

test('emergence from itself is refused', () => {
    const g = graph([['root', null], ['a', 'root']]);
    assert.equal(g.addEmergence('a', 'a'), false);
});

test('a loop that closes through an emergence edge is refused', () => {
    // The case childIds cannot see, and the reason wouldCreateCycle exists:
    // c emerges from d, so making d a descendant of c would close a loop that runs
    // out through an emergence edge and back through containment.
    const g = graph([['root', null], ['a', 'root'], ['b', 'root'], ['c', 'a'], ['d', 'b']]);
    assert.equal(g.addEmergence('c', 'd'), true);

    assert.equal(g.setParent('d', 'c'), false, 'reparenting must see the emergence edge');
    assert.equal(g.addEmergence('d', 'c'), false, 'nor may the reverse edge be added');
});

test('a longer loop through two emergence edges is refused', () => {
    const g = graph([['root', null], ['a', 'root'], ['b', 'root'], ['c', 'root']]);
    assert.equal(g.addEmergence('b', 'a'), true);
    assert.equal(g.addEmergence('c', 'b'), true);
    assert.equal(g.addEmergence('a', 'c'), false, 'a <- c would close a -> b -> c -> a');
});

test('naming the containing parent as a contributor is refused', () => {
    // Already recorded. Stating it twice would count it twice in the convergence
    // degree, moving the node toward the axis for no reason.
    const g = graph([['root', null], ['a', 'root']]);
    assert.equal(g.addEmergence('a', 'root'), false);
    assert.equal(g.getConvergenceDegree('a'), 1);
});

test('the same contributor cannot be added twice', () => {
    const g = graph([['root', null], ['a', 'root'], ['b', 'root']]);
    assert.equal(g.addEmergence('a', 'b'), true);
    assert.equal(g.addEmergence('a', 'b'), false);
    assert.equal(g.getNode('a').emergesFrom.length, 1);
});

test('a cycle in imported data is reported rather than hung on', () => {
    // The mutators refuse to build one, but a file or a hand-edited row can contain
    // one, and hanging is not an acceptable response to bad data.
    const g = new NodeGraph();
    for (const id of ['x', 'y']) g.nodes.set(id, new NodeData(id, 0, { label: id }));
    g.nodes.get('x').emergesFrom = ['y'];
    g.nodes.get('y').emergesFrom = ['x'];

    const unplaced = g.recomputeTiers();
    assert.deepEqual(unplaced.sort(), ['x', 'y']);
    // Left at tier 0 rather than left undefined, so the renderer has a number.
    assert.equal(g.getNode('x').depth, 0);
});

// --- deletion -------------------------------------------------------------

test('deleting a contributor removes the reference to it', () => {
    // A dangling emergesFrom is worse than it looks: the tier computation skips it,
    // so the node keeps a tier it no longer earns, and the API refuses to save at all.
    const g = fractiverse();
    g.removeNode('axiom-i', { strategy: 'cascade' });

    assert.equal(g.getNode('consciousness').emergesFrom.includes('axiom-i'), false);
    for (const node of g.nodes.values()) {
        for (const id of node.emergesFrom) {
            assert.ok(g.nodes.has(id), `${node.id} still references deleted ${id}`);
        }
    }
});

test('deleting a container does not delete what merely emerged from it', () => {
    // Consciousness draws on Duality as one of four streams; it is not inside it and
    // must survive it.
    const g = graph([['root', null], ['duality', 'root'], ['consciousness', 'root']]);
    g.addEmergence('consciousness', 'duality');

    g.removeNode('duality', { strategy: 'cascade' });
    assert.ok(g.getNode('consciousness'), 'consciousness must survive');
    assert.deepEqual(g.getNode('consciousness').emergesFrom, []);
});

test('deleting an emergent node leaves its contributors untouched', () => {
    const g = fractiverse();
    g.removeNode('consciousness', { strategy: 'cascade' });

    assert.ok(g.getNode('axiom-i'));
    assert.deepEqual(g.getEmergentChildren('axiom-i'), []);
    assert.equal(g.getNode('qualia'), undefined, 'its containment children go with it');
});

// --- serialisation --------------------------------------------------------

test('emergence survives a JSON round trip', () => {
    const g = fractiverse();
    const json = JSON.parse(JSON.stringify([...g.nodes.values()].map((n) => n.toJSON())));

    const restored = new NodeGraph();
    for (const data of json) restored.nodes.set(data.id, NodeData.fromJSON(data));
    restored.rebuildIndices();

    assert.deepEqual(restored.getNode('consciousness').emergesFrom,
        ['axiom-i', 'axiom-ii', 'axiom-iii', 'axiom-iv']);
    assert.equal(tier(restored, 'consciousness'), 2);
    assert.deepEqual(restored.getEmergentChildren('axiom-ii').map((n) => n.id), ['consciousness']);
});

test('a node with no contributors carries no emergesFrom key', () => {
    // An empty array on every node is bytes in every export and every database row,
    // and most nodes of a large map converge from nothing.
    const g = fractiverse();
    assert.equal('emergesFrom' in g.getNode('qualia').toJSON(), false);
    assert.equal('emergesFrom' in g.getNode('consciousness').toJSON(), true);
});

test('a graph with no emergence behaves exactly as before', () => {
    // The change is additive: an existing map must be unaffected by any of it.
    const g = graph([['root', null], ['a', 'root'], ['b', 'a'], ['c', 'b']]);
    assert.deepEqual([tier(g, 'root'), tier(g, 'a'), tier(g, 'b'), tier(g, 'c')], [0, 1, 2, 3]);
    for (const node of g.nodes.values()) assert.deepEqual(node.emergesFrom, []);
});
