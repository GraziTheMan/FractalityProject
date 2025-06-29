import argparse
from pathlib import Path
from rich.tree import Tree
from rich.console import Console
import frontmatter  # pip install python-frontmatter
import json
import os
from typing import Dict, Optional
from similarity_engine.tfidf_resonance import TfidfResonance
from similarity_engine.semantic_resonance import SemanticResonance
from similarity_engine.engine import HybridResonance

# ---------------------------
# Markdown Node System
# ---------------------------

class Node:
    def __init__(self, filepath: Path):
        self.filepath = filepath
        self.archetype: str = "🌱Sprout"
        self.tags: list = []
        self.connections: list = []
        self.content: str = ""
        self._load()

    def _load(self):
        """Load markdown content and frontmatter"""
        if not self.filepath.exists():
            return
            
        post = frontmatter.load(self.filepath)
        self.content = post.content
        self.archetype = post.metadata.get("archetype", "🌱Sprout")
        self.tags = post.metadata.get("tags", [])
        self.connections = post.metadata.get("connections", [])

    def save(self):
        """Save node back to markdown with frontmatter"""
        post = frontmatter.Post(self.content)
        post.metadata = {
            "archetype": self.archetype,
            "tags": self.tags,
            "connections": self.connections
        }
        with open(self.filepath, "w") as f:
            f.write(frontmatter.dumps(post))

class MindMap:
    def __init__(self, root_dir: str = "mindmaps"):
        self.root = Path(root_dir)
        self.nodes: Dict[Path, Node] = {}
        self.load_all()

    def load_all(self):
        """Load all markdown nodes from directory"""
        self.nodes = {}
        for md_file in self.root.rglob("*.md"):
            self.nodes[md_file] = Node(md_file)

    def get_node(self, path: str) -> Optional[Node]:
        """Get node by relative path (e.g. 'Philosophy/Consciousness.md')"""
        full_path = (self.root / path).resolve()
        return self.nodes.get(full_path)

# ---------------------------
# CLI Logic
# ---------------------------

console = Console()
mindmap = MindMap()

parser = argparse.ArgumentParser(
    description="🌌 Fractality CLI - Markdown Mind Mapping",
    formatter_class=argparse.RawTextHelpFormatter
)
parser.add_argument(
    "--root", 
    default="mindmaps",
    help="Root directory for mindmaps (default: mindmaps)"
)

subparsers = parser.add_subparsers(dest="command")

# Add Node
add_parser = subparsers.add_parser("add", help="Create new node")
add_parser.add_argument("path", help="Path to new node (e.g. Philosophy/Consciousness.md)")

# Edit Node
edit_parser = subparsers.add_parser("edit", help="Edit node content")
edit_parser.add_argument("path", help="Path to existing node")

# Connect Nodes
conn_parser = subparsers.add_parser("connect", help="Connect two nodes")
conn_parser.add_argument("source", help="Source node path")
conn_parser.add_argument("target", help="Target node path")
conn_parser.add_argument("--weight", type=float, default=1.0,
                       help="Connection strength (0.0-1.0)")

# View Map
view_parser = subparsers.add_parser("view", help="Visualize mind map")

def main():
    args = parser.parse_args()
    global mindmap
    mindmap = MindMap(args.root)

    if args.command == "add":
        new_path = Path(args.root) / args.path
        if new_path.exists():
            console.print("[red]Error: Node already exists[/]")
            return
            
        new_path.parent.mkdir(parents=True, exist_ok=True)
        new_node = Node(new_path)
        new_node.content = f"# {new_path.stem}\n\nStart writing your thoughts here..."
        new_node.save()
        console.print(f"[green]Created node:[/] {new_path}")

    elif args.command == "edit":
        node_path = Path(args.path)
        full_path = (mindmap.root / node_path).resolve()
        if not full_path.exists():
            console.print("[red]Error: Node not found[/]")
            return
            
        os.system(f"code {full_path}")  # Open in VS Code
        mindmap.load_all()  # Reload after edit

    elif args.command == "connect":
        source = mindmap.get_node(args.source)
        target = mindmap.get_node(args.target)
        
        if not source or not target:
            console.print("[red]Error: Couldn't find nodes[/]")
            return
            
        connection = f"{args.target}@{args.weight}"
        if connection not in source.connections:
            source.connections.append(connection)
            source.save()
        console.print(f"[green]Connected:[/] {args.source} → {args.target}")

    elif args.command == "view":
        tree = Tree("🌌 [bold]Fractal Mind Map[/]", guide_style="dim")
        nodes_added = set()
        
        def add_branch(node_path: Path, parent=None):
            if node_path in nodes_added:
                return
            nodes_added.add(node_path)
            
            node = mindmap.nodes[node_path]
            branch = (parent or tree).add(
                f"[bold cyan]{node_path.stem}[/] :: {node.archetype}"
            )
            for conn in node.connections:
                target_path = (node_path.parent / conn.split("@")[0]).resolve()
                if target_path in mindmap.nodes:
                    add_branch(target_path, branch)

        for node_path in mindmap.nodes:
            if node_path not in nodes_added:
                add_branch(node_path)
                
        console.print(tree)

      elif args.command == "find":
    if len(parts) < 2:
        console.print("[red]! Please provide a search query[/]")
        return
    
    query = " ".join(parts[1:])
    try:
        engine = HybridResonance(args.root)
        results = engine.hybrid_search(query)
        
        console.print(f"\n🌐 [bold]Hybrid Resonance for '{query}':[/]")
        for i, res in enumerate(results[:5], 1):
            node = mindmap.get_node(str(res['path'].relative_to(args.root)))
            archetype = node.archetype if node else "❓Unknown"
            console.print(
                f"{i}. {archetype} [bold cyan]{res['path'].stem}[/]\n"
                f"   Hybrid: [yellow]{res['hybrid']:.2f}[/] "
                f"(TF-IDF: {res['tfidf']:.2f}, Semantic: {res['semantic']:.2f})"
            )
    except Exception as e:
        console.print(f"[red]! Search error: {str(e)}[/]")
  
    else:
        parser.print_help()

if __name__ == "__main__":
    main()



# 
# WASNT SURE WHERE TO ADD THIS SO ADDING
# AT THE END. WILL PROBABLY HAVE TO FIX


# Update for fractality_cli.py - Add this to your existing CLI file

def do_find(self, args):
    """
    Find nodes by semantic resonance
    Usage: find <query>
    Example: find cosmic consciousness
    """
    if not args:
        print("❌ Please provide a search query")
        return
    
    query = args.strip()
    print(f"🔍 Searching for nodes resonating with: '{query}'")
    
    try:
        # Use the resonance engine
        from resonance.hybrid_resonance import HybridResonance
        
        # Initialize resonance engine if not already done
        if not hasattr(self, 'resonance_engine'):
            print("Initializing resonance engine...")
            self.resonance_engine = HybridResonance(
                model_name='sentence-transformers/all-MiniLM-L6-v2',
                cache_dir='.cache/embeddings'
            )
            
            # Build index from current nodes
            self._build_resonance_index()
        
        # Perform search
        results = self.resonance_engine.find_similar(
            query=query,
            top_k=10,
            method='hybrid',  # Uses both TF-IDF and semantic
            weights={'tfidf': 0.3, 'semantic': 0.7}
        )
        
        if not results:
            print("No resonant nodes found")
            return
        
        # Display results
        print(f"\n✨ Found {len(results)} resonant nodes:\n")
        for i, (node_id, score, node_data) in enumerate(results, 1):
            print(f"{i}. {node_id} (score: {score:.3f})")
            if 'label' in node_data.get('metadata', {}):
                print(f"   📝 {node_data['metadata']['label']}")
            if 'description' in node_data.get('metadata', {}):
                desc = node_data['metadata']['description'][:100]
                if len(node_data['metadata']['description']) > 100:
                    desc += "..."
                print(f"   💭 {desc}")
            print()
        
    except ImportError:
        print("❌ Resonance engine not available. Please check your installation.")
        print("   Run: pip install sentence-transformers scikit-learn")
    except Exception as e:
        print(f"❌ Error during search: {e}")

def _build_resonance_index(self):
    """Build resonance index from current nodes"""
    print("Building resonance index...")
    
    documents = []
    for node_id, node_data in self.nodes.items():
        # Combine all text from the node
        text_parts = []
        
        # Add label
        if 'label' in node_data.get('metadata', {}):
            text_parts.append(node_data['metadata']['label'])
        
        # Add description
        if 'description' in node_data.get('metadata', {}):
            text_parts.append(node_data['metadata']['description'])
        
        # Add tags
        if 'tags' in node_data.get('metadata', {}):
            text_parts.extend(node_data['metadata']['tags'])
        
        # Create document
        if text_parts:
            documents.append({
                'id': node_id,
                'text': ' '.join(text_parts),
                'metadata': node_data
            })
    
    # Build index
    self.resonance_engine.build_index(documents)
    print(f"✅ Index built with {len(documents)} nodes")

def do_resonance_stats(self, args):
    """Show resonance engine statistics"""
    if not hasattr(self, 'resonance_engine'):
        print("Resonance engine not initialized. Run 'find' command first.")
        return
    
    stats = self.resonance_engine.get_stats()
    print("\n📊 Resonance Engine Statistics:")
    print(f"   Total indexed nodes: {stats['total_documents']}")
    print(f"   TF-IDF vocabulary size: {stats['tfidf_vocab_size']}")
    print(f"   Embedding dimension: {stats['embedding_dim']}")
    print(f"   Cache size: {stats['cache_size']} embeddings")
    print(f"   Search method: {stats['default_method']}")

# Add aliases for convenience
do_search = do_find
do_query = do_find