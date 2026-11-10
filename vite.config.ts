/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

/**
 * Service-worker version stamping (Workstream A): public/sw.js ships
 * with a `__SW_VERSION__` placeholder; after the build has copied it
 * to dist/, replace the token with `neighbormart-<git short hash>`
 * (timestamp fallback outside a git checkout). Every deploy therefore
 * gets a fresh cache namespace automatically — the old manual
 * "bump SW_VERSION" discipline is gone. The activate handler in sw.js
 * still purges every cache that doesn't start with the new version.
 */
function swVersionStamp(): Plugin {
  return {
    name: 'sw-version-stamp',
    apply: 'build',
    closeBundle() {
      let stamp: string
      try {
        stamp = execSync('git rev-parse --short HEAD', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
      } catch {
        stamp = ''
      }
      if (!stamp) stamp = `t${Date.now().toString(36)}`
      const version = `neighbormart-${stamp}`
      const swPath = join(process.cwd(), 'dist', 'sw.js')
      const source = readFileSync(swPath, 'utf8')
      if (!source.includes('__SW_VERSION__')) {
        throw new Error(`sw-version-stamp: placeholder not found in ${swPath}`)
      }
      writeFileSync(swPath, source.replaceAll('__SW_VERSION__', version))
      // eslint-disable-next-line no-console
      console.log(`[sw-version-stamp] dist/sw.js stamped with ${version}`)
    },
  }
}

// Vite + Vitest share this config. The '@' alias mirrors tsconfig paths.
export default defineConfig({
  plugins: [react(), tailwindcss(), swVersionStamp()],
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
