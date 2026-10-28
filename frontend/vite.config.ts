import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [
        { name: 'interactions', test: /node_modules\/@radix-ui/ },
        { name: 'chart-renderer', test: /node_modules\/zrender/ },
        { name: 'chart-engine', test: /node_modules\/echarts/ },
      ] } },
    },
  },
})
