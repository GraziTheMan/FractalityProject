# src/consciousness/consciousness_metabolism_v2.py
# Production-ready consciousness metabolism with thermal management and power awareness

import time
import math
import threading
import logging
from typing import Dict, List, Optional, Tuple, Callable
from dataclasses import dataclass, field
from enum import Enum
import numpy as np
from collections import deque
import warnings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MetabolicState(Enum):
    HEALTHY = "healthy"
    STRESSED = "stressed"
    EXHAUSTED = "exhausted"
    HYPERACTIVE = "hyperactive"
    RECOVERING = "recovering"
    OVERHEATED = "overheated"
    EMERGENCY = "emergency"
    POWER_SAVE = "power_save"

class ConsciousnessNetwork(Enum):
    EXECUTIVE = "executive"      # 50% of energy - decision making, focus
    MEMORY = "memory"           # 30% of energy - storage, recall  
    SENSORY = "sensory"         # 20% of energy - input processing

class ThermalState(Enum):
    OPTIMAL = "optimal"         # < 40°C
    WARM = "warm"              # 40-50°C
    HOT = "hot"                # 50-65°C
    CRITICAL = "critical"       # 65-75°C
    EMERGENCY = "emergency"     # > 75°C

@dataclass
class ThermalProfile:
    """Thermal characteristics of consciousness hardware"""
    ambient_temp: float = 25.0          # Ambient temperature (°C)
    max_safe_temp: float = 65.0         # Maximum safe operating temperature
    thermal_mass: float = 50.0          # Thermal mass (J/°C)
    cooling_coefficient: float = 0.1    # Cooling rate (°C/s per degree above ambient)
    power_to_heat_ratio: float = 0.8    # Watts to °C conversion factor
    
    # Temperature-dependent performance scaling
    temp_thresholds: Dict[str, float] = field(default_factory=lambda: {
        "optimal": 40.0,
        "warning": 50.0,
        "throttle": 65.0,
        "emergency": 75.0,
        "shutdown": 85.0
    })

@dataclass
class PowerProfile:
    """Power consumption characteristics"""
    base_power: float = 2.0             # Base power consumption (W)
    max_power: float = 15.0             # Maximum sustainable power (W)
    peak_power: float = 25.0            # Peak power for short bursts (W)
    
    # Network-specific power scaling
    network_power_factors: Dict[ConsciousnessNetwork, float] = field(default_factory=lambda: {
        ConsciousnessNetwork.EXECUTIVE: 1.5,    # Executive work is power-hungry
        ConsciousnessNetwork.MEMORY: 1.0,       # Memory is moderate
        ConsciousnessNetwork.SENSORY: 0.7       # Sensory is efficient
    })
    
    # Battery characteristics
    battery_capacity_wh: float = 50.0   # 50Wh battery
    battery_voltage: float = 5.0        # 5V nominal
    low_battery_threshold: float = 0.2  # 20% remaining

@dataclass
class ConsciousnessNode:
    """Individual consciousness processing node with thermal and power awareness"""
    id: str
    network_type: ConsciousnessNetwork
    energy_level: float = 1.0           # 0.0 to 1.0
    max_capacity: float = 100.0
    metabolic_rate: float = 10.0        # ATP consumption per second
    efficiency: float = 0.8             # Energy conversion efficiency
    temperature: float = 37.0           # Current temperature (°C)
    mitochondrial_density: float = 0.7  # Energy production capacity
    
    # Thermal properties
    thermal_resistance: float = 1.0     # °C/W thermal resistance
    max_temperature: float = 65.0       # Maximum safe temperature
    
    # Power properties
    base_power: float = 0.1             # Idle power consumption (W)
    active_power: float = 0.5           # Active power consumption (W)
    
    # Performance tracking
    work_performed: float = 0.0         # Total work done
    thermal_stress: float = 0.0         # Accumulated thermal stress
    last_update: float = field(default_factory=time.time)
    
    def update_temperature(self, ambient_temp: float, power_dissipation: float, delta_time: float):
        """Update node temperature based on power dissipation and cooling"""
        # Heat generation from power
        heat_generated = power_dissipation * self.thermal_resistance
        
        # Cooling based on temperature differential
        cooling_rate = (self.temperature - ambient_temp) * 0.1  # Natural cooling
        
        # Temperature update with thermal mass
        temp_change = (heat_generated - cooling_rate) * delta_time / 10.0  # Simplified thermal mass
        self.temperature += temp_change
        
        # Accumulate thermal stress if above optimal
        if self.temperature > 45.0:
            self.thermal_stress += (self.temperature - 45.0) * delta_time * 0.01
        
        self.last_update = time.time()
    
    def get_thermal_throttle_factor(self) -> float:
        """Get performance throttling factor based on temperature"""
        if self.temperature < 40.0:
            return 1.0  # No throttling
        elif self.temperature < 50.0:
            return 0.95  # Slight throttling
        elif self.temperature < 65.0:
            return 0.8   # Moderate throttling
        elif self.temperature < 75.0:
            return 0.5   # Heavy throttling
        else:
            return 0.1   # Emergency throttling

class ConsciousnessMetabolism:
    """Production-ready consciousness metabolism with thermal and power management"""
    
    def __init__(self, total_nodes: int = 32, thermal_profile: Optional[ThermalProfile] = None, 
                 power_profile: Optional[PowerProfile] = None):
        
        # Thread safety
        self._lock = threading.RLock()
        
        # Energy reserves with conservation laws
        self.atp_pool = 1000.0
        self.adp_pool = 0.0
        self.total_capacity = 1000.0
        self.energy_conservation_constant = self.total_capacity  # Energy cannot be created/destroyed
        
        # Metabolic parameters with bounds
        self.base_metabolic_rate = 50.0
        self.max_metabolic_rate = 500.0
        self.energy_regeneration_rate = 75.0
        
        # Initialize thermal and power management
        self.thermal_profile = thermal_profile or ThermalProfile()
        self.power_profile = power_profile or PowerProfile()
        
        # Current thermal state
        self.current_temperature = self.thermal_profile.ambient_temp
        self.thermal_state = ThermalState.OPTIMAL
        self.thermal_history = deque(maxlen=1000)  # Keep 1000 temperature readings
        
        # Power management
        self.current_power_consumption = self.power_profile.base_power
        self.battery_level = 1.0  # 100% charge
        self.power_budget = self.power_profile.max_power
        self.power_history = deque(maxlen=1000)
        
        # Create consciousness nodes with thermal/power awareness
        self.nodes = self._initialize_nodes_with_thermal(total_nodes)
        
        # Network energy allocations with conservation
        self.network_allocations = {
            ConsciousnessNetwork.EXECUTIVE: 0.50,
            ConsciousnessNetwork.MEMORY: 0.30,
            ConsciousnessNetwork.SENSORY: 0.20
        }
        
        # Metabolic health tracking
        self.metabolic_state = MetabolicState.HEALTHY
        self.stress_level = 0.0
        self.fatigue_accumulation = 0.0
        self.recovery_debt = 0.0
        
        # Performance metrics with bounds checking
        self.consciousness_efficiency = 1.0
        self.total_work_performed = 0.0
        self.energy_waste_heat = 0.0
        
        # Circadian and adaptive factors
        self.circadian_phase = 0.0
        self.adaptation_factor = 1.0
        
        # Emergency systems
        self.emergency_shutdown_triggered = False
        self.thermal_throttling_active = False
        self.low_power_mode = False
        
        # Monitoring and alerts
        self.alert_callbacks: List[Callable] = []
        self.last_health_check = time.time()
        self.health_check_interval = 5.0  # Check every 5 seconds
        
        logger.info(f"Consciousness metabolism initialized with {total_nodes} nodes, "
                   f"thermal management, and power awareness")
    
    def consciousness_work(self, network: ConsciousnessNetwork, work_intensity: float, 
                          duration: float, priority: int = 5) -> bool:
        """Perform consciousness work with thermal and power constraints"""
        
        with self._lock:
            try:
                # Validate inputs
                if not (0.0 <= work_intensity <= 1.0):
                    logger.warning(f"Invalid work intensity: {work_intensity}, clamping to [0,1]")
                    work_intensity = max(0.0, min(1.0, work_intensity))
                
                if duration <= 0:
                    logger.warning(f"Invalid duration: {duration}")
                    return False
                
                # Check emergency conditions
                if self.emergency_shutdown_triggered:
                    logger.error("Emergency shutdown active - rejecting work request")
                    return False
                
                # Check thermal throttling
                thermal_factor = self._get_thermal_throttle_factor()
                if thermal_factor < 0.5:
                    logger.warning(f"Heavy thermal throttling active: {thermal_factor:.2f}")
                
                # Check power budget
                if not self._check_power_budget(network, work_intensity, duration):
                    logger.warning("Insufficient power budget for requested work")
                    if not self._enter_low_power_mode():
                        return False
                
                # Calculate energy cost with all factors
                base_cost = work_intensity * duration * 10.0
                
                # Network-specific multipliers
                network_multipliers = {
                    ConsciousnessNetwork.EXECUTIVE: 1.5,
                    ConsciousnessNetwork.MEMORY: 1.2,
                    ConsciousnessNetwork.SENSORY: 0.8
                }
                
                # Apply all scaling factors
                total_cost = (base_cost * 
                             network_multipliers[network] * 
                             (1.0 / thermal_factor) *  # Higher cost when hot
                             (1.0 / self._get_current_efficiency(network)))
                
                # Energy conservation check
                if not self._validate_energy_conservation(total_cost):
                    logger.error("Energy conservation violation detected")
                    return False
                
                # Check energy availability with safety margin
                safety_margin = 50.0  # Keep 50 ATP in reserve
                if self.atp_pool < (total_cost + safety_margin):
                    logger.warning(f"Insufficient energy: need {total_cost:.1f}, have {self.atp_pool:.1f}")
                    return False
                
                # Perform the work
                self.atp_pool -= total_cost
                self.adp_pool += total_cost
                
                # Calculate power consumption
                power_consumed = self._calculate_power_consumption(network, work_intensity, duration)
                self._update_thermal_state(power_consumed, duration)
                self._update_battery_level(power_consumed, duration)
                
                # Update nodes in the network
                self._distribute_metabolic_load(network, work_intensity, duration, thermal_factor)
                
                # Track work performed
                self.total_work_performed += work_intensity * duration
                
                # Generate metabolic heat with conservation
                heat_generated = total_cost * 0.15  # 15% energy becomes heat
                self.energy_waste_heat += heat_generated
                self.current_temperature += heat_generated * 0.01  # Simplified heating
                
                # Update metabolic state
                self._update_metabolic_state()
                
                # Check for alerts
                self._check_and_trigger_alerts()
                
                logger.debug(f"Consciousness work completed: {network.value}, "
                            f"intensity={work_intensity:.2f}, cost={total_cost:.1f}")
                
                return True
                
            except Exception as e:
                logger.error(f"Error performing consciousness work: {e}")
                return False
    
    def regenerate_energy(self, delta_time: float):
        """Regenerate ATP with thermal and power constraints"""
        
        with self._lock:
            try:
                # Validate delta_time
                delta_time = max(0.0, min(10.0, delta_time))  # Reasonable bounds
                
                # Base regeneration rate
                base_regen = self.energy_regeneration_rate * delta_time
                
                # Thermal modulation (reduced regeneration when hot)
                thermal_factor = self._get_thermal_efficiency_factor()
                
                # Power availability factor
                power_factor = 1.0 if not self.low_power_mode else 0.5
                
                # Circadian modulation
                circadian_factor = 0.8 + 0.4 * math.cos(self.circadian_phase)
                
                # Adaptation factor (improves with regular use)
                adaptation_bonus = self.adaptation_factor
                
                # Stress penalty
                stress_penalty = 1.0 - (self.stress_level * 0.3)
                
                # Total regeneration with all factors
                total_regen = (base_regen * thermal_factor * power_factor * 
                              circadian_factor * adaptation_bonus * stress_penalty)
                
                # Convert ADP back to ATP with conservation
                convertible_adp = min(self.adp_pool, total_regen)
                self.atp_pool += convertible_adp
                self.adp_pool -= convertible_adp
                
                # Validate energy conservation
                total_energy = self.atp_pool + self.adp_pool
                if abs(total_energy - self.energy_conservation_constant) > 1.0:
                    logger.warning(f"Energy conservation violation detected: {total_energy:.1f} != {self.energy_conservation_constant:.1f}")
                    # Correct the violation
                    excess = total_energy - self.energy_conservation_constant
                    self.atp_pool -= excess * 0.5
                    self.adp_pool -= excess * 0.5
                
                # Cap at total capacity
                if self.atp_pool > self.total_capacity:
                    self.atp_pool = self.total_capacity
                
                # Update node energy levels and temperatures
                self._regenerate_node_energy_thermal(delta_time)
                
                # Reduce fatigue and stress slightly
                self.fatigue_accumulation *= 0.99
                if self.thermal_state in [ThermalState.OPTIMAL, ThermalState.WARM]:
                    self.stress_level *= 0.995  # Stress reduces when cool
                
                # Update circadian phase
                self.circadian_phase += (2 * math.pi * delta_time) / (24 * 3600)
                if self.circadian_phase > 2 * math.pi:
                    self.circadian_phase -= 2 * math.pi
                
                # Update thermal and power states
                self._update_thermal_state(self.power_profile.base_power, delta_time)
                self._natural_cooling(delta_time)
                
                # Periodic health check
                if time.time() - self.last_health_check > self.health_check_interval:
                    self._run_health_check()
                    self.last_health_check = time.time()
                
            except Exception as e:
                logger.error(f"Error during energy regeneration: {e}")
    
    def get_comprehensive_metrics(self) -> Dict:
        """Get comprehensive metrics including thermal and power data"""
        
        with self._lock:
            try:
                # Basic metabolism metrics
                base_metrics = {
                    "energy_pools": {
                        "atp_available": self.atp_pool,
                        "adp_depleted": self.adp_pool,
                        "total_capacity": self.total_capacity,
                        "energy_percentage": (self.atp_pool / self.total_capacity) * 100,
                        "energy_conservation_check": abs((self.atp_pool + self.adp_pool) - self.energy_conservation_constant) < 1.0
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
                    }
                }
                
                # Thermal metrics
                thermal_metrics = {
                    "thermal": {
                        "current_temperature": self.current_temperature,
                        "thermal_state": self.thermal_state.value,
                        "ambient_temperature": self.thermal_profile.ambient_temp,
                        "max_safe_temperature": self.thermal_profile.max_safe_temp,
                        "thermal_throttling_active": self.thermal_throttling_active,
                        "thermal_efficiency_factor": self._get_thermal_efficiency_factor(),
                        "average_node_temperature": self._get_average_node_temperature(),
                        "hottest_node_temp": max(node.temperature for node in self.nodes) if self.nodes else 0.0
                    }
                }
                
                # Power metrics
                power_metrics = {
                    "power": {
                        "current_consumption_w": self.current_power_consumption,
                        "power_budget_w": self.power_budget,
                        "battery_level_percent": self.battery_level * 100,
                        "battery_capacity_wh": self.power_profile.battery_capacity_wh,
                        "estimated_runtime_hours": self._estimate_runtime_hours(),
                        "low_power_mode": self.low_power_mode,
                        "power_efficiency": self._calculate_power_efficiency()
                    }
                }
                
                # Network-specific metrics
                network_metrics = {
                    "networks": {
                        "executive": self.get_network_energy_status(ConsciousnessNetwork.EXECUTIVE),
                        "memory": self.get_network_energy_status(ConsciousnessNetwork.MEMORY),
                        "sensory": self.get_network_energy_status(ConsciousnessNetwork.SENSORY)
                    }
                }
                
                # Safety and emergency metrics
                safety_metrics = {
                    "safety": {
                        "emergency_shutdown": self.emergency_shutdown_triggered,
                        "thermal_emergency": self.thermal_state == ThermalState.EMERGENCY,
                        "low_battery_warning": self.battery_level < self.power_profile.low_battery_threshold,
                        "stress_warning": self.stress_level > 0.7,
                        "overall_safety_status": self._get_overall_safety_status()
                    }
                }
                
                # Circadian metrics
                circadian_metrics = {
                    "circadian": {
                        "phase": self.circadian_phase,
                        "energy_multiplier": 0.8 + 0.4 * math.cos(self.circadian_phase),
                        "optimal_performance_window": self._is_optimal_circadian_window()
                    }
                }
                
                # Combine all metrics
                comprehensive = {**base_metrics, **thermal_metrics, **power_metrics, 
                               **network_metrics, **safety_metrics, **circadian_metrics}
                
                return comprehensive
                
            except Exception as e:
                logger.error(f"Error getting comprehensive metrics: {e}")
                return {"error": str(e)}
    
    def emergency_shutdown(self, reason: str = "Thermal emergency"):
        """Emergency shutdown of consciousness system"""
        
        with self._lock:
            logger.critical(f"EMERGENCY SHUTDOWN: {reason}")
            
            self.emergency_shutdown_triggered = True
            self.metabolic_state = MetabolicState.EMERGENCY
            
            # Reduce all node activity to minimum
            for node in self.nodes:
                node.energy_level = 0.1  # Minimal energy to maintain basic functions
                node.efficiency = 0.1
            
            # Trigger all alert callbacks
            for callback in self.alert_callbacks:
                try:
                    callback("EMERGENCY_SHUTDOWN", {"reason": reason})
                except Exception as e:
                    logger.error(f"Error calling alert callback: {e}")
    
    def add_alert_callback(self, callback: Callable):
        """Add callback for thermal/power alerts"""
        self.alert_callbacks.append(callback)
    
    # Private helper methods
    
    def _initialize_nodes_with_thermal(self, total_nodes: int) -> List[ConsciousnessNode]:
        """Initialize consciousness nodes with thermal and power characteristics"""
        nodes = []
        
        # Distribute nodes across networks
        executive_count = int(total_nodes * 0.4)
        memory_count = int(total_nodes * 0.35)
        sensory_count = total_nodes - executive_count - memory_count
        
        node_id = 0
        
        # Executive network nodes (high power, high heat)
        for i in range(executive_count):
            nodes.append(ConsciousnessNode(
                id=f"exec_{node_id}",
                network_type=ConsciousnessNetwork.EXECUTIVE,
                energy_level=1.0,
                max_capacity=100.0,
                metabolic_rate=15.0,
                efficiency=0.9,
                temperature=self.thermal_profile.ambient_temp + 2.0,  # Slightly warmer
                mitochondrial_density=0.85,
                thermal_resistance=1.2,  # Higher thermal resistance (gets hotter)
                max_temperature=60.0,
                base_power=0.15,
                active_power=0.8
            ))
            node_id += 1
        
        # Memory network nodes (medium power, medium heat)
        for i in range(memory_count):
            nodes.append(ConsciousnessNode(
                id=f"mem_{node_id}",
                network_type=ConsciousnessNetwork.MEMORY,
                energy_level=1.0,
                max_capacity=80.0,
                metabolic_rate=10.0,
                efficiency=0.75,
                temperature=self.thermal_profile.ambient_temp + 1.0,
                mitochondrial_density=0.70,
                thermal_resistance=1.0,
                max_temperature=65.0,
                base_power=0.1,
                active_power=0.5
            ))
            node_id += 1
        
        # Sensory network nodes (low power, low heat)
        for i in range(sensory_count):
            nodes.append(ConsciousnessNode(
                id=f"sens_{node_id}",
                network_type=ConsciousnessNetwork.SENSORY,
                energy_level=1.0,
                max_capacity=60.0,
                metabolic_rate=5.0,
                efficiency=0.6,
                temperature=self.thermal_profile.ambient_temp,
                mitochondrial_density=0.50,
                thermal_resistance=0.8,  # Better thermal dissipation
                max_temperature=70.0,
                base_power=0.05,
                active_power=0.3
            ))
            node_id += 1
        
        return nodes
    
    def _get_thermal_throttle_factor(self) -> float:
        """Get system-wide thermal throttling factor"""
        temp_thresholds = self.thermal_profile.temp_thresholds
        
        if self.current_temperature < temp_thresholds["optimal"]:
            return 1.0
        elif self.current_temperature < temp_thresholds["warning"]:
            return 0.95
        elif self.current_temperature < temp_thresholds["throttle"]:
            return 0.8
        elif self.current_temperature < temp_thresholds["emergency"]:
            return 0.5
        else:
            return 0.1
    
    def _get_thermal_efficiency_factor(self) -> float:
        """Get efficiency factor based on thermal state"""
        temp_thresholds = self.thermal_profile.temp_thresholds
        
        if self.current_temperature < temp_thresholds["optimal"]:
            return 1.0
        elif self.current_temperature < temp_thresholds["warning"]:
            return 0.9
        elif self.current_temperature < temp_thresholds["throttle"]:
            return 0.7
        else:
            return 0.5
    
    def _check_power_budget(self, network: ConsciousnessNetwork, intensity: float, duration: float) -> bool:
        """Check if work fits within power budget"""
        power_factor = self.power_profile.network_power_factors[network]
        estimated_power = intensity * power_factor * 5.0  # Estimate 5W max per unit intensity
        
        return self.current_power_consumption + estimated_power <= self.power_budget
    
    def _calculate_power_consumption(self, network: ConsciousnessNetwork, intensity: float, duration: float) -> float:
        """Calculate power consumption for consciousness work"""
        base_power = self.power_profile.base_power
        power_factor = self.power_profile.network_power_factors[network]
        
        # Calculate additional power for this work
        additional_power = intensity * power_factor * duration * 2.0  # 2W per unit intensity-time
        
        return base_power + additional_power
    
    def _update_thermal_state(self, power_consumed: float, duration: float):
        """Update thermal state based on power consumption"""
        # Heat generation (simplified model)
        heat_generated = power_consumed * self.thermal_profile.power_to_heat_ratio * duration
        
        # Update temperature
        temp_increase = heat_generated / self.thermal_profile.thermal_mass
        self.current_temperature += temp_increase
        
        # Update thermal state enum
        temp_thresholds = self.thermal_profile.temp_thresholds
        
        if self.current_temperature < temp_thresholds["optimal"]:
            self.thermal_state = ThermalState.OPTIMAL
        elif self.current_temperature < temp_thresholds["warning"]:
            self.thermal_state = ThermalState.WARM
        elif self.current_temperature < temp_thresholds["throttle"]:
            self.thermal_state = ThermalState.HOT
        elif self.current_temperature < temp_thresholds["emergency"]:
            self.thermal_state = ThermalState.CRITICAL
        else:
            self.thermal_state = ThermalState.EMERGENCY
            if not self.emergency_shutdown_triggered:
                self.emergency_shutdown("Temperature exceeded safe limits")
        
        # Update thermal throttling
        self.thermal_throttling_active = self.current_temperature > temp_thresholds["warning"]
        
        # Record thermal history
        self.thermal_history.append({
            "timestamp": time.time(),
            "temperature": self.current_temperature,
            "power": power_consumed,
            "state": self.thermal_state.value
        })
    
    def _natural_cooling(self, delta_time: float):
        """Apply natural cooling over time"""
        temp_diff = self.current_temperature - self.thermal_profile.ambient_temp
        cooling_rate = temp_diff * self.thermal_profile.cooling_coefficient * delta_time
        
        self.current_temperature -= cooling_rate
        self.current_temperature = max(self.thermal_profile.ambient_temp, self.current_temperature)
    
    def _update_battery_level(self, power_consumed: float, duration: float):
        """Update battery level based on power consumption"""
        energy_consumed_wh = (power_consumed * duration) / 3600.0  # Convert to Wh
        
        battery_drain = energy_consumed_wh / self.power_profile.battery_capacity_wh
        self.battery_level = max(0.0, self.battery_level - battery_drain)
        
        # Check for low battery
        if self.battery_level < self.power_profile.low_battery_threshold and not self.low_power_mode:
            logger.warning("Low battery detected, entering power save mode")
            self._enter_low_power_mode()
        
        # Record power history
        self.power_history.append({
            "timestamp": time.time(),
            "power": power_consumed,
            "battery_level": self.battery_level,
            "energy_consumed_wh": energy_consumed_wh
        })
    
    def _enter_low_power_mode(self) -> bool:
        """Enter low power mode to conserve battery"""
        if not self.low_power_mode:
            self.low_power_mode = True
            self.power_budget = self.power_profile.max_power * 0.5  # Reduce power budget
            self.energy_regeneration_rate *= 0.7  # Reduce regeneration
            
            logger.info("Entered low power mode")
            return True
        return False
    
    def _estimate_runtime_hours(self) -> float:
        """Estimate remaining runtime in hours"""
        if self.current_power_consumption <= 0:
            return float('inf')
        
        remaining_capacity = self.battery_level * self.power_profile.battery_capacity_wh
        return remaining_capacity / self.current_power_consumption
    
    def _calculate_power_efficiency(self) -> float:
        """Calculate overall power efficiency"""
        if self.current_power_consumption <= 0:
            return 1.0
        
        useful_work_power = self.total_work_performed * 0.1  # Arbitrary scaling
        return min(1.0, useful_work_power / self.current_power_consumption)
    
    def _get_average_node_temperature(self) -> float:
        """Get average temperature across all nodes"""
        if not self.nodes:
            return self.thermal_profile.ambient_temp
        
        return sum(node.temperature for node in self.nodes) / len(self.nodes)
    
    def _validate_energy_conservation(self, energy_cost: float) -> bool:
        """Validate that energy operation preserves conservation"""
        total_before = self.atp_pool + self.adp_pool
        total_after = (self.atp_pool - energy_cost) + (self.adp_pool + energy_cost)
        
        return abs(total_before - total_after) < 0.001  # Allow for floating point precision
    
    def _get_current_efficiency(self, network: ConsciousnessNetwork) -> float:
        """Get current efficiency for a network including all factors"""
        network_nodes = [node for node in self.nodes if node.network_type == network]
        if not network_nodes:
            return 0.5
        
        base_efficiency = sum(node.efficiency for node in network_nodes) / len(network_nodes)
        
        # Apply thermal throttling
        thermal_factor = self._get_thermal_efficiency_factor()
        
        # Apply metabolic state modifiers
        state_modifiers = {
            MetabolicState.HEALTHY: 1.0,
            MetabolicState.STRESSED: 0.8,
            MetabolicState.EXHAUSTED: 0.5,
            MetabolicState.HYPERACTIVE: 1.2,
            MetabolicState.RECOVERING: 0.9,
            MetabolicState.OVERHEATED: 0.6,
            MetabolicState.EMERGENCY: 0.2,
            MetabolicState.POWER_SAVE: 0.7
        }
        
        return base_efficiency * thermal_factor * state_modifiers[self.metabolic_state]
    
    def _distribute_metabolic_load(self, network: ConsciousnessNetwork, intensity: float, 
                                  duration: float, thermal_factor: float):
        """Distribute metabolic load across nodes with thermal considerations"""
        network_nodes = [node for node in self.nodes if node.network_type == network]
        
        for node in network_nodes:
            # Calculate node-specific energy consumption
            node_cost = intensity * duration * node.metabolic_rate * 0.1
            
            # Apply thermal throttling to node
            node_thermal_factor = node.get_thermal_throttle_factor()
            adjusted_cost = node_cost / node_thermal_factor
            
            # Reduce node energy
            node.energy_level = max(0.0, node.energy_level - adjusted_cost / node.max_capacity)
            
            # Calculate power dissipation for this node
            power_dissipated = intensity * node.active_power
            
            # Update node temperature
            node.update_temperature(self.thermal_profile.ambient_temp, power_dissipated, duration)
            
            # Track work performed
            node.work_performed += intensity * duration * node_thermal_factor
    
    def _regenerate_node_energy_thermal(self, delta_time: float):
        """Regenerate energy for individual nodes with thermal considerations"""
        for node in self.nodes:
            # Regeneration based on mitochondrial density and temperature
            base_regen_rate = node.mitochondrial_density * 0.1 * delta_time
            
            # Thermal penalty for regeneration
            thermal_factor = 1.0
            if node.temperature > 45.0:
                thermal_factor = max(0.5, 1.0 - (node.temperature - 45.0) * 0.02)
            
            actual_regen = base_regen_rate * thermal_factor
            node.energy_level = min(1.0, node.energy_level + actual_regen)
            
            # Natural cooling for node
            temp_diff = node.temperature - self.thermal_profile.ambient_temp
            cooling_rate = temp_diff * 0.05 * delta_time  # Node-specific cooling
            node.temperature = max(self.thermal_profile.ambient_temp, node.temperature - cooling_rate)
    
    def _update_metabolic_state(self):
        """Update overall metabolic state based on all factors"""
        if self.emergency_shutdown_triggered:
            self.metabolic_state = MetabolicState.EMERGENCY
        elif self.thermal_state == ThermalState.EMERGENCY:
            self.metabolic_state = MetabolicState.OVERHEATED
        elif self.low_power_mode:
            self.metabolic_state = MetabolicState.POWER_SAVE
        elif self.stress_level > 0.8:
            self.metabolic_state = MetabolicState.EXHAUSTED
        elif self.stress_level > 0.5:
            self.metabolic_state = MetabolicState.STRESSED
        elif self.consciousness_efficiency > 1.1:
            self.metabolic_state = MetabolicState.HYPERACTIVE
        elif self.stress_level < 0.2 and self.thermal_state == ThermalState.OPTIMAL:
            self.metabolic_state = MetabolicState.HEALTHY
        else:
            self.metabolic_state = MetabolicState.RECOVERING
    
    def _get_overall_safety_status(self) -> str:
        """Get overall safety status"""
        if self.emergency_shutdown_triggered:
            return "EMERGENCY"
        elif (self.thermal_state in [ThermalState.CRITICAL, ThermalState.EMERGENCY] or 
              self.battery_level < 0.1 or self.stress_level > 0.9):
            return "CRITICAL"
        elif (self.thermal_state == ThermalState.HOT or 
              self.battery_level < self.power_profile.low_battery_threshold or 
              self.stress_level > 0.7):
            return "WARNING"
        else:
            return "SAFE"
    
    def _is_optimal_circadian_window(self) -> bool:
        """Check if current time is in optimal circadian window"""
        # Optimal window is roughly 10 AM to 2 PM and 6 PM to 9 PM
        phase_hours = (self.circadian_phase / (2 * math.pi)) * 24
        return (10 <= phase_hours <= 14) or (18 <= phase_hours <= 21)
    
    def _check_and_trigger_alerts(self):
        """Check for alert conditions and trigger callbacks"""
        alerts = []
        
        if self.thermal_state in [ThermalState.CRITICAL, ThermalState.EMERGENCY]:
            alerts.append(("THERMAL_CRITICAL", {"temperature": self.current_temperature}))
        
        if self.battery_level < 0.1:
            alerts.append(("BATTERY_CRITICAL", {"level": self.battery_level}))
        
        if self.stress_level > 0.8:
            alerts.append(("STRESS_HIGH", {"level": self.stress_level}))
        
        for alert_type, data in alerts:
            for callback in self.alert_callbacks:
                try:
                    callback(alert_type, data)
                except Exception as e:
                    logger.error(f"Error calling alert callback: {e}")
    
    def _run_health_check(self):
        """Run periodic health check"""
        try:
            # Check for thermal anomalies
            if self.current_temperature > self.thermal_profile.max_safe_temp:
                logger.warning(f"Temperature above safe limit: {self.current_temperature:.1f}°C")
            
            # Check energy conservation
            total_energy = self.atp_pool + self.adp_pool
            if abs(total_energy - self.energy_conservation_constant) > 5.0:
                logger.warning(f"Energy conservation violation: {total_energy:.1f} != {self.energy_conservation_constant:.1f}")
            
            # Check node health
            overheated_nodes = [node for node in self.nodes if node.temperature > node.max_temperature]
            if overheated_nodes:
                logger.warning(f"{len(overheated_nodes)} nodes overheated")
            
            # Check power consumption trends
            if len(self.power_history) > 10:
                recent_power = [entry["power"] for entry in list(self.power_history)[-10:]]
                if max(recent_power) > self.power_profile.peak_power:
                    logger.warning("Power consumption exceeding peak limits")
            
        except Exception as e:
            logger.error(f"Error during health check: {e}")

# Factory function for safe instantiation
def create_thermal_aware_metabolism(total_nodes: int = 32, max_temp: float = 65.0, 
                                   max_power: float = 15.0) -> ConsciousnessMetabolism:
    """Factory function to create production-ready consciousness metabolism"""
    try:
        thermal_profile = ThermalProfile(max_safe_temp=max_temp)
        power_profile = PowerProfile(max_power=max_power)
        
        metabolism = ConsciousnessMetabolism(
            total_nodes=total_nodes,
            thermal_profile=thermal_profile,
            power_profile=power_profile
        )
        
        # Add basic alert callback for logging
        def log_alert(alert_type: str, data: Dict):
            logger.warning(f"ALERT: {alert_type} - {data}")
        
        metabolism.add_alert_callback(log_alert)
        
        return metabolism
        
    except Exception as e:
        logger.error(f"Failed to create thermal-aware metabolism: {e}")
        raise

# Usage example with thermal and power monitoring
if __name__ == "__main__":
    try:
        # Create thermal-aware consciousness metabolism
        metabolism = create_thermal_aware_metabolism(total_nodes=16, max_temp=60.0, max_power=10.0)
        
        # Simulate intensive consciousness work
        print("🧠 Testing thermal-aware consciousness metabolism...")
        
        for i in range(5):
            success = metabolism.consciousness_work(
                ConsciousnessNetwork.EXECUTIVE,
                work_intensity=0.9,
                duration=2.0,
                priority=8
            )
            
            print(f"Work cycle {i+1}: {'✅ Success' if success else '❌ Failed'}")
            
            # Get comprehensive metrics
            metrics = metabolism.get_comprehensive_metrics()
            
            print(f"  🌡️  Temperature: {metrics['thermal']['current_temperature']:.1f}°C "
                  f"({metrics['thermal']['thermal_state']})")
            print(f"  ⚡ Power: {metrics['power']['current_consumption_w']:.1f}W "
                  f"(Battery: {metrics['power']['battery_level_percent']:.1f}%)")
            print(f"  🧮 ATP: {metrics['energy_pools']['atp_available']:.0f} "
                  f"({metrics['energy_pools']['energy_percentage']:.1f}%)")
            print(f"  ⚠️  Safety: {metrics['safety']['overall_safety_status']}")
            
            # Simulate time passing for regeneration and cooling
            metabolism.regenerate_energy(3.0)
        
        # Final health check
        final_metrics = metabolism.get_comprehensive_metrics()
        print(f"\n🏥 Final Status:")
        print(f"Thermal State: {final_metrics['thermal']['thermal_state']}")
        print(f"Metabolic State: {final_metrics['metabolic_state']['state']}")
        print(f"Safety Status: {final_metrics['safety']['overall_safety_status']}")
        print(f"Energy Conservation: {'✅ OK' if final_metrics['energy_pools']['energy_conservation_check'] else '❌ Violation'}")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        logger.exception("Test execution failed")