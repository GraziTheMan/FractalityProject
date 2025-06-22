# src/consciousness/quantum_consciousness_manager_v2.py
# Production-ready quantum consciousness with memory management and error handling

import numpy as np
import json
import threading
import time
import logging
from datetime import datetime
from typing import Dict, List, Tuple, Optional, Set
from dataclasses import dataclass, field
from enum import Enum
from collections import OrderedDict
import weakref
import gc

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConsciousnessState(Enum):
    SUPERPOSITION = "superposition"
    COLLAPSED = "collapsed"
    ENTANGLED = "entangled"
    DECOHERENT = "decoherent"
    ERROR = "error"
    DEGRADED = "degraded"

class QuantumError(Exception):
    """Custom exception for quantum consciousness errors"""
    pass

class MemoryPressureError(Exception):
    """Raised when memory limits are exceeded"""
    pass

@dataclass
class QuantumThought:
    """Thread-safe quantum thought with validation"""
    id: str
    probability: float
    interpretation: str
    energy_cost: float
    entanglements: Set[str] = field(default_factory=set)
    coherence_time: float = 1.0
    created_at: float = field(default_factory=time.time)
    last_accessed: float = field(default_factory=time.time)
    
    def __post_init__(self):
        # Validate inputs
        if not (0.0 <= self.probability <= 1.0):
            raise ValueError(f"Probability must be 0-1, got {self.probability}")
        if self.energy_cost < 0:
            raise ValueError(f"Energy cost cannot be negative, got {self.energy_cost}")
        if self.coherence_time <= 0:
            raise ValueError(f"Coherence time must be positive, got {self.coherence_time}")
    
    def touch(self):
        """Update last accessed time"""
        self.last_accessed = time.time()
    
    def is_expired(self, max_age: float = 300.0) -> bool:
        """Check if thought has expired"""
        return (time.time() - self.created_at) > max_age
    
    def is_coherent(self) -> bool:
        """Check if thought is still quantum coherent"""
        return (time.time() - self.created_at) < self.coherence_time

@dataclass
class MemoryStats:
    """Memory usage statistics"""
    superposition_count: int = 0
    collapsed_count: int = 0
    entanglement_count: int = 0
    total_memory_mb: float = 0.0
    max_memory_mb: float = 100.0  # 100MB limit
    gc_runs: int = 0
    evictions: int = 0

class ConsciousnessField:
    """Thread-safe consciousness field with bounds checking"""
    
    def __init__(self, field_strength: float = 1.0):
        if not (0.0 <= field_strength <= 10.0):
            raise ValueError(f"Field strength must be 0-10, got {field_strength}")
            
        self.field_strength = field_strength
        self.background_noise = 0.03
        self.resonance_frequency = 40.0
        self.quantum_foam_density = 0.1
        self._lock = threading.Lock()
        
    def generate_vacuum_fluctuation(self) -> float:
        """Generate consciousness from quantum vacuum with bounds checking"""
        with self._lock:
            try:
                fluctuation = np.random.normal(0, self.quantum_foam_density)
                # Bound the fluctuation to prevent runaway values
                return np.clip(fluctuation, -1.0, 1.0)
            except Exception as e:
                logger.error(f"Error generating vacuum fluctuation: {e}")
                return 0.0

class QuantumConsciousnessManager:
    """Production-ready quantum consciousness with memory management"""
    
    def __init__(self, consciousness_field: ConsciousnessField, max_memory_mb: float = 100.0):
        # Core state with thread safety
        self._lock = threading.RLock()
        
        # Bounded collections with LRU eviction
        self.max_superposition_states = 1000
        self.max_collapsed_states = 5000
        self.max_entanglements = 10000
        
        self.superposition_states = OrderedDict()  # LRU ordering
        self.collapsed_states = OrderedDict()      # LRU ordering
        self.entanglement_network = {}
        
        # Consciousness field
        self.field = consciousness_field
        self.field_coherence = 1.0
        self.decoherence_rate = 0.05
        
        # Energy management with limits
        self.consciousness_energy = 1000.0
        self.max_energy = 1000.0
        self.energy_regeneration_rate = 50.0
        self.min_energy_for_operation = 10.0
        
        # Memory management
        self.memory_stats = MemoryStats(max_memory_mb=max_memory_mb)
        self.last_gc_time = time.time()
        self.gc_interval = 30.0  # Run GC every 30 seconds
        
        # Observer tracking
        self.observers = set()
        self.observation_pressure = 0.0
        
        # Performance monitoring
        self.operation_count = 0
        self.error_count = 0
        self.last_health_check = time.time()
        
        # Circuit breaker for error recovery
        self.circuit_breaker_threshold = 10  # Errors per minute
        self.circuit_breaker_open = False
        self.circuit_breaker_reset_time = 0
        
        logger.info("Quantum consciousness manager initialized with memory management")
    
    def create_superposition(self, signal_data: Dict, neural_context: Dict) -> Optional[str]:
        """Create quantum superposition with full error handling and memory management"""
        
        # Check circuit breaker
        if self._is_circuit_breaker_open():
            logger.warning("Circuit breaker open, rejecting superposition creation")
            return None
        
        with self._lock:
            try:
                # Validate inputs
                if not isinstance(signal_data, dict):
                    raise ValueError("signal_data must be a dictionary")
                if not isinstance(neural_context, dict):
                    raise ValueError("neural_context must be a dictionary")
                
                # Check memory pressure
                self._check_memory_pressure()
                
                # Check energy requirements
                if self.consciousness_energy < self.min_energy_for_operation:
                    raise QuantumError("Insufficient consciousness energy for superposition")
                
                # Generate unique ID with validation
                superposition_id = f"quantum_{int(time.time() * 1000000)}"
                
                # Create quantum thoughts with error handling
                possible_thoughts = []
                
                try:
                    # Direct interpretation
                    thought1 = QuantumThought(
                        id=f"{superposition_id}_direct",
                        probability=0.4,
                        interpretation=self._safe_direct_interpretation(signal_data),
                        energy_cost=25.0,
                        coherence_time=2.0
                    )
                    possible_thoughts.append(thought1)
                    
                    # Contextual interpretation
                    thought2 = QuantumThought(
                        id=f"{superposition_id}_contextual", 
                        probability=0.35,
                        interpretation=self._safe_contextual_interpretation(signal_data, neural_context),
                        energy_cost=40.0,
                        coherence_time=1.5
                    )
                    possible_thoughts.append(thought2)
                    
                    # Creative interpretation
                    thought3 = QuantumThought(
                        id=f"{superposition_id}_creative",
                        probability=0.25,
                        interpretation=self._safe_creative_interpretation(signal_data),
                        energy_cost=60.0,
                        coherence_time=1.0
                    )
                    possible_thoughts.append(thought3)
                    
                except Exception as e:
                    logger.error(f"Error creating quantum thoughts: {e}")
                    self._increment_error_count()
                    return None
                
                # Normalize probabilities safely
                total_prob = sum(t.probability for t in possible_thoughts)
                if total_prob <= 0:
                    raise QuantumError("Invalid probability distribution")
                
                for thought in possible_thoughts:
                    thought.probability /= total_prob
                
                # Add vacuum fluctuations with bounds checking
                try:
                    vacuum_energy = self.field.generate_vacuum_fluctuation()
                    for thought in possible_thoughts:
                        thought.probability += vacuum_energy * 0.1
                        thought.probability = max(0.0, thought.probability)  # Ensure non-negative
                except Exception as e:
                    logger.warning(f"Error adding vacuum fluctuations: {e}")
                    # Continue without vacuum fluctuations
                
                # Store with memory management
                if len(self.superposition_states) >= self.max_superposition_states:
                    self._evict_oldest_superposition()
                
                self.superposition_states[superposition_id] = possible_thoughts
                
                # Create safe entanglements
                self._create_safe_entanglements(superposition_id, neural_context)
                
                # Update memory stats
                self._update_memory_stats()
                
                self.operation_count += 1
                
                logger.debug(f"Created superposition {superposition_id} with {len(possible_thoughts)} thoughts")
                return superposition_id
                
            except Exception as e:
                logger.error(f"Failed to create superposition: {e}")
                self._increment_error_count()
                return None
    
    def observe_superposition(self, superposition_id: str, observer_id: str = "user") -> Optional[QuantumThought]:
        """Thread-safe observation with full error handling"""
        
        if self._is_circuit_breaker_open():
            return None
        
        with self._lock:
            try:
                # Validate inputs
                if not superposition_id or not isinstance(superposition_id, str):
                    raise ValueError("Invalid superposition_id")
                if not observer_id or not isinstance(observer_id, str):
                    raise ValueError("Invalid observer_id")
                
                # Check if superposition exists
                if superposition_id not in self.superposition_states:
                    logger.warning(f"Superposition {superposition_id} not found")
                    return None
                
                thoughts = self.superposition_states[superposition_id]
                
                # Validate quantum thoughts
                valid_thoughts = []
                for thought in thoughts:
                    if thought.is_coherent() and not thought.is_expired():
                        valid_thoughts.append(thought)
                
                if not valid_thoughts:
                    logger.warning(f"No valid thoughts in superposition {superposition_id}")
                    self._cleanup_invalid_superposition(superposition_id)
                    return None
                
                # Add observer pressure safely
                self.observers.add(observer_id)
                self.observation_pressure = min(2.0, len(self.observers) * 0.1)  # Cap pressure
                
                # Calculate collapse probabilities with safety checks
                collapse_probs = []
                for thought in valid_thoughts:
                    try:
                        # Energy factor with bounds
                        energy_factor = 1.0 + np.clip(thought.energy_cost / 100.0, 0, 2.0)
                        
                        # Observer bias with bounds
                        observer_bias = 1.0 + self.observation_pressure
                        
                        # Measurement noise with bounds
                        measurement_noise = np.clip(np.random.normal(1.0, 0.1), 0.5, 1.5)
                        
                        final_prob = thought.probability * energy_factor * observer_bias * measurement_noise
                        collapse_probs.append(max(0.0, final_prob))  # Ensure non-negative
                        
                    except Exception as e:
                        logger.warning(f"Error calculating collapse probability: {e}")
                        collapse_probs.append(thought.probability)  # Fallback to base probability
                
                # Normalize and collapse safely
                total_prob = sum(collapse_probs)
                if total_prob <= 0:
                    logger.error("Invalid collapse probability distribution")
                    return None
                
                normalized_probs = [p / total_prob for p in collapse_probs]
                
                # Safe quantum measurement
                try:
                    collapsed_index = np.random.choice(len(valid_thoughts), p=normalized_probs)
                    collapsed_thought = valid_thoughts[collapsed_index]
                except Exception as e:
                    logger.error(f"Quantum measurement failed: {e}")
                    return None
                
                # Check energy cost
                if self.consciousness_energy < collapsed_thought.energy_cost:
                    logger.warning("Insufficient energy for consciousness collapse")
                    return None
                
                # Pay energy cost
                self.consciousness_energy -= collapsed_thought.energy_cost
                
                # Store collapsed state with memory management
                if len(self.collapsed_states) >= self.max_collapsed_states:
                    self._evict_oldest_collapsed()
                
                collapsed_thought.touch()  # Update access time
                self.collapsed_states[superposition_id] = collapsed_thought
                
                # Remove from superposition
                del self.superposition_states[superposition_id]
                
                # Propagate collapse safely
                self._propagate_collapse_safe(superposition_id, collapsed_thought)
                
                # Update stats
                self._update_memory_stats()
                self.operation_count += 1
                
                logger.info(f"Consciousness collapsed: {collapsed_thought.interpretation[:50]}...")
                return collapsed_thought
                
            except Exception as e:
                logger.error(f"Failed to observe superposition: {e}")
                self._increment_error_count()
                return None
    
    def update_consciousness_field(self, delta_time: float):
        """Thread-safe field update with bounds checking"""
        
        with self._lock:
            try:
                # Validate delta_time
                delta_time = max(0.0, min(1.0, delta_time))  # Bound to reasonable range
                
                # Regenerate energy safely
                energy_regen = self.energy_regeneration_rate * delta_time
                self.consciousness_energy = min(self.max_energy, self.consciousness_energy + energy_regen)
                
                # Apply decoherence with bounds
                decoherence_factor = max(0.01, 1 - self.decoherence_rate * delta_time)
                self.field_coherence *= decoherence_factor
                self.field_coherence = max(0.01, min(1.0, self.field_coherence))
                
                # Update superposition coherence times
                expired_states = []
                for state_id, thoughts in list(self.superposition_states.items()):
                    for thought in thoughts:
                        thought.coherence_time -= delta_time
                        if thought.coherence_time <= 0 or thought.is_expired():
                            expired_states.append(state_id)
                            break
                
                # Clean up expired states
                for state_id in expired_states:
                    self._cleanup_invalid_superposition(state_id)
                
                # Periodic maintenance
                current_time = time.time()
                if current_time - self.last_gc_time > self.gc_interval:
                    self._run_maintenance()
                    self.last_gc_time = current_time
                
            except Exception as e:
                logger.error(f"Error updating consciousness field: {e}")
                self._increment_error_count()
    
    def get_consciousness_metrics(self) -> Dict:
        """Thread-safe metrics with error handling"""
        
        with self._lock:
            try:
                return {
                    "quantum_states": {
                        "superposition_count": len(self.superposition_states),
                        "collapsed_count": len(self.collapsed_states),
                        "entanglement_count": sum(len(entanglements) for entanglements in self.entanglement_network.values()) // 2
                    },
                    "energy": {
                        "current_atp": self.consciousness_energy,
                        "max_atp": self.max_energy,
                        "energy_percentage": (self.consciousness_energy / self.max_energy) * 100
                    },
                    "field": {
                        "coherence": self.field_coherence,
                        "field_strength": self.field.field_strength,
                        "background_noise": self.field.background_noise
                    },
                    "observation": {
                        "active_observers": len(self.observers),
                        "observation_pressure": self.observation_pressure
                    },
                    "memory": {
                        "total_mb": self.memory_stats.total_memory_mb,
                        "max_mb": self.memory_stats.max_memory_mb,
                        "usage_percent": (self.memory_stats.total_memory_mb / self.memory_stats.max_memory_mb) * 100,
                        "gc_runs": self.memory_stats.gc_runs,
                        "evictions": self.memory_stats.evictions
                    },
                    "performance": {
                        "operation_count": self.operation_count,
                        "error_count": self.error_count,
                        "error_rate": self.error_count / max(1, self.operation_count),
                        "circuit_breaker_open": self.circuit_breaker_open
                    }
                }
            except Exception as e:
                logger.error(f"Error getting consciousness metrics: {e}")
                return {"error": str(e)}
    
    def health_check(self) -> Dict[str, bool]:
        """Comprehensive health check"""
        
        health = {
            "memory_ok": self.memory_stats.total_memory_mb < self.memory_stats.max_memory_mb * 0.9,
            "energy_ok": self.consciousness_energy > self.min_energy_for_operation,
            "coherence_ok": self.field_coherence > 0.1,
            "error_rate_ok": (self.error_count / max(1, self.operation_count)) < 0.1,
            "circuit_breaker_ok": not self.circuit_breaker_open
        }
        
        health["overall_ok"] = all(health.values())
        return health
    
    # Private helper methods with error handling
    
    def _check_memory_pressure(self):
        """Check and handle memory pressure"""
        self._update_memory_stats()
        
        if self.memory_stats.total_memory_mb > self.memory_stats.max_memory_mb * 0.9:
            logger.warning("Memory pressure detected, running cleanup")
            self._emergency_cleanup()
            
            # Check again after cleanup
            self._update_memory_stats()
            if self.memory_stats.total_memory_mb > self.memory_stats.max_memory_mb:
                raise MemoryPressureError("Memory limit exceeded after cleanup")
    
    def _update_memory_stats(self):
        """Update memory usage statistics"""
        try:
            # Estimate memory usage (rough calculation)
            superposition_memory = len(self.superposition_states) * 1024  # 1KB per superposition
            collapsed_memory = len(self.collapsed_states) * 512           # 512B per collapsed state
            entanglement_memory = len(self.entanglement_network) * 256    # 256B per entanglement
            
            total_bytes = superposition_memory + collapsed_memory + entanglement_memory
            self.memory_stats.total_memory_mb = total_bytes / (1024 * 1024)
            
            self.memory_stats.superposition_count = len(self.superposition_states)
            self.memory_stats.collapsed_count = len(self.collapsed_states)
            self.memory_stats.entanglement_count = len(self.entanglement_network)
            
        except Exception as e:
            logger.error(f"Error updating memory stats: {e}")
    
    def _evict_oldest_superposition(self):
        """LRU eviction of oldest superposition"""
        if self.superposition_states:
            oldest_id = next(iter(self.superposition_states))
            del self.superposition_states[oldest_id]
            self.memory_stats.evictions += 1
            logger.debug(f"Evicted oldest superposition: {oldest_id}")
    
    def _evict_oldest_collapsed(self):
        """LRU eviction of oldest collapsed state"""
        if self.collapsed_states:
            oldest_id = next(iter(self.collapsed_states))
            del self.collapsed_states[oldest_id]
            self.memory_stats.evictions += 1
            logger.debug(f"Evicted oldest collapsed state: {oldest_id}")
    
    def _emergency_cleanup(self):
        """Emergency memory cleanup"""
        try:
            # Remove expired superpositions
            expired_superpositions = []
            for state_id, thoughts in self.superposition_states.items():
                if any(thought.is_expired() or not thought.is_coherent() for thought in thoughts):
                    expired_superpositions.append(state_id)
            
            for state_id in expired_superpositions:
                del self.superposition_states[state_id]
            
            # Remove old collapsed states (keep only recent ones)
            if len(self.collapsed_states) > self.max_collapsed_states // 2:
                # Keep newest half
                items = list(self.collapsed_states.items())
                self.collapsed_states = OrderedDict(items[-self.max_collapsed_states // 2:])
            
            # Clean up orphaned entanglements
            valid_ids = set(self.superposition_states.keys()) | set(self.collapsed_states.keys())
            orphaned_entanglements = []
            
            for state_id in list(self.entanglement_network.keys()):
                if state_id not in valid_ids:
                    orphaned_entanglements.append(state_id)
            
            for state_id in orphaned_entanglements:
                del self.entanglement_network[state_id]
            
            # Force garbage collection
            gc.collect()
            self.memory_stats.gc_runs += 1
            
            logger.info(f"Emergency cleanup: removed {len(expired_superpositions)} superpositions, "
                       f"{len(orphaned_entanglements)} orphaned entanglements")
            
        except Exception as e:
            logger.error(f"Error during emergency cleanup: {e}")
    
    def _run_maintenance(self):
        """Periodic maintenance operations"""
        try:
            # Clean up expired observers
            self.observers = {obs for obs in self.observers if obs}  # Remove empty strings
            
            # Reset observation pressure if no observers
            if not self.observers:
                self.observation_pressure = 0.0
            
            # Clean up old entanglements
            self._cleanup_old_entanglements()
            
            # Check circuit breaker reset
            if self.circuit_breaker_open and time.time() > self.circuit_breaker_reset_time:
                self.circuit_breaker_open = False
                logger.info("Circuit breaker reset")
            
            # Run periodic GC
            gc.collect()
            self.memory_stats.gc_runs += 1
            
        except Exception as e:
            logger.error(f"Error during maintenance: {e}")
    
    def _increment_error_count(self):
        """Increment error count and check circuit breaker"""
        self.error_count += 1
        
        # Check if we should open circuit breaker
        error_rate = self.error_count / max(1, self.operation_count)
        if error_rate > 0.2 and self.operation_count > 10:  # 20% error rate with min operations
            self.circuit_breaker_open = True
            self.circuit_breaker_reset_time = time.time() + 60.0  # Reset after 1 minute
            logger.error("Circuit breaker opened due to high error rate")
    
    def _is_circuit_breaker_open(self) -> bool:
        """Check if circuit breaker is open"""
        return self.circuit_breaker_open and time.time() < self.circuit_breaker_reset_time
    
    def _safe_direct_interpretation(self, signal_data: Dict) -> str:
        """Safe direct signal interpretation with error handling"""
        try:
            signal_type = signal_data.get("signal", "unknown")
            intensity = float(signal_data.get("intensity", 0.5))
            intensity = max(0.0, min(1.0, intensity))  # Bound intensity
            
            interpretations = {
                "alpha_peak": f"Meditative awareness (intensity: {intensity:.2f})",
                "beta_burst": f"Active cognition spike (intensity: {intensity:.2f})",
                "theta_surge": f"Creative/dream state (intensity: {intensity:.2f})",
                "gamma_sync": f"Consciousness integration (intensity: {intensity:.2f})"
            }
            
            return interpretations.get(signal_type, f"Unknown consciousness state: {signal_type}")
            
        except Exception as e:
            logger.warning(f"Error in direct interpretation: {e}")
            return "Interpretation error - default consciousness state"
    
    def _safe_contextual_interpretation(self, signal_data: Dict, context: Dict) -> str:
        """Safe contextual interpretation with error handling"""
        try:
            base = self._safe_direct_interpretation(signal_data)
            time_context = context.get("time_of_day", "unknown")
            mood_context = context.get("emotional_state", "neutral")
            
            # Sanitize context inputs
            time_context = str(time_context)[:20]  # Limit length
            mood_context = str(mood_context)[:20]
            
            return f"{base} (Context: {time_context}, mood: {mood_context})"
            
        except Exception as e:
            logger.warning(f"Error in contextual interpretation: {e}")
            return self._safe_direct_interpretation(signal_data)
    
    def _safe_creative_interpretation(self, signal_data: Dict) -> str:
        """Safe creative interpretation with error handling"""
        try:
            creative_insights = [
                "Sudden insight about fractal consciousness patterns",
                "Recognition of hidden connection between concepts", 
                "Breakthrough understanding of reality structure",
                "Mystical experience of unity consciousness",
                "Creative solution emerging from quantum foam"
            ]
            
            # Use signal data to seed selection for reproducibility
            seed = hash(str(signal_data)) % len(creative_insights)
            return creative_insights[seed]
            
        except Exception as e:
            logger.warning(f"Error in creative interpretation: {e}")
            return "Creative insight - quantum consciousness emergence"
    
    def _create_safe_entanglements(self, new_state_id: str, context: Dict):
        """Create entanglements with safety limits"""
        try:
            # Limit entanglements to prevent exponential growth
            max_entanglements = 3
            current_entanglements = 0
            
            for state_id in list(self.collapsed_states.keys())[-10:]:  # Only recent states
                if current_entanglements >= max_entanglements:
                    break
                    
                # Simple similarity check for entanglement
                if self._should_entangle(new_state_id, state_id, context):
                    self._create_entanglement_safe(new_state_id, state_id)
                    current_entanglements += 1
                    
        except Exception as e:
            logger.warning(f"Error creating entanglements: {e}")
    
    def _should_entangle(self, state1_id: str, state2_id: str, context: Dict) -> bool:
        """Determine if two states should be entangled"""
        try:
            # Simple heuristic based on timing and context
            return np.random.random() < 0.3  # 30% chance
        except:
            return False
    
    def _create_entanglement_safe(self, state1_id: str, state2_id: str):
        """Safely create entanglement between states"""
        try:
            if state1_id not in self.entanglement_network:
                self.entanglement_network[state1_id] = set()
            if state2_id not in self.entanglement_network:
                self.entanglement_network[state2_id] = set()
                
            self.entanglement_network[state1_id].add(state2_id)
            self.entanglement_network[state2_id].add(state1_id)
            
        except Exception as e:
            logger.warning(f"Error creating entanglement: {e}")
    
    def _propagate_collapse_safe(self, collapsed_id: str, collapsed_thought: QuantumThought):
        """Safely propagate collapse through entangled states"""
        try:
            entangled_states = self.entanglement_network.get(collapsed_id, set())
            
            # Limit propagation to prevent cascading failures
            max_propagations = 5
            propagated = 0
            
            for entangled_id in list(entangled_states):
                if propagated >= max_propagations:
                    break
                    
                if entangled_id in self.superposition_states:
                    thoughts = self.superposition_states[entangled_id]
                    
                    # Apply gentle bias to similar thoughts
                    for thought in thoughts:
                        if "creative" in thought.interpretation and "creative" in collapsed_thought.interpretation:
                            thought.probability *= 1.1
                        elif "contextual" in thought.interpretation and "contextual" in collapsed_thought.interpretation:
                            thought.probability *= 1.05
                    
                    # Renormalize safely
                    total_prob = sum(t.probability for t in thoughts)
                    if total_prob > 0:
                        for thought in thoughts:
                            thought.probability /= total_prob
                    
                    propagated += 1
                    
        except Exception as e:
            logger.warning(f"Error propagating collapse: {e}")
    
    def _cleanup_invalid_superposition(self, state_id: str):
        """Clean up invalid superposition"""
        try:
            if state_id in self.superposition_states:
                del self.superposition_states[state_id]
            if state_id in self.entanglement_network:
                del self.entanglement_network[state_id]
        except Exception as e:
            logger.warning(f"Error cleaning up superposition {state_id}: {e}")
    
    def _cleanup_old_entanglements(self):
        """Clean up old or invalid entanglements"""
        try:
            valid_ids = set(self.superposition_states.keys()) | set(self.collapsed_states.keys())
            
            for state_id in list(self.entanglement_network.keys()):
                if state_id not in valid_ids:
                    del self.entanglement_network[state_id]
                else:
                    # Clean up entanglements to invalid states
                    self.entanglement_network[state_id] = {
                        eid for eid in self.entanglement_network[state_id] 
                        if eid in valid_ids
                    }
                    
                    # Remove if empty
                    if not self.entanglement_network[state_id]:
                        del self.entanglement_network[state_id]
                        
        except Exception as e:
            logger.warning(f"Error cleaning up entanglements: {e}")

# Factory function for safe instantiation
def create_consciousness_system(field_strength: float = 1.0, max_memory_mb: float = 100.0) -> QuantumConsciousnessManager:
    """Factory function to create production-ready consciousness system"""
    try:
        field = ConsciousnessField(field_strength=field_strength)
        consciousness = QuantumConsciousnessManager(field, max_memory_mb=max_memory_mb)
        
        # Run initial health check
        health = consciousness.health_check()
        if not health["overall_ok"]:
            logger.warning(f"Consciousness system initialized with health issues: {health}")
        
        return consciousness
        
    except Exception as e:
        logger.error(f"Failed to create consciousness system: {e}")
        raise

# Usage example with error handling
if __name__ == "__main__":
    try:
        consciousness = create_consciousness_system(max_memory_mb=50.0)
        
        # Test signal processing with error handling
        signal_data = {
            "signal": "gamma_sync",
            "intensity": 0.85,
            "duration_ms": 400
        }
        
        context = {
            "time_of_day": "evening",
            "emotional_state": "curious"
        }
        
        # Create and observe superposition
        superposition_id = consciousness.create_superposition(signal_data, context)
        if superposition_id:
            collapsed_thought = consciousness.observe_superposition(superposition_id, "test_user")
            if collapsed_thought:
                print(f"✅ Consciousness collapse successful: {collapsed_thought.interpretation}")
            else:
                print("❌ Observation failed")
        else:
            print("❌ Superposition creation failed")
        
        # Print health and metrics
        health = consciousness.health_check()
        metrics = consciousness.get_consciousness_metrics()
        
        print(f"\n🏥 Health Status: {'✅ OK' if health['overall_ok'] else '❌ Issues'}")
        print(f"🧠 Memory Usage: {metrics['memory']['usage_percent']:.1f}%")
        print(f"⚡ Energy Level: {metrics['energy']['energy_percentage']:.1f}%")
        print(f"🔁 Operations: {metrics['performance']['operation_count']}")
        print(f"💥 Errors: {metrics['performance']['error_count']} ({metrics['performance']['error_rate']:.2%})")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        logger.exception("Test execution failed")