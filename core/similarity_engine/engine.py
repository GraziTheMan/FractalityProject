import numpy as np  
from .tfidf_resonance import TfidfResonance  
from .semantic_resonance import SemanticResonance  

class ResonanceEngine:  
    def __init__(self, mindmap_file):  
        self.tfidf = TfidfResonance(mindmap_file)  
        self.semantic = SemanticResonance(mindmap_file)  

    def hybrid_search(self, query, tfidf_weight=0.3, semantic_weight=0.7):  
        tfidf_results = {res['node']: res['score']  
                        for res in self.tfidf.find_similar(query, top_n=50)}  
        semantic_results = {res['node']: res['score']  
                           for res in self.semantic.find_similar(query, top_n=50)}  

        all_nodes = set(tfidf_results.keys()) | set(semantic_results.keys())  
        hybrid_scores = []  

        for node in all_nodes:  
            tfidf_score = tfidf_results.get(node, 0)  
            semantic_score = semantic_results.get(node, 0)  
            hybrid = (tfidf_score * tfidf_weight) + (semantic_score * semantic_weight)  
            hybrid_scores.append({  
                "node": node,  
                "score": hybrid,  
                "tfidf": tfidf_score,  
                "semantic": semantic_score  
            })  

        return sorted(hybrid_scores, key=lambda x: x['score'], reverse=True)[:10]  
