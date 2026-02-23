import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // necesario para que Docker exponga el puerto
    port: 5173,
    watch: {
      usePolling: true,   // necesario en WSL2 donde inotify no detecta cambios
      interval: 300,
    },
  },
});
