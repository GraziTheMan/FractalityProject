const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); // Add this

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Add these lines to serve static files
app.use(express.static(__dirname));

// Add a route for chat.html
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'chat.html'));
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
});
