# Collections (Structure) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the data structure for hand-curated collections: JSON files in
`data/collections/`, a typed loader, a resolver that turns a collection into
catalog `Title`s, and a validator that the test suite runs against every file.

**Architecture:**
- **Data:** one JSON file per collection, bundled at build time with Vite's
  `import.meta.glob`. No Python pipeline step and no runtime fetch.
- **Runtime:** lenient. The resolver skips unknown keys.
- **Tests:** strict. A data test validates every real file against
  `public/data/catalog.csv` and the asset folder.
- **Scope:** no UI in this plan (that's step 3).

**Tech Stack:** React 19, TypeScript, Vite, Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-23-collections-design.md`

## Global Constraints

- No new dependencies.
- Collection files: `data/collections/<id>.json`, where `id` equals the
  filename stem.
- Fields: `id`, `name`, `order`, `logo`, `tile.color`, optional
  `tile.background`, and `titles`.
- Members are `Title.key` strings: the `series_id` slug for shows, the ok.ru
  `video_id` for movies. Movie keys must be JSON **strings**, never numbers.
- Asset paths are relative to `public/`, with no leading `/`. Files live in
  `assets/collections/<id>/`, served through the `public/assets -> ../assets`
  symlink.
- Kebab-case regex: `/^[a-z0-9]+(-[a-z0-9]+)*$/`.
- Hex color regex: `/^#([0-9a-f]{3}|[0-9a-f]{6})$/i`.
- Error strings are prefixed `<fileName>: `, e.g.
  `cartoon-network.json: unknown title key "x"`.
- `tsconfig.app.json` limits `types` to `vite/client`. A test that uses
  `node:fs` must start with `/// <reference types="node" />`.

## Review Focus

1. **A movie key written as a JSON number** (`15692556471022` instead of
   `"15692556471022"`): easy to type by hand. It must produce
   `titles entries must be strings`, not a silent miss. Test in Task 2.
2. **A leading-slash asset path** (`"/assets/…"`): it would pass `existsSync`
   (because of `path.join`) but double the slash in the UI. It must be
   rejected. Test in Task 2.
3. **A file whose top level isn't an object** (an array, `null`, a string):
   exactly one error and no crash on property access. Test in Task 2.
4. **A key repeated three times that's also unknown:** reported once as
   unknown and once as a duplicate, not as one error per occurrence. Test in
   Task 2.
5. **Every key of a collection gone stale** after a catalog re-parse: the
   collection drops out of `visibleCollections` instead of rendering an
   empty tile. Test in Task 1.

---

### Task 1: Collection type and resolver

**Files:**
- Create: `src/collections/types.ts`
- Create: `src/collections/resolveCollection.ts`
- Test: `src/collections/resolveCollection.test.ts`

**Interfaces:**
- Consumes: `Title` from `src/types.ts` (only `key` matters here).
- Produces:
  - `interface Collection { id: string; name: string; order: number; logo: string; tile: { color: string; background?: string }; titles: string[] }`
  - `interface CollectionFile { fileName: string; raw: unknown }`
  - `resolveCollection(collection: Collection, titles: Title[]): Title[]`
  - `interface ResolvedCollection { collection: Collection; titles: Title[] }`
  - `visibleCollections(collections: Collection[], titles: Title[]): ResolvedCollection[]`

- [ ] **Step 1: Write the failing test** (`src/collections/resolveCollection.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import type { Title } from '../types'
import type { Collection } from './types'
import { resolveCollection, visibleCollections } from './resolveCollection'

const title = (key: string) => ({ key, title: key }) as Title

const CATALOG = [title('hora-de-aventura'), title('chowder'), title('111'), title('ben-10')]

const collection = (id: string, order: number, titles: string[]): Collection => ({
  id,
  name: id,
  order,
  logo: `assets/collections/${id}/logo.webp`,
  tile: { color: '#000000' },
  titles,
})

const keys = (titles: Title[]) => titles.map((t) => t.key)

describe('resolveCollection', () => {
  it('returns titles in the order the collection lists them', () => {
    const c = collection('cn', 1, ['chowder', '111', 'hora-de-aventura'])
    expect(keys(resolveCollection(c, CATALOG))).toEqual(['chowder', '111', 'hora-de-aventura'])
  })

  it('skips keys that are not in the catalog', () => {
    const c = collection('cn', 1, ['chowder', 'gone', 'ben-10'])
    expect(keys(resolveCollection(c, CATALOG))).toEqual(['chowder', 'ben-10'])
  })
})

describe('visibleCollections', () => {
  it('keeps the input order and pairs each collection with its titles', () => {
    const a = collection('a', 1, ['chowder'])
    const b = collection('b', 2, ['111', 'ben-10'])
    const result = visibleCollections([a, b], CATALOG)
    expect(result.map((r) => r.collection.id)).toEqual(['a', 'b'])
    expect(keys(result[1].titles)).toEqual(['111', 'ben-10'])
  })

  it('hides a collection whose keys have all gone stale', () => {
    const stale = collection('stale', 1, ['gone', 'also-gone'])
    const live = collection('live', 2, ['chowder'])
    expect(visibleCollections([stale, live], CATALOG).map((r) => r.collection.id)).toEqual(['live'])
  })

  it('returns nothing when there are no collections', () => {
    expect(visibleCollections([], CATALOG)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.** Run
  `npx vitest run src/collections`. Expected: FAIL, because
  `./resolveCollection` isn't found.

- [ ] **Step 3: Implement the types** (`src/collections/types.ts`)

```ts
/** A hand-curated group of titles, one per `data/collections/<id>.json`. */
export interface Collection {
  /** Kebab-case slug, equal to the file name; the collection page URL. */
  id: string
  name: string
  /** Tile position on Home, ascending. Unique across collections. */
  order: number
  /** Path relative to `public/`, like `Title.thumbnail`. */
  logo: string
  tile: {
    /** Hex base fill, so the tile works without art. */
    color: string
    /** Optional art behind the logo, relative to `public/`. */
    background?: string
  }
  /** `Title.key`s in display order. */
  titles: string[]
}

/** A collection file as written on disk, before any validation. */
export interface CollectionFile {
  fileName: string
  raw: unknown
}
```

- [ ] **Step 4: Implement the resolver** (`src/collections/resolveCollection.ts`)

```ts
import type { Title } from '../types'
import type { Collection } from './types'

export interface ResolvedCollection {
  collection: Collection
  titles: Title[]
}

/**
 * The collection's titles in the order it lists them. Unknown keys are
 * skipped rather than thrown: the data test is what catches them, so a typo
 * fails CI instead of the TV screen.
 */
export function resolveCollection(collection: Collection, titles: Title[]): Title[] {
  const byKey = new Map(titles.map((t) => [t.key, t]))
  return collection.titles.flatMap((key) => {
    const found = byKey.get(key)
    return found ? [found] : []
  })
}

/** Collections that resolve to at least one title, in the order given. */
export function visibleCollections(collections: Collection[], titles: Title[]): ResolvedCollection[] {
  return collections
    .map((collection) => ({ collection, titles: resolveCollection(collection, titles) }))
    .filter((resolved) => resolved.titles.length > 0)
}
```

- [ ] **Step 5: Run the test to verify it passes.** Run
  `npx vitest run src/collections`. Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/collections/types.ts src/collections/resolveCollection.ts src/collections/resolveCollection.test.ts
git commit -m "feat: add collection type and resolver"
```

---

### Task 2: Collection validator

**Files:**
- Create: `src/collections/validateCollection.ts`
- Test: `src/collections/validateCollection.test.ts`

**Interfaces:**
- Consumes: `CollectionFile` from `src/collections/types.ts` (Task 1).
- Produces:
  - `interface ValidationContext { titleKeys: ReadonlySet<string>; assetExists: (path: string) => boolean }`
  - `validateCollection(file: CollectionFile, ctx: ValidationContext): string[]`
  - `validateCollections(files: CollectionFile[], ctx: ValidationContext): string[]` (per-file errors plus duplicate `order`)

- [ ] **Step 1: Write the failing test** (`src/collections/validateCollection.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { validateCollection, validateCollections, type ValidationContext } from './validateCollection'

const ASSETS = new Set([
  'assets/collections/cartoon-network/logo.webp',
  'assets/collections/cartoon-network/tile.webp',
  'assets/collections/marvel/logo.webp',
])

const ctx: ValidationContext = {
  titleKeys: new Set(['hora-de-aventura', 'chowder', '15692556471022']),
  assetExists: (path) => ASSETS.has(path),
}

const valid = () => ({
  id: 'cartoon-network',
  name: 'Cartoon Network',
  order: 1,
  logo: 'assets/collections/cartoon-network/logo.webp',
  tile: { color: '#000000', background: 'assets/collections/cartoon-network/tile.webp' },
  titles: ['hora-de-aventura', 'chowder', '15692556471022'],
})

const check = (raw: unknown, fileName = 'cartoon-network.json') => validateCollection({ fileName, raw }, ctx)

describe('validateCollection', () => {
  it('accepts a valid collection', () => {
    expect(check(valid())).toEqual([])
  })

  it('accepts a collection without tile background art', () => {
    const c = valid()
    delete (c.tile as { background?: string }).background
    expect(check(c)).toEqual([])
  })

  it('accepts a 3-digit hex color', () => {
    expect(check({ ...valid(), tile: { color: '#FfF' } })).toEqual([])
  })

  it.each([[[]], [null], ['cartoon-network'], [42]])('rejects a non-object top level (%j) with one error', (raw) => {
    expect(check(raw)).toEqual(['cartoon-network.json: must be a JSON object'])
  })

  it('rejects an id that is not kebab-case', () => {
    expect(check({ ...valid(), id: 'Cartoon_Network' }, 'Cartoon_Network.json')).toEqual([
      'Cartoon_Network.json: id must be a kebab-case string',
    ])
  })

  it('rejects an id that does not match the file name', () => {
    expect(check(valid(), 'cn.json')).toEqual(['cn.json: id "cartoon-network" must match the file name "cn"'])
  })

  it('rejects an empty name', () => {
    expect(check({ ...valid(), name: '  ' })).toEqual(['cartoon-network.json: name must be a non-empty string'])
  })

  it.each([[1.5], ['1'], [undefined]])('rejects a non-integer order (%j)', (order) => {
    expect(check({ ...valid(), order })).toEqual(['cartoon-network.json: order must be an integer'])
  })

  it('rejects a missing logo', () => {
    const c: Record<string, unknown> = valid()
    delete c.logo
    expect(check(c)).toEqual(['cartoon-network.json: logo must be a relative path string'])
  })

  it('rejects a logo file that does not exist', () => {
    expect(check({ ...valid(), logo: 'assets/collections/cartoon-network/nope.webp' })).toEqual([
      'cartoon-network.json: logo "assets/collections/cartoon-network/nope.webp" not found under public/',
    ])
  })

  it('rejects a leading-slash asset path even if the file exists', () => {
    expect(check({ ...valid(), logo: '/assets/collections/cartoon-network/logo.webp' })).toEqual([
      'cartoon-network.json: logo must be a relative path string',
    ])
  })

  it('rejects a missing tile', () => {
    const c: Record<string, unknown> = valid()
    delete c.tile
    expect(check(c)).toEqual(['cartoon-network.json: tile must be an object'])
  })

  it.each([['black'], ['#00000'], ['000000'], [0]])('rejects a non-hex tile color (%j)', (color) => {
    expect(check({ ...valid(), tile: { color } })).toEqual([
      'cartoon-network.json: tile.color must be a hex color like #000 or #1a2b3c',
    ])
  })

  it('rejects a tile background that does not exist', () => {
    expect(check({ ...valid(), tile: { color: '#000', background: 'assets/x.webp' } })).toEqual([
      'cartoon-network.json: tile.background "assets/x.webp" not found under public/',
    ])
  })

  it.each([[[]], [undefined], ['hora-de-aventura']])('rejects titles that are not a non-empty array (%j)', (titles) => {
    expect(check({ ...valid(), titles })).toEqual(['cartoon-network.json: titles must be a non-empty array'])
  })

  it('rejects a movie key written as a number', () => {
    expect(check({ ...valid(), titles: ['chowder', 15692556471022] })).toEqual([
      'cartoon-network.json: titles entries must be strings, got 15692556471022',
    ])
  })

  it('rejects an unknown title key', () => {
    expect(check({ ...valid(), titles: ['chowder', 'hora-de-aventur'] })).toEqual([
      'cartoon-network.json: unknown title key "hora-de-aventur"',
    ])
  })

  it('reports a duplicated key once, even when it is also unknown', () => {
    expect(check({ ...valid(), titles: ['chowder', 'chowder'] })).toEqual([
      'cartoon-network.json: duplicate title key "chowder"',
    ])
    expect(check({ ...valid(), titles: ['gone', 'gone', 'gone'] })).toEqual([
      'cartoon-network.json: unknown title key "gone"',
      'cartoon-network.json: duplicate title key "gone"',
    ])
  })

  it('reports every problem in a file, not just the first', () => {
    expect(check({ ...valid(), name: '', order: 'x' })).toEqual([
      'cartoon-network.json: name must be a non-empty string',
      'cartoon-network.json: order must be an integer',
    ])
  })
})

describe('validateCollections', () => {
  const marvel = () => ({
    ...valid(),
    id: 'marvel',
    name: 'Marvel',
    order: 2,
    logo: 'assets/collections/marvel/logo.webp',
    tile: { color: '#ec1d24' },
  })

  it('accepts files with distinct orders', () => {
    expect(
      validateCollections(
        [
          { fileName: 'cartoon-network.json', raw: valid() },
          { fileName: 'marvel.json', raw: marvel() },
        ],
        ctx,
      ),
    ).toEqual([])
  })

  it('rejects two collections sharing an order', () => {
    expect(
      validateCollections(
        [
          { fileName: 'cartoon-network.json', raw: valid() },
          { fileName: 'marvel.json', raw: { ...marvel(), order: 1 } },
        ],
        ctx,
      ),
    ).toEqual(['order 1 is used by more than one collection: cartoon-network.json, marvel.json'])
  })

  it('combines per-file errors from every file', () => {
    expect(
      validateCollections(
        [
          { fileName: 'cartoon-network.json', raw: { ...valid(), name: '' } },
          { fileName: 'marvel.json', raw: null },
        ],
        ctx,
      ),
    ).toEqual(['cartoon-network.json: name must be a non-empty string', 'marvel.json: must be a JSON object'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.** Run
  `npx vitest run src/collections/validateCollection`. Expected: FAIL, because
  `./validateCollection` isn't found.

- [ ] **Step 3: Implement** (`src/collections/validateCollection.ts`)

```ts
import type { CollectionFile } from './types'

export interface ValidationContext {
  /** Every `Title.key` in the catalog. */
  titleKeys: ReadonlySet<string>
  /** Whether a path relative to `public/` exists. */
  assetExists: (path: string) => boolean
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
    } else if (!ctx.assetExists(value)) {
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
        if (!ctx.titleKeys.has(key)) fail(`unknown title key "${key}"`)
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
```

- [ ] **Step 4: Run the test to verify it passes.** Run
  `npx vitest run src/collections/validateCollection`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/collections/validateCollection.ts src/collections/validateCollection.test.ts
git commit -m "feat: add collection file validator"
```

---

### Task 3: Loader, data test and docs

**Files:**
- Create: `src/collections/collections.ts`
- Create: `data/collections/.gitkeep` (empty)
- Test: `src/collections/collections.test.ts` (loader unit test)
- Test: `src/collections/collections.data.test.ts` (validates the real files)
- Modify: `README.md` (new "### Collections" subsection at the end of
  "## Data", right before "## Design notes"; update the `npm test` count in
  "## Tests")
- Modify: `docs/superpowers/specs/2026-09-23-collections-design.md` (status
  line → `Status: **implemented** (2026-09-23). Covers step 1 of 3 (structure only).`)

**Interfaces:**
- Consumes:
  - `Collection`, `CollectionFile` (Task 1)
  - `validateCollections`, `ValidationContext` (Task 2)
  - `parseCatalogCsv`, `buildTitles` from `src/catalog/loadCatalog.ts`
- Produces:
  - `fromModules(modules: Record<string, unknown>): { files: CollectionFile[]; collections: Collection[] }`
  - `COLLECTION_FILES: CollectionFile[]` (sorted by fileName)
  - `COLLECTIONS: Collection[]` (sorted by `order`)

- [ ] **Step 1: Write the failing loader test** (`src/collections/collections.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { fromModules } from './collections'

const raw = (id: string, order: number) => ({
  id,
  name: id,
  order,
  logo: `assets/collections/${id}/logo.webp`,
  tile: { color: '#000' },
  titles: ['chowder'],
})

describe('fromModules', () => {
  it('names each file by its basename and sorts files by name', () => {
    const { files } = fromModules({
      '../../data/collections/marvel.json': raw('marvel', 1),
      '../../data/collections/cartoon-network.json': raw('cartoon-network', 2),
    })
    expect(files.map((f) => f.fileName)).toEqual(['cartoon-network.json', 'marvel.json'])
  })

  it('sorts collections by order', () => {
    const { collections } = fromModules({
      '../../data/collections/a.json': raw('a', 3),
      '../../data/collections/b.json': raw('b', 1),
      '../../data/collections/c.json': raw('c', 2),
    })
    expect(collections.map((c) => c.id)).toEqual(['b', 'c', 'a'])
  })

  it('handles an empty collections folder', () => {
    expect(fromModules({})).toEqual({ files: [], collections: [] })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.** Run
  `npx vitest run src/collections/collections.test.ts`. Expected: FAIL,
  because `./collections` isn't found.

- [ ] **Step 3: Implement the loader** (`src/collections/collections.ts`)

```ts
import type { Collection, CollectionFile } from './types'

/**
 * Split out from the glob so it can be tested with fixtures. `collections` is
 * an unchecked cast: `collections.data.test.ts` validates every file.
 */
export function fromModules(modules: Record<string, unknown>): {
  files: CollectionFile[]
  collections: Collection[]
} {
  const files = Object.entries(modules)
    .map(([path, raw]) => ({ fileName: path.slice(path.lastIndexOf('/') + 1), raw }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
  const collections = files.map((file) => file.raw as Collection).sort((a, b) => a.order - b.order)
  return { files, collections }
}

const loaded = fromModules(
  import.meta.glob<unknown>('../../data/collections/*.json', { eager: true, import: 'default' }),
)

/** Every collection file as written, for validation. */
export const COLLECTION_FILES = loaded.files

/** Every collection, in Home tile order. */
export const COLLECTIONS = loaded.collections
```

- [ ] **Step 4: Create the collections folder.** Run
  `mkdir -p data/collections && touch data/collections/.gitkeep`. The glob
  matches `*.json` only, so `.gitkeep` is ignored.

- [ ] **Step 5: Write the data test** (`src/collections/collections.data.test.ts`)

```ts
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
```

- [ ] **Step 6: Run the collection tests.** Run
  `npx vitest run src/collections`. Expected: PASS. The data test passes with
  zero files.

- [ ] **Step 7: Prove the data test catches a bad file.** Write a temporary
  `data/collections/probe.json`:

```json
{ "id": "probe", "name": "Probe", "order": 1, "logo": "assets/collections/probe/logo.webp",
  "tile": { "color": "#000" }, "titles": ["chowder", "no-such-title"] }
```

  Run `npx vitest run src/collections/collections.data.test.ts`. Expected:
  FAIL, listing `probe.json: logo "assets/collections/probe/logo.webp" not found under public/`
  and `probe.json: unknown title key "no-such-title"`. Then delete it with
  `rm data/collections/probe.json`, re-run, and expect PASS.

- [ ] **Step 8: Add the README section.** Insert this immediately before
  `## Design notes` in `README.md`:

````markdown
### Collections

Collections are hand-curated, labeled groups of titles (think Disney+'s
Marvel or Star Wars tiles). There's one JSON file per collection in
`data/collections/<id>.json`:

```json
{
  "id": "cartoon-network",
  "name": "Cartoon Network",
  "order": 1,
  "logo": "assets/collections/cartoon-network/logo.webp",
  "tile": { "color": "#000000", "background": "assets/collections/cartoon-network/tile.webp" },
  "titles": ["hora-de-aventura", "15692556471022"]
}
```

- `id` must match the filename.
- `order` sets the tile position on Home and must be unique.
- `tile.background` is optional.
- `titles` are title keys, listed in display order: a show's `series_id`, or a
  movie's `video_id`. Write movie keys as strings.
- Put the logo and art in `assets/collections/<id>/`. Paths are relative, with
  no leading `/`.

The app bundles these files directly, so there's no parser step. `npm test`
validates every file against `catalog.csv` and the asset folder: unknown keys,
duplicates, missing images and clashing `order` values all fail the suite.
````

- [ ] **Step 9: Update the test count.** Run `npm test` and note the total
  that Vitest reports. In `README.md` "## Tests", replace the `npm test` line's
  count and add `collections` to its list. For example, if Vitest reports 186
  tests, the line becomes:
  `npm test                      # 186 — loader, rows, focus, player, progress, routing, collections`

- [ ] **Step 10: Mark the spec implemented.** In
  `docs/superpowers/specs/2026-09-23-collections-design.md`, change the status
  line to
  `Status: **implemented** (2026-09-23). Covers step 1 of 3 (structure only).`

- [ ] **Step 11: Full verification.** Run `npm test && npm run build`.
  Expected: all tests pass, and `tsc -b` plus `vite build` succeed. That
  confirms the `/// <reference types="node" />` and the glob typing compile
  under `tsconfig.app.json`.

- [ ] **Step 12: Commit**

```bash
git add src/collections/collections.ts src/collections/collections.test.ts src/collections/collections.data.test.ts data/collections/.gitkeep README.md docs/superpowers/specs/2026-09-23-collections-design.md
git commit -m "feat: load and validate collections from data/collections"
```
