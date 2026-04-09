/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    passWithNoTests: false,
  },
  server: {
    proxy: {
      // Evita CORS al leer la planilla en `npm run dev`
      '/api/fateryh-planilla': {
        target: 'https://fateryh.org.ar',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/planilla-salarial-vigente/',
      },
    },
  },
})
