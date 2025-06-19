// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  
  server: {
    port: 3000,
    open: true,
    host: true, // Allow external connections
  },
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  },
  
  optimizeDeps: {
    include: ['three']
  },
  
  // Enable better errors
  esbuild: {
    sourcemap: true
  }
});