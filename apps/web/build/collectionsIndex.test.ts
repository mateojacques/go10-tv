import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildCollectionsIndex } from './collectionsIndex.ts'

let dir: string
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function fixture(files: Record<string, string>): string {
  dir = mkdtempSync(join(tmpdir(), 'collections-'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}

describe('buildCollectionsIndex', () => {
  it('publishes every collection file as one array, in file-name order', () => {
    const index = buildCollectionsIndex(fixture({
      'pixar.json': '{"id":"pixar","order":2}',
      'disney.json': '{"id":"disney","order":1}',
      'notes.txt': 'not a collection',
    }))
    expect(JSON.parse(index)).toEqual([{ id: 'disney', order: 1 }, { id: 'pixar', order: 2 }])
  })

  it('keeps a structurally invalid collection: the app validates and drops it', () => {
    const index = buildCollectionsIndex(fixture({ 'odd.json': '{"id":"odd"}' }))
    expect(JSON.parse(index)).toEqual([{ id: 'odd' }])
  })

  it('fails the build, naming the file, when one is not JSON', () => {
    expect(() => buildCollectionsIndex(fixture({ 'broken.json': '{"id": ' }))).toThrow(/^broken\.json: not valid JSON/)
  })
})
