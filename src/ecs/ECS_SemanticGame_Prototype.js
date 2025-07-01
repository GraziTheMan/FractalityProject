
// ======= ECS CORE =======

class Entity {
  constructor(id) {
    this.id = id;
    this.components = new Map();
  }

  add(name, data) {
    this.components.set(name, data);
  }

  get(name) {
    return this.components.get(name);
  }

  has(...names) {
    return names.every(n => this.components.has(n));
  }
}

class ECS {
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

  addSystem(system) {
    this.systems.push(system);
  }

  update(delta) {
    for (const system of this.systems) {
      system.update(this.entities, delta);
    }
  }
}

// ======= COMPONENT EXAMPLES =======

const PositionComponent = (x, y, z) => ({ x, y, z });
const RenderableComponent = (model) => ({ model });
const KnowledgeComponent = (id, type, energy = 1.0) => ({ id, type, energy });
const InputComponent = () => ({ up: false, down: false, left: false, right: false });

// ======= SYSTEM EXAMPLES =======

class RenderSystem {
  update(entities, delta) {
    for (const e of entities) {
      if (e.has("Position", "Renderable")) {
        const pos = e.get("Position");
        const rend = e.get("Renderable");
        console.log(`[RenderSystem] Rendering ${rend.model} at (${pos.x},${pos.y},${pos.z})`);
        // Here: use Three.js to position a mesh
      }
    }
  }
}

class InputSystem {
  update(entities, delta) {
    for (const e of entities) {
      if (e.has("Input", "Position")) {
        const input = e.get("Input");
        const pos = e.get("Position");

        if (input.up) pos.z -= 0.1;
        if (input.down) pos.z += 0.1;
        if (input.left) pos.x -= 0.1;
        if (input.right) pos.x += 0.1;
      }
    }
  }
}

// ======= TEST WORLD SPAWN =======

const ecs = new ECS();

const player = ecs.createEntity();
player.add("Position", PositionComponent(0, 0, 0));
player.add("Renderable", RenderableComponent("avatar.glb"));
player.add("Input", InputComponent());
player.add("Knowledge", KnowledgeComponent("player", "ENTITY", 1.5));

const tree = ecs.createEntity();
tree.add("Position", PositionComponent(10, 0, 5));
tree.add("Renderable", RenderableComponent("tree.glb"));
tree.add("Knowledge", KnowledgeComponent("tree_001", "ENTITY", 0.8));

// Add systems
ecs.addSystem(new InputSystem());
ecs.addSystem(new RenderSystem());

// Simulate one update frame
ecs.update(1 / 60);
