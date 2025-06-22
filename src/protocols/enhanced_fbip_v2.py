# src/protocols/enhanced_fbip_v2.py
# High-performance Fractality Brain Interface Protocol with binary support and compression

import json
import uuid
import struct
import zlib
import time
import threading
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Union, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum, IntEnum
import numpy as np
from collections import deque
import pickle
import msgpack  # High-performance binary serialization

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Protocol constants
FBIP_MAGIC_BYTES = b'FBIP'
FBIP_VERSION = 0x0200  # Version 2.0
MAX_PACKET_SIZE = 65536  # 64KB max packet
COMPRESSION_THRESHOLD = 512  # Compress packets > 512 bytes

class SignalType(IntEnum):
    """Integer enum for compact binary representation"""
    # Traditional brainwave patterns (0-15)
    ALPHA_PEAK = 0
    BETA_BURST = 1
    THETA_SURGE = 2
    DELTA_DIP = 3
    GAMMA_SYNC = 4
    P300_RESPONSE = 5
    
    # Quantum consciousness signals (16-31)
    SUPERPOSITION_COLLAPSE = 16
    ENTANGLEMENT_EVENT = 17
    DECOHERENCE_DETECTED = 18
    QUANTUM_TUNNELING = 19
    
    # Consciousness field fluctuations (32-47)
    FIELD_RESONANCE = 32
    VACUUM_FLUCTUATION = 33
    CONSCIOUSNESS_EMERGENCE = 34
    
    # Metabolic consciousness signals (48-63)
    ATP_DEPLETION = 48
    ENERGY_SURGE = 49
    METABOLIC_STRESS = 50
    RECOVERY_PHASE = 51

class ActionType(IntEnum):
    """Integer enum for compact binary representation"""
    # Traditional actions (0-15)
    HIGHLIGHT_CLUSTER = 0
    GENERATE_NODE = 1
    LINK_NODES = 2
    EXPAND_NODE = 3
    PULSE_FEEDBACK = 4
    
    # Quantum consciousness actions (16-31)
    CREATE_SUPERPOSITION = 16
    COLLAPSE_STATE = 17
    ENTANGLE_NODES = 18
    MEASURE_COHERENCE = 19
    
    # Consciousness field actions (32-47)
    ADJUST_FIELD_STRENGTH = 32
    PROPAGATE_RESONANCE = 33
    SPAWN_VACUUM_NODE = 34
    
    # Metabolic actions (48-63)
    ALLOCATE_ENERGY = 48
    TRIGGER_RECOVERY = 49
    INDUCE_STRESS = 50
    BALANCE_NETWORKS = 51
    
    # Hardware actions (64-79)
    SDC_WORK = 64
    MEMRISTOR_UPDATE = 65
    QUANTUM_GATE = 66

class ConsciousnessNetwork(IntEnum):
    """Integer enum for compact binary representation"""
    EXECUTIVE = 0      # 50% energy - decision making
    MEMORY = 1         # 30% energy - storage/recall
    SENSORY = 2        # 20% energy - input processing
    INTEGRATION = 3    # Cross-network synthesis

class ProtocolFormat(Enum):
    """Protocol serialization formats"""
    JSON = "json"           # Human-readable, larger size
    BINARY = "binary"       # Compact binary format
    MSGPACK = "msgpack"     # MessagePack binary
    COMPRESSED = "compressed"  # Compressed binary

class Priority(IntEnum):
    """Message priority levels"""
    LOW = 1
    NORMAL = 5
    HIGH = 8
    CRITICAL = 10

@dataclass
class QuantumState:
    """Optimized quantum state representation"""
    amplitudes: np.ndarray
    phases: np.ndarray
    coherence_time: float
    entanglements: List[str]
    measurement_basis: str = "computational"
    
    def to_compact_dict(self) -> Dict:
        """Convert to compact dictionary for binary serialization"""
        return {
            "a": self.amplitudes.astype(np.float32).tobytes(),  # 32-bit floats for size
            "p": self.phases.astype(np.float32).tobytes(),
            "c": self.coherence_time,
            "e": self.entanglements,
            "m": self.measurement_basis
        }
    
    @classmethod
    def from_compact_dict(cls, data: Dict) -> 'QuantumState':
        """Restore from compact dictionary"""
        return cls(
            amplitudes=np.frombuffer(data["a"], dtype=np.float32),
            phases=np.frombuffer(data["p"], dtype=np.float32),
            coherence_time=data["c"],
            entanglements=data["e"],
            measurement_basis=data["m"]
        )

@dataclass
class ConsciousnessMetrics:
    """Optimized consciousness metrics"""
    consciousness_level: float
    energy_cost: float
    network_allocation: Dict[int, float]  # Use int keys for compactness
    field_coherence: float
    metabolic_state: str
    
    def to_compact_dict(self) -> Dict:
        """Convert to compact representation"""
        return {
            "cl": round(self.consciousness_level, 3),
            "ec": round(self.energy_cost, 2),
            "na": {k: round(v, 3) for k, v in self.network_allocation.items()},
            "fc": round(self.field_coherence, 3),
            "ms": self.metabolic_state
        }

@dataclass
class OptimizedFBIPEvent:
    """High-performance FBIP event with optimized serialization"""
    
    # Core identification (compact)
    event_id: str
    timestamp: float  # Unix timestamp for compactness
    version: int = FBIP_VERSION
    
    # Signal information (optimized)
    signal_type: SignalType
    intensity: float           # 0.0 - 1.0
    duration_ms: int
    frequency_hz: Optional[float] = None
    
    # Quantum properties (optional for size optimization)
    quantum_state: Optional[QuantumState] = None
    superposition_count: int = 0
    entanglement_strength: float = 0.0
    
    # Consciousness metrics
    consciousness_metrics: Optional[ConsciousnessMetrics] = None
    
    # Action specification
    action_type: ActionType
    target_network: ConsciousnessNetwork
    target_nodes: List[str]
    
    # Action parameters (compact)
    action_parameters: Dict[str, Any]
    
    # Hardware integration (optional)
    sdc_chip_targets: Optional[List[int]] = None
    memristor_pattern: Optional[np.ndarray] = None
    
    # Context information (minimal)
    user_context: Optional[Dict[str, Any]] = None
    session_context: Optional[Dict[str, Any]] = None
    
    # Validation and routing
    priority: Priority = Priority.NORMAL
    requires_confirmation: bool = False
    energy_budget: float = 0.0
    
    def to_compact_dict(self) -> Dict:
        """Convert to highly compact dictionary representation"""
        compact = {
            "id": self.event_id,
            "ts": self.timestamp,
            "v": self.version,
            "st": int(self.signal_type),
            "i": round(self.intensity, 3),
            "d": self.duration_ms,
            "at": int(self.action_type),
            "tn": int(self.target_network),
            "nodes": self.target_nodes,
            "params": self.action_parameters,
            "p": int(self.priority),
            "eb": round(self.energy_budget, 2)
        }
        
        # Add optional fields only if present
        if self.frequency_hz is not None:
            compact["f"] = round(self.frequency_hz, 1)
        
        if self.quantum_state:
            compact["qs"] = self.quantum_state.to_compact_dict()
        
        if self.superposition_count > 0:
            compact["sc"] = self.superposition_count
        
        if self.entanglement_strength > 0:
            compact["es"] = round(self.entanglement_strength, 3)
        
        if self.consciousness_metrics:
            compact["cm"] = self.consciousness_metrics.to_compact_dict()
        
        if self.sdc_chip_targets:
            compact["sdc"] = self.sdc_chip_targets
        
        if self.memristor_pattern is not None:
            compact["mp"] = self.memristor_pattern.astype(np.float32).tobytes()
        
        if self.requires_confirmation:
            compact["rc"] = True
        
        # Minimal context (only essential fields)
        if self.user_context:
            essential_user = {k: v for k, v in self.user_context.items() 
                            if k in ["user_id", "session_id", "priority"]}
            if essential_user:
                compact["uc"] = essential_user
        
        return compact

class PacketHeader:
    """Binary packet header for FBIP protocol"""
    
    # Header format: Magic(4) + Version(2) + Type(1) + Flags(1) + Length(4) + Checksum(4) = 16 bytes
    HEADER_SIZE = 16
    HEADER_FORMAT = "!4sHBBII"  # Network byte order
    
    def __init__(self, packet_type: int, flags: int, data_length: int, checksum: int):
        self.magic = FBIP_MAGIC_BYTES
        self.version = FBIP_VERSION
        self.packet_type = packet_type
        self.flags = flags
        self.data_length = data_length
        self.checksum = checksum
    
    def pack(self) -> bytes:
        """Pack header to bytes"""
        return struct.pack(
            self.HEADER_FORMAT,
            self.magic,
            self.version,
            self.packet_type,
            self.flags,
            self.data_length,
            self.checksum
        )
    
    @classmethod
    def unpack(cls, data: bytes) -> 'PacketHeader':
        """Unpack header from bytes"""
        if len(data) < cls.HEADER_SIZE:
            raise ValueError("Insufficient data for header")
        
        unpacked = struct.unpack(cls.HEADER_FORMAT, data[:cls.HEADER_SIZE])
        
        if unpacked[0] != FBIP_MAGIC_BYTES:
            raise ValueError("Invalid FBIP magic bytes")
        
        return cls(
            packet_type=unpacked[2],
            flags=unpacked[3],
            data_length=unpacked[4],
            checksum=unpacked[5]
        )

class PacketType(IntEnum):
    """Binary packet types"""
    SINGLE_EVENT = 0
    BATCH_EVENTS = 1
    HEARTBEAT = 2
    ACK = 3
    ERROR = 4
    QUANTUM_STATE = 5
    CONSCIOUSNESS_METRICS = 6

class PacketFlags:
    """Binary packet flags"""
    COMPRESSED = 0x01
    ENCRYPTED = 0x02
    PRIORITY = 0x04
    FRAGMENTED = 0x08

class PerformanceStats:
    """Performance statistics for protocol optimization"""
    
    def __init__(self):
        self.serialization_times = deque(maxlen=1000)
        self.deserialization_times = deque(maxlen=1000)
        self.compression_ratios = deque(maxlen=1000)
        self.packet_sizes = deque(maxlen=1000)
        self.error_count = 0
        self.total_packets = 0
        self._lock = threading.Lock()
    
    def record_serialization(self, format_type: str, time_ms: float, 
                           original_size: int, final_size: int):
        """Record serialization performance"""
        with self._lock:
            self.serialization_times.append(time_ms)
            self.packet_sizes.append(final_size)
            
            if original_size > 0:
                compression_ratio = final_size / original_size
                self.compression_ratios.append(compression_ratio)
            
            self.total_packets += 1
    
    def record_error(self):
        """Record protocol error"""
        with self._lock:
            self.error_count += 1
    
    def get_stats(self) -> Dict:
        """Get performance statistics"""
        with self._lock:
            return {
                "avg_serialization_time_ms": np.mean(self.serialization_times) if self.serialization_times else 0,
                "avg_packet_size_bytes": np.mean(self.packet_sizes) if self.packet_sizes else 0,
                "avg_compression_ratio": np.mean(self.compression_ratios) if self.compression_ratios else 1.0,
                "error_rate": self.error_count / max(1, self.total_packets),
                "total_packets": self.total_packets,
                "errors": self.error_count
            }

class FBIPProtocolV3:
    """High-performance Fractality Brain Interface Protocol v3.0"""
    
    def __init__(self, default_format: ProtocolFormat = ProtocolFormat.BINARY):
        self.version = "3.0"
        self.session_id = str(uuid.uuid4())
        self.default_format = default_format
        
        # Event batching for efficiency
        self.batch_size = 10
        self.batch_timeout_ms = 50  # 50ms batch timeout
        self.pending_batch: List[OptimizedFBIPEvent] = []
        self.last_batch_time = time.time()
        
        # Performance tracking
        self.stats = PerformanceStats()
        
        # Protocol configuration
        self.enable_compression = True
        self.compression_threshold = COMPRESSION_THRESHOLD
        self.enable_encryption = False  # For future implementation
        
        # Energy management
        self.energy_budget = 1000.0
        self.energy_allocation = {
            ConsciousnessNetwork.EXECUTIVE: 500.0,
            ConsciousnessNetwork.MEMORY: 300.0,
            ConsciousnessNetwork.SENSORY: 200.0
        }
        
        # Message sequencing
        self.sequence_number = 0
        self.acknowledged_sequences: Set[int] = set()
        
        # Thread safety
        self._lock = threading.Lock()
        
        logger.info(f"FBIP Protocol v{self.version} initialized with {default_format.value} format")
    
    def create_event(self, signal_data: Dict, action_spec: Dict, 
                     context: Optional[Dict] = None) -> OptimizedFBIPEvent:
        """Create optimized FBIP event with validation"""
        
        try:
            start_time = time.perf_counter()
            
            # Validate inputs
            if not self._validate_signal_data(signal_data):
                raise ValueError("Invalid signal data")
            
            if not self._validate_action_spec(action_spec):
                raise ValueError("Invalid action specification")
            
            # Generate efficient event ID
            event_id = f"fbip_{self.sequence_number:08x}_{int(time.time() * 1000) & 0xFFFF}"
            
            # Parse signal type with validation
            signal_type_str = signal_data.get("signal", "alpha_peak")
            try:
                signal_type = SignalType[signal_type_str.upper()]
            except KeyError:
                logger.warning(f"Unknown signal type: {signal_type_str}, using ALPHA_PEAK")
                signal_type = SignalType.ALPHA_PEAK
            
            # Create quantum state if applicable
            quantum_state = None
            if self._is_quantum_signal(signal_type):
                quantum_state = self._create_optimized_quantum_state(signal_data)
            
            # Create consciousness metrics
            consciousness_metrics = self._create_optimized_consciousness_metrics(
                signal_data, action_spec, context
            )
            
            # Parse action with validation
            action_type_str = action_spec.get("action_type", "highlight_cluster")
            try:
                action_type = ActionType[action_type_str.upper()]
            except KeyError:
                logger.warning(f"Unknown action type: {action_type_str}, using HIGHLIGHT_CLUSTER")
                action_type = ActionType.HIGHLIGHT_CLUSTER
            
            # Parse target network
            network_str = action_spec.get("target_network", "executive")
            try:
                target_network = ConsciousnessNetwork[network_str.upper()]
            except KeyError:
                logger.warning(f"Unknown network: {network_str}, using EXECUTIVE")
                target_network = ConsciousnessNetwork.EXECUTIVE
            
            # Parse priority
            priority_val = action_spec.get("priority", 5)
            try:
                priority = Priority(priority_val)
            except ValueError:
                priority = Priority.NORMAL
            
            # Create hardware targeting if needed
            sdc_targets = None
            memristor_pattern = None
            if action_spec.get("enable_hardware", False):
                sdc_targets, memristor_pattern = self._create_optimized_hardware_targeting(
                    target_network, action_spec
                )
            
            # Create optimized event
            event = OptimizedFBIPEvent(
                event_id=event_id,
                timestamp=time.time(),
                signal_type=signal_type,
                intensity=max(0.0, min(1.0, signal_data.get("intensity", 0.5))),
                duration_ms=max(1, signal_data.get("duration_ms", 200)),
                frequency_hz=signal_data.get("frequency_hz"),
                quantum_state=quantum_state,
                superposition_count=signal_data.get("superposition_count", 0),
                entanglement_strength=max(0.0, min(1.0, signal_data.get("entanglement_strength", 0.0))),
                consciousness_metrics=consciousness_metrics,
                action_type=action_type,
                target_network=target_network,
                target_nodes=action_spec.get("target_nodes", []),
                action_parameters=action_spec.get("parameters", {}),
                sdc_chip_targets=sdc_targets,
                memristor_pattern=memristor_pattern,
                user_context=self._sanitize_context(context),
                session_context={"session_id": self.session_id, "sequence": self.sequence_number},
                priority=priority,
                requires_confirmation=action_spec.get("requires_confirmation", False),
                energy_budget=action_spec.get("energy_budget", 0.0)
            )
            
            self.sequence_number += 1
            
            # Record performance
            creation_time = (time.perf_counter() - start_time) * 1000
            logger.debug(f"Created FBIP event in {creation_time:.2f}ms")
            
            return event
            
        except Exception as e:
            logger.error(f"Failed to create FBIP event: {e}")
            self.stats.record_error()
            raise
    
    def serialize_event(self, event: OptimizedFBIPEvent, 
                       format_type: Optional[ProtocolFormat] = None) -> bytes:
        """Serialize event with optimized format selection"""
        
        if format_type is None:
            format_type = self.default_format
        
        start_time = time.perf_counter()
        
        try:
            with self._lock:
                if format_type == ProtocolFormat.JSON:
                    data = self._serialize_json(event)
                elif format_type == ProtocolFormat.BINARY:
                    data = self._serialize_binary(event)
                elif format_type == ProtocolFormat.MSGPACK:
                    data = self._serialize_msgpack(event)
                elif format_type == ProtocolFormat.COMPRESSED:
                    data = self._serialize_compressed(event)
                else:
                    raise ValueError(f"Unsupported format: {format_type}")
                
                # Record performance
                serialization_time = (time.perf_counter() - start_time) * 1000
                
                # Estimate original size (JSON as baseline)
                original_size = len(json.dumps(event.to_compact_dict()).encode('utf-8'))
                
                self.stats.record_serialization(
                    format_type.value,
                    serialization_time, 
                    original_size,
                    len(data)
                )
                
                logger.debug(f"Serialized event ({format_type.value}): {len(data)} bytes in {serialization_time:.2f}ms")
                return data
        
        except Exception as e:
            logger.error(f"Serialization failed: {e}")
            self.stats.record_error()
            raise
    
    def deserialize_event(self, data: bytes) -> OptimizedFBIPEvent:
        """Deserialize event with automatic format detection"""
        
        start_time = time.perf_counter()
        
        try:
            # Detect format
            format_type = self._detect_format(data)
            
            with self._lock:
                if format_type == ProtocolFormat.JSON:
                    event = self._deserialize_json(data)
                elif format_type == ProtocolFormat.BINARY:
                    event = self._deserialize_binary(data)
                elif format_type == ProtocolFormat.MSGPACK:
                    event = self._deserialize_msgpack(data)
                elif format_type == ProtocolFormat.COMPRESSED:
                    event = self._deserialize_compressed(data)
                else:
                    raise ValueError(f"Unknown format detected")
                
                # Record performance
                deserialization_time = (time.perf_counter() - start_time) * 1000
                self.stats.deserialization_times.append(deserialization_time)
                
                logger.debug(f"Deserialized event ({format_type.value}) in {deserialization_time:.2f}ms")
                return event
        
        except Exception as e:
            logger.error(f"Deserialization failed: {e}")
            self.stats.record_error()
            raise
    
    def batch_events(self, events: List[OptimizedFBIPEvent]) -> bytes:
        """Serialize multiple events in a single batch packet"""
        
        try:
            # Create batch data
            batch_data = {
                "type": "batch",
                "count": len(events),
                "events": [event.to_compact_dict() for event in events],
                "timestamp": time.time(),
                "session_id": self.session_id
            }
            
            # Serialize batch
            if self.default_format == ProtocolFormat.BINARY:
                return self._create_binary_packet(PacketType.BATCH_EVENTS, batch_data)
            else:
                packed_data = msgpack.packb(batch_data)
                return self._create_binary_packet(PacketType.BATCH_EVENTS, packed_data)
        
        except Exception as e:
            logger.error(f"Batch serialization failed: {e}")
            raise
    
    def get_performance_metrics(self) -> Dict:
        """Get comprehensive performance metrics"""
        
        base_stats = self.stats.get_stats()
        
        return {
            "protocol_version": self.version,
            "session_id": self.session_id,
            "default_format": self.default_format.value,
            "performance": base_stats,
            "configuration": {
                "compression_enabled": self.enable_compression,
                "compression_threshold": self.compression_threshold,
                "batch_size": self.batch_size,
                "batch_timeout_ms": self.batch_timeout_ms
            },
            "energy_management": {
                "total_budget": self.energy_budget,
                "allocations": {k.value: v for k, v in self.energy_allocation.items()}
            },
            "sequence_info": {
                "current_sequence": self.sequence_number,
                "acknowledged_count": len(self.acknowledged_sequences)
            }
        }
    
    # Private serialization methods
    
    def _serialize_json(self, event: OptimizedFBIPEvent) -> bytes:
        """Serialize to JSON format"""
        data = {
            "protocol_version": f"FBIP_v{self.version}",
            "format": "json",
            "event": event.to_compact_dict()
        }
        return json.dumps(data, separators=(',', ':')).encode('utf-8')
    
    def _serialize_binary(self, event: OptimizedFBIPEvent) -> bytes:
        """Serialize to efficient binary format"""
        compact_data = event.to_compact_dict()
        packed_data = msgpack.packb(compact_data)
        return self._create_binary_packet(PacketType.SINGLE_EVENT, packed_data)
    
    def _serialize_msgpack(self, event: OptimizedFBIPEvent) -> bytes:
        """Serialize to MessagePack format"""
        compact_data = event.to_compact_dict()
        return msgpack.packb(compact_data)
    
    def _serialize_compressed(self, event: OptimizedFBIPEvent) -> bytes:
        """Serialize with compression"""
        # Start with binary format
        binary_data = self._serialize_msgpack(event)
        
        # Compress if above threshold
        if len(binary_data) > self.compression_threshold:
            compressed_data = zlib.compress(binary_data, level=6)  # Good compression/speed tradeoff
            
            # Create packet with compression flag
            flags = PacketFlags.COMPRESSED
            header = PacketHeader(
                packet_type=PacketType.SINGLE_EVENT,
                flags=flags,
                data_length=len(compressed_data),
                checksum=zlib.crc32(compressed_data) & 0xFFFFFFFF
            )
            
            return header.pack() + compressed_data
        else:
            return binary_data
    
    def _create_binary_packet(self, packet_type: PacketType, data: Union[bytes, Dict]) -> bytes:
        """Create binary packet with header"""
        
        # Convert data to bytes if needed
        if isinstance(data, dict):
            data_bytes = msgpack.packb(data)
        else:
            data_bytes = data
        
        # Calculate checksum
        checksum = zlib.crc32(data_bytes) & 0xFFFFFFFF
        
        # Create header
        header = PacketHeader(
            packet_type=int(packet_type),
            flags=0,
            data_length=len(data_bytes),
            checksum=checksum
        )
        
        return header.pack() + data_bytes
    
    def _detect_format(self, data: bytes) -> ProtocolFormat:
        """Detect serialization format from data"""
        
        if len(data) < 4:
            raise ValueError("Data too short for format detection")
        
        # Check for FBIP binary magic
        if data[:4] == FBIP_MAGIC_BYTES:
            return ProtocolFormat.BINARY
        
        # Check for JSON
        try:
            if data[0:1] == b'{' and data[-1:] == b'}':
                json.loads(data.decode('utf-8'))
                return ProtocolFormat.JSON
        except:
            pass
        
        # Check for compressed data (zlib magic)
        if data[0:2] == b'\x78\x9c' or data[0:2] == b'\x78\x01':
            return ProtocolFormat.COMPRESSED
        
        # Default to MessagePack
        return ProtocolFormat.MSGPACK
    
    def _deserialize_json(self, data: bytes) -> OptimizedFBIPEvent:
        """Deserialize from JSON format"""
        json_data = json.loads(data.decode('utf-8'))
        event_data = json_data["event"]
        return self._reconstruct_event_from_dict(event_data)
    
    def _deserialize_binary(self, data: bytes) -> OptimizedFBIPEvent:
        """Deserialize from binary format"""
        # Parse header
        header = PacketHeader.unpack(data)
        
        # Extract payload
        payload_data = data[PacketHeader.HEADER_SIZE:]
        
        # Verify checksum
        calculated_checksum = zlib.crc32(payload_data) & 0xFFFFFFFF
        if calculated_checksum != header.checksum:
            raise ValueError("Packet checksum mismatch")
        
        # Unpack payload
        event_data = msgpack.unpackb(payload_data, raw=False)
        return self._reconstruct_event_from_dict(event_data)
    
    def _deserialize_msgpack(self, data: bytes) -> OptimizedFBIPEvent:
        """Deserialize from MessagePack format"""
        event_data = msgpack.unpackb(data, raw=False)
        return self._reconstruct_event_from_dict(event_data)
    
    def _deserialize_compressed(self, data: bytes) -> OptimizedFBIPEvent:
        """Deserialize from compressed format"""
        # Parse header
        header = PacketHeader.unpack(data)
        
        # Extract and decompress payload
        compressed_data = data[PacketHeader.HEADER_SIZE:]
        
        # Verify checksum
        calculated_checksum = zlib.crc32(compressed_data) & 0xFFFFFFFF
        if calculated_checksum != header.checksum:
            raise ValueError("Compressed packet checksum mismatch")
        
        # Decompress
        if header.flags & PacketFlags.COMPRESSED:
            decompressed_data = zlib.decompress(compressed_data)
        else:
            decompressed_data = compressed_data
        
        # Unpack
        event_data = msgpack.unpackb(decompressed_data, raw=False)
        return self._reconstruct_event_from_dict(event_data)
    
    def _reconstruct_event_from_dict(self, data: Dict) -> OptimizedFBIPEvent:
        """Reconstruct OptimizedFBIPEvent from compact dictionary"""
        
        # Reconstruct quantum state if present
        quantum_state = None
        if "qs" in data:
            quantum_state = QuantumState.from_compact_dict(data["qs"])
        
        # Reconstruct consciousness metrics if present
        consciousness_metrics = None
        if "cm" in data:
            cm_data = data["cm"]
            consciousness_metrics = ConsciousnessMetrics(
                consciousness_level=cm_data["cl"],
                energy_cost=cm_data["ec"],
                network_allocation=cm_data["na"],
                field_coherence=cm_data["fc"],
                metabolic_state=cm_data["ms"]
            )
        
        # Reconstruct memristor pattern if present
        memristor_pattern = None
        if "mp" in data:
            memristor_pattern = np.frombuffer(data["mp"], dtype=np.float32)
        
        return OptimizedFBIPEvent(
            event_id=data["id"],
            timestamp=data["ts"],
            version=data.get("v", FBIP_VERSION),
            signal_type=SignalType(data["st"]),
            intensity=data["i"],
            duration_ms=data["d"],
            frequency_hz=data.get("f"),
            quantum_state=quantum_state,
            superposition_count=data.get("sc", 0),
            entanglement_strength=data.get("es", 0.0),
            consciousness_metrics=consciousness_metrics,
            action_type=ActionType(data["at"]),
            target_network=ConsciousnessNetwork(data["tn"]),
            target_nodes=data["nodes"],
            action_parameters=data["params"],
            sdc_chip_targets=data.get("sdc"),
            memristor_pattern=memristor_pattern,
            user_context=data.get("uc"),
            session_context={"session_id": self.session_id},
            priority=Priority(data["p"]),
            requires_confirmation=data.get("rc", False),
            energy_budget=data["eb"]
        )
    
    # Helper methods
    
    def _validate_signal_data(self, signal_data: Dict) -> bool:
        """Validate signal data structure"""
        required_fields = ["signal"]
        return all(field in signal_data for field in required_fields)
    
    def _validate_action_spec(self, action_spec: Dict) -> bool:
        """Validate action specification"""
        return isinstance(action_spec, dict)
    
    def _is_quantum_signal(self, signal_type: SignalType) -> bool:
        """Check if signal involves quantum processing"""
        quantum_signals = {
            SignalType.GAMMA_SYNC,
            SignalType.SUPERPOSITION_COLLAPSE,
            SignalType.ENTANGLEMENT_EVENT,
            SignalType.DECOHERENCE_DETECTED,
            SignalType.QUANTUM_TUNNELING,
            SignalType.CONSCIOUSNESS_EMERGENCE
        }
        return signal_type in quantum_signals
    
    def _create_optimized_quantum_state(self, signal_data: Dict) -> QuantumState:
        """Create optimized quantum state representation"""
        
        # Use smaller arrays for efficiency
        size = min(8, signal_data.get("superposition_count", 3))
        
        amplitudes = np.random.random(size).astype(np.float32)
        amplitudes /= np.linalg.norm(amplitudes)  # Normalize
        
        phases = np.random.uniform(0, 2*np.pi, size).astype(np.float32)
        
        return QuantumState(
            amplitudes=amplitudes,
            phases=phases,
            coherence_time=signal_data.get("coherence_time", 2.0),
            entanglements=[],
            measurement_basis="consciousness"
        )
    
    def _create_optimized_consciousness_metrics(self, signal_data: Dict, 
                                              action_spec: Dict, context: Dict) -> ConsciousnessMetrics:
        """Create optimized consciousness metrics"""
        
        # Calculate consciousness level from signal intensity
        intensity = signal_data.get("intensity", 0.5)
        consciousness_level = min(1.0, intensity * 1.2)
        
        # Estimate energy cost
        base_cost = intensity * 25.0
        duration_factor = signal_data.get("duration_ms", 200) / 1000.0
        energy_cost = base_cost * duration_factor
        
        # Network allocation (use integer keys for compactness)
        network_allocation = {
            0: 0.5,  # EXECUTIVE
            1: 0.3,  # MEMORY  
            2: 0.2   # SENSORY
        }
        
        return ConsciousnessMetrics(
            consciousness_level=consciousness_level,
            energy_cost=energy_cost,
            network_allocation=network_allocation,
            field_coherence=0.8,
            metabolic_state="healthy"
        )
    
    def _create_optimized_hardware_targeting(self, network: ConsciousnessNetwork, 
                                           action_spec: Dict) -> Tuple[List[int], np.ndarray]:
        """Create optimized hardware targeting"""
        
        # Determine SDC chip targets based on network
        if network == ConsciousnessNetwork.EXECUTIVE:
            sdc_targets = [0, 1]  # Primary chips
        elif network == ConsciousnessNetwork.MEMORY:
            sdc_targets = [2, 3]  # Memory chips
        else:
            sdc_targets = [0]     # Default chip
        
        # Create compact memristor pattern
        pattern_size = 64  # 8x8 pattern
        memristor_pattern = np.random.random(pattern_size).astype(np.float32)
        
        return sdc_targets, memristor_pattern
    
    def _sanitize_context(self, context: Optional[Dict]) -> Optional[Dict]:
        """Sanitize context to keep only essential fields"""
        if not context:
            return None
        
        # Keep only essential context fields for size optimization
        essential_fields = ["user_id", "session_id", "priority", "emotional_state"]
        sanitized = {k: v for k, v in context.items() if k in essential_fields}
        
        return sanitized if sanitized else None

# Factory function for high-performance protocol
def create_high_performance_fbip(format_type: ProtocolFormat = ProtocolFormat.BINARY,
                                enable_compression: bool = True) -> FBIPProtocolV3:
    """Create high-performance FBIP protocol instance"""
    
    protocol = FBIPProtocolV3(default_format=format_type)
    protocol.enable_compression = enable_compression
    
    if enable_compression:
        protocol.compression_threshold = 256  # Aggressive compression
    
    # Optimize for neural signal frequencies
    protocol.batch_size = 5  # Smaller batches for lower latency
    protocol.batch_timeout_ms = 20  # 20ms timeout for real-time response
    
    logger.info(f"High-performance FBIP protocol created: {format_type.value}, compression: {enable_compression}")
    return protocol

# Usage example with performance testing
if __name__ == "__main__":
    try:
        # Create high-performance protocol
        protocol = create_high_performance_fbip(
            format_type=ProtocolFormat.BINARY,
            enable_compression=True
        )
        
        print("🚀 Testing High-Performance FBIP Protocol")
        print("=" * 50)
        
        # Test different signal types
        test_signals = [
            {
                "signal": "gamma_sync",
                "intensity": 0.8,
                "duration_ms": 400,
                "frequency_hz": 40.0,
                "superposition_count": 3
            },
            {
                "signal": "alpha_peak", 
                "intensity": 0.6,
                "duration_ms": 300,
                "frequency_hz": 10.0
            },
            {
                "signal": "quantum_tunneling",
                "intensity": 0.9,
                "duration_ms": 200,
                "coherence_time": 1.5,
                "superposition_count": 5
            }
        ]
        
        action_specs = [
            {
                "action_type": "create_superposition",
                "target_network": "executive",
                "target_nodes": ["node_001"],
                "parameters": {"depth": 3},
                "priority": 8
            },
            {
                "action_type": "highlight_cluster",
                "target_network": "memory",
                "target_nodes": ["node_002", "node_003"],
                "parameters": {"intensity": 0.7},
                "priority": 5
            },
            {
                "action_type": "quantum_gate",
                "target_network": "integration",
                "target_nodes": ["node_004"],
                "parameters": {"gate_type": "hadamard"},
                "enable_hardware": True,
                "priority": 10
            }
        ]
        
        context = {
            "user_id": "performance_test",
            "session_id": "test_session",
            "emotional_state": "focused",
            "test_mode": True
        }
        
        # Performance test across different formats
        formats = [ProtocolFormat.JSON, ProtocolFormat.BINARY, ProtocolFormat.MSGPACK, ProtocolFormat.COMPRESSED]
        
        for format_type in formats:
            print(f"\n🔧 Testing {format_type.value.upper()} format:")
            
            total_size = 0
            total_time = 0
            
            for i, (signal, action) in enumerate(zip(test_signals, action_specs)):
                # Create event
                event = protocol.create_event(signal, action, context)
                
                # Serialize with timing
                start_time = time.perf_counter()
                serialized = protocol.serialize_event(event, format_type)
                serialize_time = (time.perf_counter() - start_time) * 1000
                
                # Deserialize with timing
                start_time = time.perf_counter()
                deserialized = protocol.deserialize_event(serialized)
                deserialize_time = (time.perf_counter() - start_time) * 1000
                
                total_size += len(serialized)
                total_time += serialize_time + deserialize_time
                
                print(f"  Signal {i+1}: {len(serialized):4d} bytes, "
                      f"{serialize_time:.2f}ms ser, {deserialize_time:.2f}ms deser")
            
            avg_size = total_size / len(test_signals)
            avg_time = total_time / len(test_signals)
            
            print(f"  Average: {avg_size:.0f} bytes, {avg_time:.2f}ms total")
        
        # Get comprehensive performance metrics
        metrics = protocol.get_performance_metrics()
        
        print(f"\n📊 Protocol Performance Summary:")
        print(f"Total Packets: {metrics['performance']['total_packets']}")
        print(f"Error Rate: {metrics['performance']['error_rate']:.3%}")
        print(f"Avg Serialization Time: {metrics['performance']['avg_serialization_time_ms']:.2f}ms")
        print(f"Avg Packet Size: {metrics['performance']['avg_packet_size_bytes']:.0f} bytes")
        print(f"Avg Compression Ratio: {metrics['performance']['avg_compression_ratio']:.2f}")
        
        # Test batch processing
        print(f"\n🔄 Testing Batch Processing:")
        events = []
        for signal, action in zip(test_signals, action_specs):
            events.append(protocol.create_event(signal, action, context))
        
        batch_data = protocol.batch_events(events)
        print(f"Batch size: {len(batch_data)} bytes for {len(events)} events")
        print(f"Efficiency: {len(batch_data) / (len(events) * metrics['performance']['avg_packet_size_bytes']):.2f}x")
        
        print(f"\n✅ High-Performance FBIP Protocol test completed successfully!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        logger.exception("High-performance FBIP test failed")