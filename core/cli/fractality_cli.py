# fractality_cli_updated.py
# Updated CLI with bridge integration and working resonance search

import argparse
from pathlib import Path
from rich.tree import Tree
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
import frontmatter
import json
import os
from typing import Dict, Optional
from node_bridge import FractalNodeBridge
from similarity_engine.engine import HybridResonance

console = Console()

class FractalityCLI:
    def __init__(self, root_dir: str = "mindmaps"):
        self.root = Path(root_dir)

        self.bridge = FractalNodeBridge(root_dir)
        self.resonance = HybridResonance(root_dir)
        
    def add_node(self, path: str, archetype: str = "🌱Sprout"):
        """Create new node"""
        new_path = self.root / path

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

# In fractality_cli.py
class FractalityCLI:
    def __init__(self, root_dir: str = "mindmaps"):
        # Adjust path relative to CLI location
        if not Path(root_dir).is_absolute():
            root_dir = str(Path(__file__).parent.parent.parent / root_dir)
        
        self.root = Path(root_dir)
        self.bridge = FractalNodeBridge(root_dir)
        self.resonance = HybridResonance(root_dir)

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
        
        # Create with frontmatter
        post = frontmatter.Post(f"# {new_path.stem}\n\nStart writing your thoughts here...")
        post.metadata = {
            "archetype": archetype,
            "tags": [],
            "connections": []
        }
        
        with open(new_path, "w") as f:
            f.write(frontmatter.dumps(post))
            
        console.print(f"[green]✅ Created node:[/] {path}")
        
    def edit_node(self, path: str):
        """Edit node content"""
        node_path = self.root / path
        if not node_path.exists():
            console.print("[red]Error: Node not found[/]")
            return
            
        # Open in default editor
        editor = os.environ.get('EDITOR', 'code')
        os.system(f"{editor} {node_path}")
        
    def connect_nodes(self, source: str, target: str, weight: float = 1.0):
        """Connect two nodes"""
        source_path = self.root / source
        target_path = self.root / target
        
        if not source_path.exists() or not target_path.exists():
            console.print("[red]Error: One or both nodes not found[/]")
            return
            
        # Load source node
        post = frontmatter.load(source_path)
        
        # Add connection
        connection = f"{target}@{weight}"
        if connection not in post.metadata.get("connections", []):
            if "connections" not in post.metadata:
                post.metadata["connections"] = []
            post.metadata["connections"].append(connection)
            
            # Save
            with open(source_path, "w") as f:
                f.write(frontmatter.dumps(post))
                
            console.print(f"[green]✅ Connected:[/] {source} → {target} (weight: {weight})")
            
    def find_resonant(self, query: str, limit: int = 10):
        """Find resonant nodes using similarity engine"""
        console.print(f"\n[cyan]🔍 Searching for:[/] '{query}'")
        
        # Perform hybrid search
        results = self.resonance.hybrid_search(query)[:limit]
        
        if not results:
            console.print("[yellow]No resonant nodes found[/]")
            return
            
        # Create results table
        table = Table(title="Resonant Nodes", show_header=True)
        table.add_column("Node", style="cyan", no_wrap=True)
        table.add_column("Type", style="magenta")
        table.add_column("Score", justify="right", style="green")
        table.add_column("Match Type", style="yellow")
        
        for result in results:
            node_path = Path(result['path'])
            
            # Load node to get metadata
            try:
                post = frontmatter.load(self.root / node_path)
                archetype = post.metadata.get("archetype", "default")
            except:
                archetype = "unknown"
                
            # Determine match type
            if result['tfidf'] > result['semantic']:
                match_type = "Keyword"
            elif result['semantic'] > result['tfidf']:
                match_type = "Semantic"
            else:
                match_type = "Hybrid"
                
            table.add_row(
                str(node_path),
                archetype,
                f"{result['hybrid']:.3f}",
                match_type
            )
            
        console.print(table)
        
        # Update resonance scores in nodes
        scores = {}
        for result in results:
            scores[result['path']] = {
                'semantic': result['semantic'],
                'tfidf': result['tfidf']
            }
        updated = self.bridge.sync_resonance_scores(scores)
        console.print(f"\n[dim]Updated resonance scores for {updated} nodes[/]")
        
    def view_tree(self):
        """Display mind map as tree"""
        tree = Tree("🌌 [bold cyan]Fractality Mind Map[/]")
        
        # Build tree recursively
        def add_to_tree(parent_tree, dir_path, level=0):
            if level > 3:  # Limit depth for display
                return
                
            for item in sorted(dir_path.iterdir()):
                if item.is_file() and item.suffix == '.md':
                    # Load node metadata
                    try:
                        post = frontmatter.load(item)
                        archetype = post.metadata.get("archetype", "📄")
                        tags = post.metadata.get("tags", [])
                        tag_str = f" [dim]({', '.join(tags)})[/]" if tags else ""
                        
                        parent_tree.add(f"{archetype} {item.stem}{tag_str}")
                    except:
                        parent_tree.add(f"📄 {item.stem}")
                        
                elif item.is_dir() and not item.name.startswith('.'):
                    # Add directory
                    branch = parent_tree.add(f"📁 [bold]{item.name}[/]")
                    add_to_tree(branch, item, level + 1)
                    
        add_to_tree(tree, self.root)
        console.print(tree)
        
    def export_to_frontend(self, output_file: str = "fractal-export.json"):
        """Export all nodes for frontend consumption"""
        output_path = Path(output_file)
        result = self.bridge.export_to_json(output_path)
        
        console.print(Panel(
            f"[green]✅ Export Complete[/]\n\n"
            f"Nodes exported: {result['metadata']['totalNodes']}\n"
            f"Output file: {output_path}\n\n"
            f"To load in frontend:\n"
            f"1. Copy {output_path} to your web server\n"
            f"2. Use 'Load Data' → 'URL' → path/to/{output_file}\n"
            f"   OR\n"
            f"   Add ?cli-export={output_file} to your URL",
            title="Frontend Export",
            border_style="green"
        ))
        
    def import_from_frontend(self, input_file: str):
        """Import nodes from frontend export"""
        input_path = Path(input_file)
        if not input_path.exists():
            console.print(f"[red]Error: {input_path} not found[/]")
            return
            
        result = self.bridge.import_from_json(input_path)
        
        console.print(Panel(
            f"[green]✅ Import Complete[/]\n\n"
            f"Created: {result['created']} nodes\n"
            f"Updated: {result['updated']} nodes\n"
            f"Errors: {len(result['errors'])}",
            title="Frontend Import",
            border_style="green"
        ))
        
        if result['errors']:
            console.print("\n[yellow]Errors:[/]")
            for err in result['errors'][:5]:
                console.print(f"  - {err['nodeId']}: {err['error']}")
                
    def show_status(self):
        """Show system status"""
        # Count nodes
        total_nodes = sum(1 for _ in self.root.rglob("*.md"))
        
        # Get resonance engine status
        resonance_status = "Ready" if hasattr(self.resonance, 'tfidf') else "Not initialized"
        
        console.print(Panel(
            f"[cyan]Fractality CLI Status[/]\n\n"
            f"Root directory: {self.root}\n"
            f"Total nodes: {total_nodes}\n"
            f"Resonance engine: {resonance_status}\n"
            f"Bridge: Ready\n\n"
            f"[dim]Use 'fractality --help' for commands[/]",
            title="System Status",
            border_style="cyan"
        ))


def main():
    parser = argparse.ArgumentParser(
        description="🌌 Fractality CLI - Unified Mind Mapping System",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "--root", 
        default="mindmaps",
        help="Root directory for mindmaps (default: mindmaps)"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Add Node
    add_parser = subparsers.add_parser("add", help="Create new node")
    add_parser.add_argument("path", help="Path to new node (e.g. Philosophy/Consciousness.md)")
    add_parser.add_argument("--archetype", default="🌱Sprout", help="Node archetype")
    
    # Edit Node
    edit_parser = subparsers.add_parser("edit", help="Edit node content")
    edit_parser.add_argument("path", help="Path to existing node")
    
    # Connect Nodes
    conn_parser = subparsers.add_parser("connect", help="Connect two nodes")
    conn_parser.add_argument("source", help="Source node path")
    conn_parser.add_argument("target", help="Target node path")
    conn_parser.add_argument("--weight", type=float, default=1.0, help="Connection strength (0.0-1.0)")
    
    # Find Resonant Nodes
    find_parser = subparsers.add_parser("find", help="Find resonant nodes")
    find_parser.add_argument("query", help="Search query")
    find_parser.add_argument("--limit", type=int, default=10, help="Maximum results")
    
    # View Tree
    view_parser = subparsers.add_parser("view", help="Visualize mind map tree")
    
    # Export/Import
    export_parser = subparsers.add_parser("export", help="Export for frontend")
    export_parser.add_argument("--output", default="fractal-export.json", help="Output file")
    
    import_parser = subparsers.add_parser("import", help="Import from frontend")
    import_parser.add_argument("input", help="Input JSON file")
    
    # Status
    status_parser = subparsers.add_parser("status", help="Show system status")
    
    args = parser.parse_args()
    
    # Initialize CLI
    cli = FractalityCLI(args.root)
    
    # Execute commands
    if args.command == "add":
        cli.add_node(args.path, args.archetype)
        
    elif args.command == "edit":
        cli.edit_node(args.path)
        
    elif args.command == "connect":
        cli.connect_nodes(args.source, args.target, args.weight)
        
    elif args.command == "find":
        cli.find_resonant(args.query, args.limit)
        
    elif args.command == "view":
        cli.view_tree()
        
    elif args.command == "export":
        cli.export_to_frontend(args.output)
        
    elif args.command == "import":
        cli.import_from_frontend(args.input)
        
    elif args.command == "status":
        cli.show_status()
        
    else:
        cli.show_status()
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

