export class ClaudeWrapper {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async ask(prompt, context) {
    return `Claude says: [RESPONSE to '${prompt}']`;
  }
}
