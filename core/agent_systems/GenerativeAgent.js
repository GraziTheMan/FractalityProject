export class GenerativeAgent {
  async generate(decision, context) {
    const creativity = Math.random(); // Placeholder randomness
    return {
      generatedIdea: `Generated variation on: ${decision.action || 'unknown'}`,
      creativityScore: creativity
    };
  }
}
