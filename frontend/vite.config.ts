import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // Dev only: proxy /api to the backend. In production Express serves both from one origin (§15).
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  // Keep the chart and camera libraries out of the main bundle; they are only needed on a few routes.
  build: { rollupOptions: { output: { manualChunks: { charts: ['recharts'], qr: ['html5-qrcode', 'qrcode'] } } } },
});
