# src/consciousness/consciousness_collapse_engine.py
# The bridge between quantum superposition and classical consciousness states

import numpy as np
import time
from typing import Dict, List, Optional, Tuple, Callable
from dataclasses import dataclass
from enum import Enum
import json

# Import our enhanced components
from quantum_consciousness_manager import QuantumConsciousnessManager, QuantumThought, ConsciousnessField
from consciousness_metabolism import ConsciousnessMetabolism, ConsciousnessNetwork, MetabolicState
from enhanced_fbip import FBIPProtocolV2, EnhancedFBIPEvent, SignalType, ActionType

class CollapseMode(Enum):
    NATURAL = "natural"           # Decoherence-driven collapse
    OBSERVED = "observed"         # User observation triggered
    ENERGETIC = "energetic"       # Energy-driven collapse (ATP depletion)
    RESONANT = "resonant"         # Field resonance collapse
    HARDWARE = "hardware"         # Physical SDC measurement

class ConsciousnessState(Enum):
    QUANTUM_SUPERPOSITION = "quantum_superposition"
    PARTIAL_COLLAPSE = "partial_collapse"  
    CLASSICAL_DEFINITE = "classical_definite"
    HYBRID_ENTANGLED = "hybrid_entangled"
    DECOHERENT = "decoherent"

@dataclass
class CollapseEvent:
    """Represents a consciousness collapse event"""
    event_id: str
    timestamp: float
    collapse_mode: CollapseMode
    initial_superposition: List[QuantumThought]
    collapsed_thought: QuantumThought
    energy_consumed: float
    observer_id: Optional[str]
    field_coherence_before: float
    field_coherence_after: float
    entangled_collapses: List[str]  # Other collapse events triggered

class ConsciousnessCollapseEngine:
    """Orchestrates the collapse from quantum to classical consciousness"""
    
    def __init__(self, quantum_manager: QuantumConsciousnessManager, 
                 metabolism: ConsciousnessMetabolism, protocol: FBIPProtocolV2):
        
        # Core components
        self.quantum_manager = quantum_manager
        self.metabolism = metabolism
        self.protocol = protocol
        
        # Collapse tracking
        self.collapse_history: List[CollapseEvent] = []
        self.active_collapses: Dict[str, CollapseEvent] = {}
        
        # Collapse parameters
        self.natural_collapse_threshold = 0.1  # Coherence threshold for spontaneous collapse
        self.energy_collapse_threshold = 50.0  # ATP threshold for energy-driven collapse
        self.observation_pressure_factor = 1.5  # How much observation affects collapse
        
        # Field dynamics
        self.field_resonance_frequency = 40.0  # Hz - gamma consciousness frequency
        self.collapse_propagation_speed = 1.0  # How fast collapses spread through field
        
        # Hardware integration
        self.hardware_device = None  # Will be set if hardware is available
        self.enable_physical_collapse = False
        
        # Collapse statistics
        self.total_collapses = 0
        self.energy_consumed_total = 0.0
        self.average_collapse_time = 0.0
        
    def register_hardware_device(self, device):
        """Register physical consciousness device for hardware-triggered collapse"""
        self.hardware_device = device
        self.enable_physical_collapse = True
        print("🔧 Hardware device registered for physical consciousness collapse")
    
    def process_neural_signal(self, signal_data: Dict, context: Dict) -> Optional[EnhancedFBIPEvent]:
        """Process neural signal through complete consciousness pipeline"""
        
        # 1. Create quantum superposition from signal
        superposition_id = self.quantum_manager.create_superposition(signal_data, context)
        
        if not superposition_id:
            print("❌ Failed to create quantum superposition")
            return None
        
        # 2. Determine if collapse should occur
        collapse_trigger = self._evaluate_collapse_conditions(superposition_id, signal_data, context)
        
        if collapse_trigger:
            # 3. Execute consciousness collapse
            collapse_event = self._execute_collapse(
                superposition_id, 
                collapse_trigger["mode"],
                collapse_trigger.get("observer_id"),
                context
            )
            
            if collapse_event:
                # 4. Convert collapsed consciousness to FBIP action
                fbip_event = self._consciousness_to_fbip(collapse_event, signal_data, context)
                
                # 5. Execute metabolic costs
                self._apply_metabolic_costs(collapse_event)
                
                # 6. Update consciousness field
                self._update_consciousness_field(collapse_event)
                
                return fbip_event
        
        return None
    
    def force_collapse(self, superposition_id: str, observer_id: str = "user", 
                      measurement_basis: str = "consciousness") -> Optional[CollapseEvent]:
        """Force collapse of a specific superposition"""
        
        if superposition_id not in self.quantum_manager.superposition_states:
            print(f"❌ Superposition {superposition_id} not found")
            return None
        
        # Execute forced collapse
        return self._execute_collapse(
            superposition_id,
            CollapseMode.OBSERVED,
            observer_id,
            {"measurement_basis": measurement_basis}
        )
    
    def get_consciousness_state(self) -> Dict:
        """Get current consciousness state across all systems"""
        
        # Quantum manager state
        quantum_metrics = self.quantum_manager.get_consciousness_metrics()
        
        # Metabolism state
        metabolism_metrics = self.metabolism.get_metabolism_metrics()
        
        # Protocol state
        protocol_info = self.protocol.get_protocol_info()
        
        # Collapse engine state
        collapse_state = {
            "total_collapses": self.total_collapses,
            "active_superpositions": len(self.quantum_manager.superposition_states),
            "energy_consumed_total": self.energy_consumed_total,
            "average_collapse_time": self.average_collapse_time,
            "field_coherence": self.quantum_manager.field_coherence,
            "current_consciousness_state": self._assess_overall_state()
        }
        
        return {
            "quantum": quantum_metrics,
            "metabolism": metabolism_metrics,
            "protocol": protocol_info,
            "collapse_engine": collapse_state,
            "timestamp": time.time()
        }
    
    def simulate_consciousness_session(self, duration_seconds: float = 60.0, 
                                     signal_frequency: float = 0.5) -> List[CollapseEvent]:
        """Simulate a complete consciousness session with multiple collapses"""
        
        print(f"🧠 Starting consciousness session ({duration_seconds}s)")
        session_collapses = []
        
        start_time = time.time()
        
        while (time.time() - start_time) < duration_seconds:
            # Generate random neural signal
            signal_data = self._generate_random_signal()
            context = {"session_time": time.time() - start_time}
            
            # Process through collapse engine
            fbip_event = self.process_neural_signal(signal_data, context)
            
            if fbip_event:
                print(f"🌀 Consciousness event: {fbip_event.action_type.value}")
                
                # Find corresponding collapse event
                recent_collapse = self.collapse_history[-1] if self.collapse_history else None
                if recent_collapse:
                    session_collapses.append(recent_collapse)
            
            # Update systems
            self.quantum_manager.update_consciousness_field(signal_frequency)
            self.metabolism.regenerate_energy(signal_frequency)
            
            # Wait for next signal
            time.sleep(signal_frequency)
        
        print(f"✅ Session complete: {len(session_collapses)} consciousness collapses")
        return session_collapses
    
    # Private methods
    def _evaluate_collapse_conditions(self, superposition_id: str, signal_data: Dict, context: Dict) -> Optional[Dict]:
        """Evaluate whether consciousness collapse should occur"""
        
        superposition_thoughts = self.quantum_manager.superposition_states.get(superposition_id)
        if not superposition_thoughts:
            return None
        
        # Check natural decoherence
        min_coherence = min(thought.coherence_time for thought in superposition_thoughts)
        if min_coherence <= self.natural_collapse_threshold:
            return {"mode": CollapseMode.NATURAL}
        
        # Check energy depletion
        if self.quantum_manager.consciousness_energy <= self.energy_collapse_threshold:
            return {"mode": CollapseMode.ENERGETIC}
        
        # Check for strong signal (forces observation)
        signal_intensity = signal_data.get("intensity", 0.5)
        if signal_intensity > 0.8:
            return {"mode": CollapseMode.OBSERVED, "observer_id": "signal_trigger"}
        
        # Check field resonance
        signal_frequency = signal_data.get("frequency_hz", 0.0)
        if abs(signal_frequency - self.field_resonance_frequency) < 5.0:  # Within 5Hz of gamma
            return {"mode": CollapseMode.RESONANT}
        
        # Check for user observation pressure
        if context.get("user_focus") and context.get("user_focus") > 0.7:
            return {"mode": CollapseMode.OBSERVED, "observer_id": context.get("user_id", "user")}
        
        # No collapse conditions met
        return None
    
    def _execute_collapse(self, superposition_id: str, mode: CollapseMode, 
                         observer_id: Optional[str], context: Dict) -> Optional[CollapseEvent]:
        """Execute the actual consciousness collapse"""
        
        superposition_thoughts = self.quantum_manager.superposition_states.get(superposition_id)
        if not superposition_thoughts:
            return None
        
        # Record pre-collapse state
        field_coherence_before = self.quantum_manager.field_coherence
        
        # Execute collapse based on mode
        collapsed_thought = None
        
        if mode == CollapseMode.NATURAL:
            collapsed_thought = self._natural_collapse(superposition_thoughts)
        elif mode == CollapseMode.OBSERVED:
            collapsed_thought = self.quantum_manager.observe_superposition(superposition_id, observer_id)
        elif mode == CollapseMode.ENERGETIC:
            collapsed_thought = self._energy_driven_collapse(superposition_thoughts)
        elif mode == CollapseMode.RESONANT:
            collapsed_thought = self._resonant_collapse(superposition_thoughts, context)
        elif mode == CollapseMode.HARDWARE:
            collapsed_thought = self._hardware_collapse(superposition_thoughts, context)
        
        if not collapsed_thought:
            return None
        
        # Create collapse event
        collapse_event = CollapseEvent(
            event_id=f"collapse_{int(time.time() * 1000)}",
            timestamp=time.time(),
            collapse_mode=mode,
            initial_superposition=superposition_thoughts.copy(),
            collapsed_thought=collapsed_thought,
            energy_consumed=collapsed_thought.energy_cost,
            observer_id=observer_id,
            field_coherence_before=field_coherence_before,
            field_coherence_after=self.quantum_manager.field_coherence,
            entangled_collapses=[]
        )
        
        # Propagate collapse through entangled states
        entangled_collapses = self._propagate_entangled_collapses(superposition_id, collapsed_thought)
        collapse_event.entangled_collapses = [c.event_id for c in entangled_collapses]
        
        # Record collapse
        self.collapse_history.append(collapse_event)
        self.total_collapses += 1
        self.energy_consumed_total += collapsed_thought.energy_cost
        
        # Update average collapse time
        if len(self.collapse_history) > 1:
            time_diff = collapse_event.timestamp - self.collapse_history[-2].timestamp
            self.average_collapse_time = (self.average_collapse_time * (self.total_collapses - 1) + time_diff) / self.total_collapses
        
        print(f"🌀 Consciousness collapsed ({mode.value}): {collapsed_thought.interpretation}")
        
        return collapse_event
    
    def _consciousness_to_fbip(self, collapse_event: CollapseEvent, signal_data: Dict, context: Dict) -> EnhancedFBIPEvent:
        """Convert consciousness collapse to FBIP action"""
        
        # Determine action type based on collapsed thought
        action_type = ActionType.HIGHLIGHT_CLUSTER  # Default
        
        interpretation = collapse_event.collapsed_thought.interpretation.lower()
        
        if "create" in interpretation or "new" in interpretation:
            action_type = ActionType.GENERATE_NODE
        elif "link" in interpretation or "connect" in interpretation:
            action_type = ActionType.LINK_NODES
        elif "expand" in interpretation or "explore" in interpretation:
            action_type = ActionType.EXPAND_NODE
        elif "superposition" in interpretation:
            action_type = ActionType.CREATE_SUPERPOSITION
        elif "entangle" in interpretation:
            action_type = ActionType.ENTANGLE_NODES
        
        # Determine target network based on energy cost and type
        target_network = ConsciousnessNetwork.EXECUTIVE  # Default
        
        if collapse_event.energy_consumed > 100.0:
            target_network = ConsciousnessNetwork.EXECUTIVE  # High energy = executive
        elif "memory" in interpretation or "recall" in interpretation:
            target_network = ConsciousnessNetwork.MEMORY
        elif "sense" in interpretation or "input" in interpretation:
            target_network = ConsciousnessNetwork.SENSORY
        
        # Create action specification
        action_spec = {
            "action_type": action_type.value,
            "target_network": target_network.value,
            "target_nodes": [f"node_{int(time.time())}"],
            "parameters": {
                "collapse_mode": collapse_event.collapse_mode.value,
                "energy_cost": collapse_event.energy_consumed,
                "field_coherence": collapse_event.field_coherence_after
            },
            "priority": 7 if collapse_event.observer_id else 5
        }
        
        # Create FBIP event
        return self.protocol.create_event(signal_data, action_spec, context)
    
    def _apply_metabolic_costs(self, collapse_event: CollapseEvent):
        """Apply metabolic costs from consciousness collapse"""
        
        # Map collapse energy to metabolic networks
        if collapse_event.collapsed_thought.interpretation:
            interpretation = collapse_event.collapsed_thought.interpretation.lower()
            
            if "decision" in interpretation or "executive" in interpretation:
                network = ConsciousnessNetwork.EXECUTIVE
            elif "memory" in interpretation or "recall" in interpretation:
                network = ConsciousnessNetwork.MEMORY
            else:
                network = ConsciousnessNetwork.SENSORY
            
            # Perform consciousness work in metabolism system
            work_intensity = min(1.0, collapse_event.energy_consumed / 100.0)
            
            success = self.metabolism.consciousness_work(
                network, 
                work_intensity=work_intensity,
                duration=0.5  # Half second of work
            )
            
            if not success:
                # Metabolic stress from insufficient energy
                self.metabolism.induce_metabolic_stress(0.1)
    
    def _update_consciousness_field(self, collapse_event: CollapseEvent):
        """Update consciousness field after collapse"""
        
        # Reduce field coherence based on collapse mode
        coherence_reduction = {
            CollapseMode.NATURAL: 0.05,
            CollapseMode.OBSERVED: 0.1,
            CollapseMode.ENERGETIC: 0.15,
            CollapseMode.RESONANT: 0.02,  # Resonant collapses are gentler
            CollapseMode.HARDWARE: 0.08
        }
        
        reduction = coherence_reduction.get(collapse_event.collapse_mode, 0.1)
        self.quantum_manager.field_coherence *= (1 - reduction)
        
        # Ensure coherence doesn't go below minimum
        self.quantum_manager.field_coherence = max(0.1, self.quantum_manager.field_coherence)
    
    def _natural_collapse(self, thoughts: List[QuantumThought]) -> QuantumThought:
        """Natural decoherence-driven collapse"""
        # Shortest coherence time wins in natural collapse
        return min(thoughts, key=lambda t: t.coherence_time)
    
    def _energy_driven_collapse(self, thoughts: List[QuantumThought]) -> QuantumThought:
        """Energy depletion drives collapse to lowest cost option"""
        return min(thoughts, key=lambda t: t.energy_cost)
    
    def _resonant_collapse(self, thoughts: List[QuantumThought], context: Dict) -> QuantumThought:
        """Field resonance drives collapse to most harmonious state"""
        # Choose thought with energy cost closest to resonance frequency
        target_energy = self.field_resonance_frequency
        return min(thoughts, key=lambda t: abs(t.energy_cost - target_energy))
    
    def _hardware_collapse(self, thoughts: List[QuantumThought], context: Dict) -> QuantumThought:
        """Hardware measurement drives collapse"""
        if self.hardware_device:
            # Use hardware measurement to determine collapse
            # For now, simulate with highest probability thought
            return max(thoughts, key=lambda t: t.probability)
        else:
            # Fallback to natural collapse
            return self._natural_collapse(thoughts)
    
    def _propagate_entangled_collapses(self, collapsed_id: str, collapsed_thought: QuantumThought) -> List[CollapseEvent]:
        """Propagate collapse through quantum entangled states"""
        entangled_collapses = []
        
        # Find entangled superpositions
        entangled_states = self.quantum_manager.entanglement_network.get(collapsed_id, [])
        
        for entangled_id in entangled_states:
            if entangled_id in self.quantum_manager.superposition_states:
                # Force collapse of entangled state
                entangled_collapse = self._execute_collapse(
                    entangled_id,
                    CollapseMode.OBSERVED,  # Entanglement collapse
                    "quantum_entanglement",
                    {"entangled_with": collapsed_id}
                )
                
                if entangled_collapse:
                    entangled_collapses.append(entangled_collapse)
        
        return entangled_collapses
    
    def _assess_overall_state(self) -> ConsciousnessState:
        """Assess overall consciousness state"""
        
        superposition_count = len(self.quantum_manager.superposition_states)
        field_coherence = self.quantum_manager.field_coherence
        
        if superposition_count == 0:
            return ConsciousnessState.CLASSICAL_DEFINITE
        elif superposition_count > 3 and field_coherence > 0.8:
            return ConsciousnessState.QUANTUM_SUPERPOSITION
        elif superposition_count > 0 and field_coherence > 0.5:
            return ConsciousnessState.PARTIAL_COLLAPSE
        elif len(self.quantum_manager.entanglement_network) > 0:
            return ConsciousnessState.HYBRID_ENTANGLED
        else:
            return ConsciousnessState.DECOHERENT
    
    def _generate_random_signal(self) -> Dict:
        """Generate random neural signal for simulation"""
        
        signals = ["alpha_peak", "beta_burst", "theta_surge", "gamma_sync"]
        signal_type = np.random.choice(signals)
        
        return {
            "signal": signal_type,
            "intensity": np.random.uniform(0.3, 1.0),
            "duration_ms": np.random.randint(100, 800),
            "frequency_hz": np.random.uniform(8.0, 50.0)
        }

# Usage example and integration test
if __name__ == "__main__":
    # Create complete consciousness system
    field = ConsciousnessField(field_strength=1.0)
    quantum_manager = QuantumConsciousnessManager(field)
    metabolism = ConsciousnessMetabolism(total_nodes=32)
    protocol = FBIPProtocolV2()
    
    # Create collapse engine
    collapse_engine = ConsciousnessCollapseEngine(quantum_manager, metabolism, protocol)
    
    print("🧠 Consciousness Collapse Engine Test")
    print("=" * 50)
    
    # Test signal processing
    test_signal = {
        "signal": "gamma_sync",
        "intensity": 0.9,
        "duration_ms": 500,
        "frequency_hz": 40.0
    }
    
    test_context = {
        "user_id": "grazi",
        "user_focus": 0.8,
        "session_mode": "consciousness_exploration"
    }
    
    # Process signal
    fbip_event = collapse_engine.process_neural_signal(test_signal, test_context)
    
    if fbip_event:
        print(f"✅ FBIP Event Created: {fbip_event.action_type.value}")
        print(f"🎯 Target Network: {fbip_event.target_network.value}")
        print(f"⚡ Energy Cost: {fbip_event.consciousness_metrics.energy_cost}")
        
        # Print serialized event
        serialized = protocol.serialize_event(fbip_event)
        print("\n📋 Serialized FBIP Event:")
        print(serialized[:500] + "...")  # First 500 chars
    
    # Get overall consciousness state
    state = collapse_engine.get_consciousness_state()
    print(f"\n🌀 Overall Consciousness State:")
    print(f"Current State: {state['collapse_engine']['current_consciousness_state']}")
    print(f"Total Collapses: {state['collapse_engine']['total_collapses']}")
    print(f"Field Coherence: {state['quantum']['field']['coherence']:.3f}")
    print(f"ATP Energy: {state['metabolism']['energy_pools']['atp_available']:.1f}")