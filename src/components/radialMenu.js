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
    // Treated as maxima: render() shrinks them to fit the container so the
    // fan stays inside its box on narrow screens.
    this.radiusX = options.radiusX || 80;
    this.radiusY = options.radiusY || 60;
    this.angleRange = options.angleRange || Math.PI; // 180deg fan
    this.leftHanded = false;

    // Item labels are absolutely positioned from the container's centre, so a
    // resize has to trigger a re-layout.
    this._onResize = () => this.render();

    this.init();
  }

  init() {
    this.render();
    window.addEventListener('resize', this._onResize);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.container.innerHTML = '';
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

    // getBoundingClientRect reflects CSS size even before layout settles,
    // which offsetWidth does not when the container starts hidden.
    const rect = this.container.getBoundingClientRect();
    const originX = rect.width / 2;
    const originY = rect.height / 2;

    // Build the buttons first so their real widths can be measured. The
    // previous code guessed a flat 56px margin, which is about half the width
    // of a label like "💓 Conscious" — so on a narrow screen the outermost
    // chips were pushed past the edge of the container.
    const buttons = this.menuItems.map((item) => {
      const button = document.createElement('button');
      button.className = 'radial-item';
      button.innerText = item.label;
      button.style.position = 'absolute';
      button.addEventListener('click', () => item.onClick());
      this.container.appendChild(button);
      return button;
    });

    const widest = buttons.reduce(
      (max, b) => Math.max(max, b.getBoundingClientRect().width),
      0
    );

    // Clamp both radii to the box so the fan never spills outside it.
    const radiusX = rect.width > 0
      ? Math.min(this.radiusX, Math.max(40, rect.width / 2 - widest / 2 - 6))
      : this.radiusX;
    const radiusY = rect.height > 0
      ? Math.min(this.radiusY, Math.max(30, rect.height / 2 - 24))
      : this.radiusY;

    // Items are distributed by equal VERTICAL spacing, not equal angle.
    //
    // Equal angle looks correct on paper and fails in practice: near the poles
    // of the ellipse (the top and bottom of the fan) sin() flattens out, so the
    // outermost pair ended up ~13px apart vertically while chips are ~35px
    // tall. On a phone that rendered "🧠 Mindmap" underneath "👥 Social".
    //
    // Parameterising by y instead traces the same ellipse with the items evenly
    // spread down it: the gap is 2*radiusY/(count-1) everywhere, so whether the
    // labels fit is a question about the height of the box rather than about
    // which end of the fan you are looking at.
    //
    // angleRange still controls how much of the ellipse is used: a 180-degree
    // range reaches both poles, a narrower one keeps the fan shallow.
    const extent = Math.sin(Math.min(this.angleRange, Math.PI) / 2);
    const mirror = this.leftHanded ? -1 : 1;

    buttons.forEach((button, index) => {
      // -extent (bottom) .. +extent (top), matching the previous ordering.
      const t = count === 1
        ? 0
        : -extent + (2 * extent * index) / (count - 1);
      // How far out the ellipse bows at this height.
      const bow = Math.sqrt(Math.max(0, 1 - t * t));

      const x = originX + mirror * radiusX * bow;
      const y = originY - radiusY * mirror * t;

      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
    });
  }
}
