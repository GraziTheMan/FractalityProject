import { logStore } from '../logging_dashboard/LogStore.js';

export class MobileHUD {
  constructor(rootId = 'hud') {
    this.root = document.getElementById(rootId);
    this.state = { phase: 'idle', energy: 1.0, coherence: 1.0 };
    logStore.subscribe(this.update.bind(this));
    this.render();
  }

  update(logs) {
    const latest = logs.slice(-1)[0];
    if (latest) {
      this.state.phase = latest.phase || 'idle';
      this.render();
    }
  }

  render() {
    if (!this.root) return;
    this.root.innerHTML = \`
      <div class="hud-panel">
        <div class="hud-phase">🌀 Phase: <strong>\${this.state.phase}</strong></div>
        <button id="toggle-dashboard">Toggle Logs</button>
        <button id="pause-loop">Pause Loop</button>
        <button id="step-loop">Step Once</button>
      </div>
    \`;
    this.attachListeners();
  }

  attachListeners() {
    document.getElementById('toggle-dashboard')?.addEventListener('click', () => {
      const dash = document.getElementById('dashboard');
      if (dash) dash.style.display = dash.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('pause-loop')?.addEventListener('click', () => {
      window.TCE?.stop?.();
    });

    document.getElementById('step-loop')?.addEventListener('click', () => {
      window.TCE?.runCycle?.();
    });
  }
}
