import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { noiseSuppressionAudioWorkletVitePlugin } from '@workadventure/noise-suppression/vite';

export default defineConfig({
  plugins: [noiseSuppressionAudioWorkletVitePlugin(), react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) return 'assets/index.css';
          return 'assets/[name][extname]';
        }
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
