import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Debug dev server — port 5174, proxies to local debug backend/yjs ports.
// See infra/.env_debug for the full port map.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket': { target: 'http://localhost:1237', ws: true },
    },
  },
})
