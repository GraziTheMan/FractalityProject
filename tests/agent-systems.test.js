// tests/agent-systems.test.js
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { ExecutiveAgent } from '../core/agent_systems/ExecutiveAgent.js';
import { ReflectiveAgent } from '../core/agent_systems/ReflectiveAgent.js';
import { GenerativeAgent } from '../core/agent_systems/GenerativeAgent.js';
import { CACEEngine } from '../core/agent_systems/CACEEngine.js';
import { SharedConsciousContext } from '../core/agent_systems/SharedConsciousContext.js';
import { TriadicConsciousnessEngine } from '../core/agent_systems/TriadicConsciousnessEngine.js';

test('ExecutiveAgent consolidates when coherence collapses', () => {
  const agent = new ExecutiveAgent();
  const decision = agent.decide({ energy: 1, coherence: 0.1 }, { trustScore: 1 });

  assert.equal(decision.action, 'consolidate');
  assert.equal(decision.requiresCreativity, false);
});

test('ExecutiveAgent reassesses when reflection distrusts the last action', () => {
  const agent = new ExecutiveAgent();
  const decision = agent.decide({ energy: 1, coherence: 1 }, { trustScore: 0.05 });

  assert.equal(decision.action, 'reassess');
});

test('ExecutiveAgent maintains when energy is low but state is coherent', () => {
  const agent = new ExecutiveAgent();
  const decision = agent.decide({ energy: 0.05, coherence: 1 }, { trustScore: 1 });

  assert.equal(decision.action, 'maintain');
  assert.equal(decision.requiresCreativity, false);
});

test('ExecutiveAgent explores and invites creativity when resources allow', () => {
  const agent = new ExecutiveAgent();
  const decision = agent.decide(
    { energy: 1, coherence: 1, userIntent: 'Explore ideas' },
    { trustScore: 1 }
  );

  assert.equal(decision.action, 'explore');
  assert.equal(decision.requiresCreativity, true);
  assert.equal(decision.intent, 'Explore ideas');
});

test('ExecutiveAgent tolerates being called with no arguments', () => {
  const agent = new ExecutiveAgent();
  assert.doesNotThrow(() => agent.decide());
});

test('ExecutiveAgent feedback raises the bar after unproductive exploration', () => {
  const agent = new ExecutiveAgent();
  const before = agent.energyFloor;

  const decision = agent.decide({ energy: 1, coherence: 1 }, { trustScore: 1 });
  agent.feedback(decision, { creativityScore: 0.01 });

  assert.ok(agent.energyFloor > before);
});

test('ExecutiveAgent history is bounded', () => {
  const agent = new ExecutiveAgent({ maxLogSize: 3 });
  for (let i = 0; i < 10; i++) {
    agent.decide({ energy: 1, coherence: 1 }, { trustScore: 1 });
  }

  assert.equal(agent.decisionLog.length, 3);
  assert.equal(agent.getHistory(2).length, 2);
});

test('SharedConsciousContext records actions and flags', () => {
  const ctx = new SharedConsciousContext();

  ctx.storeAction({ action: 'explore' });
  assert.equal(ctx.state.actions.length, 1);
  assert.deepEqual(ctx.state.actions[0].action, { action: 'explore' });

  ctx.setFlag('awake', true);
  assert.equal(ctx.getFlag('awake'), true);

  ctx.setMemory('last', 'explore');
  assert.equal(ctx.getMemory('last'), 'explore');
});

test('TriadicConsciousnessEngine constructs its own shared context', () => {
  // It referenced SharedConsciousContext without importing it, so constructing
  // the engine threw a ReferenceError.
  const engine = new TriadicConsciousnessEngine({
    executive: new ExecutiveAgent(),
    reflective: new ReflectiveAgent(),
    generative: new GenerativeAgent(),
    cace: new CACEEngine()
  });

  assert.ok(engine.memory instanceof SharedConsciousContext);
  assert.equal(engine.active, false);
});

test('TriadicConsciousnessEngine runs a full cycle and records the result', async () => {
  const engine = new TriadicConsciousnessEngine({
    executive: new ExecutiveAgent(),
    reflective: new ReflectiveAgent(),
    generative: new GenerativeAgent(),
    cace: new CACEEngine()
  });

  // Drive one cycle directly rather than via start()'s interval
  engine.active = true;
  await engine.runCycle();
  engine.stop();

  assert.equal(engine.memory.state.actions.length, 1);
});

test('TriadicConsciousnessEngine start/stop toggles active', () => {
  const engine = new TriadicConsciousnessEngine({
    executive: new ExecutiveAgent(),
    reflective: new ReflectiveAgent(),
    generative: new GenerativeAgent(),
    cace: new CACEEngine()
  });

  engine.start();
  assert.equal(engine.active, true);

  engine.stop();
  assert.equal(engine.active, false);
});
