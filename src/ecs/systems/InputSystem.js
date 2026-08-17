// src/ecs/systems/InputSystem.js
// Translates keyboard state into movement on entities that have both an
// InputComponent and a PositionComponent.

const KEY_MAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right'
};

export class InputSystem {
  /**
   * @param {object} options
   * @param {number} options.speed units per second
   * @param {boolean} options.bindKeyboard attach listeners to window
   */
  constructor(options = {}) {
    this.speed = options.speed ?? 6;
    this.keys = new Set();
    this._bound = false;

    // Off by default so the class is usable in tests / on the server
    if (options.bindKeyboard !== false && typeof window !== 'undefined') {
      this.bind();
    }
  }

  bind() {
    if (this._bound) return;

    this._onKeyDown = (e) => { if (KEY_MAP[e.key]) this.keys.add(KEY_MAP[e.key]); };
    this._onKeyUp = (e) => { if (KEY_MAP[e.key]) this.keys.delete(KEY_MAP[e.key]); };
    // Dropping keys on blur avoids a held direction sticking forever
    this._onBlur = () => this.keys.clear();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this._bound = true;
  }

  unbind() {
    if (!this._bound) return;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this._bound = false;
  }

  update(entities, delta) {
    for (const e of entities) {
      if (!e.has('Input', 'Position')) continue;

      const input = e.get('Input');
      const pos = e.get('Position');

      // Mirror the polled keyboard state onto the component so other systems
      // and debug panels can read it
      input.up = this.keys.has('up');
      input.down = this.keys.has('down');
      input.left = this.keys.has('left');
      input.right = this.keys.has('right');

      const step = this.speed * delta;
      if (input.up) pos.z -= step;
      if (input.down) pos.z += step;
      if (input.left) pos.x -= step;
      if (input.right) pos.x += step;
    }
  }
}
