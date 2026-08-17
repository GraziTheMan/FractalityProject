// src/ecs/systems/RenderSystem.js
// Syncs entity transforms onto whatever is doing the drawing.
//
// This system is intentionally decoupled from Three.js: it takes an adapter
// with an `updateEntity({ id, model, position })` method. Passing no adapter
// makes it a no-op (plus optional trace logging), so the ECS can run headless.

export class RenderSystem {
  /**
   * @param {object} options
   * @param {{updateEntity: Function}} [options.adapter] renderer adapter
   * @param {boolean} [options.trace] log each rendered entity
   */
  constructor(options = {}) {
    this.adapter = options.adapter || null;
    this.trace = options.trace ?? false;
  }

  setAdapter(adapter) {
    this.adapter = adapter;
  }

  update(entities, delta) {
    for (const e of entities) {
      if (!e.has('Position', 'Renderable')) continue;

      const pos = e.get('Position');
      const rend = e.get('Renderable');
      if (rend.visible === false) continue;

      if (this.adapter) {
        this.adapter.updateEntity({
          id: e.id,
          model: rend.model,
          position: pos
        });
      } else if (this.trace) {
        console.log(
          `[RenderSystem] ${rend.model} at (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`
        );
      }
    }
  }
}
