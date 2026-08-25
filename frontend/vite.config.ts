import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8081',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8081',
        changeOrigin: true,
        ws: true,
      },
    },
    headers: {
      'Cache-Control': 'no-store',
    },
  },
})
