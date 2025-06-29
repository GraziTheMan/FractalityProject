export class RoundTableEngine {
  constructor(agents = []) {
    this.agents = agents;
    this.responses = [];
  }

  async deliberate(question, context) {
    this.responses = await Promise.all(this.agents.map(agent =>
      agent.ask(question, context)
    ));
    return this.analyzeResponses();
  }

  analyzeResponses() {
    // Simple mode: vote by similarity or choose majority opinion
    const first = this.responses[0];
    return first; // placeholder logic
  }

  addAgent(agent) {
    this.agents.push(agent);
  }
}
