import type { CollectionFile } from './types'

/**
 * Omit either check to validate structure only, as the loader does at runtime
 * where neither the catalog nor the disk is available.
 */
export interface ValidationContext {
  /** Every `Title.key` in the catalog. */
  titleKeys?: ReadonlySet<string>
  /** Whether a path relative to `public/` exists. */
  assetExists?: (path: string) => boolean
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Every problem with one collection file, as `<fileName>: <message>` strings.
 * Takes the raw JSON because imported JSON is never type-checked.
 */
export function validateCollection(file: CollectionFile, ctx: ValidationContext): string[] {
  const errors: string[] = []
  const fail = (message: string) => errors.push(`${file.fileName}: ${message}`)

  const checkAsset = (field: string, value: unknown) => {
    // A leading slash would pass existsSync but double up when the UI prefixes "/".
    if (typeof value !== 'string' || value === '' || value.startsWith('/')) {
      fail(`${field} must be a relative path string`)
    } else if (ctx.assetExists && !ctx.assetExists(value)) {
      fail(`${field} "${value}" not found under public/`)
    }
  }

  const c = file.raw
  if (!isObject(c)) {
    fail('must be a JSON object')
    return errors
  }

  const stem = file.fileName.replace(/\.json$/, '')
  if (typeof c.id !== 'string' || !KEBAB.test(c.id)) fail('id must be a kebab-case string')
  else if (c.id !== stem) fail(`id "${c.id}" must match the file name "${stem}"`)

  if (typeof c.name !== 'string' || c.name.trim() === '') fail('name must be a non-empty string')

  if (!Number.isInteger(c.order)) fail('order must be an integer')

  checkAsset('logo', c.logo)

  if (!isObject(c.tile)) {
    fail('tile must be an object')
  } else {
    if (typeof c.tile.color !== 'string' || !HEX.test(c.tile.color)) {
      fail('tile.color must be a hex color like #000 or #1a2b3c')
    }
    if (c.tile.background !== undefined) checkAsset('tile.background', c.tile.background)
  }

  if (!Array.isArray(c.titles) || c.titles.length === 0) {
    fail('titles must be a non-empty array')
  } else {
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const key of c.titles) {
      if (typeof key !== 'string') {
        fail(`titles entries must be strings, got ${JSON.stringify(key)}`)
      } else if (seen.has(key)) {
        if (!duplicates.has(key)) fail(`duplicate title key "${key}"`)
        duplicates.add(key)
      } else {
        seen.add(key)
        if (ctx.titleKeys && !ctx.titleKeys.has(key)) fail(`unknown title key "${key}"`)
      }
    }
  }

  return errors
}

/** Per-file errors for every file, plus orders shared across files. */
export function validateCollections(files: CollectionFile[], ctx: ValidationContext): string[] {
  const errors = files.flatMap((file) => validateCollection(file, ctx))

  const byOrder = new Map<number, string[]>()
  for (const file of files) {
    if (!isObject(file.raw) || !Number.isInteger(file.raw.order)) continue
    const order = file.raw.order as number
    byOrder.set(order, [...(byOrder.get(order) ?? []), file.fileName])
  }
  for (const [order, fileNames] of byOrder) {
    if (fileNames.length > 1) {
      errors.push(`order ${order} is used by more than one collection: ${fileNames.join(', ')}`)
    }
  }

  return errors
}
