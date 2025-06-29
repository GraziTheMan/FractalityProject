export class LLMConsensusManager {
  constructor(agents = []) {
    this.agents = agents; // [{ name, api, weight }]
  }

  async query(prompt, context) {
    const responses = await Promise.all(this.agents.map(a =>
      a.api.ask(prompt, context)
    ));
    return this.resolveConsensus(responses);
  }

  resolveConsensus(responses) {
    // Placeholder: naive selection
    return responses[0];
  }

  addAgent(name, api, weight = 1.0) {
    this.agents.push({ name, api, weight });
  }
}
