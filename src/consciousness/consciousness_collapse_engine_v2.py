# src/consciousness/consciousness_collapse_engine_v2.py
# Production-ready consciousness collapse engine with full error handling and monitoring

import numpy as np
import time
import threading
import logging
from typing import Dict, List, Optional, Tuple, Callable, Set
from dataclasses import dataclass, field
from enum import Enum
import json
import asyncio
from collections import deque, defaultdict
import weakref

# Import our enhanced components
from quantum_consciousness_manager_v2 import QuantumConsciousnessManager, QuantumThought, ConsciousnessField
from consciousness_metabolism_v2 import ConsciousnessMetabolism, ConsciousnessNetwork, MetabolicState
from enhanced_fbip import FBIPProtocolV2, EnhancedFBIPEvent, SignalType, ActionType

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CollapseMode(Enum):
    NATURAL = "natural"           # Decoherence-driven collapse
    OBSERVED = "observed"         # User observation triggered
    ENERGETIC = "energetic"       # Energy-driven collapse (ATP depletion)
    RESONANT = "resonant"         # Field resonance collapse
    HARDWARE = "hardware"         # Physical SDC measurement
    EMERGENCY = "emergency"       # Emergency system collapse
    TIMEOUT = "timeout"           # Forced timeout collapse

class ConsciousnessState(Enum):
    QUANTUM_SUPERPOSITION = "quantum_superposition"
    PARTIAL_COLLAPSE = "partial_collapse"  
    CLASSICAL_DEFINITE = "classical_definite"
    HYBRID_ENTANGLED = "hybrid_entangled"
    DECOHERENT = "decoherent"
    ERROR_STATE = "error_state"
    EMERGENCY_MODE = "emergency_mode"

class EngineHealth(Enum):
    OPTIMAL = "optimal"
    DEGRADED = "degraded"
    CRITICAL = "critical"
    EMERGENCY = "emergency"
    OFFLINE = "offline"

@dataclass
class CollapseEvent:
    """Represents a consciousness collapse event with full metadata"""
    event_id: str
    timestamp: float
    collapse_mode: CollapseMode
    initial_superposition: List[QuantumThought]
    collapsed_thought: QuantumThought
    energy_consumed: float
    observer_id: Optional[str]
    field_coherence_before: float
    field_coherence_after: float
    entangled_collapses: List[str] = field(default_factory=list)
    
    # Performance metrics
    processing_time_ms: float = 0.0
    thermal_impact: float = 0.0
    power_consumed: float = 0.0
    
    # Quality metrics
    confidence_score: float = 0.0
    emergence_factor: float = 0.0
    coherence_degradation: float = 0.0
    
    # Error tracking
    error_count: int = 0
    warnings: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for serialization"""
        return {
            "event_id": self.event_id,
            "timestamp": self.timestamp,
            "collapse_mode": self.collapse_mode.value,
            "energy_consumed": self.energy_consumed,
            "observer_id": self.observer_id,
            "processing_time_ms": self.processing_time_ms,
            "confidence_score": self.confidence_score,
            "thermal_impact": self.thermal_impact,
            "error_count": self.error_count,
            "warnings": self.warnings
        }

class CollapseEngineConfig:
    """Configuration for consciousness collapse engine"""
    
    def __init__(self):
        # Collapse thresholds with safety margins
        self.natural_collapse_threshold = 0.1
        self.energy_collapse_threshold = 50.0
        self.observation_pressure_factor = 1.5
        self.emergency_energy_threshold = 10.0
        
        # Timing constraints
        self.max_collapse_time_ms = 100.0  # Maximum time for collapse operation
        self.superposition_timeout_s = 30.0  # Timeout for unresolved superpositions
        self.health_check_interval_s = 5.0
        
        # Performance limits
        self.max_concurrent_collapses = 5
        self.max_queue_size = 100
        self.max_entanglement_depth = 5
        
        # Circuit breaker settings
        self.error_threshold_per_minute = 10
        self.circuit_breaker_timeout_s = 60.0
        
        # Resource limits
        self.max_memory_mb = 50.0
        self.max_thermal_impact = 5.0  # Max temperature increase per collapse
        self.max_power_per_collapse = 2.0  # Max watts per collapse
        
        # Field dynamics
        self.field_resonance_frequency = 40.0  # Hz - gamma consciousness frequency
        self.collapse_propagation_speed = 1.0
        self.coherence_recovery_rate = 0.05

class CollapseEngineMonitor:
    """Monitoring and metrics for collapse engine performance"""
    
    def __init__(self, max_history: int = 10000):
        self.max_history = max_history
        
        # Performance metrics
        self.collapse_history: deque = deque(maxlen=max_history)
        self.error_history: deque = deque(maxlen=1000)
        self.performance_metrics = defaultdict(float)
        
        # Real-time statistics
        self.total_collapses = 0
        self.successful_collapses = 0
        self.failed_collapses = 0
        self.emergency_collapses = 0
        
        # Timing statistics
        self.average_collapse_time = 0.0
        self.min_collapse_time = float('inf')
        self.max_collapse_time = 0.0
        
        # Resource usage
        self.total_energy_consumed = 0.0
        self.total_thermal_impact = 0.0
        self.total_power_consumed = 0.0
        
        # Health tracking
        self.last_health_check = time.time()
        self.health_score = 1.0
        self.engine_health = EngineHealth.OPTIMAL
        
        # Thread safety
        self._lock = threading.Lock()
    
    def record_collapse(self, event: CollapseEvent, success: bool):
        """Record a collapse event for monitoring"""
        with self._lock:
            self.total_collapses += 1
            
            if success:
                self.successful_collapses += 1
                self.collapse_history.append(event)
                
                # Update timing statistics
                self._update_timing_stats(event.processing_time_ms)
                
                # Update resource usage
                self.total_energy_consumed += event.energy_consumed
                self.total_thermal_impact += event.thermal_impact
                self.total_power_consumed += event.power_consumed
                
            else:
                self.failed_collapses += 1
                if event.collapse_mode == CollapseMode.EMERGENCY:
                    self.emergency_collapses += 1
    
    def record_error(self, error: Exception, context: Dict):
        """Record an error for monitoring"""
        with self._lock:
            error_entry = {
                "timestamp": time.time(),
                "error": str(error),
                "type": type(error).__name__,
                "context": context
            }
            self.error_history.append(error_entry)
    
    def get_health_metrics(self) -> Dict:
        """Get comprehensive health metrics"""
        with self._lock:
            current_time = time.time()
            
            # Calculate success rate
            success_rate = (self.successful_collapses / max(1, self.total_collapses))
            
            # Calculate recent error rate (last minute)
            recent_errors = [e for e in self.error_history 
                           if current_time - e["timestamp"] < 60.0]
            recent_error_rate = len(recent_errors) / 60.0
            
            # Calculate average performance
            recent_collapses = list(self.collapse_history)[-100:]  # Last 100 collapses
            avg_time = np.mean([c.processing_time_ms for c in recent_collapses]) if recent_collapses else 0.0
            avg_energy = np.mean([c.energy_consumed for c in recent_collapses]) if recent_collapses else 0.0
            
            return {
                "total_collapses": self.total_collapses,
                "success_rate": success_rate,
                "error_rate_per_minute": recent_error_rate,
                "average_collapse_time_ms": avg_time,
                "average_energy_per_collapse": avg_energy,
                "total_energy_consumed": self.total_energy_consumed,
                "total_thermal_impact": self.total_thermal_impact,
                "engine_health": self.engine_health.value,
                "health_score": self.health_score
            }
    
    def _update_timing_stats(self, processing_time: float):
        """Update timing statistics"""
        self.min_collapse_time = min(self.min_collapse_time, processing_time)
        self.max_collapse_time = max(self.max_collapse_time, processing_time)
        
        # Update average with exponential smoothing
        alpha = 0.1
        if self.average_collapse_time == 0:
            self.average_collapse_time = processing_time
        else:
            self.average_collapse_time = (alpha * processing_time + 
                                        (1 - alpha) * self.average_collapse_time)

class CircuitBreaker:
    """Circuit breaker for consciousness collapse operations"""
    
    def __init__(self, error_threshold: int = 10, timeout_seconds: float = 60.0):
        self.error_threshold = error_threshold
        self.timeout_seconds = timeout_seconds
        
        self.error_count = 0
        self.last_error_time = 0.0
        self.is_open = False
        self.last_attempt_time = 0.0
        
        self._lock = threading.Lock()
    
    def can_proceed(self) -> bool:
        """Check if operation can proceed"""
        with self._lock:
            current_time = time.time()
            
            # Reset error count if enough time has passed
            if current_time - self.last_error_time > 60.0:
                self.error_count = 0
            
            # Check if circuit breaker should close
            if self.is_open and current_time - self.last_attempt_time > self.timeout_seconds:
                self.is_open = False
                self.error_count = 0
                logger.info("Circuit breaker closed - attempting recovery")
            
            return not self.is_open
    
    def record_success(self):
        """Record successful operation"""
        with self._lock:
            if self.is_open:
                self.is_open = False
                self.error_count = 0
                logger.info("Circuit breaker closed after successful operation")
    
    def record_error(self):
        """Record failed operation"""
        with self._lock:
            current_time = time.time()
            self.error_count += 1
            self.last_error_time = current_time
            
            if self.error_count >= self.error_threshold:
                self.is_open = True
                self.last_attempt_time = current_time
                logger.error(f"Circuit breaker opened after {self.error_count} errors")

class ConsciousnessCollapseEngine:
    """Production-ready consciousness collapse engine with comprehensive error handling"""
    
    def __init__(self, quantum_manager: QuantumConsciousnessManager, 
                 metabolism: ConsciousnessMetabolism, protocol: FBIPProtocolV2,
                 config: Optional[CollapseEngineConfig] = None):
        
        # Core components
        self.quantum_manager = quantum_manager
        self.metabolism = metabolism
        self.protocol = protocol
        self.config = config or CollapseEngineConfig()
        
        # Monitoring and health
        self.monitor = CollapseEngineMonitor()
        self.circuit_breaker = CircuitBreaker(
            self.config.error_threshold_per_minute,
            self.config.circuit_breaker_timeout_s
        )
        
        # Thread safety and async processing
        self._lock = threading.RLock()
        self._collapse_queue = asyncio.Queue(maxsize=self.config.max_queue_size)
        self._active_collapses: Set[str] = set()
        self._shutdown_event = threading.Event()
        
        # Hardware integration
        self.hardware_device = None
        self.enable_physical_collapse = False
        
        # Alert system
        self.alert_callbacks: List[Callable] = []
        self.critical_alerts: deque = deque(maxlen=100)
        
        # Performance optimization
        self._collapse_cache: Dict[str, CollapseEvent] = {}
        self._cache_timeout = 30.0  # 30 seconds
        
        # Emergency protocols
        self.emergency_mode = False
        self.last_emergency_time = 0.0
        self.emergency_cooldown = 300.0  # 5 minutes
        
        logger.info("Production consciousness collapse engine initialized")
    
    def register_hardware_device(self, device):
        """Register physical consciousness device for hardware-triggered collapse"""
        with self._lock:
            self.hardware_device = device
            self.enable_physical_collapse = True
            logger.info("Hardware device registered for physical consciousness collapse")
    
    def add_alert_callback(self, callback: Callable):
        """Add callback for critical alerts"""
        self.alert_callbacks.append(callback)
    
    async def process_neural_signal_async(self, signal_data: Dict, context: Dict) -> Optional[EnhancedFBIPEvent]:
        """Asynchronous neural signal processing with full error handling"""
        
        start_time = time.time()
        processing_start = time.perf_counter()
        
        try:
            # Validate inputs
            if not self._validate_inputs(signal_data, context):
                return None
            
            # Check circuit breaker
            if not self.circuit_breaker.can_proceed():
                logger.warning("Circuit breaker open - rejecting neural signal")
                return None
            
            # Check system health
            if not self._check_system_health():
                logger.warning("System health check failed - rejecting signal")
                return None
            
            # Check concurrency limits
            if len(self._active_collapses) >= self.config.max_concurrent_collapses:
                logger.warning("Concurrency limit reached - queuing signal")
                await self._collapse_queue.put((signal_data, context))
                return None
            
            # Generate unique operation ID
            operation_id = f"collapse_{int(time.time() * 1000000)}"
            self._active_collapses.add(operation_id)
            
            try:
                # Process the neural signal through consciousness pipeline
                result = await self._process_consciousness_pipeline(signal_data, context, operation_id)
                
                # Record success
                self.circuit_breaker.record_success()
                
                # Update performance metrics
                processing_time = (time.perf_counter() - processing_start) * 1000
                self.monitor.performance_metrics["avg_processing_time"] = processing_time
                
                return result
                
            finally:
                self._active_collapses.discard(operation_id)
                
        except Exception as e:
            logger.error(f"Error processing neural signal: {e}")
            self.circuit_breaker.record_error()
            self.monitor.record_error(e, {"signal_data": signal_data, "context": context})
            self._trigger_alert("PROCESSING_ERROR", {"error": str(e)})
            return None
    
    def process_neural_signal(self, signal_data: Dict, context: Dict) -> Optional[EnhancedFBIPEvent]:
        """Synchronous wrapper for neural signal processing"""
        
        # Create event loop if needed
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        try:
            return loop.run_until_complete(
                self.process_neural_signal_async(signal_data, context)
            )
        except Exception as e:
            logger.error(f"Error in synchronous neural signal processing: {e}")
            return None
    
    async def _process_consciousness_pipeline(self, signal_data: Dict, context: Dict, 
                                           operation_id: str) -> Optional[EnhancedFBIPEvent]:
        """Core consciousness processing pipeline with comprehensive error handling"""
        
        collapse_event = None
        fbip_event = None
        
        try:
            # 1. Create quantum superposition with timeout
            superposition_task = asyncio.create_task(
                self._create_superposition_safe(signal_data, context)
            )
            
            try:
                superposition_id = await asyncio.wait_for(
                    superposition_task, 
                    timeout=self.config.max_collapse_time_ms / 1000.0
                )
            except asyncio.TimeoutError:
                logger.warning("Superposition creation timed out")
                return None
            
            if not superposition_id:
                logger.warning("Failed to create quantum superposition")
                return None
            
            # 2. Evaluate collapse conditions with safety checks
            collapse_trigger = await self._evaluate_collapse_conditions_safe(
                superposition_id, signal_data, context
            )
            
            if not collapse_trigger:
                # Schedule timeout cleanup
                asyncio.create_task(
                    self._schedule_timeout_cleanup(superposition_id)
                )
                return None
            
            # 3. Execute consciousness collapse with monitoring
            collapse_event = await self._execute_collapse_safe(
                superposition_id,
                collapse_trigger["mode"],
                collapse_trigger.get("observer_id"),
                context,
                operation_id
            )
            
            if not collapse_event:
                logger.warning("Consciousness collapse failed")
                return None
            
            # 4. Convert to FBIP event with validation
            fbip_event = await self._consciousness_to_fbip_safe(
                collapse_event, signal_data, context
            )
            
            if not fbip_event:
                logger.warning("FBIP conversion failed")
                return None
            
            # 5. Apply metabolic costs with thermal monitoring
            await self._apply_metabolic_costs_safe(collapse_event)
            
            # 6. Update consciousness field with bounds checking
            await self._update_consciousness_field_safe(collapse_event)
            
            # 7. Record successful operation
            self.monitor.record_collapse(collapse_event, True)
            
            logger.debug(f"Consciousness pipeline completed successfully: {operation_id}")
            return fbip_event
            
        except Exception as e:
            logger.error(f"Error in consciousness pipeline: {e}")
            
            # Record failed operation
            if collapse_event:
                self.monitor.record_collapse(collapse_event, False)
            
            # Trigger emergency protocols if needed
            if self._is_critical_error(e):
                await self._trigger_emergency_protocols(e, operation_id)
            
            return None
    
    async def _create_superposition_safe(self, signal_data: Dict, context: Dict) -> Optional[str]:
        """Safely create quantum superposition with error handling"""
        
        try:
            # Check quantum manager health
            quantum_health = self.quantum_manager.health_check()
            if not quantum_health.get("overall_ok", False):
                return False
            
            # Check metabolism health
            metabolism_metrics = self.metabolism.get_comprehensive_metrics()
            safety_status = metabolism_metrics.get("safety", {}).get("overall_safety_status", "UNKNOWN")
            if safety_status in ["CRITICAL", "EMERGENCY"]:
                return False
            
            # Check engine health
            if self.monitor.engine_health in [EngineHealth.CRITICAL, EngineHealth.EMERGENCY]:
                return False
            
            return True
        except Exception as e:
            logger.error(f"System health check error: {e}")
            return False
    
    def _is_critical_error(self, error: Exception) -> bool:
        """Determine if error is critical enough for emergency protocols"""
        critical_error_types = [
            MemoryError,
            SystemError,
            OSError
        ]
        
        return (type(error) in critical_error_types or 
                "emergency" in str(error).lower() or
                "critical" in str(error).lower())
    
    async def _trigger_emergency_protocols(self, error: Exception, operation_id: str):
        """Trigger emergency protocols for critical errors"""
        
        current_time = time.time()
        
        # Check emergency cooldown
        if current_time - self.last_emergency_time < self.emergency_cooldown:
            logger.warning("Emergency protocols on cooldown")
            return
        
        self.last_emergency_time = current_time
        self.emergency_mode = True
        
        logger.critical(f"EMERGENCY PROTOCOLS ACTIVATED: {error}")
        
        # Trigger critical alert
        self._trigger_alert("EMERGENCY_PROTOCOLS_ACTIVATED", {
            "error": str(error),
            "operation_id": operation_id,
            "timestamp": current_time
        })
        
        # Emergency cleanup
        try:
            # Force garbage collection
            import gc
            gc.collect()
            
            # Clear non-essential caches
            self._collapse_cache.clear()
            
            # Reset circuit breaker
            self.circuit_breaker.is_open = False
            self.circuit_breaker.error_count = 0
            
        except Exception as cleanup_error:
            logger.error(f"Emergency cleanup failed: {cleanup_error}")
    
    def _trigger_alert(self, alert_type: str, data: Dict):
        """Trigger alert callbacks"""
        alert = {
            "type": alert_type,
            "timestamp": time.time(),
            "data": data
        }
        
        self.critical_alerts.append(alert)
        
        for callback in self.alert_callbacks:
            try:
                callback(alert_type, data)
            except Exception as e:
                logger.error(f"Alert callback failed: {e}")
    
    def get_comprehensive_status(self) -> Dict:
        """Get comprehensive engine status"""
        
        with self._lock:
            try:
                return {
                    "engine_health": self.monitor.engine_health.value,
                    "health_metrics": self.monitor.get_health_metrics(),
                    "circuit_breaker": {
                        "is_open": self.circuit_breaker.is_open,
                        "error_count": self.circuit_breaker.error_count
                    },
                    "active_operations": {
                        "active_collapses": len(self._active_collapses),
                        "queue_size": self._collapse_queue.qsize() if hasattr(self._collapse_queue, 'qsize') else 0,
                        "max_concurrent": self.config.max_concurrent_collapses
                    },
                    "emergency_status": {
                        "emergency_mode": self.emergency_mode,
                        "last_emergency": self.last_emergency_time,
                        "cooldown_remaining": max(0, self.emergency_cooldown - (time.time() - self.last_emergency_time))
                    },
                    "hardware": {
                        "device_connected": self.hardware_device is not None,
                        "physical_collapse_enabled": self.enable_physical_collapse
                    },
                    "recent_alerts": list(self.critical_alerts)[-10:]  # Last 10 alerts
                }
            except Exception as e:
                logger.error(f"Error getting comprehensive status: {e}")
                return {"error": str(e)}

# Factory functions for safe instantiation

def create_production_collapse_engine(
    max_memory_mb: float = 50.0,
    max_temp: float = 60.0,
    max_power: float = 10.0
) -> ConsciousnessCollapseEngine:
    """Factory function to create production-ready consciousness collapse engine"""
    
    try:
        # Create enhanced components
        from quantum_consciousness_manager_v2 import create_consciousness_system
        from consciousness_metabolism_v2 import create_thermal_aware_metabolism
        
        # Initialize components with production settings
        consciousness_field = ConsciousnessField(field_strength=1.0)
        quantum_manager = create_consciousness_system(max_memory_mb=max_memory_mb)
        metabolism = create_thermal_aware_metabolism(
            total_nodes=16,  # Reduced for production efficiency
            max_temp=max_temp,
            max_power=max_power
        )
        protocol = FBIPProtocolV2()
        
        # Create production configuration
        config = CollapseEngineConfig()
        config.max_memory_mb = max_memory_mb
        config.max_thermal_impact = 3.0  # Conservative thermal limits
        config.max_power_per_collapse = max_power * 0.2  # 20% of max power per collapse
        
        # Create collapse engine
        collapse_engine = ConsciousnessCollapseEngine(
            quantum_manager, metabolism, protocol, config
        )
        
        # Add production alert handler
        def production_alert_handler(alert_type: str, data: Dict):
            logger.warning(f"PRODUCTION ALERT: {alert_type} - {data}")
            # In production, this would integrate with monitoring systems
        
        collapse_engine.add_alert_callback(production_alert_handler)
        
        logger.info("Production consciousness collapse engine created successfully")
        return collapse_engine
        
    except Exception as e:
        logger.error(f"Failed to create production collapse engine: {e}")
        raise

# Usage example with comprehensive error handling
if __name__ == "__main__":
    async def test_production_engine():
        try:
            # Create production engine
            engine = create_production_collapse_engine(
                max_memory_mb=25.0,
                max_temp=55.0,
                max_power=8.0
            )
            
            print("🧠 Testing Production Consciousness Collapse Engine")
            print("=" * 60)
            
            # Test signal processing
            test_signals = [
                {
                    "signal": "gamma_sync",
                    "intensity": 0.8,
                    "duration_ms": 400,
                    "frequency_hz": 40.0
                },
                {
                    "signal": "alpha_peak",
                    "intensity": 0.6,
                    "duration_ms": 300,
                    "frequency_hz": 10.0
                },
                {
                    "signal": "beta_burst",
                    "intensity": 0.9,
                    "duration_ms": 200,
                    "frequency_hz": 25.0
                }
            ]
            
            test_context = {
                "user_id": "test_user",
                "user_focus": 0.7,
                "session_mode": "consciousness_testing",
                "emotional_state": "focused"
            }
            
            successful_collapses = 0
            
            for i, signal in enumerate(test_signals):
                print(f"\n🔄 Processing signal {i+1}: {signal['signal']}")
                
                # Process signal
                fbip_event = await engine.process_neural_signal_async(signal, test_context)
                
                if fbip_event:
                    successful_collapses += 1
                    print(f"  ✅ Success: {fbip_event.action_type.value}")
                    print(f"  🎯 Network: {fbip_event.target_network.value}")
                    print(f"  ⚡ Energy: {fbip_event.consciousness_metrics.energy_cost:.1f}")
                else:
                    print(f"  ❌ Failed")
                
                # Brief pause between signals
                await asyncio.sleep(0.1)
            
            # Get comprehensive status
            status = engine.get_comprehensive_status()
            
            print(f"\n📊 Engine Status Summary:")
            print(f"Health: {status['engine_health']}")
            print(f"Success Rate: {status['health_metrics']['success_rate']:.2%}")
            print(f"Total Collapses: {status['health_metrics']['total_collapses']}")
            print(f"Circuit Breaker: {'🔒 Open' if status['circuit_breaker']['is_open'] else '🔓 Closed'}")
            print(f"Emergency Mode: {'🚨 Active' if status['emergency_status']['emergency_mode'] else '✅ Normal'}")
            
            print(f"\n🎯 Test Results:")
            print(f"Successful Collapses: {successful_collapses}/{len(test_signals)}")
            print(f"Success Rate: {successful_collapses/len(test_signals):.2%}")
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
            logger.exception("Production engine test failed")
    
    # Run the test
    asyncio.run(test_production_engine())