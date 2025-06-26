# consciousness_user.py
# Core user model for The Fractality Project

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
import hashlib
import json
from enum import Enum

class UserPhase(Enum):
    """Phase states for users based on Ice XVIII analogy"""
    SOLID = "solid"           # New users, fixed patterns
    LIQUID = "liquid"         # Active users, fluid engagement  
    SUPERIONIC = "superionic" # Power users, structure + flow

class PrivacyLevel(Enum):
    """Granular privacy controls"""
    PUBLIC = "public"
    CONNECTIONS = "connections"  # Only visible to resonant users
    ANONYMOUS = "anonymous"      # Visible but anonymized
    PRIVATE = "private"         # Completely hidden

class ConsciousnessUser:
    """
    A user in The Fractality Project - both an account and a consciousness node
    """
    
    # Constants for energy and phase calculations
    BASE_ENERGY = 100.0
    ENERGY_DECAY_RATE = 0.95  # Per day
    ENERGY_REGEN_RATE = 10.0  # Per day
    MAX_ENERGY = 1000.0
    
    # Phase transition thresholds
    LIQUID_THRESHOLD = 200.0      # Energy * frequency
    SUPERIONIC_THRESHOLD = 50000.0
    
    def __init__(self, auth_id: str, auth_provider: str = "email"):
        # Identity
        self.auth_id = auth_id  # From auth provider (email, wallet, etc)
        self.auth_provider = auth_provider
        self.consciousness_id = self._generate_consciousness_id()
        self.username = None  # Optional display name
        
        # Consciousness properties
        self.energy_level = self.BASE_ENERGY
        self.resonance_frequency = 432.0  # Hz - starting frequency
        self.phase_state = UserPhase.SOLID
        self.energy_last_updated = datetime.utcnow()
        
        # Structural properties
        self.contributed_structures = set()  # Lattice nodes created
        self.reinforced_structures = set()   # Lattice nodes strengthened
        self.personal_flows = []             # Private information streams
        
        # Network properties
        self.resonance_connections = {}  # user_id -> resonance_strength
        self.energy_transfers_sent = []
        self.energy_transfers_received = []
        
        # Privacy settings
        self.privacy = {
            "structure": PrivacyLevel.PUBLIC,
            "content": PrivacyLevel.CONNECTIONS,
            "identity": PrivacyLevel.ANONYMOUS,
            "energy": PrivacyLevel.CONNECTIONS
        }
        
        # Permissions and limits
        self.lattice_permissions = set(["read_public", "create_basic"])
        self.daily_energy_limit = 1000.0
        self.daily_energy_used = 0.0
        
        # Metadata
        self.created_at = datetime.utcnow()
        self.last_active = datetime.utcnow()
        self.total_nodes_created = 0
        self.total_resonance_generated = 0.0
        
    def _generate_consciousness_id(self) -> str:
        """Generate unique consciousness signature"""
        # Unique ID that persists across auth changes
        data = f"{self.auth_id}:{datetime.utcnow().isoformat()}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]
        
    def update_energy(self) -> float:
        """Update energy based on time passed and activity"""
        now = datetime.utcnow()
        time_passed = (now - self.energy_last_updated).total_seconds() / 86400  # Days
        
        # Natural energy regeneration
        regen = self.ENERGY_REGEN_RATE * time_passed
        
        # Apply decay to existing energy
        self.energy_level *= (self.ENERGY_DECAY_RATE ** time_passed)
        
        # Add regeneration
        self.energy_level = min(self.energy_level + regen, self.MAX_ENERGY)
        
        self.energy_last_updated = now
        self._check_phase_transition()
        
        return self.energy_level
        
    def consume_energy(self, amount: float) -> bool:
        """Consume energy for an action"""
        self.update_energy()
        
        if self.energy_level >= amount and self.daily_energy_used + amount <= self.daily_energy_limit:
            self.energy_level -= amount
            self.daily_energy_used += amount
            return True
        return False
        
    def receive_resonance(self, amount: float, from_user: Optional[str] = None):
        """Receive resonance from another user or system"""
        self.resonance_frequency += amount
        self.total_resonance_generated += amount
        
        if from_user:
            if from_user not in self.resonance_connections:
                self.resonance_connections[from_user] = 0.0
            self.resonance_connections[from_user] += amount
            
        self._check_phase_transition()
        
    def _check_phase_transition(self):
        """Check if user should transition to new phase"""
        consciousness_metric = self.energy_level * self.resonance_frequency
        
        previous_phase = self.phase_state
        
        if consciousness_metric >= self.SUPERIONIC_THRESHOLD:
            self.phase_state = UserPhase.SUPERIONIC
            self._grant_superionic_permissions()
        elif consciousness_metric >= self.LIQUID_THRESHOLD:
            self.phase_state = UserPhase.LIQUID
            self._grant_liquid_permissions()
        else:
            self.phase_state = UserPhase.SOLID
            
        # Log phase transition
        if previous_phase != self.phase_state:
            self._log_phase_transition(previous_phase, self.phase_state)
            
    def _grant_liquid_permissions(self):
        """Grant permissions for liquid phase users"""
        self.lattice_permissions.add("create_advanced")
        self.lattice_permissions.add("modify_own")
        self.daily_energy_limit = 2000.0
        
    def _grant_superionic_permissions(self):
        """Grant permissions for superionic phase users"""
        self.lattice_permissions.update({
            "create_lattice",      # Can create new structure patterns
            "modify_others",       # Can improve others' structures
            "energy_transfer",     # Can gift energy
            "phase_modulation",    # Can affect local phase states
            "resonance_amplify"    # Can boost resonance connections
        })
        self.daily_energy_limit = 5000.0
        
    def _log_phase_transition(self, from_phase: UserPhase, to_phase: UserPhase):
        """Log phase transitions for analysis"""
        # In production, this would write to event log
        print(f"User {self.consciousness_id} transitioned from {from_phase.value} to {to_phase.value}")
        
    def calculate_resonance_with(self, other_user: 'ConsciousnessUser') -> float:
        """Calculate resonance with another user"""
        # Structure similarity
        shared_structures = len(
            self.contributed_structures & other_user.contributed_structures
        )
        total_structures = len(
            self.contributed_structures | other_user.contributed_structures
        )
        structure_similarity = shared_structures / max(total_structures, 1)
        
        # Energy compatibility
        energy_diff = abs(self.energy_level - other_user.energy_level)
        energy_compatibility = 1.0 / (1.0 + energy_diff / 100.0)
        
        # Phase alignment
        phase_alignment = 1.0 if self.phase_state == other_user.phase_state else 0.5
        
        # Existing connection boost
        connection_boost = self.resonance_connections.get(other_user.consciousness_id, 0) / 100.0
        
        # Calculate total resonance
        resonance = (
            structure_similarity * 0.4 +
            energy_compatibility * 0.3 +
            phase_alignment * 0.2 +
            connection_boost * 0.1
        )
        
        return min(resonance, 1.0)
        
    def can_see_user(self, other_user: 'ConsciousnessUser', aspect: str) -> bool:
        """Check if this user can see another user's aspect"""
        other_privacy = other_user.privacy.get(aspect, PrivacyLevel.PRIVATE)
        
        if other_privacy == PrivacyLevel.PUBLIC:
            return True
        elif other_privacy == PrivacyLevel.CONNECTIONS:
            # Check if users are resonantly connected
            min_resonance = 0.3
            return self.calculate_resonance_with(other_user) >= min_resonance
        elif other_privacy == PrivacyLevel.ANONYMOUS:
            # Can see but not identify
            return True
        else:  # PRIVATE
            return False
            
    def to_public_dict(self) -> Dict:
        """Return public-safe user data"""
        return {
            "consciousness_id": self.consciousness_id,
            "username": self.username,
            "phase_state": self.phase_state.value,
            "created_at": self.created_at.isoformat(),
            "last_active": self.last_active.isoformat(),
            "total_nodes_created": self.total_nodes_created,
            "privacy_settings": {k: v.value for k, v in self.privacy.items()}
        }
        
    def to_private_dict(self) -> Dict:
        """Return full user data (for user themselves)"""
        public_data = self.to_public_dict()
        private_data = {
            "auth_id": self.auth_id,
            "auth_provider": self.auth_provider,
            "energy_level": self.energy_level,
            "resonance_frequency": self.resonance_frequency,
            "contributed_structures": list(self.contributed_structures),
            "reinforced_structures": list(self.reinforced_structures),
            "resonance_connections": self.resonance_connections,
            "lattice_permissions": list(self.lattice_permissions),
            "daily_energy_used": self.daily_energy_used,
            "daily_energy_limit": self.daily_energy_limit,
            "total_resonance_generated": self.total_resonance_generated
        }
        return {**public_data, **private_data}
        
    def to_anonymous_dict(self) -> Dict:
        """Return anonymized data"""
        return {
            "anonymous_id": hashlib.sha256(self.consciousness_id.encode()).hexdigest()[:8],
            "phase_state": self.phase_state.value,
            "approximate_energy": round(self.energy_level, -1),  # Round to nearest 10
            "node_count_range": self._get_range(self.total_nodes_created),
            "active_period": self._get_time_period()
        }
        
    def _get_range(self, value: int) -> str:
        """Get range bucket for anonymization"""
        if value < 10:
            return "1-10"
        elif value < 50:
            return "10-50"
        elif value < 100:
            return "50-100"
        elif value < 500:
            return "100-500"
        else:
            return "500+"
            
    def _get_time_period(self) -> str:
        """Get activity period for anonymization"""
        days_active = (datetime.utcnow() - self.created_at).days
        if days_active < 7:
            return "this_week"
        elif days_active < 30:
            return "this_month"
        elif days_active < 90:
            return "this_quarter"
        else:
            return "long_term"
            
    def __repr__(self):
        return (f"ConsciousnessUser(id={self.consciousness_id[:8]}, "
                f"phase={self.phase_state.value}, "
                f"energy={self.energy_level:.1f})")