import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 34430,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:17356',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:17356',
        ws: true,
      },
      '/tunnel_ws': {
        target: 'ws://127.0.0.1:17356',
        ws: true,
      },
    },
  },
});
