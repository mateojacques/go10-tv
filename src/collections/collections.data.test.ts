/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildTitles, parseCatalogCsv } from '../catalog/loadCatalog'
import { COLLECTION_FILES } from './collections'
import { validateCollections } from './validateCollection'

// Vitest runs from the repo root.
const PUBLIC = join(process.cwd(), 'public')

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
