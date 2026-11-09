/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// Vite + Vitest share this config. The '@' alias mirrors tsconfig paths.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor splitting (Phase 7): Firebase and React are stable,
        // cacheable chunks; app code + lazy route chunks stay small, so
        // no chunk trips the 500 kB warning anymore.
        manualChunks: {
          'firebase-app': ['firebase/app'],
          'firebase-auth': ['firebase/auth'],
          'firebase-firestore': ['firebase/firestore/lite'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Hermetic tests: a developer's .env.local (live Firebase/Cloudinary
    // values) must never leak into import.meta.env during tests — the
    // Cloudinary-only photo check in the shared validator keys off it.
    env: {
      VITE_CLOUDINARY_CLOUD_NAME: '',
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_APP_ID: '',
    },
  },
})
