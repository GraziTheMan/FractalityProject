import { TriadicConsciousnessEngine } from '../core/agent_systems/TriadicConsciousnessEngine.js';
import { ExecutiveAgent } from '../core/agent_systems/ExecutiveAgent.js';
import { ReflectiveAgent } from '../core/agent_systems/ReflectiveAgent.js';
import { GenerativeAgent } from '../core/agent_systems/GenerativeAgent.js';
import { CACEEngine } from '../core/agent_systems/CACEEngine.js';
import { SharedConsciousContext } from '../core/agent_systems/SharedConsciousContext.js';

const executive = new ExecutiveAgent();
const reflective = new ReflectiveAgent();
const generative = new GenerativeAgent();
const cace = new CACEEngine();
const engine = new TriadicConsciousnessEngine({ executive, reflective, generative, cace });

engine.start();

setTimeout(() => {
  engine.stop();
  console.log('Simulation complete.');
}, 5000);
