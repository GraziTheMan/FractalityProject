// src/ecs/components.js
// Component factories. Components are plain data — no behaviour, no methods.
// Systems in ./systems/ read and mutate these.

export const PositionComponent = (x = 0, y = 0, z = 0) => ({ x, y, z });

export const RenderableComponent = (model, visible = true) => ({ model, visible });

/**
 * Links an entity to a Fractality knowledge node.
 * @param {string} id    node id in the knowledge graph
 * @param {string} type  node type, e.g. 'ENTITY' or 'CONCEPT'
 * @param {number} energy ATP-style energy budget for this entity
 */
export const KnowledgeComponent = (id, type, energy = 1.0) => ({ id, type, energy });

export const InputComponent = () => ({
  up: false,
  down: false,
  left: false,
  right: false
});

export const VelocityComponent = (vx = 0, vy = 0, vz = 0) => ({ vx, vy, vz });
