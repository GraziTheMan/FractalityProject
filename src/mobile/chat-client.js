import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const socket = io("https://thefractalityplatform.onrender.com");

// Generate or retrieve a persistent guest username
function generateUsername() {
  const prefixes = ["Fractalite", "SpiralNoder", "ThinkSeed", "MindNode", "EchoSpark"];
  const emoji = ["🌱", "🧠", "🌌", "💡", "🔮"];
  const i = Math.floor(Math.random() * prefixes.length);
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `${emoji[i]} ${prefixes[i]}-${suffix}`;
}

const username = localStorage.getItem("fractality-username") || (() => {
  const name = generateUsername();
  localStorage.setItem("fractality-username", name);
  return name;
})();

export function initChatUI(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <div id="chatLog" style="flex:1; overflow-y:auto; padding:10px; background:#111; border-radius:4px;"></div>
    <div style="display:flex; padding:10px; gap:6px;">
      <input id="chatInput" type="text" placeholder="Message..." style="flex:1; padding:0.5rem;" />
      <button id="chatSend">Send</button>
    </div>
  `;

  const log = document.getElementById("chatLog");
  const input = document.getElementById("chatInput");
  const send = document.getElementById("chatSend");

  socket.on("message", (data) => {
    const el = document.createElement("div");
    el.textContent = `${data.sender}: ${data.text}`;
    el.style.marginBottom = "0.5rem";
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  });

  send.addEventListener("click", () => {
    const msg = input.value.trim();
    if (msg) {
      socket.emit("message", { sender: username, text: msg });
      input.value = "";
    }
  });

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") send.click();
  });
}
