import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: 'public',

  build: {
    target: 'es2020',
    outDir: 'dist',

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('firebase')) {
            return 'firebase'
          }
        }
      }
    }
  },

  server: {
    port: 5173,

    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none'
    }
  }
})