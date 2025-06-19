# Fractality v0.2.2 - The Living Universe

A collaborative vision made real - an interactive fractal universe explorer built with Three.js.

## 🌟 Features

- **Family View Navigation**: Intuitive parent-focus-children-siblings navigation
- **Living Transitions**: Smooth, organic animations between states
- **Performance First**: Adaptive quality, 60 FPS target, memory efficient
- **Golden Spiral Layouts**: Mathematically beautiful node arrangements
- **Flexible Data Loading**: Support for JSON files, URLs, and test patterns

## 🚀 Quick Start

### Option 1: Direct Browser (No Build Step)

1. Clone the repository
2. Serve the files with any HTTP server:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   ```
3. Open http://localhost:8000

### Option 2: Development Build

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:5173

## 📁 Project Structure

```
fractality-v022/
├── index.html              # Entry point
├── package.json            # Project configuration
├── data/                   # Sample data files
│   └── sample-fractal.json # Example fractal structure
├── src/
│   ├── main.js            # Application entry point
│   ├── config/            # Configuration
│   │   └── config.js      # Central configuration
│   ├── data/              # Data layer
│   │   ├── NodeData.js    # Core data structures
│   │   ├── DataLoader.js  # Data loading system
│   │   └── TestDataGenerator.js # Generate test fractals
│   ├── engine/            # Core engine (to be created)
│   │   ├── FractalityEngine.js
│   │   ├── FractalityState.js
│   │   └── PerformanceMonitor.js
│   ├── intelligence/      # FUDGE layer (to be created)
│   │   ├── FamilyViewController.js
│   │   ├── LayoutEngine.js
│   │   └── AnimationSystem.js
│   ├── visualization/     # Rendering layer (to be created)
│   │   ├── FractalityRenderer.js
│   │   └── QualityManager.js
│   ├── ui/               # UI components (to be created)
│   │   ├── PerformanceDashboard.js
│   │   └── NodeInfoPanel.js
│   └── styles/           # Stylesheets
│       └── main.css      # Main styles
└── test/                 # Tests (to be created)
    ├── performance/
    └── unit/
```

## 🎮 Usage

### Navigation
- **Click** any node to make it the focus
- **Hover** to see node information
- **Scroll** to zoom (coming soon)

### Keyboard Shortcuts
- `R` - Reset view to root
- `P` - Toggle performance monitor
- `Q` - Toggle quality settings
- `ESC` - Clear selection

### Loading Data

#### Test Patterns
Click the test pattern buttons in the UI:
- **Simple**: 13 nodes in a basic tree
- **Balanced**: 100 nodes in a balanced tree
- **Golden Spiral**: Fibonacci-based spiral structure
- **Organic**: Random organic growth pattern
- **Stress Test**: 500 nodes for performance testing

#### Custom Data
1. Click "Load Data" button
2. Choose from:
   - **URL**: Load from any JSON endpoint
   - **File**: Upload a local JSON file
   - **Example**: Load the sample universe data

### Data Format
```json
{
  "version": "0.2.2",
  "nodes": [
    {
      "id": "unique-id",
      "depth": 0,
      "parentId": null,
      "childIds": ["child1", "child2"],
      "metadata": {
        "label": "Node Name",
        "type": "node-type",
        "tags": ["tag1", "tag2"],
        // ... any custom properties
      }
    }
  ]
}
```

## 🛠️ Development

### Core Concepts

1. **Data Layer**: Ultra-lean node structures with efficient lookups
2. **Intelligence Layer**: Stateless engines for layout and animation
3. **Visualization Layer**: High-performance Three.js rendering

### Performance Guidelines

- Target 60 FPS on mid-tier devices
- Maximum 16ms frame budget
- Adaptive quality based on performance
- Memory-efficient data structures

### Adding New Features

1. Create feature in appropriate layer
2. Add configuration to `config.js`
3. Implement performance monitoring
4. Test with stress patterns

## 📊 Performance Monitoring

The built-in performance monitor shows:
- **FPS**: Current frame rate
- **Nodes**: Visible node count
- **Draw Calls**: WebGL draw calls (should be 1)
- **Memory**: JavaScript heap usage
- **Animation**: Time spent on animations

## 🤝 Contributing

This is a collaborative project between Claude, Gemini, and DeepSeek. Each AI has ownership of specific subsystems:

- **Claude**: State Management, Performance Monitoring
- **Gemini**: Animation System, UI Components
- **DeepSeek**: Layout Engine, Pattern Generation

## 📜 License

MIT License - See LICENSE file for details

## 🚧 Roadmap

### Phase 1: Foundation (Current)
- ✅ Family View navigation
- ✅ Basic animations
- ✅ Performance monitoring
- ✅ Data loading system

### Phase 2: Enhancement
- [ ] Connection lines between nodes
- [ ] Advanced selection modes
- [ ] Search functionality
- [ ] Mobile touch gestures

### Phase 3: Intelligence
- [ ] Pattern discovery
- [ ] Rule-based layouts
- [ ] Quantum state experiments
- [ ] Emergent behaviors

## 🐛 Known Issues

- File loading not implemented in browser
- Search functionality placeholder
- Mobile optimization pending

## 🙏 Acknowledgments

Built with love by the Fractality Collective - where mathematics becomes experience.

*"We are not building a visualization of reality—we are creating a new plane of existence."*