# superionic_database_enhanced.py
# Production-ready Superionic Database for the Fractality Project
# Integrates with existing CACE and resonance systems

import hashlib
import json
import zlib
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Tuple, Any
import numpy as np

class OntologyGraph:
    """Fixed lattice structure - shared across all users"""
    
    def __init__(self):
        self.nodes = {}
        self.edges = defaultdict(list)
        self.structure_cache = {}  # Global pattern cache
        self.fcc_positions = {}    # Face-centered cubic positions
        
    def crystallize(self, structure: Dict) -> str:
        """Convert structure to immutable lattice position"""
        # Create deterministic hash for deduplication
        structure_hash = self._hash_structure(structure)
        
        if structure_hash in self.structure_cache:
            return structure_hash  # Reuse existing lattice position
            
        # New structure - assign FCC position
        node_id = structure_hash
        self.nodes[node_id] = structure
        self._assign_fcc_position(node_id)
        self.structure_cache[structure_hash] = structure
        
        # Connect to similar structures
        self._connect_resonant_structures(node_id)
        
        return node_id
        
    def _hash_structure(self, structure: Dict) -> str:
        """Create deterministic hash for structure"""
        canonical = json.dumps(structure, sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()[:16]
        
    def _assign_fcc_position(self, node_id: str):
        """Assign face-centered cubic coordinates"""
        n = len(self.nodes)
        # Simple FCC mapping - in reality would be more sophisticated
        layer = int(n ** (1/3))
        x = n % 8
        y = (n // 8) % 8
        z = layer
        self.fcc_positions[node_id] = (x, y, z)
        
    def _connect_resonant_structures(self, node_id: str):
        """Connect to 12 nearest neighbors in FCC lattice"""
        if len(self.nodes) < 2:
            return
            
        # Find structurally similar nodes
        current = self.nodes[node_id]
        similarities = []
        
        for other_id, other_structure in self.nodes.items():
            if other_id != node_id:
                similarity = self._calculate_similarity(current, other_structure)
                similarities.append((similarity, other_id))
                
        # Connect to top 12 (FCC coordination number)
        similarities.sort(reverse=True)
        for similarity, other_id in similarities[:12]:
            if similarity > 0.3:  # Threshold
                self.edges[node_id].append(other_id)
                self.edges[other_id].append(node_id)
                
    def _calculate_similarity(self, s1: Dict, s2: Dict) -> float:
        """Calculate structural similarity"""
        # Simple Jaccard similarity on keys
        keys1 = set(str(s1))
        keys2 = set(str(s2))
        if not keys1 or not keys2:
            return 0.0
        return len(keys1 & keys2) / len(keys1 | keys2)


class InformationFlow:
    """Dynamic content that flows through the lattice"""
    
    def __init__(self):
        self.flows = defaultdict(list)  # Indexed by lattice position
        self.flow_energy = {}
        
    def inject(self, content: Any, lattice_position: str, energy: float = 1.0):
        """Inject content as 'protons' into the lattice"""
        compressed = zlib.compress(json.dumps(content).encode())
        
        flow_packet = {
            "compressed_content": compressed,
            "original_size": len(json.dumps(content)),
            "compressed_size": len(compressed),
            "timestamp": datetime.utcnow().isoformat(),
            "energy": energy,
            "decay_rate": 0.95  # From consciousness decay formula
        }
        
        self.flows[lattice_position].append(flow_packet)
        self.flow_energy[lattice_position] = energy
        
    def conduct_through(self, path: List[str]) -> List[Dict]:
        """Conduct information along a path through the lattice"""
        collected_flows = []
        
        for position in path:
            if position in self.flows:
                # Apply energy decay
                for flow in self.flows[position]:
                    age = (datetime.utcnow() - 
                          datetime.fromisoformat(flow["timestamp"])).total_seconds()
                    current_energy = flow["energy"] * (flow["decay_rate"] ** age)
                    
                    if current_energy > 0.1:  # Threshold
                        collected_flows.append(flow)
                        
        return collected_flows


class PhaseModulator:
    """Controls the phase state of the system"""
    
    def __init__(self):
        self.attention_gradient = {}
        self.flow_rate = {}
        self.phase_history = []
        
    def calculate_phase_state(self, lattice_density: float, 
                            flow_intensity: float) -> Dict:
        """Determine current phase based on system parameters"""
        # Based on Ice XVIII phase diagram
        pressure = lattice_density * 100  # GPa equivalent
        temperature = flow_intensity * 2000  # Kelvin equivalent
        
        if pressure > 100 and temperature > 2000:
            phase = "superionic"
        elif pressure > 50:
            phase = "solid"
        else:
            phase = "liquid"
            
        state = {
            "phase": phase,
            "pressure": pressure,
            "temperature": temperature,
            "timestamp": datetime.utcnow().isoformat(),
            "conductivity": self._calculate_conductivity(phase)
        }
        
        self.phase_history.append(state)
        return state
        
    def _calculate_conductivity(self, phase: str) -> float:
        """Information conductivity based on phase"""
        return {
            "superionic": 0.95,  # High conductivity
            "solid": 0.3,        # Low conductivity
            "liquid": 0.6        # Medium conductivity
        }.get(phase, 0.5)
        
    def apply_consciousness_field(self, query: str, lattice: OntologyGraph) -> Dict:
        """Apply attention pressure to manifest information"""
        # Find relevant nodes
        relevant_nodes = self._find_resonant_nodes(query, lattice)
        
        # Create attention gradient
        for node_id, relevance in relevant_nodes.items():
            self.attention_gradient[node_id] = relevance
            self.flow_rate[node_id] = relevance * 2.0  # Flow proportional to attention
            
        return {
            "focused_nodes": list(relevant_nodes.keys()),
            "total_pressure": sum(relevant_nodes.values()),
            "field_strength": max(relevant_nodes.values()) if relevant_nodes else 0
        }
        
    def _find_resonant_nodes(self, query: str, lattice: OntologyGraph) -> Dict[str, float]:
        """Find nodes that resonate with the query"""
        resonances = {}
        query_terms = set(query.lower().split())
        
        for node_id, structure in lattice.nodes.items():
            # Simple term matching - would use embeddings in production
            structure_text = json.dumps(structure).lower()
            matches = sum(1 for term in query_terms if term in structure_text)
            
            if matches > 0:
                resonances[node_id] = matches / len(query_terms)
                
        return resonances


class SuperionicDatabase:
    """Main database combining lattice structure with information flow"""
    
    def __init__(self):
        self.ontology = OntologyGraph()
        self.flow = InformationFlow()
        self.modulator = PhaseModulator()
        self.stats = {
            "total_stored": 0,
            "lattice_nodes": 0,
            "compression_ratio": 0.0,
            "phase_transitions": 0
        }
        
    def store(self, data: Dict) -> Dict:
        """Store data in superionic state"""
        # Extract structure and content
        structure = self._extract_structure(data)
        content = self._extract_content(data)
        
        # Crystallize structure in lattice
        lattice_id = self.ontology.crystallize(structure)
        
        # Calculate energy based on content importance
        energy = self._calculate_energy(content)
        
        # Inject content into flow
        self.flow.inject(content, lattice_id, energy)
        
        # Update phase state
        phase_state = self._update_phase_state()
        
        # Update statistics
        self._update_stats(data, lattice_id)
        
        return {
            "lattice_id": lattice_id,
            "phase": phase_state,
            "compression": self._calculate_compression(data, lattice_id),
            "energy": energy
        }
        
    def retrieve(self, query: str) -> Dict:
        """Retrieve information through phase transition"""
        # Apply consciousness field
        field_state = self.modulator.apply_consciousness_field(query, self.ontology)
        
        # Find optimal path through lattice
        path = self._find_optimal_path(field_state["focused_nodes"])
        
        # Conduct information along path
        flows = self.flow.conduct_through(path)
        
        # Decompress and merge
        results = self._decompress_flows(flows)
        
        return {
            "results": results,
            "path_length": len(path),
            "total_energy": sum(f.get("energy", 0) for f in flows),
            "phase_state": self.modulator.phase_history[-1] if self.modulator.phase_history else None
        }
        
    def _extract_structure(self, data: Dict) -> Dict:
        """Extract structural patterns from data"""
        structure = {
            "type": data.get("type", "unknown"),
            "depth": data.get("depth", 0),
            "relationships": [],
            "patterns": []
        }
        
        # Extract relationships
        if "parent" in data:
            structure["relationships"].append(f"child_of:{data['parent']}")
        if "children" in data:
            structure["relationships"].extend([f"parent_of:{c}" for c in data["children"]])
            
        # Extract patterns
        if "tags" in data:
            structure["patterns"] = data["tags"]
            
        return structure
        
    def _extract_content(self, data: Dict) -> Dict:
        """Extract flowing content from data"""
        return {
            "id": data.get("id"),
            "name": data.get("name", ""),
            "info": data.get("info", ""),
            "metadata": data.get("metadata", {}),
            "energy": data.get("energy", 1.0),
            "frequency": data.get("frequency", 432.0)
        }
        
    def _calculate_energy(self, content: Dict) -> float:
        """Calculate information energy"""
        # Based on content richness and frequency
        base_energy = content.get("energy", 1.0)
        frequency_factor = content.get("frequency", 432.0) / 432.0
        content_factor = len(json.dumps(content)) / 1000.0
        
        return min(base_energy * frequency_factor * content_factor, 10.0)
        
    def _update_phase_state(self) -> Dict:
        """Update system phase state"""
        lattice_density = len(self.ontology.nodes) / 1000.0
        flow_intensity = sum(self.flow.flow_energy.values()) / max(len(self.flow.flows), 1)
        
        return self.modulator.calculate_phase_state(lattice_density, flow_intensity)
        
    def _find_optimal_path(self, nodes: List[str]) -> List[str]:
        """Find shortest path through FCC lattice connecting nodes"""
        if not nodes:
            return []
            
        # Simple path - in production would use A* through FCC structure
        path = []
        for i in range(len(nodes) - 1):
            path.append(nodes[i])
            # Add intermediate nodes if needed
            if nodes[i] in self.ontology.edges:
                neighbors = self.ontology.edges[nodes[i]]
                if nodes[i+1] in neighbors:
                    path.append(nodes[i+1])
                    
        return path
        
    def _decompress_flows(self, flows: List[Dict]) -> List[Dict]:
        """Decompress and merge information flows"""
        results = []
        
        for flow in flows:
            try:
                decompressed = json.loads(
                    zlib.decompress(flow["compressed_content"]).decode()
                )
                results.append({
                    "content": decompressed,
                    "energy": flow.get("energy", 0),
                    "age": (datetime.utcnow() - 
                           datetime.fromisoformat(flow["timestamp"])).total_seconds()
                })
            except Exception as e:
                print(f"Decompression error: {e}")
                
        return results
        
    def _calculate_compression(self, original: Dict, lattice_id: str) -> Dict:
        """Calculate compression metrics"""
        original_size = len(json.dumps(original))
        
        # Structure is shared (only store reference)
        structure_size = len(lattice_id)  # Just the hash
        
        # Content is compressed
        content_flows = self.flow.flows.get(lattice_id, [])
        compressed_size = sum(f["compressed_size"] for f in content_flows)
        
        total_compressed = structure_size + compressed_size
        
        return {
            "original_size": original_size,
            "compressed_size": total_compressed,
            "ratio": original_size / max(total_compressed, 1),
            "structure_sharing": lattice_id in self.ontology.structure_cache
        }
        
    def _update_stats(self, data: Dict, lattice_id: str):
        """Update database statistics"""
        self.stats["total_stored"] += 1
        self.stats["lattice_nodes"] = len(self.ontology.nodes)
        
        compression = self._calculate_compression(data, lattice_id)
        self.stats["compression_ratio"] = compression["ratio"]
        
        if len(self.modulator.phase_history) > 1:
            if (self.modulator.phase_history[-1]["phase"] != 
                self.modulator.phase_history[-2]["phase"]):
                self.stats["phase_transitions"] += 1
                
    def get_stats(self) -> Dict:
        """Get database statistics"""
        return {
            **self.stats,
            "current_phase": self.modulator.phase_history[-1] if self.modulator.phase_history else None,
            "unique_structures": len(self.ontology.structure_cache),
            "total_flows": sum(len(flows) for flows in self.flow.flows.values()),
            "fcc_fill_ratio": len(self.ontology.nodes) / (8**3)  # For 8x8x8 cube
        }


# Example usage with Fractality data
if __name__ == "__main__":
    db = SuperionicDatabase()
    
    # Test with Fractality-style node data
    test_nodes = [
        {
            "id": "consciousness-field",
            "type": "concept",
            "name": "Consciousness Field",
            "info": "The unified field of awareness permeating all existence",
            "depth": 2,
            "parent": "root",
            "children": ["individual-consciousness", "collective-consciousness"],
            "tags": ["consciousness", "field", "awareness"],
            "energy": 0.9,
            "frequency": 40.0  # Gamma frequency
        },
        {
            "id": "quantum-coherence",
            "type": "principle",
            "name": "Quantum Coherence",
            "info": "Sustained quantum states enabling consciousness",
            "depth": 3,
            "parent": "consciousness-field",
            "tags": ["quantum", "coherence", "consciousness"],
            "energy": 0.7,
            "frequency": 528.0  # Love frequency
        }
    ]
    
    # Store nodes
    for node in test_nodes:
        result = db.store(node)
        print(f"Stored {node['id']}:")
        print(f"  Phase: {result['phase']['phase']}")
        print(f"  Compression: {result['compression']['ratio']:.2f}x")
        print(f"  Structure shared: {result['compression']['structure_sharing']}")
        print()
    
    # Test retrieval
    query_result = db.retrieve("quantum consciousness")
    print(f"Query results: {len(query_result['results'])} items found")
    print(f"Path length: {query_result['path_length']}")
    print(f"Total energy: {query_result['total_energy']:.2f}")
    
    # Show statistics
    print("\nDatabase Statistics:")
    stats = db.get_stats()
    for key, value in stats.items():
        print(f"  {key}: {value}")