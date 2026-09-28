import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { buildCollectionsIndex } from './build/collectionsIndex.ts'

const COLLECTIONS_DIR = fileURLToPath(new URL('../../data/collections', import.meta.url))

/** Publishes data/collections/*.json as /data/collections/index.json for the mobile app. */
function collectionsIndex(): Plugin {
  return {
    name: 'go10-collections-index',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'data/collections/index.json', source: buildCollectionsIndex(COLLECTIONS_DIR) })
    },
  }
}

export default defineConfig({
  plugins: [react(), collectionsIndex()],
  // Chromium 69 (Tizen 5.5, this project's TV target) can't parse optional
  // chaining or nullish coalescing at all -- an un-pinned build ships a
  // blank screen on it, not just rough edges.
  build: {
    target: 'chrome69',
  },
  // .env.local (the external-titles switch and TMDB token) lives at the repo root.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // External titles are off for the suite; tests that need them stub these.
    env: { VITE_EXTERNAL_TITLES: 'off', VITE_TMDB_TOKEN: '' },
  },
})
