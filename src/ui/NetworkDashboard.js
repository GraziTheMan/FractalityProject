// src/ui/NetworkDashboard.js

/**
 * NetworkDashboard - Displays the three consciousness networks
 * Executive (Magenta), Memory (Cyan), Sensory (Yellow)
 * Shows energy distribution and node allocation
 */
export class NetworkDashboard {
    constructor(performanceMonitor) {
        this.performanceMonitor = performanceMonitor;
        this.panel = null;
        this.visible = false;
        
        // Network display elements
        this.networkElements = {
            executive: null,
            memory: null,
            sensory: null
        };
        
        // Canvas for energy flow visualization
        this.energyCanvas = null;
        this.energyCtx = null;
        
        // Animation state
        this.animationFrame = 0;
        
        this._createPanel();
    }
    
    /**
     * Create the dashboard panel
     */
    _createPanel() {
        // Create main panel
        this.panel = document.createElement('div');
        this.panel.id = 'network-dashboard';
        this.panel.className = 'ui-panel network-dashboard';
        this.panel.innerHTML = `
            <h3>
                <span class="icon">🧠</span>
                Consciousness Networks
            </h3>
            
            <div class="network-container">
                <div class="network-item executive" id="network-executive">
                    <div class="network-header">
                        <span class="network-name">Executive</span>
                        <span class="network-energy">50%</span>
                    </div>
                    <div class="network-bar">
                        <div class="network-fill" style="width: 50%"></div>
                    </div>
                    <div class="network-stats">
                        <span class="node-count">0 nodes</span>
                        <span class="atp-level">0 ATP</span>
                    </div>
                </div>
                
                <div class="network-item memory" id="network-memory">
                    <div class="network-header">
                        <span class="network-name">Memory</span>
                        <span class="network-energy">30%</span>
                    </div>
                    <div class="network-bar">
                        <div class="network-fill" style="width: 30%"></div>
                    </div>
                    <div class="network-stats">
                        <span class="node-count">0 nodes</span>
                        <span class="atp-level">0 ATP</span>
                    </div>
                </div>
                
                <div class="network-item sensory" id="network-sensory">
                    <div class="network-header">
                        <span class="network-name">Sensory</span>
                        <span class="network-energy">20%</span>
                    </div>
                    <div class="network-bar">
                        <div class="network-fill" style="width: 20%"></div>
                    </div>
                    <div class="network-stats">
                        <span class="node-count">0 nodes</span>
                        <span class="atp-level">0 ATP</span>
                    </div>
                </div>
            </div>
            
            <div class="energy-flow-section">
                <h4>Energy Flow Patterns</h4>
                <canvas id="energy-flow-canvas" width="280" height="100"></canvas>
            </div>
            
            <div class="system-health">
                <div class="health-metric">
                    <span class="label">Coherence:</span>
                    <span class="value" id="system-coherence">100%</span>
                </div>
                <div class="health-metric">
                    <span class="label">Efficiency:</span>
                    <span class="value" id="system-efficiency">70%</span>
                </div>
                <div class="health-metric">
                    <span class="label">Temperature:</span>
                    <span class="value" id="system-temp">37.0°C</span>
                </div>
            </div>
            
            <div class="controls">
                <button class="ui-button small" id="energy-boost-btn">
                    ⚡ Energy Boost
                </button>
                <button class="ui-button small" id="balance-networks-btn">
                    ⚖️ Balance
                </button>
            </div>
        `;
        
        // Add to body
        document.body.appendChild(this.panel);
        
        // Get references to elements
        ['executive', 'memory', 'sensory'].forEach(network => {
            this.networkElements[network] = {
                container: document.getElementById(`network-${network}`),
                energy: document.querySelector(`#network-${network} .network-energy`),
                fill: document.querySelector(`#network-${network} .network-fill`),
                nodeCount: document.querySelector(`#network-${network} .node-count`),
                atpLevel: document.querySelector(`#network-${network} .atp-level`)
            };
        });
        
        // Setup canvas
        this.energyCanvas = document.getElementById('energy-flow-canvas');
        this.energyCtx = this.energyCanvas.getContext('2d');
        
        // Setup event handlers
        this._setupEventHandlers();
        
        // Apply styles
        this._applyStyles();
    }
    
    /**
     * Apply CSS styles
     */
    _applyStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .network-dashboard {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 300px;
                background: rgba(10, 10, 10, 0.95);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 20px;
                font-family: 'Inter', -apple-system, sans-serif;
                z-index: 1000;
            }
            
            .network-dashboard h3 {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 0 0 20px 0;
                font-size: 18px;
                font-weight: 600;
            }
            
            .network-dashboard .icon {
                font-size: 24px;
            }
            
            .network-container {
                display: flex;
                flex-direction: column;
                gap: 15px;
                margin-bottom: 20px;
            }
            
            .network-item {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                padding: 12px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                transition: all 0.3s ease;
            }
            
            .network-item:hover {
                background: rgba(255, 255, 255, 0.08);
                transform: translateX(-2px);
            }
            
            .network-item.executive {
                border-color: rgba(255, 0, 255, 0.3);
            }
            
            .network-item.memory {
                border-color: rgba(0, 255, 255, 0.3);
            }
            
            .network-item.sensory {
                border-color: rgba(255, 255, 0, 0.3);
            }
            
            .network-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            
            .network-name {
                font-weight: 600;
                font-size: 14px;
            }
            
            .network-item.executive .network-name {
                color: #ff00ff;
            }
            
            .network-item.memory .network-name {
                color: #00ffff;
            }
            
            .network-item.sensory .network-name {
                color: #ffff00;
            }
            
            .network-energy {
                font-size: 14px;
                font-weight: 600;
            }
            
            .network-bar {
                height: 6px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
                overflow: hidden;
                margin-bottom: 8px;
            }
            
            .network-fill {
                height: 100%;
                transition: width 0.3s ease;
                border-radius: 3px;
            }
            
            .network-item.executive .network-fill {
                background: linear-gradient(90deg, #ff00ff, #ff44ff);
            }
            
            .network-item.memory .network-fill {
                background: linear-gradient(90deg, #00ffff, #44ffff);
            }
            
            .network-item.sensory .network-fill {
                background: linear-gradient(90deg, #ffff00, #ffff44);
            }
            
            .network-stats {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                color: #94a3b8;
            }
            
            .energy-flow-section {
                margin-bottom: 20px;
            }
            
            .energy-flow-section h4 {
                font-size: 14px;
                margin-bottom: 10px;
                color: #cbd5e1;
            }
            
            #energy-flow-canvas {
                width: 100%;
                height: 100px;
                background: rgba(0, 0, 0, 0.3);
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .system-health {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
                margin-bottom: 20px;
            }
            
            .health-metric {
                text-align: center;
                padding: 10px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 6px;
            }
            
            .health-metric .label {
                display: block;
                font-size: 11px;
                color: #64748b;
                margin-bottom: 4px;
            }
            
            .health-metric .value {
                display: block;
                font-size: 16px;
                font-weight: 600;
                color: #e2e8f0;
            }
            
            .controls {
                display: flex;
                gap: 10px;
            }
            
            .ui-button.small {
                padding: 8px 16px;
                font-size: 13px;
                flex: 1;
            }
            
            .network-dashboard.hidden {
                display: none;
            }
        `;
        document.head.appendChild(style);
    }
    
    /**
     * Setup event handlers
     */
    _setupEventHandlers() {
        // Energy boost button
        document.getElementById('energy-boost-btn').addEventListener('click', () => {
            this._triggerEnergyBoost();
        });
        
        // Balance networks button
        document.getElementById('balance-networks-btn').addEventListener('click', () => {
            this._balanceNetworks();
        });
        
        // Network item clicks
        ['executive', 'memory', 'sensory'].forEach(network => {
            this.networkElements[network].container.addEventListener('click', () => {
                this._focusNetwork(network);
            });
        });
    }
    
    /**
     * Initialize the dashboard
     */
    init() {
        this.visible = true;
        this.panel.classList.remove('hidden');
        this._startEnergyFlowAnimation();
    }
    
    /**
     * Update dashboard with consciousness data
     */
    update(consciousnessStats) {
        if (!consciousnessStats || !this.visible) return;
        
        // Update network stats
        if (consciousnessStats.networks) {
            Object.entries(consciousnessStats.networks).forEach(([network, stats]) => {
                const elements = this.networkElements[network];
                if (!elements) return;
                
                // Update energy percentage
                const totalEnergy = Object.values(consciousnessStats.networks)
                    .reduce((sum, n) => sum + n.energy, 0);
                const percentage = totalEnergy > 0 ? 
                    Math.round((stats.energy / totalEnergy) * 100) : 0;
                
                elements.energy.textContent = `${percentage}%`;
                elements.fill.style.width = `${percentage}%`;
                
                // Update node count
                elements.nodeCount.textContent = `${stats.nodes} nodes`;
                
                // Update ATP level
                const atpDisplay = stats.energy > 1000 ? 
                    `${(stats.energy / 1000).toFixed(1)}k ATP` : 
                    `${Math.round(stats.energy)} ATP`;
                elements.atpLevel.textContent = atpDisplay;
            });
        }
        
        // Update system health metrics
        if (consciousnessStats.metabolicRate !== undefined) {
            document.getElementById('system-efficiency').textContent = 
                `${Math.round(consciousnessStats.metabolicRate * 70)}%`;
        }
        
        if (consciousnessStats.temperature !== undefined) {
            document.getElementById('system-temp').textContent = 
                `${consciousnessStats.temperature.toFixed(1)}°C`;
        }
        
        if (consciousnessStats.healthPercentage !== undefined) {
            document.getElementById('system-coherence').textContent = 
                `${Math.round(consciousnessStats.healthPercentage)}%`;
        }
        
        // Update performance metrics from monitor
        if (this.performanceMonitor) {
            const perfStats = this.performanceMonitor.getSummary();
            // Could add performance-related displays here
        }
    }
    
    /**
     * Start energy flow animation
     */
    _startEnergyFlowAnimation() {
        const animate = () => {
            if (!this.visible) return;
            
            this._drawEnergyFlow();
            this.animationFrame++;
            
            requestAnimationFrame(animate);
        };
        
        animate();
    }
    
    /**
     * Draw energy flow visualization
     */
    _drawEnergyFlow() {
        const ctx = this.energyCtx;
        const width = this.energyCanvas.width;
        const height = this.energyCanvas.height;
        
        // Clear with fade effect
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, width, height);
        
        // Draw energy waves for each network
        const networks = [
            { name: 'executive', color: '#ff00ff', offset: 0 },
            { name: 'memory', color: '#00ffff', offset: height / 3 },
            { name: 'sensory', color: '#ffff00', offset: 2 * height / 3 }
        ];
        
        networks.forEach(network => {
            ctx.strokeStyle = network.color;
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            
            for (let x = 0; x < width; x += 2) {
                const y = network.offset + height / 6 + 
                    Math.sin((x / 50) + (this.animationFrame / 20)) * 10 +
                    Math.sin((x / 30) + (this.animationFrame / 15)) * 5;
                
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.stroke();
        });
        
        ctx.globalAlpha = 1;
    }
    
    /**
     * Trigger energy boost animation
     */
    _triggerEnergyBoost() {
        // Visual feedback
        this.panel.style.animation = 'pulse 0.5s ease';
        setTimeout(() => {
            this.panel.style.animation = '';
        }, 500);
        
        // Emit event
        window.dispatchEvent(new CustomEvent('fractality:energyBoost'));
    }
    
    /**
     * Balance networks animation
     */
    _balanceNetworks() {
        // Animate all bars to equal distribution
        const equalPercentage = 33.33;
        
        ['executive', 'memory', 'sensory'].forEach((network, index) => {
            const elements = this.networkElements[network];
            
            setTimeout(() => {
                elements.fill.style.width = `${equalPercentage}%`;
                elements.energy.textContent = `${Math.round(equalPercentage)}%`;
            }, index * 100);
        });
        
        // Emit event
        window.dispatchEvent(new CustomEvent('fractality:balanceNetworks'));
    }
    
    /**
     * Focus on specific network
     */
    _focusNetwork(network) {
        // Highlight selected network
        ['executive', 'memory', 'sensory'].forEach(n => {
            this.networkElements[n].container.classList.toggle('focused', n === network);
        });
        
        // Emit event
        window.dispatchEvent(new CustomEvent('fractality:focusNetwork', { 
            detail: { network } 
        }));
    }
    
    /**
     * Toggle visibility
     */
    toggle() {
        this.visible = !this.visible;
        this.panel.classList.toggle('hidden', !this.visible);
    }
    
    /**
     * Show the dashboard
     */
    show() {
        this.visible = true;
        this.panel.classList.remove('hidden');
    }
    
    /**
     * Hide the dashboard
     */
    hide() {
        this.visible = false;
        this.panel.classList.add('hidden');
    }
    
    /**
     * Destroy the dashboard
     */
    destroy() {
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel);
        }
    }
}