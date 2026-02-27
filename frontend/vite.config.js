import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('mathlive')) return 'mathlive-vendor'
          if (id.includes('katex')) return 'katex-vendor'
          if (id.includes('gsap') || id.includes('framer-motion')) return 'motion-vendor'
          if (id.includes('react') || id.includes('scheduler')) return 'react-vendor'
          return 'vendor'
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
  server: {
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
})
