export class OllamaWrapper {
  constructor(model = "mistral") {
    this.model = model;
  }

  async ask(prompt, context) {
    return `Ollama (${this.model}) replies: [RESPONSE to '${prompt}']`;
  }
}
