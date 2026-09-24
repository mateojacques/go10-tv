# Collections UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Disney+-style strip of collection tiles between the Home hero
and the first row, plus a `/coleccion/<id>` page that lists a collection's
titles.

**Architecture:**
- **Route:** a new `collection` route, resolved against `COLLECTIONS` the same
  way titles are.
- **Components:** two presentational components, `CollectionTile` and
  `CollectionStrip`, built on the existing focus grid.
- **Screen:** a `Collection` screen that reuses the catalog's lazily batched
  `CatalogGrid`.
- **Shell:** Home and App are wired so the page lives inside the same browse
  `FocusProvider` and navbar as the catalog.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-24-collections-ui-design.md`

## Global Constraints

- No new dependencies.
- URL: `/coleccion/<id>`. The route is `{ name: 'collection'; id: string }`.
- Focus ids:
  - tiles: `collection:<id>`
  - collection page cards: `grid:<title.key>` (via `CatalogGrid`)
- Focus rows:
  - navbar -2, hero -1
  - strip 0, when present
  - "Seguir viendo" and the catalog rows shift down by one when the strip is
    present
- The strip is `<nav aria-label="Colecciones">`, and each tile has
  `role="button"` with `aria-label` set to the collection name.
- Asset paths from JSON get a leading `/` in `src`, as `Card` does.
- Tile width token: `--go-tile-w: clamp(11rem, 16.5vw, 20rem)`, at 16:9.
- Focused tile treatment matches `.go-card.is-focused`:
  - `scale(1.09)`
  - `filter: none`
  - `var(--go-focus-ring), var(--go-focus-lift)`
- Unfocused tiles: `filter: brightness(0.62) saturate(0.85)`.
- Cartoon Network `tile.color` becomes `#e4007c`.
- Spanish UI copy: the only new visible text is the collection name and count.

## Review Focus

1. **Deep link to a collection whose titles aren't in the loaded catalog:** it
   must redirect to `/`, not render an empty page. Test in Task 5 (App, a CSV
   without CN titles).
2. **Home with no visible collections:** there's no empty `<nav>`, and the row
   indexes are unchanged, so Down from the hero still lands on the first row.
   Test in Task 3.
3. **Detail opened from a collection, then Back:** it returns to
   `/coleccion/<id>`, not Home. Test in Task 5.
4. **Typing in the navbar search while on a collection page:** it navigates to
   `/buscar?q=…` like any browse screen. That's covered by the navbar living in
   the shared provider. Test in Task 5.
5. **An encoded collection id in the URL** (`/coleccion/cartoon%2Dnetwork`):
   it decodes and resolves. Test in Task 1.

---

### Task 1: Collection route

**Files:**
- Modify: `src/router/route.ts`
- Modify: `src/router/resolveRoute.ts`
- Test: `src/router/route.test.ts`, `src/router/resolveRoute.test.ts`

**Interfaces:**
- Consumes:
  - `Collection` from `src/collections/types.ts`
  - `resolveCollection(collection, titles): Title[]` from
    `src/collections/resolveCollection.ts`
- Produces:
  - `Route` gains `{ name: 'collection'; id: string }`
  - `ResolvedView` gains `{ name: 'collection'; collection: Collection; titles: Title[] }`
  - `resolveRoute(route: Route, titles: Title[], collections: Collection[] = []): ResolvedView`

- [ ] **Step 1: Write the failing route tests.** Append to
  `src/router/route.test.ts`:

```ts
describe('collection routes', () => {
  it('parses a collection path', () => {
    expect(parseRoute('/coleccion/cartoon-network')).toEqual({ name: 'collection', id: 'cartoon-network' })
  })

  it('decodes an encoded collection id', () => {
    expect(parseRoute('/coleccion/cartoon%2Dnetwork')).toEqual({ name: 'collection', id: 'cartoon-network' })
  })

  it('falls back to home for a collection path without an id', () => {
    expect(parseRoute('/coleccion')).toEqual({ name: 'home' })
  })

  it('round-trips a collection route', () => {
    const route = { name: 'collection', id: 'cartoon-network' } as const
    expect(routeToPath(route)).toBe('/coleccion/cartoon-network')
    expect(parseRoute(routeToPath(route))).toEqual(route)
  })
})
```

- [ ] **Step 2: Write the failing resolver tests.** Append inside
  `describe('resolveRoute', …)` in `src/router/resolveRoute.test.ts`, and add
  `import type { Collection } from '../collections/types'` at the top:

```ts
  const collection = (titles: string[]): Collection => ({
    id: 'cn',
    name: 'Cartoon Network',
    order: 1,
    logo: 'assets/collections/cn/logo.svg',
    tile: { color: '#000000' },
    titles,
  })

  it('resolves a collection to its titles in collection order', () => {
    const a = title({ key: 'a' })
    const b = title({ key: 'b' })
    const cn = collection(['b', 'gone', 'a'])
    expect(resolveRoute({ name: 'collection', id: 'cn' }, [a, b], [cn])).toEqual({
      name: 'collection',
      collection: cn,
      titles: [b, a],
    })
  })

  it('treats an unknown collection id as not found', () => {
    expect(resolveRoute({ name: 'collection', id: 'nope' }, [title({ key: 'a' })], [collection(['a'])])).toEqual({
      name: 'not-found',
    })
  })

  it('treats a collection whose titles are all gone as not found', () => {
    expect(resolveRoute({ name: 'collection', id: 'cn' }, [title({ key: 'a' })], [collection(['gone'])])).toEqual({
      name: 'not-found',
    })
  })

  it('finds no collection when none are passed', () => {
    expect(resolveRoute({ name: 'collection', id: 'cn' }, [title({ key: 'a' })])).toEqual({ name: 'not-found' })
  })
```

- [ ] **Step 3: Run the tests to verify they fail.** Run
  `npx vitest run src/router`. Expected: the new tests FAIL. `parseRoute`
  returns `{ name: 'home' }` for `/coleccion/...`, and TypeScript-only errors
  don't block vitest.

- [ ] **Step 4: Implement the route.** In `src/router/route.ts`:

  Add the variant to `Route`:

```ts
export type Route =
  | { name: 'home' }
  | { name: 'title'; key: string }
  | { name: 'play'; key: string; videoId: string }
  | { name: 'catalog'; section: Section; query: string }
  | { name: 'collection'; id: string }
```

  In `parseRoute`, right after the `play` branch:

```ts
  if (segments[0] === 'coleccion' && segments.length === 2) {
    return { name: 'collection', id: segments[1] }
  }
```

  In `routeToPath`, add a case before `case 'catalog'`:

```ts
    case 'collection':
      return `/coleccion/${encodeURIComponent(route.id)}`
```

- [ ] **Step 5: Implement the resolver.** Replace the top of
  `src/router/resolveRoute.ts`, from the imports through the `catalog` branch,
  with:

```ts
import type { Route, Section } from './route'
import type { CatalogRow, Title } from '../types'
import type { Collection } from '../collections/types'
import { rowKey } from '../catalog/rowKey'
import { resolveCollection } from '../collections/resolveCollection'

export type ResolvedView =
  | { name: 'home' }
  | { name: 'detail'; title: Title }
  | { name: 'player'; title: Title; row: CatalogRow }
  | { name: 'catalog'; section: Section; query: string }
  | { name: 'collection'; collection: Collection; titles: Title[] }
  | { name: 'not-found' }

export function resolveRoute(route: Route, titles: Title[], collections: Collection[] = []): ResolvedView {
  if (route.name === 'home') return { name: 'home' }

  if (route.name === 'catalog') {
    // There's no "browse everything" page; the whole catalog unfiltered is Home.
    if (route.section === 'all' && route.query.trim() === '') return { name: 'home' }
    return { name: 'catalog', section: route.section, query: route.query }
  }

  if (route.name === 'collection') {
    const collection = collections.find((c) => c.id === route.id)
    const members = collection ? resolveCollection(collection, titles) : []
    // A collection with nothing left to show is as gone as an unknown one.
    if (!collection || members.length === 0) return { name: 'not-found' }
    return { name: 'collection', collection, titles: members }
  }
```

  Leave the rest of the function (`const title = titles.find(…)` onward)
  unchanged.

- [ ] **Step 6: Run the tests to verify they pass.** Run
  `npx vitest run src/router && npx tsc -b`. Expected: PASS, and tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/router/route.ts src/router/resolveRoute.ts src/router/route.test.ts src/router/resolveRoute.test.ts
git commit -m "feat: add /coleccion/<id> route"
```

---

### Task 2: Collection tile and strip

**Files:**
- Create: `src/components/CollectionTile.tsx`
- Create: `src/components/CollectionTile.css`
- Create: `src/components/CollectionStrip.tsx`
- Modify: `src/styles/tokens.css` (add the tile size tokens after `--go-card-h`)
- Test: `src/components/CollectionStrip.test.tsx`

**Interfaces:**
- Consumes:
  - `Collection` (step 1)
  - `useFocusable(id, row, col, onEnter)`
  - `FocusProvider`
- Produces:
  - `CollectionTile({ collection: Collection; row: number; col: number; onSelect: (c: Collection) => void })`
  - `CollectionStrip({ collections: Collection[]; rowIndex: number; onSelect: (c: Collection) => void })`

- [ ] **Step 1: Write the failing test** (`src/components/CollectionStrip.test.tsx`)

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import type { Collection } from '../collections/types'
import { CollectionStrip } from './CollectionStrip'

const collection = (id: string, name: string, extra: Partial<Collection> = {}): Collection => ({
  id,
  name,
  order: 1,
  logo: `assets/collections/${id}/logo.svg`,
  tile: { color: '#e4007c' },
  titles: ['a'],
  ...extra,
})

const CN = collection('cartoon-network', 'Cartoon Network')
const MARVEL = collection('marvel', 'Marvel', {
  tile: { color: '#000000', background: 'assets/collections/marvel/tile.webp' },
})

function renderStrip(onSelect = vi.fn()) {
  render(
    <FocusProvider onBack={() => {}}>
      <CollectionStrip collections={[CN, MARVEL]} rowIndex={0} onSelect={onSelect} />
    </FocusProvider>,
  )
  return onSelect
}

const press = (key: string) => fireEvent.keyDown(window, { key })
const focused = () => document.querySelector('[data-focused="true"]')?.getAttribute('aria-label')

describe('CollectionStrip', () => {
  it('is a navigation landmark of tiles named after their collections', () => {
    renderStrip()
    const nav = screen.getByRole('navigation', { name: 'Colecciones' })
    const tiles = nav.querySelectorAll('[role="button"]')
    expect([...tiles].map((t) => t.getAttribute('aria-label'))).toEqual(['Cartoon Network', 'Marvel'])
  })

  it('paints the tile color and shows the logo', () => {
    renderStrip()
    const tile = screen.getByRole('button', { name: 'Cartoon Network' })
    expect(tile.style.backgroundColor).toBe('rgb(228, 0, 124)')
    expect(tile.querySelector('.go-tile_logo')?.getAttribute('src')).toBe('/assets/collections/cartoon-network/logo.svg')
    expect(tile.querySelector('.go-tile_bg')).toBeNull()
  })

  it('layers the background art when a tile has one', () => {
    renderStrip()
    const tile = screen.getByRole('button', { name: 'Marvel' })
    expect(tile.querySelector('.go-tile_bg')?.getAttribute('src')).toBe('/assets/collections/marvel/tile.webp')
  })

  it('moves between tiles with the arrows and selects with Enter', () => {
    const onSelect = renderStrip()
    expect(focused()).toBe('Cartoon Network')
    press('ArrowRight')
    expect(focused()).toBe('Marvel')
    press('Enter')
    expect(onSelect).toHaveBeenCalledWith(MARVEL)
  })

  it('selects a tile on click', () => {
    const onSelect = renderStrip()
    fireEvent.click(screen.getByRole('button', { name: 'Cartoon Network' }))
    expect(onSelect).toHaveBeenCalledWith(CN)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.** Run
  `npx vitest run src/components/CollectionStrip`. Expected: FAIL, because
  `./CollectionStrip` isn't found.

- [ ] **Step 3: Add the tokens.** In `src/styles/tokens.css`, directly after
  the `--go-card-h` line:

```css
  /* Collection tiles: five across a 1080p screen, Disney+-style brand cards. */
  --go-tile-w: clamp(11rem, 16.5vw, 20rem);
  --go-tile-h: calc(var(--go-tile-w) * 0.5625);
```

- [ ] **Step 4: Implement the tile** (`src/components/CollectionTile.tsx`)

```tsx
import type { Collection } from '../collections/types'
import { useFocusable } from '../focus/useFocusable'
import './CollectionTile.css'

/** A brand card: the collection's logo on its colour, no text. */
export function CollectionTile({
  collection,
  row,
  col,
  onSelect,
}: {
  collection: Collection
  row: number
  col: number
  onSelect: (collection: Collection) => void
}) {
  const { ref, focused, activate, tabIndex } = useFocusable(`collection:${collection.id}`, row, col, () =>
    onSelect(collection),
  )
  const { color, background } = collection.tile

  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      aria-label={collection.name}
      className={`go-tile${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      style={{ backgroundColor: color }}
      onClick={activate}
    >
      {background && <img className="go-tile_bg" src={`/${background}`} alt="" loading="lazy" />}
      <img className="go-tile_logo" src={`/${collection.logo}`} alt="" />
    </div>
  )
}
```

- [ ] **Step 5: Implement the strip** (`src/components/CollectionStrip.tsx`)

```tsx
import type { Collection } from '../collections/types'
import { CollectionTile } from './CollectionTile'
import './Row.css'
import './CollectionTile.css'

/** The row of brand tiles under the Home hero. One focus row, no heading. */
export function CollectionStrip({
  collections,
  rowIndex,
  onSelect,
}: {
  collections: Collection[]
  rowIndex: number
  onSelect: (collection: Collection) => void
}) {
  return (
    <nav className="go-strip" aria-label="Colecciones">
      <div className="go-row_track">
        {collections.map((collection, col) => (
          <CollectionTile
            key={collection.id}
            collection={collection}
            row={rowIndex}
            col={col}
            onSelect={onSelect}
          />
        ))}
      </div>
    </nav>
  )
}
```

- [ ] **Step 6: Style the tile** (`src/components/CollectionTile.css`)

```css
.go-strip {
  margin-bottom: 1rem;
}

.go-tile {
  position: relative;
  flex: 0 0 var(--go-tile-w);
  width: var(--go-tile-w);
  height: var(--go-tile-h);
  display: grid;
  place-items: center;
  border-radius: var(--go-radius);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--go-hairline);
  cursor: pointer;
  transition:
    transform var(--go-dur) var(--go-ease),
    filter var(--go-dur) var(--go-ease),
    box-shadow var(--go-dur) var(--go-ease);
  /* Same resting state as cards, so the focused tile reads from 3m away. */
  filter: brightness(0.62) saturate(0.85);
}

.go-tile_bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.go-tile_logo {
  position: relative;
  max-width: 70%;
  max-height: 62%;
  object-fit: contain;
}

.go-tile.is-focused {
  transform: scale(1.09);
  filter: none;
  z-index: 2;
  box-shadow: var(--go-focus-ring), var(--go-focus-lift);
}

@media (hover: hover) and (pointer: fine) {
  .go-tile:hover {
    transform: scale(1.09);
    filter: none;
    z-index: 2;
    box-shadow: var(--go-focus-ring), var(--go-focus-lift);
  }
}
```

- [ ] **Step 7: Run the test to verify it passes.** Run
  `npx vitest run src/components/CollectionStrip`. Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add src/components/CollectionTile.tsx src/components/CollectionTile.css src/components/CollectionStrip.tsx src/components/CollectionStrip.test.tsx src/styles/tokens.css
git commit -m "feat: add collection tile and strip components"
```

---

### Task 3: Strip on Home

**Files:**
- Modify: `src/screens/Home.tsx`
- Test: `src/screens/Home.test.tsx` (new)

**Interfaces:**
- Consumes:
  - `CollectionStrip` (Task 2)
  - `visibleCollections(collections, titles): ResolvedCollection[]` (step 1)
  - `Collection`
- Produces: `Home` gains two props:
  - `collections: Collection[]`
  - `onOpenCollection: (collection: Collection) => void`

- [ ] **Step 1: Write the failing test** (`src/screens/Home.test.tsx`)

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import type { Collection } from '../collections/types'
import type { CatalogRow, Title } from '../types'
import { Home } from './Home'

function title(key: string, name: string): Title {
  const row = { video_id: key, chapter_start_seconds: null, episode_number: null } as CatalogRow
  return {
    key, kind: 'movie', title: name, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: '', views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [row],
  }
}

const TITLES = [title('m0', 'Movie 0'), title('m1', 'Movie 1'), title('m2', 'Movie 2')]

const collection = (id: string, name: string, titles: string[]): Collection => ({
  id, name, order: 1, logo: `assets/collections/${id}/logo.svg`, tile: { color: '#e4007c' }, titles,
})

const CN = collection('cartoon-network', 'Cartoon Network', ['m1'])
const STALE = collection('stale', 'Stale', ['gone'])

function renderHome(collections: Collection[], onOpenCollection = vi.fn()) {
  render(
    <FocusProvider onBack={() => {}}>
      <Home titles={TITLES} onSelect={() => {}} onResume={() => {}} collections={collections} onOpenCollection={onOpenCollection} />
    </FocusProvider>,
  )
  return onOpenCollection
}

const press = (key: string) => fireEvent.keyDown(window, { key })
const focusedLabel = () => document.querySelector('[data-focused="true"]')?.getAttribute('aria-label')

beforeEach(() => localStorage.clear())

describe('Home collections strip', () => {
  it('sits between the hero and the first row', () => {
    renderHome([CN])
    const nav = screen.getByRole('navigation', { name: 'Colecciones' })
    expect(nav.parentElement?.classList.contains('go-rows')).toBe(true)
    expect(nav.parentElement?.previousElementSibling?.classList.contains('go-hero')).toBe(true)
    expect(nav.nextElementSibling?.classList.contains('go-row')).toBe(true)
  })

  it('only shows collections with titles in the catalog', () => {
    renderHome([STALE, CN])
    const tiles = screen.getByRole('navigation', { name: 'Colecciones' }).querySelectorAll('[role="button"]')
    expect([...tiles].map((t) => t.getAttribute('aria-label'))).toEqual(['Cartoon Network'])
  })

  it('goes hero → tiles → first row with Down, and opens a tile with Enter', () => {
    const onOpenCollection = renderHome([CN])
    press('ArrowDown')
    expect(focusedLabel()).toBe('Cartoon Network')
    press('Enter')
    expect(onOpenCollection).toHaveBeenCalledWith(CN)
    press('ArrowDown')
    expect(focusedLabel()).toBe('Movie 0')
  })

  it('renders no strip and keeps hero → first row when no collection is visible', () => {
    renderHome([STALE])
    expect(screen.queryByRole('navigation', { name: 'Colecciones' })).toBeNull()
    press('ArrowDown')
    expect(focusedLabel()).toBe('Movie 0')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.** Run
  `npx vitest run src/screens/Home.test.tsx`. Expected: FAIL, because no
  `Colecciones` navigation is rendered.

- [ ] **Step 3: Implement.** In `src/screens/Home.tsx`:

  Add imports:

```tsx
import type { Collection } from '../collections/types'
import { visibleCollections } from '../collections/resolveCollection'
import { CollectionStrip } from '../components/CollectionStrip'
```

  Extend the props (destructuring and type):

```tsx
export function Home({
  titles,
  onSelect,
  onResume,
  collections,
  onOpenCollection,
}: {
  titles: Title[]
  onSelect: (title: Title) => void
  /** "Seguir viendo" skips the detail screen and plays the resume target. */
  onResume: (title: Title, row: CatalogRow) => void
  collections: Collection[]
  onOpenCollection: (collection: Collection) => void
}) {
```

  Right after the `continueItems` `useMemo`, add the following. It must stay
  above the `if (!featured)` early return, so hook order is stable:

```tsx
  const strip = useMemo(
    () => visibleCollections(collections, titles).map((resolved) => resolved.collection),
    [collections, titles],
  )
```

  Replace the whole `<div className="go-rows">…</div>` block with:

```tsx
      <div className="go-rows">
        {strip.length > 0 && <CollectionStrip collections={strip} rowIndex={0} onSelect={onOpenCollection} />}
        {continueGroup.titles.length > 0 && (
          <Row
            group={continueGroup}
            rowIndex={firstRow}
            onSelect={(title) => {
              const item = continueItems.get(title.key)
              if (item) onResume(title, item.progress.row)
            }}
            progressFor={(title) => {
              const item = continueItems.get(title.key)
              return item && continueCardProgress(item)
            }}
          />
        )}
        {groups.map((group, index) => (
          <Row
            key={group.id}
            group={group}
            rowIndex={index + firstRow + (continueGroup.titles.length > 0 ? 1 : 0)}
            onSelect={onSelect}
          />
        ))}
      </div>
```

  And, just before `return (` of the main render (after the `position`
  const), add:

```tsx
  // The strip takes focus row 0 when present; every row below shifts down.
  const firstRow = strip.length > 0 ? 1 : 0
```

- [ ] **Step 4: Run the test to verify it passes.** Run
  `npx vitest run src/screens/Home.test.tsx`. Expected: PASS (4 tests).
  `npx tsc -b` will fail in `App.tsx` until Task 5 passes the new props.
  That's expected at this point, so don't fix it here.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Home.tsx src/screens/Home.test.tsx
git commit -m "feat: show collection tiles under the Home hero"
```

---

### Task 4: Collection screen

**Files:**
- Modify: `src/screens/Catalog.tsx` (export `CatalogGrid`)
- Create: `src/screens/Collection.tsx`
- Create: `src/screens/Collection.css`
- Test: `src/screens/Collection.test.tsx`

**Interfaces:**
- Consumes:
  - `CatalogGrid({ titles, onSelect })` from `./Catalog`
  - `Collection`
- Produces:
  `Collection({ collection: Collection; titles: Title[]; onSelect: (title: Title) => void })`.
  The root element has classes `go-catalog go-collection`.

- [ ] **Step 1: Write the failing test** (`src/screens/Collection.test.tsx`)

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FocusProvider } from '../focus/FocusProvider'
import { useFocusable } from '../focus/useFocusable'
import type { Collection as CollectionData } from '../collections/types'
import type { Title } from '../types'
import { Collection } from './Collection'

function title(key: string, name: string): Title {
  return {
    key, kind: 'movie', title: name, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: '', views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [],
  }
}

const CN: CollectionData = {
  id: 'cartoon-network',
  name: 'Cartoon Network',
  order: 1,
  logo: 'assets/collections/cartoon-network/logo.svg',
  tile: { color: '#e4007c' },
  titles: ['c', 'a', 'b'],
}

const TITLES = [title('c', 'Coraje'), title('a', 'Hora de Aventura'), title('b', 'Chowder')]

function NavStub() {
  const { ref, focused } = useFocusable('nav:search', -2, 3, () => {}, { claimsInitialFocus: false })
  return <div ref={ref} data-testid="nav" data-focused={focused} />
}

function renderPage(onSelect = vi.fn()) {
  render(
    <FocusProvider onBack={() => {}}>
      <NavStub />
      <Collection collection={CN} titles={TITLES} onSelect={onSelect} />
    </FocusProvider>,
  )
  return onSelect
}

const press = (key: string) => fireEvent.keyDown(window, { key })

describe('Collection', () => {
  it('headings the page with the collection name and title count', () => {
    renderPage()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toContain('Cartoon Network')
    expect(heading.textContent).toContain('3')
  })

  it('shows a banner in the tile colour with the logo', () => {
    renderPage()
    const banner = document.querySelector('.go-collection_banner') as HTMLElement
    expect(banner.style.backgroundColor).toBe('rgb(228, 0, 124)')
    expect(banner.querySelector('img')?.getAttribute('src')).toBe('/assets/collections/cartoon-network/logo.svg')
  })

  it('lists the titles in collection order and opens one with Enter', () => {
    const onSelect = renderPage()
    const cards = [...document.querySelectorAll('.go-card')].map((c) => c.getAttribute('aria-label'))
    expect(cards).toEqual(['Coraje', 'Hora de Aventura', 'Chowder'])
    press('Enter')
    expect(onSelect).toHaveBeenCalledWith(TITLES[0])
  })

  it('reaches the navbar with Up from the grid', () => {
    renderPage()
    press('ArrowUp')
    expect(screen.getByTestId('nav').getAttribute('data-focused')).toBe('true')
  })

  it('lives in the catalog scroller so lazy batching and the navbar offset work', () => {
    renderPage()
    expect(document.querySelector('.go-catalog.go-collection')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails.** Run
  `npx vitest run src/screens/Collection.test.tsx`. Expected: FAIL, because
  `./Collection` isn't found.

- [ ] **Step 3: Export the grid.** In `src/screens/Catalog.tsx`, change
  `function CatalogGrid(` to `export function CatalogGrid(`. Nothing else
  changes.

- [ ] **Step 4: Implement the screen** (`src/screens/Collection.tsx`)

```tsx
import type { Collection as CollectionData } from '../collections/types'
import type { Title } from '../types'
import { CatalogGrid } from './Catalog'
import '../components/Row.css'
import './Catalog.css'
import './Collection.css'

/**
 * One collection's titles, in the order the collection lists them. Rendered
 * inside the catalog's scroller class so the grid's lazy batching (rooted on
 * `.go-catalog`) and the navbar offset work unchanged.
 */
export function Collection({
  collection,
  titles,
  onSelect,
}: {
  collection: CollectionData
  titles: Title[]
  onSelect: (title: Title) => void
}) {
  const { color, background } = collection.tile

  return (
    <div className="go-catalog go-collection">
      <div className="go-collection_banner" style={{ backgroundColor: color }} aria-hidden="true">
        {background && <img className="go-collection_bg" src={`/${background}`} alt="" />}
        <img className="go-collection_logo" src={`/${collection.logo}`} alt="" />
      </div>

      <header className="go-catalog_head">
        <h1 className="go-catalog_title">
          {collection.name}
          <span className="go-row_count">{titles.length}</span>
        </h1>
      </header>

      {/* Keyed so switching collections starts again from the first batch. */}
      <CatalogGrid key={collection.id} titles={titles} onSelect={onSelect} />
    </div>
  )
}
```

- [ ] **Step 5: Style the banner** (`src/screens/Collection.css`)

```css
.go-collection_banner {
  position: relative;
  display: grid;
  place-items: center;
  height: clamp(8rem, 20vh, 13rem);
  margin: 1rem var(--go-safe-x) 0;
  border-radius: var(--go-radius);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--go-hairline);
  animation: go-rise var(--go-dur-slow) var(--go-ease) both;
}

.go-collection_bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.go-collection_logo {
  position: relative;
  max-width: 40%;
  max-height: 70%;
  object-fit: contain;
}
```

- [ ] **Step 6: Run the tests to verify they pass.** Run
  `npx vitest run src/screens/Collection.test.tsx src/screens/Catalog.test.tsx`.
  Expected: PASS, and the Catalog tests are unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/screens/Catalog.tsx src/screens/Collection.tsx src/screens/Collection.css src/screens/Collection.test.tsx
git commit -m "feat: add collection page reusing the catalog grid"
```

---

### Task 5: App wiring, Cartoon Network colour, docs

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `data/collections/cartoon-network.json` (`tile.color` → `#e4007c`)
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-24-collections-ui-design.md` (status)

**Interfaces:**
- Consumes:
  - `COLLECTIONS` from `src/collections/collections.ts`
  - `resolveRoute(route, titles, collections)` (Task 1)
  - `Home` props (Task 3)
  - `Collection` screen (Task 4)
- Produces: the user-facing feature.

- [ ] **Step 1: Write the failing App tests.** Append to `src/App.test.tsx`.
  The test depends on the real `data/collections/cartoon-network.json`, which
  lists `chowder`.

```tsx
const CN_CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,111,movie,Foo Movie,Foo Movie,,,,,2020,,Drama,,1080p,Español,false,1:00:00,3600,10,thumb.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
1,222,season,Chowder,Chowder - Temporada 1,chowder,Chowder,1,,2008,Cartoon N.,Animación,,1080p,Español,false,1:00:00,3600,5,thumb.webp,https://ok.ru/video/222,https://ok.ru/videoembed/222
`

describe('App collections', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CN_CSV) }))
  })

  it('opens a collection from its Home tile and backs out to Home', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cartoon Network' }))
    await waitFor(() => expect(window.location.pathname).toBe('/coleccion/cartoon-network'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Cartoon Network')
    expect(screen.getByRole('button', { name: 'Chowder' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('returns to the collection when backing out of a title opened from it', async () => {
    window.history.replaceState({}, '', '/coleccion/cartoon-network')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Chowder' }))
    await waitFor(() => expect(window.location.pathname).toBe('/title/chowder'))

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(window.location.pathname).toBe('/coleccion/cartoon-network'))
  })

  it('searches from the navbar while on a collection page', async () => {
    window.history.replaceState({}, '', '/coleccion/cartoon-network')
    render(<App />)
    await screen.findByRole('button', { name: 'Chowder' })
    const input = screen.getByRole('searchbox')
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: 'foo' } })
    await waitFor(() => expect(window.location.pathname).toBe('/buscar'))
  })

  it('redirects an unknown collection id to Home', async () => {
    window.history.replaceState({}, '', '/coleccion/nope')
    render(<App />)
    await screen.findByRole('button', { name: 'Cartoon Network' })
    expect(window.location.pathname).toBe('/')
  })
})

describe('App collections without matching titles', () => {
  it('redirects a collection with no titles in the catalog to Home and shows no strip', async () => {
    window.history.replaceState({}, '', '/coleccion/cartoon-network')
    render(<App />)
    await screen.findByRole('heading', { name: 'Foo Movie' })
    expect(window.location.pathname).toBe('/')
    expect(screen.queryByRole('navigation', { name: 'Colecciones' })).toBeNull()
  })
})
```

  (The second `describe` uses the file's default `CSV`, stubbed by the
  top-level `beforeEach`, which has only `Foo Movie`.)

- [ ] **Step 2: Run the tests to verify they fail.** Run
  `npx vitest run src/App.test.tsx`. Expected: the new `App collections`
  tests FAIL, because there's no `Cartoon Network` button. The
  "without matching titles" test may already pass, because today
  `/coleccion/...` parses to home. That's fine: it's a regression guard.

- [ ] **Step 3: Wire App.** In `src/App.tsx`:

  Add imports:

```tsx
import { COLLECTIONS } from './collections/collections'
import { Collection } from './screens/Collection'
```

  In `back()`, add a case before `case 'catalog':`:

```tsx
      case 'collection':
        navigate({ name: 'home' })
        break
```

  Replace `const resolved = resolveRoute(route, titles)` with:

```tsx
  const resolved = resolveRoute(route, titles, COLLECTIONS)
```

  Change the browse condition to
  `if (resolved.name === 'home' || resolved.name === 'catalog' || resolved.name === 'collection') {`
  and replace the screen switch inside `.go-browse` with:

```tsx
          {resolved.name === 'home' ? (
            <Home
              titles={titles}
              onSelect={openTitle}
              onResume={(title, row) => navigate({ name: 'play', key: title.key, videoId: rowKey(row) })}
              collections={COLLECTIONS}
              onOpenCollection={(collection) => navigate({ name: 'collection', id: collection.id })}
            />
          ) : resolved.name === 'catalog' ? (
            <Catalog
              titles={titles}
              section={resolved.section}
              query={resolved.query}
              onSelect={openTitle}
            />
          ) : (
            <Collection collection={resolved.collection} titles={resolved.titles} onSelect={openTitle} />
          )}
```

  Update the comment above `<FocusProvider key="browse"…>` to say "One
  provider for Home, the catalog and collection pages".

- [ ] **Step 4: Change Cartoon Network's tile colour.** In
  `data/collections/cartoon-network.json`, set `"color": "#e4007c"`. On
  `#000000` the logo's black square and wordmark vanish, and `#e4007c` gives
  about 4.6:1 contrast against both black and white.

- [ ] **Step 5: Run the tests to verify they pass.** Run
  `npx vitest run src/App.test.tsx && npx tsc -b`. Expected: PASS, and tsc
  exits 0.

- [ ] **Step 6: Update the README.** In `README.md` "## What's in it":

  - Replace the Home bullet's first sentence with:
    `**Home** — a hero for the featured title, a strip of collection tiles
    (Disney+-style brand cards, e.g. Cartoon Network), then 28
    focus-navigable rows: …`, keeping the rest of the row list as is.
  - Add a bullet after **Catalog**:

```markdown
- **Collections** — `/coleccion/<id>`: a hand-curated collection's banner and
  its titles in curated order, on the same grid as the catalog. Collections
  are defined in `data/collections/` (see *Collections* under *Data*).
```

  In "## Tests", run `npm test` and replace the `npm test` count with the
  total Vitest reports, keeping `collections` in the list.

- [ ] **Step 7: Mark the spec implemented.** In
  `docs/superpowers/specs/2026-09-24-collections-ui-design.md`, change
  `Status: **draft** (2026-09-24).` to `Status: **implemented** (2026-09-24).`

- [ ] **Step 8: Full verification.** Run `npm test && npm run build`.
  Expected: all tests pass, and the build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/App.test.tsx data/collections/cartoon-network.json README.md docs/superpowers/specs/2026-09-24-collections-ui-design.md
git commit -m "feat: wire collection tiles and pages into the app"
```
