import { menuContext } from './MenuContext.js';
import config from './MainMenuConfig.json' assert { type: 'json' };

export class MainMenuRadial {
  constructor(rootId = 'main-menu') {
    this.root = document.getElementById(rootId);
    this.render();
  }

  render() {
    if (!this.root) return;
    const items = config[menuContext.level] || [];
    this.root.innerHTML = \`
      <div class="menu-node">☰</div>
      <div class="menu-actions open">
        \${items.map((item, i) => \`
          <button class="action-node" title="\${item.label}" style="--i:\${i}">\${item.icon}</button>
        \`).join('')}
      </div>
    \`;
    this.attachListeners(items);
  }

  attachListeners(items) {
    const buttons = this.root.querySelectorAll('.action-node');
    buttons.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const item = items[i];
        if (item.submenu) {
          menuContext.setLevel(item.submenu);
          this.render();
        } else if (item.event) {
          window.dispatchEvent(new CustomEvent(item.event, { detail: item.label }));
        }
      });
    });

    this.root.querySelector('.menu-node').addEventListener('click', () => {
      menuContext.setLevel('main');
      this.render();
    });
  }
}
