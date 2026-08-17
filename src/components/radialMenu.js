// src/components/radialMenu.js

/**
 * RadialMenu - a fan of buttons arranged on an ellipse.
 *
 * Handedness is part of the public API: setupMirrorToggle() calls
 * setHandedness() to flip the fan for left-handed use, so any rewrite of
 * this class must keep that method.
 */
export class RadialMenu {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`RadialMenu: no element with id "${containerId}"`);
    }

    this.options = options;
    this.menuItems = options.items || [];
    this.radiusX = options.radiusX || 80;
    this.radiusY = options.radiusY || 60;
    this.angleRange = options.angleRange || Math.PI; // 180deg fan
    this.leftHanded = false;

    this.init();
  }

  init() {
    this.render();
  }

  /**
   * Mirror the fan across the vertical axis.
   * @param {boolean} isLeft true for left-handed layout
   */
  setHandedness(isLeft) {
    this.leftHanded = Boolean(isLeft);
    this.render();
  }

  /**
   * Replace the menu items and redraw.
   */
  setItems(items) {
    this.menuItems = items || [];
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    this.container.classList.add('radial-ready');

    const count = this.menuItems.length;
    if (count === 0) return;

    const angleStep = this.angleRange / Math.max(1, count - 1);

    // getBoundingClientRect reflects CSS size even before layout settles,
    // which offsetWidth does not when the container starts hidden.
    const rect = this.container.getBoundingClientRect();
    const originX = rect.width / 2;
    const originY = rect.height / 2;

    this.menuItems.forEach((item, index) => {
      const angleOffset = this.leftHanded ? Math.PI : 0;
      const angle = -this.angleRange / 2 + index * angleStep + angleOffset;

      const x = originX + this.radiusX * Math.cos(angle);
      const y = originY - this.radiusY * Math.sin(angle);

      const button = document.createElement('button');
      button.className = 'radial-item';
      button.innerText = item.label;
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
      button.style.position = 'absolute';
      button.addEventListener('click', () => item.onClick());
      this.container.appendChild(button);
    });
  }
}
