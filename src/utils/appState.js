// src/utils/appState.js

/**
 * AppState - the view router and tiny event bus the app is built around.
 *
 * main.js does `AppState.on('viewChanged', ...)` to lazily boot the 3D engine
 * the first time the 'bubble' view is opened, so `on` and the 'viewChanged'
 * emit are load-bearing: without them the visualizer never initializes.
 */
export const AppState = {
  currentView: null,

  /** Set by main.js when a search result should be focused after the view swaps. */
  pendingNavigation: null,

  _listeners: new Map(),

  /**
   * Subscribe to a state event. Returns an unsubscribe function.
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);

    return () => this.off(event, handler);
  },

  off(event, handler) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;

    handlers.delete(handler);
    if (handlers.size === 0) this._listeners.delete(event);
  },

  emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (!handlers) return;

    // Copy first: a handler may unsubscribe itself while we iterate
    for (const handler of [...handlers]) {
      try {
        // Handlers may be async (the viewChanged one is); surface rejections
        // instead of letting them become unhandled.
        Promise.resolve(handler(payload)).catch(error => {
          console.error(`AppState: error in "${event}" handler:`, error);
        });
      } catch (error) {
        console.error(`AppState: error in "${event}" handler:`, error);
      }
    }
  },

  /**
   * Switch the active view. Idempotent: re-setting the current view is a no-op.
   */
  setView(view) {
    if (view === this.currentView) return;

    const previous = this.currentView;
    this.currentView = view;

    this._renderView(view);
    this.emit('viewChanged', view, previous);
  },

  /**
   * Show the right surface for a view.
   *
   * The 3D canvas lives inside #content-view, so this must never clobber
   * #content-view's innerHTML — doing so would delete the canvas the engine
   * is holding a reference to. Placeholder text goes in its own element.
   */
  _renderView(view) {
    const canvas = document.getElementById('fractality-canvas');
    const content = document.getElementById('content-view');
    if (!content) return;

    const isBubble = view === 'bubble';

    if (canvas) {
      canvas.style.display = isBubble ? 'block' : 'none';
    }

    let placeholder = document.getElementById('view-placeholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = 'view-placeholder';
      placeholder.style.padding = '2rem';
      content.appendChild(placeholder);
    }

    if (isBubble) {
      placeholder.style.display = 'none';
      placeholder.textContent = '';
    } else {
      // A fallback that should never be seen. 'bubble' — the 3D canvas — is the
      // only view anything was ever built for, and it is the only one the dock
      // asks for. The radial menu used to request eight others, and this branch
      // is what answered: "Switched to: <name>" printed over the scene, which is
      // what made those buttons look broken. If this ever appears, a caller is
      // asking for a view that does not exist.
      placeholder.style.display = 'block';
      placeholder.textContent = `No view built for "${view}"`;
    }
  }
};
