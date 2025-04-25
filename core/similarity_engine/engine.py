# similarity_engine/engine.py

import numpy as np
from pathlib import Path
from joblib import Memory  # pip install joblib
from .tfidf_resonance import TfidfResonance
from .semantic_resonance import SemanticResonance

class HybridResonance:
    def __init__(self, root_dir="mindmaps"):
        self.root = Path(root_dir)
        self.cache_dir = self.root / ".cache"
        self.cache_dir.mkdir(exist_ok=True)
        
        # Initialize with caching
        self.memory = Memory(self.cache_dir, verbose=0)
        self.tfidf_engine = TfidfResonance(self.root)
        self.semantic_engine = SemanticResonance(self.root)

    @property
    def cached_hybrid_search(self):
        """Cache decorator for hybrid search"""
        return self.memory.cache(self._raw_hybrid_search)

    def _raw_hybrid_search(self, query, tfidf_weight=0.3, semantic_weight=0.7):
        """Actual scoring logic without cache"""
        tfidf_results = {res['path']: res['score'] 
                        for res in self.tfidf_engine.find_similar(query, top_n=50)}
        semantic_results = {res['path']: res['score'] 
                           for res in self.semantic_engine.find_similar(query, top_n=50)}
        
        all_nodes = set(tfidf_results.keys()).union(semantic_results.keys())
        return [
            {
                "path": path,
                "hybrid": (tfidf_results.get(path, 0) * tfidf_weight + 
                          semantic_results.get(path, 0) * semantic_weight),
                "tfidf": tfidf_results.get(path, 0),
                "semantic": semantic_results.get(path, 0)
            }
            for path in all_nodes
        ]

    def hybrid_search(self, query, tfidf_weight=0.3, semantic_weight=0.7):
        """Public method with cached results"""
        raw_results = self.cached_hybrid_search(query, tfidf_weight, semantic_weight)
        return sorted(raw_results, key=lambda x: x['hybrid'], reverse=True)[:10]
