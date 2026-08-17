
export const AppState = {
  currentView: 'bubble',
  setView(view) {
    this.currentView = view;
    const content = document.getElementById('content-view');
    content.innerHTML = `<div style='padding: 2rem;'>Switched to: <strong>${view}</strong></div>`;
  }
};
