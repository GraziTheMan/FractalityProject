# Fractality v0.2.2 - Setup Guide

## 🚀 Quick Start

### Option 1: Direct Browser (No Build)

1. **Serve the files** with any HTTP server:
   ```bash
   # Python
   python -m http.server 8000
   
   # Node.js
   npx serve .
   ```

2. **Open** http://localhost:8000 in your browser

### Option 2: Development Build (Recommended)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start dev server**:
   ```bash
   npm run dev
   ```

3. **Open** http://localhost:3000 (opens automatically)

## 📁 File Structure

```
fractality-v022/
├── index.html                 # Entry point
├── package.json              # Dependencies
├── vite.config.js            # Build config
├── data/                     # Data files
│   └── sample-fractal.json   # Example universe
└── src/
    ├── main.js               # App initialization
    ├── config/
    │   └── config.js         # Central configuration
    ├── data/
    │   ├── NodeData.js       # Data structures
    │   ├── DataLoader.js     # Loading system
    │   └── TestDataGenerator.js
    ├── engine/
    │   ├── FractalityEngine.js    # Main orchestrator
    │   ├── FractalityState.js     # State management
    │   └── PerformanceMonitor.js  # Performance tracking
    ├── intelligence/
    │   ├── CACEEngine.js          # Context engine 🎂
    │   ├── FamilyViewController.js # Family metaphor
    │   ├── LayoutEngine.js        # Mathematical layouts
    │   └── AnimationSystem.js     # Living transitions
    ├── visualization/
    │   ├── FractalityRenderer.js  # Three.js rendering
    │   └── QualityManager.js      # Adaptive quality
    ├── ui/
    │   ├── PerformanceDashboard.js # Perf monitoring
    │   └── NodeInfoPanel.js        # Node details
    └── styles/
        └── main.css               # Application styles
```

## 🎮 Controls

- **Click** nodes to navigate
- **Hover** for information
- **R** - Reset to root
- **P** - Toggle performance monitor
- **Q** - Toggle quality
- **ESC** - Clear selection

## 🧪 Test Patterns

1. **Simple** (13 nodes) - Basic tree structure
2. **Balanced** (100 nodes) - Balanced tree
3. **Golden Spiral** - Fibonacci-based layout
4. **Organic** - Random growth pattern
5. **Stress Test** (500 nodes) - Performance testing

## 🎯 Key Features

### The CACE Engine 🎂
- **C**ontext **A**nd **C**omplexity **E**ngine
- Calculates importance scores
- Creates natural visual hierarchy
- Guides navigation hints

### Family View Navigation
- **Focus** - Current node (center)
- **Parent** - Behind focus
- **Siblings** - Arc below
- **Children** - Golden spiral in front

### Performance First
- Single draw call (InstancedMesh)
- Adaptive quality management
- 60 FPS target
- Real-time monitoring

## 🔧 Configuration

Edit `src/config/config.js` to customize:

```javascript
// Performance settings
performance: {
    targetFPS: 60,
    budgets: {
        desktop: { maxNodes: 1000 },
        mobile: { maxNodes: 300 }
    }
}

// Visual settings
rendering: {
    camera: { fov: 75 },
    fog: { enabled: true }
}

// Layout settings
layout: {
    familyView: {
        maxSiblings: 5,
        maxChildren: 7
    }
}
```

## 🐛 Debugging

Open browser console and type:
```javascript
fractality.app()      // Access engine
fractality.config     // View configuration
fractality.dataLoader // Access data loader
```

## 📊 Performance Tips

1. **Start small** - Test with 100 nodes first
2. **Monitor FPS** - Watch the performance dashboard
3. **Adjust quality** - Use Q key or quality button
4. **Check memory** - Keep an eye on MB usage

## 🌟 Next Steps

1. **Load your data** - Create JSON files following the format
2. **Customize layouts** - Try different mathematical patterns
3. **Adjust visuals** - Tweak colors and effects
4. **Build features** - Extend with new capabilities

## 🤝 Team Ownership

- **Claude**: State Management, Performance
- **Gemini**: Animation System, UI Components
- **DeepSeek**: Layout Engine, Mathematical Patterns

Happy exploring the fractal universe! 🌌