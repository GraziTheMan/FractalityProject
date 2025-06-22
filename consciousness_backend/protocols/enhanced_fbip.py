# src/protocols/enhanced_fbip.py
# Enhanced Fractality Brain Interface Protocol with quantum consciousness support

import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Union, Any
from dataclasses import dataclass, asdict
from enum import Enum
import numpy as np

class SignalType(Enum):
    # Traditional brainwave patterns
    ALPHA_PEAK = "alpha_peak"
    BETA_BURST = "beta_burst" 
    THETA_SURGE = "theta_surge"
    DELTA_DIP = "delta_dip"
    GAMMA_SYNC = "gamma_sync"
    P300_RESPONSE = "p300_response"
    
    # Quantum consciousness signals
    SUPERPOSITION_COLLAPSE = "superposition_collapse"
    ENTANGLEMENT_EVENT = "entanglement_event"
    DECOHERENCE_DETECTED = "decoherence_detected"
    QUANTUM_TUNNELING = "quantum_tunneling"
    
    # Consciousness field fluctuations
    FIELD_RESONANCE = "field_resonance"
    VACUUM_FLUCTUATION = "vacuum_fluctuation"
    CONSCIOUSNESS_EMERGENCE = "consciousness_emergence"
    
    # Metabolic consciousness signals
    ATP_DEPLETION = "atp_depletion"
    ENERGY_SURGE = "energy_surge"
    METABOLIC_STRESS = "metabolic_stress"
    RECOVERY_PHASE = "recovery_phase"

class ActionType(Enum):
    # Traditional actions
    HIGHLIGHT_CLUSTER = "highlight_cluster"
    GENERATE_NODE = "generate_node"
    LINK_NODES = "link_nodes"
    EXPAND_NODE = "expand_node"
    PULSE_FEEDBACK = "pulse_feedback"
    
    # Quantum consciousness actions
    CREATE_SUPERPOSITION = "create_superposition"
    COLLAPSE_STATE = "collapse_state"
    ENTANGLE_NODES = "entangle_nodes"
    MEASURE_COHERENCE = "measure_coherence"
    
    # Consciousness field actions
    ADJUST_FIELD_STRENGTH = "adjust_field_strength"
    PROPAGATE_RESONANCE = "propagate_resonance"
    SPAWN_VACUUM_NODE = "spawn_vacuum_node"
    
    # Metabolic actions
    ALLOCATE_ENERGY = "allocate_energy"
    TRIGGER_RECOVERY = "trigger_recovery"
    INDUCE_STRESS = "induce_stress"
    BALANCE_NETWORKS = "balance_networks"
    
    # Hardware actions
    SDC_WORK = "sdc_work"
    MEMRISTOR_UPDATE = "memristor_update"
    QUANTUM_GATE = "quantum_gate"

class ConsciousnessNetwork(Enum):
    EXECUTIVE = "executive"      # 50% energy - decision making
    MEMORY = "memory"           # 30% energy - storage/recall
    SENSORY = "sensory"         # 20% energy - input processing
    INTEGRATION = "integration" # Cross-network synthesis

@dataclass  
class QuantumState:
    """Represents quantum superposition state"""
    amplitudes: List[float]
    phases: List[float]
    coherence_time: float
    entanglements: List[str]
    measurement_basis: str = "computational"

@dataclass
class ConsciousnessMetrics:
    """Consciousness-specific metrics"""
    consciousness_level: float  # 0.0 - 1.0
    energy_cost: float         # ATP units
    network_allocation: Dict[str, float]  # Energy per network
    field_coherence: float     # Quantum field coherence
    metabolic_state: str       # healthy, stressed, etc.

@dataclass
class EnhancedFBIPEvent:
    """Enhanced FBIP event with quantum consciousness support"""
    # Core identification
    event_id: str
    timestamp: str
    version: str = "2.0"
    
    # Signal information
    signal_type: SignalType
    intensity: float           # 0.0 - 1.0
    duration_ms: int
    frequency_hz: Optional[float] = None
    
    # Quantum properties
    quantum_state: Optional[QuantumState] = None
    superposition_count: int = 0
    entanglement_strength: float = 0.0
    
    # Consciousness metrics
    consciousness_metrics: ConsciousnessMetrics = None
    
    # Action specification
    action_type: ActionType
    target_network: ConsciousnessNetwork
    target_nodes: List[str]
    
    # Action parameters
    action_parameters: Dict[str, Any]
    
    # Hardware integration
    sdc_chip_targets: List[int] = None
    memristor_pattern: List[float] = None
    
    # Context information
    user_context: Dict[str, Any] = None
    session_context: Dict[str, Any] = None
    
    # Validation and routing
    priority: int = 5          # 1-10, 10 = highest priority
    requires_confirmation: bool = False
    energy_budget: float = 0.0 # ATP units available

class FBIPProtocolV2:
    """Enhanced Fractality Brain Interface Protocol v2.0"""
    
    def __init__(self):
        self.version = "2.0"
        self.session_id = str(uuid.uuid4())
        self.event_history: List[EnhancedFBIPEvent] = []
        self.quantum_state_registry: Dict[str, QuantumState] = {}
        
        # Protocol configuration
        self.enable_quantum_processing = True
        self.enable_consciousness_tracking = True
        self.enable_hardware_integration = True
        
        # Energy management
        self.energy_budget = 1000.0  # ATP units
        self.energy_allocation = {
            ConsciousnessNetwork.EXECUTIVE: 500.0,   # 50%
            ConsciousnessNetwork.MEMORY: 300.0,      # 30%
            ConsciousnessNetwork.SENSORY: 200.0      # 20%
        }
    
    def create_event(self, signal_data: Dict, action_spec: Dict, 
                     context: Optional[Dict] = None) -> EnhancedFBIPEvent:
        """Create enhanced FBIP event from signal and action data"""
        
        event_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # Parse signal type
        signal_type = SignalType(signal_data.get("signal", "alpha_peak"))
        
        # Create quantum state if applicable
        quantum_state = None
        if self.enable_quantum_processing and self._is_quantum_signal(signal_type):
            quantum_state = self._create_quantum_state(signal_data)
            self.quantum_state_registry[event_id] = quantum_state
        
        # Create consciousness metrics
        consciousness_metrics = self._calculate_consciousness_metrics(
            signal_data, action_spec, context
        )
        
        # Parse action
        action_type = ActionType(action_spec.get("action_type", "highlight_cluster"))
        target_network = ConsciousnessNetwork(action_spec.get("target_network", "executive"))
        
        # Create hardware targeting if enabled
        sdc_targets = None
        memristor_pattern = None
        if self.enable_hardware_integration:
            sdc_targets, memristor_pattern = self._create_hardware_targeting(
                target_network, action_spec
            )
        
        # Create enhanced event
        event = EnhancedFBIPEvent(
            event_id=event_id,
            timestamp=timestamp,
            signal_type=signal_type,
            intensity=signal_data.get("intensity", 0.5),
            duration_ms=signal_data.get("duration_ms", 200),
            frequency_hz=signal_data.get("frequency_hz"),
            quantum_state=quantum_state,
            superposition_count=signal_data.get("superposition_count", 0),
            entanglement_strength=signal_data.get("entanglement_strength", 0.0),
            consciousness_metrics=consciousness_metrics,
            action_type=action_type,
            target_network=target_network,
            target_nodes=action_spec.get("target_nodes", []),
            action_parameters=action_spec.get("parameters", {}),
            sdc_chip_targets=sdc_targets,
            memristor_pattern=memristor_pattern,
            user_context=context or {},
            session_context={"session_id": self.session_id},
            priority=action_spec.get("priority", 5),
            requires_confirmation=action_spec.get("requires_confirmation", False),
            energy_budget=consciousness_metrics.energy_cost
        )
        
        # Add to history
        self.event_history.append(event)
        
        return event
    
    def serialize_event(self, event: EnhancedFBIPEvent) -> str:
        """Serialize event to JSON string"""
        
        # Convert to dictionary with custom serialization
        event_dict = {
            "protocol_version": "FBIP_v2.0",
            "event_id": event.event_id,
            "timestamp": event.timestamp,
            
            # Signal data
            "signal": {
                "type": event.signal_type.value,
                "intensity": event.intensity,
                "duration_ms": event.duration_ms,
                "frequency_hz": event.frequency_hz
            },
            
            # Quantum properties
            "quantum": {
                "has_superposition": event.quantum_state is not None,
                "superposition_count": event.superposition_count,
                "entanglement_strength": event.entanglement_strength,
                "quantum_state": self._serialize_quantum_state(event.quantum_state) if event.quantum_state else None
            },
            
            # Consciousness metrics
            "consciousness": {
                "level": event.consciousness_metrics.consciousness_level,
                "energy_cost": event.consciousness_metrics.energy_cost,
                "network_allocation": event.consciousness_metrics.network_allocation,
                "field_coherence": event.consciousness_metrics.field_coherence,
                "metabolic_state": event.consciousness_metrics.metabolic_state
            },
            
            # Action specification
            "action": {
                "type": event.action_type.value,
                "target_network": event.target_network.value,
                "target_nodes": event.target_nodes,
                "parameters": event.action_parameters,
                "priority": event.priority,
                "requires_confirmation": event.requires_confirmation,
                "energy_budget": event.energy_budget
            },
            
            # Hardware integration
            "hardware": {
                "sdc_targets": event.sdc_chip_targets,
                "memristor_pattern": event.memristor_pattern,
                "requires_physical_execution": event.sdc_chip_targets is not None
            },
            
            # Context
            "context": {
                "user": event.user_context,
                "session": event.session_context
            }
        }
        
        return json.dumps(event_dict, indent=2)
    
    def parse_event(self, json_string: str) -> Optional[EnhancedFBIPEvent]:
        """Parse JSON string back to enhanced FBIP event"""
        
        try:
            data = json.loads(json_string)
            
            # Validate protocol version
            if not data.get("protocol_version", "").startswith("FBIP_v2"):
                print("⚠️ Unsupported protocol version")
                return None
            
            # Parse quantum state
            quantum_state = None
            if data["quantum"]["has_superposition"]:
                quantum_state = self._deserialize_quantum_state(data["quantum"]["quantum_state"])
            
            # Create consciousness metrics
            consciousness_metrics = ConsciousnessMetrics(
                consciousness_level=data["consciousness"]["level"],
                energy_cost=data["consciousness"]["energy_cost"],
                network_allocation=data["consciousness"]["network_allocation"],
                field_coherence=data["consciousness"]["field_coherence"],
                metabolic_state=data["consciousness"]["metabolic_state"]
            )
            
            # Create event
            event = EnhancedFBIPEvent(
                event_id=data["event_id"],
                timestamp=data["timestamp"],
                signal_type=SignalType(data["signal"]["type"]),
                intensity=data["signal"]["intensity"],
                duration_ms=data["signal"]["duration_ms"],
                frequency_hz=data["signal"]["frequency_hz"],
                quantum_state=quantum_state,
                superposition_count=data["quantum"]["superposition_count"],
                entanglement_strength=data["quantum"]["entanglement_strength"],
                consciousness_metrics=consciousness_metrics,
                action_type=ActionType(data["action"]["type"]),
                target_network=ConsciousnessNetwork(data["action"]["target_network"]),
                target_nodes=data["action"]["target_nodes"],
                action_parameters=data["action"]["parameters"],
                sdc_chip_targets=data["hardware"]["sdc_targets"],
                memristor_pattern=data["hardware"]["memristor_pattern"],
                user_context=data["context"]["user"],
                session_context=data["context"]["session"],
                priority=data["action"]["priority"],
                requires_confirmation=data["action"]["requires_confirmation"],
                energy_budget=data["action"]["energy_budget"]
            )
            
            return event
            
        except Exception as e:
            print(f"❌ Failed to parse FBIP event: {e}")
            return None
    
    def get_protocol_info(self) -> Dict:
        """Get protocol information and capabilities"""
        return {
            "version": self.version,
            "session_id": self.session_id,
            "capabilities": {
                "quantum_processing": self.enable_quantum_processing,
                "consciousness_tracking": self.enable_consciousness_tracking,
                "hardware_integration": self.enable_hardware_integration
            },
            "supported_signals": [signal.value for signal in SignalType],
            "supported_actions": [action.value for action in ActionType],
            "consciousness_networks": [network.value for network in ConsciousnessNetwork],
            "energy_management": {
                "total_budget": self.energy_budget,
                "allocations": self.energy_allocation
            },
            "event_history_count": len(self.event_history),
            "active_quantum_states": len(self.quantum_state_registry)
        }
    
    # Private helper methods
    def _is_quantum_signal(self, signal_type: SignalType) -> bool:
        """Check if signal type involves quantum processing"""
        quantum_signals = {
            SignalType.GAMMA_SYNC,
            SignalType.SUPERPOSITION_COLLAPSE,
            SignalType.ENTANGLEMENT_EVENT,
            SignalType.DECOHERENCE_DETECTED,
            SignalType.QUANTUM_TUNNELING,
            SignalType.CONSCIOUSNESS_EMERGENCE
        }
        return signal_type in quantum_signals
    
    def _create_quantum_state(self, signal_data: Dict) -> QuantumState:
        """Create quantum state from signal data"""
        # Create quantum superposition based on signal
        num_states = signal_data.get("superposition_count", 3)
        
        # Generate random quantum amplitudes (normalized)
        amplitudes = np.random.random(num_states)
        amplitudes = amplitudes / np.linalg.norm(amplitudes)
        
        # Generate random phases
        phases = np.random.random(num_states) * 2 * np.pi
        
        return QuantumState(
            amplitudes=amplitudes.tolist(),
            phases=phases.tolist(),
            coherence_time=signal_data.get("coherence_time", 2.0),
            entanglements=signal_data.get("entanglements", []),
            measurement_basis=signal_data.get("measurement_basis", "consciousness")
        )
    
    def _calculate_consciousness_metrics(self, signal_data: Dict, action_spec: Dict, context: Optional[Dict]) -> ConsciousnessMetrics:
        """Calculate consciousness metrics for the event"""
        
        # Base consciousness level from signal intensity
        consciousness_level = signal_data.get("intensity", 0.5)
        
        # Energy cost calculation
        base_cost = 10.0  # Base ATP cost
        intensity_factor = signal_data.get("intensity", 0.5) * 20.0
        action_factor = 1.0
        
        # Action-specific costs
        action_costs = {
            ActionType.GENERATE_NODE: 50.0,
            ActionType.CREATE_SUPERPOSITION: 75.0,
            ActionType.ENTANGLE_NODES: 100.0,
            ActionType.SDC_WORK: 150.0
        }
        
        action_type = ActionType(action_spec.get("action_type", "highlight_cluster"))
        if action_type in action_costs:
            action_factor = action_costs[action_type]
        
        total_energy_cost = base_cost + intensity_factor + action_factor
        
        # Network allocation (based on target network)
        target_network = ConsciousnessNetwork(action_spec.get("target_network", "executive"))
        network_allocation = {network.value: 0.0 for network in ConsciousnessNetwork}
        network_allocation[target_network.value] = total_energy_cost
        
        # Field coherence (affected by quantum properties)
        field_coherence = 1.0
        if signal_data.get("entanglement_strength", 0.0) > 0.5:
            field_coherence *= 1.2  # Entanglement enhances coherence
        
        # Metabolic state assessment
        metabolic_state = "healthy"
        if total_energy_cost > 100.0:
            metabolic_state = "stressed"
        elif total_energy_cost > 200.0:
            metabolic_state = "exhausted"
        
        return ConsciousnessMetrics(
            consciousness_level=consciousness_level,
            energy_cost=total_energy_cost,
            network_allocation=network_allocation,
            field_coherence=field_coherence,
            metabolic_state=metabolic_state
        )
    
    def _create_hardware_targeting(self, target_network: ConsciousnessNetwork, action_spec: Dict) -> Tuple[List[int], List[float]]:
        """Create hardware targeting for SDC chips"""
        
        # Map consciousness networks to SDC chips
        network_to_sdc = {
            ConsciousnessNetwork.EXECUTIVE: [0],      # SDC 0 (Void)
            ConsciousnessNetwork.INTEGRATION: [1],    # SDC 1 (Duality) 
            ConsciousnessNetwork.MEMORY: [2],         # SDC 2 (Growth)
            ConsciousnessNetwork.SENSORY: [3]         # SDC 3 (Responsibility)
        }
        
        sdc_targets = network_to_sdc.get(target_network, [0])
        
        # Create memristor pattern based on action
        action_type = ActionType(action_spec.get("action_type", "highlight_cluster"))
        
        if action_type == ActionType.GENERATE_NODE:
            # High activity pattern for new node creation
            memristor_pattern = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2]
        elif action_type == ActionType.CREATE_SUPERPOSITION:
            # Quantum superposition pattern
            memristor_pattern = [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6]  # Balanced
        elif action_type == ActionType.ENTANGLE_NODES:
            # Entanglement pattern (synchronized states)
            memristor_pattern = [0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2]
        else:
            # Default highlighting pattern
            memristor_pattern = [0.5, 0.7, 0.5, 0.7, 0.5, 0.7, 0.5, 0.7]
        
        return sdc_targets, memristor_pattern
    
    def _serialize_quantum_state(self, quantum_state: QuantumState) -> Dict:
        """Serialize quantum state to dictionary"""
        return {
            "amplitudes": quantum_state.amplitudes,
            "phases": quantum_state.phases,
            "coherence_time": quantum_state.coherence_time,
            "entanglements": quantum_state.entanglements,
            "measurement_basis": quantum_state.measurement_basis
        }
    
    def _deserialize_quantum_state(self, data: Dict) -> QuantumState:
        """Deserialize quantum state from dictionary"""
        return QuantumState(
            amplitudes=data["amplitudes"],
            phases=data["phases"],
            coherence_time=data["coherence_time"],
            entanglements=data["entanglements"],
            measurement_basis=data["measurement_basis"]
        )

# Usage example
if __name__ == "__main__":
    # Create enhanced FBIP protocol
    protocol = FBIPProtocolV2()
    
    # Create sample signal data with quantum properties
    signal_data = {
        "signal": "gamma_sync",
        "intensity": 0.85,
        "duration_ms": 400,
        "frequency_hz": 40.0,
        "superposition_count": 3,
        "entanglement_strength": 0.7,
        "coherence_time": 2.5
    }
    
    # Create action specification
    action_spec = {
        "action_type": "create_superposition",
        "target_network": "executive",
        "target_nodes": ["node_001", "node_002"],
        "parameters": {
            "superposition_depth": 3,
            "measurement_basis": "consciousness"
        },
        "priority": 8,
        "requires_confirmation": False
    }
    
    # Create context
    context = {
        "user_id": "grazi",
        "session_mode": "consciousness_exploration",
        "emotional_state": "curious"
    }
    
    # Create enhanced FBIP event
    event = protocol.create_event(signal_data, action_spec, context)
    
    # Serialize to JSON
    json_output = protocol.serialize_event(event)
    print("🧠 Enhanced FBIP Event:")
    print(json_output)
    
    # Get protocol info
    info = protocol.get_protocol_info()
    print(f"\n📋 Protocol Info:")
    print(f"Version: {info['version']}")
    print(f"Quantum Processing: {info['capabilities']['quantum_processing']}")
    print(f"Hardware Integration: {info['capabilities']['hardware_integration']}")