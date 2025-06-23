// src/mobile/chat-ui.js
import { sendChat } from './chat-client.js';

export function initChatUI(containerId) {
  const c = document.getElementById(containerId);
  c.innerHTML = `
    <div id="chatMessages" style="flex:1; overflow-y:auto; padding:0.5rem; margin-bottom:0.5rem;"></div>
    <div style="display:flex; padding:0.5rem 0.5rem 1rem 0.5rem;">
      <input type="text" id="chatInput" placeholder="Type a message..." autocomplete="off" style="flex:1; padding:0.5rem; border-radius:4px; border:none;"/>
      <button id="chatSend" style="margin-left:0.5rem; padding:0.5rem 1rem; border-radius:4px; border:none; background:#00bfff; color:#fff;">Send</button>
    </div>
  `;

  const input = c.querySelector('#chatInput');
  const send = c.querySelector('#chatSend');
  const messagesDiv = c.querySelector('#chatMessages');

  // Send on button click or Enter
  function trySend() {
    const value = input.value.trim();
    if (value) {
      sendChat(value);
      input.value = '';
    }
  }
  send.onclick = trySend;
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      trySend();
    }
  });

  // Display chat messages
  window.addEventListener('chat:message', e => {
    const m = e.detail;
    const el = document.createElement('div');
    el.textContent = m.text;
    el.style.padding = '0.25rem';
    el.style.wordBreak = 'break-word';
    messagesDiv.appendChild(el);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  // Optionally: clear error on input
  input.addEventListener('input', () => {
    const errDiv = document.querySelector('.chat-error');
    if (errDiv) errDiv.remove();
  });
}
