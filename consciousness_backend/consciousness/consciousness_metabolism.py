# src/consciousness/consciousness_metabolism.py
# ATP-like energy system for consciousness computing - the missing biological bridge

import time
import math
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import numpy as np

class MetabolicState(Enum):
    HEALTHY = "healthy"
    STRESSED = "stressed"
    EXHAUSTED = "exhausted"
    HYPERACTIVE = "hyperactive"
    RECOVERING = "recovering"

class ConsciousnessNetwork(Enum):
    EXECUTIVE = "executive"      # 50% of energy - decision making, focus
    MEMORY = "memory"           # 30% of energy - storage, recall  
    SENSORY = "sensory"         # 20% of energy - input processing

@dataclass
class ConsciousnessNode:
    """Individual consciousness processing node with metabolic state"""
    id: str
    network_type: ConsciousnessNetwork
    energy_level: float  # 0.0 to 1.0
    max_capacity: float
    metabolic_rate: float  # ATP consumption per second
    efficiency: float  # How well energy converts to consciousness
    temperature: float  # Metabolic heat
    mitochondrial_density: float  # Energy production capacity
    
class ConsciousnessMetabolism:
    """Manages the ATP-like energy system for consciousness computing"""
    
    def __init__(self, total_nodes: int = 32):
        # Energy reserves (like ATP/ADP pools)
        self.atp_pool = 1000.0  # Available energy
        self.adp_pool = 0.0     # Depleted energy  
        self.total_capacity = 1000.0
        
        # Metabolic parameters
        self.base_metabolic_rate = 50.0  # ATP per second baseline
        self.max_metabolic_rate = 500.0  # Peak ATP consumption
        self.energy_regeneration_rate = 75.0  # ATP synthesis per second
        
        # Create consciousness nodes (mimicking neuron populations)
        self.nodes = self._initialize_nodes(total_nodes)
        
        # Network energy allocations (matching mitochondrial distribution)
        self.network_allocations = {
            ConsciousnessNetwork.EXECUTIVE: 0.50,  # 50% like cortico-striatal
            ConsciousnessNetwork.MEMORY: 0.30,     # 30% like limbic
            ConsciousnessNetwork.SENSORY: 0.20     # 20% like sensory-motor
        }
        
        # Metabolic health tracking
        self.metabolic_state = MetabolicState.HEALTHY
        self.stress_level = 0.0
        self.fatigue_accumulation = 0.0
        self.recovery_debt = 0.0
        
        # Performance metrics
        self.consciousness_efficiency = 1.0
        self.total_work_performed = 0.0
        self.energy_waste_heat = 0.0
        
        # Circadian and adaptive factors
        self.circadian_phase = 0.0  # 0-2π for daily cycle
        self.adaptation_factor = 1.0
        
    def _initialize_nodes(self, total_nodes: int) -> List[ConsciousnessNode]:
        """Initialize consciousness nodes with realistic metabolic parameters"""
        nodes = []
        
        # Distribute nodes across networks
        executive_count = int(total_nodes * 0.4)  # 40% executive nodes
        memory_count = int(total_nodes * 0.35)    # 35% memory nodes  
        sensory_count = total_nodes - executive_count - memory_count  # Remainder sensory
        
        node_id = 0
        
        # Executive network nodes (high energy, high efficiency)
        for i in range(executive_count):
            nodes.append(ConsciousnessNode(
                id=f"exec_{node_id}",
                network_type=ConsciousnessNetwork.EXECUTIVE,
                energy_level=1.0,
                max_capacity=100.0,
                metabolic_rate=15.0,  # High energy consumption
                efficiency=0.9,       # High efficiency
                temperature=37.0,
                mitochondrial_density=0.85
            ))
            node_id += 1
        
        # Memory network nodes (medium energy, high retention)
        for i in range(memory_count):
            nodes.append(ConsciousnessNode(
                id=f"mem_{node_id}",
                network_type=ConsciousnessNetwork.MEMORY,
                energy_level=1.0,
                max_capacity=80.0,
                metabolic_rate=10.0,  # Medium energy consumption
                efficiency=0.75,      # Good efficiency
                temperature=37.0,
                mitochondrial_density=0.70
            ))
            node_id += 1
        
        # Sensory network nodes (low energy, fast processing)
        for i in range(sensory_count):
            nodes.append(ConsciousnessNode(
                id=f"sens_{node_id}",
                network_type=ConsciousnessNetwork.SENSORY,
                energy_level=1.0,
                max_capacity=60.0,
                metabolic_rate=5.0,   # Low energy consumption
                efficiency=0.6,       # Lower efficiency, faster processing
                temperature=37.0,
                mitochondrial_density=0.50
            ))
            node_id += 1
            
        return nodes
    
    def consciousness_work(self, network: ConsciousnessNetwork, work_intensity: float, duration: float) -> bool:
        """Perform consciousness work, consuming ATP-like energy"""
        
        # Calculate total energy cost
        base_cost = work_intensity * duration * 10.0  # Base ATP cost
        
        # Network-specific multipliers
        network_multipliers = {
            ConsciousnessNetwork.EXECUTIVE: 1.5,   # Executive work is expensive
            ConsciousnessNetwork.MEMORY: 1.2,      # Memory work moderately expensive
            ConsciousnessNetwork.SENSORY: 0.8      # Sensory work is cheaper
        }
        
        total_cost = base_cost * network_multipliers[network]
        
        # Apply efficiency and current metabolic state
        efficiency_factor = self._get_current_efficiency(network)
        actual_cost = total_cost / efficiency_factor
        
        # Check if we have enough energy
        if self.atp_pool >= actual_cost:
            # Perform the work
            self.atp_pool -= actual_cost
            self.adp_pool += actual_cost
            
            # Update nodes in the network
            self._distribute_metabolic_load(network, work_intensity, duration)
            
            # Track work performed
            self.total_work_performed += work_intensity * duration
            
            # Generate metabolic heat
            heat_generated = actual_cost * 0.15  # 15% energy becomes heat
            self.energy_waste_heat += heat_generated
            
            print(f"🧠 Consciousness work: {network.value}")
            print(f"⚡ Energy consumed: {actual_cost:.1f} ATP")
            print(f"🔥 Heat generated: {heat_generated:.1f}")
            print(f"💡 Remaining ATP: {self.atp_pool:.1f}")
            
            return True
        else:
            # Insufficient energy - stress response
            self._trigger_energy_stress()
            print(f"⚠️ Insufficient energy for {network.value} work!")
            print(f"💔 Energy deficit: {actual_cost - self.atp_pool:.1f} ATP")
            return False
    
    def regenerate_energy(self, delta_time: float):
        """Regenerate ATP through mitochondrial-like processes"""
        
        # Base regeneration rate
        base_regen = self.energy_regeneration_rate * delta_time
        
        # Circadian modulation (higher during "rest" phases)
        circadian_factor = 0.8 + 0.4 * math.cos(self.circadian_phase)
        
        # Adaptation factor (improves with regular use)
        adaptation_bonus = self.adaptation_factor
        
        # Stress penalty
        stress_penalty = 1.0 - (self.stress_level * 0.3)
        
        # Total regeneration
        total_regen = base_regen * circadian_factor * adaptation_bonus * stress_penalty
        
        # Convert ADP back to ATP
        convertible_adp = min(self.adp_pool, total_regen)
        self.atp_pool += convertible_adp
        self.adp_pool -= convertible_adp
        
        # Cap at total capacity
        if self.atp_pool > self.total_capacity:
            self.atp_pool = self.total_capacity
            
        # Update node energy levels
        self._regenerate_node_energy(delta_time)
        
        # Reduce fatigue slightly
        self.fatigue_accumulation *= 0.99
        
        # Update circadian phase
        self.circadian_phase += (2 * math.pi * delta_time) / (24 * 3600)  # 24 hour cycle
        if self.circadian_phase > 2 * math.pi:
            self.circadian_phase -= 2 * math.pi
    
    def get_network_energy_status(self, network: ConsciousnessNetwork) -> Dict:
        """Get detailed energy status for a specific consciousness network"""
        network_nodes = [node for node in self.nodes if node.network_type == network]
        
        if not network_nodes:
            return {}
        
        total_energy = sum(node.energy_level for node in network_nodes)
        max_energy = sum(node.max_capacity for node in network_nodes)
        avg_efficiency = sum(node.efficiency for node in network_nodes) / len(network_nodes)
        avg_temperature = sum(node.temperature for node in network_nodes) / len(network_nodes)
        
        return {
            "network": network.value,
            "node_count": len(network_nodes),
            "energy_percentage": (total_energy / max_energy) * 100,
            "average_efficiency": avg_efficiency,
            "average_temperature": avg_temperature,
            "allocated_energy": self.atp_pool * self.network_allocations[network],
            "metabolic_state": self._assess_network_health(network_nodes)
        }
    
    def get_metabolism_metrics(self) -> Dict:
        """Get comprehensive consciousness metabolism metrics"""
        return {
            "energy_pools": {
                "atp_available": self.atp_pool,
                "adp_depleted": self.adp_pool,
                "total_capacity": self.total_capacity,
                "energy_percentage": (self.atp_pool / self.total_capacity) * 100
            },
            "metabolic_state": {
                "state": self.metabolic_state.value,
                "stress_level": self.stress_level,
                "fatigue_accumulation": self.fatigue_accumulation,
                "efficiency": self.consciousness_efficiency
            },
            "performance": {
                "total_work_performed": self.total_work_performed,
                "energy_waste_heat": self.energy_waste_heat,
                "adaptation_factor": self.adaptation_factor
            },
            "networks": {
                "executive": self.get_network_energy_status(ConsciousnessNetwork.EXECUTIVE),
                "memory": self.get_network_energy_status(ConsciousnessNetwork.MEMORY), 
                "sensory": self.get_network_energy_status(ConsciousnessNetwork.SENSORY)
            },
            "circadian": {
                "phase": self.circadian_phase,
                "energy_multiplier": 0.8 + 0.4 * math.cos(self.circadian_phase)
            }
        }
    
    def induce_metabolic_stress(self, stress_intensity: float):
        """Simulate metabolic stress (overwork, lack of rest, etc.)"""
        self.stress_level = min(1.0, self.stress_level + stress_intensity)
        self.fatigue_accumulation += stress_intensity * 0.5
        
        # Stress damages efficiency
        self.consciousness_efficiency *= (1.0 - stress_intensity * 0.1)
        self.consciousness_efficiency = max(0.3, self.consciousness_efficiency)
        
        # Update metabolic state
        if self.stress_level > 0.8:
            self.metabolic_state = MetabolicState.EXHAUSTED
        elif self.stress_level > 0.5:
            self.metabolic_state = MetabolicState.STRESSED
        
        print(f"😰 Metabolic stress induced: {stress_intensity:.2f}")
        print(f"📉 Consciousness efficiency: {self.consciousness_efficiency:.2f}")
    
    def rest_and_recovery(self, rest_duration: float):
        """Simulate rest period for metabolic recovery"""
        # Enhanced regeneration during rest
        recovery_bonus = 2.0
        enhanced_regen = self.energy_regeneration_rate * recovery_bonus * rest_duration
        
        # Restore ATP
        self.atp_pool = min(self.total_capacity, self.atp_pool + enhanced_regen)
        
        # Reduce stress and fatigue
        self.stress_level *= 0.7
        self.fatigue_accumulation *= 0.5
        
        # Improve efficiency
        self.consciousness_efficiency = min(1.0, self.consciousness_efficiency + 0.1)
        
        # Update metabolic state
        if self.stress_level < 0.2:
            self.metabolic_state = MetabolicState.HEALTHY
        elif self.stress_level < 0.5:
            self.metabolic_state = MetabolicState.RECOVERING
        
        print(f"😴 Rest period: {rest_duration:.1f}s")
        print(f"🔋 Energy restored: {enhanced_regen:.1f} ATP")
        print(f"😌 Stress reduced to: {self.stress_level:.2f}")
    
    # Private helper methods
    def _get_current_efficiency(self, network: ConsciousnessNetwork) -> float:
        """Calculate current efficiency for a network"""
        network_nodes = [node for node in self.nodes if node.network_type == network]
        base_efficiency = sum(node.efficiency for node in network_nodes) / len(network_nodes)
        
        # Apply current metabolic state modifiers
        state_modifiers = {
            MetabolicState.HEALTHY: 1.0,
            MetabolicState.STRESSED: 0.8,
            MetabolicState.EXHAUSTED: 0.5,
            MetabolicState.HYPERACTIVE: 1.2,
            MetabolicState.RECOVERING: 0.9
        }
        
        return base_efficiency * state_modifiers[self.metabolic_state]
    
    def _distribute_metabolic_load(self, network: ConsciousnessNetwork, intensity: float, duration: float):
        """Distribute metabolic load across nodes in a network"""
        network_nodes = [node for node in self.nodes if node.network_type == network]
        
        for node in network_nodes:
            # Calculate node-specific energy consumption
            node_cost = intensity * duration * node.metabolic_rate * 0.1
            
            # Reduce node energy
            node.energy_level = max(0.0, node.energy_level - node_cost / node.max_capacity)
            
            # Increase temperature from work
            temperature_increase = node_cost * 0.01
            node.temperature += temperature_increase
    
    def _regenerate_node_energy(self, delta_time: float):
        """Regenerate energy for individual nodes"""
        for node in self.nodes:
            # Regeneration based on mitochondrial density
            regen_rate = node.mitochondrial_density * 0.1 * delta_time
            node.energy_level = min(1.0, node.energy_level + regen_rate)
            
            # Cool down temperature
            cooling_rate = 0.05 * delta_time
            node.temperature = max(37.0, node.temperature - cooling_rate)
    
    def _trigger_energy_stress(self):
        """Handle energy depletion stress response"""
        self.stress_level = min(1.0, self.stress_level + 0.1)
        self.fatigue_accumulation += 0.05
        
        # Emergency energy allocation
        if self.adp_pool > 10.0:
            emergency_energy = min(10.0, self.adp_pool)
            self.atp_pool += emergency_energy
            self.adp_pool -= emergency_energy
            print("🚨 Emergency energy allocation activated!")
    
    def _assess_network_health(self, network_nodes: List[ConsciousnessNode]) -> str:
        """Assess the metabolic health of a network"""
        avg_energy = sum(node.energy_level for node in network_nodes) / len(network_nodes)
        avg_temp = sum(node.temperature for node in network_nodes) / len(network_nodes)
        
        if avg_energy > 0.8 and avg_temp < 38.0:
            return "optimal"
        elif avg_energy > 0.5 and avg_temp < 39.0:
            return "good" 
        elif avg_energy > 0.3:
            return "stressed"
        else:
            return "depleted"

# Usage example
if __name__ == "__main__":
    # Create consciousness metabolism system
    metabolism = ConsciousnessMetabolism(total_nodes=32)
    
    # Simulate consciousness work
    print("🧠 Performing executive consciousness work...")
    success = metabolism.consciousness_work(
        ConsciousnessNetwork.EXECUTIVE, 
        work_intensity=0.8, 
        duration=2.0
    )
    
    # Check metabolism status
    metrics = metabolism.get_metabolism_metrics()
    print("\n📊 Metabolism Metrics:")
    print(f"ATP Pool: {metrics['energy_pools']['atp_available']:.1f}")
    print(f"Metabolic State: {metrics['metabolic_state']['state']}")
    print(f"Executive Network: {metrics['networks']['executive']['energy_percentage']:.1f}%")
    
    # Simulate time passing and regeneration
    print("\n⏰ Time passing... regenerating energy...")
    metabolism.regenerate_energy(5.0)  # 5 seconds
    
    # Check recovery
    new_metrics = metabolism.get_metabolism_metrics()
    print(f"ATP Pool After Recovery: {new_metrics['energy_pools']['atp_available']:.1f}")