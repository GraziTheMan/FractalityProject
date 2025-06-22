const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }  // Allow all origins (for testing)
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

server.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
