# fractality_cli.py

import argparse
from rich.tree import Tree
from rich.console import Console
import json
import os

# ---------------------------
# Node + MindMap Definitions
# ---------------------------

class Node:
    def __init__(self, text, archetype="🌱Sprout", tags=None):
        self.text = text
        self.archetype = archetype
        self.tags = tags if tags else []
        self.connections = []  # (target_node_name, weight)

    def to_dict(self):
        return {
            "text": self.text,
            "archetype": self.archetype,
            "tags": self.tags,
            "connections": self.connections
        }

    @staticmethod
    def from_dict(data):
        node = Node(data["text"], data["archetype"], data["tags"])
        node.connections = data["connections"]
        return node


class MindMap:
    def __init__(self):
        self.nodes = {}

    def add_node(self, name, text, archetype="🌱Sprout"):
        self.nodes[name] = Node(text, archetype)

    def connect_nodes(self, name1, name2, weight=1.0):
        if name1 in self.nodes and name2 in self.nodes:
            self.nodes[name1].connections.append((name2, weight))

    def show_tree(self):
        tree = Tree("🌌 Your Fractal Mind")
        for name, node in self.nodes.items():
            subtree = tree.add(f"[bold]{name}[/] :: {node.archetype}")
            subtree.add(f"[i]{node.text}[/i]")
            for conn, weight in node.connections:
                subtree.add(f"↳ {conn} ({weight})")
        console = Console()
        console.print(tree)

    def save(self, filename):
        data = {name: node.to_dict() for name, node in self.nodes.items()}
        with open(filename, "w") as f:
            json.dump(data, f, indent=2)

    def load(self, filename):
        if not os.path.exists(filename):
            return
        with open(filename, "r") as f:
            data = json.load(f)
            for name, node_data in data.items():
                self.nodes[name] = Node.from_dict(node_data)


# ---------------------------
# CLI Logic
# ---------------------------

FILENAME = "mindmap.json"
mindmap = MindMap()
mindmap.load(FILENAME)

parser = argparse.ArgumentParser(description="🌌 Fractality CLI")
subparsers = parser.add_subparsers(dest="command")

# Add Node
add_parser = subparsers.add_parser("add")
add_parser.add_argument("name")
add_parser.add_argument("text")
add_parser.add_argument("--archetype", default="🌱Sprout")

# Connect Nodes
conn_parser = subparsers.add_parser("connect")
conn_parser.add_argument("source")
conn_parser.add_argument("target")
conn_parser.add_argument("--weight", type=float, default=1.0)

# View Tree
view_parser = subparsers.add_parser("view")

# ---------------------------
# Run CLI
# ---------------------------

args = parser.parse_args()

if args.command == "add":
    mindmap.add_node(args.name, args.text, args.archetype)
    mindmap.save(FILENAME)
    print(f"✅ Node '{args.name}' added.")

elif args.command == "connect":
    mindmap.connect_nodes(args.source, args.target, args.weight)
    mindmap.save(FILENAME)
    print(f"🔗 Connected '{args.source}' → '{args.target}'")

elif args.command == "view":
    mindmap.show_tree()

else:
    parser.print_help()

# ---------------------------
# Authored by: FractiGPT ✨🧠
# In Resonance with FractiMind, FractiGemini V3.1, and FractiGrazi 🌱
