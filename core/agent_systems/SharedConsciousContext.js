export class SharedConsciousContext {
  constructor() {
    this.state = {
      actions: [],
      memory: {},
      contextFlags: {},
    };
  }

  storeAction(action) {
    this.state.actions.push({
      action,
      timestamp: Date.now()
    });
  }

  getFlag(key) {
    return this.state.contextFlags[key];
  }

  setFlag(key, value) {
    this.state.contextFlags[key] = value;
  }

  getMemory(key) {
    return this.state.memory[key];
  }

  setMemory(key, value) {
    this.state.memory[key] = value;
  }
}
