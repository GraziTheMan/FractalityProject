// tests/ecs.test.js
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { ECS, Entity } from '../src/ecs/ECS.js';
import {
  PositionComponent,
  RenderableComponent,
  KnowledgeComponent,
  InputComponent
} from '../src/ecs/components.js';
import { InputSystem } from '../src/ecs/systems/InputSystem.js';
import { RenderSystem } from '../src/ecs/systems/RenderSystem.js';

test('ECS.js is side-effect free on import', () => {
  // It previously spawned a demo world and ran a frame at import time, which
  // is why importing it from main.js logged phantom entities.
  const ecs = new ECS();
  assert.equal(ecs.entities.length, 0);
  assert.equal(ecs.systems.length, 0);
});

test('createEntity assigns incrementing ids', () => {
  const ecs = new ECS();
  const a = ecs.createEntity();
  const b = ecs.createEntity();

  assert.ok(a instanceof Entity);
  assert.equal(a.id, 0);
  assert.equal(b.id, 1);
  assert.equal(ecs.entities.length, 2);
});

test('entity component add/get/has/remove', () => {
  const ecs = new ECS();
  const e = ecs.createEntity();

  e.add('Position', PositionComponent(1, 2, 3));
  e.add('Knowledge', KnowledgeComponent('n1', 'ENTITY', 0.5));

  assert.deepEqual(e.get('Position'), { x: 1, y: 2, z: 3 });
  assert.equal(e.has('Position', 'Knowledge'), true);
  assert.equal(e.has('Position', 'Renderable'), false);

  assert.equal(e.remove('Knowledge'), true);
  assert.equal(e.has('Knowledge'), false);
});

test('query returns only entities with all named components', () => {
  const ecs = new ECS();

  const withBoth = ecs.createEntity();
  withBoth.add('Position', PositionComponent());
  withBoth.add('Renderable', RenderableComponent('a.glb'));

  const positionOnly = ecs.createEntity();
  positionOnly.add('Position', PositionComponent());

  const result = ecs.query('Position', 'Renderable');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, withBoth.id);
});

test('destroyEntity removes it from the world', () => {
  const ecs = new ECS();
  const e = ecs.createEntity();

  assert.equal(ecs.destroyEntity(e), true);
  assert.equal(ecs.entities.length, 0);
  assert.equal(ecs.destroyEntity(e), false);
});

test('InputSystem moves entities by elapsed time, not per frame', () => {
  // bindKeyboard:false keeps this runnable without a DOM
  const input = new InputSystem({ speed: 10, bindKeyboard: false });
  const ecs = new ECS();
  ecs.addSystem(input);

  const e = ecs.createEntity();
  e.add('Position', PositionComponent(0, 0, 0));
  e.add('Input', InputComponent());

  input.keys.add('left');

  // One half-second step must equal five tenth-of-a-second steps
  ecs.update(0.5);
  const afterOneBigStep = e.get('Position').x;

  e.get('Position').x = 0;
  for (let i = 0; i < 5; i++) ecs.update(0.1);

  assert.ok(Math.abs(afterOneBigStep - e.get('Position').x) < 1e-9);
  assert.equal(afterOneBigStep, -5);
});

test('InputSystem mirrors key state onto the component', () => {
  const input = new InputSystem({ bindKeyboard: false });
  const ecs = new ECS();
  ecs.addSystem(input);

  const e = ecs.createEntity();
  e.add('Position', PositionComponent());
  e.add('Input', InputComponent());

  input.keys.add('up');
  ecs.update(0.016);

  assert.equal(e.get('Input').up, true);
  assert.equal(e.get('Input').down, false);
});

test('RenderSystem forwards transforms to an adapter and skips hidden entities', () => {
  const seen = [];
  const render = new RenderSystem({ adapter: { updateEntity: (d) => seen.push(d) } });

  const ecs = new ECS();
  ecs.addSystem(render);

  const visible = ecs.createEntity();
  visible.add('Position', PositionComponent(1, 0, 0));
  visible.add('Renderable', RenderableComponent('visible.glb'));

  const hidden = ecs.createEntity();
  hidden.add('Position', PositionComponent(2, 0, 0));
  hidden.add('Renderable', RenderableComponent('hidden.glb', false));

  ecs.update(0.016);

  assert.equal(seen.length, 1);
  assert.equal(seen[0].model, 'visible.glb');
});

test('RenderSystem is a no-op without an adapter', () => {
  const ecs = new ECS();
  ecs.addSystem(new RenderSystem());

  const e = ecs.createEntity();
  e.add('Position', PositionComponent());
  e.add('Renderable', RenderableComponent('x.glb'));

  assert.doesNotThrow(() => ecs.update(0.016));
});
