// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  // Relative base so the build can be served from a subpath as well as root
  base: './',

  server: {
    port: 3000,
    open: true,
    host: true // Allow external connections (phone on the same network)
  },

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,

    rollupOptions: {
      input: {
        // index.html at the repo root loads src/main.js
        main: './index.html'
      }
    }
  },

  optimizeDeps: {
    include: ['three']
  },

  esbuild: {
    sourcemap: true
  }
});
