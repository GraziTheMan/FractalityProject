
import { RadialMenu } from './components/radialMenu.js';
import { AppState } from './utils/appState.js';
import { setupMirrorToggle } from './components/mirrorToggle.js';

document.getElementById('state-indicator').innerText = 'State: Balanced';
document.getElementById('desktop-dock').innerText = 'Desktop Dock Placeholder';

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

setupMirrorToggle(menu);
