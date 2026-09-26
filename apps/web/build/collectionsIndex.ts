import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every collection file in `dir` as one JSON array, sorted by file name, so
 * the mobile app can fetch them all at `/data/collections/index.json`. It
 * validates each one itself; only a file that isn't JSON at all stops the
 * build, since publishing it would silently drop that collection.
 */
export function buildCollectionsIndex(dir: string): string {
  const collections = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const text = readFileSync(join(dir, name), 'utf8')
      try {
        return JSON.parse(text) as unknown
      } catch (error) {
        throw new Error(`${name}: not valid JSON (${(error as Error).message})`)
      }
    })
  return JSON.stringify(collections)
}
