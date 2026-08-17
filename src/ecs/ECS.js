// src/ecs/ECS.js
// Minimal entity-component-system core.
//
// Components live in ./components.js and systems in ./systems/. This file
// contains only the core types and must stay side-effect free: importing it
// should never spawn entities or start a loop.

export class Entity {
  constructor(id) {
    this.id = id;
    this.components = new Map();
  }

  add(name, data) {
    this.components.set(name, data);
    return this;
  }

  get(name) {
    return this.components.get(name);
  }

  has(...names) {
    return names.every(n => this.components.has(n));
  }

  remove(name) {
    return this.components.delete(name);
  }
}

export class ECS {
  constructor() {
    this.entities = [];
    this.systems = [];
    this.nextId = 0;
  }

  createEntity() {
    const entity = new Entity(this.nextId++);
    this.entities.push(entity);
    return entity;
  }

  destroyEntity(entity) {
    const index = this.entities.indexOf(entity);
    if (index !== -1) this.entities.splice(index, 1);
    return index !== -1;
  }

  addSystem(system) {
    this.systems.push(system);
    return this;
  }

  /**
   * Entities carrying all of the named components.
   */
  query(...names) {
    return this.entities.filter(e => e.has(...names));
  }

  update(delta) {
    for (const system of this.systems) {
      system.update(this.entities, delta);
    }
  }
}
