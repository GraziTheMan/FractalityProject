const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static files from root directory
app.use(express.static(path.join(__dirname)));

// Explicitly handle /chat route
app.get('/chat', (req, res) => {
  console.log('Serving chat.html from:', path.join(__dirname, 'chat.html'));
  res.sendFile(path.join(__dirname, 'chat.html'));
});

// Handle other routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/src/')) {
    // Handle requests for files in src directory
    res.sendFile(path.join(__dirname, req.path));
  } else {
    // Default to index.html for other routes
    res.sendFile(path.join(__dirname, 'index.html'));
  }
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
