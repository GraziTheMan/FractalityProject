// tests/graphEditing.test.js
//
// The Node Manager edits the real structure of a mind map, so a bug here does
// not throw — it silently corrupts the map the user then saves to Neo4j.
//
// Two invariants are asserted after almost every operation, because both are
// easy to break and neither is visible from the UI:
//
//   * depth IS the tier, so every node's depth must equal its parent's + 1
//   * childIds, parentId, childIndex and depthIndex must all agree

import test from 'node:test';
import assert from 'node:assert/strict';

import { NodeData, NodeGraph } from '../src/data/NodeData.js';

/**
 *   root
 *   ├── a
 *   │   ├── a1
 *   │   └── a2
 *   └── b
 *       └── b1
 */
function makeGraph() {
    const graph = new NodeGraph();
    const add = (id, parentId, depth) => {
        const node = new NodeData(id, depth, { label: id });
        node.parentId = parentId;
        graph.nodes.set(id, node);
        return node;
    };

    add('root', null, 0);
    add('a', 'root', 1);
    add('b', 'root', 1);
    add('a1', 'a', 2);
    add('a2', 'a', 2);
    add('b1', 'b', 2);

    graph.nodes.get('root').childIds = ['a', 'b'];
    graph.nodes.get('a').childIds = ['a1', 'a2'];
    graph.nodes.get('b').childIds = ['b1'];
    graph.rebuildIndices();
    return graph;
}

/** Every structural invariant, checked at once. */
function assertConsistent(graph, context = '') {
    const where = context ? ` (${context})` : '';

    for (const node of graph.nodes.values()) {
        // parentId must point at a real node, or be null.
        if (node.parentId !== null) {
            const parent = graph.nodes.get(node.parentId);
            assert.ok(parent, `${node.id} has a dangling parentId ${node.parentId}${where}`);
            assert.ok(
                parent.childIds.includes(node.id),
                `${node.id} claims ${parent.id} as parent but is not in its childIds${where}`
            );
            assert.equal(
                node.depth, parent.depth + 1,
                `${node.id} is at tier ${node.depth} under a tier-${parent.depth} parent${where}`
            );
        } else {
            assert.equal(node.depth, 0, `root ${node.id} is not at tier 0${where}`);
        }

        // childIds must point at real nodes that agree about their parent.
        for (const childId of node.childIds) {
            const child = graph.nodes.get(childId);
            assert.ok(child, `${node.id} lists missing child ${childId}${where}`);
            assert.equal(
                child.parentId, node.id,
                `${childId} is listed under ${node.id} but claims parent ${child.parentId}${where}`
            );
        }
        assert.equal(
            new Set(node.childIds).size, node.childIds.length,
            `${node.id} lists a child twice${where}`
        );

        // depthIndex must contain the node at its current depth and nowhere else.
        for (const [depth, ids] of graph.depthIndex) {
            if (depth === node.depth) {
                assert.ok(ids.has(node.id), `depthIndex[${depth}] is missing ${node.id}${where}`);
            } else {
                assert.ok(!ids.has(node.id), `depthIndex[${depth}] still holds ${node.id}${where}`);
            }
        }
    }

    // No node may be its own ancestor.
    for (const node of graph.nodes.values()) {
        assert.ok(
            !graph.getDescendantIds(node.id).includes(node.id),
            `${node.id} is its own descendant — the graph has a cycle${where}`
        );
    }
}

test('the fixture starts consistent', () => {
    assertConsistent(makeGraph(), 'fixture');
});

test('getChildren returns children in order, not index order', () => {
    const graph = makeGraph();
    assert.deepEqual(graph.getChildren('a').map(n => n.id), ['a1', 'a2']);

    graph.moveWithinSiblings('a2', -1);
    assert.deepEqual(
        graph.getChildren('a').map(n => n.id), ['a2', 'a1'],
        'reordering must be visible through getChildren, or an outline cannot be reordered'
    );
});

test('createNode attaches at the right tier', () => {
    const graph = makeGraph();
    const node = graph.createNode({ parentId: 'a1', label: 'deep' });

    assert.ok(node);
    assert.equal(node.depth, 3, 'a child of a tier-2 node belongs at tier 3');
    assert.equal(node.parentId, 'a1');
    assert.deepEqual(graph.nodes.get('a1').childIds, [node.id]);
    assertConsistent(graph, 'after createNode');
});

test('createNode honours an explicit position among siblings', () => {
    const graph = makeGraph();
    const node = graph.createNode({ parentId: 'a', label: 'first', index: 0 });
    assert.deepEqual(graph.nodes.get('a').childIds, [node.id, 'a1', 'a2']);
    assertConsistent(graph);
});

test('createNode refuses a parent that does not exist', () => {
    const graph = makeGraph();
    assert.equal(graph.createNode({ parentId: 'nope' }), null);
    assert.equal(graph.nodes.size, 6, 'nothing should have been added');
});

test('generateNodeId never collides', () => {
    const graph = makeGraph();
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
        const node = graph.createNode({ parentId: 'root' });
        assert.ok(!ids.has(node.id), `${node.id} was issued twice`);
        ids.add(node.id);
    }
    assert.equal(graph.nodes.size, 56);
    assertConsistent(graph, 'after 50 creates');
});

test('removeNode cascades by default', () => {
    const graph = makeGraph();
    const removed = graph.removeNode('a');

    assert.deepEqual(removed.sort(), ['a', 'a1', 'a2']);
    assert.equal(graph.nodes.has('a1'), false, 'a descendant survived a cascade delete');
    assert.deepEqual(graph.nodes.get('root').childIds, ['b']);
    assertConsistent(graph, 'after cascade delete');
});

test('removeNode with promote keeps the children and renumbers them', () => {
    const graph = makeGraph();
    const removed = graph.removeNode('a', { strategy: 'promote' });

    assert.deepEqual(removed, ['a']);
    assert.equal(graph.nodes.has('a1'), true);
    // a1 and a2 were at tier 2 under a; with a gone they sit under root at 1.
    assert.equal(graph.nodes.get('a1').depth, 1);
    assert.equal(graph.nodes.get('a1').parentId, 'root');
    // Spliced into a's old position, ahead of b, so reading order survives.
    assert.deepEqual(graph.nodes.get('root').childIds, ['a1', 'a2', 'b']);
    assertConsistent(graph, 'after promote delete');
});

test('removeNode on a missing node is a no-op', () => {
    const graph = makeGraph();
    assert.deepEqual(graph.removeNode('ghost'), []);
    assert.equal(graph.nodes.size, 6);
});

test('setParent renumbers the whole moved subtree', () => {
    const graph = makeGraph();
    // Move `a` (tier 1, with two tier-2 children) under `b1` (tier 2).
    assert.equal(graph.setParent('a', 'b1'), true);

    assert.equal(graph.nodes.get('a').depth, 3);
    assert.equal(graph.nodes.get('a1').depth, 4, 'descendants must be renumbered too');
    assert.equal(graph.nodes.get('a2').depth, 4);
    assertConsistent(graph, 'after deep reparent');
});

test('setParent refuses to create a cycle', () => {
    const graph = makeGraph();

    // Into its own child, and into a deeper descendant.
    assert.equal(graph.setParent('a', 'a1'), false);
    assert.equal(graph.setParent('root', 'a2'), false);
    // And into itself.
    assert.equal(graph.setParent('a', 'a'), false);

    assert.equal(graph.nodes.get('a').parentId, 'root', 'a rejected move must change nothing');
    assertConsistent(graph, 'after rejected cycles');
});

test('setParent(null) makes a node a root at tier 0', () => {
    const graph = makeGraph();
    assert.equal(graph.setParent('a', null), true);

    assert.equal(graph.nodes.get('a').parentId, null);
    assert.equal(graph.nodes.get('a').depth, 0);
    assert.equal(graph.nodes.get('a1').depth, 1);
    assert.deepEqual(graph.nodes.get('root').childIds, ['b']);
    assertConsistent(graph, 'after promotion to root');
});

test('promote moves a node up a tier, just after its old parent', () => {
    const graph = makeGraph();
    assert.equal(graph.promote('a1'), true);

    assert.equal(graph.nodes.get('a1').parentId, 'root');
    assert.equal(graph.nodes.get('a1').depth, 1);
    // Directly after `a`, so the outline still reads in the same order.
    assert.deepEqual(graph.nodes.get('root').childIds, ['a', 'a1', 'b']);
    assertConsistent(graph, 'after promote');
});

test('promote refuses at tier 0', () => {
    const graph = makeGraph();
    assert.equal(graph.promote('root'), false);
    assertConsistent(graph);
});

test('demote moves a node into the sibling above it', () => {
    const graph = makeGraph();
    assert.equal(graph.demote('a2'), true);

    assert.equal(graph.nodes.get('a2').parentId, 'a1');
    assert.equal(graph.nodes.get('a2').depth, 3);
    assert.deepEqual(graph.nodes.get('a').childIds, ['a1']);
    assertConsistent(graph, 'after demote');
});

test('demote refuses for the first child, which has no sibling above it', () => {
    const graph = makeGraph();
    // Using the FOLLOWING sibling instead would silently reorder the outline.
    assert.equal(graph.demote('a1'), false);
    assert.equal(graph.demote('root'), false, 'a root has no siblings to move into');
    assertConsistent(graph);
});

test('moveWithinSiblings stops at both ends', () => {
    const graph = makeGraph();
    assert.equal(graph.moveWithinSiblings('a1', -1), false, 'already first');
    assert.equal(graph.moveWithinSiblings('a2', 1), false, 'already last');
    assert.equal(graph.moveWithinSiblings('a1', 1), true);
    assert.deepEqual(graph.nodes.get('a').childIds, ['a2', 'a1']);
    assertConsistent(graph);
});

test('siblingIds stay current through edits', () => {
    const graph = makeGraph();
    assert.deepEqual(graph.nodes.get('a1').siblingIds, ['a2']);

    graph.createNode({ parentId: 'a', label: 'a3' });
    assert.equal(graph.nodes.get('a1').siblingIds.length, 2);

    graph.removeNode('a2');
    assert.equal(graph.nodes.get('a1').siblingIds.length, 1);
});

test('depth stays a valid tier through a long chain of edits', () => {
    // A sequence a user could plausibly perform, checked after every step.
    const graph = makeGraph();
    const steps = [
        () => graph.createNode({ parentId: 'b1', label: 'c' }),
        () => graph.demote('a2'),
        () => graph.promote('a1'),
        () => graph.setParent('b', 'a1'),
        () => graph.moveWithinSiblings('a', 1),
        () => graph.removeNode('a1', { strategy: 'promote' }),
        () => graph.setParent('a', null),
        () => graph.removeNode('root', { strategy: 'promote' }),
    ];

    steps.forEach((step, i) => {
        step();
        assertConsistent(graph, `step ${i + 1}`);
    });

    assert.ok(graph.nodes.size > 0, 'the graph should not have emptied itself');
});

test('getDescendantIds terminates on a hand-made cycle', () => {
    // Imported or hand-edited data can describe a loop. This must not hang.
    const graph = makeGraph();
    graph.nodes.get('a1').childIds = ['a'];
    graph.nodes.get('a').parentId = 'a1';

    const descendants = graph.getDescendantIds('a');
    assert.ok(Array.isArray(descendants));
    assert.ok(descendants.length <= graph.nodes.size);
});

test('updateStats reports 0 depth for an empty graph, not -Infinity', () => {
    const graph = new NodeGraph();
    graph.updateStats();
    assert.equal(graph.stats.maxDepth, 0);
    assert.equal(graph.stats.totalNodes, 0);
});

test('rebuildIndices repairs depths set wrongly by an import', () => {
    const graph = makeGraph();
    // Simulate a payload whose depths do not match its parent links.
    graph.nodes.get('a').depth = 7;
    graph.nodes.get('a1').depth = 7;

    graph.rebuildIndices();

    assert.equal(graph.nodes.get('a').depth, 1);
    assert.equal(graph.nodes.get('a1').depth, 2);
    assertConsistent(graph, 'after rebuildIndices');
});

// --- the data sources themselves -------------------------------------------

test('every TestDataGenerator pattern agrees with its own parent links', async () => {
    // The default map shipped with 15 of its 36 nodes at the same depth as their
    // parent: generateGoldenSpiral() reassigned its `parent` variable inside the
    // loop still creating that level's children, so every later child of a level
    // was attached to its own sibling while keeping the level's depth. depth IS
    // the tier, so that made tier numbers, the cone view's rings and the family
    // layout wrong together — and nothing noticed, because nothing checked.
    const { TestDataGenerator } = await import('../src/data/TestDataGenerator.js');

    // Named explicitly, and NOT wrapped in a try/catch. An earlier version of
    // this test called a `generate()` method that does not exist and swallowed
    // the error, so it passed while asserting nothing at all.
    const patterns = {
        goldenSpiral: (g) => g.generateGoldenSpiral({ branches: 5, levelsPerBranch: 4 }),
        balancedTree: (g) => g.generateBalancedTree(),
        organic: (g) => g.generateOrganic(),
        simple: (g) => g.generateTestPattern('simple'),
    };

    for (const [name, build] of Object.entries(patterns)) {
        const graph = build(new TestDataGenerator());
        assert.ok(graph?.nodes?.size > 0, `${name} produced an empty graph`);

        const wrong = [];
        for (const node of graph.nodes.values()) {
            if (!node.parentId) {
                if (node.depth !== 0) wrong.push(`${node.id}: root at depth ${node.depth}`);
                continue;
            }
            const parent = graph.nodes.get(node.parentId);
            if (!parent) {
                wrong.push(`${node.id}: parent ${node.parentId} is missing`);
            } else if (node.depth !== parent.depth + 1) {
                wrong.push(`${node.id}: depth ${node.depth} under ${parent.id} at ${parent.depth}`);
            }
        }

        assert.deepEqual(
            wrong.slice(0, 5), [],
            `${name} produced ${wrong.length} node(s) whose depth disagrees with its parent`
        );
    }
});

test('rebuildIndices is enough to repair any graph, whatever produced it', () => {
    // loadData() calls this on every graph precisely so consumers can rely on
    // depth being the tier without each of them re-deriving it.
    const graph = makeGraph();
    for (const node of graph.nodes.values()) node.depth = 99;

    graph.rebuildIndices();

    assert.equal(graph.nodes.get('root').depth, 0);
    assert.equal(graph.nodes.get('a').depth, 1);
    assert.equal(graph.nodes.get('a1').depth, 2);
    assertConsistent(graph, 'after repairing depths');
});
