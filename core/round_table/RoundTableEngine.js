import { buildContextPrompt } from './contextBuilder.js';

export class RoundTableEngine {
  constructor(config, sharedContext) {
    this.config = config;
    this.sharedContext = sharedContext;
  }

  async run() {
    const responses = [];
    for (const agent of this.config) {
      const memory = await this.fetchMemory(agent.memoryFile);
      const prompt = buildContextPrompt(agent.name, this.sharedContext, memory);
      const response = await this.queryAgent(agent.url, prompt);
      responses.push({ agent: agent.name, content: response });
    }
    this.sharedContext.roundTableThoughts = responses;
  }

  async fetchMemory(path) {
    const res = await fetch(`/agent_memory/${path}`);
    return res.json();
  }

  async queryAgent(url, prompt) {
    const body = JSON.stringify({ prompt });
    const res = await fetch(url, { method: 'POST', body });
    const data = await res.json();
    return data.completion || data.choices?.[0]?.text || 'No response';
  }
}
