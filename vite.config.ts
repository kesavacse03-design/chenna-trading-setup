import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// https://vitejs.dev/config/
const FAST_DEV = process.env.FAST_DEV === '1';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    },
    // Prevent Vite from watching backend/log files which can trigger endless rebuilds
    // (especially when backend writes rotating logs inside the workspace)
    watch: {
      // chokidar ignored patterns
      ignored: [
        '**/chenna-CTS/backend/**',
        '**/backend/**',
        '**/logs/**',
  '**/*.log',
  // add broader ignores for generated artifacts frequently updated by other processes
  '**/jobs/**',
  '**/reports/**',
  '**/coverage/**',
  '**/tmp/**',
  // common top-level temp artifacts in this repo
  '**/tmp_*.json',
  '**/tmp_*.txt',
  '**/server-*.log',
  '**/server_*.log',
  '**/server_smoke.log'
      ]
    },
  hmr: FAST_DEV ? false : true,
  open: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    }
  },
  optimizeDeps: {
    exclude: [
      'node-fetch',
      // Backend-specific modules that might be imported somewhere in the monorepo
      'fs', 'path'
    ]
  }
});