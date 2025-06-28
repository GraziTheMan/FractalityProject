// src/ui/LayoutSwitcher.js
// Simple UI component to switch between different layout algorithms

export class LayoutSwitcher {
    constructor(layoutEngine, fractalityEngine) {
        this.layoutEngine = layoutEngine;
        this.engine = fractalityEngine;
        this.currentLayout = 'goldenSpiral';
        this.switcher = null;
    }
    
    init() {
        // Create switcher HTML
        this.switcher = document.createElement('div');
        this.switcher.id = 'layout-switcher';
        this.switcher.className = 'layout-switcher';
        this.switcher.innerHTML = `
            <div class="switcher-header">
                <span class="material-symbols-outlined">hub</span>
                <span>Layout Engine</span>
            </div>
            <div class="layout-options">
                <button class="layout-btn active" data-layout="goldenSpiral">
                    <span class="layout-icon">🌀</span>
                    <span>Golden Spiral</span>
                </button>
                <button class="layout-btn" data-layout="fibonacciSphere">
                    <span class="layout-icon">🌐</span>
                    <span>Fibonacci Sphere</span>
                </button>
                <button class="layout-btn" data-layout="fractalTree">
                    <span class="layout-icon">🌳</span>
                    <span>Fractal Tree</span>
                </button>
                <button class="layout-btn" data-layout="cosmicWeb">
                    <span class="layout-icon">🌌</span>
                    <span>Cosmic Web</span>
                </button>
                <button class="layout-btn" data-layout="organicFlow">
                    <span class="layout-icon">🌊</span>
                    <span>Organic Flow</span>
                </button>
            </div>
            <div class="layout-settings">
                <h4>Layout Settings</h4>
                <div class="setting">
                    <label>Spacing</label>
                    <input type="range" id="layout-spacing" min="0.5" max="3" step="0.1" value="1.5">
                    <span class="value">1.5</span>
                </div>
                <div class="setting">
                    <label>Energy Influence</label>
                    <input type="range" id="energy-influence" min="0" max="1" step="0.1" value="0.5">
                    <span class="value">0.5</span>
                </div>
                <div class="setting">
                    <label>Context Bias</label>
                    <input type="range" id="context-bias" min="0" max="1" step="0.1" value="0.3">
                    <span class="value">0.3</span>
                </div>
            </div>
        `;
        
        // Add styles
        this.addStyles();
        
        // Add to document
        document.body.appendChild(this.switcher);
        
        // Setup event listeners
        this.setupEventListeners();
    }
    
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .layout-switcher {
                position: fixed;
                left: 20px;
                bottom: 100px;
                width: 250px;
                background: rgba(10, 10, 10, 0.95);
                border: 1px solid rgba(0, 255, 0, 0.3);
                border-radius: 8px;
                color: #00ff00;
                font-family: 'Segoe UI', sans-serif;
                font-size: 14px;
                z-index: 1000;
                box-shadow: 0 4px 20px rgba(0, 255, 0, 0.1);
            }
            
            .switcher-header {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px;
                border-bottom: 1px solid rgba(0, 255, 0, 0.2);
                font-weight: 600;
            }
            
            .layout-options {
                padding: 8px;
                display: grid;
                gap: 4px;
            }
            
            .layout-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: rgba(0, 255, 0, 0.05);
                border: 1px solid rgba(0, 255, 0, 0.2);
                border-radius: 4px;
                color: #00ff00;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 13px;
            }
            
            .layout-btn:hover {
                background: rgba(0, 255, 0, 0.1);
                border-color: rgba(0, 255, 0, 0.5);
                transform: translateX(2px);
            }
            
            .layout-btn.active {
                background: rgba(0, 255, 0, 0.2);
                border-color: #00ff00;
                box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
            }
            
            .layout-icon {
                font-size: 18px;
            }
            
            .layout-settings {
                padding: 12px;
                border-top: 1px solid rgba(0, 255, 0, 0.2);
            }
            
            .layout-settings h4 {
                margin: 0 0 12px 0;
                font-size: 12px;
                color: #00ff88;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .setting {
                margin-bottom: 12px;
                display: grid;
                grid-template-columns: 100px 1fr 30px;
                align-items: center;
                gap: 8px;
            }
            
            .setting label {
                font-size: 12px;
                color: rgba(0, 255, 0, 0.8);
            }
            
            .setting input[type="range"] {
                width: 100%;
                height: 4px;
                background: rgba(0, 255, 0, 0.2);
                outline: none;
                -webkit-appearance: none;
            }
            
            .setting input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 12px;
                height: 12px;
                background: #00ff00;
                border-radius: 50%;
                cursor: pointer;
            }
            
            .setting .value {
                font-size: 11px;
                text-align: right;
                color: #00ff88;
            }
        `;
        document.head.appendChild(style);
    }
    
    setupEventListeners() {
        // Layout button clicks
        const buttons = this.switcher.querySelectorAll('.layout-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const layout = btn.dataset.layout;
                this.switchLayout(layout);
                
                // Update active button
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Settings sliders
        const sliders = this.switcher.querySelectorAll('input[type="range"]');
        sliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                // Update display value
                const valueSpan = slider.parentElement.querySelector('.value');
                valueSpan.textContent = slider.value;
                
                // Update layout settings
                this.updateLayoutSettings();
            });
        });
        
        // Keyboard shortcut (L key)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'l' || e.key === 'L') {
                this.toggleVisibility();
            }
        });
    }
    
    switchLayout(layoutType) {
        console.log(`Switching to ${layoutType} layout`);
        this.currentLayout = layoutType;
        
        // Update layout engine configuration
        const config = this.getLayoutConfig(layoutType);
        this.layoutEngine.updateConfig(config);
        
        // Trigger re-layout
        this.engine.state.needsLayout = true;
    }
    
    getLayoutConfig(layoutType) {
        const baseConfig = {
            type: layoutType,
            spacing: parseFloat(document.getElementById('layout-spacing').value),
            energyInfluence: parseFloat(document.getElementById('energy-influence').value),
            contextBias: parseFloat(document.getElementById('context-bias').value)
        };
        
        // Layout-specific configurations
        const configs = {
            goldenSpiral: {
                ...baseConfig,
                spiralTightness: 0.5,
                radiusMultiplier: 100,
                angleOffset: Math.PI * (3 - Math.sqrt(5)) // Golden angle
            },
            fibonacciSphere: {
                ...baseConfig,
                sphereRadius: 200,
                distributionMethod: 'fibonacci'
            },
            fractalTree: {
                ...baseConfig,
                branchAngle: Math.PI / 6,
                branchLengthRatio: 0.7,
                levels: 5
            },
            cosmicWeb: {
                ...baseConfig,
                attractionStrength: 0.01,
                repulsionStrength: 100,
                damping: 0.9
            },
            organicFlow: {
                ...baseConfig,
                flowStrength: 0.5,
                turbulence: 0.1,
                seed: Date.now()
            }
        };
        
        return configs[layoutType] || baseConfig;
    }
    
    updateLayoutSettings() {
        // Re-apply current layout with new settings
        this.switchLayout(this.currentLayout);
    }
    
    toggleVisibility() {
        const isVisible = this.switcher.style.display !== 'none';
        this.switcher.style.display = isVisible ? 'none' : 'block';
    }
    
    getStats() {
        return {
            currentLayout: this.currentLayout,
            spacing: parseFloat(document.getElementById('layout-spacing').value),
            energyInfluence: parseFloat(document.getElementById('energy-influence').value),
            contextBias: parseFloat(document.getElementById('context-bias').value)
        };
    }
}

// Usage in main engine:
// const layoutSwitcher = new LayoutSwitcher(layoutEngine, fractalityEngine);
// layoutSwitcher.init();