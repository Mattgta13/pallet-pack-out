import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative asset paths, so the build works from any folder (e.g. GitHub Pages at /repo-name/).
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  server: { port: 5173 },
});
