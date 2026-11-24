import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { directoryGuard } from './vite-directory-guard.mjs'

export default defineConfig({
  plugins: [directoryGuard(), react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
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
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') return
            console.error('[vite] ws proxy error:', err)
          })
        },
      },
    },
    headers: {
      'Cache-Control': 'no-store',
    },
  },
})
