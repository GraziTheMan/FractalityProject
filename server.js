const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { fileURLToPath } = require('url');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Ensure JS modules are served with the correct MIME type
// (must run before express.static so the header sticks).
app.use((req, res, next) => {
  if (req.path.endsWith('.js')) {
    res.type('application/javascript');
  }
  next();
});

// Serve all project files statically from the repo root so the app can
// reach /public, /src and /vendor with the relative paths it already uses.
app.use(express.static(path.join(__dirname)));

// The canonical app entry lives in public/. Send the root URL there so its
// relative asset paths (./main.js, ../src/*, ../vendor/*) resolve correctly.
app.get('/', (req, res) => {
  res.redirect('/public/index.html');
});

io.on('connection', socket => {
  console.log('✅ New connection:', socket.id);

  socket.on('message', data => {
    console.log('💬', data);
    io.emit('message', { ...data, sender: data.sender || socket.id });
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Server root directory: ${__dirname}`);
});
