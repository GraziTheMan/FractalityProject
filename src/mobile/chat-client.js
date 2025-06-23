// src/mobile/chat-client.js
import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

let socket;
try {
  socket = io("https://thefractalityplatform.onrender.com");
} catch (err) {
  window.dispatchEvent(new CustomEvent('chat:error', { detail: { message: "Failed to load chat server" } }));
}

const sendChat = (msg) => {
  if (socket && socket.connected) {
    socket.emit('message', { text: msg });
  } else {
    window.dispatchEvent(new CustomEvent('chat:error', { detail: { message: "Not connected to chat server." } }));
  }
};

window.sendChat = sendChat; // for import in chat-ui.js

if (socket) {
  // Display incoming messages
  socket.on('message', data => {
    window.dispatchEvent(new CustomEvent('chat:message', { detail: data }));
  });

  // Handle connection errors
  socket.on('connect_error', () => {
    window.dispatchEvent(new CustomEvent('chat:error', { detail: { message: "Connection to chat server failed" } }));
  });
  socket.on('disconnect', () => {
    window.dispatchEvent(new CustomEvent('chat:error', { detail: { message: "Disconnected from chat server" } }));
  });
}

export { sendChat };
