// tests/layoutEngine.test.js
//
// Guards the property the dock's View group depends on: every layout it offers
// is really implemented.
//
// This is the exact failure the dock replaced. The old radial menu advertised
// nine destinations and eight of them had nothing behind them, so pressing one
// printed "Switched to: <name>" and nothing else happened. calculateLayout()
// has the same shape of trap built in — its switch falls through to 'family'
// for any unknown name, silently — and a now-deleted LayoutSwitcher.js offered
// an 'organicFlow' option that would have hit exactly that path.

import test from 'node:test';
import assert from 'node:assert/strict';

import { LayoutEngine } from '../src/intelligence/LayoutEngine.js';

/**
 * A small graph shaped the way LayoutEngine expects: one focus node with a
 * parent, two siblings and three children, so every branch of the family layout
 * has something to place.
 */
function makeNodes() {
    return [
        { id: 'root',  depth: 0, parentId: null,   childIds: ['focus', 'sib-a', 'sib-b'] },
        { id: 'focus', depth: 1, parentId: 'root', childIds: ['kid-a', 'kid-b', 'kid-c'] },
        { id: 'sib-a', depth: 1, parentId: 'root', childIds: [] },
        { id: 'sib-b', depth: 1, parentId: 'root', childIds: [] },
        { id: 'kid-a', depth: 2, parentId: 'focus', childIds: [] },
        { id: 'kid-b', depth: 2, parentId: 'focus', childIds: [] },
        { id: 'kid-c', depth: 2, parentId: 'focus', childIds: [] },
    ];
}

/** Positions as plain comparable numbers, so two layouts can be told apart. */
function fingerprint(positions) {
    return [...positions.entries()]
        .map(([id, v]) => `${id}:${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`)
        .sort()
        .join('|');
}

test('getAvailableLayouts lists the configured layouts', () => {
    const engine = new LayoutEngine();
    const available = engine.getAvailableLayouts();

    assert.ok(available.length >= 5, `expected several layouts, got ${available.length}`);
    // 'family' is the default and the switch's fallback, so it must be offered.
    assert.ok(available.includes('family'));
});

test('setActiveLayout accepts every advertised layout', () => {
    const engine = new LayoutEngine();
    for (const name of engine.getAvailableLayouts()) {
        assert.equal(engine.setActiveLayout(name), true, name);
        assert.equal(engine.activeLayout, name);
    }
});

test('setActiveLayout refuses an unimplemented layout and does not change state', () => {
    const engine = new LayoutEngine();
    engine.setActiveLayout('goldenSpiral');

    // 'organicFlow' is the real example: a deleted UI component offered it, and
    // calculateLayout() would have quietly drawn 'family' instead.
    assert.equal(engine.setActiveLayout('organicFlow'), false);
    assert.equal(engine.activeLayout, 'goldenSpiral', 'a rejected name must not take effect');

    for (const bogus of ['', 'FAMILY', 'toString', 'constructor', null, undefined]) {
        assert.equal(engine.setActiveLayout(bogus), false, String(bogus));
    }
    // 'toString' and 'constructor' exist on Object.prototype; hasOwnProperty is
    // why they are rejected rather than accepted as layouts.
    assert.equal(engine.activeLayout, 'goldenSpiral');
});

test('every advertised layout positions every node', () => {
    const engine = new LayoutEngine();
    const nodes = makeNodes();

    for (const name of engine.getAvailableLayouts()) {
        engine.setActiveLayout(name);
        const positions = engine.calculateLayout(nodes, 'focus');

        assert.equal(
            positions.size, nodes.length,
            `${name} positioned ${positions.size} of ${nodes.length} nodes`
        );
        for (const [id, v] of positions) {
            assert.ok(
                Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z),
                `${name} gave ${id} a non-finite position: ${v.x},${v.y},${v.z}`
            );
        }
    }
});

test('each layout produces a distinct arrangement', () => {
    // The point of the check: a menu entry that resolves to the same positions
    // as another is indistinguishable from one that does nothing. Without this,
    // adding a config block with no matching switch case would look fine — the
    // fallback would silently serve 'family' for it.
    const engine = new LayoutEngine();
    const nodes = makeNodes();
    const seen = new Map();

    for (const name of engine.getAvailableLayouts()) {
        engine.setActiveLayout(name);
        // The cache key includes the layout name, but clear it anyway so this
        // test cannot pass on a stale entry.
        engine.layoutCache.clear();
        const print = fingerprint(engine.calculateLayout(nodes, 'focus'));

        const clash = seen.get(print);
        assert.equal(
            clash, undefined,
            `${name} lays out identically to ${clash} — one of them is not implemented`
        );
        seen.set(print, name);
    }

    assert.equal(seen.size, engine.getAvailableLayouts().length);
});

test('an unknown layout cannot be reached through calculateLayout', () => {
    const engine = new LayoutEngine();
    const nodes = makeNodes();

    engine.setActiveLayout('cosmicWeb');
    const cosmic = fingerprint(engine.calculateLayout(nodes, 'focus'));

    // Assigning the field directly bypasses validation, which is what the switch
    // statement's silent fallback then covers up. Documented here so the
    // behaviour is known rather than discovered.
    engine.activeLayout = 'organicFlow';
    engine.layoutCache.clear();
    const bogus = fingerprint(engine.calculateLayout(nodes, 'focus'));

    engine.setActiveLayout('family');
    engine.layoutCache.clear();
    const family = fingerprint(engine.calculateLayout(nodes, 'focus'));

    assert.notEqual(bogus, cosmic);
    assert.equal(
        bogus, family,
        'unknown layouts fall through to family — which is why setActiveLayout validates'
    );
});
