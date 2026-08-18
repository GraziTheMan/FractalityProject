// src/main.js - application entry point (loaded by /index.html)
import { DockMenu } from './ui/DockMenu.js';
import { AppState } from './utils/appState.js';
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

/**
 * The dock's contents.
 *
 * Built as data on every call so that `disabledReason` and `isActive` see the
 * current world — the engine boots lazily, so most of this is unavailable for
 * the first moment of the page's life.
 *
 * Grouped by what the user is trying to do rather than by which module
 * implements it. Every entry either works or reports why it cannot; nothing here
 * is a placeholder. The nine radial-menu buttons this replaces called
 * AppState.setView() with names that had no view behind them, so eight of them
 * did nothing but print "Switched to: <name>".
 */
function buildDockItems() {
  const needsEngine = () => (fractalityEngine ? false : 'Open the 3D view first');

  /** One sheet row per layout the LayoutEngine can actually render. */
  const layoutItem = (id, icon, label, description) => ({
    id: `layout-${id}`,
    icon,
    label,
    description,
    isActive: () => fractalityEngine?.getLayout() === id,
    disabledReason: needsEngine,
    onSelect: () => {
      if (fractalityEngine.setLayout(id)) {
        showNotification(`Layout: ${label}`);
      }
    }
  });

  return [
    // --- how the map is arranged and drawn ---------------------------------
    // This is the consolidation of the old Bubble / Cone / NodeMgr buttons:
    // they were all about how the graph is displayed, and only one of them
    // ('bubble') was wired to anything.
    {
      id: 'view',
      icon: '\u{1f300}',
      label: 'View',
      // Layouts are a radio set: one is always current, so "has an active
      // child" would light this button up permanently and mean nothing.
      exclusive: true,
      items: [
        layoutItem('family', '\u{1f46a}', 'Family',
          'Parent above, siblings in an arc, children spiralling out'),
        layoutItem('goldenSpiral', '\u{1f300}', 'Golden Spiral',
          'One expanding spiral by golden ratio'),
        layoutItem('fibonacciSphere', '\u{1f310}', 'Fibonacci Sphere',
          'Evenly distributed over a sphere'),
        layoutItem('fractalTree', '\u{1f333}', 'Fractal Tree',
          'Branching, each level smaller'),
        layoutItem('cosmicWeb', '\u{1f30c}', 'Cosmic Web',
          'Loose clusters linked by strands'),
        { separator: true },
        {
          id: 'reset-view',
          icon: '\u{1f3af}',
          label: 'Back to centre',
          description: 'Return focus to the root node',
          disabledReason: needsEngine,
          onSelect: () => {
            fractalityEngine.resetView();
            showNotification('Focus reset to root');
          }
        }
      ]
    },

    // --- finding things ----------------------------------------------------
    {
      id: 'find',
      icon: '\u{1f50d}',
      label: 'Find',
      isActive: () => searchInterface.isVisible,
      onSelect: () => searchInterface.toggle()
    },

    // --- saving, sharing, opening -----------------------------------------
    {
      id: 'maps',
      icon: '\u{1f5fa}',
      label: 'Maps',
      isActive: () => mapsPanel.isOpen,
      onSelect: () => mapsPanel.toggle()
    },

    // --- everything else ---------------------------------------------------
    {
      id: 'more',
      icon: '\u2630',
      label: 'More',
      items: [
        {
          id: 'export',
          icon: '\u{1f4e4}',
          label: 'Export',
          description: 'Download this map as JSON',
          onSelect: exportToCLI
        },
        {
          id: 'import',
          icon: '\u{1f4e5}',
          label: 'Import',
          description: 'Load a map from a JSON file',
          onSelect: showImportDialog
        },
        { separator: true },
        {
          id: 'node-debug',
          icon: '\u{1f9e0}',
          label: 'Node inspector',
          description: 'Context scores and energy per node',
          // Reports the real reason rather than a blanket "not available":
          // this panel needs the CACE engine, which only exists once the 3D
          // view has booted.
          disabledReason: () =>
            fractalityEngine
              ? (nodeDebugPanel ? false : 'The inspector failed to initialise')
              : 'Open the 3D view first',
          isActive: () => Boolean(nodeDebugPanel?.isVisible),
          onSelect: () => nodeDebugPanel.toggle()
        },
        {
          id: 'perf',
          icon: '\u{1f4c8}',
          label: 'Performance',
          description: 'Frame rate, draw calls, memory',
          disabledReason: needsEngine,
          isActive: () => Boolean(fractalityEngine?.dashboard?.config?.visible),
          onSelect: () => fractalityEngine.togglePerformanceMonitor()
        },
        ...(hasCliBridge()
          ? [
              { separator: true },
              {
                id: 'cli-sync',
                icon: '\u{1f504}',
                label: 'CLI auto-sync',
                description: describeBridge(),
                isActive: () => autoSyncEnabled,
                onSelect: toggleAutoSync
              }
            ]
          : [])
      ]
    }
  ];
}

let dock = null;

/**
 * Rebuild the dock from scratch.
 *
 * Use this when the SET of entries changes — the engine booting, a CLI bridge
 * appearing — because it re-runs buildDockItems(). It also closes any open
 * sheet, so it is the wrong tool for a routine state refresh.
 */
function refreshDock() {
  if (!dock) return;
  dock.setItems(buildDockItems());
}

/**
 * Re-read active and unavailable states without touching the DOM structure.
 *
 * Panels can close themselves — the Maps panel has its own ✕, the search panel
 * answers Escape — and the dock has no way to hear about that. Polling this is a
 * deliberate choice over threading a visibility callback through every panel:
 * it is a dozen className updates, it cannot go stale in a way a new panel would
 * reintroduce, and unlike refreshDock() it leaves an open sheet alone.
 */
function syncDock() {
  dock?.refresh();
}

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

/**
 * Build the dock.
 *
 * `#app-dock` is positioned by shell.css: a bottom bar on phones, a top bar on
 * wide screens. DockMenu itself does not care which.
 */
function buildDock() {
  const container = document.getElementById('app-dock');
  if (!container) {
    console.error('main.js: #app-dock is missing from the page');
    return;
  }

  dock = new DockMenu({
    container,
    items: buildDockItems(),
    notify: (message, type) => showNotification(message, type)
  });

  // Keep the dock's highlights honest when panels close themselves.
  setInterval(syncDock, 750);

  if (hasCliBridge()) {
    // Only poll when there is a bridge to poll. Without one this was a
    // 5-second timer reporting on a server that cannot exist.
    setInterval(refreshDock, 5000);
  }
}

/** Whether CLI auto-sync is on. Read by the dock to show its active state. */
let autoSyncEnabled = false;

/**
 * Toggle mirroring to a local file. Only reachable when a CLI bridge is
 * configured, since it needs the local Python helper to write anywhere.
 */
function toggleAutoSync() {
  if (autoSyncEnabled) {
    nodeBridge.disableAutoSync();
    autoSyncEnabled = false;
    updateSyncStatus('disconnected');
    showNotification('CLI auto-sync off');
    return;
  }

  const exportPath = prompt('Enter CLI export file path:', 'fractal-export.json');
  if (!exportPath) return;

  nodeBridge.enableAutoSync(exportPath);
  autoSyncEnabled = true;
  updateSyncStatus('connected');
  showNotification('CLI auto-sync on');
}

/**
 * Bridge connection state, as a line of text for the auto-sync sheet row.
 *
 * This replaces updateServerStatusMini(), which wrote into a
 * `#server-status-mini` element that lived in the old dock markup. That element
 * is gone, so the function returned at its first line and the 5-second timer
 * driving it accomplished nothing. Putting the state where the auto-sync control
 * already is means there is one place to look rather than a separate light.
 */
function describeBridge() {
  if (!nodeBridge.isServerConnected()) return 'CLI bridge offline';
  const nodes = nodeBridge.lastHealthCheck?.total_nodes;
  return typeof nodes === 'number'
    ? `CLI bridge connected · ${nodes} nodes`
    : 'CLI bridge connected';
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
    refreshDock();
  });

  nodeBridge.on('serverDisconnected', (error) => {
    console.log('🔴 Bridge: Server disconnected', error);
    updateSyncStatus('disconnected');
    refreshDock();
  });
}

/**
 * Keep the node inspector in step with whatever the engine has focused.
 *
 * Registered unconditionally, and it checks for the panel at call time: the
 * inspector only exists once the 3D view has booted, so binding this at boot
 * time inside an `if (nodeDebugPanel)` was how the previous version came to
 * contain a call that could never work.
 */
window.addEventListener('fractality:nodeFocused', (event) => {
  const { nodeId, node } = event.detail ?? {};
  if (!nodeDebugPanel || !nodeId) return;
  nodeDebugPanel.updateNode(nodeId, node, fractalityEngine?.getContextScore(nodeId) ?? 0);
});

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
          const contextScore = fractalityEngine.getContextScore(nodeId);
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

/**
 * Transient toast.
 *
 * The class is `fractality-toast`, not `notification`, and that matters.
 *
 * main.css also styles `.notification` — it belongs to the older DOM that
 * stylesheet targets (see the note in index.html) — and the two rule sets
 * partially overrode each other. This block set top/right/left; main.css
 * contributed `bottom: 20px` and `transform: translateX(-50%)`, which nothing
 * here overrode. Together that produced a toast 814px tall on an 844px screen,
 * shifted 185px off the left edge of the phone.
 *
 * A unique class name is the fix rather than another layer of overrides: no
 * stylesheet written for some other DOM can reach this element at all. The
 * keyframes are prefixed for the same reason — @keyframes names are global, and
 * main.css defines its own `slideUp`.
 */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `fractality-toast ${type}`;

  const icon = document.createElement('span');
  icon.className = 'fractality-toast-icon';
  icon.textContent = type === 'error' ? '\u274c' : type === 'warning' ? '\u26a0\ufe0f' : '\u2705';

  // textContent, not innerHTML: messages now carry server-supplied error text
  // (API `detail` fields), which must never be parsed as markup.
  const text = document.createElement('span');
  text.className = 'fractality-toast-text';
  text.textContent = message;

  notification.append(icon, text);

  // Add toast styles if not present
  if (!document.getElementById('fractality-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'fractality-toast-styles';
    style.textContent = `
      .fractality-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        /* Every edge is stated. Leaving bottom unset is what let another
           stylesheet supply one and stretch the toast down the whole screen. */
        bottom: auto;
        left: auto;
        transform: none;
        max-width: min(420px, calc(100vw - 40px));
        background: rgba(0, 0, 0, 0.92);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        border: 2px solid #4ade80;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        font-size: 13px;
        line-height: 1.4;
        z-index: 1002;
        backdrop-filter: blur(10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
        animation: fractality-toast-in 0.25s ease;
      }
      .fractality-toast.error { border-color: #ef4444; }
      .fractality-toast.warning { border-color: #f59e0b; }
      .fractality-toast-icon { flex: 0 0 auto; }
      .fractality-toast-text { flex: 1; min-width: 0; word-break: break-word; }
      .fractality-toast.fade-out { opacity: 0; transform: translateX(40px); }

      @keyframes fractality-toast-in {
        from { opacity: 0; transform: translateX(40px); }
        to   { opacity: 1; transform: translateX(0); }
      }

      /* On a phone, span the width instead: a right-anchored toast carrying a
         long message — the CORS diagnosis, for instance — has nowhere to go. */
      @media (max-width: 720px) {
        .fractality-toast {
          left: 10px;
          right: 10px;
          /* Below the state indicator (top: 10px, ~26px tall) rather than on
             top of it. */
          top: 44px;
          max-width: none;
        }
        .fractality-toast.fade-out { transform: translateY(-20px); }
        @keyframes fractality-toast-in {
          from { opacity: 0; transform: translateY(-20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
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
    // `cace`, not `caceEngine`. The engine has always constructed a CACEEngine
    // as `this.cace`, so this check read undefined and the inspector was never
    // created — which is why its dock entry reported "CACE engine not loaded".
    if (fractalityEngine.cace) {
      nodeDebugPanel = new NodeDebugPanel(fractalityEngine);
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
    
  }

  // The engine boots lazily, so most of the dock is unavailable until this
  // point. Without this the View group and the inspector stay greyed out for
  // the rest of the session — the buttons would exist and refuse to work, which
  // is the failure this whole redesign is meant to end.
  refreshDock();
});

// ENHANCED: Initialize on DOM ready with all new components
document.addEventListener('DOMContentLoaded', () => {
  // Add CLI integration UI. The sync light is bridge-only: without a bridge it
  // reads "CLI Disconnected" forever, which is noise rather than information —
  // and on a phone it is noise occupying scarce screen.
  if (hasCliBridge()) addCLISyncStatus();
  buildDock();
  
  // Setup bridge listeners
  setupBridgeListeners();
  
  // Setup search listeners
  setupSearchListeners();
  
  // Initialize search interface
  searchInterface.init();
  searchInterface.loadHistory();
  
  // The dock shows bridge state on its auto-sync row.
  if (hasCliBridge()) refreshDock();

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
