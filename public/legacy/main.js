import { RadialMenu } from './components/radialMenu.js';
import { AppState } from './utils/appState.js';
import { setupMirrorToggle } from './components/mirrorToggle.js';
import { nodeBridge } from './bridge/NodeBridge.js';
import { FractalityEngine } from './engine/FractalityEngine.js';
import { DataLoader } from './data/DataLoader.js';
import { TestDataGenerator } from './data/TestDataGenerator.js';

// Initialize state indicator
document.getElementById('state-indicator').innerText = 'State: Balanced';
document.getElementById('desktop-dock').innerText = 'Desktop Dock Placeholder';

// Initialize core systems
let fractalityEngine = null;
const dataLoader = new DataLoader();
const testGenerator = new TestDataGenerator();

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

// Add CLI controls to desktop dock
function addCLIControls() {
  const desktopDock = document.getElementById('desktop-dock');
  
  const cliControls = document.createElement('div');
  cliControls.className = 'cli-controls';
  cliControls.innerHTML = `
    <button id="cli-export" class="dock-button">📤 Export to CLI</button>
    <button id="cli-import" class="dock-button">📥 Import from CLI</button>
    <button id="cli-sync" class="dock-button">🔄 Auto-Sync Off</button>
    <div class="cli-search-mini">
      <input type="text" id="cli-search-input" placeholder="Search nodes...">
      <button id="cli-search-btn">🔍</button>
    </div>
  `;
  
  desktopDock.innerHTML = ''; // Clear placeholder text
  desktopDock.appendChild(cliControls);
  
  // Setup CLI control handlers
  setupCLIHandlers();
}

// Setup CLI control handlers
function setupCLIHandlers() {
  // Export handler
  document.getElementById('cli-export').addEventListener('click', exportToCLI);
  
  // Import handler
  document.getElementById('cli-import').addEventListener('click', showImportDialog);
  
  // Auto-sync toggle
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
  
  // Search functionality
  const searchInput = document.getElementById('cli-search-input');
  const searchBtn = document.getElementById('cli-search-btn');
  
  const performSearch = async () => {
    const query = searchInput.value.trim();
    if (!query) return;
    
    const results = await nodeBridge.searchNodes(query);
    displaySearchResults(results);
  };
  
  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
}

// Setup bridge listeners
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
  });
}

// Export to CLI
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

// Show import dialog
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

// Display search results
function displaySearchResults(results) {
  // Remove existing results panel if any
  const existing = document.querySelector('.search-results-panel');
  if (existing) existing.remove();
  
  const resultsPanel = document.createElement('div');
  resultsPanel.className = 'search-results-panel';
  resultsPanel.innerHTML = `
    <h4>Search Results (${results.length})</h4>
    <div class="results-list"></div>
    <button class="close-results">Close</button>
  `;
  
  const resultsList = resultsPanel.querySelector('.results-list');
  
  results.forEach(result => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <div class="result-header">
        <span class="result-label">${result.node.metadata.label}</span>
        <span class="result-score">${(result.score * 100).toFixed(0)}%</span>
      </div>
      <div class="result-matches">
        ${result.matches.map(m => `<span class="match">${m.type}: ${m.text}</span>`).join('')}
      </div>
    `;
    
    item.addEventListener('click', () => {
      // Navigate to node if engine is available
      if (fractalityEngine && AppState.currentView === 'bubble') {
        fractalityEngine.navigateToNode(result.node.id);
      } else {
        // Store for later navigation
        AppState.pendingNavigation = result.node.id;
        AppState.setView('bubble');
      }
      resultsPanel.remove();
    });
    
    resultsList.appendChild(item);
  });
  
  resultsPanel.querySelector('.close-results').addEventListener('click', () => {
    resultsPanel.remove();
  });
  
  document.body.appendChild(resultsPanel);
}

// Update sync status indicator
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

// Update state indicator
function updateStateIndicator(text) {
  const indicator = document.getElementById('state-indicator');
  if (indicator) {
    indicator.innerText = `State: ${text}`;
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Load bridge data into engine
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

// Check for CLI data on startup
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

// Initialize Fractality engine when bubble view is activated
AppState.on('viewChanged', async (view) => {
  if (view === 'bubble' && !fractalityEngine) {
    console.log('🌌 Initializing Fractality Engine...');
    
    // Create engine
    fractalityEngine = new FractalityEngine('fractality-canvas');
    await fractalityEngine.init();
    
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
  }
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Add CLI integration UI
  addCLISyncStatus();
  addCLIControls();
  
  // Setup bridge listeners
  setupBridgeListeners();
  
  console.log('✨ Fractality with CLI Bridge ready!');
});

// Export for debugging
window.nodeBridge = nodeBridge;
window.fractalityEngine = () => fractalityEngine;