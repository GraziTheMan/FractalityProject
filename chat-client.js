import { io } from 'https://cdn.socket.io/4.7.2/socket.io.esm.min.js';

export const chatSocket = io('https://YOUR_CHAT_SERVER_URL');

chatSocket.on('connect', () => console.log('Chat connected:', chatSocket.id));
chatSocket.on('message', msg => {
  const event = new CustomEvent('chat:message', { detail: msg });
  window.dispatchEvent(event);
});

export function sendChat(text) {
  chatSocket.emit('message', { text, timestamp: Date.now() });
}
