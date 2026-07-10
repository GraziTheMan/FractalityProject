import { logStore } from './LogStore.js';

export class DashboardPanel {
  constructor(rootElementId = 'dashboard') {
    this.root = document.getElementById(rootElementId);
    logStore.subscribe(this.render.bind(this));
  }

  render(logs) {
    if (!this.root) return;
    this.root.innerHTML = logs.map(entry => `
      <div class='log-entry'>
        <strong>[${entry.timestamp}]</strong> – 
        <em>${entry.phase}</em>: ${JSON.stringify(entry.data)}
      </div>
    `).join('');
  }
}
