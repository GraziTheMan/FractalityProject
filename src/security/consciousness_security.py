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
        
        # Most privacy transformations are one-way
        # Only pseudonymous mode can be partially reversed with proper authorization
        
        if privacy_mode == PrivacyMode.PSEUDONYMOUS:
            # Would need secure pseudonym reversal database
            pass
        
        return data
    
    def _encrypt_authenticated(self, plaintext: bytes, key: bytes, iv: bytes, 
                             context: EncryptionContext) -> Tuple[bytes, bytes]:
        """Encrypt with authenticated encryption (AES-GCM)"""
        
        cipher = Cipher(algorithms.AES(key), modes.GCM(iv))
        encryptor = cipher.encryptor()
        
        ciphertext = encryptor.update(plaintext) + encryptor.finalize()
        auth_tag = encryptor.tag
        
        return ciphertext, auth_tag
    
    def _decrypt_authenticated(self, ciphertext: bytes, key: bytes, iv: bytes, 
                             auth_tag: bytes, context: EncryptionContext) -> Optional[bytes]:
        """Decrypt with authenticated encryption verification"""
        
        try:
            cipher = Cipher(algorithms.AES(key), modes.GCM(iv, auth_tag))
            decryptor = cipher.decryptor()
            
            plaintext = decryptor.update(ciphertext) + decryptor.finalize()
            return plaintext
            
        except Exception as e:
            logger.error(f"Authenticated decryption failed: {e}")
            return None
    
    def _encrypt_standard(self, plaintext: bytes, key: bytes, iv: bytes, 
                         context: EncryptionContext) -> bytes:
        """Standard encryption (AES-CBC)"""
        
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
        encryptor = cipher.encryptor()
        
        # Add PKCS7 padding
        padded_plaintext = self._add_padding(plaintext)
        
        ciphertext = encryptor.update(padded_plaintext) + encryptor.finalize()
        return ciphertext
    
    def _decrypt_standard(self, ciphertext: bytes, key: bytes, iv: bytes, 
                         context: EncryptionContext) -> Optional[bytes]:
        """Standard decryption (AES-CBC)"""
        
        try:
            cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
            decryptor = cipher.decryptor()
            
            padded_plaintext = decryptor.update(ciphertext) + decryptor.finalize()
            plaintext = self._remove_padding(padded_plaintext)
            
            return plaintext
            
        except Exception as e:
            logger.error(f"Standard decryption failed: {e}")
            return None
    
    def _add_padding(self, data: bytes) -> bytes:
        """Add PKCS7 padding"""
        padding_length = 16 - (len(data) % 16)
        padding = bytes([padding_length] * padding_length)
        return data + padding
    
    def _remove_padding(self, data: bytes) -> bytes:
        """Remove PKCS7 padding"""
        padding_length = data[-1]
        return data[:-padding_length]
    
    def _generate_pseudonym(self, user_id: str) -> str:
        """Generate pseudonym for user ID"""
        # Use HMAC with secret key for consistent pseudonyms
        secret = b"pseudonym_secret_key"  # Would be securely managed
        pseudonym_hash = hmac.new(secret, user_id.encode('utf-8'), hashlib.sha256).hexdigest()
        return f"pseudo_{pseudonym_hash[:16]}"
    
    def _encrypt_field(self, field_data: Any) -> str:
        """Encrypt individual field"""
        # Simplified field encryption
        field_str = json.dumps(field_data)
        field_hash = hashlib.sha256(field_str.encode('utf-8')).hexdigest()
        return f"encrypted_{field_hash[:16]}"
    
    def _apply_zero_knowledge_proof(self, data: Dict) -> Dict:
        """Apply zero-knowledge proof transformations"""
        # Simplified zero-knowledge proof
        # In production, this would use proper ZK-SNARK or similar
        
        zk_data = {
            "proof_type": "zk_consciousness",
            "commitment": hashlib.sha256(json.dumps(data).encode('utf-8')).hexdigest(),
            "proof_timestamp": time.time(),
            "verifiable_properties": {
                "consciousness_level_above_threshold": True,
                "valid_neural_patterns": True,
                "temporal_consistency": True
            }
        }
        
        return zk_data

class ConsentManager:
    """Manages user consent for consciousness data processing"""
    
    def __init__(self, database_path: str = "consent.db"):
        self.database_path = database_path
        self.consent_cache: Dict[str, ConsentRecord] = {}
        self._lock = threading.Lock()
        
        # Initialize database
        self._initialize_database()
        
        # Consent monitoring
        self.consent_violations = []
        self.audit_log = []
        
        logger.info("Consent manager initialized")
    
    def request_consent(self, user_id: str, requested_level: ConsentLevel, 
                       duration_days: Optional[int] = None, 
                       additional_permissions: Optional[Dict] = None) -> bool:
        """Request user consent for consciousness data processing"""
        
        try:
            # Check if user already has valid consent
            existing_consent = self.get_user_consent(user_id)
            
            if existing_consent and existing_consent.is_valid():
                # Check if existing consent covers requested level
                if self._consent_level_covers(existing_consent.consent_level, requested_level):
                    logger.info(f"User {user_id} already has sufficient consent")
                    return True
            
            # Create new consent request
            consent_request = {
                "user_id": user_id,
                "requested_level": requested_level.value,
                "duration_days": duration_days,
                "additional_permissions": additional_permissions or {},
                "request_timestamp": time.time(),
                "request_id": secrets.token_hex(16)
            }
            
            # In production, this would present UI for user consent
            # For now, simulate automatic consent for testing
            logger.info(f"Consent requested for user {user_id}: {requested_level.value}")
            
            # Simulate user granting consent
            granted_consent = self._simulate_user_consent_response(consent_request)
            
            if granted_consent:
                return self.record_consent(user_id, granted_consent)
            else:
                self._log_consent_denial(user_id, requested_level)
                return False
                
        except Exception as e:
            logger.error(f"Consent request failed: {e}")
            return False
    
    def record_consent(self, user_id: str, consent_data: Dict) -> bool:
        """Record user consent in database"""
        
        with self._lock:
            try:
                # Create consent record
                expiry_timestamp = None
                if consent_data.get("duration_days"):
                    expiry_timestamp = time.time() + (consent_data["duration_days"] * 24 * 3600)
                
                consent_record = ConsentRecord(
                    user_id=user_id,
                    consent_level=ConsentLevel(consent_data["consent_level"]),
                    granted_timestamp=time.time(),
                    expiry_timestamp=expiry_timestamp,
                    allow_signal_capture=consent_data.get("allow_signal_capture", False),
                    allow_processing=consent_data.get("allow_processing", False),
                    allow_storage=consent_data.get("allow_storage", False),
                    allow_sharing=consent_data.get("allow_sharing", False),
                    allow_research=consent_data.get("allow_research", False),
                    max_retention_days=consent_data.get("max_retention_days"),
                    auto_delete=consent_data.get("auto_delete", True),
                    allowed_partners=consent_data.get("allowed_partners", []),
                    geographic_restrictions=consent_data.get("geographic_restrictions", []),
                    consent_method=consent_data.get("consent_method", "explicit")
                )
                
                # Store in database
                self._store_consent_in_db(consent_record)
                
                # Update cache
                self.consent_cache[user_id] = consent_record
                
                # Log consent grant
                self._log_consent_action("GRANTED", user_id, consent_record.consent_level)
                
                logger.info(f"Consent recorded for user {user_id}: {consent_record.consent_level.value}")
                return True
                
            except Exception as e:
                logger.error(f"Failed to record consent: {e}")
                return False
    
    def revoke_consent(self, user_id: str, reason: str = "user_request") -> bool:
        """Revoke user consent"""
        
        with self._lock:
            try:
                consent_record = self.get_user_consent(user_id)
                
                if not consent_record:
                    logger.warning(f"No consent found for user {user_id}")
                    return False
                
                # Mark as revoked
                consent_record.revoked = True
                consent_record.revocation_timestamp = time.time()
                consent_record.revocation_reason = reason
                
                # Update database
                self._update_consent_in_db(consent_record)
                
                # Update cache
                self.consent_cache[user_id] = consent_record
                
                # Log revocation
                self._log_consent_action("REVOKED", user_id, consent_record.consent_level, reason)
                
                logger.info(f"Consent revoked for user {user_id}: {reason}")
                return True
                
            except Exception as e:
                logger.error(f"Failed to revoke consent: {e}")
                return False
    
    def check_consent_for_operation(self, user_id: str, operation: str) -> bool:
        """Check if user has given consent for specific operation"""
        
        consent_record = self.get_user_consent(user_id)
        
        if not consent_record or not consent_record.is_valid():
            self._log_consent_violation(user_id, operation, "No valid consent")
            return False
        
        if not consent_record.allows_operation(operation):
            self._log_consent_violation(user_id, operation, "Operation not permitted by consent")
            return False
        
        return True
    
    def get_user_consent(self, user_id: str) -> Optional[ConsentRecord]:
        """Get current consent record for user"""
        
        # Check cache first
        if user_id in self.consent_cache:
            return self.consent_cache[user_id]
        
        # Load from database
        consent_record = self._load_consent_from_db(user_id)
        
        if consent_record:
            self.consent_cache[user_id] = consent_record
        
        return consent_record
    
    def get_consent_audit_log(self, user_id: Optional[str] = None, 
                            days: int = 30) -> List[Dict]:
        """Get consent audit log"""
        
        cutoff_time = time.time() - (days * 24 * 3600)
        
        filtered_log = [
            entry for entry in self.audit_log
            if entry["timestamp"] >= cutoff_time and
            (user_id is None or entry.get("user_id") == user_id)
        ]
        
        return filtered_log
    
    def cleanup_expired_consents(self):
        """Clean up expired consent records"""
        
        current_time = time.time()
        expired_users = []
        
        for user_id, consent_record in self.consent_cache.items():
            if (consent_record.expiry_timestamp and 
                current_time > consent_record.expiry_timestamp):
                expired_users.append(user_id)
        
        for user_id in expired_users:
            logger.info(f"Consent expired for user: {user_id}")
            self._log_consent_action("EXPIRED", user_id, self.consent_cache[user_id].consent_level)
            del self.consent_cache[user_id]
    
    # Private methods
    
    def _initialize_database(self):
        """Initialize consent database"""
        
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS consent_records (
                    user_id TEXT PRIMARY KEY,
                    consent_level TEXT NOT NULL,
                    granted_timestamp REAL NOT NULL,
                    expiry_timestamp REAL,
                    allow_signal_capture BOOLEAN,
                    allow_processing BOOLEAN,
                    allow_storage BOOLEAN,
                    allow_sharing BOOLEAN,
                    allow_research BOOLEAN,
                    max_retention_days INTEGER,
                    auto_delete BOOLEAN,
                    allowed_partners TEXT,
                    geographic_restrictions TEXT,
                    revoked BOOLEAN DEFAULT FALSE,
                    revocation_timestamp REAL,
                    revocation_reason TEXT,
                    consent_version TEXT,
                    legal_basis TEXT,
                    consent_method TEXT
                )
            ''')
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS consent_audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL NOT NULL,
                    action TEXT NOT NULL,
                    user_id TEXT,
                    consent_level TEXT,
                    details TEXT
                )
            ''')
            
            conn.commit()
            conn.close()
            
            logger.info("Consent database initialized")
            
        except Exception as e:
            logger.error(f"Database initialization failed: {e}")
    
    def _store_consent_in_db(self, consent_record: ConsentRecord):
        """Store consent record in database"""
        
        conn = sqlite3.connect(self.database_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO consent_records (
                user_id, consent_level, granted_timestamp, expiry_timestamp,
                allow_signal_capture, allow_processing, allow_storage,
                allow_sharing, allow_research, max_retention_days, auto_delete,
                allowed_partners, geographic_restrictions, revoked,
                revocation_timestamp, revocation_reason, consent_version,
                legal_basis, consent_method
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            consent_record.user_id,
            consent_record.consent_level.value,
            consent_record.granted_timestamp,
            consent_record.expiry_timestamp,
            consent_record.allow_signal_capture,
            consent_record.allow_processing,
            consent_record.allow_storage,
            consent_record.allow_sharing,
            consent_record.allow_research,
            consent_record.max_retention_days,
            consent_record.auto_delete,
            json.dumps(consent_record.allowed_partners),
            json.dumps(consent_record.geographic_restrictions),
            consent_record.revoked,
            consent_record.revocation_timestamp,
            consent_record.revocation_reason,
            consent_record.consent_version,
            consent_record.legal_basis,
            consent_record.consent_method
        ))
        
        conn.commit()
        conn.close()
    
    def _load_consent_from_db(self, user_id: str) -> Optional[ConsentRecord]:
        """Load consent record from database"""
        
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            cursor.execute(
                'SELECT * FROM consent_records WHERE user_id = ?',
                (user_id,)
            )
            
            row = cursor.fetchone()
            conn.close()
            
            if not row:
                return None
            
            # Reconstruct consent record
            consent_record = ConsentRecord(
                user_id=row[0],
                consent_level=ConsentLevel(row[1]),
                granted_timestamp=row[2],
                expiry_timestamp=row[3],
                allow_signal_capture=bool(row[4]),
                allow_processing=bool(row[5]),
                allow_storage=bool(row[6]),
                allow_sharing=bool(row[7]),
                allow_research=bool(row[8]),
                max_retention_days=row[9],
                auto_delete=bool(row[10]),
                allowed_partners=json.loads(row[11]) if row[11] else [],
                geographic_restrictions=json.loads(row[12]) if row[12] else [],
                revoked=bool(row[13]),
                revocation_timestamp=row[14],
                revocation_reason=row[15],
                consent_version=row[16] or "1.0",
                legal_basis=row[17] or "informed_consent",
                consent_method=row[18] or "explicit"
            )
            
            return consent_record
            
        except Exception as e:
            logger.error(f"Failed to load consent from database: {e}")
            return None
    
    def _update_consent_in_db(self, consent_record: ConsentRecord):
        """Update consent record in database"""
        self._store_consent_in_db(consent_record)  # Uses INSERT OR REPLACE
    
    def _consent_level_covers(self, existing_level: ConsentLevel, 
                            requested_level: ConsentLevel) -> bool:
        """Check if existing consent level covers requested level"""
        
        level_hierarchy = {
            ConsentLevel.NONE: 0,
            ConsentLevel.BASIC: 1,
            ConsentLevel.PROCESSING: 2,
            ConsentLevel.STORAGE: 3,
            ConsentLevel.SHARING: 4,
            ConsentLevel.RESEARCH: 5,
            ConsentLevel.FULL: 6
        }
        
        return level_hierarchy[existing_level] >= level_hierarchy[requested_level]
    
    def _simulate_user_consent_response(self, consent_request: Dict) -> Optional[Dict]:
        """Simulate user consent response (for testing)"""
        
        # In production, this would be replaced with actual user interface
        requested_level = ConsentLevel(consent_request["requested_level"])
        
        # Simulate user granting consent for testing
        if requested_level in [ConsentLevel.BASIC, ConsentLevel.PROCESSING]:
            return {
                "consent_level": requested_level.value,
                "allow_signal_capture": True,
                "allow_processing": True,
                "allow_storage": requested_level != ConsentLevel.BASIC,
                "allow_sharing": False,
                "allow_research": False,
                "duration_days": consent_request.get("duration_days", 30),
                "consent_method": "simulated_explicit"
            }
        
        return None  # Simulate denial for higher levels
    
    def _log_consent_action(self, action: str, user_id: str, 
                          consent_level: ConsentLevel, details: str = ""):
        """Log consent action to audit trail"""
        
        log_entry = {
            "timestamp": time.time(),
            "action": action,
            "user_id": user_id,
            "consent_level": consent_level.value,
            "details": details
        }
        
        self.audit_log.append(log_entry)
        
        # Store in database
        try:
            conn = sqlite3.connect(self.database_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                INSERT INTO consent_audit_log (timestamp, action, user_id, consent_level, details)
                VALUES (?, ?, ?, ?, ?)
            ''', (
                log_entry["timestamp"],
                log_entry["action"],
                log_entry["user_id"],
                log_entry["consent_level"],
                log_entry["details"]
            ))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"Failed to log consent action: {e}")
    
    def _log_consent_denial(self, user_id: str, requested_level: ConsentLevel):
        """Log consent denial"""
        self._log_consent_action("DENIED", user_id, requested_level, "User denied consent")
    
    def _log_consent_violation(self, user_id: str, operation: str, reason: str):
        """Log consent violation"""
        
        violation = {
            "timestamp": time.time(),
            "user_id": user_id,
            "operation": operation,
            "reason": reason
        }
        
        self.consent_violations.append(violation)
        logger.warning(f"Consent violation: {violation}")

# Integrated security system
class ConsciousnessSecuritySystem:
    """Integrated security system for consciousness data"""
    
    def __init__(self, use_hardware_hsm: bool = False):
        # Initialize components
        self.key_manager = SecureKeyManager(use_hardware_hsm)
        self.encryption = ConsciousnessEncryption(self.key_manager)
        self.consent_manager = ConsentManager()
        
        # Security policies
        self.default_classification = DataClassification.CONFIDENTIAL
        self.default_security_level = SecurityLevel.STANDARD
        self.default_privacy_mode = PrivacyMode.PRIVATE
        
        # Monitoring
        self.security_events = []
        self.threat_detection = True
        
        logger.info("Consciousness security system initialized")
    
    def secure_consciousness_data(self, data: Dict, user_id: str, 
                                operation: str = "processing") -> Optional[Dict]:
        """Secure consciousness data with consent and encryption"""
        
        try:
            # Check consent
            if not self.consent_manager.check_consent_for_operation(user_id, operation):
                logger.warning(f"Consent check failed for user {user_id}, operation {operation}")
                return None
            
            # Determine security context based on data sensitivity
            context = self._determine_security_context(data)
            
            # Encrypt data
            secured_data = self.encryption.encrypt_consciousness_data(data, user_id, context)
            
            if secured_data:
                self._log_security_event("DATA_SECURED", user_id, {"operation": operation})
                logger.debug(f"Consciousness data secured for user: {user_id}")
            
            return secured_data
            
        except Exception as e:
            logger.error(f"Data security operation failed: {e}")
            self._log_security_event("SECURITY_ERROR", user_id, {"error": str(e)})
            return None
    
    def unsecure_consciousness_data(self, secured_data: Dict, user_id: str) -> Optional[Dict]:
        """Unsecure (decrypt) consciousness data"""
        
        try:
            # Verify user authorization
            if not self._verify_user_authorization(user_id, secured_data):
                return None
            
            # Decrypt data
            data = self.encryption.decrypt_consciousness_data(secured_data, user_id)
            
            if data:
                self._log_security_event("DATA_UNSECURED", user_id, {})
                logger.debug(f"Consciousness data unsecured for user: {user_id}")
            
            return data
            
        except Exception as e:
            logger.error(f"Data unsecurity operation failed: {e}")
            self._log_security_event("UNSECURITY_ERROR", user_id, {"error": str(e)})
            return None
    
    def get_security_report(self) -> Dict:
        """Get comprehensive security report"""
        
        return {
            "encryption_stats": self.encryption.encryption_stats,
            "consent_summary": {
                "total_users": len(self.consent_manager.consent_cache),
                "recent_violations": len([
                    v for v in self.consent_manager.consent_violations
                    if time.time() - v["timestamp"] < 86400  # Last 24 hours
                ])
            },
            "key_management": {
                "total_keys": len(self.key_manager.master_keys),
                "key_operations": len(self.key_manager.key_operations_log)
            },
            "security_events": len(self.security_events),
            "threat_detection_enabled": self.threat_detection
        }
    
    def _determine_security_context(self, data: Dict) -> EncryptionContext:
        """Determine appropriate security context for data"""
        
        # Analyze data to determine classification
        classification = self.default_classification
        
        # Check for highly sensitive patterns
        if any(key in data for key in ["neural_patterns", "quantum_states", "consciousness_metrics"]):
            classification = DataClassification.SECRET
        
        # Check for research or public data
        if data.get("data_type") == "research" or data.get("anonymized"):
            classification = DataClassification.INTERNAL
        
        return EncryptionContext(
            data_classification=classification,
            security_level=self.default_security_level,
            privacy_mode=self.default_privacy_mode
        )
    
    def _verify_user_authorization(self, user_id: str, secured_data: Dict) -> bool:
        """Verify user is authorized to decrypt data"""
        
        # Check if user has valid consent
        consent = self.consent_manager.get_user_consent(user_id)
        if not consent or not consent.is_valid():
            return False
        
        # Additional authorization checks could be added here
        return True
    
    def _log_security_event(self, event_type: str, user_id: str, details: Dict):
        """Log security event"""
        
        event = {
            "timestamp": time.time(),
            "event_type": event_type,
            "user_id": user_id,
            "details": details
        }
        
        self.security_events.append(event)
        
        # Trim events if too many
        if len(self.security_events) > 10000:
            self.security_events = self.security_events[-5000:]

# Usage example
if __name__ == "__main__":
    try:
        # Create security system
        security_system = ConsciousnessSecuritySystem(use_hardware_hsm=False)
        
        print("🔒 Consciousness Security System Test")
        print("=" * 50)
        
        # Test user ID
        user_id = "test_user_001"
        
        # Request consent
        consent_granted = security_system.consent_manager.request_consent(
            user_id, 
            ConsentLevel.PROCESSING,
            duration_days=30
        )
        
        print(f"Consent granted: {consent_granted}")
        
        # Test data
        consciousness_data = {
            "user_id": user_id,
            "signal_type": "gamma_sync",
            "intensity": 0.8,
            "neural_patterns": [0.1, 0.2, 0.3, 0.4],
            "consciousness_metrics": {
                "level": 0.75,
                "coherence": 0.9
            },
            "timestamp": time.time()
        }
        
        # Secure the data
        secured_data = security_system.secure_consciousness_data(
            consciousness_data, 
            user_id, 
            "processing"
        )
        
        if secured_data:
            print("✅ Data successfully secured")
            print(f"Encryption algorithm: {secured_data['encryption_context']['algorithm']}")
            print(f"Security level: {secured_data['encryption_context']['security_level']}")
            
            # Unsecure the data
            recovered_data = security_system.unsecure_consciousness_data(secured_data, user_id)
            
            if recovered_data:
                print("✅ Data successfully recovered")
                print(f"Data integrity: {'✅ OK' if recovered_data['intensity'] == consciousness_data['intensity'] else '❌ FAILED'}")
            else:
                print("❌ Failed to recover data")
        else:
            print("❌ Failed to secure data")
        
        # Get security report
        report = security_system.get_security_report()
        print(f"\n📊 Security Report:")
        print(f"Encryptions: {report['encryption_stats']['total_encrypted']}")
        print(f"Decryptions: {report['encryption_stats']['total_decrypted']}")
        print(f"Users with consent: {report['consent_summary']['total_users']}")
        print(f"Security events: {report['security_events']}")
        
        print("\n✅ Security system test completed successfully!")
        
    except Exception as e:
        print(f"❌ Security test failed: {e}")
        logger.exception("Security system test failed")