export class CoreAdmin {
  constructor(localLLM, energySystem) {
    this.llm = localLLM;
    this.energy = energySystem;
  }

  async arbitrate(prompt, context) {
    if (!this.energy.hasEnough('admin')) {
      return { error: 'Insufficient energy for arbitration.' };
    }
    const response = await this.llm.ask(prompt, context);
    this.energy.consume('admin');
    return response;
  }
}
