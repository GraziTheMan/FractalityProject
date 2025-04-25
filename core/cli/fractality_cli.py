# core/cli/fractality_cli.py

import argparse
from rich.tree import Tree
from rich.console import Console
import json
import os
from pathlib import Path
from similarity_engine.tfidf_resonance import TfidfResonance

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
        return Node(
            data["text"],
            data["archetype"],
            data.get("tags", [])
        )

class MindMap:
    def __init__(self, filename="mindmap.json"):
        self.filename = filename
        self.nodes = {}
        self.load()

    def add_node(self, name, text, archetype="🌱Sprout"):
        self.nodes[name] = Node(text, archetype)
        self.save()

    def connect_nodes(self, source, target, weight=1.0):
        if source in self.nodes and target in self.nodes:
            self.nodes[source].connections.append((target, weight))
            self.save()
            return True
        return False

    def show_tree(self):
        tree = Tree("🌌 [bold]Fractal Mind Map[/]", guide_style="dim")
        for name, node in self.nodes.items():
            branch = tree.add(
                f"[bold cyan]{name}[/] :: {node.archetype}"
            )
            branch.add(f"[italic]{node.text}[/]")
            for conn, weight in node.connections:
                branch.add(f"↳ [yellow]{conn}[/] ([magenta]{weight}[/])")
        Console().print(tree)

    def save(self):
        data = {name: node.to_dict() for name, node in self.nodes.items()}
        with open(self.filename, "w") as f:
            json.dump(data, f, indent=2)

    def load(self):
        if Path(self.filename).exists():
            with open(self.filename, "r") as f:
                data = json.load(f)
                self.nodes = {k: Node.from_dict(v) for k, v in data.items()}

# ---------------------------
# CLI Logic
# ---------------------------

def run_interactive(mindmap):
    console = Console()
    console.print("\n[bold green]🌌 Welcome to Fractality Interactive Mode![/]")
    console.print("Type 'help' for commands\n")
    
    while True:
        try:
            command = input("fractality> ").strip()
            if not command:
                continue

            parts = command.split()
            cmd = parts[0].lower()

            if cmd == "exit":
                break
                
            elif cmd == "help":
                console.print("\n[bold]COMMANDS:[/]")
                console.print("  add [name] [text] --archetype=🌱Sprout")
                console.print("  connect [source] [target] --weight=1.0")
                console.print("  view")
                console.print("  exit\n")

            elif cmd == "add":
                if len(parts) < 3:
                    raise ValueError("Missing arguments. Use: add [name] [text]")
                
                name = parts[1]
                text = " ".join(parts[2:])
                archetype = "🌱Sprout"
                
                if "--archetype=" in command:
                    archetype = command.split("--archetype=")[1].split()[0]
                    text = text.replace(f"--archetype={archetype}", "").strip()
                
                mindmap.add_node(name, text, archetype)
                console.print(f"[green]✓ Added node '{name}'[/]")

            elif cmd == "connect":
                if len(parts) < 3:
                    raise ValueError("Missing arguments. Use: connect [source] [target]")
                
                source = parts[1]
                target = parts[2]
                weight = 1.0
                
                if "--weight=" in command:
                    weight = float(command.split("--weight=")[1].split()[0])
                
                if mindmap.connect_nodes(source, target, weight):
                    console.print(f"[green]✓ Connected {source} → {target}[/]")
                else:
                    console.print("[red]! Node(s) not found[/]")

            elif cmd == "view":
                mindmap.show_tree()

            elif cmd == "find":
    query = " ".join(parts[1:])
    engine = TfidfResonance(args.file)
    results = engine.find_similar(query)
    console.print("\n🔍 TF-IDF Resonance Results:")
    for i, res in enumerate(results, 1):
        console.print(f"{i}. [bold]{res['node']}[/] (score: {res['score']})")
            
            else:
                console.print("[red]! Unknown command[/]")

        except Exception as e:
            console.print(f"[red]! Error: {str(e)}[/]")

def main():
    parser = argparse.ArgumentParser(
        description="🌌 Fractality CLI - Map Minds, Find Resonance",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "--file", 
        default="mindmap.json",
        help="Mind map JSON file"
    )
    parser.add_argument(
        "--interactive", "-i", 
        action="store_true",
        help="Enter interactive mode"
    )
    
    # Command mode arguments
    subparsers = parser.add_subparsers(dest="command", help="Commands:")
    
    # Add command
    add_parser = subparsers.add_parser("add", help="Add a node")
    add_parser.add_argument("name", help="Node name")
    add_parser.add_argument("text", help="Node content")
    add_parser.add_argument("--archetype", default="🌱Sprout", 
                          help="Node archetype emoji+name")

    # Connect command
    conn_parser = subparsers.add_parser("connect", help="Connect nodes")
    conn_parser.add_argument("source", help="Source node name")
    conn_parser.add_argument("target", help="Target node name")
    conn_parser.add_argument("--weight", type=float, default=1.0,
                           help="Connection strength 0.0-1.0")

    # View command
    subparsers.add_parser("view", help="View mind map")

    args = parser.parse_args()
    mindmap = MindMap(args.file)

    if args.interactive or not args.command:
        run_interactive(mindmap)
    else:
        console = Console()
        try:
            if args.command == "add":
                mindmap.add_node(args.name, args.text, args.archetype)
                console.print(f"[green]✓ Added node '{args.name}'[/]")
                
            elif args.command == "connect":
                if mindmap.connect_nodes(args.source, args.target, args.weight):
                    console.print(f"[green]✓ Connected {args.source} → {args.target}[/]")
                else:
                    console.print("[red]! Node(s) not found[/]")
                    
            elif args.command == "view":
                mindmap.show_tree()
                
        except Exception as e:
            console.print(f"[red]! Error: {str(e)}[/]")

if __name__ == "__main__":
    main()
