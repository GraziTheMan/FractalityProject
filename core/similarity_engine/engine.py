import numpy as np
from pathlib import Path
from .tfidf_resonance import TfidfResonance
from .semantic_resonance import SemanticResonance

class HybridResonance:
    def __init__(self, root_dir="mindmaps"):
        self.root = Path(root_dir)
        self.tfidf_engine = TfidfResonance(self.root)
        self.semantic_engine = SemanticResonance(self.root)

    def hybrid_search(self, query, tfidf_weight=0.3, semantic_weight=0.7):
        """Combine TF-IDF and semantic scores into unified results"""
        # Get raw scores
        tfidf_results = {res['path']: res['score'] 
                        for res in self.tfidf_engine.find_similar(query, top_n=50)}
        semantic_results = {res['path']: res['score'] 
                           for res in self.semantic_engine.find_similar(query, top_n=50)}
        
        # Merge nodes from both results
        all_nodes = set(tfidf_results.keys()).union(semantic_results.keys())
        hybrid_scores = []
        
        for node_path in all_nodes:
            tfidf_score = tfidf_results.get(node_path, 0.0)
            semantic_score = semantic_results.get(node_path, 0.0)
            
            hybrid = (tfidf_score * tfidf_weight) + (semantic_score * semantic_weight)
            hybrid_scores.append({
                "path": node_path,
                "hybrid": hybrid,
                "tfidf": tfidf_score,
                "semantic": semantic_score
            })
        
        # Return top 10 hybrid results
        return sorted(hybrid_scores, key=lambda x: x['hybrid'], reverse=True)[:10]
