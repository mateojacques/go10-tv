// @vitest-environment node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import config from '../vite.config.ts'

describe('vite config', () => {
  it('loads .env files from the repo root, where .env.local has always lived', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    expect(config.envDir && resolve(config.envDir)).toBe(repoRoot)
  })
})
