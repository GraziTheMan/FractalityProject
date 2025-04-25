import json
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pathlib import Path

class TfidfResonance:
    def __init__(self, mindmap_file="mindmap.json"):
        self.mindmap_file = Path(mindmap_file)
        self.vectorizer = TfidfVectorizer(stop_words='english')
        self.tfidf_matrix = None
        self.node_names = []
        self._prepare_data()

    def _prepare_data(self):
        """Load node texts and compute TF-IDF"""
        if not self.mindmap_file.exists():
            self.tfidf_matrix = np.zeros((0, 0))
            return

        with open(self.mindmap_file, 'r') as f:
            data = json.load(f)

        self.node_names = list(data.keys())
        node_texts = [node_data['text'] for node_data in data.values()]

        # Learn vocabulary and transform texts
        self.tfidf_matrix = self.vectorizer.fit_transform(node_texts)

    def find_similar(self, query_text, top_n=3):
        """Find top similar nodes to a query"""
        if self.tfidf_matrix.shape[0] == 0:
            return []

        # Transform query into TF-IDF space
        query_vec = self.vectorizer.transform([query_text])

        # Compare to all nodes
        similarities = cosine_similarity(query_vec, self.tfidf_matrix)
        sorted_indices = np.argsort(similarities[0])[::-1]

        # Return top matches
        results = []
        for idx in sorted_indices[:top_n]:
            results.append({
                "node": self.node_names[idx],
                "score": round(similarities[0][idx], 3)
            })
        return results
