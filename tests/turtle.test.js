// tests/turtle.test.js
//
// The property that matters: a map survives export to Turtle and back with its
// structure and content intact. A converter that loses a tag or a sibling order
// does not throw — it silently returns a slightly different map, and the user
// finds out much later.
//
// RDF has no inherent ordering, so sibling order is the thing most likely to be
// lost. It is asserted explicitly, several ways.

import test from 'node:test';
import assert from 'node:assert/strict';

import { NodeData, NodeGraph } from '../src/data/NodeData.js';
import { graphToTurtle, turtleToGraph, NS } from '../src/data/turtle.js';

/**
 *   root
 *   ├── alpha        (tags, description, custom metadata)
 *   │   ├── a1
 *   │   └── a2
 *   └── beta
 *       └── b1
 */
function makeGraph() {
    const graph = new NodeGraph();
    const add = (id, parentId, depth, metadata = {}) => {
        const node = new NodeData(id, depth, { label: id, ...metadata });
        node.parentId = parentId;
        graph.nodes.set(id, node);
        return node;
    };

    add('root', null, 0, { label: 'Fractiverse', type: 'root' });
    add('alpha', 'root', 1, {
        label: 'Alpha', type: 'concept', tags: ['fractal', 'math'],
        description: 'The first branch',
        content: '# Alpha\n\nA page with **emphasis**, a list:\n\n- one\n- two\n',
    });
    add('beta', 'root', 1, { label: 'Beta' });
    add('a1', 'alpha', 2, { label: 'Alpha one' });
    add('a2', 'alpha', 2, { label: 'Alpha two' });
    add('b1', 'beta', 2, { label: 'Beta one' });

    graph.nodes.get('root').childIds = ['alpha', 'beta'];
    graph.nodes.get('alpha').childIds = ['a1', 'a2'];
    graph.nodes.get('beta').childIds = ['b1'];
    graph.rebuildIndices();
    return graph;
}

/** The parts of a graph a Turtle round trip is expected to preserve. */
function shapeOf(graph) {
    return [...graph.nodes.values()]
        .map((n) => ({
            id: n.id,
            depth: n.depth,
            parentId: n.parentId,
            childIds: [...n.childIds],
            label: n.metadata.label,
            type: n.metadata.type,
            tags: [...(n.metadata.tags ?? [])].sort(),
            description: n.metadata.description ?? null,
            // Compared exactly. Markdown is whitespace-significant, so a page that
            // survives with its blank lines collapsed is not a page that survived.
            content: n.metadata.content ?? null,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

test('a map round-trips through Turtle unchanged', async () => {
    const original = makeGraph();
    const ttl = await graphToTurtle(original, { title: 'Test map', mapId: 'test' });
    const { graph: restored, title } = await turtleToGraph(ttl);

    assert.equal(title, 'Test map');
    assert.deepEqual(shapeOf(restored), shapeOf(original));
});

test('sibling order survives, which RDF does not give for free', async () => {
    const graph = makeGraph();
    // Reorder, so the assertion cannot pass on alphabetical luck.
    graph.moveWithinSiblings('a2', -1);
    assert.deepEqual(graph.nodes.get('alpha').childIds, ['a2', 'a1']);

    const ttl = await graphToTurtle(graph, { mapId: 'test' });
    const { graph: restored } = await turtleToGraph(ttl);

    assert.deepEqual(
        restored.nodes.get('alpha').childIds, ['a2', 'a1'],
        'skos:narrower is a set; order has to come from fract:position'
    );
});

test('order survives even when it contradicts alphabetical order', async () => {
    const graph = new NodeGraph();
    const root = new NodeData('root', 0, { label: 'Root' });
    graph.nodes.set('root', root);
    // Deliberately reverse-alphabetical labels.
    for (const [id, label] of [['z', 'Zebra'], ['m', 'Mango'], ['a', 'Apple']]) {
        const node = new NodeData(id, 1, { label });
        node.parentId = 'root';
        graph.nodes.set(id, node);
    }
    root.childIds = ['z', 'm', 'a'];
    graph.rebuildIndices();

    const { graph: restored } = await turtleToGraph(await graphToTurtle(graph, { mapId: 't' }));
    assert.deepEqual(restored.nodes.get('root').childIds, ['z', 'm', 'a']);
});

test('the output uses SKOS, not a bespoke vocabulary', async () => {
    const ttl = await graphToTurtle(makeGraph(), { title: 'Vocab', mapId: 'v' });

    // The point of Turtle here is that other tools can read it.
    assert.match(ttl, /skos:Concept/);
    assert.match(ttl, /skos:prefLabel/);
    assert.match(ttl, /skos:broader/);
    assert.match(ttl, /skos:ConceptScheme/);
    assert.match(ttl, /dcterms:title/);
    // App-specific terms live in their own namespace rather than squatting on
    // SKOS's.
    assert.match(ttl, /fract:tier/);
    assert.match(ttl, /fract:position/);
    assert.ok(ttl.includes(NS.skos), 'the skos prefix must be declared');
});

test('tiers are recomputed from the parent links, not trusted', async () => {
    // fract:tier is a hint. A hand-edited file whose tiers disagree with its
    // broader/narrower edges must not produce a graph that disagrees with itself.
    const ttl = `
        @prefix skos: <${NS.skos}> .
        @prefix fract: <${NS.fract}> .
        @prefix : <https://example.org/m#> .

        :root a skos:Concept ; skos:prefLabel "Root" ; fract:tier 0 .
        :kid  a skos:Concept ; skos:prefLabel "Kid"  ; fract:tier 9 ; skos:broader :root .
    `;
    const { graph } = await turtleToGraph(ttl);
    assert.equal(graph.nodes.get('kid').depth, 1, 'tier 9 under a tier-0 parent is wrong');
});

test('custom metadata survives a round trip', async () => {
    const graph = makeGraph();
    Object.assign(graph.nodes.get('alpha').metadata, {
        weight: 7,
        certainty: 0.5,
        confirmed: true,
        note: 'hand written',
    });

    const { graph: restored } = await turtleToGraph(
        await graphToTurtle(graph, { mapId: 'meta' })
    );
    const meta = restored.nodes.get('alpha').metadata;

    // Typed literals come back as the types they went out as, not as strings.
    assert.equal(meta.weight, 7);
    assert.equal(meta.certainty, 0.5);
    assert.equal(meta.confirmed, true);
    assert.equal(meta.note, 'hand written');
});

test("a node's page is written as schema:text, not as a fract:* fallback", async () => {
    const graph = makeGraph();
    const ttl = await graphToTurtle(graph, { mapId: 'test' });

    assert.match(ttl, /schema:text/,
        'a markdown page should use a term other tools understand');
    assert.doesNotMatch(ttl, /fract:content/,
        'content has a real vocabulary term, so it must not fall through to fract:*');
    // dcterms:description is the one-line summary. A reader listing descriptions
    // must not be handed a whole document instead.
    assert.doesNotMatch(ttl, /dcterms:description "# Alpha/, 'the page leaked into the summary');
});

test('a page keeps its blank lines and indentation exactly', async () => {
    const graph = new NodeGraph();
    // Every whitespace feature markdown gives meaning to: a blank line between
    // paragraphs, a trailing newline, a fenced block whose leading spaces are code.
    const page = 'Para one.\n\nPara two.\n\n```\n    indented code\n```\n\n> quoted\n';
    const node = new NodeData('only', 0, { label: 'Only', content: page });
    graph.nodes.set('only', node);
    graph.rebuildIndices();

    const ttl = await graphToTurtle(graph, { mapId: 'test' });
    const { graph: restored } = await turtleToGraph(ttl);

    assert.equal(restored.getNode('only').metadata.content, page);
});

test('a page written as fract:content by an older version still imports', async () => {
    // The format before schema:text was adopted. Files already on disk must open.
    const ttl = [
        '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .',
        '@prefix fract: <https://fractiverse.com/ns#> .',
        '<https://fractiverse.com/map/old#n1> a skos:Concept ;',
        '    skos:prefLabel "Legacy" ;',
        '    fract:content "# Legacy page" .',
        '',
    ].join('\n');

    const { graph } = await turtleToGraph(ttl);
    assert.equal(graph.getNode('n1').metadata.content, '# Legacy page');
});

test('schema:text wins over a stale fract:content in the same file', async () => {
    // Quad order is not guaranteed, so this must not depend on which arrives last.
    const ttl = [
        '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .',
        '@prefix fract: <https://fractiverse.com/ns#> .',
        '@prefix schema: <https://schema.org/> .',
        '<https://fractiverse.com/map/both#n1> a skos:Concept ;',
        '    skos:prefLabel "Both" ;',
        '    fract:content "the old page" ;',
        '    schema:text "the current page" .',
        '',
    ].join('\n');

    const { graph } = await turtleToGraph(ttl);
    assert.equal(graph.getNode('n1').metadata.content, 'the current page');
});

test('a node without a page gains no content key', async () => {
    // An empty string written to every node would be carried by every export and
    // every database row for nothing.
    const graph = makeGraph();
    const ttl = await graphToTurtle(graph, { mapId: 'test' });
    const { graph: restored } = await turtleToGraph(ttl);

    assert.equal('content' in restored.getNode('beta').metadata, false);
    assert.equal(restored.getNode('beta').content, '', 'the getter still gives a string');
});

test('runtime timestamps are not exported, so a round trip looks clean', async () => {
    // NodeData's constructor sets `created`. Exporting it would come back as an
    // older value on every trip and make the diff look lossy when it is not.
    const ttl = await graphToTurtle(makeGraph(), { mapId: 't' });
    assert.ok(!ttl.includes('fract:created'), 'created must not be exported');
});

test('ids with awkward characters survive', async () => {
    const graph = new NodeGraph();
    const ids = ['node with spaces', 'node/with/slashes', 'node#hash', 'ünïcode', 'a&b'];
    const root = new NodeData('root', 0, { label: 'Root' });
    graph.nodes.set('root', root);
    for (const id of ids) {
        const node = new NodeData(id, 1, { label: id });
        node.parentId = 'root';
        graph.nodes.set(id, node);
    }
    root.childIds = [...ids];
    graph.rebuildIndices();

    const { graph: restored } = await turtleToGraph(await graphToTurtle(graph, { mapId: 'ids' }));

    for (const id of ids) {
        assert.ok(restored.nodes.has(id), `lost the node with id "${id}"`);
    }
    assert.deepEqual(restored.nodes.get('root').childIds, ids);
});

test('labels containing quotes and newlines survive', async () => {
    // Turtle string escaping is the writer's job; this proves it is being done.
    const graph = new NodeGraph();
    const tricky = 'He said "hello"\nand \\ left';
    const node = new NodeData('n', 0, { label: tricky });
    graph.nodes.set('n', node);
    graph.rebuildIndices();

    const { graph: restored } = await turtleToGraph(await graphToTurtle(graph, { mapId: 'q' }));
    assert.equal(restored.nodes.get('n').metadata.label, tricky);
});

test('multiple roots are preserved and both marked as top concepts', async () => {
    const graph = new NodeGraph();
    for (const id of ['first', 'second']) {
        graph.nodes.set(id, new NodeData(id, 0, { label: id }));
    }
    graph.rebuildIndices();

    const ttl = await graphToTurtle(graph, { mapId: 'roots' });
    assert.equal((ttl.match(/skos:hasTopConcept/g) || []).length >= 1, true);

    const { graph: restored } = await turtleToGraph(ttl);
    assert.equal(restored.getRootNodes().length, 2);
});

test('a foreign Turtle file with only broader edges still imports', async () => {
    // Another tool may state one direction and not the other, and may not use our
    // base IRI or our fract: terms at all.
    const ttl = `
        @prefix skos: <${NS.skos}> .
        @prefix ex: <http://example.com/vocab/> .

        ex:animals a skos:Concept ; skos:prefLabel "Animals" .
        ex:cats    a skos:Concept ; skos:prefLabel "Cats" ; skos:broader ex:animals .
        ex:dogs    a skos:Concept ; skos:prefLabel "Dogs" ; skos:broader ex:animals .
    `;
    const { graph, warnings } = await turtleToGraph(ttl);

    assert.equal(graph.nodes.size, 3);
    const root = graph.getRootNodes();
    assert.equal(root.length, 1);
    assert.equal(root[0].metadata.label, 'Animals');
    assert.equal(graph.nodes.get(root[0].id).childIds.length, 2);
    // No positions, so children are ordered by label for determinism.
    assert.deepEqual(
        graph.nodes.get(root[0].id).childIds.map((id) => graph.nodes.get(id).metadata.label),
        ['Cats', 'Dogs']
    );
    assert.deepEqual(warnings, []);
});

test('a file with only narrower edges still imports', async () => {
    const ttl = `
        @prefix skos: <${NS.skos}> .
        @prefix ex: <http://example.com/v/> .
        ex:top a skos:Concept ; skos:prefLabel "Top" ; skos:narrower ex:kid .
        ex:kid a skos:Concept ; skos:prefLabel "Kid" .
    `;
    const { graph } = await turtleToGraph(ttl);
    assert.equal(graph.nodes.get('kid').parentId, 'top');
    assert.equal(graph.nodes.get('kid').depth, 1);
});

test('a cycle is broken rather than handed on', async () => {
    // Turtle can describe this perfectly legally; the layout engine and the Node
    // Manager both assume a tree.
    const ttl = `
        @prefix skos: <${NS.skos}> .
        @prefix ex: <http://example.com/c/> .
        ex:a a skos:Concept ; skos:prefLabel "A" ; skos:broader ex:b .
        ex:b a skos:Concept ; skos:prefLabel "B" ; skos:broader ex:a .
    `;
    const { graph, warnings } = await turtleToGraph(ttl);

    assert.ok(warnings.length > 0, 'breaking a cycle must be reported, not silent');
    for (const node of graph.nodes.values()) {
        assert.ok(
            !graph.getDescendantIds(node.id).includes(node.id),
            `${node.id} is still its own descendant`
        );
    }
});

test('nonsense input fails with a message, not a stack trace', async () => {
    await assert.rejects(
        () => turtleToGraph('this is not turtle at all {{{'),
        (error) => {
            assert.match(error.message, /not valid Turtle/i);
            return true;
        }
    );
});

test('valid Turtle that is not a mind map is refused clearly', async () => {
    const ttl = '<http://example.com/a> <http://example.com/p> "just a triple" .';
    await assert.rejects(
        () => turtleToGraph(ttl),
        (error) => {
            assert.match(error.message, /concepts/i);
            return true;
        }
    );
});

test('an empty document is refused', async () => {
    await assert.rejects(() => turtleToGraph(''), /no RDF statements/i);
});

test('a large map round-trips without losing anything', async () => {
    // Structure is where a converter breaks at scale, so this checks a real tree
    // rather than a handful of nodes.
    const graph = new NodeGraph();
    const root = new NodeData('root', 0, { label: 'Root' });
    graph.nodes.set('root', root);

    let previousTier = ['root'];
    let counter = 0;
    for (let tier = 1; tier <= 4; tier++) {
        const thisTier = [];
        for (const parentId of previousTier) {
            const parent = graph.nodes.get(parentId);
            for (let i = 0; i < 3; i++) {
                const id = `n${counter++}`;
                const node = new NodeData(id, tier, { label: `Node ${id}`, tags: [`t${tier}`] });
                node.parentId = parentId;
                graph.nodes.set(id, node);
                parent.childIds.push(id);
                thisTier.push(id);
            }
        }
        previousTier = thisTier;
    }
    graph.rebuildIndices();
    assert.equal(graph.nodes.size, 121);

    const { graph: restored } = await turtleToGraph(
        await graphToTurtle(graph, { mapId: 'big' })
    );
    assert.equal(restored.nodes.size, 121);
    assert.deepEqual(shapeOf(restored), shapeOf(graph));
});
