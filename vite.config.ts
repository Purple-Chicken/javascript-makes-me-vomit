import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  // If running locally, you might want to proxy API calls to your local python server later
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000', // Common default for FastAPI/Flask
        changeOrigin: true,
      }
    },
  },
})
