// src/main.js - application entry point (loaded by /index.html)
import { DockMenu } from './ui/DockMenu.js';
import { AppState } from './utils/appState.js';
import { nodeBridge } from './bridge/NodeBridge.js';
import { FractalityEngine } from './engine/FractalityEngine.js';
import { DataLoader } from './data/DataLoader.js';
import { NodeGraph } from './data/NodeData.js';
import { TestDataGenerator } from './data/TestDataGenerator.js';

import { SearchInterface } from './ui/SearchInterface.js';
import { NodeDebugPanel } from './ui/NodeDebugPanel.js';
import { AnimationSystem } from './visualization/AnimationSystem.js';

import { MapsPanel } from './ui/MapsPanel.js';
import { NodeManagerPanel } from './ui/NodeManagerPanel.js';
import { ConeView } from './ui/ConeView.js';
import { BubbleView } from './ui/BubbleView.js';
import { FeedPanel } from './ui/FeedPanel.js';
import { feedClient } from './api/feedClient.js';
import { AccountPanel } from './ui/AccountPanel.js';
import { onAuthChange, getAuthState, loadAuth } from './auth/clerkClient.js';
import { mindMapClient, MindMapClient } from './api/mindMapClient.js';
import { hasCliBridge } from './config/deploy.js';
import { getToken, hasAuth } from './auth/clerkClient.js';

import { ECS } from './ecs/ECS.js';
import { PositionComponent, RenderableComponent, KnowledgeComponent, InputComponent } from './ecs/components.js';
import { RenderSystem } from './ecs/systems/RenderSystem.js';
import { InputSystem } from './ecs/systems/InputSystem.js';
import { registerServiceWorker, isInstalled } from './pwa.js';

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
 * The Node Manager: the editing surface for the graph's structure.
 *
 * Distinct from the node inspector. The 3D view shows one parent's children at a
 * time by design, which makes reorganising impossible there — you cannot move a
 * node to somewhere you cannot see.
 */
const nodeManagerPanel = new NodeManagerPanel({
  getGraph: () => fractalityEngine?.nodeGraph ?? null,
  getFocusedNode: () => fractalityEngine?.state?.focusNode ?? null,
  onFocusNode: (nodeId) => fractalityEngine?.setFocus(nodeId),
  // Structural edits invalidate the family-view cache, the CACE analysis and the
  // layout. notifyGraphChanged() handles all three without resetting focus the
  // way loadData() would.
  onGraphChanged: () => fractalityEngine?.notifyGraphChanged(),
  notify: (message, type) => showNotification(message, type)
});

/**
 * Account: signing in, signing out, and how you appear to other people.
 *
 * Signing in previously had no home of its own — only a button inside the Maps
 * panel and one inside the feed composer. So on a fresh desktop browser there was
 * no obvious way to sign in, and an anonymous visitor sees only PUBLIC maps.
 * That is why maps saved on a phone looked missing on a desktop: they were
 * private, and the desktop was never signed in.
 */
const accountPanel = new AccountPanel({
  client: feedClient,
  notify: (message, type) => showNotification(message, type),
  // The feed renders author names, and the Maps panel's list depends on who you
  // are, so both need to re-read after a profile or session change.
  onProfileChanged: () => {
    if (feedPanel.isOpen) feedPanel.refresh();
    if (mapsPanel.isOpen) mapsPanel.refresh();
    refreshDock();
  }
});

/**
 * Seed the display name from the auth provider, once.
 *
 * Clerk's client knows the user's name; its session JWT does not carry one, so
 * the API cannot. This copies it across on first sign-in — and ONLY when no name
 * has been set, so a name the user chose is never overwritten by the provider's
 * on a later sign-in.
 */
async function seedDisplayName() {
  if (!feedClient.available) return;
  const state = getAuthState();
  if (!state.signedIn) return;

  try {
    const profile = await feedClient.getProfile();
    if (profile.display_name) return;

    const fromProvider = state.user?.name;
    if (!fromProvider) return;

    await feedClient.updateProfile({ display_name: fromProvider });
    console.log(`Seeded display name from the auth provider: ${fromProvider}`);
  } catch (error) {
    // Never fatal: a missing display name degrades to "Anonymous" on posts,
    // which is survivable, and the account panel can set one by hand.
    console.warn('Could not seed the display name:', error.message);
  }
}

/**
 * The feed.
 *
 * A secondary surface on purpose. The intent for it is "a feature to help replace
 * the scrolling of modern corporate social media", so it is strictly
 * reverse-chronological with a Load-more button rather than infinite scroll —
 * reaching the end should be possible, and continuing should be a decision.
 */
feedClient.getToken = getToken;

const feedPanel = new FeedPanel({
  client: feedClient,
  notify: (message, type) => showNotification(message, type)
});

/**
 * The Cone view: a 2D side elevation of the whole map.
 *
 * A genuinely separate surface, not a layout of the 3D scene. Tier 0 is the apex,
 * lower tiers hold more nodes so the silhouette widens, and it is driven by two
 * gestures — drag sideways to spin, up and down to travel the tiers.
 */
const coneView = new ConeView({
  getGraph: () => fractalityEngine?.nodeGraph ?? null,
  getFocusedNode: () => fractalityEngine?.state?.focusNode ?? null,
  onFocusNode: (nodeId) => fractalityEngine?.setFocus(nodeId),
  notify: (message, type) => showNotification(message, type),
  // The cone covers the screen, so the 3D engine would otherwise keep drawing
  // frames nobody can see.
  onVisibilityChange: (open) => {
    if (!fractalityEngine) return;
    open ? fractalityEngine.pause() : fractalityEngine.resume();
  }
});

const bubbleView = new BubbleView({
  getGraph: () => fractalityEngine?.nodeGraph ?? null,
  getFocusedNode: () => fractalityEngine?.state?.focusNode ?? null,
  onFocusNode: (nodeId) => fractalityEngine?.setFocus(nodeId),
  notify: (message, type) => showNotification(message, type),
  // Leaving this view goes back to the default screen, not to a blank one. There
  // is nothing behind these views any more — the 3D scene they used to sit on top
  // of is exactly what was replaced.
  onClose: () => coneView.show(),
  onVisibilityChange: (open) => {
    if (!fractalityEngine) return;
    open ? fractalityEngine.pause() : fractalityEngine.resume();
  }
});

// Two views, and only ever one of them open. They both cover the screen, so
// opening the second on top of the first would leave the first running behind it
// and its dock entry lit.
coneView.onVisibilityChange = ((original) => (open) => {
  if (open && bubbleView.isOpen) bubbleView.hide();
  original(open);
})(coneView.onVisibilityChange);
bubbleView.onVisibilityChange = ((original) => (open) => {
  if (open && coneView.isOpen) coneView.hide();
  original(open);
})(bubbleView.onVisibilityChange);

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

  return [
    // --- how the map is arranged and drawn ---------------------------------
    //
    // Two views, and that is the whole set.
    //
    // There were five here — family, goldenSpiral, fibonacciSphere, fractalTree,
    // cosmicWeb — and they were five arrangements of the same shaded spheres,
    // answering "how should the whole graph be scattered in space?". Nobody was
    // asking that. They are gone, replaced by ONE view built around the question
    // people do have, which is "what is inside this?".
    //
    // The LayoutEngine still implements them and setLayout()/getLayout() still
    // work; what is removed is the claim that choosing between them is a thing a
    // reader wants to do.
    {
      id: 'view',
      icon: '\u{1f300}',
      label: 'View',
      items: [
        {
          id: 'bubble',
          icon: '\u{2b55}',
          label: 'Bubble view',
          description: "One level at a time; tap a bubble to go inside it",
          isActive: () => bubbleView.isOpen,
          disabledReason: needsEngine,
          // show(), not toggle(). Exactly one view is on screen at all times, so
          // toggling the open one off would leave nothing behind it.
          onSelect: () => bubbleView.show()
        },
        {
          id: 'cone',
          icon: '\u{1f53a}',
          label: 'Cone view',
          description: 'Side-on view of every tier; spin and travel by dragging',
          isActive: () => coneView.isOpen,
          disabledReason: needsEngine,
          onSelect: () => coneView.show()
        },
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

    // --- editing the structure ---------------------------------------------
    // Its own dock button rather than a row in a sheet: this is the surface for
    // building a map, which is the app's main purpose, not an occasional tool.
    {
      id: 'organise',
      icon: '\u{1f5c2}\ufe0f',
      label: 'Organise',
      isActive: () => nodeManagerPanel.isOpen,
      disabledReason: needsEngine,
      onSelect: () => nodeManagerPanel.toggle()
    },

    // --- the social half ---------------------------------------------------
    {
      id: 'social',
      icon: '\u{1f465}',
      label: 'Feed',
      isActive: () => feedPanel.isOpen,
      // No engine needed: the feed is readable before anything 3D has booted,
      // and it is the part a visitor can look at before signing up.
      onSelect: () => feedPanel.toggle()
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
        // Identity first: it is what most of the rest depends on, and having no
        // reachable sign-in is what made cloud maps look broken.
        {
          id: 'account',
          icon: '\u{1f464}',
          label: () => (accountPanel.signedIn ? 'Account' : 'Sign in'),
          description: () => (accountPanel.signedIn
            ? 'Display name, avatar, sign out'
            : 'Sign in to save maps and post'),
          isActive: () => accountPanel.isOpen,
          onSelect: () => accountPanel.toggle()
        },
        {
          id: 'install',
          icon: '\u{2b07}',
          label: 'Install app',
          description: () => (isInstalled()
            ? 'Already installed'
            : 'Add Fractality to your device'),
          // Deliberately never unavailable.
          //
          // The browser only fires beforeinstallprompt when it feels like it, and never on
          // iOS, so an entry gated on having the prompt would be greyed out for most
          // people — and telling them how to install by hand is useful information rather
          // than a dead end. Same reason the dock avoids the disabled attribute at all: a
          // control that swallows its own click explains nothing.
          onSelect: async () => {
            if (isInstalled()) {
              showNotification('Fractality Platform is already installed on this device.');
              return;
            }
            if (!installPrompt) {
              showNotification(
                'Your browser has not offered an install button yet. '
                + 'Try its menu — or on iPhone, Share then "Add to Home Screen".',
                'info'
              );
              return;
            }
            // The prompt is single-use: once shown, the captured event is spent whatever
            // the user chooses, so it is dropped either way rather than being offered
            // again as a control that silently does nothing.
            const prompt = installPrompt;
            installPrompt = null;
            try {
              await prompt.prompt();
              const { outcome } = await prompt.userChoice;
              if (outcome !== 'accepted') {
                showNotification('You can install it later from your browser menu.');
              }
            } catch (error) {
              showNotification(`Could not start the install: ${error.message}`, 'warning');
            }
            refreshDock();
          }
        },
        { separator: true },
        {
          id: 'export-json',
          icon: '\u{1f4e4}',
          label: 'Export JSON',
          description: 'Download this map, structure and all',
          disabledReason: needsEngine,
          onSelect: exportMapJson
        },
        {
          id: 'export-turtle',
          icon: '\u{1f422}',
          label: 'Export Turtle',
          description: 'RDF/SKOS, for ontology tools and merging maps',
          disabledReason: needsEngine,
          onSelect: exportMapTurtle
        },
        {
          id: 'import',
          icon: '\u{1f4e5}',
          label: 'Import',
          description: 'Load a .json or .ttl file',
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

  // Keep the dock's highlights honest when panels close themselves, and keep the
  // Account entry reading "Sign in" or "Account" as the session changes.
  setInterval(syncDock, 750);

  // Seed the display name once a session exists. Registered here rather than at
  // module scope so it cannot run before the client has its token getter.
  if (hasAuth()) {
    onAuthChange(() => {
      if (getAuthState().signedIn) seedDisplayName();
      refreshDock();
    });
    if (getAuthState().signedIn) seedDisplayName();
  }

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
/**
 * Open the signed-in user's most recent map, if they have one.
 *
 * Ordered by `updated_at DESC` server-side, so the first result is the one last
 * worked on — which is what someone returning to the app is nearly always after.
 * Coming back to the generated demo map instead makes it look as though the saved
 * work is gone.
 *
 * Prefers the map the user nominated as their default, then the most recently edited
 * one. Stored on the profile rather than in the browser, because which map you live in
 * is a fact about you and not about the device you happen to be signed in from.
 *
 * Silent about failure on purpose: this runs during boot, and a cold API or an
 * unreachable network must fall through to the demo rather than leaving an empty
 * screen. The Maps panel reports properly when opened deliberately.
 *
 * @returns {Promise<boolean>} true when a map was loaded
 */
/**
 * How long boot will wait for Clerk to say whether there is a session.
 *
 * Long enough for a cold third-party script on a slow connection, short enough
 * that a blocked one does not read as a broken app.
 */
const AUTH_BOOT_TIMEOUT_MS = 4000;

async function openStartingMap() {
  if (!mindMapClient.available) return false;

  // WAIT for Clerk before concluding anybody is signed out.
  //
  // This is why signing in never seemed to stick. Clerk was only ever loaded
  // lazily — by getToken(), or by opening the Account panel — so at boot
  // getAuthState() reported signedIn:false for the perfectly ordinary reason
  // that nothing had asked yet. This function read that as "not signed in",
  // returned early, and the demo pattern loaded over a session that was still
  // valid. The user then signed in again and reopened their map by hand, every
  // single refresh, because the app never asked the question it was answering.
  //
  // Bounded, because boot must not hang on it: the same lesson as the API's
  // startup_db_timeout_seconds, where a promise that never settles turned a
  // slow dependency into a dead app. A Clerk that is slow or blocked costs a
  // few seconds and then falls through to the same place it used to reach
  // immediately.
  if (hasAuth()) {
    try {
      await Promise.race([
        loadAuth(),
        new Promise((resolve) => setTimeout(resolve, AUTH_BOOT_TIMEOUT_MS)),
      ]);
    } catch {
      // A failed load is a signed-out session, which the next line handles.
    }
    if (!getAuthState().signedIn) return false;
  }

  try {
    // The map the user chose, if they chose one. The API returns the pointer only while
    // it still resolves to a map they own, so a deleted default reads as "no default"
    // rather than as a failure on every sign-in for evermore.
    let chosen = null;
    try {
      chosen = (await feedClient.getProfile())?.default_map_id ?? null;
    } catch {
      // A profile that will not load is not a reason to open nothing.
    }

    if (chosen) {
      const opened = await mapsPanel.loadMap(chosen);
      if (opened) {
        showNotification(`Opened your default map, "${opened.title}"`);
        return true;
      }
      // Fall through rather than giving up: whatever went wrong with the default, the
      // most recently edited map is a better outcome than the generated demo.
    }

    // Then where they actually were. After the starred default, not before: a star
    // is a stated preference for what opens, and glancing at another map should not
    // quietly replace it. Without a star, "where I left off" is the right answer.
    const last = MapsPanel.readLastMapId();
    if (last && last !== chosen) {
      const opened = await mapsPanel.loadMap(last);
      if (opened) {
        showNotification(`Reopened "${opened.title}"`);
        return true;
      }
      // Deleted, or no longer yours. Forget it rather than trying again next time.
      MapsPanel.rememberLastMapId(null);
    }

    const maps = await mindMapClient.listMyMaps({ limit: 1 });
    if (!maps?.length) return false;

    const opened = await mapsPanel.loadMap(maps[0].id);
    if (!opened) return false;

    showNotification(`Opened "${maps[0].title}"`);
    return true;
  } catch (error) {
    console.warn('Could not open a starting map:', error.message);
    return false;
  }
}

/**
 * The browser's install prompt, held for when the user asks for it.
 *
 * `beforeinstallprompt` fires once, early, and the event is the ONLY way to show the
 * prompt — it cannot be re-created later. So it is captured the moment it arrives and kept.
 * Losing it means the Install entry can only tell the user to use the browser menu.
 */
let installPrompt = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without this the browser shows its own mini-infobar, and then the app has two
    // competing ways to install it.
    event.preventDefault();
    installPrompt = event;
    refreshDock();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    showNotification('Fractality Platform is installed.');
    refreshDock();
  });
}

/** The graph currently on screen, or null before the 3D view has booted. */
function currentGraph() {
  return fractalityEngine?.nodeGraph ?? null;
}

/** Hand the browser a file to save. */
function downloadFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** A filename stem safe on every platform. */
function fileStem() {
  const title = mapsPanel.currentMap?.title || 'fractality-map';
  return title.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'fractality-map';
}

/**
 * Export the map on screen as JSON.
 *
 * Exports `fractalityEngine.nodeGraph` — the graph actually being displayed.
 * This used to export `nodeBridge.exportForCLI()`, which reads the CLI bridge's
 * own node collection. That collection is only populated by the local Python
 * helper, so in production it held nothing and Export wrote a file containing
 * zero nodes. Silently: a valid JSON document with an empty array.
 */
function exportMapJson() {
  const graph = currentGraph();
  if (!graph || graph.nodes.size === 0) {
    showNotification('Nothing to export — open a map first', 'warning');
    return;
  }

  const payload = graph.toJSON();
  downloadFile(`${fileStem()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  showNotification(`Exported ${payload.nodes.length} nodes as JSON`);
}

/**
 * Export the map on screen as Turtle (RDF).
 *
 * The interchange format: SKOS concepts, so tools nobody here wrote can read it.
 * See src/data/turtle.js for why it sits alongside JSON rather than replacing it.
 */
async function exportMapTurtle() {
  const graph = currentGraph();
  if (!graph || graph.nodes.size === 0) {
    showNotification('Nothing to export — open a map first', 'warning');
    return;
  }

  try {
    // Lazily imported: the Turtle library must not sit in the initial bundle for
    // the sake of a button most visitors never press.
    const { graphToTurtle } = await import('./data/turtle.js');
    const title = mapsPanel.currentMap?.title || 'Fractality map';
    const mapId = mapsPanel.currentMap?.id || 'local';

    const turtle = await graphToTurtle(graph, { title, mapId });
    downloadFile(`${fileStem()}.ttl`, turtle, 'text/turtle');
    showNotification(`Exported ${graph.nodes.size} nodes as Turtle`);
  } catch (error) {
    console.error('Turtle export failed:', error);
    showNotification(`Turtle export failed: ${error.message}`, 'error');
  }
}

/**
 * Import a map from a file, detecting JSON or Turtle from the contents.
 *
 * One button rather than two: the user already has a file, so asking which
 * format it is only invites the wrong answer.
 */
function showImportDialog() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.ttl,.turtle,application/json,text/turtle';

  input.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const looksLikeTurtle = /\.ttl$|\.turtle$/i.test(file.name)
        // Sniff the content too, since a .txt full of Turtle should still work
        // and a mislabelled .json should not be parsed as RDF.
        || /^\s*(@prefix|@base|PREFIX|BASE)\s/im.test(text);

      const { graph, title, warnings } = looksLikeTurtle
        ? await importTurtleText(text)
        : importJsonText(text);

      if (!graph || graph.nodes.size === 0) {
        showNotification('That file contained no nodes', 'warning');
        return;
      }

      if (!fractalityEngine) {
        AppState.setView('bubble');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await fractalityEngine.loadData(graph);
      // An imported map is not the saved cloud map any more, so clear that link
      // rather than letting a later Overwrite write over the wrong thing.
      mapsPanel.currentMap = null;

      for (const warning of warnings ?? []) showNotification(warning, 'warning');
      showNotification(
        `Imported ${graph.nodes.size} nodes${title ? ` from "${title}"` : ''}`
      );
    } catch (error) {
      console.error('Import failed:', error);
      showNotification(`Import failed: ${error.message}`, 'error');
    }
  });

  input.click();
}

/** Parse our JSON export. Also accepts a CLI export, whose node shape matches. */
function importJsonText(text) {
  const data = JSON.parse(text);
  const nodes = Array.isArray(data) ? data : data.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error('No "nodes" array in that JSON file');
  }
  return { graph: NodeGraph.fromJSON({ nodes }), title: data.title ?? null, warnings: [] };
}

/** Parse a Turtle file. The library is loaded only when one is actually opened. */
async function importTurtleText(text) {
  const { turtleToGraph } = await import('./data/turtle.js');
  return turtleToGraph(text);
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
    } else if (await openStartingMap()) {
      // Your own most recent map, which is almost always what you came back for.
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

    // The cone is the DEFAULT SCREEN, not an overlay you summon.
    //
    // Opened here, after the map is in the graph, so the first frame shows the
    // map rather than an empty cone that fills in a moment later.
    //
    // This also stops the 3D scene rendering — the cone's onVisibilityChange
    // pauses the engine, and engine.update() returns immediately while paused, so
    // no Three.js work happens at all. The shaded spheres behind everything were
    // the old default view, still drawing frames for a picture nobody was looking
    // at. The engine stays alive because it owns the graph, the focus and the
    // CACE state; what stops is the rendering.
    coneView.show();
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

  // Registered after the dock exists, so the "new version ready" notification has
  // somewhere to appear. Deliberately not awaited: nothing on screen depends on it, and
  // boot must not wait on a worker install.
  registerServiceWorker((message, type) => showNotification(message, type));
  
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
window.nodeManagerPanel = nodeManagerPanel;
window.coneView = coneView;
window.bubbleView = bubbleView;
window.feedPanel = feedPanel;
window.accountPanel = accountPanel;
