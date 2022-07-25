import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [solidPlugin(), viteCompression()],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
});
