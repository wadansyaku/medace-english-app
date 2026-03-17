import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = decodeURIComponent(new URL('.', import.meta.url).pathname);

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react-vendor';
          }
          if (id.includes('/lucide-react/')) {
            return 'icons';
          }
          if (id.includes('/@google/genai/')) {
            return 'ai-vendor';
          }
          return 'vendor';
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': projectRoot,
    }
  }
});
