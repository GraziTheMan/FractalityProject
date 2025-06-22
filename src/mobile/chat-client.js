import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const socket = io('http://192.168.50.212:3000'); // update for your deployment URL

const log = document.getElementById('chatLog');
const input = document.getElementById('chatInput');
const send = document.getElementById('chatSend');

// Display incoming messages
socket.on('message', data => {
  const el = document.createElement('div');
  el.textContent = `${data.sender}: ${data.text}`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
});

// Send message
send.addEventListener('click', () => {
  const msg = input.value.trim();
  if (msg) {
    socket.emit('message', { text: msg });
    input.value = '';
  }
});
