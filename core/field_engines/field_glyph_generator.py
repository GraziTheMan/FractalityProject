field_glyph_generator.py

import random

class FieldGlyphGenerator: def init(self): pass

def generate(self, field_data):
    """
    Generate glyphDNA from field data snapshot
    field_data should include:
      - semantic_coherence: float (0–1)
      - gravitational_density: float (0–1)
      - metabolic_energy: float (0–1)
      - trail_variance: float (0–1)
      - collapse_probability: float (0–1)
      - node_types: list of strings
    """
    sem = field_data.get("semantic_coherence", 0.5)
    grav = field_data.get("gravitational_density", 0.5)
    meta = field_data.get("metabolic_energy", 0.5)
    trail = field_data.get("trail_variance", 0.5)
    collapse = field_data.get("collapse_probability", 0.5)
    types = field_data.get("node_types", [])

    # Core glyph shape
    if sem > 0.8:
        core = "spiral"
    elif sem > 0.5:
        core = "ring"
    elif sem > 0.3:
        core = "axis"
    else:
        core = "lattice"

    # Arms = gravitational + trail factors
    arms = int(3 + grav * 5 + trail * 2)

    # Pulse = metabolic
    pulse = round(meta, 2)

    # Color tier based on energy state
    if meta > 0.85:
        color = "inferno:7"
    elif meta > 0.6:
        color = "inferno:5"
    elif meta > 0.3:
        color = "plasma:4"
    else:
        color = "twilight:3"

    # Halo effect based on collapse focus
    halo = collapse > 0.7

    # Trail style
    if trail > 0.8:
        trail_style = "recursive"
    elif trail > 0.5:
        trail_style = "swoosh"
    else:
        trail_style = "linear"

    # Node icon sampling (max 3)
    archetype_icons = {
        "Core": "📘", "Ritual": "🕯️", "Ego": "🧠", "Oracle": "🔮",
        "Field": "🌐", "Dream": "🌙", "Shadow": "🌑", "Concept": "🌱",
        "Duality": "⚖️", "Resonance": "🪐", "Map": "🗺️"
    }
    icons = [archetype_icons[t] for t in types if t in archetype_icons]
    node_icons = random.sample(icons, min(3, len(icons)))

    return {
        "core": core,
        "arms": arms,
        "pulse": pulse,
        "color": color,
        "halo": halo,
        "trailStyle": trail_style,
        "nodeIcons": node_icons
    }

Example usage:

generator = FieldGlyphGenerator()

glyph = generator.generate({

"semantic_coherence": 0.92,

"gravitational_density": 0.6,

"metabolic_energy": 0.88,

"trail_variance": 0.3,

"collapse_probability": 0.91,

"node_types": ["Core", "Oracle", "Resonance"]

})

