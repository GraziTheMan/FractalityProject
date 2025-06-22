import { sendChat } from './chat-client.js';

export function initChatUI(containerId) {
  const c = document.getElementById(containerId);
  c.innerHTML = `
    <div id="chatMessages" style="flex:1; overflow-y:auto; padding:0.5rem;"></div>
    <div style="display:flex; padding:0.5rem;">
      <input type="text" id="chatInput" placeholder="Type..." style="flex:1; padding:0.5rem;"/>
      <button id="chatSend">Send</button>
    </div>`;

  document.getElementById('chatSend').onclick = () => {
    const v = document.getElementById('chatInput').value.trim();
    if (v) {
      sendChat(v);
      document.getElementById('chatInput').value = '';
    }
  };

  window.addEventListener('chat:message', e => {
    const m = e.detail;
    const el = document.createElement('div');
    el.textContent = m.text;
    el.style.padding = '0.25rem';
    document.getElementById('chatMessages').appendChild(el);
    c.scrollTop = c.scrollHeight;
  });
}
