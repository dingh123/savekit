import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  root: __dirname,
  // GitHub Pages serves from /savekit/; local dev stays at /.
  base: command === 'build' ? '/savekit/' : '/',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}));
