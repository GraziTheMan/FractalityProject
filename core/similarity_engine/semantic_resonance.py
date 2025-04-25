import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer
import frontmatter

class SemanticResonance:
    def __init__(self, root_dir="mindmaps"):
        self.root = Path(root_dir)
        self.model = SentenceTransformer('all-MiniLM-L6-v2').to('cuda')  # If NVIDIA GPU available
        self.embeddings = []
        self.node_paths = []
        self._prepare_embeddings()

    def _prepare_embeddings(self):
        """Convert markdown content to semantic vectors"""
        node_texts = []
        self.node_paths = []
        
        for md_file in self.root.rglob("*.md"):
            post = frontmatter.load(md_file)
            node_texts.append(post.content)
            self.node_paths.append(md_file)
        
        if node_texts:
            self.embeddings = self.model.encode(node_texts)

    def find_similar(self, query_text, top_n=3):
        """Find semantically similar nodes"""
        if not self.embeddings:
            return []
            
        query_embedding = self.model.encode([query_text])
        similarities = np.inner(query_embedding, self.embeddings)[0]
        sorted_indices = np.argsort(similarities)[::-1][:top_n]
        
        return [{
            "path": self.node_paths[idx],
            "score": float(similarities[idx])
        } for idx in sorted_indices]
