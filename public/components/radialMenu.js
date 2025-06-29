
export class RadialMenu {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = options;
    this.menuItems = options.items || [];
    this.radiusX = options.radiusX || 80;
    this.radiusY = options.radiusY || 60;
    this.angleRange = options.angleRange || Math.PI; // 180 degrees
    this.init();
  }

  init() {
    this.container.innerHTML = '';
    this.container.classList.add('radial-ready');

    const count = this.menuItems.length;
    const angleStep = this.angleRange / Math.max(1, count - 1);
    const centerX = this.container.offsetWidth / 2;
    const centerY = this.container.offsetHeight / 2;

    this.menuItems.forEach((item, index) => {
      const angle = -this.angleRange / 2 + index * angleStep;
      const x = centerX + this.radiusX * Math.cos(angle);
      const y = centerY - this.radiusY * Math.sin(angle);

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
