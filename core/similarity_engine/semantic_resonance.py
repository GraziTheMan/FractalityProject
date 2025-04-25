import numpy as np  
from sentence_transformers import SentenceTransformer  
from sklearn.metrics.pairwise import cosine_similarity  
import json  
from pathlib import Path  
import hashlib  

class SemanticResonance:  
    def __init__(self, mindmap_file="mindmap.json"):  
        self.mindmap_file = Path(mindmap_file)  
        self.model = SentenceTransformer('all-MiniLM-L6-v2')  
        self.embeddings = None  
        self.node_names = []  
        self._prepare_embeddings()  

    def _prepare_embeddings(self):  
        """Convert node texts to semantic embeddings"""  
        if not self.mindmap_file.exists():  
            self.embeddings = np.zeros((0, 0))  
            return  

        with open(self.mindmap_file, 'r') as f:  
            data = json.load(f)  

        self.node_names = list(data.keys())  
        node_texts = [node_data['text'] for node_data in data.values()]  
        self.embeddings = self.model.encode(node_texts)  

    def find_similar(self, query_text, top_n=3):  
        """Find semantically similar nodes"""  
        if self.embeddings.shape[0] == 0:  
            return []  

        query_embedding = self.model.encode([query_text])  
        similarities = cosine_similarity(query_embedding, self.embeddings)  
        sorted_indices = np.argsort(similarities[0])[::-1]  

        return [{  
            "node": self.node_names[idx],  
            "score": round(float(similarities[0][idx]), 3)  
        } for idx in sorted_indices[:top_n]]  

    def cache_embeddings(self):  
        """Optional: Save embeddings for faster reloads"""  
        cache_file = self.mindmap_file.with_suffix('.emb')  
        np.save(cache_file, self.embeddings)  
