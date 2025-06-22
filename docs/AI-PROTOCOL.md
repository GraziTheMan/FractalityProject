# 🤖 Fractality AI Protocol Specification v2.0

## Overview

The Fractality AI Protocol enables AI assistants to generate node definitions that can be directly pasted into the Data Management Console. This protocol uses a human-readable, markdown-inspired syntax that's easy for both AIs and humans to understand.

## Basic Syntax

### Node Definition

```
NODE: [unique-id]
  name: Display Name
  info: Description of the node
  depth: 0-10
  parent: parent-id
  children: [child1, child2, child3]
  tags: [tag1, tag2, tag3]
  type: concept|principle|dimension|force|entity|process|state
  energy: 0.0-1.0
  frequency: numeric (Hz)
  scale: 0.1-10.0
  color: #hexcolor
  opacity: 0.0-1.0
END
```

### Connection Definition

```
CONNECT: node-id-1 TO node-id-2 WITH connection-type
```

### Comments

```
// This is a comment
```

## Field Reference

### Required Fields

- **NODE:** - Node ID (must be unique, use kebab-case)
- **name:** - Human-readable display name
- **info:** - Description of the node's meaning and purpose

### Optional Fields

#### Hierarchy
- **depth:** - Integer 0-10 (0 = root level)
- **parent:** - ID of parent node
- **children:** - Array of child node IDs

#### Metadata
- **tags:** - Array of descriptive tags
- **type:** - Node type:
  - `concept` - Abstract ideas or theories
  - `principle` - Fundamental rules or laws
  - `dimension` - Spatial, temporal, or abstract dimensions
  - `force` - Active powers or influences
  - `entity` - Discrete beings or objects
  - `process` - Dynamic operations or transformations
  - `state` - Conditions or modes of being

#### Physics Properties
- **energy:** - 0.0-1.0 (activity level)
- **frequency:** - Numeric Hz (vibrational frequency)

#### Visual Properties
- **scale:** - 0.1-10.0 (visual size multiplier)
- **color:** - Hex color (#RRGGBB)
- **opacity:** - 0.0-1.0 (transparency)

## Best Practices for AI Assistants

### 1. ID Naming Convention
```
✅ Good: quantum-consciousness, fractal-recursion, wave-particle-duality
❌ Bad: qc1, node_23, MyNode
```

### 2. Rich Descriptions
```
✅ Good: "The intersection of quantum mechanics and conscious observation where reality crystallizes from probability"
❌ Bad: "Quantum stuff"
```

### 3. Meaningful Hierarchies
- Place nodes at appropriate depths
- Ensure parent-child relationships make conceptual sense
- Root nodes (depth 0-1) should be fundamental concepts

### 4. Thoughtful Tagging
```
tags: [quantum, consciousness, emergence, physics, observation]
```
Tags should be:
- Descriptive and searchable
- Consistent across related nodes
- Categorical (physics, mathematics, philosophy, etc.)

### 5. Appropriate Visual Properties
- **Color**: Match the node's conceptual nature
  - Purple (#8b5cf6) for consciousness/awareness
  - Blue (#3b82f6) for information/knowledge
  - Green (#10b981) for growth/life
  - Orange (#f59e0b) for energy/dynamics
  - Red (#ef4444) for forces/power
- **Scale**: Larger for more fundamental concepts
- **Opacity**: Lower for more abstract concepts

### 6. Energy and Frequency
- **Energy**: How active/dynamic is this concept?
  - 1.0 for highly active (consciousness, motion)
  - 0.5 for balanced (equilibrium states)
  - 0.2 for passive (static structures)
- **Frequency**: Meaningful frequencies
  - 40 Hz - Gamma waves (consciousness)
  - 432 Hz - Cosmic/natural frequency
  - 528 Hz - Love/DNA repair frequency
  - 7.83 Hz - Schumann resonance

## Example: Quantum Consciousness Cluster

```
// Quantum Consciousness Node Cluster
// Exploring the intersection of quantum mechanics and consciousness

NODE: quantum-consciousness-field
  name: Quantum Consciousness Field
  info: The proposed field where quantum processes give rise to conscious experience
  depth: 2
  parent: consciousness-dimension
  children: [observer-effect, quantum-coherence, orchestrated-reduction]
  tags: [quantum, consciousness, field-theory, emergence]
  type: dimension
  energy: 0.9
  frequency: 40.0  // Gamma frequency associated with consciousness
  scale: 1.8
  color: #a855f7
  opacity: 0.85
END

NODE: observer-effect
  name: Observer Effect
  info: The phenomenon where conscious observation collapses quantum wave functions
  depth: 3
  parent: quantum-consciousness-field
  children: [wave-collapse, measurement-problem]
  tags: [observation, measurement, collapse, quantum-mechanics]
  type: principle
  energy: 0.8
  frequency: 432.0
  scale: 1.2
  color: #8b5cf6
  opacity: 0.9
END

NODE: quantum-coherence
  name: Quantum Coherence in Biology
  info: Sustained quantum states in warm biological systems enabling consciousness
  depth: 3
  parent: quantum-consciousness-field
  children: [microtubules, quantum-biology]
  tags: [coherence, biology, quantum-effects, penrose-hameroff]
  type: concept
  energy: 0.7
  frequency: 528.0
  scale: 1.3
  color: #6366f1
  opacity: 0.8
END

NODE: orchestrated-reduction
  name: Orchestrated Objective Reduction
  info: Penrose-Hameroff theory of consciousness arising from quantum gravity effects
  depth: 3
  parent: quantum-consciousness-field
  tags: [orch-or, penrose, hameroff, quantum-gravity, consciousness]
  type: principle
  energy: 0.75
  frequency: 1000.0  // High frequency for quantum processes
  scale: 1.4
  color: #7c3aed
  opacity: 0.85
END

// Create meaningful connections
CONNECT: quantum-consciousness-field TO information-dimension WITH emergence
CONNECT: observer-effect TO wave-collapse WITH causality
CONNECT: quantum-coherence TO microtubules WITH substrate
CONNECT: orchestrated-reduction TO quantum-gravity WITH mechanism
```

## Advanced Features

### 1. Multi-Node Dependencies
When creating node clusters, define parents before children:

```
NODE: parent-concept
  // ... parent definition
END

NODE: child-concept
  parent: parent-concept
  // ... child definition
END
```

### 2. Cross-Domain Connections
Use CONNECT to create relationships between different conceptual domains:

```
CONNECT: quantum-field TO consciousness-field WITH resonance
CONNECT: information-theory TO thermodynamics WITH entropy
CONNECT: fractal-geometry TO neural-networks WITH self-similarity
```

### 3. Metadata-Rich Nodes
Include all relevant metadata for rich visualization:

```
NODE: emergent-complexity
  name: Emergent Complexity
  info: The arising of complex behaviors from simple rules through recursive iteration
  depth: 3
  parent: complexity-science
  children: [cellular-automata, swarm-intelligence, phase-transitions]
  tags: [emergence, complexity, systems-theory, chaos, self-organization]
  type: process
  energy: 0.85  // High energy for dynamic process
  frequency: 13.0  // Beta wave - active thinking
  scale: 1.6  // Larger to show importance
  color: #f59e0b  // Orange for dynamic process
  opacity: 0.9  // High opacity for concrete concept
END
```

## Integration Tips

1. **Copy entire protocol blocks** including all NODE/END markers
2. **Validate before processing** using the Validate button
3. **Build incrementally** - start with core nodes, then add details
4. **Test connections** - ensure referenced nodes exist
5. **Use meaningful types** - this affects visualization behavior

## Protocol Validation Rules

1. Each NODE must have a unique ID
2. Each NODE must be closed with END
3. Parent nodes must exist before being referenced
4. Arrays can use either `[item1, item2]` or `item1, item2` format
5. Colors must be valid hex codes
6. Numeric values must be within specified ranges

## Version History

- **v2.0** - Full metadata support, visual properties, connections
- **v1.0** - Basic node structure (deprecated)

---

*This protocol is designed for seamless human-AI collaboration in building the Fractality universe. When in doubt, optimize for clarity and semantic richness.*
