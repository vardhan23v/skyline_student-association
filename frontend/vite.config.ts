/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { imagetools } from 'vite-imagetools';

/** Site origin for index.html's canonical / Open Graph URLs. Set VITE_APP_URL before the build (Railway variable);
 *  unset, the links stay relative ("/"), which is fine locally but link previews need the absolute URL. */
const appUrl = (process.env.VITE_APP_URL ?? '').trim().replace(/\/+$/, '');

export default defineConfig({
  plugins: [react(), tailwindcss(), imagetools(), { name: 'app-url', transformIndexHtml: (html) => html.replaceAll('__APP_URL__', appUrl) }],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // Dev only: proxy /api to the backend. In production Express serves both from one origin (§15).
  // fs.allow: the password checklist imports the backend's rules file and common-password list (../backend).
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' }, fs: { allow: ['..'] } },
  // Keep the chart, camera and QR libraries out of the main bundle; they are only needed on a few routes (the camera
  // reader only on the admin scanner, so it is split from the QR generator /me uses). React gets its own chunk: left
  // to Rollup, react-dom landed inside `charts` and every page preloaded the chart library.
  // `npm test`: unit tests for plain modules in src/lib (node environment, no DOM).
  test: { include: ['src/**/*.test.ts'] },
  build: { rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'], scanner: ['html5-qrcode'], qrcode: ['qrcode'], motion: ['framer-motion', 'lenis'] } } } },
});
