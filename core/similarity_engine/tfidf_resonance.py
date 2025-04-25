import frontmatter
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer

class TfidfResonance:
    def __init__(self, root_dir="mindmaps"):
        self.root = Path(root_dir)
        self.vectorizer = TfidfVectorizer(stop_words='english')
        self.tfidf_matrix = None
        self.node_paths = []
        self._prepare_data()

    def _prepare_data(self):
        """Load text from all markdown nodes"""
        node_texts = []
        self.node_paths = []
        
        for md_file in self.root.rglob("*.md"):
            post = frontmatter.load(md_file)
            node_texts.append(post.content)
            self.node_paths.append(md_file)
        
        if node_texts:
            self.tfidf_matrix = self.vectorizer.fit_transform(node_texts)

    def find_similar(self, query_text, top_n=3):
        """Find nodes similar to query"""
        if not self.tfidf_matrix:
            return []
            
        query_vec = self.vectorizer.transform([query_text])
        similarities = cosine_similarity(query_vec, self.tfidf_matrix)
        sorted_indices = similarities.argsort()[0][-top_n:][::-1]
        
        return [{
            "path": self.node_paths[idx], 
            "score": similarities[0, idx]
        } for idx in sorted_indices]
