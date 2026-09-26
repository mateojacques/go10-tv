/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTitles, parseCatalogCsv } from '@go10/core/catalog/loadCatalog'
import { COLLECTION_FILES } from './collections'
import { validateCollections } from '@go10/core/collections/validateCollection'

// Relative to this file, so the suite passes from the repo root or apps/web.
// (A string, not `new URL`: under jsdom that's jsdom's URL, which fileURLToPath rejects.)
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public')

describe('data/collections', () => {
  it('every collection file is valid against the real catalog and assets', () => {
    const csv = readFileSync(join(PUBLIC, 'data', 'catalog.csv'), 'utf8')
    const titleKeys = new Set(buildTitles(parseCatalogCsv(csv)).map((t) => t.key))

    const errors = validateCollections(COLLECTION_FILES, {
      titleKeys,
      assetExists: (path) => existsSync(join(PUBLIC, path)),
    })

    expect(errors).toEqual([])
  })
})
