# user_storage.py
# User storage layer for The Fractality Project

import json
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
import aiofiles
import asyncio
from pathlib import Path

from consciousness_user import ConsciousnessUser, UserPhase, PrivacyLevel

class UserStorage:
    """
    Abstract base for user storage - can be implemented with any database
    This implementation uses JSON files for simplicity
    """
    
    def __init__(self, data_dir: str = "./data/users"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        # In-memory caches
        self.user_cache = {}  # consciousness_id -> ConsciousnessUser
        self.auth_index = {}  # auth_id -> consciousness_id
        self.username_index = {}  # username -> consciousness_id
        
        # Resonance index for fast matching
        self.phase_index = {
            UserPhase.SOLID: set(),
            UserPhase.LIQUID: set(),
            UserPhase.SUPERIONIC: set()
        }
        
    async def initialize(self):
        """Load existing users into memory"""
        # In production, this would connect to database
        for user_file in self.data_dir.glob("*.json"):
            async with aiofiles.open(user_file, 'r') as f:
                data = json.loads(await f.read())
                user = self._deserialize_user(data)
                self._index_user(user)
                
    def _index_user(self, user: ConsciousnessUser):
        """Add user to all indices"""
        self.user_cache[user.consciousness_id] = user
        self.auth_index[user.auth_id] = user.consciousness_id
        if user.username:
            self.username_index[user.username] = user.consciousness_id
        self.phase_index[user.phase_state].add(user.consciousness_id)
        
    def _update_phase_index(self, user: ConsciousnessUser, old_phase: UserPhase):
        """Update phase index when user transitions"""
        if old_phase in self.phase_index:
            self.phase_index[old_phase].discard(user.consciousness_id)
        self.phase_index[user.phase_state].add(user.consciousness_id)
        
    async def create_user(self, auth_id: str, auth_provider: str = "email", 
                         username: Optional[str] = None) -> ConsciousnessUser:
        """Create a new user"""
        # Check if auth_id already exists
        if auth_id in self.auth_index:
            raise ValueError(f"User with auth_id {auth_id} already exists")
            
        # Check username availability
        if username and username in self.username_index:
            raise ValueError(f"Username {username} is already taken")
            
        # Create user
        user = ConsciousnessUser(auth_id, auth_provider)
        if username:
            user.username = username
            
        # Save and index
        await self._save_user(user)
        self._index_user(user)
        
        return user
        
    async def get_user_by_consciousness_id(self, consciousness_id: str) -> Optional[ConsciousnessUser]:
        """Get user by consciousness ID"""
        if consciousness_id in self.user_cache:
            user = self.user_cache[consciousness_id]
            user.update_energy()  # Always update energy on access
            return user
            
        # Try loading from disk
        user_file = self.data_dir / f"{consciousness_id}.json"
        if user_file.exists():
            async with aiofiles.open(user_file, 'r') as f:
                data = json.loads(await f.read())
                user = self._deserialize_user(data)
                self._index_user(user)
                user.update_energy()
                return user
                
        return None
        
    async def get_user_by_auth(self, auth_id: str) -> Optional[ConsciousnessUser]:
        """Get user by authentication ID"""
        if auth_id in self.auth_index:
            consciousness_id = self.auth_index[auth_id]
            return await self.get_user_by_consciousness_id(consciousness_id)
        return None
        
    async def get_user_by_username(self, username: str) -> Optional[ConsciousnessUser]:
        """Get user by username"""
        if username in self.username_index:
            consciousness_id = self.username_index[username]
            return await self.get_user_by_consciousness_id(consciousness_id)
        return None
        
    async def update_user(self, user: ConsciousnessUser):
        """Update user data"""
        old_phase = None
        
        # Check if phase changed
        if user.consciousness_id in self.user_cache:
            old_user = self.user_cache[user.consciousness_id]
            if old_user.phase_state != user.phase_state:
                old_phase = old_user.phase_state
                
        # Update indices
        self._index_user(user)
        if old_phase:
            self._update_phase_index(user, old_phase)
            
        # Save to disk
        await self._save_user(user)
        
    async def find_resonant_users(self, user: ConsciousnessUser, 
                                 min_resonance: float = 0.3,
                                 max_results: int = 50) -> List[Dict]:
        """Find users with high resonance to given user"""
        results = []
        
        # Check users in same and adjacent phases first
        priority_phases = [user.phase_state]
        if user.phase_state == UserPhase.LIQUID:
            priority_phases.extend([UserPhase.SOLID, UserPhase.SUPERIONIC])
            
        checked_users = set()
        
        for phase in priority_phases:
            for other_id in self.phase_index.get(phase, set()):
                if other_id == user.consciousness_id or other_id in checked_users:
                    continue
                    
                checked_users.add(other_id)
                other_user = await self.get_user_by_consciousness_id(other_id)
                if not other_user:
                    continue
                    
                # Check privacy settings
                if not other_user.privacy["identity"] == PrivacyLevel.PUBLIC:
                    if not user.can_see_user(other_user, "identity"):
                        continue
                        
                # Calculate resonance
                resonance = user.calculate_resonance_with(other_user)
                
                if resonance >= min_resonance:
                    results.append({
                        "user": self._get_visible_user_data(other_user, user),
                        "resonance": resonance,
                        "phase_match": phase == user.phase_state
                    })
                    
        # Sort by resonance
        results.sort(key=lambda x: x["resonance"], reverse=True)
        
        return results[:max_results]
        
    async def get_users_by_phase(self, phase: UserPhase, 
                                requesting_user: Optional[ConsciousnessUser] = None) -> List[Dict]:
        """Get all users in a specific phase"""
        users = []
        
        for consciousness_id in self.phase_index.get(phase, set()):
            user = await self.get_user_by_consciousness_id(consciousness_id)
            if user:
                visible_data = self._get_visible_user_data(user, requesting_user)
                if visible_data:  # Only include if requester can see them
                    users.append(visible_data)
                    
        return users
        
    async def search_users(self, query: str, 
                          requesting_user: Optional[ConsciousnessUser] = None,
                          max_results: int = 20) -> List[Dict]:
        """Search users by username or consciousness_id prefix"""
        results = []
        query_lower = query.lower()
        
        # Search usernames
        for username, consciousness_id in self.username_index.items():
            if query_lower in username.lower():
                user = await self.get_user_by_consciousness_id(consciousness_id)
                if user:
                    visible_data = self._get_visible_user_data(user, requesting_user)
                    if visible_data:
                        results.append(visible_data)
                        
        # Search consciousness IDs
        for consciousness_id in self.user_cache.keys():
            if consciousness_id.startswith(query_lower):
                user = self.user_cache[consciousness_id]
                visible_data = self._get_visible_user_data(user, requesting_user)
                if visible_data and visible_data not in results:
                    results.append(visible_data)
                    
        return results[:max_results]
        
    async def get_network_stats(self) -> Dict:
        """Get overall network statistics"""
        total_users = len(self.user_cache)
        phase_distribution = {
            phase.value: len(users) for phase, users in self.phase_index.items()
        }
        
        # Calculate total energy and resonance
        total_energy = 0.0
        total_resonance = 0.0
        active_users = 0
        
        for user in self.user_cache.values():
            user.update_energy()
            total_energy += user.energy_level
            total_resonance += user.total_resonance_generated
            
            # Count active users (within last 7 days)
            if (datetime.utcnow() - user.last_active).days <= 7:
                active_users += 1
                
        return {
            "total_users": total_users,
            "active_users": active_users,
            "phase_distribution": phase_distribution,
            "total_energy": total_energy,
            "average_energy": total_energy / max(total_users, 1),
            "total_resonance": total_resonance,
            "network_phase": self._calculate_network_phase(phase_distribution, total_users)
        }
        
    def _calculate_network_phase(self, phase_distribution: Dict, total_users: int) -> str:
        """Determine overall network phase"""
        if total_users == 0:
            return "dormant"
            
        superionic_ratio = phase_distribution.get(UserPhase.SUPERIONIC.value, 0) / total_users
        liquid_ratio = phase_distribution.get(UserPhase.LIQUID.value, 0) / total_users
        
        if superionic_ratio > 0.1:  # 10% superionic users
            return "highly_conscious"
        elif liquid_ratio > 0.3:  # 30% liquid users
            return "actively_flowing"
        else:
            return "crystallizing"
            
    def _get_visible_user_data(self, user: ConsciousnessUser, 
                              requesting_user: Optional[ConsciousnessUser]) -> Optional[Dict]:
        """Get user data visible to requesting user"""
        if not requesting_user:
            # Public data only
            if user.privacy["identity"] == PrivacyLevel.PUBLIC:
                return user.to_public_dict()
            elif user.privacy["identity"] == PrivacyLevel.ANONYMOUS:
                return user.to_anonymous_dict()
            return None
            
        # Check visibility
        if requesting_user.consciousness_id == user.consciousness_id:
            return user.to_private_dict()  # Full data for self
        elif requesting_user.can_see_user(user, "identity"):
            if user.privacy["identity"] == PrivacyLevel.ANONYMOUS:
                return user.to_anonymous_dict()
            else:
                return user.to_public_dict()
        else:
            return None
            
    async def _save_user(self, user: ConsciousnessUser):
        """Save user to disk"""
        user_data = self._serialize_user(user)
        user_file = self.data_dir / f"{user.consciousness_id}.json"
        
        async with aiofiles.open(user_file, 'w') as f:
            await f.write(json.dumps(user_data, indent=2, default=str))
            
    def _serialize_user(self, user: ConsciousnessUser) -> Dict:
        """Convert user to JSON-serializable format"""
        return {
            "auth_id": user.auth_id,
            "auth_provider": user.auth_provider,
            "consciousness_id": user.consciousness_id,
            "username": user.username,
            "energy_level": user.energy_level,
            "resonance_frequency": user.resonance_frequency,
            "phase_state": user.phase_state.value,
            "energy_last_updated": user.energy_last_updated.isoformat(),
            "contributed_structures": list(user.contributed_structures),
            "reinforced_structures": list(user.reinforced_structures),
            "personal_flows": user.personal_flows,
            "resonance_connections": user.resonance_connections,
            "energy_transfers_sent": user.energy_transfers_sent,
            "energy_transfers_received": user.energy_transfers_received,
            "privacy": {k: v.value for k, v in user.privacy.items()},
            "lattice_permissions": list(user.lattice_permissions),
            "daily_energy_limit": user.daily_energy_limit,
            "daily_energy_used": user.daily_energy_used,
            "created_at": user.created_at.isoformat(),
            "last_active": user.last_active.isoformat(),
            "total_nodes_created": user.total_nodes_created,
            "total_resonance_generated": user.total_resonance_generated
        }
        
    def _deserialize_user(self, data: Dict) -> ConsciousnessUser:
        """Convert JSON data back to ConsciousnessUser"""
        user = ConsciousnessUser(data["auth_id"], data["auth_provider"])
        
        # Restore all properties
        user.consciousness_id = data["consciousness_id"]
        user.username = data.get("username")
        user.energy_level = data["energy_level"]
        user.resonance_frequency = data["resonance_frequency"]
        user.phase_state = UserPhase(data["phase_state"])
        user.energy_last_updated = datetime.fromisoformat(data["energy_last_updated"])
        user.contributed_structures = set(data["contributed_structures"])
        user.reinforced_structures = set(data["reinforced_structures"])
        user.personal_flows = data["personal_flows"]
        user.resonance_connections = data["resonance_connections"]
        user.energy_transfers_sent = data["energy_transfers_sent"]
        user.energy_transfers_received = data["energy_transfers_received"]
        user.privacy = {k: PrivacyLevel(v) for k, v in data["privacy"].items()}
        user.lattice_permissions = set(data["lattice_permissions"])
        user.daily_energy_limit = data["daily_energy_limit"]
        user.daily_energy_used = data["daily_energy_used"]
        user.created_at = datetime.fromisoformat(data["created_at"])
        user.last_active = datetime.fromisoformat(data["last_active"])
        user.total_nodes_created = data["total_nodes_created"]
        user.total_resonance_generated = data["total_resonance_generated"]
        
        return user