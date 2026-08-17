
export class RadialMenu {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.menuItems = options.items || [];
    this.radiusX = options.radiusX || 80;
    this.radiusY = options.radiusY || 60;
    this.angleRange = Math.PI; // 180 deg fan
    this.leftHanded = false;
    this.init();
  }

  setHandedness(isLeft) {
    this.leftHanded = isLeft;
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    this.container.classList.add('radial-ready');

    const count = this.menuItems.length;
    const angleStep = this.angleRange / Math.max(1, count - 1);
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

  init() {
    this.render();
  }
}
