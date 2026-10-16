/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTitles, parseCatalogCsv } from '@go10/core/catalog/loadCatalog'
import { validateChannels } from '@go10/core/tv/validateChannels'
import { COLLECTIONS } from '../collections/collections'
import { CHANNELS_FILE } from './channels'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public')

describe('data/channels.json', () => {
  it('is valid against the real catalog and collections', () => {
    const titles = buildTitles(parseCatalogCsv(readFileSync(join(PUBLIC, 'data', 'catalog.csv'), 'utf8')))
    expect(validateChannels(CHANNELS_FILE, { collections: COLLECTIONS, titles })).toEqual([])
  })

  const numbers = (CHANNELS_FILE as { channels: { collection: string; number: number }[] }).channels
  const idsOf = (group: string) => COLLECTIONS.filter((c) => c.group === group).map((c) => c.id).sort()

  it('puts every franchise collection on a 101–199 channel', () => {
    expect(idsOf('franchise')).toEqual(numbers.filter((c) => c.number >= 101 && c.number <= 199).map((c) => c.collection).sort())
  })

  it('puts every decade collection on a 201+ channel', () => {
    expect(idsOf('decade')).toEqual(numbers.filter((c) => c.number >= 201).map((c) => c.collection).sort())
  })
})
