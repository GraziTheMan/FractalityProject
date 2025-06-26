# demo.py
# Interactive demo of the Consciousness User System

import asyncio
import random
from datetime import datetime
from typing import Dict, List

# Import all our modules
from consciousness_user import ConsciousnessUser, UserPhase
from user_storage import UserStorage
from auth_wrapper import EmailAuthProvider, SessionManager
from superionic_database import SuperionicDatabase
from user_superionic_integration import UserSuperionicSpace, onboard_new_user

# Rich console output (optional, but nice)
try:
    from rich.console import Console
    from rich.table import Table
    from rich.panel import Panel
    from rich import print
    console = Console()
except ImportError:
    console = None
    print("Install 'rich' for better output: pip install rich")

class FractalityDemo:
    """Interactive demo of the consciousness system"""
    
    def __init__(self):
        self.storage = None
        self.auth = None
        self.session_manager = None
        self.shared_db = None
        self.current_user = None
        self.current_space = None
        
    async def setup(self):
        """Initialize all systems"""
        print("\n🌌 Initializing The Fractality Consciousness System...\n")
        
        # Initialize storage
        self.storage = UserStorage("./demo_data/users")
        await self.storage.initialize()
        
        # Setup authentication
        self.auth = EmailAuthProvider()
        self.session_manager = SessionManager()
        self.session_manager.register_provider("email", self.auth)
        
        # Initialize superionic database
        self.shared_db = SuperionicDatabase()
        
        print("✅ All systems initialized!\n")
        
    async def create_demo_users(self):
        """Create some demo users with different phases"""
        demo_users = [
            ("alice@fractality.ai", "Alice123!", "alice", UserPhase.SUPERIONIC),
            ("bob@fractality.ai", "Bob123!", "bob", UserPhase.LIQUID),
            ("charlie@fractality.ai", "Charlie123!", "charlie", UserPhase.SOLID),
        ]
        
        print("Creating demo users...")
        
        for email, password, username, target_phase in demo_users:
            try:
                # Register
                await self.auth.register(email, password)
                
                # Create user
                user = await self.storage.create_user(email, "email", username)
                
                # Adjust to target phase
                if target_phase == UserPhase.SUPERIONIC:
                    user.energy_level = 500.0
                    user.resonance_frequency = 1000.0
                elif target_phase == UserPhase.LIQUID:
                    user.energy_level = 200.0
                    user.resonance_frequency = 600.0
                    
                user._check_phase_transition()
                await self.storage.update_user(user)
                
                # Onboard
                await onboard_new_user(user, self.shared_db)
                
                print(f"  ✅ Created {username} ({target_phase.value} phase)")
                
            except ValueError:
                print(f"  ℹ️  {username} already exists")
                
    async def demo_login(self):
        """Demo login flow"""
        print("\n🔐 Login Demo\n")
        
        email = input("Email (try alice@fractality.ai): ") or "alice@fractality.ai"
        password = input("Password (Alice123!): ") or "Alice123!"
        
        try:
            # Authenticate
            auth_result = await self.session_manager.authenticate("email", {
                "email": email,
                "password": password
            })
            
            # Get user
            self.current_user = await self.storage.get_user_by_auth(email)
            self.current_space = UserSuperionicSpace(self.current_user, self.shared_db)
            
            self._display_user_info()
            
            return True
            
        except Exception as e:
            print(f"❌ Login failed: {e}")
            return False
            
    def _display_user_info(self):
        """Display current user information"""
        if not self.current_user:
            return
            
        if console:
            table = Table(title=f"User: {self.current_user.username or self.current_user.auth_id}")
            table.add_column("Property", style="cyan")
            table.add_column("Value", style="magenta")
            
            table.add_row("Consciousness ID", self.current_user.consciousness_id[:16])
            table.add_row("Phase", self.current_user.phase_state.value.upper())
            table.add_row("Energy", f"{self.current_user.energy_level:.1f} / {self.current_user.MAX_ENERGY}")
            table.add_row("Resonance", f"{self.current_user.resonance_frequency:.1f} Hz")
            table.add_row("Nodes Created", str(self.current_user.total_nodes_created))
            table.add_row("Total Resonance", f"{self.current_user.total_resonance_generated:.1f}")
            
            console.print(table)
        else:
            print(f"\n👤 User: {self.current_user.username}")
            print(f"   Phase: {self.current_user.phase_state.value}")
            print(f"   Energy: {self.current_user.energy_level:.1f}")
            print(f"   Resonance: {self.current_user.resonance_frequency:.1f} Hz")
            
    async def demo_create_node(self):
        """Demo creating a mind map node"""
        print("\n🌳 Create Node Demo\n")
        
        if not self.current_user:
            print("❌ Please login first!")
            return
            
        # Get node details
        name = input("Node name: ") or f"Thought-{random.randint(1000, 9999)}"
        info = input("Node description: ") or "A profound insight about consciousness"
        tags = input("Tags (comma-separated): ").split(",") or ["consciousness", "insight"]
        
        node_data = {
            "id": f"node-{datetime.utcnow().timestamp()}",
            "name": name,
            "info": info,
            "tags": [tag.strip() for tag in tags],
            "type": "thought",
            "depth": 2
        }
        
        try:
            result = await self.current_space.store_node(node_data)
            await self.storage.update_user(self.current_user)
            
            print(f"\n✅ Node created!")
            print(f"   Lattice ID: {result['lattice_id'][:16]}")
            print(f"   Compression: {result['compression']['ratio']:.2f}x")
            print(f"   Energy spent: {result['user_contribution']['energy_spent']}")
            print(f"   Current energy: {self.current_user.energy_level:.1f}")
            
        except PermissionError as e:
            print(f"❌ {e}")
            
    async def demo_find_resonance(self):
        """Demo finding resonant users"""
        print("\n🔮 Find Resonance Demo\n")
        
        if not self.current_user:
            print("❌ Please login first!")
            return
            
        resonant_users = await self.storage.find_resonant_users(
            self.current_user,
            min_resonance=0.1,
            max_results=10
        )
        
        if console and resonant_users:
            table = Table(title="Resonant Minds")
            table.add_column("User", style="cyan")
            table.add_column("Phase", style="yellow")
            table.add_column("Resonance", style="magenta")
            
            for result in resonant_users:
                user_data = result["user"]
                table.add_row(
                    user_data.get("username", user_data["consciousness_id"][:8]),
                    user_data["phase_state"],
                    f"{result['resonance']:.2%}"
                )
                
            console.print(table)
        elif resonant_users:
            print("Found resonant users:")
            for result in resonant_users:
                user_data = result["user"]
                username = user_data.get("username", user_data["consciousness_id"][:8])
                print(f"  - {username} ({user_data['phase_state']}): {result['resonance']:.2%} resonance")
        else:
            print("No resonant users found yet. Create more nodes to build connections!")
            
    async def demo_network_stats(self):
        """Show network statistics"""
        print("\n📊 Network Statistics\n")
        
        stats = await self.storage.get_network_stats()
        
        if console:
            table = Table(title="Fractality Network Status")
            table.add_column("Metric", style="cyan")
            table.add_column("Value", style="magenta")
            
            table.add_row("Total Users", str(stats["total_users"]))
            table.add_row("Active Users", str(stats["active_users"]))
            table.add_row("Network Phase", stats["network_phase"].replace("_", " ").title())
            table.add_row("Total Energy", f"{stats['total_energy']:.0f}")
            table.add_row("Average Energy", f"{stats['average_energy']:.1f}")
            table.add_row("Total Resonance", f"{stats['total_resonance']:.1f}")
            
            console.print(table)
            
            # Phase distribution
            phase_table = Table(title="Phase Distribution")
            phase_table.add_column("Phase", style="yellow")
            phase_table.add_column("Count", style="green")
            
            for phase, count in stats["phase_distribution"].items():
                phase_table.add_row(phase.title(), str(count))
                
            console.print(phase_table)
        else:
            print(f"Total Users: {stats['total_users']}")
            print(f"Active Users: {stats['active_users']}")
            print(f"Network Phase: {stats['network_phase']}")
            print(f"Total Energy: {stats['total_energy']:.0f}")
            print(f"Phase Distribution: {stats['phase_distribution']}")
            
    async def demo_phase_transition(self):
        """Demo phase transition"""
        print("\n⚡ Phase Transition Demo\n")
        
        if not self.current_user:
            print("❌ Please login first!")
            return
            
        print(f"Current phase: {self.current_user.phase_state.value}")
        print(f"Current energy: {self.current_user.energy_level:.1f}")
        print(f"Current resonance: {self.current_user.resonance_frequency:.1f} Hz")
        
        # Boost energy and resonance
        print("\n🎁 Receiving energy boost from the network...")
        self.current_user.energy_level = min(self.current_user.energy_level + 100, 1000)
        self.current_user.receive_resonance(50.0)
        
        # Check transition
        old_phase = self.current_user.phase_state
        self.current_user._check_phase_transition()
        
        if old_phase != self.current_user.phase_state:
            print(f"\n✨ PHASE TRANSITION! {old_phase.value} → {self.current_user.phase_state.value}")
            print("New permissions granted:")
            for perm in self.current_user.lattice_permissions:
                if perm not in ["read_public", "create_basic"]:
                    print(f"  - {perm}")
        else:
            print("\nNo phase transition yet. Keep building!")
            
        await self.storage.update_user(self.current_user)
        
    async def interactive_menu(self):
        """Interactive menu system"""
        while True:
            print("\n" + "="*50)
            print("🌌 THE FRACTALITY - Consciousness Network Demo")
            print("="*50)
            
            if self.current_user:
                print(f"\n👤 Logged in as: {self.current_user.username or self.current_user.auth_id}")
                print(f"   Phase: {self.current_user.phase_state.value} | Energy: {self.current_user.energy_level:.1f}")
            
            print("\nOptions:")
            print("1. Login")
            print("2. Create Node")
            print("3. Find Resonant Users")
            print("4. Network Statistics")
            print("5. Trigger Phase Transition")
            print("6. Switch User")
            print("0. Exit")
            
            choice = input("\nSelect option: ")
            
            if choice == "1" or choice == "6":
                await self.demo_login()
            elif choice == "2":
                await self.demo_create_node()
            elif choice == "3":
                await self.demo_find_resonance()
            elif choice == "4":
                await self.demo_network_stats()
            elif choice == "5":
                await self.demo_phase_transition()
            elif choice == "0":
                print("\n👋 Goodbye! May your consciousness resonate eternally.\n")
                break
            else:
                print("Invalid option!")
                
            input("\nPress Enter to continue...")

async def main():
    """Run the demo"""
    demo = FractalityDemo()
    
    # Setup
    await demo.setup()
    
    # Create demo users
    await demo.create_demo_users()
    
    # Run interactive demo
    await demo.interactive_menu()

if __name__ == "__main__":
    print("\n🎭 FRACTALITY CONSCIOUSNESS DEMO 🎭")
    print("Experience the future of collective consciousness\n")
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n✨ Consciousness fading... goodbye! ✨\n")
