// src/ui/NodeDebugPanel.js
// Simple debug panel to visualize CACE engine output

export class NodeDebugPanel {
    constructor(caceEngine) {
        this.cace = caceEngine;
        this.panel = null;
        this.isVisible = false;
        this.selectedNodeId = null;
    }
    
    init() {
        // Create panel HTML
        this.panel = document.createElement('div');
        this.panel.id = 'node-debug-panel';
        this.panel.className = 'debug-panel';
        this.panel.innerHTML = `
            <div class="panel-header">
                <h3>🧠 Node Debug Info</h3>
                <button id="close-debug">×</button>
            </div>
            <div class="panel-content">
                <div class="debug-section">
                    <h4>Basic Info</h4>
                    <div id="debug-basic-info"></div>
                </div>
                <div class="debug-section">
                    <h4>Energy & ATP</h4>
                    <div id="debug-energy">
                        <div class="energy-bar">
                            <div class="energy-fill" id="atp-bar"></div>
                            <span class="energy-label">ATP: <span id="atp-value">0</span></span>
                        </div>
                        <div class="energy-stats">
                            <div>Network: <span id="network-type">-</span></div>
                            <div>Efficiency: <span id="efficiency">0%</span></div>
                        </div>
                    </div>
                </div>
                <div class="debug-section">
                    <h4>CACE Context Score</h4>
                    <div class="context-display">
                        <div class="big-score" id="context-score">0.00</div>
                        <div class="score-breakdown">
                            <div>Descendants: <span id="score-descendants">0</span></div>
                            <div>Connections: <span id="score-connections">0</span></div>
                            <div>Access Score: <span id="score-access">0</span></div>
                        </div>
                    </div>
                </div>
                <div class="debug-section">
                    <h4>Resonance</h4>
                    <div id="debug-resonance">
                        <div>Semantic: <span id="semantic-score">0.0</span></div>
                        <div>TF-IDF: <span id="tfidf-score">0.0</span></div>
                    </div>
                </div>
            </div>
        `;
        
        // Add styles
        this.addStyles();
        
        // Add to document
        document.body.appendChild(this.panel);
        
        // Setup event listeners
        this.setupEventListeners();
    }
    
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .debug-panel {
                position: fixed;
                right: 20px;
                top: 100px;
                width: 300px;
                background: rgba(0, 0, 0, 0.9);
                border: 1px solid #00ff00;
                border-radius: 8px;
                color: #00ff00;
                font-family: monospace;
                font-size: 12px;
                z-index: 1000;
                display: none;
            }
            
            .debug-panel.visible {
                display: block;
            }
            
            .panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                border-bottom: 1px solid #00ff00;
            }
            
            .panel-header h3 {
                margin: 0;
                font-size: 14px;
            }
            
            #close-debug {
                background: none;
                border: 1px solid #00ff00;
                color: #00ff00;
                cursor: pointer;
                padding: 2px 8px;
            }
            
            .panel-content {
                padding: 10px;
            }
            
            .debug-section {
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid rgba(0, 255, 0, 0.3);
            }
            
            .debug-section:last-child {
                border-bottom: none;
            }
            
            .debug-section h4 {
                margin: 0 0 8px 0;
                font-size: 12px;
                color: #00ff88;
            }
            
            .energy-bar {
                width: 100%;
                height: 20px;
                background: rgba(0, 255, 0, 0.1);
                border: 1px solid #00ff00;
                position: relative;
                margin-bottom: 10px;
            }
            
            .energy-fill {
                height: 100%;
                background: linear-gradient(to right, #00ff00, #00ff88);
                width: 0%;
                transition: width 0.3s ease;
            }
            
            .energy-label {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: white;
                text-shadow: 0 0 2px black;
            }
            
            .big-score {
                font-size: 36px;
                text-align: center;
                color: #00ff88;
                margin: 10px 0;
                text-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
            }
            
            .score-breakdown, .energy-stats {
                display: grid;
                grid-template-columns: 1fr;
                gap: 5px;
            }
            
            .score-breakdown div, .energy-stats div {
                display: flex;
                justify-content: space-between;
            }
            
            #debug-basic-info div {
                margin-bottom: 5px;
            }
        `;
        document.head.appendChild(style);
    }
    
    setupEventListeners() {
        document.getElementById('close-debug').addEventListener('click', () => {
            this.hide();
        });
        
        // Toggle with 'D' key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'd' || e.key === 'D') {
                this.toggle();
            }
        });
    }
    
    show() {
        this.isVisible = true;
        this.panel.classList.add('visible');
    }
    
    hide() {
        this.isVisible = false;
        this.panel.classList.remove('visible');
    }
    
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
    
    updateNode(nodeId, nodeData, contextScore = 0, analysisData = {}) {
        if (!this.isVisible) return;
        
        this.selectedNodeId = nodeId;
        
        // Basic info
        document.getElementById('debug-basic-info').innerHTML = `
            <div>ID: ${nodeId}</div>
            <div>Label: ${nodeData.metadata?.label || 'Unknown'}</div>
            <div>Type: ${nodeData.metadata?.type || 'default'}</div>
            <div>Depth: ${nodeData.depth}</div>
            <div>Children: ${nodeData.children?.length || 0}</div>
        `;
        
        // Energy info
        const atp = nodeData.energy?.ATP || 1.0;
        document.getElementById('atp-value').textContent = atp.toFixed(2);
        document.getElementById('atp-bar').style.width = `${atp * 100}%`;
        document.getElementById('network-type').textContent = nodeData.energy?.network || 'default';
        document.getElementById('efficiency').textContent = `${((nodeData.energy?.efficiency || 1) * 100).toFixed(0)}%`;
        
        // CACE Context Score
        document.getElementById('context-score').textContent = contextScore.toFixed(2);
        document.getElementById('score-descendants').textContent = analysisData.descendants || 0;
        document.getElementById('score-connections').textContent = analysisData.connectionCount || 0;
        document.getElementById('score-access').textContent = (analysisData.accessScore || 0).toFixed(2);
        
        // Resonance scores
        document.getElementById('semantic-score').textContent = (nodeData.resonance?.semanticScore || 0).toFixed(2);
        document.getElementById('tfidf-score').textContent = (nodeData.resonance?.tfidfScore || 0).toFixed(2);
    }
    
    // Update from CACE engine stats
    updateFromCACE(stats) {
        if (!this.isVisible || !this.selectedNodeId) return;
        
        // You can add global CACE stats here
        console.log('CACE Stats:', stats);
    }
}

// Usage in main engine:
// const debugPanel = new NodeDebugPanel(caceEngine);
// debugPanel.init();
// 
// On node hover/select:
// debugPanel.updateNode(nodeId, nodeData, contextScore, analysisData);