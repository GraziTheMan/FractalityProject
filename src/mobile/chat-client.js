// src/mobile/chat-client.js
//
// Realtime chat transport.
//
// Three things were wrong with the previous version and are worth not
// reintroducing:
//
//   1. It hardcoded a specific deployment host, so any new deploy silently
//      talked to the old one. The endpoint now comes from VITE_SOCKET_URL and
//      chat is simply disabled when that is unset.
//   2. It connected at module *import* time, so merely importing this file
//      opened a socket. Connection is now explicit/lazy.
//   3. It loaded socket.io from a CDN at runtime, which a strict CSP blocks and
//      which puts a third party in the critical path. The client now comes from
//      npm via a dynamic import, so it is also code-split out of the main
//      bundle and only fetched when chat is actually used.

import { deployConfig, hasRealtime } from '../config/deploy.js';

const USERNAME_KEY = 'fractality-username';

/** Generate a persistent guest username. */
function generateUsername() {
  const prefixes = ['Fractalite', 'SpiralNoder', 'ThinkSeed', 'MindNode', 'EchoSpark'];
  const emoji = ['🌱', '🧠', '🌌', '💡', '🔮'];
  const i = Math.floor(Math.random() * prefixes.length);
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `${emoji[i]} ${prefixes[i]}-${suffix}`;
}

export function getUsername() {
  let name = localStorage.getItem(USERNAME_KEY);
  if (!name) {
    name = generateUsername();
    localStorage.setItem(USERNAME_KEY, name);
  }
  return name;
}

let socket = null;
let connecting = null;

/**
 * Connect to the realtime endpoint. Idempotent; concurrent callers share one
 * in-flight connection. Resolves to null when realtime is not configured.
 */
export async function connectChat() {
  if (socket) return socket;
  if (connecting) return connecting;

  if (!hasRealtime()) {
    console.info('💬 Chat: no VITE_SOCKET_URL configured, realtime disabled');
    return null;
  }

  connecting = (async () => {
    // Dynamic import keeps socket.io-client out of the initial bundle
    const { io } = await import('socket.io-client');
    socket = io(deployConfig.socketUrl, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => console.log('💬 Chat: connected'));
    socket.on('connect_error', (err) =>
      console.warn('💬 Chat: connection error', err.message));

    return socket;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export function disconnectChat() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Facade with the socket.io surface the rest of the app uses.
 *
 * Handlers registered before connection are buffered and attached once the
 * socket exists, and every method is a safe no-op when realtime is disabled.
 * This is what `chat-ai-hub.js` imports — the previous version of this file
 * never exported it at all, so that import resolved to undefined.
 */
const pendingHandlers = [];

export const chatSocket = {
  on(event, handler) {
    if (socket) {
      socket.on(event, handler);
      return;
    }

    pendingHandlers.push([event, handler]);

    // Attach buffered handlers as soon as a connection is available
    connectChat().then((s) => {
      if (!s) return;
      while (pendingHandlers.length) {
        const [e, h] = pendingHandlers.shift();
        s.on(e, h);
      }
    });
  },

  emit(event, payload) {
    if (socket) {
      socket.emit(event, payload);
      return;
    }

    connectChat().then((s) => {
      if (s) s.emit(event, payload);
    });
  },

  get connected() {
    return Boolean(socket?.connected);
  }
};

export function initChatUI(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div id="chatLog" style="flex:1; overflow-y:auto; padding:10px; background:#111; border-radius:4px;"></div>
    <div style="display:flex; padding:10px; gap:6px;">
      <input id="chatInput" type="text" placeholder="Message..." style="flex:1; padding:0.5rem;" />
      <button id="chatSend">Send</button>
    </div>
  `;

  const log = document.getElementById('chatLog');
  const input = document.getElementById('chatInput');
  const send = document.getElementById('chatSend');
  const username = getUsername();

  if (!hasRealtime()) {
    const notice = document.createElement('div');
    notice.textContent = 'Chat is offline: no realtime server configured.';
    notice.style.color = '#888';
    log.appendChild(notice);
    input.disabled = true;
    send.disabled = true;
    return;
  }

  const appendMessage = (sender, text) => {
    const el = document.createElement('div');
    // textContent, not innerHTML: message bodies are untrusted user input
    el.textContent = `${sender}: ${text}`;
    el.style.marginBottom = '0.5rem';
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  };

  chatSocket.on('message', (data) => appendMessage(data.sender, data.text));

  const submit = () => {
    const msg = input.value.trim();
    if (!msg) return;
    chatSocket.emit('message', { sender: username, text: msg });
    input.value = '';
  };

  send.addEventListener('click', submit);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submit();
  });

  connectChat();
}
