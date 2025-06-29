class MenuContext {
  constructor() {
    this.level = 'main';
    this.listeners = [];
  }

  setLevel(newLevel) {
    this.level = newLevel;
    this.notify();
  }

  subscribe(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach(fn => fn(this.level));
  }
}

export const menuContext = new MenuContext();
