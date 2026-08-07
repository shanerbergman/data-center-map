import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true },
  build: {
    // mapbox-gl is ~800 kB on its own; splitting it keeps the app chunk small
    // and lets the basemap library cache independently of app code.
    rollupOptions: {
      output: {
        manualChunks: {
          mapbox: ['mapbox-gl'],
          mui: ['@mui/material'],
        },
      },
    },
  },
});
