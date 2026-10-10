import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { imagetools } from 'vite-imagetools';

export default defineConfig({
  plugins: [react(), tailwindcss(), imagetools()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // Dev only: /api is proxied to a backend on :3000. There is no backend in the repo yet; API calls fail until one exists.
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  // Keep the chart and camera libraries out of the main bundle; they are only needed on a few routes.
  build: { rollupOptions: { output: { manualChunks: { charts: ['recharts'], qr: ['html5-qrcode', 'qrcode'], motion: ['framer-motion', 'lenis'] } } } },
});
