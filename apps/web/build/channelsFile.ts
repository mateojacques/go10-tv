import { readFileSync } from 'node:fs'

/**
 * `data/channels.json` for publishing at `/data/channels.json`, where the
 * mobile app fetches it: every device must schedule from the same file. Only
 * a file that isn't JSON stops the build; the content is validated by
 * channels.data.test.ts and, at runtime, by resolveLineup.
 */
export function readChannelsFile(path: string): string {
  const text = readFileSync(path, 'utf8')
  try {
    return JSON.stringify(JSON.parse(text))
  } catch (error) {
    throw new Error(`channels.json: not valid JSON (${(error as Error).message})`)
  }
}
