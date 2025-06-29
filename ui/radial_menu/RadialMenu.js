export class RadialMenu {
  constructor(rootId = 'radial-menu') {
    this.root = document.getElementById(rootId);
    this.open = false;
    this.actions = [
      { label: '▶️', action: () => window.TCE?.start?.(), title: 'Start Loop' },
      { label: '⏸', action: () => window.TCE?.stop?.(), title: 'Pause Loop' },
      { label: '🧠', action: () => window.dispatchEvent(new CustomEvent('reflect')), title: 'Reflect' },
      { label: '💡', action: () => window.dispatchEvent(new CustomEvent('generate')), title: 'Generate' },
      { label: '📝', action: () => window.dispatchEvent(new CustomEvent('setIntent')), title: 'Set Intent' },
      { label: '🌌', action: () => window.dispatchEvent(new CustomEvent('dreamMode')), title: 'Enter Dream' }
    ];
    this.render();
  }

  render() {
    if (!this.root) return;
    this.root.innerHTML = \`
      <div class="menu-node">☰</div>
      <div class="menu-actions \${this.open ? 'open' : ''}">
        \${this.actions.map((a, i) => \`
          <button class="action-node" title="\${a.title}" style="--i:\${i}">\${a.label}</button>
        \`).join('')}
      </div>
    \`;
    this.attachListeners();
  }

  attachListeners() {
    const menuNode = this.root.querySelector('.menu-node');
    menuNode.addEventListener('click', () => {
      this.open = !this.open;
      this.render();
    });
    const buttons = this.root.querySelectorAll('.action-node');
    buttons.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        this.actions[i].action();
        this.open = false;
        this.render();
      });
    });
  }
}
