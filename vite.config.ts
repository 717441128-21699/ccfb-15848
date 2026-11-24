import { defineConfig } from 'vite';

// 相对 base，便于静态部署到任意子路径
export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
