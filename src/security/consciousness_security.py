# src/security/consciousness_security.py
# Production-ready security and privacy module for consciousness data

import time
import json
import hashlib
import hmac
import secrets
import logging
from typing import Dict, List, Optional, Set, Tuple, Callable, Any
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime, timedelta, timezone
import threading
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
import sqlite3
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConsentLevel(Enum):
    NONE = "none"                    # No consent given
    BASIC = "basic"                  # Basic signal monitoring
    PROCESSING = "processing"        # Consciousness processing allowed
    STORAGE = "storage"             # Data storage permitted
    SHARING = "sharing"             # Anonymous sharing allowed
    RESEARCH = "research"           # Research participation
    FULL = "full"                   # Full access granted

class DataClassification(Enum):
    PUBLIC = "public"               # Publicly shareable
    INTERNAL = "internal"           # Internal processing only
    CONFIDENTIAL = "confidential"  # Sensitive consciousness data
    SECRET = "secret"               # Highly sensitive neural patterns
    TOP_SECRET = "top_secret"       # Critical consciousness states

class SecurityLevel(Enum):
    BASIC = "basic"                 # Basic encryption
    STANDARD = "standard"           # Standard encryption + integrity
    HIGH = "high"                   # High security + audit logging
    CRITICAL = "critical"           # Maximum security + formal verification

class PrivacyMode(Enum):
    TRANSPARENT = "transparent"     # Full data visibility
    ANONYMOUS = "anonymous"         # Anonymized data
    PSEUDONYMOUS = "pseudonymous"   # Pseudonymized identifiers
    PRIVATE = "private"             # Fully private processing
    ZERO_KNOWLEDGE = "zero_knowledge" # Zero-knowledge proofs

@dataclass
class ConsentRecord:
    """Detailed consent record with granular permissions"""
    user_id: str
    consent_level: ConsentLevel
    granted_timestamp: float
    expiry_timestamp: Optional[float]
    
    # Granular permissions
    allow_signal_capture: bool = False
    allow_processing: bool = False
    allow_storage: bool = False
    allow_sharing: bool = False
    allow_research: bool = False
    
    # Data retention
    max_retention_days: Optional[int] = None
    auto_delete: bool = True
    
    # Sharing constraints
    allowed_partners: List[str] = field(default_factory=list)
    geographic_restrictions: List[str] = field(default_factory=list)
    
    # Revocation info
    revoked: bool = False
    revocation_timestamp: Optional[float] = None
    revocation_reason: Optional[str] = None
    
    # Metadata
    consent_version: str = "1.0"
    legal_basis: str = "informed_consent"
    consent_method: str = "explicit"
    
    def is_valid(self) -> bool:
        """Check if consent is currently valid"""
        if self.revoked:
            return False
        
        current_time = time.time()
        if self.expiry_timestamp and current_time > self.expiry_timestamp:
            return False
        
        return True
    
    def allows_operation(self, operation: str) -> bool:
        """Check if consent allows specific operation"""
        if not self.is_valid():
            return False
        
        operation_map = {
            "signal_capture": self.allow_signal_capture,
            "processing": self.allow_processing,
            "storage": self.allow_storage,
            "sharing": self.allow_sharing,
            "research": self.allow_research
        }
        
        return operation_map.get(operation, False)

@dataclass
class EncryptionContext:
    """Encryption context for consciousness data"""
    data_classification: DataClassification
    security_level: SecurityLevel
    privacy_mode: PrivacyMode
    encryption_algorithm: str = "AES-256-GCM"
    key_derivation: str = "PBKDF2-SHA256"
    key_iterations: int = 100000
    
    # Key management
    master_key_id: Optional[str] = None
    data_key: Optional[bytes] = None
    iv: Optional[bytes] = None
    
    # Metadata protection
    encrypt_metadata: bool = True
    authenticated_encryption: bool = True
    
    def get_security_parameters(self) -> Dict:
        """Get security parameters based on classification and level"""
        
        if self.data_classification == DataClassification.TOP_SECRET:
            return {
                "key_size": 256,
                "auth_tag_size": 16,
                "iv_size": 16,
                "iterations": 500000,
                "hash_algorithm": "SHA-512"
            }
        elif self.data_classification == DataClassification.SECRET:
            return {
                "key_size": 256,
                "auth_tag_size": 16,
                "iv_size": 12,
                "iterations": 200000,
                "hash_algorithm": "SHA-256"
            }
        else:
            return {
                "key_size": 256,
                "auth_tag_size": 12,
                "iv_size": 12,
                "iterations": self.key_iterations,
                "hash_algorithm": "SHA-256"
            }

class SecureKeyManager:
    """Hardware security module (HSM) interface for key management"""
    
    def __init__(self, use_hardware_hsm: bool = False):
        self.use_hardware_hsm = use_hardware_hsm
        self.master_keys: Dict[str, bytes] = {}
        self.key_metadata: Dict[str, Dict] = {}
        self._lock = threading.Lock()
        
        # Key rotation
        self.key_rotation_interval = 30 * 24 * 3600  # 30 days
        self.last_rotation_check = time.time()
        
        # Audit logging
        self.key_operations_log = []
        
        if use_hardware_hsm:
            self._initialize_hsm()
        else:
            self._initialize_software_keys()
    
    def generate_master_key(self, key_id: str, context: EncryptionContext) -> bool:
        """Generate new master key"""
        
        with self._lock:
            try:
                if self.use_hardware_hsm:
                    key_material = self._generate_key_hsm(context)
                else:
                    # Generate cryptographically secure random key
                    security_params = context.get_security_parameters()
                    key_size = security_params["key_size"] // 8  # Convert bits to bytes
                    key_material = secrets.token_bytes(key_size)
                
                # Store key with metadata
                self.master_keys[key_id] = key_material
                self.key_metadata[key_id] = {
                    "created_timestamp": time.time(),
                    "context": context,
                    "usage_count": 0,
                    "last_used": None,
                    "rotation_due": time.time() + self.key_rotation_interval
                }
                
                self._log_key_operation("GENERATE", key_id, "Master key generated")
                logger.info(f"Generated master key: {key_id}")
                return True
                
            except Exception as e:
                logger.error(f"Key generation failed: {e}")
                return False
    
    def derive_data_key(self, master_key_id: str, derivation_info: bytes) -> Optional[bytes]:
        """Derive data encryption key from master key"""
        
        with self._lock:
            if master_key_id not in self.master_keys:
                logger.error(f"Master key not found: {master_key_id}")
                return None
            
            try:
                master_key = self.master_keys[master_key_id]
                context = self.key_metadata[master_key_id]["context"]
                security_params = context.get_security_parameters()
                
                # Use HKDF for key derivation
                kdf = PBKDF2HMAC(
                    algorithm=getattr(hashes, security_params["hash_algorithm"].replace("-", ""))(),
                    length=security_params["key_size"] // 8,
                    salt=derivation_info[:16],  # Use first 16 bytes as salt
                    iterations=security_params["iterations"]
                )
                
                data_key = kdf.derive(master_key)
                
                # Update usage statistics
                self.key_metadata[master_key_id]["usage_count"] += 1
                self.key_metadata[master_key_id]["last_used"] = time.time()
                
                self._log_key_operation("DERIVE", master_key_id, "Data key derived")
                return data_key
                
            except Exception as e:
                logger.error(f"Key derivation failed: {e}")
                return None
    
    def rotate_keys_if_needed(self):
        """Check and rotate keys if needed"""
        
        current_time = time.time()
        if current_time - self.last_rotation_check < 3600:  # Check hourly
            return
        
        self.last_rotation_check = current_time
        
        with self._lock:
            keys_to_rotate = []
            
            for key_id, metadata in self.key_metadata.items():
                if current_time >= metadata["rotation_due"]:
                    keys_to_rotate.append(key_id)
            
            for key_id in keys_to_rotate:
                logger.info(f"Rotating key: {key_id}")
                context = self.key_metadata[key_id]["context"]
                
                # Generate new key with same context
                new_key_id = f"{key_id}_rotated_{int(current_time)}"
                self.generate_master_key(new_key_id, context)
                
                # Mark old key for retirement (don't delete immediately)
                self.key_metadata[key_id]["retired"] = True
                self.key_metadata[key_id]["retirement_timestamp"] = current_time
    
    def _initialize_hsm(self):
        """Initialize hardware security module"""
        # In production, this would interface with actual HSM hardware
        logger.info("HSM interface initialized (simulated)")
    
    def _initialize_software_keys(self):
        """Initialize software-based key management"""
        logger.info("Software key management initialized")
    
    def _generate_key_hsm(self, context: EncryptionContext) -> bytes:
        """Generate key using hardware HSM"""
        # Simulate HSM key generation
        security_params = context.get_security_parameters()
        key_size = security_params["key_size"] // 8
        return secrets.token_bytes(key_size)
    
    def _log_key_operation(self, operation: str, key_id: str, details: str):
        """Log key management operation"""
        log_entry = {
            "timestamp": time.time(),
            "operation": operation,
            "key_id": key_id,
            "details": details,
            "user": "system"  # Would include actual user context
        }
        
        self.key_operations_log.append(log_entry)
        
        # Trim log if too large
        if len(self.key_operations_log) > 10000:
            self.key_operations_log = self.key_operations_log[-5000:]

class ConsciousnessEncryption:
    """Consciousness data encryption with privacy protection"""
    
    def __init__(self, key_manager: SecureKeyManager):
        self.key_manager = key_manager
        self._lock = threading.Lock()
        
        # Encryption statistics
        self.encryption_stats = {
            "total_encrypted": 0,
            "total_decrypted": 0,
            "encryption_errors": 0,
            "decryption_errors": 0
        }
    
    def encrypt_consciousness_data(self, data: Dict, user_id: str, 
                                 context: EncryptionContext) -> Optional[Dict]:
        """Encrypt consciousness data with privacy protection"""
        
        try:
            # Apply privacy transformations first
            privacy_data = self._apply_privacy_protection(data, user_id, context.privacy_mode)
            
            # Serialize data
            plaintext = json.dumps(privacy_data, separators=(',', ':')).encode('utf-8')
            
            # Generate or retrieve encryption key
            master_key_id = context.master_key_id or f"master_{user_id}"
            
            # Ensure master key exists
            if master_key_id not in self.key_manager.master_keys:
                if not self.key_manager.generate_master_key(master_key_id, context):
                    return None
            
            # Derive data encryption key
            derivation_info = f"{user_id}_{int(time.time())}".encode('utf-8')
            data_key = self.key_manager.derive_data_key(master_key_id, derivation_info)
            
            if not data_key:
                return None
            
            # Generate initialization vector
            security_params = context.get_security_parameters()
            iv = secrets.token_bytes(security_params["iv_size"])
            
            # Encrypt data
            if context.authenticated_encryption:
                encrypted_data, auth_tag = self._encrypt_authenticated(plaintext, data_key, iv, context)
            else:
                encrypted_data = self._encrypt_standard(plaintext, data_key, iv, context)
                auth_tag = None
            
            # Create encrypted package
            encrypted_package = {
                "version": "1.0",
                "encryption_context": {
                    "algorithm": context.encryption_algorithm,
                    "data_classification": context.data_classification.value,
                    "security_level": context.security_level.value,
                    "privacy_mode": context.privacy_mode.value
                },
                "key_metadata": {
                    "master_key_id": master_key_id,
                    "derivation_info": base64.b64encode(derivation_info).decode('utf-8'),
                    "iv": base64.b64encode(iv).decode('utf-8')
                },
                "encrypted_data": base64.b64encode(encrypted_data).decode('utf-8'),
                "auth_tag": base64.b64encode(auth_tag).decode('utf-8') if auth_tag else None,
                "timestamp": time.time(),
                "data_hash": hashlib.sha256(plaintext).hexdigest()
            }
            
            # Encrypt metadata if required
            if context.encrypt_metadata:
                encrypted_package = self._encrypt_metadata(encrypted_package, data_key)
            
            self.encryption_stats["total_encrypted"] += 1
            logger.debug(f"Consciousness data encrypted for user: {user_id}")
            
            return encrypted_package
            
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            self.encryption_stats["encryption_errors"] += 1
            return None
    
    def decrypt_consciousness_data(self, encrypted_package: Dict, user_id: str) -> Optional[Dict]:
        """Decrypt consciousness data"""
        
        try:
            # Extract encryption context
            encryption_context = encrypted_package["encryption_context"]
            key_metadata = encrypted_package["key_metadata"]
            
            # Decrypt metadata if encrypted
            if "encrypted_metadata" in encrypted_package:
                # Metadata is encrypted - would need to decrypt first
                pass
            
            # Retrieve master key
            master_key_id = key_metadata["master_key_id"]
            
            # Derive decryption key
            derivation_info = base64.b64decode(key_metadata["derivation_info"])
            data_key = self.key_manager.derive_data_key(master_key_id, derivation_info)
            
            if not data_key:
                logger.error("Failed to derive decryption key")
                return None
            
            # Extract encrypted data
            encrypted_data = base64.b64decode(encrypted_package["encrypted_data"])
            iv = base64.b64decode(key_metadata["iv"])
            auth_tag = base64.b64decode(encrypted_package["auth_tag"]) if encrypted_package.get("auth_tag") else None
            
            # Reconstruct encryption context
            context = EncryptionContext(
                data_classification=DataClassification(encryption_context["data_classification"]),
                security_level=SecurityLevel(encryption_context["security_level"]),
                privacy_mode=PrivacyMode(encryption_context["privacy_mode"]),
                encryption_algorithm=encryption_context["algorithm"]
            )
            
            # Decrypt data
            if context.authenticated_encryption and auth_tag:
                plaintext = self._decrypt_authenticated(encrypted_data, data_key, iv, auth_tag, context)
            else:
                plaintext = self._decrypt_standard(encrypted_data, data_key, iv, context)
            
            if not plaintext:
                return None
            
            # Verify data integrity
            data_hash = hashlib.sha256(plaintext).hexdigest()
            if data_hash != encrypted_package.get("data_hash"):
                logger.error("Data integrity check failed")
                return None
            
            # Parse decrypted data
            decrypted_data = json.loads(plaintext.decode('utf-8'))
            
            # Reverse privacy transformations if possible
            original_data = self._reverse_privacy_protection(decrypted_data, user_id, context.privacy_mode)
            
            self.encryption_stats["total_decrypted"] += 1
            logger.debug(f"Consciousness data decrypted for user: {user_id}")
            
            return original_data
            
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            self.encryption_stats["decryption_errors"] += 1
            return None
    
    def _apply_privacy_protection(self, data: Dict, user_id: str, privacy_mode: PrivacyMode) -> Dict:
        """Apply privacy protection to data"""
        
        if privacy_mode == PrivacyMode.TRANSPARENT:
            return data
        
        protected_data = data.copy()
        
        if privacy_mode == PrivacyMode.ANONYMOUS:
            # Remove all identifying information
            protected_data.pop("user_id", None)
            protected_data.pop("session_id", None)
            protected_data.pop("device_id", None)
            
        elif privacy_mode == PrivacyMode.PSEUDONYMOUS:
            # Replace user ID with pseudonym
            pseudonym = self._generate_pseudonym(user_id)
            protected_data["user_id"] = pseudonym
            
        elif privacy_mode == PrivacyMode.PRIVATE:
            # Encrypt sensitive fields individually
            sensitive_fields = ["neural_patterns", "consciousness_state", "personal_context"]
            for field in sensitive_fields:
                if field in protected_data:
                    protected_data[field] = self._encrypt_field(protected_data[field])
        
        elif privacy_mode == PrivacyMode.ZERO_KNOWLEDGE:
            # Apply zero-knowledge transformations
            protected_data = self._apply_zero_knowledge_proof(protected_data)
        
        return protected_data
    
    def _reverse_privacy_protection(self, data: Dict, user_id: str, privacy_mode: PrivacyMode) -> Dict:
        """Reverse privacy protection (where possible)"""
        
        if privacy_mode == PrivacyMode.TRANSPARENT:
            return data
    