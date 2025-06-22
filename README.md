# 🌌 The Fractality Platform V1.0.0

**“A Living Modular Interface for Mind, Meaning, and Machines”**  
Welcome to the official repository of The Fractality Platform — a mobile-first, modular, real-time system for exploring collective intelligence, symbolic cognition, and cross-lifeform collaboration.

---

## 🧠 What is Fractality?

Fractality is a platform for:
- 🌐 Real-time social mind-mapping
- 🤖 AI-assisted node editing, interaction, and graph syncing
- 📲 Mobile-first multi-user experiences
- 💬 Human ↔ AI chat protocols and node logic via chat interface
- 🧩 Modular component-based architecture (Three.js, Vite, Socket.IO)

---

## 🚀 Features

- 📱 Touch-optimized mobile UI with node editor and gestures
- 🗣️ Real-time chat system with optional AI agent integration
- 🧠 Dynamic node graph visualization & animation system
- 🧬 Modular file structure for fast iteration
- 🛰️ Full local + deployable server architecture

---

## 📁 Folder Structure

```bash
/
├── index.html              # Optional desktop entry point
├── mobile.html             # Primary mobile-first UI
├── package.json            # Frontend dependencies (Vite, Three.js)
├── vite.config.js
├── /src/                   # All JS modules
│   ├── main/               # init.js, graph entry logic
│   ├── visualization/      # AnimationSystem.js, rendering logic
│   ├── mobile/             # All mobile modules (chat, AI, UI)
│   └── ...                 # (similarity_engine, protocols, etc.)
├── /server/                # Backend Node.js chat server
│   ├── server.js
│   ├── package.json
│   └── README.md
```

---

## 🛠️ How to Run Locally

### Frontend (Vite)

```bash
npm install
npm run dev
```

Visit: [http://localhost:5173/mobile.html](http://localhost:5173/mobile.html)

---

### Backend (Node.js Chat Server)

```bash
cd server
npm install
npm start
```

Backend runs at: `http://localhost:3000`

---

## 🌐 Deployment

| Component | Recommended Host |
|----------|------------------|
| Frontend | GitHub Pages / Netlify / Vercel |
| Backend  | Render / Glitch / Railway |

Update `chat-client.js` to point to your backend URL:
```js
const chatSocket = io('https://your-backend-url.com');
```

---

## 🤝 Contributing

Pull requests welcome! Please:
- Keep modules self-contained
- Use clear comments and naming
- Fork and submit from feature branches

---

## 🧬 License

MIT © The Fractality Collective  
Initiated by [@GraziTheMan](https://github.com/GraziTheMan)

*Built with vision, intention, and resonance.*

---

**Authored by: FractiGPT**  
_Modular Systems Architect for the Fractality Project_
