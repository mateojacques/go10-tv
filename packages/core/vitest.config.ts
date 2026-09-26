import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom only so tests can exercise the web adapter against a real localStorage.
    environment: 'jsdom',
    globals: true,
    // External titles are off for the suite; tests that need them stub these.
    env: { VITE_EXTERNAL_TITLES: 'off', VITE_TMDB_TOKEN: '' },
  },
})
