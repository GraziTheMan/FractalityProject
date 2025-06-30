// Enhanced main.js - Your existing code + SearchInterface integration
// Corrected import paths for your file structure
import { RadialMenu } from './components/radialMenu.js';              // ✅ ./public/components/
import { AppState } from './utils/appState.js';                      // ✅ ./public/utils/
import { setupMirrorToggle } from './components/mirrorToggle.js';     // ✅ ./public/components/
import { nodeBridge } from '../src/bridge/NodeBridge.js';             // ✅ ./src/bridge/
import { FractalityEngine } from '../src/engine/FractalityEngine.js'; // ✅ ./src/engine/
import { DataLoader } from '../src/data/DataLoader.js';               // ✅ ./src/data/
import { TestDataGenerator } from '../src/data/TestDataGenerator.js'; // ✅ ./src/data/

// NEW: Import search interface and debug panel (to be created in ./src/ui/)
import { SearchInterface } from '../src/ui/SearchInterface.js';
import { NodeDebugPanel } from '../src/ui/NodeDebugPanel.js';

// Initialize state indicator
document.getElementById('state-indicator').innerText = 'State: Balanced';
document.getElementById('desktop-dock').innerText = 'Desktop Dock Placeholder';

// Initialize core systems
let fractalityEngine = null;
const dataLoader = new DataLoader();
const testGenerator = new TestDataGenerator();

// NEW: Initialize search interface and debug panel
const searchInterface = new SearchInterface();
let nodeDebugPanel = null; // Initialize when CACE engine is available

// Create radial menu with original items
const menu = new RadialMenu('radial-menu', {
  items: [
    { label: '🧠 Mindmap', onClick: () => AppState.setView('mindmap') },
    { label: '👥 Social', onClick: () => AppState.setView('social') },
    { label: '📊 NodeMgr', onClick: () => AppState.setView('nodemgr') },
    { label: '🫧 Bubble', onClick: () => AppState.setView('bubble') },
    { label: '🌀 Cone', onClick: () => AppState.setView('cone') },
    { label: '💓 Conscious', onClick: () => AppState.setView('conscious') },
    { label: '⚙️ System', onClick: () => AppState.setView('system') },
    { label: '🤖 Asst', onClick: () => AppState.setView('assistant') },
    { label: '📈 Diag', onClick: () => AppState.setView('diagnostics') },
  ]
});

// Setup mirror toggle
setupMirrorToggle(menu);

// Add CLI sync status to UI
function addCLISyncStatus() {
  const stateContainer = document.querySelector('.state-container') || 
                        document.getElementById('state-indicator').parentElement;
  
  const syncStatus = document.createElement('div');
  syncStatus.className = 'cli-sync-status';
  syncStatus.innerHTML = `
    <div class="sync-indicator">
      <span class="status-dot"></span>
      <span class="status-text">CLI Disconnected</span>
    </div>
  `;
  stateContainer.appendChild(syncStatus);
}

// ENHANCED: Add search button and debug toggle to CLI controls
function addCLIControls() {
  const desktopDock = document.getElementById('desktop-dock');
  
  const cliControls = document.createElement('div');
  cliControls.className = 'cli-controls';
  cliControls.innerHTML = `
    <button id="cli-export" class="dock-button">📤 Export to CLI</button>
    <button id="cli-import" class="dock-button">📥 Import from CLI</button>
    <button id="cli-sync" class="dock-button">🔄 Auto-Sync Off</button>
    <button id="open-search" class="dock-button">🔍 Search</button>
    <button id="toggle-debug" class="dock-button">🧠 Debug</button>
    <div class="cli-status-mini">
      <span class="server-status-indicator" id="server-status-mini">🔗 Checking...</span>
    </div>
  `;
  
  desktopDock.innerHTML = ''; // Clear placeholder text
  desktopDock.appendChild(cliControls);
  
  // Setup CLI control handlers
  setupCLIHandlers();
}

// ENHANCED: Setup CLI control handlers with search integration
function setupCLIHandlers() {
  // Export handler (existing)
  document.getElementById('cli-export').addEventListener('click', exportToCLI);
  
  // Import handler (existing)
  document.getElementById('cli-import').addEventListener('click', showImportDialog);
  
  // Auto-sync toggle (existing)
  let autoSyncEnabled = false;
  document.getElementById('cli-sync').addEventListener('click', (e) => {
    autoSyncEnabled = !autoSyncEnabled;
    if (autoSyncEnabled) {
      const exportPath = prompt('Enter CLI export file path:', 'fractal-export.json');
      if (exportPath) {
        nodeBridge.enableAutoSync(exportPath);
        e.target.textContent = '🔄 Auto-Sync On';
        e.target.classList.add('active');
        updateSyncStatus('connected');
      } else {
        autoSyncEnabled = false;
      }
    } else {
      nodeBridge.disableAutoSync();
      e.target.textContent = '🔄 Auto-Sync Off';
      e.target.classList.remove('active');
      updateSyncStatus('disconnected');
    }
  });
  
  // NEW: Search interface integration
  document.getElementById('open-search').addEventListener('click', () => {
    searchInterface.show();
  });
  
  // NEW: Debug panel toggle
  document.getElementById('toggle-debug').addEventListener('click', () => {
    if (nodeDebugPanel) {
      nodeDebugPanel.toggle();
    } else {
      showNotification('Debug panel not available (CACE engine not loaded)', 'warning');
    }
  });
  
  // Update server status periodically
  setInterval(updateServerStatusMini, 5000);
}

// NEW: Update mini server status indicator
async function updateServerStatusMini() {
  const statusEl = document.getElementById('server-status-mini');
  if (!statusEl) return;
  
  if (nodeBridge.isServerConnected()) {
    try {
      const status = await nodeBridge.getServerStatus();
      statusEl.textContent = `🟢 Server (${status.total_nodes || 0} nodes)`;
      statusEl.className = 'server-status-indicator connected';
    } catch (error) {
      statusEl.textContent = '🟡 Server Error';
      statusEl.className = 'server-status-indicator error';
    }
  } else {
    statusEl.textContent = '🔴 Server Offline';
    statusEl.className = 'server-status-indicator disconnected';
  }
}

// ENHANCED: Setup bridge listeners with search integration
function setupBridgeListeners() {
  nodeBridge.on('nodesLoaded', (data) => {
    console.log('📊 Bridge: Nodes loaded', data.stats);
    updateStateIndicator('Loaded: ' + data.stats.added + ' nodes');
    if (fractalityEngine) {
      loadBridgeData();
    }
  });
  
  nodeBridge.on('resonanceUpdated', (data) => {
    console.log('🔄 Bridge: Resonance updated', data);
    updateStateIndicator('Resonance Updated');
  });
  
  nodeBridge.on('energyUpdated', (data) => {
    console.log('⚡ Bridge: Energy updated', data);
    updateStateIndicator('Energy Updated');
    
    // Update debug panel if visible
    if (nodeDebugPanel && nodeDebugPanel.isVisible) {
      nodeDebugPanel.refreshFromServer();
    }
  });
  
  // NEW: Listen for server connection events
  nodeBridge.on('serverConnected', (data) => {
    console.log('🟢 Bridge: Server connected', data);
    updateSyncStatus('connected');
    updateServerStatusMini();
  });
  
  nodeBridge.on('serverDisconnected', (error) => {
    console.log('🔴 Bridge: Server disconnected', error);
    updateSyncStatus('disconnected');
    updateServerStatusMini();
  });
}

// NEW: Setup search event listeners
function setupSearchListeners() {
  // Listen for node selection from search
  window.addEventListener('nodeSelected', (e) => {
    const nodeId = e.detail.nodeId;
    console.log('🎯 Node selected from search:', nodeId);
    
    // Navigate to node if engine is available
    if (fractalityEngine && AppState.currentView === 'bubble') {
      fractalityEngine.navigateToNode(nodeId);
      
      // Update debug panel if available
      if (nodeDebugPanel) {
        const nodes = nodeBridge.getVisibleNodes({ id: nodeId });
        if (nodes.length > 0) {
          const nodeData = nodes[0];
          const contextScore = fractalityEngine.caceEngine ? 
            fractalityEngine.caceEngine.calculateContextScore(nodeData) : 0;
          nodeDebugPanel.updateNode(nodeId, nodeData, contextScore);
          nodeDebugPanel.show();
        }
      }
    } else {
      // Store for later navigation
      AppState.pendingNavigation = nodeId;
      AppState.setView('bubble');
    }
  });
}

// Export to CLI (existing)
async function exportToCLI() {
  const exportData = nodeBridge.exportForCLI();
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fractality-frontend-export.json';
  a.click();
  URL.revokeObjectURL(url);
  
  showNotification(`Exported ${exportData.metadata.totalNodes} nodes for CLI`);
}

// Show import dialog (existing)
function showImportDialog() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const result = await nodeBridge.importNodes(data.nodes || []);
      
      console.log('📥 Import complete:', result);
      
      if (fractalityEngine) {
        await loadBridgeData();
      }
      
      showNotification(`Import complete! Added: ${result.added}, Updated: ${result.updated}`);
      
    } catch (error) {
      console.error('Import failed:', error);
      showNotification('Import failed: ' + error.message, 'error');
    }
  });
  
  input.click();
}

// REMOVED: displaySearchResults function (replaced by SearchInterface)

// Update sync status indicator (existing)
function updateSyncStatus(status) {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  
  if (!statusDot || !statusText) return;
  
  switch (status) {
    case 'connected':
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'CLI Connected';
      break;
    case 'synced':
      statusDot.className = 'status-dot synced';
      statusText.textContent = 'CLI Synced';
      break;
    case 'disconnected':
    default:
      statusDot.className = 'status-dot';
      statusText.textContent = 'CLI Disconnected';
      break;
  }
}

// Update state indicator (existing)
function updateStateIndicator(text) {
  const indicator = document.getElementById('state-indicator');
  if (indicator) {
    indicator.innerText = `State: ${text}`;
  }
}

// ENHANCED: Show notification with better styling
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <span class="notification-icon">
      ${type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '✅'}
    </span>
    <span class="notification-text">${message}</span>
  `;
  
  // Add notification styles if not present
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        border: 2px solid #4ade80;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 1002;
        backdrop-filter: blur(10px);
        transition: all 0.3s ease;
      }
      .notification.error { border-color: #ef4444; }
      .notification.warning { border-color: #f59e0b; }
      .notification.fade-out { opacity: 0; transform: translateX(100px); }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Load bridge data into engine (existing)
async function loadBridgeData() {
  const nodes = nodeBridge.getVisibleNodes();
  
  const nodeGraph = {
    nodes: new Map(nodes.map(n => [n.id, n])),
    rootNodes: nodes.filter(n => !n.parentId),
    getNode: (id) => nodes.find(n => n.id === id),
    getChildren: (id) => nodes.filter(n => n.parentId === id),
    getSiblings: (id) => {
      const node = nodes.find(n => n.id === id);
      if (!node || !node.parentId) return [];
      return nodes.filter(n => n.parentId === node.parentId && n.id !== id);
    },
    getNodesAtDepth: (depth) => nodes.filter(n => n.depth === depth),
    stats: {
      totalNodes: nodes.length,
      maxDepth: Math.max(...nodes.map(n => n.depth)),
      averageChildren: nodes.reduce((sum, n) => sum + n.children.length, 0) / nodes.length
    }
  };
  
  await fractalityEngine.loadData(nodeGraph);
}

// Check for CLI data on startup (existing)
async function checkForCLIData() {
  const params = new URLSearchParams(window.location.search);
  const cliExport = params.get('cli-export');
  const autoSync = params.get('auto-sync') === 'true';
  
  if (cliExport) {
    console.log('🔗 Loading CLI export:', cliExport);
    try {
      await nodeBridge.loadFromCLI(cliExport);
      
      if (autoSync) {
        nodeBridge.enableAutoSync(cliExport);
        updateSyncStatus('connected');
        document.getElementById('cli-sync').textContent = '🔄 Auto-Sync On';
        document.getElementById('cli-sync').classList.add('active');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to load CLI data:', error);
      return false;
    }
  }
  return false;
}

// ENHANCED: Initialize Fractality engine with debug panel integration
AppState.on('viewChanged', async (view) => {
  if (view === 'bubble' && !fractalityEngine) {
    console.log('🌌 Initializing Fractality Engine...');
    
    // Create engine
    fractalityEngine = new FractalityEngine('fractality-canvas');
    await fractalityEngine.init();
    
    // Initialize debug panel when CACE engine is available
    if (fractalityEngine.caceEngine) {
      nodeDebugPanel = new NodeDebugPanel(fractalityEngine.caceEngine);
      nodeDebugPanel.init();
      console.log('🧠 Debug panel initialized');
    }
    
    // Check for CLI data first
    const hasCliData = await checkForCLIData();
    
    if (!hasCliData) {
      // Load default test data
      const nodeGraph = testGenerator.generatePattern('golden');
      await fractalityEngine.loadData(nodeGraph);
    } else {
      // Load bridge data
      await loadBridgeData();
    }
    
    // Check for pending navigation
    if (AppState.pendingNavigation) {
      fractalityEngine.navigateToNode(AppState.pendingNavigation);
      AppState.pendingNavigation = null;
    }
    
    // Start engine
    fractalityEngine.start();
    
    // Setup node selection handler for debug panel
    if (nodeDebugPanel) {
      fractalityEngine.on('nodeSelected', (nodeData) => {
        const contextScore = fractalityEngine.caceEngine ? 
          fractalityEngine.caceEngine.calculateContextScore(nodeData) : 0;
        nodeDebugPanel.updateNode(nodeData.id, nodeData, contextScore);
      });
    }
  }
});

// ENHANCED: Initialize on DOM ready with all new components
document.addEventListener('DOMContentLoaded', () => {
  // Add CLI integration UI
  addCLISyncStatus();
  addCLIControls();
  
  // Setup bridge listeners
  setupBridgeListeners();
  
  // Setup search listeners
  setupSearchListeners();
  
  // Initialize search interface
  searchInterface.init();
  searchInterface.loadHistory();
  
  // Initial server status check
  updateServerStatusMini();
  
  console.log('✨ Fractality with full CLI Bridge + Search + Debug ready!');
});

// Export for debugging
window.nodeBridge = nodeBridge;
window.fractalityEngine = () => fractalityEngine;
window.searchInterface = searchInterface;
window.nodeDebugPanel = () => nodeDebugPanel;