document.getElementById('toggleDrawer').addEventListener('click', () => {
  const drawer = document.getElementById('menuDrawer');
  drawer.classList.toggle('visible');
});

const modules = {
  bubble: renderBubbleView,
  chat: renderChatView,
  cone: renderConeView,
  editor: renderEditorView,
};

document.querySelectorAll('#menuDrawer button').forEach(btn => {
  btn.addEventListener('click', () => {
    const moduleName = btn.dataset.module;
    loadModule(moduleName);
    document.getElementById('menuDrawer').classList.remove('visible');
  });
});

function loadModule(name) {
  const container = document.getElementById('moduleContainer');
  container.innerHTML = '';
  modules[name]?.(container);
}

function renderBubbleView(container) {
  container.innerHTML = '<h2>🧠 Bubble View</h2><p>This will render the dynamic node graph.</p>';
}

import { initChatUI } from './chat-ui.js';
function renderChatView(container) {
  initChatUI("moduleContainer");
}

function renderConeView(container) {
  container.innerHTML = '<h2>🔺 Cone View</h2><p>This module is under development.</p>';
}

function renderEditorView(container) {
  container.innerHTML = `
    <h2>🛠️ Node Editor</h2>
    <div id="editorTabs">
      <button class="tab active" data-tab="human">🧍 Human Edit</button>
      <button class="tab" data-tab="ai">🤖 AI Edit</button>
    </div>
    <div id="humanEditor" class="editor-tab">Manual editing interface coming soon.</div>
    <div id="aiEditor" class="editor-tab hidden">
      <textarea id="aiInput" placeholder="Paste AI output..."></textarea>
      <button id="submitAiInput">Apply</button>
    </div>
  `;

  document.querySelectorAll('#editorTabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.editor-tab').forEach(div => div.classList.add('hidden'));
      document.querySelectorAll('#editorTabs .tab').forEach(tab => tab.classList.remove('active'));
      document.getElementById(`${btn.dataset.tab}Editor`).classList.remove('hidden');
      btn.classList.add('active');
    });
  });

  document.getElementById('submitAiInput').addEventListener('click', () => {
    const text = document.getElementById('aiInput').value.trim();
    if (!text) return;
    console.log('[AI Drawer] Command received:', text);
    alert('AI input received:\n' + text);
  });
}

window.onload = () => loadModule('bubble');
