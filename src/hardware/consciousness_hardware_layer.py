# src/hardware/consciousness_hardware_layer.py
# Production-ready hardware abstraction layer for consciousness devices

import time
import threading
import logging
import struct
import serial
import usb.core
import usb.util
import numpy as np
import json
from typing import Dict, List, Optional, Tuple, Callable, Union
from dataclasses import dataclass, field
from enum import Enum, IntEnum
from collections import deque
import hashlib
import hmac
import secrets

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DeviceType(Enum):
    SDC_CHIP = "sdc_chip"                    # Sparse Distributed Computing chip
    MEMRISTOR_ARRAY = "memristor_array"     # 8x8x8 memristor cube
    NEURAL_INTERFACE = "neural_interface"    # EEG/BCI device
    THERMAL_SENSOR = "thermal_sensor"       # Temperature monitoring
    POWER_MANAGEMENT = "power_management"   # Battery and power control
    QUANTUM_RANDOM = "quantum_random"       # Hardware random number generator

class DeviceState(Enum):
    OFFLINE = "offline"
    INITIALIZING = "initializing"
    ONLINE = "online"
    ERROR = "error"
    THERMAL_THROTTLED = "thermal_throttled"
    LOW_POWER = "low_power"
    EMERGENCY = "emergency"

class CommandType(IntEnum):
    # Device management
    PING = 0x01
    GET_STATUS = 0x02
    RESET = 0x03
    SHUTDOWN = 0x04
    
    # Consciousness operations
    SDC_WORK = 0x10
    MEMRISTOR_WRITE = 0x11
    MEMRISTOR_READ = 0x12
    QUANTUM_RANDOM = 0x13
    
    # Monitoring
    GET_TEMPERATURE = 0x20
    GET_POWER_STATUS = 0x21
    GET_DIAGNOSTICS = 0x22
    
    # Safety
    EMERGENCY_STOP = 0xFF

class ResponseCode(IntEnum):
    SUCCESS = 0x00
    ERROR_INVALID_COMMAND = 0x01
    ERROR_INVALID_PARAMETERS = 0x02
    ERROR_DEVICE_BUSY = 0x03
    ERROR_INSUFFICIENT_POWER = 0x04
    ERROR_OVERHEATING = 0x05
    ERROR_HARDWARE_FAULT = 0x06
    ERROR_TIMEOUT = 0x07

@dataclass
class HardwareCapabilities:
    """Hardware capabilities specification"""
    device_type: DeviceType
    max_power_mw: float
    max_temperature_c: float
    processing_cores: int
    memory_size_mb: float
    
    # SDC-specific
    sdc_frequency_mhz: Optional[float] = None
    sdc_precision_bits: Optional[int] = None
    
    # Memristor-specific
    memristor_dimensions: Optional[Tuple[int, int, int]] = None
    memristor_states: Optional[int] = None
    
    # Neural interface specific
    eeg_channels: Optional[int] = None
    sample_rate_hz: Optional[float] = None

@dataclass
class DeviceHealth:
    """Device health and status information"""
    temperature_c: float
    power_consumption_mw: float
    battery_level_percent: float
    error_count: int
    uptime_seconds: float
    last_heartbeat: float
    
    # Performance metrics
    operations_per_second: float = 0.0
    average_response_time_ms: float = 0.0
    memory_usage_percent: float = 0.0
    
    # Safety indicators
    thermal_warnings: int = 0
    power_warnings: int = 0
    hardware_faults: int = 0

class HardwareProtocol:
    """Low-level hardware communication protocol"""
    
    # Protocol constants
    MAGIC_BYTES = b'CONS'
    PROTOCOL_VERSION = 0x01
    MAX_PACKET_SIZE = 1024
    TIMEOUT_SECONDS = 5.0
    
    def __init__(self, device_path: str, baud_rate: int = 115200):
        self.device_path = device_path
        self.baud_rate = baud_rate
        self.connection = None
        self.sequence_number = 0
        self.encryption_key = None
        self._lock = threading.Lock()
        
        # Security
        self.device_id = None
        self.session_key = None
        self.authenticated = False
    
    def connect(self) -> bool:
        """Establish connection to hardware device"""
        try:
            # Try USB first, then serial
            if self._connect_usb():
                logger.info(f"Connected to USB device")
                return True
            elif self._connect_serial():
                logger.info(f"Connected to serial device: {self.device_path}")
                return True
            else:
                logger.error("Failed to connect to any device")
                return False
                
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            return False
    
    def disconnect(self):
        """Safely disconnect from device"""
        with self._lock:
            if self.connection:
                try:
                    # Send shutdown command
                    self._send_command(CommandType.SHUTDOWN, b'')
                    time.sleep(0.1)
                    
                    if hasattr(self.connection, 'close'):
                        self.connection.close()
                except:
                    pass
                
                self.connection = None
                self.authenticated = False
                logger.info("Disconnected from hardware device")
    
    def send_command(self, command: CommandType, data: bytes = b'') -> Optional[bytes]:
        """Send command to device with security and error handling"""
        if not self.connection:
            logger.error("No connection to device")
            return None
        
        with self._lock:
            try:
                # Create packet
                packet = self._create_packet(command, data)
                
                # Send packet
                if hasattr(self.connection, 'write'):
                    # Serial interface
                    self.connection.write(packet)
                    response = self._read_response_serial()
                else:
                    # USB interface
                    self.connection.write(0x02, packet)  # Bulk OUT endpoint
                    response = self._read_response_usb()
                
                return self._parse_response(response)
                
            except Exception as e:
                logger.error(f"Command failed: {e}")
                return None
    
    def authenticate(self, device_key: bytes) -> bool:
        """Authenticate with the device using shared key"""
        try:
            # Generate challenge
            challenge = secrets.token_bytes(32)
            
            # Send authentication request
            auth_data = struct.pack('<I', len(challenge)) + challenge
            response = self.send_command(CommandType.PING, auth_data)
            
            if not response or len(response) < 32:
                return False
            
            # Verify response
            expected_response = hmac.new(device_key, challenge, hashlib.sha256).digest()
            
            if hmac.compare_digest(response[:32], expected_response):
                self.authenticated = True
                self.session_key = hashlib.sha256(challenge + device_key).digest()
                logger.info("Device authentication successful")
                return True
            else:
                logger.error("Device authentication failed")
                return False
                
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return False
    
    def _connect_usb(self) -> bool:
        """Attempt USB connection"""
        try:
            # Find consciousness device (vendor/product ID would be defined)
            dev = usb.core.find(idVendor=0x1234, idProduct=0x5678)  # Placeholder IDs
            
            if dev is None:
                return False
            
            # Set configuration
            dev.set_configuration()
            self.connection = dev
            return True
            
        except Exception as e:
            logger.debug(f"USB connection failed: {e}")
            return False
    
    def _connect_serial(self) -> bool:
        """Attempt serial connection"""
        try:
            self.connection = serial.Serial(
                self.device_path,
                self.baud_rate,
                timeout=self.TIMEOUT_SECONDS
            )
            return True
            
        except Exception as e:
            logger.debug(f"Serial connection failed: {e}")
            return False
    
    def _create_packet(self, command: CommandType, data: bytes) -> bytes:
        """Create protocol packet"""
        # Packet format: Magic(4) + Version(1) + Command(1) + Seq(2) + Length(2) + Data + Checksum(2)
        
        self.sequence_number = (self.sequence_number + 1) % 65536
        
        header = struct.pack('<4sBBHH',
            self.MAGIC_BYTES,
            self.PROTOCOL_VERSION,
            int(command),
            self.sequence_number,
            len(data)
        )
        
        # Calculate checksum
        checksum = self._calculate_checksum(header + data)
        
        packet = header + data + struct.pack('<H', checksum)
        
        # Encrypt if session key available
        if self.session_key and len(data) > 0:
            encrypted_data = self._encrypt_data(data)
            # Recreate packet with encrypted data
            header = struct.pack('<4sBBHH',
                self.MAGIC_BYTES,
                self.PROTOCOL_VERSION | 0x80,  # Set encryption flag
                int(command),
                self.sequence_number,
                len(encrypted_data)
            )
            checksum = self._calculate_checksum(header + encrypted_data)
            packet = header + encrypted_data + struct.pack('<H', checksum)
        
        return packet
    
    def _calculate_checksum(self, data: bytes) -> int:
        """Calculate CRC16 checksum"""
        crc = 0xFFFF
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if crc & 1:
                    crc = (crc >> 1) ^ 0xA001
                else:
                    crc >>= 1
        return crc
    
    def _encrypt_data(self, data: bytes) -> bytes:
        """Simple XOR encryption (would use AES in production)"""
        if not self.session_key:
            return data
        
        encrypted = bytearray()
        key_len = len(self.session_key)
        
        for i, byte in enumerate(data):
            encrypted.append(byte ^ self.session_key[i % key_len])
        
        return bytes(encrypted)

class ConsciousnessDevice:
    """High-level consciousness device interface"""
    
    def __init__(self, device_type: DeviceType, device_path: str, 
                 capabilities: HardwareCapabilities):
        self.device_type = device_type
        self.device_path = device_path
        self.capabilities = capabilities
        
        # Communication
        self.protocol = HardwareProtocol(device_path)
        self.state = DeviceState.OFFLINE
        
        # Monitoring
        self.health = DeviceHealth(
            temperature_c=25.0,
            power_consumption_mw=0.0,
            battery_level_percent=100.0,
            error_count=0,
            uptime_seconds=0.0,
            last_heartbeat=0.0
        )
        
        # Safety limits
        self.max_temperature = capabilities.max_temperature_c
        self.max_power = capabilities.max_power_mw
        self.thermal_throttle_temp = self.max_temperature * 0.9
        
        # Performance tracking
        self.operation_history = deque(maxlen=1000)
        self.last_operation_time = 0.0
        
        # Callbacks
        self.alert_callbacks: List[Callable] = []
        
        # Monitoring thread
        self._monitoring_thread = None
        self._stop_monitoring = threading.Event()
        
        logger.info(f"Consciousness device initialized: {device_type.value}")
    
    def connect(self, device_key: Optional[bytes] = None) -> bool:
        """Connect and initialize device"""
        try:
            # Establish connection
            if not self.protocol.connect():
                return False
            
            # Authenticate if key provided
            if device_key:
                if not self.protocol.authenticate(device_key):
                    self.protocol.disconnect()
                    return False
            
            # Get device status
            if not self._initialize_device():
                self.protocol.disconnect()
                return False
            
            self.state = DeviceState.ONLINE
            
            # Start monitoring
            self._start_monitoring()
            
            logger.info(f"Device {self.device_type.value} connected successfully")
            return True
            
        except Exception as e:
            logger.error(f"Device connection failed: {e}")
            self.state = DeviceState.ERROR
            return False
    
    def disconnect(self):
        """Safely disconnect device"""
        self._stop_monitoring.set()
        
        if self._monitoring_thread:
            self._monitoring_thread.join(timeout=5.0)
        
        self.protocol.disconnect()
        self.state = DeviceState.OFFLINE
        
        logger.info(f"Device {self.device_type.value} disconnected")
    
    def execute_consciousness_work(self, work_spec: Dict) -> Optional[Dict]:
        """Execute consciousness-specific work on device"""
        
        if self.state != DeviceState.ONLINE:
            logger.warning(f"Device not online: {self.state}")
            return None
        
        # Check safety limits
        if not self._check_safety_limits():
            return None
        
        start_time = time.time()
        
        try:
            if self.device_type == DeviceType.SDC_CHIP:
                result = self._execute_sdc_work(work_spec)
            elif self.device_type == DeviceType.MEMRISTOR_ARRAY:
                result = self._execute_memristor_work(work_spec)
            elif self.device_type == DeviceType.NEURAL_INTERFACE:
                result = self._execute_neural_work(work_spec)
            else:
                logger.error(f"Unsupported device type: {self.device_type}")
                return None
            
            # Record operation
            operation_time = time.time() - start_time
            self._record_operation(work_spec, operation_time, result is not None)
            
            return result
            
        except Exception as e:
            logger.error(f"Consciousness work failed: {e}")
            self.health.error_count += 1
            self._trigger_alert("OPERATION_FAILED", {"error": str(e)})
            return None
    
    def get_quantum_random(self, num_bytes: int = 32) -> Optional[bytes]:
        """Get quantum random numbers from device"""
        
        if num_bytes > 256:
            logger.error("Requested too many random bytes")
            return None
        
        try:
            data = struct.pack('<I', num_bytes)
            response = self.protocol.send_command(CommandType.QUANTUM_RANDOM, data)
            
            if response and len(response) >= num_bytes:
                return response[:num_bytes]
            else:
                logger.error("Failed to get quantum random data")
                return None
                
        except Exception as e:
            logger.error(f"Quantum random generation failed: {e}")
            return None
    
    def get_device_health(self) -> DeviceHealth:
        """Get current device health"""
        return self.health
    
    def add_alert_callback(self, callback: Callable):
        """Add callback for device alerts"""
        self.alert_callbacks.append(callback)
    
    def emergency_stop(self) -> bool:
        """Emergency stop all device operations"""
        try:
            response = self.protocol.send_command(CommandType.EMERGENCY_STOP)
            
            if response:
                self.state = DeviceState.EMERGENCY
                self._trigger_alert("EMERGENCY_STOP", {"timestamp": time.time()})
                logger.critical(f"Emergency stop executed for {self.device_type.value}")
                return True
            else:
                return False
                
        except Exception as e:
            logger.error(f"Emergency stop failed: {e}")
            return False
    
    # Private methods
    
    def _initialize_device(self) -> bool:
        """Initialize device and get capabilities"""
        try:
            # Get device status
            response = self.protocol.send_command(CommandType.GET_STATUS)
            if not response:
                return False
            
            # Parse status response
            if len(response) >= 16:
                status_data = struct.unpack('<4fI', response[:20])
                self.health.temperature_c = status_data[0]
                self.health.power_consumption_mw = status_data[1]
                self.health.battery_level_percent = status_data[2]
                self.health.uptime_seconds = status_data[3]
                device_status = status_data[4]
                
                # Check device status
                if device_status != 0:
                    logger.error(f"Device reports error status: {device_status}")
                    return False
            
            # Device-specific initialization
            if self.device_type == DeviceType.SDC_CHIP:
                return self._initialize_sdc()
            elif self.device_type == DeviceType.MEMRISTOR_ARRAY:
                return self._initialize_memristor()
            elif self.device_type == DeviceType.NEURAL_INTERFACE:
                return self._initialize_neural_interface()
            
            return True
            
        except Exception as e:
            logger.error(f"Device initialization failed: {e}")
            return False
    
    def _check_safety_limits(self) -> bool:
        """Check device safety limits"""
        
        # Temperature check
        if self.health.temperature_c > self.max_temperature:
            logger.error(f"Device overheating: {self.health.temperature_c}°C")
            self.state = DeviceState.THERMAL_THROTTLED
            return False
        
        # Power check
        if self.health.power_consumption_mw > self.max_power:
            logger.error(f"Power consumption too high: {self.health.power_consumption_mw}mW")
            return False
        
        # Battery check
        if self.health.battery_level_percent < 10.0:
            logger.warning("Low battery level")
            self.state = DeviceState.LOW_POWER
            return False
        
        return True
    
    def _execute_sdc_work(self, work_spec: Dict) -> Optional[Dict]:
        """Execute work on SDC chip"""
        try:
            # Prepare SDC work data
            work_type = work_spec.get("type", "consciousness_processing")
            intensity = work_spec.get("intensity", 0.5)
            duration_ms = work_spec.get("duration_ms", 100)
            
            # Pack work specification
            data = struct.pack('<If I', 
                hash(work_type) & 0xFFFFFFFF,  # Work type hash
                intensity,
                duration_ms
            )
            
            # Add any additional data
            if "parameters" in work_spec:
                param_data = json.dumps(work_spec["parameters"]).encode('utf-8')
                data += struct.pack('<H', len(param_data)) + param_data
            
            # Send to device
            response = self.protocol.send_command(CommandType.SDC_WORK, data)
            
            if response and len(response) >= 8:
                # Parse response
                result_code, energy_consumed = struct.unpack('<II', response[:8])
                
                return {
                    "success": result_code == 0,
                    "energy_consumed": energy_consumed,
                    "device_type": "sdc_chip",
                    "timestamp": time.time()
                }
            
            return None
            
        except Exception as e:
            logger.error(f"SDC work execution failed: {e}")
            return None
    
    def _execute_memristor_work(self, work_spec: Dict) -> Optional[Dict]:
        """Execute work on memristor array"""
        try:
            operation = work_spec.get("operation", "write")
            coordinates = work_spec.get("coordinates", [0, 0, 0])
            value = work_spec.get("value", 0.5)
            
            if operation == "write":
                data = struct.pack('<3Bf', *coordinates, value)
                response = self.protocol.send_command(CommandType.MEMRISTOR_WRITE, data)
            else:  # read
                data = struct.pack('<3B', *coordinates)
                response = self.protocol.send_command(CommandType.MEMRISTOR_READ, data)
            
            if response:
                if operation == "write":
                    success = struct.unpack('<B', response[:1])[0]
                    return {"success": bool(success), "operation": "write"}
                else:
                    value = struct.unpack('<f', response[:4])[0]
                    return {"success": True, "operation": "read", "value": value}
            
            return None
            
        except Exception as e:
            logger.error(f"Memristor operation failed: {e}")
            return None
    
    def _execute_neural_work(self, work_spec: Dict) -> Optional[Dict]:
        """Execute neural interface work"""
        try:
            # Neural interface would typically be read-only
            sample_count = work_spec.get("sample_count", 100)
            
            data = struct.pack('<I', sample_count)
            response = self.protocol.send_command(CommandType.GET_STATUS, data)
            
            if response:
                # Parse neural data (simplified)
                sample_data = np.frombuffer(response, dtype=np.float32)
                
                return {
                    "success": True,
                    "samples": sample_data.tolist(),
                    "sample_rate": self.capabilities.sample_rate_hz,
                    "channels": self.capabilities.eeg_channels
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Neural interface work failed: {e}")
            return None
    
    def _start_monitoring(self):
        """Start device monitoring thread"""
        self._stop_monitoring.clear()
        self._monitoring_thread = threading.Thread(
            target=self._monitoring_loop,
            daemon=True
        )
        self._monitoring_thread.start()
        logger.info("Device monitoring started")
    
    def _monitoring_loop(self):
        """Main monitoring loop"""
        last_update = time.time()
        
        while not self._stop_monitoring.wait(1.0):  # Check every second
            try:
                current_time = time.time()
                
                # Update health metrics
                if current_time - last_update >= 1.0:
                    self._update_health_metrics()
                    last_update = current_time
                
                # Check for alerts
                self._check_alert_conditions()
                
            except Exception as e:
                logger.error(f"Monitoring error: {e}")
    
    def _update_health_metrics(self):
        """Update device health metrics"""
        try:
            response = self.protocol.send_command(CommandType.GET_STATUS)
            
            if response and len(response) >= 16:
                status_data = struct.unpack('<4fI', response[:20])
                self.health.temperature_c = status_data[0]
                self.health.power_consumption_mw = status_data[1]
                self.health.battery_level_percent = status_data[2]
                self.health.uptime_seconds = status_data[3]
                
                # Update heartbeat
                self.health.last_heartbeat = time.time()
                
                # Calculate performance metrics
                if self.operation_history:
                    recent_ops = list(self.operation_history)[-10:]  # Last 10 operations
                    self.health.operations_per_second = len(recent_ops) / 10.0
                    self.health.average_response_time_ms = np.mean([op["duration"] for op in recent_ops]) * 1000
        
        except Exception as e:
            logger.error(f"Health update failed: {e}")
            self.health.error_count += 1
    
    def _check_alert_conditions(self):
        """Check for alert conditions"""
        
        # Temperature alerts
        if self.health.temperature_c > self.thermal_throttle_temp:
            self.health.thermal_warnings += 1
            self._trigger_alert("THERMAL_WARNING", {
                "temperature": self.health.temperature_c,
                "threshold": self.thermal_throttle_temp
            })
        
        # Power alerts
        if self.health.power_consumption_mw > self.max_power * 0.9:
            self.health.power_warnings += 1
            self._trigger_alert("POWER_WARNING", {
                "power": self.health.power_consumption_mw,
                "threshold": self.max_power * 0.9
            })
        
        # Battery alerts
        if self.health.battery_level_percent < 20.0:
            self._trigger_alert("LOW_BATTERY", {
                "battery_level": self.health.battery_level_percent
            })
        
        # Heartbeat check
        if time.time() - self.health.last_heartbeat > 10.0:
            self._trigger_alert("HEARTBEAT_LOST", {
                "last_heartbeat": self.health.last_heartbeat
            })
    
    def _record_operation(self, work_spec: Dict, duration: float, success: bool):
        """Record operation for performance tracking"""
        operation = {
            "timestamp": time.time(),
            "work_spec": work_spec,
            "duration": duration,
            "success": success
        }
        
        self.operation_history.append(operation)
    
    def _trigger_alert(self, alert_type: str, data: Dict):
        """Trigger device alert"""
        alert = {
            "device_type": self.device_type.value,
            "alert_type": alert_type,
            "timestamp": time.time(),
            "data": data
        }
        
        for callback in self.alert_callbacks:
            try:
                callback(alert)
            except Exception as e:
                logger.error(f"Alert callback error: {e}")
    
    def _initialize_sdc(self) -> bool:
        """Initialize SDC chip"""
        # SDC-specific initialization
        return True
    
    def _initialize_memristor(self) -> bool:
        """Initialize memristor array"""
        # Memristor-specific initialization
        return True
    
    def _initialize_neural_interface(self) -> bool:
        """Initialize neural interface"""
        # Neural interface-specific initialization
        return True

class ConsciousnessHardwareManager:
    """Manages multiple consciousness devices"""
    
    def __init__(self):
        self.devices: Dict[str, ConsciousnessDevice] = {}
        self.device_registry: Dict[DeviceType, List[str]] = {}
        self.active_devices: Set[str] = set()
        
        # Distributed work management
        self.work_queue = deque()
        self.work_distribution_strategy = "round_robin"
        
        # System health
        self.system_health_score = 1.0
        self.last_health_check = time.time()
        
        # Alert aggregation
        self.alert_callbacks: List[Callable] = []
        
        logger.info("Consciousness hardware manager initialized")
    
    def register_device(self, device_id: str, device: ConsciousnessDevice) -> bool:
        """Register a consciousness device"""
        try:
            self.devices[device_id] = device
            
            # Add to device registry
            device_type = device.device_type
            if device_type not in self.device_registry:
                self.device_registry[device_type] = []
            self.device_registry[device_type].append(device_id)
            
            # Add alert callback
            device.add_alert_callback(self._handle_device_alert)
            
            logger.info(f"Registered device: {device_id} ({device_type.value})")
            return True
            
        except Exception as e:
            logger.error(f"Device registration failed: {e}")
            return False
    
    def connect_all_devices(self, device_keys: Optional[Dict[str, bytes]] = None) -> Dict[str, bool]:
        """Connect all registered devices"""
        results = {}
        
        for device_id, device in self.devices.items():
            device_key = device_keys.get(device_id) if device_keys else None
            
            try:
                success = device.connect(device_key)
                results[device_id] = success
                
                if success:
                    self.active_devices.add(device_id)
                
            except Exception as e:
                logger.error(f"Failed to connect device {device_id}: {e}")
                results[device_id] = False
        
        active_count = sum(results.values())
        logger.info(f"Connected {active_count}/{len(self.devices)} devices")
        
        return results
    
    def execute_distributed_work(self, work_spec: Dict) -> List[Dict]:
        """Execute work across multiple devices"""
        
        if not self.active_devices:
            logger.error("No active devices for distributed work")
            return []
        
        # Select devices based on work requirements
        target_devices = self._select_devices_for_work(work_spec)
        
        if not target_devices:
            logger.error("No suitable devices found for work")
            return []
        
        # Execute work on selected devices
        results = []
        
        for device_id in target_devices:
            device = self.devices[device_id]
            
            try:
                result = device.execute_consciousness_work(work_spec)
                if result:
                    result["device_id"] = device_id
                    results.append(result)
                    
            except Exception as e:
                logger.error(f"Work execution failed on device {device_id}: {e}")
        
        return results
    
    def get_system_health(self) -> Dict:
        """Get overall system health"""
        
        device_health = {}
        total_health_score = 0.0
        active_device_count = 0
        
        for device_id, device in self.devices.items():
            if device_id in self.active_devices:
                health = device.get_device_health()
                device_health[device_id] = {
                    "temperature_c": health.temperature_c,
                    "power_consumption_mw": health.power_consumption_mw,
                    "battery_level_percent": health.battery_level_percent,
                    "error_count": health.error_count,
                    "state": device.state.value
                }
                
                # Calculate device health score
                device_score = self._calculate_device_health_score(health, device)
                device_health[device_id]["health_score"] = device_score
                
                total_health_score += device_score
                active_device_count += 1
        
        # Calculate system health score
        if active_device_count > 0:
            self.system_health_score = total_health_score / active_device_count
        else:
            self.system_health_score = 0.0
        
        return {
            "system_health_score": self.system_health_score,
            "active_devices": active_device_count,
            "total_devices": len(self.devices),
            "device_health": device_health,
            "device_registry": {k.value: v for k, v in self.device_registry.items()},
            "last_health_check": self.last_health_check
        }
    
    def emergency_stop_all(self) -> Dict[str, bool]:
        """Emergency stop all devices"""
        results = {}
        
        for device_id in self.active_devices:
            device = self.devices[device_id]
            
            try:
                success = device.emergency_stop()
                results[device_id] = success
                
            except Exception as e:
                logger.error(f"Emergency stop failed for device {device_id}: {e}")
                results[device_id] = False
        
        logger.critical("Emergency stop executed on all devices")
        return results
    
    def add_alert_callback(self, callback: Callable):
        """Add system-level alert callback"""
        self.alert_callbacks.append(callback)
    
    # Private methods
    
    def _select_devices_for_work(self, work_spec: Dict) -> List[str]:
        """Select appropriate devices for work specification"""
        
        required_device_type = work_spec.get("device_type")
        if required_device_type:
            # Work requires specific device type
            if isinstance(required_device_type, str):
                required_device_type = DeviceType(required_device_type)
            
            available_devices = [
                device_id for device_id in self.device_registry.get(required_device_type, [])
                if device_id in self.active_devices
            ]
        else:
            # Work can run on any device
            available_devices = list(self.active_devices)
        
        if not available_devices:
            return []
        
        # Apply distribution strategy
        if self.work_distribution_strategy == "round_robin":
            # Simple round-robin
            return available_devices[:1]  # For now, use one device
        elif self.work_distribution_strategy == "load_balanced":
            # Select device with lowest current load
            best_device = min(available_devices, 
                            key=lambda d: self.devices[d].health.power_consumption_mw)
            return [best_device]
        else:
            return available_devices[:1]
    
    def _calculate_device_health_score(self, health: DeviceHealth, device: ConsciousnessDevice) -> float:
        """Calculate health score for a device"""
        
        score = 1.0
        
        # Temperature impact
        temp_ratio = health.temperature_c / device.max_temperature
        score *= max(0, 1.0 - temp_ratio)
        
        # Power impact
        power_ratio = health.power_consumption_mw / device.max_power
        score *= max(0, 1.0 - power_ratio * 0.5)  # Power is less critical than temperature
        
        # Battery impact
        battery_factor = health.battery_level_percent / 100.0
        score *= max(0.1, battery_factor)  # Minimum 10% score for battery
        
        # Error rate impact
        if health.uptime_seconds > 0:
            error_rate = health.error_count / health.uptime_seconds
            score *= max(0, 1.0 - error_rate * 100)  # 1% error rate = 0 score
        
        return max(0.0, min(1.0, score))
    
    def _handle_device_alert(self, alert: Dict):
        """Handle device-level alert"""
        
        # Log alert
        logger.warning(f"Device alert: {alert}")
        
        # Check for system-level responses
        if alert["alert_type"] == "EMERGENCY_STOP":
            # One device emergency stop might trigger system-wide stop
            logger.critical("Device emergency stop detected - consider system shutdown")
        
        # Forward to system-level callbacks
        for callback in self.alert_callbacks:
            try:
                callback(alert)
            except Exception as e:
                logger.error(f"System alert callback error: {e}")

# Factory functions for device creation

def create_sdc_device(device_path: str, chip_id: int = 0) -> ConsciousnessDevice:
    """Create SDC chip device"""
    
    capabilities = HardwareCapabilities(
        device_type=DeviceType.SDC_CHIP,
        max_power_mw=5000.0,  # 5W max
        max_temperature_c=65.0,
        processing_cores=4,
        memory_size_mb=16.0,
        sdc_frequency_mhz=100.0,
        sdc_precision_bits=32
    )
    
    return ConsciousnessDevice(
        DeviceType.SDC_CHIP,
        device_path,
        capabilities
    )

def create_memristor_device(device_path: str) -> ConsciousnessDevice:
    """Create memristor array device"""
    
    capabilities = HardwareCapabilities(
        device_type=DeviceType.MEMRISTOR_ARRAY,
        max_power_mw=2000.0,  # 2W max
        max_temperature_c=70.0,
        processing_cores=1,
        memory_size_mb=8.0,
        memristor_dimensions=(8, 8, 8),
        memristor_states=256
    )
    
    return ConsciousnessDevice(
        DeviceType.MEMRISTOR_ARRAY,
        device_path,
        capabilities
    )

def create_neural_interface_device(device_path: str) -> ConsciousnessDevice:
    """Create neural interface device"""
    
    capabilities = HardwareCapabilities(
        device_type=DeviceType.NEURAL_INTERFACE,
        max_power_mw=500.0,   # 0.5W max
        max_temperature_c=45.0,
        processing_cores=1,
        memory_size_mb=2.0,
        eeg_channels=8,
        sample_rate_hz=1000.0
    )
    
    return ConsciousnessDevice(
        DeviceType.NEURAL_INTERFACE,
        device_path,
        capabilities
    )

# Usage example
if __name__ == "__main__":
    try:
        # Create hardware manager
        hw_manager = ConsciousnessHardwareManager()
        
        # Add alert callback
        def system_alert_handler(alert):
            print(f"🚨 System Alert: {alert}")
        
        hw_manager.add_alert_callback(system_alert_handler)
        
        # Create and register devices (would use real device paths in production)
        sdc_device = create_sdc_device("/dev/consciousness_sdc0")
        memristor_device = create_memristor_device("/dev/consciousness_mem0")
        neural_device = create_neural_interface_device("/dev/consciousness_eeg0")
        
        hw_manager.register_device("sdc_0", sdc_device)
        hw_manager.register_device("memristor_0", memristor_device)
        hw_manager.register_device("neural_0", neural_device)
        
        print("🔧 Hardware system initialized")
        print(f"Registered devices: {list(hw_manager.devices.keys())}")
        
        # In production, would attempt to connect
        # connection_results = hw_manager.connect_all_devices()
        # print(f"Connection results: {connection_results}")
        
        # Example work specification
        work_spec = {
            "type": "consciousness_processing",
            "device_type": "sdc_chip",
            "intensity": 0.8,
            "duration_ms": 500,
            "parameters": {
                "network": "executive",
                "energy_budget": 100.0
            }
        }
        
        print(f"Example work specification: {work_spec}")
        
        # Get system health
        health = hw_manager.get_system_health()
        print(f"System health score: {health['system_health_score']:.2f}")
        print(f"Active devices: {health['active_devices']}/{health['total_devices']}")
        
        print("✅ Hardware abstraction layer test completed")
        
    except Exception as e:
        print(f"❌ Hardware test failed: {e}")
        logger.exception("Hardware abstraction layer test failed")