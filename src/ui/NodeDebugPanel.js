// src/ui/NodeDebugPanel.js
// Mobile-first debug panel with responsive design

export class NodeDebugPanel {
    constructor(caceEngine) {
        this.cace = caceEngine;
        this.panel = null;
        this.isVisible = false;
        this.selectedNodeId = null;
        this.autoRefreshInterval = null;
        this.isCollapsed = false;
    }
    
    init() {
        // Create mobile-optimized panel HTML
        this.panel = document.createElement('div');
        this.panel.id = 'node-debug-panel';
        this.panel.className = 'debug-panel';
        this.panel.innerHTML = `
            <div class="panel-header">
                <h3>🧠 Node Debug</h3>
                <div class="header-controls">
                    <button id="collapse-debug" class="control-btn" title="Collapse">⇕</button>
                    <button id="refresh-debug" class="control-btn" title="Refresh">🔄</button>
                    <button id="close-debug" class="control-btn" title="Close">✕</button>
                </div>
            </div>
            <div class="panel-content" id="panel-content">
                <div class="debug-section">
                    <h4>📊 Basic Info</h4>
                    <div id="debug-basic-info" class="info-grid"></div>
                </div>
                <div class="debug-section">
                    <h4>⚡ Energy & ATP</h4>
                    <div id="debug-energy">
                        <div class="energy-bar">
                            <div class="energy-fill" id="atp-bar"></div>
                            <span class="energy-label">ATP: <span id="atp-value">0</span></span>
                        </div>
                        <div class="energy-stats">
                            <div class="stat-item">
                                <span class="stat-label">Network:</span>
                                <span class="stat-value" id="network-type">-</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Efficiency:</span>
                                <span class="stat-value" id="efficiency">0%</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="debug-section">
                    <h4>🎯 CACE Context</h4>
                    <div class="context-display">
                        <div class="big-score" id="context-score">0.00</div>
                        <div class="score-breakdown">
                            <div class="stat-item">
                                <span class="stat-label">Descendants:</span>
                                <span class="stat-value" id="score-descendants">0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Connections:</span>
                                <span class="stat-value" id="score-connections">0</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Access:</span>
                                <span class="stat-value" id="score-access">0</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="debug-section">
                    <h4>🔍 Resonance</h4>
                    <div id="debug-resonance" class="resonance-grid">
                        <div class="stat-item">
                            <span class="stat-label">Semantic:</span>
                            <span class="stat-value" id="semantic-score">0.0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">TF-IDF:</span>
                            <span class="stat-value" id="tfidf-score">0.0</span>
                        </div>
                    </div>
                </div>
                <div class="debug-section">
                    <h4>🔧 Server Actions</h4>
                    <div class="action-buttons">
                        <button id="refresh-cace-btn" class="action-btn">🧠 Refresh CACE</button>
                        <button id="refresh-resonance-btn" class="action-btn">🔍 Update Resonance</button>
                        <button id="toggle-auto-refresh" class="action-btn toggle-btn">🔄 Auto: OFF</button>
                    </div>
                    <div class="server-status">
                        <span class="status-label">Server:</span>
                        <span id="server-status">Checking...</span>
                    </div>
                </div>
            </div>
        `;
        
        // Add mobile-optimized styles
        this.addMobileStyles();
        
        // Add to document
        document.body.appendChild(this.panel);
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Check server status
        this.updateServerStatus();
    }
    
    addMobileStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Mobile-first debug panel styles */
            .debug-panel {
                position: fixed;
                bottom: 20px;
                left: 10px;
                right: 10px;
                max-width: calc(100vw - 20px);
                max-height: 70vh;
                background: rgba(0, 0, 0, 0.95);
                border: 2px solid #00ff00;
                border-radius: 12px;
                color: #00ff00;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace;
                font-size: 14px;
                z-index: 1000;
                display: none;
                box-shadow: 0 8px 32px rgba(0, 255, 0, 0.3);
                backdrop-filter: blur(10px);
                overflow: hidden;
            }
            
            .debug-panel.visible {
                display: flex;
                flex-direction: column;
            }
            
            .debug-panel.collapsed .panel-content {
                display: none;
            }
            
            .panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 2px solid #00ff00;
                background: rgba(0, 255, 0, 0.1);
                flex-shrink: 0;
            }
            
            .panel-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: bold;
            }
            
            .header-controls {
                display: flex;
                gap: 8px;
            }
            
            .control-btn {
                background: rgba(0, 255, 0, 0.2);
                border: 1px solid #00ff00;
                color: #00ff00;
                cursor: pointer;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 14px;
                min-width: 40px;
                min-height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            
            .control-btn:hover, .control-btn:active {
                background: rgba(0, 255, 0, 0.3);
                transform: scale(0.95);
            }
            
            .panel-content {
                padding: 16px;
                overflow-y: auto;
                flex: 1;
            }
            
            .debug-section {
                margin-bottom: 20px;
                padding: 12px;
                border: 1px solid rgba(0, 255, 0, 0.3);
                border-radius: 8px;
                background: rgba(0, 255, 0, 0.05);
            }
            
            .debug-section:last-child {
                margin-bottom: 0;
            }
            
            .debug-section h4 {
                margin: 0 0 12px 0;
                font-size: 14px;
                color: #00ff88;
                font-weight: bold;
            }
            
            .info-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 8px;
            }
            
            .stat-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 0;
                border-bottom: 1px solid rgba(0, 255, 0, 0.2);
            }
            
            .stat-item:last-child {
                border-bottom: none;
            }
            
            .stat-label {
                color: #aaa;
                font-size: 13px;
            }
            
            .stat-value {
                color: #00ff88;
                font-weight: bold;
                font-size: 14px;
            }
            
            .energy-bar {
                width: 100%;
                height: 32px;
                background: rgba(0, 255, 0, 0.1);
                border: 2px solid #00ff00;
                border-radius: 16px;
                position: relative;
                margin-bottom: 12px;
                overflow: hidden;
            }
            
            .energy-fill {
                height: 100%;
                background: linear-gradient(90deg, #00ff00, #00ff88);
                width: 0%;
                transition: width 0.5s ease;
                border-radius: 14px;
            }
            
            .energy-label {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: white;
                text-shadow: 0 0 4px black;
                font-weight: bold;
                font-size: 14px;
            }
            
            .energy-stats {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }
            
            .big-score {
                font-size: 28px;
                text-align: center;
                color: #00ff88;
                margin: 12px 0;
                text-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
                font-weight: bold;
            }
            
            .score-breakdown {
                display: grid;
                grid-template-columns: 1fr;
                gap: 8px;
            }
            
            .resonance-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }
            
            .action-buttons {
                display: grid;
                grid-template-columns: 1fr;
                gap: 12px;
                margin-bottom: 16px;
            }
            
            .action-btn {
                background: rgba(0, 255, 0, 0.1);
                border: 2px solid #00ff00;
                color: #00ff00;
                padding: 12px 16px;
                cursor: pointer;
                font-size: 14px;
                font-family: inherit;
                border-radius: 8px;
                font-weight: bold;
                min-height: 48px;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .action-btn:hover, .action-btn:active {
                background: rgba(0, 255, 0, 0.2);
                transform: scale(0.98);
            }
            
            .action-btn.active, .toggle-btn.active {
                background: rgba(0, 255, 0, 0.3);
                color: #00ff88;
                box-shadow: 0 0 20px rgba(0, 255, 0, 0.4);
            }
            
            .server-status {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                border: 1px solid rgba(0, 255, 0, 0.3);
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.3);
                font-size: 13px;
            }
            
            .status-label {
                color: #aaa;
            }
            
            #server-status.connected {
                color: #00ff88;
                font-weight: bold;
            }
            
            #server-status.disconnected {
                color: #ff8800;
                font-weight: bold;
            }
            
            /* Tablet styles */
            @media (min-width: 768px) {
                .debug-panel {
                    bottom: 20px;
                    right: 20px;
                    left: auto;
                    max-width: 400px;
                    max-height: 80vh;
                }
                
                .energy-stats {
                    grid-template-columns: 1fr 1fr;
                }
                
                .action-buttons {
                    grid-template-columns: 1fr 1fr;
                }
                
                .resonance-grid {
                    grid-template-columns: 1fr 1fr;
                }
            }
            
            /* Desktop styles */
            @media (min-width: 1024px) {
                .debug-panel {
                    max-width: 350px;
                    top: 100px;
                    bottom: auto;
                }
                
                .panel-header h3 {
                    font-size: 14px;
                }
                
                .big-score {
                    font-size: 36px;
                }
                
                .action-buttons {
                    grid-template-columns: 1fr;
                }
            }
            
            /* Accessibility improvements */
            @media (prefers-reduced-motion: reduce) {
                .energy-fill,
                .control-btn,
                .action-btn {
                    transition: none;
                }
            }
            
            /* High contrast mode */
            @media (prefers-contrast: high) {
                .debug-panel {
                    border-width: 3px;
                    background: rgba(0, 0, 0, 0.98);
                }
                
                .control-btn,
                .action-btn {
                    border-width: 2px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    setupEventListeners() {
        document.getElementById('close-debug').addEventListener('click', () => {
            this.hide();
        });
        
        document.getElementById('collapse-debug').addEventListener('click', () => {
            this.toggleCollapse();
        });
        
        document.getElementById('refresh-debug').addEventListener('click', () => {
            this.refreshFromServer();
        });
        
        document.getElementById('refresh-cace-btn').addEventListener('click', () => {
            this.refreshCACEFromServer();
        });
        
        document.getElementById('refresh-resonance-btn').addEventListener('click', () => {
            this.refreshResonanceFromServer();
        });
        
        document.getElementById('toggle-auto-refresh').addEventListener('click', () => {
            this.toggleAutoRefresh();
        });
        
        // Toggle with 'D' key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'd' || e.key === 'D') {
                this.toggle();
            }
        });
        
        // Touch-friendly swipe to close on mobile
        let startY = 0;
        this.panel.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
        });
        
        this.panel.addEventListener('touchmove', (e) => {
            const currentY = e.touches[0].clientY;
            const diff = startY - currentY;
            
            // Swipe down to close (on mobile)
            if (diff < -100 && window.innerWidth <= 768) {
                this.hide();
            }
        });
    }
    
    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        const button = document.getElementById('collapse-debug');
        
        if (this.isCollapsed) {
            this.panel.classList.add('collapsed');
            button.textContent = '⇈';
            button.title = 'Expand';
        } else {
            this.panel.classList.remove('collapsed');
            button.textContent = '⇕';
            button.title = 'Collapse';
        }
    }
    
    show() {
        this.isVisible = true;
        this.panel.classList.add('visible');
        this.updateServerStatus();
    }
    
    hide() {
        this.isVisible = false;
        this.panel.classList.remove('visible');
        this.stopAutoRefresh();
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
        
        // Basic info with mobile-friendly grid
        document.getElementById('debug-basic-info').innerHTML = `
            <div class="stat-item">
                <span class="stat-label">ID:</span>
                <span class="stat-value">${nodeId.slice(0, 8)}...</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Label:</span>
                <span class="stat-value">${nodeData.metadata?.label || 'Unknown'}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Type:</span>
                <span class="stat-value">${nodeData.metadata?.type || 'default'}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Depth:</span>
                <span class="stat-value">${nodeData.depth}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Children:</span>
                <span class="stat-value">${nodeData.children?.length || 0}</span>
            </div>
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
    
    // All server methods remain the same...
    updateFromCACE(stats) {
        if (!this.isVisible || !this.selectedNodeId) return;
        console.log('CACE Stats:', stats);
    }
    
    async updateServerStatus() {
        const statusEl = document.getElementById('server-status');
        
        if (!window.nodeBridge) {
            statusEl.textContent = 'No Bridge';
            statusEl.className = 'disconnected';
            return;
        }
        
        try {
            const connected = window.nodeBridge.isServerConnected();
            if (connected) {
                statusEl.textContent = 'Connected';
                statusEl.className = 'connected';
            } else {
                statusEl.textContent = 'Disconnected';
                statusEl.className = 'disconnected';
            }
        } catch (error) {
            statusEl.textContent = 'Error';
            statusEl.className = 'disconnected';
        }
    }
    
    async refreshFromServer() {
        if (!window.nodeBridge?.isServerConnected() || !this.selectedNodeId) {
            console.warn('Cannot refresh: no server connection or node selected');
            return;
        }
        
        try {
            const nodes = window.nodeBridge.getVisibleNodes({ id: this.selectedNodeId });
            if (nodes.length > 0) {
                const nodeData = nodes[0];
                const contextScore = this.cace ? this.cace.calculateContextScore(nodeData) : 0;
                this.updateNode(this.selectedNodeId, nodeData, contextScore);
                console.log('✅ Debug panel refreshed from server');
            }
        } catch (error) {
            console.error('Failed to refresh from server:', error);
        }
    }
    
    async refreshCACEFromServer() {
        if (!window.nodeBridge?.isServerConnected() || !this.selectedNodeId) {
            console.warn('Cannot refresh CACE: no server connection');
            return;
        }
        
        try {
            const response = await window.nodeBridge.serverFetch(`/cace/${this.selectedNodeId}`);
            const energyUpdate = {};
            energyUpdate[this.selectedNodeId] = {
                ATP: response.atp_level,
                network: response.network_assignment,
                efficiency: response.efficiency
            };
            
            window.nodeBridge.updateEnergyValues(energyUpdate);
            await this.refreshFromServer();
            console.log('✅ CACE data refreshed from server');
        } catch (error) {
            console.error('Failed to refresh CACE from server:', error);
        }
    }
    
    async refreshResonanceFromServer() {
        if (!window.nodeBridge?.isServerConnected() || !this.selectedNodeId) {
            console.warn('Cannot refresh resonance: no server connection');
            return;
        }
        
        try {
            const nodes = window.nodeBridge.getVisibleNodes({ id: this.selectedNodeId });
            if (nodes.length === 0) return;
            
            const nodeData = nodes[0];
            const nodeLabel = nodeData.metadata?.label || '';
            await window.nodeBridge.searchOnServer(nodeLabel, { limit: 1 });
            await this.refreshFromServer();
            console.log('✅ Resonance scores refreshed from server');
        } catch (error) {
            console.error('Failed to refresh resonance from server:', error);
        }
    }
    
    toggleAutoRefresh() {
        const button = document.getElementById('toggle-auto-refresh');
        
        if (this.autoRefreshInterval) {
            this.stopAutoRefresh();
            button.textContent = '🔄 Auto: OFF';
            button.classList.remove('active');
        } else {
            this.startAutoRefresh();
            button.textContent = '🔄 Auto: ON';
            button.classList.add('active');
        }
    }
    
    startAutoRefresh() {
        this.stopAutoRefresh();
        this.autoRefreshInterval = setInterval(() => {
            this.refreshFromServer();
        }, 3000);
    }
    
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }
}
