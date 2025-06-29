import { portalMap } from './portal-index.js';

export class PortalLoader {
  constructor(rootId = 'portal-root') {
    this.root = document.getElementById(rootId);
    this.current = null;

    window.addEventListener('openPortal', (e) => {
      const name = e.detail;
      this.load(name);
    });

    window.addEventListener('closePortal', () => {
      this.clear();
    });
  }

  async load(name) {
    if (!portalMap[name]) {
      console.warn('[PortalLoader] Unknown portal:', name);
      return;
    }
    this.clear();
    const module = await portalMap[name]();
    const portalContent = document.createElement('div');
    portalContent.className = 'portal-view';
    portalContent.innerHTML = `<h2>📍 ${name}</h2><p>Module loaded: ${name}Portal</p>`;
    this.root.appendChild(portalContent);
    this.current = name;
  }

  clear() {
    if (this.root) this.root.innerHTML = '';
  }
}
