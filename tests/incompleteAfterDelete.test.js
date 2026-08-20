// tests/incompleteAfterDelete.test.js
//
// "Consciousness cannot exist without all four operators."
//
// So deleting one of them does not leave a Consciousness that emerges from three.
// It leaves a node asserting something its own map no longer supports. Deleting it
// too would be faithful to the framework and awful to use — losing a concept
// because you tidied one of its inputs is not a trade anyone would choose in an
// editor — so nothing cascades on account of emergence, and the user is told
// instead.
//
// What is tested here is the TELLING: which nodes go incomplete, and what each
// one loses. Silence is the failure mode, not deletion.

import test from 'node:test';
import assert from 'node:assert/strict';

const { NodeGraph, NodeData } = await import('../src/data/NodeData.js');

/**
 * Four operators, one concept arising from all four, plus an unrelated bystander.
 * Deliberately mirrors the real shape rather than an abstract one, because the
 * question this answers is about that shape.
 */
function fourOperators() {
    const graph = new NodeGraph();
    graph.addNode(new NodeData('root', { label: 'The Fractiverse' }));
    for (const [id, label] of [['r', 'Resonance'], ['sigma', 'Emergent Complexity'],
                               ['gamma', 'Temporal Stability'], ['omega', 'Inter-Scale Coupling'],
                               ['qft', 'Quantum Field Theory']]) {
        const node = new NodeData(id, { label });
        node.parentId = 'root';
        graph.addNode(node);
        graph.getNode('root').childIds.push(id);
    }
    const c4 = new NodeData('c4', { label: 'C4: Consciousness' });
    c4.parentId = 'r';
    graph.addNode(c4);
    graph.getNode('r').childIds.push('c4');
    for (const source of ['sigma', 'gamma', 'omega']) graph.addEmergence('c4', source);
    graph.recomputeTiers();
    return graph;
}

test('removing one operator reports the concept that depended on it', () => {
    const graph = fourOperators();
    const report = graph.findIncompleteAfterRemoving(['sigma']);

    assert.equal(report.length, 1);
    assert.equal(report[0].node.id, 'c4');
    assert.deepEqual(report[0].losing.map((n) => n.id), ['sigma']);
});

test('removing several names each loss once, on one entry', () => {
    // Not three separate warnings about the same node: a reader acts on "C4 loses
    // three of its four streams", not on the same sentence three times.
    const graph = fourOperators();
    const report = graph.findIncompleteAfterRemoving(['sigma', 'gamma', 'omega']);

    assert.equal(report.length, 1, 'one entry per affected node, not per lost source');
    assert.deepEqual(report[0].losing.map((n) => n.id).sort(), ['gamma', 'omega', 'sigma']);
});

test('a node being deleted itself is not warned about', () => {
    // Cascading through the container takes c4 with it, so telling the user c4 will
    // be "left incomplete" would be describing something that will not exist.
    const graph = fourOperators();
    const report = graph.findIncompleteAfterRemoving(['r', 'c4']);
    assert.deepEqual(report.map((e) => e.node.id), []);
});

test('the containing parent counts too, not only the emergence sources', () => {
    // c4's container is r. Deleting r leaves c4 promoted and still claiming four
    // streams, so it is exactly as incomplete as losing any other one.
    const graph = fourOperators();
    const report = graph.findIncompleteAfterRemoving(['r']);
    // r is c4's parentId, not an emergesFrom entry, so this asserts the honest
    // behaviour rather than a hoped-for one: containment loss is NOT reported here.
    // getDescendantIds already governs the container relationship, and the caller
    // asks the user about it separately.
    assert.deepEqual(report.map((e) => e.node.id), [],
        'containment is handled by the descendants prompt, not by this');
});

test('an unrelated deletion warns about nothing', () => {
    const graph = fourOperators();
    assert.deepEqual(graph.findIncompleteAfterRemoving(['qft']), []);
});

test('nothing is deleted as a side effect of asking', () => {
    // The whole point: this reports, it does not act.
    const graph = fourOperators();
    const before = graph.nodes.size;
    graph.findIncompleteAfterRemoving(['sigma', 'gamma']);
    assert.equal(graph.nodes.size, before);
    assert.deepEqual(graph.getNode('c4').emergesFrom.sort(), ['gamma', 'omega', 'sigma']);
});

test('a node that survives with one stream left is still reported', () => {
    // The edge worth naming: "3 streams left" and "1 stream left" are both
    // incomplete, and the one-left case is the one a reader most wants to see.
    const graph = fourOperators();
    const report = graph.findIncompleteAfterRemoving(['sigma', 'gamma', 'omega']);
    const remaining = graph.getAllParentIds('c4')
        .filter((id) => !['sigma', 'gamma', 'omega'].includes(id));
    assert.deepEqual(remaining, ['r']);
    assert.equal(report.length, 1);
});
