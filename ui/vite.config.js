import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 34430,
    proxy: {
      '/api': {
        target: 'http://localhost:17356',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:17356',
        ws: true,
      },
      '/tunnel_ws': {
        target: 'ws://localhost:17356',
        ws: true,
      },
    },
  },
});
