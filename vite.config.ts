import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward Redfish proxy calls to the local backend server.
      '/api': 'http://localhost:3001',
    },
  },
})
