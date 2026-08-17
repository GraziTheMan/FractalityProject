// server.js - static host + socket.io relay for the Fractality Platform.
//
// Two modes:
//   * If dist/ exists (after `npm run build`) it is served. This is the
//     production path, and the only one where bare imports like `three`
//     resolve, because Vite has rewritten them.
//   * Otherwise the repo root is served so you can poke at files directly.
//     Note that the 3D visualizer will NOT run this way — browsers cannot
//     resolve `import * as THREE from 'three'` without a bundler. Use
//     `npm run dev` for development.

import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || '*' }
});

const distDir = path.join(__dirname, 'dist');
const hasBuild = fs.existsSync(path.join(distDir, 'index.html'));
const rootDir = hasBuild ? distDir : __dirname;

app.use(express.static(rootDir));

// SPA fallback. Restricted to GET requests that expect HTML so that a missing
// asset returns a real 404 instead of index.html, which otherwise shows up as
// a confusing "Unexpected token '<'" parse error in the browser console.
app.get('*', (req, res, next) => {
  if (!req.accepts('html')) return next();
  if (path.extname(req.path)) return next();

  res.sendFile(path.join(rootDir, 'index.html'), (err) => {
    if (err) next(err);
  });
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
  console.log(`   Serving: ${rootDir}`);
  if (!hasBuild) {
    console.warn('   ⚠  No dist/ build found. Run "npm run build" for a working');
    console.warn('      visualizer, or "npm run dev" for the Vite dev server.');
  }
});
