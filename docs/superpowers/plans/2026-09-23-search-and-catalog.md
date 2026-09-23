# Search, Navbar and Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A navbar (Películas, Series, search box) on Home and a new reusable
catalog screen that renders every title matching a section filter and/or a
fuzzy title search.

**Architecture:**
- **Engine:** a pure search module (`src/search/search.ts`) and a selector
  (`src/catalog/selectTitles.ts`) turn `(titles, section, query)` into a card
  list plus a mode.
- **Route:** a new `catalog` route carries `section` and `query` in the URL.
- **Shell:** Home and the catalog share one `FocusProvider` with a persistent
  `Navbar`, so the search input keeps DOM focus (and the TV keyboard) while
  the screen underneath changes.
- **Focus core:** gains three small, opt-in hooks: an `onKey` claim,
  editable-element passthrough, and `claimsInitialFocus: false`. It also
  gains a programmatic `move`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-23-search-and-catalog-design.md`

## Global Constraints

- No new runtime dependencies. The search engine is hand-rolled.
- UI copy is Spanish, verbatim:
  - Links: "Películas", "Series".
  - Search placeholders: "Buscar", "Buscar en Películas", "Buscar en Series".
  - Headers: "Resultados para "…"", "Sin resultados para "…"",
    "Quizás te interese".
- URLs:
  - `/peliculas` and `/series`.
  - `/buscar?q=…[&en=peliculas|series]`.
- Focus rows:
  - Navbar is row **-2** (cols: Películas 0, Series 1, scope chip 2, search 3).
  - Home hero CTA stays -1.
  - Grids and rows start at 0.
- Focus ids: `nav:peliculas`, `nav:series`, `nav:scope`, `nav:search`,
  `grid:${title.key}`.
- Search thresholds:
  - `MATCH_MIN = 0.42`.
  - `FALLBACK_COUNT = 10`.
  - Grid `BATCH = 60`.
  - Fallback column count 5.
- No hover-only affordances. Remote first, with touch and mouse via `activate`.

## Review Focus

1. **Query of only spaces or punctuation** (`"   "`, `"!!!"`): the catalog
   behaves as a plain browse, with no "Sin resultados" and no crash. Tests in
   Task 2 and Task 3.
2. **Deep links with `+`, `%20` and accents**
   (`/buscar?q=pel%C3%ADcula+de&en=peliculas`): parse to the typed query and
   round-trip. Test in Task 3.
3. **Backspace or Escape while typing:** deletes a character or leaves
   editing, and never navigates back. Backspace while *not* editing still
   goes back. Tests in Task 4 and Task 5.
4. **Fewer results than columns, then Down from the search box:** lands on
   the first card, and Up from any card returns to the navbar. Test in Task 6.
5. **A section with zero titles** (catalog without shows): the header shows
   "Series · 0", nothing crashes, and focus stays in the navbar. Test in
   Task 6.

---

### Task 1: Search engine

**Files:**
- Create: `src/search/search.ts`
- Test: `src/search/search.test.ts`

**Interfaces:**
- Produces:
  - `normalize(value: string): string`
  - `scoreTitle(query: string, title: string): number` (0..1)
  - `search<T extends { title: string }>(query: string, items: T[]): { matches: T[]; fallback: boolean }`
  - `MATCH_MIN`, `FALLBACK_COUNT`

- [ ] **Step 1: Write failing tests** (`src/search/search.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { normalize, scoreTitle, search, MATCH_MIN, FALLBACK_COUNT } from './search'

const CATALOG = [
  'Castlevania',
  'Hora de Aventura',
  'Hora de Aventura: Con Fionna y Cake',
  'Spidey y sus Sorprendentes Amigos',
  'Yu-Gi-Oh!',
  'Spider-Man: A través del Spider-Verso',
  'Spider-Man: un nuevo universo',
  'Toy Story',
  'Toy Story 5',
  'El rey león',
  'Una película de huevos',
  'Goofy: La Película',
].map((title) => ({ title }))

const titlesOf = (query: string) => search(query, CATALOG).matches.map((t) => t.title)

describe('normalize', () => {
  it('lowercases, strips accents and collapses punctuation', () => {
    expect(normalize('  El Rey León!! ')).toBe('el rey leon')
    expect(normalize('Yu-Gi-Oh!')).toBe('yu gi oh')
    expect(normalize('Película')).toBe('pelicula')
  })

  it('returns an empty string for punctuation-only input', () => {
    expect(normalize('!!! --- ')).toBe('')
  })
})

describe('scoreTitle', () => {
  it('ranks title prefix > word prefix > substring > fuzzy', () => {
    const prefix = scoreTitle('toy', 'Toy Story')
    const wordPrefix = scoreTitle('story', 'Toy Story')
    const substring = scoreTitle('tory', 'Toy Story')
    const fuzzy = scoreTitle('tyo stroy', 'Toy Story')
    expect(prefix).toBeGreaterThan(wordPrefix)
    expect(wordPrefix).toBeGreaterThan(substring)
    expect(substring).toBeGreaterThan(fuzzy)
    expect(fuzzy).toBeGreaterThanOrEqual(MATCH_MIN)
  })

  it('ignores accents and case', () => {
    expect(scoreTitle('LEON', 'El rey león')).toBeGreaterThanOrEqual(0.9)
  })

  it('matches across removed spaces and hyphens', () => {
    expect(scoreTitle('yugioh', 'Yu-Gi-Oh!')).toBeGreaterThanOrEqual(0.9)
    expect(scoreTitle('spiderman', 'Spider-Man: un nuevo universo')).toBeGreaterThanOrEqual(0.9)
  })

  it('returns 0 for an empty or punctuation-only query', () => {
    expect(scoreTitle('', 'Toy Story')).toBe(0)
    expect(scoreTitle('!!', 'Toy Story')).toBe(0)
  })

  it('does not fuzzy-match tokens shorter than 3 characters', () => {
    expect(scoreTitle('xy', 'Toy Story')).toBe(0)
  })
})

describe('search', () => {
  it('tolerates typos', () => {
    expect(titlesOf('spidy')[0]).toBe('Spidey y sus Sorprendentes Amigos')
    expect(titlesOf('castelvania')[0]).toBe('Castlevania')
  })

  it('matches a partially typed, misspelled word', () => {
    expect(titlesOf('castelv')).toContain('Castlevania')
  })

  it('puts exact prefix matches first, then keeps catalog order on ties', () => {
    expect(titlesOf('toy')).toEqual(['Toy Story', 'Toy Story 5'])
  })

  it('matches every word of a multi-word query in any title position', () => {
    expect(titlesOf('pelicula')).toEqual(['Una película de huevos', 'Goofy: La Película'])
  })

  it('falls back to the closest titles when nothing matches', () => {
    const result = search('xqzvw', CATALOG)
    expect(result.fallback).toBe(true)
    expect(result.matches).toHaveLength(FALLBACK_COUNT)
  })

  it('reports fallback false when there are matches', () => {
    expect(search('toy', CATALOG).fallback).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure.** Run `npx vitest run src/search`.
  Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement** (`src/search/search.ts`)

```ts
/**
 * Title search for the catalog: partial, accent-insensitive and typo-tolerant.
 *
 * Scores are tiered so a clean match always outranks a fuzzy one: prefix >
 * word prefix > substring > fuzzy. Each substring tier also has a "compact"
 * variant, with spaces removed, so "yugioh" finds "Yu-Gi-Oh!".
 */

/** Below this a title isn't a match. Deliberately low: we'd rather show too much. */
export const MATCH_MIN = 0.42

/** How many "Quizás te interese" titles to show when nothing matches. */
export const FALLBACK_COUNT = 10

/** Scales fuzzy similarity so it can never outrank a real substring hit. */
const FUZZY_WEIGHT = 0.7

/** Shorter query words only count as a match on an exact prefix. */
const FUZZY_MIN_LENGTH = 3

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface Prepared {
  text: string
  compact: string
  tokens: string[]
  /** The compact form starting at each word, for compact word-prefix hits. */
  wordCompacts: string[]
}

function prepare(value: string): Prepared {
  const text = normalize(value)
  const tokens = text ? text.split(' ') : []
  return {
    text,
    compact: tokens.join(''),
    tokens,
    wordCompacts: tokens.map((_, i) => tokens.slice(i).join('')),
  }
}

// Titles are scored on every keystroke; normalizing them once is enough.
const preparedTitles = new Map<string, Prepared>()

function prepareTitle(title: string): Prepared {
  let prepared = preparedTitles.get(title)
  if (!prepared) {
    prepared = prepare(title)
    preparedTitles.set(title, prepared)
  }
  return prepared
}

/** Optimal-string-alignment Damerau-Levenshtein: a transposition is one edit. */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

function similarity(a: string, b: string): number {
  return 1 - editDistance(a, b) / Math.max(a.length, b.length)
}

/**
 * How well one query word matches one title word. Compared against the title
 * word's same-length prefix too, so a word still being typed ("castelv")
 * scores against where it's heading ("castlevania").
 */
function wordSimilarity(queryWord: string, titleWord: string): number {
  if (titleWord.startsWith(queryWord)) return 1
  if (queryWord.length < FUZZY_MIN_LENGTH) return 0
  const whole = similarity(queryWord, titleWord)
  const prefix =
    titleWord.length > queryWord.length
      ? similarity(queryWord, titleWord.slice(0, queryWord.length))
      : 0
  return Math.max(whole, prefix)
}

function fuzzy(query: Prepared, title: Prepared): number {
  if (title.tokens.length === 0) return 0
  let total = 0
  for (const queryWord of query.tokens) {
    let best = 0
    for (const titleWord of title.tokens) {
      best = Math.max(best, wordSimilarity(queryWord, titleWord))
      if (best === 1) break
    }
    total += best
  }
  return total / query.tokens.length
}

function scorePrepared(query: Prepared, title: Prepared): number {
  if (!query.text) return 0
  const t = title.text
  const q = query.text
  if (t.startsWith(q)) return 1
  if (title.compact.startsWith(query.compact)) return 0.95
  if (` ${t}`.includes(` ${q}`)) return 0.9
  if (title.wordCompacts.some((w) => w.startsWith(query.compact))) return 0.85
  if (t.includes(q)) return 0.8
  if (title.compact.includes(query.compact)) return 0.75
  return FUZZY_WEIGHT * fuzzy(query, title)
}

export function scoreTitle(query: string, title: string): number {
  return scorePrepared(prepare(query), prepareTitle(title))
}

/**
 * Titles scoring at least `MATCH_MIN`, best first, with catalog order breaking
 * ties. When nothing clears the bar, the closest `FALLBACK_COUNT` titles
 * instead, so a search is never a dead end.
 */
export function search<T extends { title: string }>(
  query: string,
  items: T[],
): { matches: T[]; fallback: boolean } {
  const prepared = prepare(query)
  const ranked = items
    .map((item, index) => ({ item, index, score: scorePrepared(prepared, prepareTitle(item.title)) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  const matches = ranked.filter((r) => r.score >= MATCH_MIN)
  if (matches.length > 0) return { matches: matches.map((r) => r.item), fallback: false }

  return { matches: ranked.slice(0, FALLBACK_COUNT).map((r) => r.item), fallback: true }
}
```

- [ ] **Step 4: Run to verify pass.** Run `npx vitest run src/search`.
  Expected: PASS. If a typo case fails, tune `MATCH_MIN` and the spec value
  together. Don't loosen a test.

- [ ] **Step 5: Commit.** Run `git add src/search && git commit -m "feat: add
  fuzzy title search engine"`.

---

### Task 2: Catalog selector

**Files:**
- Create: `src/catalog/selectTitles.ts`
- Test: `src/catalog/selectTitles.test.ts`

**Interfaces:**
- Consumes: `search`, `normalize` from Task 1. `Section` is defined here and
  re-exported by the router in Task 3, which avoids an import cycle.
- Produces:
  - `export type Section = 'all' | 'movie' | 'show'`
  - `export type CatalogMode = 'browse' | 'results' | 'suggestions'`
  - `selectTitles(titles: Title[], section: Section, query: string): { titles: Title[]; mode: CatalogMode }`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { selectTitles } from './selectTitles'
import type { Title } from '../types'

function title(key: string, name: string, kind: Title['kind']): Title {
  return {
    key, kind, title: name, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: '', views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [],
  }
}

const TITLES = [
  title('toy', 'Toy Story', 'movie'),
  title('cast', 'Castlevania', 'show'),
  title('toy5', 'Toy Story 5', 'movie'),
  title('hora', 'Hora de Aventura', 'show'),
]
const keys = (r: { titles: Title[] }) => r.titles.map((t) => t.key)

describe('selectTitles', () => {
  it('browses a section in catalog order', () => {
    const result = selectTitles(TITLES, 'movie', '')
    expect(result.mode).toBe('browse')
    expect(keys(result)).toEqual(['toy', 'toy5'])
    expect(keys(selectTitles(TITLES, 'show', ''))).toEqual(['cast', 'hora'])
  })

  it('searches the whole catalog for section "all"', () => {
    const result = selectTitles(TITLES, 'all', 'castle')
    expect(result.mode).toBe('results')
    expect(keys(result)).toEqual(['cast'])
  })

  it('scopes a search to the section', () => {
    expect(keys(selectTitles(TITLES, 'show', 'toy'))).not.toContain('toy')
  })

  it('reports suggestions when nothing matches', () => {
    const result = selectTitles(TITLES, 'all', 'xqzvw')
    expect(result.mode).toBe('suggestions')
    expect(result.titles.length).toBeGreaterThan(0)
  })

  it('treats a whitespace- or punctuation-only query as a browse', () => {
    expect(selectTitles(TITLES, 'movie', '   ').mode).toBe('browse')
    expect(selectTitles(TITLES, 'movie', '!!!').mode).toBe('browse')
  })
})
```

- [ ] **Step 2: Run to verify failure.** Run
  `npx vitest run src/catalog/selectTitles`. Expected: FAIL, because the
  module isn't found.

- [ ] **Step 3: Implement**

```ts
import type { Title } from '../types'
import { normalize, search } from '../search/search'

export type Section = 'all' | 'movie' | 'show'
export type CatalogMode = 'browse' | 'results' | 'suggestions'

/** The cards the catalog screen shows for a section and a (possibly empty) query. */
export function selectTitles(
  titles: Title[],
  section: Section,
  query: string,
): { titles: Title[]; mode: CatalogMode } {
  const inSection = section === 'all' ? titles : titles.filter((t) => t.kind === section)

  if (normalize(query) === '') return { titles: inSection, mode: 'browse' }

  const { matches, fallback } = search(query, inSection)
  return { titles: matches, mode: fallback ? 'suggestions' : 'results' }
}
```

- [ ] **Step 4: Run to verify pass.** Run
  `npx vitest run src/catalog/selectTitles`. Expected: PASS.

- [ ] **Step 5: Commit.** Run `git commit -m "feat: select catalog titles by
  section and search query"`.

---

### Task 3: Catalog routes

**Files:**
- Modify: `src/router/route.ts`, `src/router/useRoute.ts`,
  `src/router/resolveRoute.ts`
- Test: `src/router/route.test.ts`, `src/router/resolveRoute.test.ts`,
  `src/router/useRoute.test.tsx`

**Interfaces:**
- Consumes: `Section` from `src/catalog/selectTitles.ts`.
- Produces:
  - `Route` gains `{ name: 'catalog'; section: Section; query: string }`.
  - `parseRoute(pathname: string, search?: string): Route`
  - `routeToPath(route)`, handling the catalog route.
  - `browseRoute(section: Section): Route`, which returns `/peliculas`,
    `/series`, or Home.
  - `ResolvedView` gains `{ name: 'catalog'; section: Section; query: string }`.

- [ ] **Step 1: Write failing tests.** Append to `route.test.ts`:

```ts
describe('catalog routes', () => {
  it('parses the section browse paths', () => {
    expect(parseRoute('/peliculas')).toEqual({ name: 'catalog', section: 'movie', query: '' })
    expect(parseRoute('/series')).toEqual({ name: 'catalog', section: 'show', query: '' })
  })

  it('parses a search, with and without a section', () => {
    expect(parseRoute('/buscar', '?q=spidy')).toEqual({ name: 'catalog', section: 'all', query: 'spidy' })
    expect(parseRoute('/buscar', '?q=spidy&en=peliculas')).toEqual({ name: 'catalog', section: 'movie', query: 'spidy' })
    expect(parseRoute('/buscar', '?q=spidy&en=series')).toEqual({ name: 'catalog', section: 'show', query: 'spidy' })
  })

  it('decodes + and percent-encoded accents in the query', () => {
    expect(parseRoute('/buscar', '?q=pel%C3%ADcula+de&en=peliculas')).toEqual({
      name: 'catalog', section: 'movie', query: 'película de',
    })
  })

  it('collapses an empty search to the section browse route', () => {
    expect(parseRoute('/buscar', '?q=&en=series')).toEqual({ name: 'catalog', section: 'show', query: '' })
    expect(parseRoute('/buscar', '?q=%20%20')).toEqual({ name: 'home' })
    expect(parseRoute('/buscar')).toEqual({ name: 'home' })
  })

  it('ignores an unknown section', () => {
    expect(parseRoute('/buscar', '?q=x&en=docs')).toEqual({ name: 'catalog', section: 'all', query: 'x' })
  })

  it('round-trips every catalog route', () => {
    const routes = [
      { name: 'catalog', section: 'movie', query: '' },
      { name: 'catalog', section: 'show', query: '' },
      { name: 'catalog', section: 'all', query: 'película & co' },
      { name: 'catalog', section: 'movie', query: 'toy story' },
    ] as const
    for (const route of routes) {
      const url = new URL(routeToPath(route), 'http://x')
      expect(parseRoute(url.pathname, url.search)).toEqual(route)
    }
  })

  it('prints an empty "all" catalog as home', () => {
    expect(routeToPath({ name: 'catalog', section: 'all', query: '' })).toBe('/')
  })
})
```

Append to `resolveRoute.test.ts`:

```ts
  it('resolves a catalog route to the catalog view', () => {
    expect(resolveRoute({ name: 'catalog', section: 'movie', query: 'x' }, [])).toEqual({
      name: 'catalog', section: 'movie', query: 'x',
    })
  })

  it('resolves an empty "all" catalog to home', () => {
    expect(resolveRoute({ name: 'catalog', section: 'all', query: '' }, [])).toEqual({ name: 'home' })
  })
```

Append to `useRoute.test.tsx`:

```ts
  it('reads the query string from the initial URL', () => {
    window.history.replaceState({}, '', '/buscar?q=toy&en=peliculas')
    const { result } = renderHook(() => useRoute())
    expect(result.current.route).toEqual({ name: 'catalog', section: 'movie', query: 'toy' })
  })
```

- [ ] **Step 2: Run to verify failure.** Run `npx vitest run src/router`.
  Expected: the new cases FAIL.

- [ ] **Step 3: Implement.** In `route.ts`:

```ts
import type { Section } from '../catalog/selectTitles'

export type { Section }

export type Route =
  | { name: 'home' }
  | { name: 'title'; key: string }
  | { name: 'play'; key: string; videoId: string }
  | { name: 'catalog'; section: Section; query: string }

const SECTION_SLUGS: Record<Exclude<Section, 'all'>, string> = { movie: 'peliculas', show: 'series' }

function sectionFromSlug(slug: string | null): Section {
  if (slug === SECTION_SLUGS.movie) return 'movie'
  if (slug === SECTION_SLUGS.show) return 'show'
  return 'all'
}

/** Where a section lives with no query: its browse page, or Home for "all". */
export function browseRoute(section: Section): Route {
  return section === 'all' ? { name: 'home' } : { name: 'catalog', section, query: '' }
}
```

Then, in `parseRoute(pathname, search = '')`, before the final fallback:

```ts
  if (segments.length === 1 && segments[0] === SECTION_SLUGS.movie) return browseRoute('movie')
  if (segments.length === 1 && segments[0] === SECTION_SLUGS.show) return browseRoute('show')

  if (segments.length === 1 && segments[0] === 'buscar') {
    const params = new URLSearchParams(search)
    const section = sectionFromSlug(params.get('en'))
    const query = params.get('q') ?? ''
    return query.trim() === '' ? browseRoute(section) : { name: 'catalog', section, query }
  }
```

And in `routeToPath`:

```ts
    case 'catalog': {
      if (route.query.trim() === '') {
        return route.section === 'all' ? '/' : `/${SECTION_SLUGS[route.section]}`
      }
      const params = new URLSearchParams({ q: route.query })
      if (route.section !== 'all') params.set('en', SECTION_SLUGS[route.section])
      return `/buscar?${params}`
    }
```

In `useRoute.ts`, both `parseRoute(window.location.pathname)` calls become
`parseRoute(window.location.pathname, window.location.search)`.

In `resolveRoute.ts`, add
`| { name: 'catalog'; section: Section; query: string }` to `ResolvedView`,
then add this after the home check:

```ts
  if (route.name === 'catalog') {
    if (route.section === 'all' && route.query.trim() === '') return { name: 'home' }
    return { name: 'catalog', section: route.section, query: route.query }
  }
```

- [ ] **Step 4: Run to verify pass.** Run `npx vitest run src/router` and
  `npx tsc -b`. Expected: PASS, and `App.tsx` still type-checks because
  catalog falls through to the Detail branch. That gets fixed in Task 7.

- [ ] **Step 5: Commit.** Run `git commit -m "feat: add catalog routes for
  sections and search"`.

---

### Task 4: Focus core hooks

**Files:**
- Modify: `src/focus/FocusProvider.tsx`, `src/focus/useFocusable.ts`
- Test: `src/focus/FocusProvider.test.tsx`

**Interfaces:**
- Produces:
  - `FocusItem` gains `onKey?: (key: string) => boolean` and
    `claimsInitialFocus?: boolean` (default true).
  - The context value gains `move(key: ArrowKey): void`, and
    `useFocusState()` returns `{ focusedId, focus, move }`.
  - `useFocusable(id, row, col, onEnter, options?: { onKey?: (key: string) => boolean; claimsInitialFocus?: boolean })`.
  - `ArrowKey` is exported.

Behavior:
- **`onKey` claim:** on keydown, if the focused item's `onKey(event.key)`
  returns `true`, the provider calls `preventDefault` and stops.
- **Editable passthrough:** otherwise, if `document.activeElement` is an
  editable element (`input`, `textarea`, or `isContentEditable`) and the key
  is `ArrowLeft`, `ArrowRight` or `Backspace`, the provider returns without
  handling it or calling `preventDefault`.
- **Initial focus:** items with `claimsInitialFocus: false` never take focus
  on registration. The fallback when the focused item unregisters also
  prefers items that claim initial focus.
- **`move(key)`:** runs the same neighbour-and-scroll logic as an arrow key
  press.

- [ ] **Step 1: Write failing tests.** Append to `FocusProvider.test.tsx`:

```tsx
function KeyCell({ id, row, col, onKey }: { id: string; row: number; col: number; onKey: (k: string) => boolean }) {
  const { ref, focused } = useFocusable(id, row, col, () => {}, { onKey })
  return <div ref={ref} data-testid={id} data-focused={focused}>{id}</div>
}

function PassiveCell({ id, row, col }: { id: string; row: number; col: number }) {
  const { ref, focused } = useFocusable(id, row, col, () => {}, { claimsInitialFocus: false })
  return <div ref={ref} data-focused={focused}>{id}</div>
}

describe('FocusProvider key hooks', () => {
  it('lets the focused item claim a key before the default handling', () => {
    const onBack = vi.fn()
    const onKey = vi.fn((key: string) => key === 'Escape')
    render(
      <FocusProvider onBack={onBack}>
        <KeyCell id="a" row={0} col={0} onKey={onKey} />
        <Cell id="b" row={0} col={1} />
      </FocusProvider>,
    )
    press('Escape')
    expect(onKey).toHaveBeenCalledWith('Escape')
    expect(onBack).not.toHaveBeenCalled()
    press('ArrowRight') // not claimed → default
    expect(focusedId()).toBe('b')
  })

  it('leaves Left/Right/Backspace to a focused text input', () => {
    const onBack = vi.fn()
    render(
      <FocusProvider onBack={onBack}>
        <Cell id="a" row={0} col={0} />
        <Cell id="b" row={0} col={1} />
        <input data-testid="field" />
      </FocusProvider>,
    )
    const field = document.querySelector('input')!
    field.focus()
    for (const key of ['ArrowRight', 'ArrowLeft', 'Backspace']) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(onBack).not.toHaveBeenCalled()
    expect(focusedId()).toBe('a')
  })

  it('still goes back on Backspace when no input has focus', () => {
    const onBack = vi.fn()
    render(<Grid onBack={onBack} />)
    press('Backspace')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('does not give initial focus to passive items', () => {
    render(
      <FocusProvider onBack={() => {}}>
        <PassiveCell id="nav" row={-2} col={0} />
        <Cell id="a" row={0} col={0} />
      </FocusProvider>,
    )
    expect(focusedId()).toBe('a')
    press('ArrowUp')
    expect(focusedId()).toBe('nav')
  })

  it('moves focus programmatically', () => {
    function Mover() {
      const { move } = useFocusState()
      return <button onClick={() => move('ArrowDown')}>move</button>
    }
    const { getByText } = render(
      <FocusProvider onBack={() => {}}>
        <Cell id="a" row={0} col={0} />
        <Cell id="c" row={1} col={0} />
        <Mover />
      </FocusProvider>,
    )
    fireEvent.click(getByText('move'))
    expect(focusedId()).toBe('c')
  })
})
```

Also add `useFocusState` to the import from `./FocusProvider`.

- [ ] **Step 2: Run to verify failure.** Run `npx vitest run src/focus`.
  Expected: the new cases FAIL, either on types (the `useFocusable` options)
  or on assertions.

- [ ] **Step 3: Implement.** In `FocusProvider.tsx`:
  - Export `ArrowKey`.
  - Add `onKey?` and `claimsInitialFocus?` to `FocusItem`, and `move` to the
    context value.
  - `register`:
    ```ts
    items.current.set(item.id, item)
    if (item.claimsInitialFocus === false) {
      setFocusedId((current) => current) // passive items never claim focus
    } else {
      setFocusedId((current) => (current && items.current.has(current) ? current : item.id))
    }
    ```
    And in cleanup, the fallback picks
    `[...items.current.values()].find((i) => i.claimsInitialFocus !== false) ?? first value`.
  - Extract the arrow branch into a `moveFocus(key)` helper built with
    `useCallback`, reading the latest focused id through a ref
    (`focusedRef.current`, kept in sync on each render). Use it both from the
    keydown handler and as `move`.
  - The keydown handler begins with:
    ```ts
    const current = focusedRef.current ? items.current.get(focusedRef.current) : undefined
    if (current?.onKey?.(event.key)) {
      event.preventDefault()
      return
    }
    if (isEditable(document.activeElement) && PASSTHROUGH_KEYS.has(event.key)) return
    ```
    Here `PASSTHROUGH_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Backspace'])`
    and `isEditable = (el) => el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)`.

  In `useFocusable.ts`, add the `options` param. Keep `options.onKey` in a
  ref, like `onEnter`, and register
  `onKey: (key) => onKeyRef.current?.(key) ?? false` and
  `claimsInitialFocus: options?.claimsInitialFocus`. Add
  `options?.claimsInitialFocus` to the effect deps.

- [ ] **Step 4: Run to verify pass.** Run `npx vitest run src/focus` and then
  `npx vitest run`. Expected: all PASS, with the existing tests unchanged.

- [ ] **Step 5: Commit.** Run `git commit -m "feat: let focusables claim keys,
  pass edit keys to inputs, opt out of initial focus"`.

---

### Task 5: Navbar and SearchBox

**Files:**
- Create: `src/components/Navbar.tsx`, `src/components/SearchBox.tsx`,
  `src/components/Navbar.css`
- Test: `src/components/Navbar.test.tsx`

**Interfaces:**
- Consumes: `useFocusable` options and `useFocusState().move/focus` from
  Task 4. `Route`, `Section` and `browseRoute` from Task 3.
- Produces:
  - `NAV_ROW = -2`
  - `<Navbar route={Route} onNavigate={(route: Route, options?: { replace?: boolean }) => void} />`

  The Navbar owns all navbar navigation rules:
  - **Links:** push `browseRoute(section)`.
  - **Typing:** the first non-blank query pushes; later keystrokes replace;
    a blank query replaces with `browseRoute(section)`.
  - **Chip:** replaces with the `'all'` section, then `focus('nav:search')`.

  `SearchBox` is internal to the navbar. Its props are
  `{ value: string; placeholder: string; onChange: (value: string) => void }`.

Behavior:
- **Selected vs editing:** the SearchBox is a focusable wrapper `div`
  (`nav:search`, row -2, col 3, `claimsInitialFocus: false`) containing an
  `<input type="search">`. `editing` is local state.
- **Entering editing:** `onEnter` sets `editing = true`. The input's
  `onFocus` also sets it, which covers a direct tap.
- **DOM focus:** an effect focuses the input when `editing` turns true. When
  it turns false while the box is still model-focused, the wrapper gets DOM
  focus back.
- **`onKey` while editing:**
  - `Enter` or `ArrowDown`: `editing = false`, then `move('ArrowDown')`,
    then return true.
  - `ArrowUp` or `Escape`: `editing = false`, then return true.
  - Anything else returns false.
- **Not editing:** `onKey` returns false.
- **Blur:** `onBlur` on the input sets `editing = false`.
- **Links and chip:** both are focusable `div role="button"` with
  `claimsInitialFocus: false`, using the same `is-focused` styling pattern as
  `HeroCta`. The active link gets `is-active`.

- [ ] **Step 1: Write failing tests** (`src/components/Navbar.test.tsx`)

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { Navbar } from './Navbar'
import { FocusProvider } from '../focus/FocusProvider'
import { useFocusable } from '../focus/useFocusable'
import type { Route } from '../router/route'

function Result() {
  const { ref, focused } = useFocusable('grid:a', 0, 0, () => {})
  return <div ref={ref} data-testid="result" data-focused={focused} />
}

function Harness({ initial, spy, onBack = () => {} }: { initial: Route; spy?: (route: Route, options?: { replace?: boolean }) => void; onBack?: () => void }) {
  const [route, setRoute] = useState<Route>(initial)
  const onNavigate = (next: Route, options?: { replace?: boolean }) => {
    spy?.(next, options)
    setRoute(next)
  }
  return (
    <FocusProvider onBack={onBack}>
      <Navbar route={route} onNavigate={onNavigate} />
      <Result />
      <output data-testid="route">{JSON.stringify(route)}</output>
    </FocusProvider>
  )
}

const press = (key: string) => fireEvent.keyDown(window, { key })
const input = () => screen.getByRole('searchbox') as HTMLInputElement
const route = () => JSON.parse(screen.getByTestId('route').textContent!)

describe('Navbar', () => {
  it('navigates to the section pages', () => {
    render(<Harness initial={{ name: 'home' }} />)
    fireEvent.click(screen.getByText('Películas'))
    expect(route()).toEqual({ name: 'catalog', section: 'movie', query: '' })
    fireEvent.click(screen.getByText('Series'))
    expect(route()).toEqual({ name: 'catalog', section: 'show', query: '' })
  })

  it('pushes the first keystroke and replaces the rest, scoped to the section', () => {
    const spy = vi.fn()
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: '' }} spy={spy} />)
    fireEvent.click(input())
    fireEvent.change(input(), { target: { value: 't' } })
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'movie', query: 't' }, { replace: false })
    fireEvent.change(input(), { target: { value: 'to' } })
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'movie', query: 'to' }, { replace: true })
    fireEvent.change(input(), { target: { value: '' } })
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'movie', query: '' }, { replace: true })
  })

  it('clearing a search started from Home returns Home', () => {
    render(<Harness initial={{ name: 'catalog', section: 'all', query: 'x' }} />)
    fireEvent.click(input())
    fireEvent.change(input(), { target: { value: '' } })
    expect(route()).toEqual({ name: 'home' })
  })

  it('shows a removable scope chip while searching a section', () => {
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: 'toy' }} />)
    fireEvent.click(screen.getByRole('button', { name: /quitar filtro películas/i }))
    expect(route()).toEqual({ name: 'catalog', section: 'all', query: 'toy' })
    expect(screen.queryByRole('button', { name: /quitar filtro/i })).toBeNull()
    expect(document.querySelector('.go-search[data-focused="true"]')).not.toBeNull()
  })

  it('uses a scoped placeholder', () => {
    render(<Harness initial={{ name: 'catalog', section: 'show', query: '' }} />)
    expect(input().placeholder).toBe('Buscar en Series')
  })

  it('Enter starts editing; Escape stops editing without going back', () => {
    const onBack = vi.fn()
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: '' }} onBack={onBack} />)
    press('ArrowUp') // result → navbar row
    // Walk right to the search box.
    press('ArrowRight'); press('ArrowRight'); press('ArrowRight')
    expect(document.querySelector('.go-search[data-focused="true"]')).not.toBeNull()
    press('Enter')
    expect(document.activeElement).toBe(input())
    press('Escape')
    expect(onBack).not.toHaveBeenCalled()
    expect(document.activeElement).not.toBe(input())
    expect(document.querySelector('.go-search[data-focused="true"]')).not.toBeNull()
  })

  it('Backspace while editing does not go back', () => {
    const onBack = vi.fn()
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: 'to' }} onBack={onBack} />)
    fireEvent.click(input())
    fireEvent.keyDown(input(), { key: 'Backspace' })
    expect(onBack).not.toHaveBeenCalled()
  })

  it('Down while editing moves to the first result', () => {
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: 'to' }} />)
    fireEvent.click(input())
    press('ArrowDown')
    expect(screen.getByTestId('result').dataset.focused).toBe('true')
  })
})
```

(`fireEvent.keyDown(input(), …)` bubbles to `window`, where the provider
listens.)

- [ ] **Step 2: Run to verify failure.** Run
  `npx vitest run src/components/Navbar`. Expected: FAIL, because the module
  isn't found.

- [ ] **Step 3: Implement**
  - `Navbar.tsx`: renders
    `<nav className="go-nav">`, containing the wordmark
    (`go-wordmark`, moved from the hero), `NavLink ×2`, the optional
    `ScopeChip`, and `SearchBox`.
  - **Derived values:**
    - `section` is `route.section` for a catalog route, otherwise `'all'`.
    - `query` is `route.query` for a catalog route, otherwise `''`.
    - `hasQuery` is `query.trim() !== ''`.
  - **Change handler:**
    ```ts
    const onQueryChange = (value: string) => {
      if (value.trim() === '') onNavigate(browseRoute(section), { replace: true })
      else onNavigate({ name: 'catalog', section, query: value }, { replace: hasQuery })
    }
    ```
  - **Chip:** only rendered when `hasQuery && section !== 'all'`. Its label
    is `{SECTION_LABELS[section]} ✕` and its
    `aria-label` is `Quitar filtro ${label}`. On activate:
    `onNavigate({ name: 'catalog', section: 'all', query }, { replace: true }); focus('nav:search')`.
  - **Placeholder:** `section === 'all' ? 'Buscar' : \`Buscar en ${SECTION_LABELS[section]}\``,
    where `SECTION_LABELS = { movie: 'Películas', show: 'Series' }`.
  - `SearchBox.tsx` implements the behavior described above. The wrapper
    carries `className="go-search"` plus `is-focused` / `is-editing`.
  - `Navbar.css`:
    - `.go-nav` is a flex row with the wordmark, links and the search pushed
      right (`margin-left: auto`). It's absolutely positioned over the top of
      the browse shell, with padding `var(--go-safe-y) var(--go-safe-x) 1.5rem`,
      a `linear-gradient(to bottom, var(--go-bg) 55%, transparent)` background
      and `z-index: 3`.
    - Define `--go-nav-h: 6.5rem` on `:root` in `tokens.css`.
    - **Links:** muted text, accent underline when `is-active`, and the
      accent pill when `is-focused` (as with `.go-hero_cta.is-focused`).
    - **Search:** a pill with a hairline border. Accent ring when focused,
      accent border while editing.
    - **Wordmark:** its `margin-bottom` is reset to 0 inside `.go-nav`.

- [ ] **Step 4: Run to verify pass.** Run
  `npx vitest run src/components/Navbar`. Expected: PASS.

- [ ] **Step 5: Commit.** Run `git commit -m "feat: add navbar with section
  links and search box"`.

---

### Task 6: Catalog screen

**Files:**
- Create: `src/screens/Catalog.tsx`, `src/screens/Catalog.css`,
  `src/screens/useGridColumns.ts`
- Test: `src/screens/Catalog.test.tsx`

**Interfaces:**
- Consumes: `selectTitles` from Task 2, `Card`, `Section`.
- Produces:
  - `<Catalog titles={Title[]} section={Section} query={string} onSelect={(t: Title) => void} />`
  - `useGridColumns(ref: RefObject<HTMLElement | null>, fallback = 5): number`,
    which reads `getComputedStyle(el).gridTemplateColumns.split(' ').length`
    inside a `ResizeObserver` callback. When `ResizeObserver` is undefined,
    or the value is `none` or empty, it returns `fallback`.
  - `BATCH = 60`

Behavior:
- **Header:**
  - An `h1` with the section label ("Películas" or "Series") or the
    results/suggestions copy.
  - A `go-row_count` span with the number of titles (omitted in
    suggestions).
  - A subheading "Quizás te interese" in suggestions mode.
  - `section: 'all'` browse can't reach here: it resolves to Home.
- **Batches:** `CatalogGrid` is rendered with `key={`${section}|${query}`}`
  so the batch resets on change. `limit` starts at `BATCH`, or `Infinity`
  when `IntersectionObserver` is undefined.
- **Sentinel:** a `div.go-catalog_sentinel` rendered when
  `limit < titles.length`. An effect keyed on `limit` observes it with
  `rootMargin: '100% 0px'` and calls `setLimit(l => l + BATCH)` on
  intersection.
- **Cards:**
  `<Card id={`grid:${t.key}`} row={Math.floor(i / cols)} col={i % cols} … />`.
- **Empty section:** zero titles renders the header plus
  `<p className="go-catalog_empty">No hay títulos.</p>`.

- [ ] **Step 1: Write failing tests** (`src/screens/Catalog.test.tsx`)

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Catalog } from './Catalog'
import { FocusProvider } from '../focus/FocusProvider'
import { useFocusable } from '../focus/useFocusable'
import type { Title } from '../types'

function title(key: string, name: string, kind: Title['kind'] = 'movie'): Title {
  return {
    key, kind, title: name, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: '', views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [],
  }
}

const MOVIES = Array.from({ length: 12 }, (_, i) => title(`m${i}`, `Movie ${i}`))

function NavStub() {
  const { ref, focused } = useFocusable('nav:search', -2, 3, () => {}, { claimsInitialFocus: false })
  return <div ref={ref} data-testid="nav" data-focused={focused} />
}

function renderCatalog(props: Partial<Parameters<typeof Catalog>[0]> = {}) {
  return render(
    <FocusProvider onBack={() => {}}>
      <NavStub />
      <Catalog titles={MOVIES} section="movie" query="" onSelect={() => {}} {...props} />
    </FocusProvider>,
  )
}

const press = (key: string) => fireEvent.keyDown(window, { key })
const focusedCard = () => document.querySelector('.go-card[data-focused="true"]')?.getAttribute('aria-label')

describe('Catalog', () => {
  it('headers a section browse with its count', () => {
    renderCatalog()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Películas')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('12')
  })

  it('headers search results', () => {
    renderCatalog({ query: 'movie 3' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Resultados para "movie 3"')
  })

  it('shows suggestions when nothing matches', () => {
    renderCatalog({ query: 'xqzvw' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Sin resultados para "xqzvw"')
    expect(screen.getByText('Quizás te interese')).toBeTruthy()
    expect(document.querySelectorAll('.go-card').length).toBeGreaterThan(0)
  })

  it('lays cards out in a 5-column focus grid', () => {
    renderCatalog()
    expect(focusedCard()).toBe('Movie 0')
    press('ArrowDown')
    expect(focusedCard()).toBe('Movie 5')
    press('ArrowRight')
    expect(focusedCard()).toBe('Movie 6')
    press('ArrowDown'); press('ArrowRight'); press('ArrowRight'); press('ArrowRight')
    expect(focusedCard()).toBe('Movie 11') // short last row: stays on nearest
  })

  it('goes from the grid up to the navbar and back down with few results', () => {
    renderCatalog({ titles: MOVIES.slice(0, 2) })
    press('ArrowUp')
    expect(screen.getByTestId('nav').dataset.focused).toBe('true')
    press('ArrowDown')
    expect(focusedCard()).toBe('Movie 0')
  })

  it('renders every card when IntersectionObserver is unavailable', () => {
    renderCatalog({ titles: Array.from({ length: 130 }, (_, i) => title(`t${i}`, `T ${i}`)) })
    expect(document.querySelectorAll('.go-card')).toHaveLength(130)
  })

  it('handles an empty section', () => {
    renderCatalog({ titles: [], section: 'show' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Series')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('0')
    expect(screen.getByText('No hay títulos.')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify failure.** Run
  `npx vitest run src/screens/Catalog`. Expected: FAIL, because the module
  isn't found.

- [ ] **Step 3: Implement.** Write `Catalog.tsx`, `useGridColumns.ts` and
  `Catalog.css` as described:
  - `.go-catalog`:
    - `height: 100%; overflow-y: auto`, with hidden scrollbars as in
      `.go-home`.
    - `padding: var(--go-nav-h) 0 var(--go-safe-y)`.
    - `scroll-padding-top: var(--go-nav-h)`, so `scrollIntoView` doesn't tuck
      cards under the navbar.
  - `.go-catalog_head`: margin uses `var(--go-safe-x)`. The `h1` uses
    `var(--go-size-section)` × 1.3 at weight 800.
  - `.go-catalog_grid`:
    - `display: grid; grid-template-columns: repeat(auto-fill, var(--go-card-w)); gap: 2rem var(--go-gap)`.
    - `padding: 1.25rem var(--go-safe-x)`.
    - `justify-content: start`.

- [ ] **Step 4: Run to verify pass.** Run
  `npx vitest run src/screens/Catalog`. Expected: PASS.

- [ ] **Step 5: Commit.** Run `git commit -m "feat: add catalog grid screen"`.

---

### Task 7: Wire the browse shell into App

**Files:**
- Modify: `src/App.tsx`, `src/screens/Home.tsx`, `src/screens/Home.css`,
  `README.md`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: everything above.

Behavior:
- **Browse shell:** Home and the catalog share
  `<FocusProvider key="browse" onBack={back}>`, inside a
  `<div className="go-browse">` that holds `<Navbar route={route} onNavigate={navigate} />`
  followed by either `<Home …/>` or
  `<Catalog titles section query onSelect={openTitle} />`.
- **`lastBrowseRoute`:** a `useRef<Route>({ name: 'home' })`, assigned in
  render when the resolved view is home or catalog.
- **`back`:**
  - play goes to its title.
  - title goes to `lastBrowseRoute.current`.
  - catalog goes to home.
  - home does nothing.
- **Home:** remove the `go-wordmark` block from the hero, since it's in the
  navbar now. Add `padding-top: var(--go-nav-h)` to `.go-hero` in place of
  `var(--go-safe-y)` top, and `scroll-padding-top: var(--go-nav-h)` to
  `.go-home`.
- **`.go-browse`:** `position: relative; height: 100%`.

- [ ] **Step 1: Write failing tests.** Append to the `App routing` describe
  block in `App.test.tsx`:

```tsx
  it('typing on Home moves to /buscar with the same input still focused', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Foo Movie' })
    const input = screen.getByRole('searchbox')
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: 'foo' } })
    await waitFor(() => expect(window.location.pathname).toBe('/buscar'))
    expect(window.location.search).toBe('?q=foo')
    expect(screen.getByRole('searchbox')).toBe(input)
    expect(document.activeElement).toBe(input)
    screen.getByRole('heading', { name: /Resultados para "foo"/ })
  })

  it('returns to the search from a title opened in it', async () => {
    window.history.replaceState({}, '', '/buscar?q=foo')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Foo Movie' }))
    await waitFor(() => expect(window.location.pathname).toBe('/title/111'))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(window.location.pathname).toBe('/buscar'))
    expect(window.location.search).toBe('?q=foo')
  })

  it('navbar links open the section catalogs', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Foo Movie' })
    fireEvent.click(screen.getByText('Películas'))
    await waitFor(() => expect(window.location.pathname).toBe('/peliculas'))
    screen.getByRole('heading', { level: 1, name: /Películas/ })
    fireEvent.click(screen.getByText('Series'))
    await waitFor(() => expect(window.location.pathname).toBe('/series'))
  })
```

(`Card` has `role="button"` and `aria-label={title.title}`. On `/buscar` the
hero isn't rendered, so the card is the only "Foo Movie" button.)

- [ ] **Step 2: Run to verify failure.** Run `npx vitest run src/App`.
  Expected: the new cases FAIL.

- [ ] **Step 3: Implement** the App, Home and CSS changes above. Update the
  README: add a "Search and catalog" bullet under **What's in it**, and add
  the URLs.

- [ ] **Step 4: Run to verify pass.** Run `npx vitest run` and
  `npm run build`. Expected: all tests PASS, and the type-check and build
  succeed.

- [ ] **Step 5: Commit.** Run `git commit -m "feat: navbar and catalog screen
  for browsing and searching"`.
