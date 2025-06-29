export class TriadicConsciousnessEngine {
  constructor({ executive, reflective, generative, cace, llmManager }) {
    this.executive = executive;
    this.reflective = reflective;
    this.generative = generative;
    this.cace = cace;
    this.llmManager = llmManager; // Optional: remote/local LLM manager
    this.memory = new SharedConsciousContext();
    this.tickRate = 200;
    this.active = false;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.loop = setInterval(() => this.runCycle(), this.tickRate);
  }

  async runCycle() {
    if (!this.active) return;
    const perception = this.perceive();
    const reflection = this.reflective.evaluate(perception, this.memory);
    const decision = this.executive.decide(perception, reflection);

    let output;
    if (decision.requiresCreativity && this.generative?.generate) {
      output = await this.generative.generate(decision, this.memory);
    } else {
      output = decision;
    }

    this.act(output);
    this.learn({ decision, reflection, result: output });
  }

  perceive() {
    return this.cace.getSystemState();
  }

  act(output) {
    this.memory.storeAction(output);
    this.cace.routeCommand(output);
  }

  learn({ decision, reflection, result }) {
    this.executive?.feedback?.(decision, result);
    this.reflective?.updateMemory?.(decision, reflection, result);
  }

  stop() {
    clearInterval(this.loop);
    this.active = false;
  }
}
