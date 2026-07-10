// Central application state with a minimal event emitter.
// Views subscribe with AppState.on('viewChanged', cb); AppState.setView(v)
// updates state and notifies subscribers (e.g. main.js lazily boots the
// Fractality engine when the view becomes 'bubble').

export const AppState = {
  currentView: 'bubble',
  pendingNavigation: null,

  // --- event emitter ---
  _listeners: {},

  on(event, handler) {
    (this._listeners[event] ||= []).push(handler);
    return this;
  },

  off(event, handler) {
    const list = this._listeners[event];
    if (list) this._listeners[event] = list.filter((h) => h !== handler);
    return this;
  },

  emit(event, ...args) {
    (this._listeners[event] || []).forEach((h) => {
      try {
        h(...args);
      } catch (err) {
        console.error(`AppState listener for "${event}" threw:`, err);
      }
    });
    return this;
  },

  // --- state ---
  setView(view) {
    if (this.currentView === view) return;
    this.currentView = view;

    const content = document.getElementById('content-view');
    if (content) {
      content.innerHTML = `<div style='padding: 2rem;'>Switched to: <strong>${view}</strong></div>`;
    }

    this.emit('viewChanged', view);
  },
};
