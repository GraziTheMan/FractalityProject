export class LogStore {
  constructor() {
    this.entries = [];
    this.subscribers = [];
  }

  log(entry) {
    const record = {
      ...entry,
      timestamp: new Date().toISOString()
    };
    this.entries.push(record);
    this.notify();
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify() {
    this.subscribers.forEach(fn => fn(this.entries));
  }

  getAll() {
    return this.entries;
  }
}

export const logStore = new LogStore();
