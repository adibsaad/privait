/// <reference types="vitest" />
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'
import { defineConfig } from 'vite'

import tailwindcss from 'tailwindcss'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@frontend': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4000,
  },
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
})
