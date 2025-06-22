# Fractality Chat Server (Node.js)

This is a minimal backend server for enabling real-time chat and AI interaction in the Fractality Project.

## 🧠 What it does
- Accepts incoming chat messages
- Broadcasts messages to all connected clients (including AI bots)
- Powers the `/chat-client.js` frontend module

## 🚀 How to Use

### 1. Install Node.js
Visit: https://nodejs.org and install the LTS version.

### 2. Install dependencies
Run in terminal:
```bash
npm install
```

### 3. Start the server
```bash
npm start
```

By default, the server runs at:
```
http://localhost:3000
```

### 4. Deploy Publicly (Optional)
Use services like:
- https://glitch.com
- https://render.com
- https://railway.app

### 5. Update your frontend
In `chat-client.js`, change the URL:
```js
const chatSocket = io('http://localhost:3000'); // or your public URL
```

You're now ready to chat live between devices! 🎉
