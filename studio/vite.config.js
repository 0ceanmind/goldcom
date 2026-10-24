import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const API = `http://127.0.0.1:${process.env.PORT || 5177}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_PORT || 5173),
    proxy: { '/api': { target: API, changeOrigin: true }, '/assets': { target: API, changeOrigin: true }, '/modules': { target: API, changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'static',
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), render: resolve(__dirname, 'render.html') } },
  },
});
