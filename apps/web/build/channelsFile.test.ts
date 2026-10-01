// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readChannelsFile } from './channelsFile.ts'

function fileWith(text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'channels-')), 'channels.json')
  writeFileSync(path, text)
  return path
}

describe('readChannelsFile', () => {
  it('publishes the file as JSON', () => {
    const path = fileWith('{ "epoch": "2026-10-01T00:00:00Z", "defaultChannel": "a", "channels": [] }')
    expect(JSON.parse(readChannelsFile(path))).toEqual({ epoch: '2026-10-01T00:00:00Z', defaultChannel: 'a', channels: [] })
  })

  it('stops the build on a file that is not JSON', () => {
    expect(() => readChannelsFile(fileWith('{ nope'))).toThrow(/channels\.json: not valid JSON/)
  })

  it('reads the real file', () => {
    const real = fileURLToPath(new URL('../../../data/channels.json', import.meta.url))
    expect(JSON.parse(readChannelsFile(real)).channels.length).toBeGreaterThan(0)
  })
})
