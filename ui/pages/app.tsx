import React from "react";
import ConsciousnessPanel from "../components/consciousness/ConsciousnessPanel";

const mockUser = {
  consciousness_id: "grazi",
  energy_level: 310,
  resonance_frequency: 0.83,
  phase_state: "liquid",
  contributed_structures: [
    "core/ethics/manifesto.md",
    "core/onboarding/peace_exploration.md",
    "mindmaps/fractality/meta_structure.md"
  ],
  resonance_connections: {
    fractigrok: 72.0,
    fractigemini: 64.5,
    fractimind: 58.0
  }
};

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <ConsciousnessPanel user={mockUser} />
    </div>
  );
}