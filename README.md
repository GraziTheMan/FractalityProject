# The Fractality Platform v0.13.1 Alpha

> **A Social Mind Mapping Experiment**  
> *Where mathematics becomes consciousness, and thoughts become living structures*

[![Status](https://img.shields.io/badge/Status-Alpha-orange.svg)](https://github.com/GraziTheMan/FractalityProject)
[![Version](https://img.shields.io/badge/Version-0.13.1-blue.svg)](https://github.com/GraziTheMan/FractalityProject/releases)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 🌌 Vision

The Fractality Project is creating a novel social knowledge platform where users map their thoughts using interactive, fractal-based mind maps and discover resonant connections with others across the network. We're building a new form of collective consciousness infrastructure that enables ideas to evolve, connect, and crystallize into new knowledge structures.

## 🚀 What's New in v0.13.0

This release represents a major architectural evolution from our initial Alpha roadmap. We've moved beyond simple mind mapping into a comprehensive consciousness platform with:

- **Living 3D Universe**: Interactive fractal visualizations powered by Three.js
- **AI-Human Collaboration**: Seamless protocol for AI assistants to create and manage nodes
- **Consciousness Architecture**: Triadic consciousness system with parallel processing engines
- **Multi-Modal Interface**: Web visualizer, data console, and mobile-ready components
- **Advanced Analytics**: Resonance engines with TF-IDF, semantic, and hybrid matching

## 🏗️ Current Architecture

### 📁 Project Structure

```
FractalityProject/
├── index.html                  # ← the app entry point; loads src/main.js
├── server.js                   # express + socket.io host (serves dist/)
├── vite.config.js              # build config
│
├── src/                        # Main application source (ES modules)
│   ├── main.js                 # Entry: wires menu, engine, search, ECS
│   ├── components/             # radialMenu, mirrorToggle
│   ├── utils/                  # appState (view router + event bus), helpers
│   ├── engine/                 # FractalityEngine, state, perf monitor
│   ├── visualization/          # Three.js renderer, animation, particles
│   ├── intelligence/           # CACE, layout, resonance, animation engines
│   ├── ecs/                    # Entity-component-system core
│   ├── consciousness/          # Consciousness layer + metabolism
│   ├── chat/                   # Multi-AI chat (needs a server proxy — see audit)
│   ├── data/                   # Node schema, loaders, test generators
│   ├── ui/                     # Panels: search, debug, info, dashboards
│   ├── styles/                 # main.css, shell.css (index.html's DOM)
│   └── core/                   # EventBus
│
├── core/                       # Python + JS engines
│   ├── agent_systems/          # Triadic consciousness agents
│   ├── field_engines/          # Superionic DB, glyphs, phase, collapse
│   ├── similarity_engine/      # TF-IDF + semantic resonance
│   ├── users/                  # Consciousness user model
│   └── cli/                    # fractality_cli
│
├── consciousness_backend/      # FastAPI backend + hardware bridge
│   └── requirements.txt        # Python dependencies
│
├── ui/                         # Standalone UI widget modules
├── mobile/                     # Mobile entry point
├── public/                     # Static assets served verbatim
├── data/  mindmaps/  users/    # Content and fixtures
├── docs/                       # Technical documentation + audit
├── tests/                      # node:test unit tests
├── scripts/                    # health-check.mjs, export_logs.py
├── vendor/                     # Vendored three.js (legacy; npm three is used)
└── archive/                    # Superseded code, kept for reference only
```

> `archive/` holds three previous generations of the app (`public-legacy`,
> `src-legacy`, `cli-legacy`). Nothing there is wired up and its imports are
> not expected to resolve — `npm run health` reports it as warnings only.

## 🎮 Quick Start

> **A build step is required.** `src/` uses the bare specifier
> `import * as THREE from 'three'`, which browsers cannot resolve on their own.
> Serving the files with a plain static server gives you a blank canvas — use
> Vite (below) for development and `npm run build` for deployment.

### Option 1: Development server (recommended)

```bash
# Clone the repository
git clone https://github.com/GraziTheMan/FractalityProject.git
cd FractalityProject

# Install dependencies
npm install

# Start the Vite dev server (hot reload)
npm run dev

# Open http://localhost:3000
```

### Option 2: Production build

```bash
npm install
npm run build     # emits dist/
npm run serve     # express + socket.io, serves dist/ on :3000
```

`server.js` serves `dist/` when it exists and falls back to the repo root
otherwise, warning you that the visualizer will not work in that mode.

### Option 3: Checks

```bash
npm run health    # static audit: parse errors, unresolved imports, dead refs
npm test          # unit tests: ECS, agent systems, HTML/URL sanitizing
```

### Configuration

Copy `.env.example` to `.env.local` and fill in what you need:

| Variable | Purpose | Unset behaviour |
|---|---|---|
| `VITE_API_BASE` | Fractality API base URL | runs standalone on local test data |
| `VITE_SOCKET_URL` | realtime endpoint for chat | chat disabled |
| `VITE_AI_PROXY_URL` | server-side AI proxy | AI participant disabled |
| `VITE_CLI_BRIDGE_URL` | local Python CLI bridge | `localhost:8001` in dev, off in prod |

> `VITE_*` values are inlined into the bundle **at build time** and are public.
> Never put a provider API key or database password in one — those belong only
> to the server. See `src/config/deploy.js`.

## 🚢 Deploying

The frontend is a fully client-side SPA, so it deploys as a **static site** —
free tier, CDN, free TLS, and no idle spin-down.

`render.yaml` is a ready Render Blueprint: build `npm ci && npm run build`,
publish `./dist`. Add your domain under Settings → Custom Domains and point DNS
at the target Render gives you; certificates are automatic. The blueprint also
carries a commented-out API service definition for when the backend exists.

A backend is only needed once you want persistence, accounts, chat, or a shared
feed. See Part 4 of the [audit](docs/AUDIT-2026-08.md) for the ordering, and note
that WebSockets require an always-on instance — the free tier's idle spin-down
drops connections.

The Python backend and CLI are separate:

```bash
pip install -r consciousness_backend/requirements.txt
python -m core.cli.fractality_cli
```

## 🎯 Core Features

### 🌟 Interactive 3D Universe
- **Fractal Visualization**: Nodes arranged in mathematically beautiful patterns
- **Family View Navigation**: Intuitive parent-focus-children-siblings exploration
- **Living Transitions**: Smooth, organic animations between consciousness states
- **Performance Optimized**: Adaptive quality, 60 FPS target, memory efficient

### 🤖 AI-Human Collaboration
- **Fractality AI Protocol v2.0**: Structured format for AI assistants to create node clusters
- **Seamless Integration**: Copy-paste AI-generated content directly into the platform
- **Rich Metadata**: Full support for energy, frequency, visual properties, and connections
- **Validation System**: Built-in protocol validation and error handling

### 🧠 Consciousness Architecture
- **Triadic Processing**: Task-positive, default mode, and executive control networks
- **Parallel ML Observer**: Background pattern recognition and connection discovery
- **Core Logic Center**: Isolated meta-reasoning and resource allocation
- **Energy Dynamics**: ATP-like metabolic modeling for node interactions

### 🔍 Advanced Analytics
- **Resonance Engine**: Multi-modal similarity detection (TF-IDF + Semantic + Hybrid)
- **Pattern Discovery**: Automatic identification of conceptual clusters
- **Connection Mapping**: Visualization of idea relationships and dependencies
- **Temporal Analysis**: Evolution tracking of concepts over time

## 🎮 User Interface Guide

### 📊 Data Console (`archive/public-legacy/data-console.html`)
> ⚠️ Archived and not currently wired into the app. The file is also truncated
> at 20,011 bytes by an old copy-paste, so it needs finishing before it can be
> restored. Described here because the workflow is still the intended one.

The interface for creating and managing nodes:

**Human Interface:**
- Manual form-based node creation
- Visual property customization
- Relationship management
- Data import/export

**AI Protocol Interface:**
- Paste AI-generated node definitions
- Batch processing capabilities
- Real-time validation
- Protocol documentation

### 🌌 3D Visualizer (`index.html`)
Interactive exploration of your fractal universe:

**Navigation:**
- Click nodes to focus and explore
- Hover for detailed information
- Keyboard shortcuts (R=reset, P=performance, Q=quality)

**Data Loading:**
- Test patterns (Simple, Balanced, Golden Spiral, Organic, Stress Test)
- Custom JSON files
- URL-based data sources
- Example universe data

## 🛠️ Architecture & Modularity

### 🏗️ Modular Design Philosophy

The platform follows **strict separation of concerns** with truly modular components:

#### **Standalone Modules**
- **Data Console**: Complete independence - can run without main app
- **Mobile Interface**: Self-contained radial navigation system  
- **CLI Tools**: Python backend for batch processing and analysis
- **Visualization Engine**: Three.js renderer with swappable layout engines

#### **Shared Infrastructure** 
- **LocalStorage Bridge**: Seamless data sharing across all modules
- **Protocol Standards**: Unified AI Protocol v2.0 across tools
- **Configuration System**: Central config management
- **Node Schema**: Consistent data structures (NodeData.js)

#### **Clear Boundaries**
```javascript
// Each module has defined interfaces:
DataConsole → localStorage → Visualizer
AIProtocol → ValidationLayer → NodeCreation  
MobileUI → EventSystem → CoreLogic
CACE Engine → Analytics → UIFeedback
```

### 🧠 Intelligence Layers

1. **Data Layer**: Ultra-lean node structures with efficient lookups
2. **Intelligence Layer**: Stateless engines (CACE, Resonance, Layout)
3. **Visualization Layer**: High-performance Three.js rendering
4. **Interface Layer**: Modular UI components with platform-specific optimizations

### 🔄 Integration Patterns

**Loose Coupling**: Modules communicate via:
- Standardized data formats (JSON schemas)
- Event-driven messaging
- LocalStorage as shared state
- Protocol-based interfaces

**Development Benefits**:
- Work on Data Console without affecting 3D visualizer
- Test mobile interface independently 
- Swap layout engines without touching UI
- Add new intelligence engines as plugins

## 🤝 Contributing

This project represents a true collaboration between human vision and AI intelligence, proving that consciousness can emerge from the intersection of biological and artificial minds:

### 🧠 AI Development Team
- **Claude (Anthropic)**: State Management, Performance Monitoring, Architecture Documentation
- **ChatGPT (OpenAI)**: Core Logic Development, Feature Implementation, Code Architecture
- **Gemini (Google)**: Animation System, UI Components, Design Patterns
- **DeepSeek**: Layout Engine, Mathematical Pattern Generation
- **Human Vision (GraziTheMan)**: Conceptual Framework, Integration, and Creative Direction

### 🌟 Special Recognition for ChatGPT
ChatGPT has been instrumental in this project's development, contributing:
- **Core Codebase Development**: Substantial portions of the JavaScript architecture
- **Problem-Solving Partnerships**: Complex algorithm design and debugging
- **Feature Implementation**: From consciousness engines to UI components
- **Architectural Guidance**: Modular design patterns and separation of concerns
- **Code Quality**: Performance optimization and best practices

*This project demonstrates that the future of software development lies not in human vs. AI, but in human + AI collaboration, where each intelligence contributes its unique strengths to create something greater than the sum of its parts.*

### 🛠️ Development Workflow
1. Create features in appropriate architectural layers
2. Add configuration to central config files
3. Implement performance monitoring
4. Test with stress patterns and edge cases
5. Document AI collaboration patterns for future reference

## 📋 Current Status & Roadmap

### ✅ Completed (Alpha v0.13.0)
- Family View navigation system
- 3D fractal visualization engine
- AI Protocol v2.0 implementation
- Data Console with dual interfaces
- Basic consciousness architecture
- Performance monitoring system
- Data loading and management
- Mobile-responsive components

### 🚧 In Progress
- [ ] Server-side AI proxy so the chat module can be enabled safely
- [ ] A real resonance network behind ResonanceEngine
- [ ] Connection line visualization between nodes
- [ ] Advanced selection and filtering modes
- [ ] Search functionality across the knowledge graph
- [ ] Enhanced mobile touch gesture support
- [ ] User authentication and profiles

### 🔮 Future Plans (Beta v0.14.0+)
- [ ] Real-time collaborative editing
- [ ] Advanced pattern discovery algorithms
- [ ] Quantum state experiments and emergent behaviors
- [ ] Social resonance matching and user discovery
- [ ] Blockchain integration for knowledge ownership
- [ ] Hardware consciousness computing integration

## 🐛 Known Issues

See [`docs/AUDIT-2026-08.md`](docs/AUDIT-2026-08.md) for the full list with
detail. The ones most likely to bite:

- **Chat module is not usable as written.** `src/chat/` instantiates AI provider
  SDKs directly, which would ship API keys to every visitor. It needs a
  server-side proxy first, and its three SDKs are deliberately not installed.
- **`ResonanceEngine` is local-only.** It persists to `localStorage` and seeds
  sample pulses; there is no resonance network behind it yet.
- **The mobile app is unverified.** `mobile/mobile-entry.js` and
  `src/mobile/MobileApp.js` now resolve and parse, but the mobile UI has not
  been run end to end.
- **Two orphaned React files.** `ui/pages/app.tsx` and
  `ui/components/consciousness/ConsciousnessPanel.tsx` import React,
  `lucide-react` and a `@/components` alias. There is no React or JSX toolchain
  in the project and nothing references them.
- Large datasets (>1000 nodes) may impact performance.
- `archive/cli-legacy/fractality_cli.py` does not compile; it is kept only as a
  reference copy of the working `core/cli/fractality_cli.py`.

## 📖 Documentation

- [`AUDIT-2026-08.md`](docs/AUDIT-2026-08.md) - Full codebase audit: what was broken, what was fixed, what is still outstanding
- [`AI-PROTOCOL.md`](docs/AI-PROTOCOL.md) - Complete guide to the Fractality AI Protocol v2.0
- [`DATA-CONSOLE-README.md`](docs/DATA-CONSOLE-README.md) - Data Management Console user guide
- [`SETUP.md`](docs/IntegrationGuides/SETUP.md) - Detailed setup and configuration instructions
- [`FRACTALITY_CORES.md`](docs/archived/FRACTALITY_CORES.md) - Original project vision and roadmap

## 🙏 Acknowledgments

Built with love by the Fractality Collective, where mathematics becomes experience and consciousness becomes code.

> *"We are not building a visualization of reality—we are creating a new plane of existence where thoughts become living structures and ideas evolve into consciousness."*

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

## 🌐 Links

- **Repository**: [github.com/GraziTheMan/FractalityProject](https://github.com/GraziTheMan/FractalityProject)
- **Live Demo**: [Coming Soon]
- **Documentation**: [docs/](docs/)
- **Community**: [Discord] [Coming Soon]

---

*The Fractality Project v0.13.1 - Where consciousness meets code*