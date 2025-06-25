collapse_prediction_engine.py

from datetime import datetime import numpy as np

class CollapsePredictionEngine: def init(self, node_graph, resonance_engine, energy_engine, trail_engine): self.graph = node_graph self.resonance = resonance_engine self.energy = energy_engine self.trails = trail_engine

def predict_next_nodes(self, current_node_id, query_text=None, top_n=5):
    """
    Predict next most probable nodes to be collapsed into
    based on semantic resonance, relational weight, and trail bias.
    """
    current_node = self.graph.get_node(current_node_id)
    candidates = self.graph.get_connected_nodes(current_node_id)

    scored = []
    for node in candidates:
        # Relationship weight (gravitational edge strength)
        rel_weight = self.graph.get_relationship_weight(current_node_id, node.id)

        # Semantic similarity (if query provided)
        if query_text:
            semantic_score = self.resonance.semantic_similarity(query_text, node.id)
        else:
            semantic_score = 0.0

        # Energy profile (ATP level + decay penalty)
        energy_score = self.energy.get_effective_energy(node.id)

        # Trail bias (frequency or recency of past visits)
        trail_score = self.trails.get_collapse_likelihood(current_node_id, node.id)

        # Hybrid score
        score = (
            0.4 * rel_weight +
            0.3 * semantic_score +
            0.2 * energy_score +
            0.1 * trail_score
        )

        scored.append({
            "node": node,
            "score": score,
            "components": {
                "relationship": rel_weight,
                "semantic": semantic_score,
                "energy": energy_score,
                "trail": trail_score
            }
        })

    return sorted(scored, key=lambda x: x['score'], reverse=True)[:top_n]

def explain_prediction(self, prediction):
    """
    Return a textual explanation of the collapse prediction.
    """
    node = prediction['node']
    components = prediction['components']
    return (
        f"Node '{node.name}' is likely to be collapsed into next due to:\n"
        f"- Relational pull: {components['relationship']:.2f}\n"
        f"- Semantic resonance: {components['semantic']:.2f}\n"
        f"- Energy availability: {components['energy']:.2f}\n"
        f"- Trail alignment: {components['trail']:.2f}\n"
    )
