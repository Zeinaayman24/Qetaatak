import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Served from GitHub Pages at /Qetaatak/manage/ next to the customer app.
export default defineConfig({
  base: '/Qetaatak/manage/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
