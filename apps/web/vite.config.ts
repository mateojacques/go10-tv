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

/**
 * `vite build --mode tizen` only. A packaged Tizen app is served from
 * file://, which gives scripts an empty MIME type -- and Chromium refuses to
 * run a module script without a JavaScript one (verified on the TV: "Failed
 * to load module script ... non-JavaScript MIME type", a black screen). So
 * this build ships one classic IIFE bundle, loaded with defer (module scripts
 * are deferred implicitly, so this keeps the same timing), and drops
 * crossorigin, which a file:// page has no origin for.
 */
function tizenClassicScript(): Plugin {
  return {
    name: 'go10-tizen-classic-script',
    apply: (_, env) => env.command === 'build' && env.mode === 'tizen',
    config: () => ({
      build: {
        modulePreload: false,
        rolldownOptions: { output: { format: 'iife' } },
      },
    }),
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace(/<script type="module" crossorigin/g, '<script defer').replace(/ crossorigin/g, ''),
    },
  }
}

export default defineConfig({
  plugins: [react(), collectionsIndex(), tizenClassicScript()],
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
