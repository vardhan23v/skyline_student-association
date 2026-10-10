import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // Dev only: proxy /api to the backend. In production Express serves both from one origin (§15).
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
