import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
      '/telemetry': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/inject-fault': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/clear-fault': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/reset': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
