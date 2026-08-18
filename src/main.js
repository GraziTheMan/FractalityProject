// src/main.js - application entry point (loaded by /index.html)
import { RadialMenu } from './components/radialMenu.js';
import { AppState } from './utils/appState.js';
import { setupMirrorToggle } from './components/mirrorToggle.js';
import { nodeBridge } from './bridge/NodeBridge.js';
import { FractalityEngine } from './engine/FractalityEngine.js';
import { DataLoader } from './data/DataLoader.js';
import { TestDataGenerator } from './data/TestDataGenerator.js';

import { SearchInterface } from './ui/SearchInterface.js';
import { NodeDebugPanel } from './ui/NodeDebugPanel.js';
import { AnimationSystem } from './visualization/AnimationSystem.js';

import { MapsPanel } from './ui/MapsPanel.js';
import { mindMapClient, MindMapClient } from './api/mindMapClient.js';
import { hasCliBridge } from './config/deploy.js';
import { getToken, hasAuth } from './auth/clerkClient.js';

import { ECS } from './ecs/ECS.js';
import { PositionComponent, RenderableComponent, KnowledgeComponent, InputComponent } from './ecs/components.js';
import { RenderSystem } from './ecs/systems/RenderSystem.js';
import { InputSystem } from './ecs/systems/InputSystem.js';

// Initialize state indicator
document.getElementById('state-indicator').innerText = 'State: Balanced';
document.getElementById('desktop-dock').innerText = 'Desktop Dock Placeholder';


// === ECS ENGINE INTEGRATION ===

// Initialize ECS and systems
const ecs = new ECS();
ecs.addSystem(new InputSystem());
ecs.addSystem(new RenderSystem());

// Spawn sample player and world object
const player = ecs.createEntity();
player.add("Position", PositionComponent(0, 0, 0));
player.add("Renderable", RenderableComponent("avatar.glb"));
player.add("Input", InputComponent());
player.add("Knowledge", KnowledgeComponent("player", "ENTITY", 1.5));

const tree = ecs.createEntity();
tree.add("Position", PositionComponent(10, 0, 5));
tree.add("Renderable", RenderableComponent("tree.glb"));
tree.add("Knowledge", KnowledgeComponent("tree_001", "ENTITY", 0.8));

// Drive the ECS from a single rAF loop using real elapsed time, so movement
// is frame-rate independent rather than assuming a fixed 60fps.
let ecsRunning = true;
let ecsLastFrame = performance.now();

function updateECS(now) {
  if (!ecsRunning) return;

  // Clamp so a backgrounded tab doesn't resume with one enormous step
  const delta = Math.min((now - ecsLastFrame) / 1000, 0.1);
  ecsLastFrame = now;

  ecs.update(delta);
  requestAnimationFrame(updateECS);
}
requestAnimationFrame(updateECS);

// Pause the ECS while the tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    ecsRunning = false;
  } else if (!ecsRunning) {
    ecsRunning = true;
    ecsLastFrame = performance.now();
    requestAnimationFrame(updateECS);
  }
});


// Initialize core systems
let fractalityEngine = null;
const dataLoader = new DataLoader();
const testGenerator = new TestDataGenerator();

// NEW: Initialize search interface and debug panel
const searchInterface = new SearchInterface();
let nodeDebugPanel = null; // Initialize when CACE engine is available

// Cloud persistence. The client is inert until VITE_API_BASE is set, and the
// token getter returns null until Clerk is configured and signed in, so this is
// safe to construct unconditionally.
mindMapClient.getToken = getToken;

// Set from ?map=&token= at startup and consumed once the engine exists.
let pendingShare = null;

const mapsPanel = new MapsPanel({
  client: mindMapClient,
  getGraph: () => fractalityEngine?.nodeGraph ?? null,
  notify: (message, type) => showNotification(message, type),
  onLoadMap: async (graph) => {
    if (!fractalityEngine) {
      // The engine boots lazily on the first 'bubble' view; make sure it exists
      AppState.setView('bubble');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (fractalityEngine) {
      await fractalityEngine.loadData(graph);
    }
  }
});

// Create radial menu with original items.
// The radii must clear the width of the text labels: 9 items across a 180
// degree fan gives 22.5 degrees of separation, so at the previous default of
// 80x60 the buttons overlapped into an unreadable stack.
const menu = new RadialMenu('radial-menu', {
  radiusX: 240,
  radiusY: 170,
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

  // Auto-sync and the server status light both need the local Python CLI
  // bridge. On a deployed site there is no localhost to reach, so they were a
  // permanently-red indicator, a button that could only fail, and a 5-second
  // polling timer that never had anything to report. Omit them entirely.
  //
  // Export and Import stay: they are file download/upload, which works in any
  // browser.
  const bridge = hasCliBridge();

  // Every label is wrapped in .dock-label so shell.css can drop to emoji-only
  // on a phone, where six labelled buttons need roughly three screen widths.
  const cliControls = document.createElement('div');
  cliControls.className = 'cli-controls';
  cliControls.innerHTML = `
    <button id="cli-export" class="dock-button" title="Export to CLI">📤<span class="dock-label">Export</span></button>
    <button id="cli-import" class="dock-button" title="Import from CLI">📥<span class="dock-label">Import</span></button>
    ${bridge ? `
    <button id="cli-sync" class="dock-button" title="Toggle CLI auto-sync">🔄<span class="dock-label">Auto-Sync Off</span></button>
    ` : ''}
    <button id="open-search" class="dock-button" title="Search nodes">🔍<span class="dock-label">Search</span></button>
    <button id="toggle-debug" class="dock-button" title="Node debug panel">🧠<span class="dock-label">Debug</span></button>
    <button id="toggle-perf" class="dock-button" title="Performance overlay">📈<span class="dock-label">Perf</span></button>
    <button id="open-maps" class="dock-button" title="Cloud maps">🗺<span class="dock-label">Maps</span></button>
    ${bridge ? `
    <div class="cli-status-mini">
      <span class="server-status-indicator" id="server-status-mini">🔗 Checking...</span>
    </div>
    ` : ''}
  `;

  desktopDock.innerHTML = ''; // Clear placeholder text
  desktopDock.appendChild(cliControls);

  // Setup CLI control handlers
  setupCLIHandlers();
}

// ENHANCED: Setup CLI control handlers with search integration
function setupCLIHandlers() {
  // The bridge-only controls are absent unless a CLI bridge is configured, so
  // every lookup is optional. A missing element used to throw here and abort
  // the rest of the wiring.
  const on = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
    return el;
  };

  on('cli-export', exportToCLI);
  on('cli-import', showImportDialog);

  // Auto-sync toggle. Only rendered when the CLI bridge is reachable.
  let autoSyncEnabled = false;
  on('cli-sync', (e) => {
    // The label lives in a child span, so write to that rather than to the
    // button, which would delete the emoji along with it.
    const button = e.currentTarget;
    const label = button.querySelector('.dock-label') || button;

    autoSyncEnabled = !autoSyncEnabled;
    if (autoSyncEnabled) {
      const exportPath = prompt('Enter CLI export file path:', 'fractal-export.json');
      if (exportPath) {
        nodeBridge.enableAutoSync(exportPath);
        label.textContent = 'Auto-Sync On';
        button.classList.add('active');
        updateSyncStatus('connected');
      } else {
        autoSyncEnabled = false;
      }
    } else {
      nodeBridge.disableAutoSync();
      label.textContent = 'Auto-Sync Off';
      button.classList.remove('active');
      updateSyncStatus('disconnected');
    }
  });

  on('open-search', () => searchInterface.toggle());

  on('toggle-debug', () => {
    if (nodeDebugPanel) {
      nodeDebugPanel.toggle();
    } else {
      showNotification('Debug panel not available (CACE engine not loaded)', 'warning');
    }
  });

  // The performance overlay defaults on for desktop and off for phones, and
  // FractalityEngine.togglePerformanceMonitor() had no caller at all — meaning
  // on mobile it was permanently on screen with no way to dismiss it.
  on('toggle-perf', (e) => {
    if (!fractalityEngine) {
      showNotification('Open a 3D view first', 'warning');
      return;
    }
    fractalityEngine.togglePerformanceMonitor();
    e.currentTarget.classList.toggle(
      'active',
      Boolean(fractalityEngine.dashboard?.config?.visible)
    );
  });

  on('open-maps', () => mapsPanel.toggle());

  // Only poll when there is a bridge to poll.
  if (hasCliBridge()) {
    setInterval(updateServerStatusMini, 5000);
  }
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
    
    // Navigate to node if engine is available.
    // setFocus, not navigateToNode: the latter has never existed on
    // FractalityEngine, so every search-result click and every "Navigate"
    // press in the node info panel threw a TypeError here.
    if (fractalityEngine && AppState.currentView === 'bubble') {
      fractalityEngine.setFocus(nodeId);
      
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

  const icon = document.createElement('span');
  icon.className = 'notification-icon';
  icon.textContent = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '✅';

  // textContent, not innerHTML: messages now carry server-supplied error text
  // (API `detail` fields), which must never be parsed as markup.
  const text = document.createElement('span');
  text.className = 'notification-text';
  text.textContent = message;

  notification.append(icon, text);

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

      /* On a phone a right-anchored toast with a long message (the cold-start
         explanation, for instance) runs off the side of the screen. Full width
         and wrapping instead. */
      @media (max-width: 720px) {
        .notification {
          left: 10px;
          right: 10px;
          top: 10px;
          font-size: 13px;
          align-items: flex-start;
        }
        .notification-text { flex: 1; }
        .notification.fade-out { transform: translateY(-20px); }
      }
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
    
    // A share link takes precedence over both CLI data and the demo pattern, so
    // a visitor following one never sees a flash of unrelated test nodes.
    if (pendingShare) {
      const share = pendingShare;
      pendingShare = null;
      const opened = await mapsPanel.loadMap(share.mapId, share.shareToken);

      if (!opened) {
        // Link was bad, revoked or expired; fall back to something to look at
        showNotification('That shared map could not be opened', 'error');
        await fractalityEngine.loadData(testGenerator.generateTestPattern('golden'));
      }
    } else {
      // Check for CLI data first
      const hasCliData = await checkForCLIData();

      if (!hasCliData) {
        // Load default test data
        const nodeGraph = testGenerator.generateTestPattern('golden');
        await fractalityEngine.loadData(nodeGraph);
      } else {
        // Load bridge data
        await loadBridgeData();
      }
    }
    
    // Check for pending navigation
    if (AppState.pendingNavigation) {
      fractalityEngine.setFocus(AppState.pendingNavigation);
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
  // Add CLI integration UI. The sync light is bridge-only: without a bridge it
  // reads "CLI Disconnected" forever, which is noise rather than information —
  // and on a phone it is noise occupying scarce screen.
  if (hasCliBridge()) addCLISyncStatus();
  addCLIControls();
  
  // Setup bridge listeners
  setupBridgeListeners();
  
  // Setup search listeners
  setupSearchListeners();
  
  // Initialize search interface
  searchInterface.init();
  searchInterface.loadHistory();
  
  // Initial server status check
  if (hasCliBridge()) updateServerStatusMini();

  // A visitor may arrive on a share link. Record it before the first view is
  // opened so the engine loads the shared map instead of the demo pattern.
  const share = MindMapClient.readShareParams();
  if (share && mindMapClient.available) {
    pendingShare = share;
    console.log('🔗 Opening shared map', share.mapId);
  } else if (share) {
    showNotification('This link points at a map, but no API is configured', 'warning');
  }

  console.log('✨ Fractality with full CLI Bridge + Search + Debug ready!');

  // Open the default view. This is what triggers the 'viewChanged' handler
  // that lazily boots FractalityEngine, so without it the canvas stays empty
  // until the user picks something from the radial menu.
  AppState.setView('bubble');
});

// Export for debugging. Also what scripts/browser-check.mjs drives, since the
// cloud paths cannot be exercised without standing in for the API.
window.nodeBridge = nodeBridge;
window.fractalityEngine = () => fractalityEngine;
window.searchInterface = searchInterface;
window.nodeDebugPanel = () => nodeDebugPanel;
window.mapsPanel = mapsPanel;
