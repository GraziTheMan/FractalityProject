# user_superionic_integration.py
# Integration layer between users and superionic database

from datetime import datetime
from typing import Dict, List, Optional, Set
import json

from consciousness_user import ConsciousnessUser, UserPhase
from superionic_database import SuperionicDatabase, InformationFlow

class UserSuperionicSpace:
    """
    Each user's interface to the superionic database
    Manages personal flows while contributing to shared lattice
    """
    
    # Energy costs for different operations
    ENERGY_COSTS = {
        "create_node": 10.0,
        "modify_node": 5.0,
        "create_connection": 3.0,
        "query_simple": 1.0,
        "query_resonance": 5.0,
        "crystallize_structure": 50.0,
        "energy_transfer": 0.0  # No cost to give energy
    }
    
    def __init__(self, user: ConsciousnessUser, shared_db: SuperionicDatabase):
        self.user = user
        self.shared_db = shared_db  # Global lattice
        self.personal_flows = InformationFlow()  # User's private information
        
        # Track user's contributions
        self.contribution_history = []
        self.resonance_received = []
        
    def can_perform_action(self, action: str) -> Tuple[bool, str]:
        """Check if user has permission and energy for action"""
        # Check permissions based on phase
        if action == "crystallize_structure" and "create_lattice" not in self.user.lattice_permissions:
            return False, "Requires superionic phase to crystallize structures"
            
        # Check energy
        energy_cost = self.ENERGY_COSTS.get(action, 0)
        if not self.user.consume_energy(energy_cost):
            return False, f"Insufficient energy (need {energy_cost}, have {self.user.energy_level:.1f})"
            
        return True, "Action allowed"
        
    async def store_node(self, node_data: Dict) -> Dict:
        """Store node with user's consciousness signature"""
        # Check permissions
        can_do, message = self.can_perform_action("create_node")
        if not can_do:
            raise PermissionError(message)
            
        # Add user's consciousness properties
        enriched_data = {
            **node_data,
            "user_consciousness": self.user.consciousness_id,
            "user_energy": self.user.energy_level,
            "user_frequency": self.user.resonance_frequency,
            "user_phase": self.user.phase_state.value,
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Store in shared database
        result = self.shared_db.store(enriched_data)
        
        # Track contribution
        self._track_contribution(result, "create")
        
        # Update user metrics
        self._update_user_metrics(result)
        
        # Add to personal flow if content is private
        if self.user.privacy.get("content") != "public":
            self.personal_flows.inject(
                content=node_data.get("private_content", {}),
                lattice_position=result["lattice_id"],
                energy=self.user.energy_level
            )
            
        return {
            **result,
            "user_contribution": {
                "energy_spent": self.ENERGY_COSTS["create_node"],
                "resonance_potential": self._calculate_resonance_potential(result),
                "visibility": self._get_node_visibility(enriched_data)
            }
        }
        
    async def query(self, query: str, query_type: str = "simple") -> Dict:
        """Query the superionic database with user's consciousness field"""
        # Check permissions
        action = f"query_{query_type}"
        can_do, message = self.can_perform_action(action)
        if not can_do:
            raise PermissionError(message)
            
        # Apply user's consciousness field to modulate the query
        modulated_query = self._modulate_query(query)
        
        # Execute query
        results = self.shared_db.retrieve(modulated_query)
        
        # Filter results based on user's permissions and resonance
        filtered_results = self._filter_results(results)
        
        # Track query for learning
        self._track_query(query, filtered_results)
        
        return {
            "results": filtered_results,
            "energy_spent": self.ENERGY_COSTS[action],
            "resonance_boost": self._get_resonance_boost(filtered_results),
            "phase_coherence": self._calculate_phase_coherence(results)
        }
        
    async def find_resonant_nodes(self, node_id: str, min_resonance: float = 0.5) -> List[Dict]:
        """Find nodes that resonate with given node"""
        can_do, message = self.can_perform_action("query_resonance")
        if not can_do:
            raise PermissionError(message)
            
        # Get node from lattice
        lattice_node = self.shared_db.ontology.nodes.get(node_id)
        if not lattice_node:
            raise ValueError(f"Node {node_id} not found")
            
        # Find resonant structures
        resonant_nodes = []
        
        for other_id, other_structure in self.shared_db.ontology.nodes.items():
            if other_id == node_id:
                continue
                
            # Calculate structural resonance
            resonance = self._calculate_node_resonance(lattice_node, other_structure)
            
            # Apply user's consciousness as amplifier
            amplified_resonance = resonance * (1 + self.user.resonance_frequency / 1000)
            
            if amplified_resonance >= min_resonance:
                # Check if user can see this node
                if self._can_access_node(other_structure):
                    resonant_nodes.append({
                        "node_id": other_id,
                        "resonance": amplified_resonance,
                        "structure": self._get_visible_structure(other_structure),
                        "creator": other_structure.get("user_consciousness", "unknown")
                    })
                    
        # Sort by resonance
        resonant_nodes.sort(key=lambda x: x["resonance"], reverse=True)
        
        # Reward user for finding resonances
        if resonant_nodes:
            resonance_reward = len(resonant_nodes) * 0.1
            self.user.receive_resonance(resonance_reward)
            
        return resonant_nodes
        
    async def crystallize_structure(self, pattern: Dict) -> Dict:
        """Crystallize a new structure pattern into the lattice (superionic only)"""
        can_do, message = self.can_perform_action("crystallize_structure")
        if not can_do:
            raise PermissionError(message)
            
        # Validate pattern complexity
        if not self._is_pattern_complex_enough(pattern):
            raise ValueError("Pattern must have sufficient complexity to crystallize")
            
        # Create lattice structure
        structure = {
            "type": "crystallized_pattern",
            "pattern": pattern,
            "crystallized_by": self.user.consciousness_id,
            "crystallization_energy": self.user.energy_level,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Store as permanent lattice node
        lattice_id = self.shared_db.ontology.crystallize(structure)
        
        # Mark as user's contribution
        self.user.contributed_structures.add(lattice_id)
        
        # Massive resonance reward for crystallization
        self.user.receive_resonance(10.0)
        
        return {
            "lattice_id": lattice_id,
            "pattern_hash": lattice_id[:8],
            "reward": {
                "resonance": 10.0,
                "permission_granted": "pattern_creator",
                "energy_refund": self.ENERGY_COSTS["crystallize_structure"] * 0.5
            }
        }
        
    async def transfer_energy(self, recipient_consciousness_id: str, amount: float) -> Dict:
        """Transfer energy to another user (superionic only)"""
        if "energy_transfer" not in self.user.lattice_permissions:
            raise PermissionError("Energy transfer requires superionic phase")
            
        if amount <= 0 or amount > self.user.energy_level * 0.5:
            raise ValueError("Can only transfer up to 50% of current energy")
            
        # Consume energy (no cost for transfer itself)
        if not self.user.consume_energy(amount):
            raise ValueError("Insufficient energy")
            
        # Record transfer
        transfer_record = {
            "from": self.user.consciousness_id,
            "to": recipient_consciousness_id,
            "amount": amount,
            "timestamp": datetime.utcnow().isoformat(),
            "message": "Energy transfer between conscious beings"
        }
        
        self.user.energy_transfers_sent.append(transfer_record)
        
        return {
            "transferred": amount,
            "remaining_energy": self.user.energy_level,
            "transfer_id": hashlib.sha256(
                json.dumps(transfer_record, sort_keys=True).encode()
            ).hexdigest()[:16]
        }
        
    def _track_contribution(self, result: Dict, action: str):
        """Track user's contribution for analytics"""
        contribution = {
            "action": action,
            "lattice_id": result.get("lattice_id"),
            "timestamp": datetime.utcnow().isoformat(),
            "phase_state": result.get("phase", {}).get("phase"),
            "compression_ratio": result.get("compression", {}).get("ratio", 1.0),
            "structure_shared": result.get("compression", {}).get("structure_sharing", False)
        }
        
        self.contribution_history.append(contribution)
        self.user.total_nodes_created += 1
        
    def _update_user_metrics(self, storage_result: Dict):
        """Update user's consciousness metrics based on activity"""
        compression = storage_result.get("compression", {})
        
        if compression.get("structure_sharing"):
            # User reinforced existing structure
            self.user.receive_resonance(0.5)
            self.user.reinforced_structures.add(storage_result["lattice_id"])
        else:
            # User created new structure
            self.user.receive_resonance(1.0)
            self.user.contributed_structures.add(storage_result["lattice_id"])
            
        # Check for phase transition
        self.user._check_phase_transition()
        
    def _modulate_query(self, query: str) -> str:
        """Modulate query with user's consciousness properties"""
        # Add consciousness context to query
        modulated = f"{query} [consciousness:{self.user.consciousness_id[:8]}]"
        
        # Superionic users get enhanced queries
        if self.user.phase_state == UserPhase.SUPERIONIC:
            modulated += " [phase:superionic] [deep:true]"
        elif self.user.phase_state == UserPhase.LIQUID:
            modulated += " [phase:liquid] [flow:true]"
            
        return modulated
        
    def _filter_results(self, results: Dict) -> List[Dict]:
        """Filter results based on user's permissions and phase"""
        filtered = []
        
        for item in results.get("results", []):
            content = item.get("content", {})
            
            # Check creator's privacy settings
            creator_id = content.get("user_consciousness")
            if creator_id and creator_id != self.user.consciousness_id:
                # Would need to load creator user to check privacy
                # For now, include all public content
                if content.get("visibility", "public") == "public":
                    filtered.append(item)
            else:
                # User's own content
                filtered.append(item)
                
        return filtered
        
    def _calculate_resonance_potential(self, result: Dict) -> float:
        """Calculate how much resonance this contribution might generate"""
        base_potential = 1.0
        
        # Shared structures have higher potential
        if result.get("compression", {}).get("structure_sharing"):
            base_potential *= 2.0
            
        # High-energy contributions resonate more
        if result.get("energy", 0) > 5.0:
            base_potential *= 1.5
            
        # Phase multiplier
        phase_multipliers = {
            "superionic": 3.0,
            "liquid": 2.0,
            "solid": 1.0
        }
        phase = result.get("phase", {}).get("phase", "solid")
        base_potential *= phase_multipliers.get(phase, 1.0)
        
        return base_potential
        
    def _get_node_visibility(self, node_data: Dict) -> str:
        """Determine node visibility based on user privacy settings"""
        if self.user.privacy["content"] == "public":
            return "public"
        elif self.user.privacy["content"] == "connections":
            return "connections_only"
        elif self.user.privacy["content"] == "anonymous":
            return "anonymous"
        else:
            return "private"
            
    def _calculate_node_resonance(self, node1: Dict, node2: Dict) -> float:
        """Calculate resonance between two nodes"""
        # Type similarity
        type_match = 1.0 if node1.get("type") == node2.get("type") else 0.5
        
        # Relationship similarity
        relations1 = set(node1.get("relationships", []))
        relations2 = set(node2.get("relationships", []))
        relation_similarity = len(relations1 & relations2) / max(len(relations1 | relations2), 1)
        
        # Pattern similarity
        patterns1 = set(node1.get("patterns", []))
        patterns2 = set(node2.get("patterns", []))
        pattern_similarity = len(patterns1 & patterns2) / max(len(patterns1 | patterns2), 1)
        
        # Weighted combination
        resonance = (
            type_match * 0.2 +
            relation_similarity * 0.4 +
            pattern_similarity * 0.4
        )
        
        return resonance
        
    def _can_access_node(self, node_structure: Dict) -> bool:
        """Check if user can access a node based on permissions"""
        # Public nodes are always accessible
        if node_structure.get("visibility") == "public":
            return True
            
        # Check consciousness connection
        creator = node_structure.get("user_consciousness")
        if creator in self.user.resonance_connections:
            return True
            
        # Superionic users can see more
        if self.user.phase_state == UserPhase.SUPERIONIC:
            return node_structure.get("visibility") != "private"
            
        return False
        
    def _get_visible_structure(self, structure: Dict) -> Dict:
        """Return structure filtered by visibility rules"""
        visibility = structure.get("visibility", "public")
        
        if visibility == "public":
            return structure
        elif visibility == "anonymous":
            # Remove identifying information
            return {
                k: v for k, v in structure.items()
                if k not in ["user_consciousness", "crystallized_by"]
            }
        else:
            # Minimal information
            return {
                "type": structure.get("type"),
                "visibility": visibility
            }
            
    def _is_pattern_complex_enough(self, pattern: Dict) -> bool:
        """Check if pattern has sufficient complexity to crystallize"""
        # Must have multiple elements
        if len(pattern) < 3:
            return False
            
        # Must have relationships
        if "relationships" not in pattern or len(pattern["relationships"]) < 2:
            return False
            
        # Must be novel (not duplicate existing pattern)
        pattern_hash = hashlib.sha256(
            json.dumps(pattern, sort_keys=True).encode()
        ).hexdigest()
        
        return pattern_hash not in self.shared_db.ontology.structure_cache
        
    def _track_query(self, query: str, results: List[Dict]):
        """Track query for user learning and system optimization"""
        # In production, this would feed into query optimization
        pass
        
    def _get_resonance_boost(self, results: List[Dict]) -> float:
        """Calculate resonance boost from query results"""
        if not results:
            return 0.0
            
        # Finding relevant results generates small resonance
        return min(len(results) * 0.01, 0.1)
        
    def _calculate_phase_coherence(self, results: Dict) -> float:
        """Calculate phase coherence of query results"""
        phase_state = results.get("phase_state")
        if not phase_state:
            return 0.0
            
        # Coherence based on user phase alignment
        user_phase_value = {
            UserPhase.SOLID: 1,
            UserPhase.LIQUID: 2,
            UserPhase.SUPERIONIC: 3
        }[self.user.phase_state]
        
        system_phase_value = {
            "solid": 1,
            "liquid": 2,
            "superionic": 3
        }.get(phase_state.get("phase"), 1)
        
        # Perfect alignment = 1.0, opposite = 0.0
        coherence = 1.0 - abs(user_phase_value - system_phase_value) / 3.0
        
        return coherence


# Example helper functions for user-system integration

async def onboard_new_user(user: ConsciousnessUser, shared_db: SuperionicDatabase) -> UserSuperionicSpace:
    """Onboard a new user to the consciousness network"""
    # Create user's space
    user_space = UserSuperionicSpace(user, shared_db)
    
    # Create welcome node
    welcome_node = {
        "id": f"welcome-{user.consciousness_id[:8]}",
        "type": "welcome",
        "name": "Welcome to The Fractality",
        "info": f"Your consciousness journey begins here. Energy: {user.energy_level}",
        "tags": ["welcome", "onboarding", "consciousness"],
        "visibility": "private"
    }
    
    # Store without energy cost (first node is free)
    user.energy_level += UserSuperionicSpace.ENERGY_COSTS["create_node"]
    await user_space.store_node(welcome_node)
    
    return user_space


async def find_resonant_users_for_node(
    node_id: str, 
    user_space: UserSuperionicSpace,
    user_storage: 'UserStorage'
) -> List[Dict]:
    """Find users who resonate with a specific node"""
    # Get resonant nodes
    resonant_nodes = await user_space.find_resonant_nodes(node_id)
    
    # Get unique creators
    creators = set()
    for node in resonant_nodes:
        creator = node.get("creator")
        if creator and creator != "unknown":
            creators.add(creator)
            
    # Load user data for creators
    resonant_users = []
    for creator_id in creators:
        creator_user = await user_storage.get_user_by_consciousness_id(creator_id)
        if creator_user:
            resonance = user_space.user.calculate_resonance_with(creator_user)
            if resonance > 0.3:  # Threshold
                resonant_users.append({
                    "user": creator_user.to_public_dict(),
                    "resonance": resonance,
                    "shared_nodes": len([n for n in resonant_nodes if n["creator"] == creator_id])
                })
                
    return sorted(resonant_users, key=lambda x: x["resonance"], reverse=True)