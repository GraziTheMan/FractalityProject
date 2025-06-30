# node_bridge.py
# Bridge between Python CLI and JavaScript NodeSchema
# This allows the CLI to read/write nodes in a format compatible with the frontend

import json
import frontmatter
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
import hashlib

class FractalNodeBridge:
    """Converts between markdown files and JavaScript FractalNode format"""
    
    def __init__(self, mindmap_root: str = "mindmaps"):
        self.root = Path(mindmap_root) if Path(mindmap_root).is_absolute() else Path("../../mindmaps")
        self.root.mkdir(exist_ok=True)

    def markdown_to_fractal_node(self, filepath: Path) -> Dict[str, Any]:
        """Convert a markdown file to FractalNode JSON format"""
        if not filepath.exists():
            return None
            
        # Load markdown with frontmatter
        post = frontmatter.load(filepath)
        
        # Generate consistent ID from filepath
        node_id = self._generate_node_id(filepath)
        
        # Extract parent from directory structure
        parent_id = None
        if filepath.parent != self.root:
            parent_path = filepath.parent / "index.md"
            if parent_path.exists():
                parent_id = self._generate_node_id(parent_path)
        
        # Find children (other .md files in subdirectory with same name)
        children = []
        child_dir = filepath.parent / filepath.stem
        if child_dir.exists() and child_dir.is_dir():
            for child_file in child_dir.glob("*.md"):
                if child_file.stem != "index":  # Skip index files
                    children.append(self._generate_node_id(child_file))
        
        # Parse connections from frontmatter
        connections = post.metadata.get("connections", [])
        resonance_connections = []
        for conn in connections:
            if isinstance(conn, str) and "@" in conn:
                # Format: "path/to/node.md@0.8"
                parts = conn.split("@")
                target_path = self.root / parts[0]
                weight = float(parts[1]) if len(parts) > 1 else 1.0
                resonance_connections.append({
                    "targetId": self._generate_node_id(target_path),
                    "weight": weight
                })
        
        # Calculate depth from directory structure
        depth = len(filepath.relative_to(self.root).parts) - 1
        
        # Build FractalNode structure
        fractal_node = {
            "id": node_id,
            "parentId": parent_id,
            "children": children,
            "depth": depth,
            "metadata": {
                "label": filepath.stem.replace("-", " ").title(),
                "type": post.metadata.get("archetype", "default"),
                "tags": post.metadata.get("tags", []),
                "description": self._extract_description(post.content)
            },
            "energy": {
                "ATP": post.metadata.get("ATP", 1.0),
                "efficiency": post.metadata.get("efficiency", 1.0),
                "network": post.metadata.get("network", "default")
            },
            "resonance": {
                "semanticScore": post.metadata.get("semanticScore", 0.0),
                "tfidfScore": post.metadata.get("tfidfScore", 0.0),
                "connections": resonance_connections
            },
            "visual": {
                "position": post.metadata.get("position", {"x": 0, "y": 0, "z": 0}),
                "scale": post.metadata.get("scale", 1.0),
                "color": self._archetype_to_color(post.metadata.get("archetype", "default")),
                "glow": post.metadata.get("glow", 0.0)
            },
            "timestamps": {
                "created": int(filepath.stat().st_ctime * 1000),
                "modified": int(filepath.stat().st_mtime * 1000),
                "lastVisited": post.metadata.get("lastVisited", None)
            },
            # Store original content for reference
            "_content": post.content,
            "_filepath": str(filepath.relative_to(self.root))
        }
        
        return fractal_node
    
    def fractal_node_to_markdown(self, node: Dict[str, Any], filepath: Optional[Path] = None) -> str:
        """Convert FractalNode to markdown with frontmatter"""
        
        # Prepare frontmatter
        metadata = {
            "archetype": node["metadata"].get("type", "default"),
            "tags": node["metadata"].get("tags", []),
            "connections": [],
            # Energy properties
            "ATP": node["energy"].get("ATP", 1.0),
            "efficiency": node["energy"].get("efficiency", 1.0),
            "network": node["energy"].get("network", "default"),
            # Resonance scores
            "semanticScore": node["resonance"].get("semanticScore", 0.0),
            "tfidfScore": node["resonance"].get("tfidfScore", 0.0),
            # Visual properties
            "position": node["visual"].get("position", {"x": 0, "y": 0, "z": 0}),
            "scale": node["visual"].get("scale", 1.0),
            "glow": node["visual"].get("glow", 0.0),
            # Timestamps
            "lastVisited": node["timestamps"].get("lastVisited", None)
        }
        
        # Convert resonance connections back to markdown format
        for conn in node["resonance"].get("connections", []):
            target_filepath = self._find_filepath_by_id(conn["targetId"])
            if target_filepath:
                rel_path = target_filepath.relative_to(self.root)
                metadata["connections"].append(f"{rel_path}@{conn['weight']}")
        
        # Get content or create default
        content = node.get("_content", "")
        if not content and node["metadata"].get("label"):
            content = f"# {node['metadata']['label']}\n\n{node['metadata'].get('description', '')}"
        
        # Create frontmatter post
        post = frontmatter.Post(content)
        post.metadata = metadata
        
        return frontmatter.dumps(post)
    
    def export_to_json(self, output_file: Path) -> Dict[str, Any]:
        """Export all markdown nodes to unified JSON format"""
        nodes = []
        
        for md_file in self.root.rglob("*.md"):
            node = self.markdown_to_fractal_node(md_file)
            if node:
                nodes.append(node)
        
        # Create export structure matching frontend expectations
        export_data = {
            "version": "0.2.2",
            "nodes": nodes,
            "metadata": {
                "exported": datetime.now().isoformat(),
                "totalNodes": len(nodes),
                "source": "fractality-cli"
            }
        }
        
        with open(output_file, "w") as f:
            json.dump(export_data, f, indent=2)
        
        return export_data
    
    def import_from_json(self, input_file: Path) -> Dict[str, int]:
        """Import nodes from JSON to markdown files"""
        with open(input_file, "r") as f:
            data = json.load(f)
        
        results = {"created": 0, "updated": 0, "errors": []}
        
        for node_data in data.get("nodes", []):
            try:
                # Determine filepath from node structure
                filepath = self._determine_filepath(node_data)
                
                # Convert to markdown
                markdown_content = self.fractal_node_to_markdown(node_data, filepath)
                
                # Check if file exists
                exists = filepath.exists()
                
                # Ensure directory exists
                filepath.parent.mkdir(parents=True, exist_ok=True)
                
                # Write file
                with open(filepath, "w") as f:
                    f.write(markdown_content)
                
                if exists:
                    results["updated"] += 1
                else:
                    results["created"] += 1
                    
            except Exception as e:
                results["errors"].append({
                    "nodeId": node_data.get("id"),
                    "error": str(e)
                })
        
        return results
    
    def sync_resonance_scores(self, scores: Dict[str, Dict[str, float]]) -> int:
        """Update resonance scores from similarity engine results"""
        updated = 0
        
        for filepath_str, score_data in scores.items():
            filepath = self.root / filepath_str
            if filepath.exists():
                post = frontmatter.load(filepath)
                post.metadata["semanticScore"] = score_data.get("semantic", 0.0)
                post.metadata["tfidfScore"] = score_data.get("tfidf", 0.0)
                
                with open(filepath, "w") as f:
                    f.write(frontmatter.dumps(post))
                
                updated += 1
        
        return updated
    
    def _generate_node_id(self, filepath: Path) -> str:
        """Generate consistent node ID from filepath"""
        relative_path = filepath.relative_to(self.root)
        # Use hash for consistency across systems
        path_hash = hashlib.md5(str(relative_path).encode()).hexdigest()[:8]
        return f"node-{filepath.stem}-{path_hash}"
    
    def _extract_description(self, content: str, max_length: int = 200) -> str:
        """Extract description from markdown content"""
        lines = content.strip().split("\n")
        description_lines = []
        
        for line in lines:
            # Skip headers and empty lines
            if not line.strip() or line.startswith("#"):
                continue
            description_lines.append(line.strip())
            if len(" ".join(description_lines)) > max_length:
                break
        
        description = " ".join(description_lines)[:max_length]
        if len(description) == max_length:
            description += "..."
        
        return description
    
    def _archetype_to_color(self, archetype: str) -> str:
        """Map archetype to color for visualization"""
        color_map = {
            "🌱Sprout": "#90EE90",      # Light green
            "🌿Vine": "#228B22",        # Forest green
            "🌳Tree": "#8B4513",        # Saddle brown
            "🏔️Mountain": "#708090",    # Slate gray
            "⭐Star": "#FFD700",         # Gold
            "🌌Galaxy": "#4B0082",       # Indigo
            "🧠Mind": "#FF1493",         # Deep pink
            "🌊Ocean": "#0000CD",        # Medium blue
            "🔥Fire": "#FF4500",         # Orange red
            "❄️Ice": "#00CED1",          # Dark turquoise
            "default": "#00FF00"         # Lime green
        }
        return color_map.get(archetype, color_map["default"])
    
    def _determine_filepath(self, node: Dict[str, Any]) -> Path:
        """Determine filepath for a node based on its structure"""
        # If original filepath is stored, use it
        if "_filepath" in node:
            return self.root / node["_filepath"]
        
        # Otherwise, create path based on label and parent
        label = node["metadata"]["label"].lower().replace(" ", "-")
        
        if node.get("parentId"):
            # Try to find parent's path
            parent_file = self._find_filepath_by_id(node["parentId"])
            if parent_file:
                parent_dir = parent_file.parent / parent_file.stem
                return parent_dir / f"{label}.md"
        
        # Default to root level
        return self.root / f"{label}.md"
    
    def _find_filepath_by_id(self, node_id: str) -> Optional[Path]:
        """Find filepath for a given node ID"""
        for md_file in self.root.rglob("*.md"):
            if self._generate_node_id(md_file) == node_id:
                return md_file
        return None


# CLI Integration Commands
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Bridge between CLI and Frontend")
    parser.add_argument("command", choices=["export", "import", "sync"])
    parser.add_argument("--input", "-i", help="Input file")
    parser.add_argument("--output", "-o", help="Output file")
    parser.add_argument("--root", default="mindmaps", help="Mindmap root directory")
    
    args = parser.parse_args()
    
    bridge = FractalNodeBridge(args.root)
    
    if args.command == "export":
        output = Path(args.output or "fractal-export.json")
        result = bridge.export_to_json(output)
        print(f"Exported {result['metadata']['totalNodes']} nodes to {output}")
        
    elif args.command == "import":
        input_file = Path(args.input)
        if not input_file.exists():
            print(f"Error: {input_file} not found")
            exit(1)
        
        result = bridge.import_from_json(input_file)
        print(f"Created: {result['created']}, Updated: {result['updated']}")
        if result["errors"]:
            print(f"Errors: {len(result['errors'])}")
            for err in result["errors"][:5]:
                print(f"  - {err['nodeId']}: {err['error']}")
