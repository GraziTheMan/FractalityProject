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
    query = " ".join(parts[1:])
    
    # TF-IDF Results
    tfidf_engine = TfidfResonance(args.root)
    tfidf_results = tfidf_engine.find_similar(query)
    
    # Semantic Results
    semantic_engine = SemanticResonance(args.root)
    semantic_results = semantic_engine.find_similar(query)
    
    # Display hybrid results
    console.print("\n🌌 [bold]Hybrid Resonance Results:[/]")
    console.print("[bold cyan]TF-IDF Matches:[/]")
    for res in tfidf_results[:3]:
        console.print(f"- {res['path'].stem} ({res['score']:.2f})")
    
    console.print("\n[bold magenta]Semantic Matches:[/]")
    for res in semantic_results[:3]:
        console.print(f"- {res['path'].stem} ({res['score']:.2f})")
  
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
