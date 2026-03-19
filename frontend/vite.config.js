import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      // Python FastAPI runs on 5000; change to 8080 after Spring Boot migration
      '/api': 'http://localhost:5000'
    }
  }
})
