import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The admin talks to the MEMI backend. In dev we proxy /api to the local
// backend (docker compose exposes it on :3000) so the app is same-origin and
// the HttpOnly admin cookie flows exactly like production.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:3000',
        changeOrigin: true,
        // The local Docker backend runs NODE_ENV=production, whose CORS allowlist
        // rejects a dev origin. Strip the Origin header so proxied calls look
        // same-origin (no Origin → allowed), matching how nginx serves in prod.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
