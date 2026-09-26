# Android Phase 6 — External titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parity with the web's external titles: TMDB hits in search (with the "Lenguaje original" / "Doblaje latino" source choice and the TMDB credit), TMDB titles' Detail, vidlove playback, and played TMDB titles in Seguir viendo — all behind the build-time switch.

**Architecture:** Core already holds the TMDB client, mapping, merge and snapshots; this phase ports the web's two React hooks (`useTmdbSearch`, `useTmdbTitle`) to the mobile app (the title cache is in memory only: the web's sessionStorage has no mobile counterpart, and snapshots cover relaunches), threads TMDB results through `CatalogView`/`SearchView`, and resolves `tmdb-*` keys in the Detail and Player routes through one pure `titleSource` decision. The player's vidlove path was built and unit-tested in Phase 4.

**Tech Stack:** Expo SDK 57, react-native-tvos 0.86 (its `URL`/`URLSearchParams` implement `set`/`get`, which core's TMDB client uses), expo-router; Jest + RNTL 14.

**Spec:** `docs/superpowers/specs/2026-09-26-android-app-design.md` (Phase 6 row; *Ports* — `ExternalConfig` from Expo `extra`; *Data flow* — "TMDB is called directly from the app with the baked token"; *Error handling* — "TMDB failure / rate limit → catalog-only results, as the web").

## Global Constraints

- The switch: external titles are on only when `EXTERNAL_TITLES` is `on` and a token is set (core `externalTitlesEnabled()`); off, the app is exactly the catalog-only app.
- Config comes from `.env.local` via `app.config.ts` → Expo `extra` (already wired: `VITE_EXTERNAL_TITLES`, `VITE_TMDB_TOKEN`). **Never print the token** in logs, tests or messages.
- TMDB failure or rate limit → catalog-only results, as the web.
- TMDB's API terms: the credit "Datos de títulos: TMDB" wherever its data is shown in results.
- Snapshots and progress live in MMKV with the web's keys and formats (core, unchanged).
- vidlove: no play/pause (disabled); seek works; our resume wins over vidlove's own.
- Copy verbatim from the web: "Lenguaje original", "Doblaje latino", "Buscando…", "Datos de títulos: TMDB", "Cargando título…", "No se pudo cargar el título.".
- Faithful port; testing on the user's phone only; TV items go to `docs/superpowers/tv-checklist.md`.

## Review Focus

1. **TMDB unreachable or failing mid-search** — the catalog results still show (no "Buscando…" forever). Pinned in Task 1 (`reports a failure`) and Task 2 (`falls back to the catalog when TMDB fails`).
2. **Switch off** (no token, or `EXTERNAL_TITLES` not `on`) — no source chips, no credit, no TMDB requests, and a `tmdb-*` link goes Home. Pinned in Task 1 (`is off while the switch is off`), Task 2 (`hides the source choice while external titles are off`), Task 3 (`titleSource` switch-off case).
3. **Relaunch offline with a played TMDB title** — its Detail still opens from the snapshot, and it's in Seguir viendo. Pinned in Task 1 (`serves a snapshot at once, and keeps it while TMDB is unreachable`) and Task 4.
4. **Typing fast** — one TMDB request per settled query, and a repeated query costs nothing. Pinned in Task 1 (`debounces`, `serves a repeated query from cache`).
5. **"Doblaje latino" chosen** — TMDB is skipped entirely for that search. Pinned in Task 2 (`Doblaje latino searches the catalog only`).

---

### Task 1: Mobile TMDB hooks

**Files:**
- Create: `apps/mobile/src/external/useTmdbSearch.ts`, `useTmdbSearch.test.tsx`
- Create: `apps/mobile/src/external/useTmdbTitle.ts`, `useTmdbTitle.test.tsx`

**Interfaces:**
- Consumes: core `searchTmdb`, `resetGenresForTests` (`external/tmdb/search`), `fetchTmdbTitle` (`external/tmdb/title`), `tmdbAvailable` (`external/tmdb/client`), `readSnapshot`, `TmdbSearchState` (`external/mergeSearch`), `normalize`.
- Produces:
  - `TMDB_DEBOUNCE_MS = 400`, `SEARCH_MIN_CHARS = 2`, `useTmdbSearch(query: string, section: Section, enabled: boolean): TmdbSearchState`, `resetTmdbSearchForTests()`
  - `type TmdbTitleState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; title: Title } | { status: 'not-found' } | { status: 'error' }`, `useTmdbTitle(key: string | null): TmdbTitleState`, `resetTmdbTitleCacheForTests()`

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/external/useTmdbSearch.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react-native'
import type { Title } from '@go10/core/types'
import { searchTmdb } from '@go10/core/external/tmdb/search'
import { tmdbAvailable } from '@go10/core/external/tmdb/client'
import { resetTmdbSearchForTests, useTmdbSearch } from './useTmdbSearch'

jest.mock('@go10/core/external/tmdb/search', () => ({ searchTmdb: jest.fn(), resetGenresForTests: jest.fn() }))
jest.mock('@go10/core/external/tmdb/client', () => ({ tmdbAvailable: jest.fn() }))
const search = searchTmdb as jest.MockedFunction<typeof searchTmdb>
const available = tmdbAvailable as jest.MockedFunction<typeof tmdbAvailable>

const BATMAN = { key: 'tmdb-movie-155', title: 'Batman' } as Title

// RNTL 14's async render and act settle through setImmediate/queueMicrotask; freezing them hangs.
beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] })
  resetTmdbSearchForTests()
  search.mockReset()
  available.mockReturnValue(true)
})
afterEach(() => jest.useRealTimers())

const settle = () => act(async () => { jest.advanceTimersByTime(400) })

describe('useTmdbSearch', () => {
  it('searches once typing settles and returns the hits', async () => {
    search.mockResolvedValue([BATMAN])
    const { result } = await renderHook(() => useTmdbSearch('batman', 'all', true))
    expect(result.current.status).toBe('pending')
    await settle()
    expect(result.current).toEqual({ status: 'done', titles: [BATMAN] })
    expect(search).toHaveBeenCalledWith('batman', 'all', expect.anything())
  })

  it('is off when disabled, or for fewer than 2 characters, without searching', async () => {
    expect((await renderHook(() => useTmdbSearch('batman', 'all', false))).result.current.status).toBe('off')
    expect((await renderHook(() => useTmdbSearch(' b ', 'all', true))).result.current.status).toBe('off')
    await settle()
    expect(search).not.toHaveBeenCalled()
  })

  it('is off while the switch is off', async () => {
    available.mockReturnValue(false)
    const { result } = await renderHook(() => useTmdbSearch('batman', 'all', true))
    expect(result.current.status).toBe('off')
  })

  it('debounces a burst of typing into one request', async () => {
    search.mockResolvedValue([])
    const { rerender } = await renderHook(({ q }: { q: string }) => useTmdbSearch(q, 'all', true), { initialProps: { q: 'ba' } })
    await rerender({ q: 'bat' })
    await rerender({ q: 'batm' })
    await settle()
    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0][0]).toBe('batm')
  })

  it('reports a failure', async () => {
    search.mockRejectedValue(new Error('offline'))
    const { result } = await renderHook(() => useTmdbSearch('batman', 'all', true))
    await settle()
    expect(result.current.status).toBe('failed')
  })

  it('serves a repeated query from cache', async () => {
    search.mockResolvedValue([BATMAN])
    const first = await renderHook(() => useTmdbSearch('batman', 'movie', true))
    await settle()
    first.unmount()
    const { result } = await renderHook(() => useTmdbSearch('Batman ', 'movie', true))
    expect(result.current).toEqual({ status: 'done', titles: [BATMAN] })
    expect(search).toHaveBeenCalledTimes(1)
  })
})
```

`apps/mobile/src/external/useTmdbTitle.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react-native'
import { memoryStore, setKeyValueStore } from '@go10/core/ports/keyValueStore'
import { saveSnapshot } from '@go10/core/external/snapshots'
import { fetchTmdbTitle } from '@go10/core/external/tmdb/title'
import type { Title } from '@go10/core/types'
import { resetTmdbTitleCacheForTests, useTmdbTitle } from './useTmdbTitle'

jest.mock('@go10/core/external/tmdb/title', () => ({ fetchTmdbTitle: jest.fn() }))
const fetchTitle = fetchTmdbTitle as jest.MockedFunction<typeof fetchTmdbTitle>

const MOVIE = { key: 'tmdb-movie-155', title: 'Batman', seasons: [] as Title['seasons'] } as Title
const flush = () => act(async () => {})

beforeEach(() => {
  setKeyValueStore(memoryStore())
  resetTmdbTitleCacheForTests()
  fetchTitle.mockReset()
})

describe('useTmdbTitle', () => {
  it('is idle without a key', async () => {
    const { result } = await renderHook(() => useTmdbTitle(null))
    expect(result.current).toEqual({ status: 'idle' })
  })

  it('loads a title', async () => {
    fetchTitle.mockResolvedValue(MOVIE)
    const { result } = await renderHook(() => useTmdbTitle('tmdb-movie-155'))
    await flush()
    expect(result.current).toEqual({ status: 'ready', title: MOVIE })
  })

  it('is not-found when TMDB does not know it, error when it cannot be reached', async () => {
    fetchTitle.mockResolvedValueOnce(null)
    const missing = await renderHook(() => useTmdbTitle('tmdb-movie-1'))
    await flush()
    expect(missing.result.current).toEqual({ status: 'not-found' })
    fetchTitle.mockRejectedValueOnce(new Error('offline'))
    const failed = await renderHook(() => useTmdbTitle('tmdb-movie-2'))
    await flush()
    expect(failed.result.current).toEqual({ status: 'error' })
  })

  it('serves a snapshot at once, and keeps it while TMDB is unreachable', async () => {
    saveSnapshot(MOVIE)
    fetchTitle.mockRejectedValue(new Error('offline'))
    const { result } = await renderHook(() => useTmdbTitle('tmdb-movie-155'))
    expect(result.current).toEqual({ status: 'ready', title: MOVIE })
    await flush()
    expect(result.current).toEqual({ status: 'ready', title: MOVIE })
  })

  it('does not refetch a title already loaded this session', async () => {
    fetchTitle.mockResolvedValue(MOVIE)
    const first = await renderHook(() => useTmdbTitle('tmdb-movie-155'))
    await flush()
    first.unmount()
    const { result } = await renderHook(() => useTmdbTitle('tmdb-movie-155'))
    expect(result.current).toEqual({ status: 'ready', title: MOVIE })
    expect(fetchTitle).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/mobile -- src/external`
Expected: FAIL — `./useTmdbSearch` and `./useTmdbTitle` not found.

- [ ] **Step 3: Implement**

`apps/mobile/src/external/useTmdbSearch.ts`:

```ts
import { useEffect, useState } from 'react'
import type { Section } from '@go10/core/catalog/selectTitles'
import type { TmdbSearchState } from '@go10/core/external/mergeSearch'
import { tmdbAvailable } from '@go10/core/external/tmdb/client'
import { resetGenresForTests, searchTmdb } from '@go10/core/external/tmdb/search'
import { normalize } from '@go10/core/search/search'
import type { Title } from '@go10/core/types'

/** The web's own values (apps/web/src/external/useTmdbSearch.ts). */
export const TMDB_DEBOUNCE_MS = 400
export const SEARCH_MIN_CHARS = 2

const OFF: TmdbSearchState = { status: 'off', titles: [] }
const PENDING: TmdbSearchState = { status: 'pending', titles: [] }
const FAILED: TmdbSearchState = { status: 'failed', titles: [] }

// Per query and section, for the app's life: re-typing a query costs nothing.
const cache = new Map<string, Title[]>()

/**
 * TMDB hits for a search, once typing settles (the web hook, ported).
 * `enabled` is the caller's say ("Doblaje latino" turns it off); the switch
 * and a rejected token turn it off regardless.
 */
export function useTmdbSearch(query: string, section: Section, enabled: boolean): TmdbSearchState {
  const trimmed = query.trim()
  const active = enabled && tmdbAvailable() && trimmed.length >= SEARCH_MIN_CHARS
  const cacheKey = `${section}|${normalize(trimmed)}`
  const [result, setResult] = useState<{ key: string; state: TmdbSearchState } | null>(null)

  useEffect(() => {
    if (!active || cache.has(cacheKey)) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchTmdb(trimmed, section, controller.signal)
        .then((titles) => {
          if (controller.signal.aborted) return
          cache.set(cacheKey, titles)
          setResult({ key: cacheKey, state: { status: 'done', titles } })
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult({ key: cacheKey, state: FAILED })
        })
    }, TMDB_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // `trimmed` and `section` are folded into `cacheKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, cacheKey])

  if (!active) return OFF
  const cached = cache.get(cacheKey)
  if (cached) return { status: 'done', titles: cached }
  if (result?.key === cacheKey) return result.state
  return PENDING
}

export function resetTmdbSearchForTests(): void {
  cache.clear()
  resetGenresForTests()
}
```

`apps/mobile/src/external/useTmdbTitle.ts`:

```ts
import { useEffect, useState } from 'react'
import { readSnapshot } from '@go10/core/external/snapshots'
import { fetchTmdbTitle } from '@go10/core/external/tmdb/title'
import type { Title } from '@go10/core/types'

export type TmdbTitleState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; title: Title }
  | { status: 'not-found' }
  | { status: 'error' }

// Loaded while the app runs: served without asking TMDB again. (The web
// also keeps a sessionStorage copy; here a relaunch falls back on snapshots.)
const memory = new Map<string, Title>()

function initial(key: string | null): TmdbTitleState {
  if (!key) return { status: 'idle' }
  const title = memory.get(key) ?? readSnapshot(key)
  return title ? { status: 'ready', title } : { status: 'loading' }
}

/**
 * The TMDB title behind a `tmdb-*` key (the web hook, ported). Served at
 * once from memory or a played title's snapshot; a snapshot is refreshed in
 * the background and stays on screen if TMDB can't be reached.
 */
export function useTmdbTitle(key: string | null): TmdbTitleState {
  const [entry, setEntry] = useState(() => ({ key, state: initial(key) }))

  useEffect(() => {
    if (!key) return
    const cached = memory.get(key)
    if (cached) {
      setEntry({ key, state: { status: 'ready', title: cached } })
      return
    }
    const snapshot = readSnapshot(key)
    setEntry({ key, state: snapshot ? { status: 'ready', title: snapshot } : { status: 'loading' } })
    const controller = new AbortController()
    fetchTmdbTitle(key, controller.signal)
      .then((title) => {
        if (controller.signal.aborted) return
        if (title) {
          memory.set(title.key, title)
          setEntry({ key, state: { status: 'ready', title } })
        } else if (!snapshot) {
          setEntry({ key, state: { status: 'not-found' } })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && !snapshot) setEntry({ key, state: { status: 'error' } })
      })
    return () => controller.abort()
  }, [key])

  // Between a key change and its effect, don't report the previous key's state.
  return entry.key === key ? entry.state : initial(key)
}

export function resetTmdbTitleCacheForTests(): void {
  memory.clear()
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/mobile -- src/external && npm run typecheck -w @go10/mobile`
Expected: PASS (11 tests); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/external
git commit -m "feat(mobile): TMDB search and title hooks, ported from the web"
```

---

### Task 2: TMDB in search results, and the source choice

**Files:**
- Modify: `apps/mobile/src/components/CatalogView.tsx`, `CatalogView.test.tsx`
- Modify: `apps/mobile/src/components/SearchView.tsx`, `SearchView.test.tsx`
- Modify: `apps/mobile/src/app/buscar.tsx`

**Interfaces:**
- Consumes: Task 1 `useTmdbSearch`; core `mergeSearch`, `externalTitlesEnabled`.
- Produces:
  - `CatalogView` gains `catalogOnly?: boolean` (default false).
  - `SearchView` gains `catalogOnly: boolean` and `onCatalogOnlyChange(catalogOnly: boolean)`.

- [ ] **Step 1: Write the failing tests**

At the top of `CatalogView.test.tsx`, after the imports:

```tsx
import { setExternalConfigSource } from '@go10/core/external/config'
import { useTmdbSearch } from '../external/useTmdbSearch'

jest.mock('../external/useTmdbSearch', () => ({ useTmdbSearch: jest.fn() }))
const tmdb = useTmdbSearch as jest.MockedFunction<typeof useTmdbSearch>
const external = (on: boolean) => setExternalConfigSource(() => ({ externalTitles: on ? 'on' : undefined, tmdbToken: on ? 'test' : undefined }))
const BATMAN: Title = { ...t('tmdb-movie-155', 'Batman'), external: true }

beforeEach(() => {
  external(false)
  tmdb.mockReturnValue({ status: 'off', titles: [] })
})
```

and append inside its `describe`:

```tsx
  it('appends TMDB hits after the catalog matches, with the credit', async () => {
    external(true)
    tmdb.mockReturnValue({ status: 'done', titles: [BATMAN] })
    await render(<CatalogView titles={titles} section="all" query="dig" imageBase={IMG} onSelect={jest.fn()} />)
    const cards = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)
    expect(cards).toEqual(['Digimon', 'Batman'])
    expect(screen.getByText('Datos de títulos: TMDB')).toBeTruthy()
    expect(tmdb).toHaveBeenCalledWith('dig', 'all', true)
  })

  it('waits for TMDB before suggesting near titles', async () => {
    external(true)
    tmdb.mockReturnValue({ status: 'pending', titles: [] })
    await render(<CatalogView titles={titles} section="all" query="zzzz" imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('Buscando…')).toBeTruthy()
    expect(screen.queryByText('Quizás te interese')).toBeNull()
  })

  it('falls back to the catalog when TMDB fails', async () => {
    external(true)
    tmdb.mockReturnValue({ status: 'failed', titles: [] })
    await render(<CatalogView titles={titles} section="all" query="zzzz" imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('Quizás te interese')).toBeTruthy()
    expect(screen.queryByText('Datos de títulos: TMDB')).toBeNull()
  })

  it('Doblaje latino searches the catalog only', async () => {
    external(true)
    await render(<CatalogView titles={titles} section="all" query="dragon" catalogOnly imageBase={IMG} onSelect={jest.fn()} />)
    expect(tmdb).toHaveBeenCalledWith('dragon', 'all', false)
  })

  it('never asks TMDB while browsing a section', async () => {
    external(true)
    await render(<CatalogView titles={titles} section="show" query="" imageBase={IMG} onSelect={jest.fn()} />)
    expect(tmdb).toHaveBeenCalledWith('', 'show', false)
  })
```

In `SearchView.test.tsx`: add after the imports

```tsx
import { setExternalConfigSource } from '@go10/core/external/config'

jest.mock('../external/useTmdbSearch', () => ({ useTmdbSearch: () => ({ status: 'off', titles: [] }) }))
const external = (on: boolean) => setExternalConfigSource(() => ({ externalTitles: on ? 'on' : undefined, tmdbToken: on ? 'test' : undefined }))
```

give `Harness` a `catalogOnly` state (`const [catalogOnly, setCatalogOnly] = useState(false)`) passed as `catalogOnly={catalogOnly} onCatalogOnlyChange={setCatalogOnly}`, add `external(false)` to its `beforeEach`, and append inside the `describe`:

```tsx
  it('offers the source choice once there is a query, with external titles on', async () => {
    external(true)
    await render(<Harness />)
    expect(screen.queryByRole('button', { name: 'Doblaje latino' })).toBeNull()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.type(screen.getByPlaceholderText('Buscar'), 'dragon')
    expect(screen.getByRole('button', { name: 'Lenguaje original' }).props.accessibilityState).toMatchObject({ selected: true })
    await user.press(screen.getByRole('button', { name: 'Doblaje latino' }))
    expect(screen.getByRole('button', { name: 'Doblaje latino' }).props.accessibilityState).toMatchObject({ selected: true })
  })

  it('hides the source choice while external titles are off', async () => {
    await render(<Harness />)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.type(screen.getByPlaceholderText('Buscar'), 'dragon')
    expect(screen.queryByRole('button', { name: 'Lenguaje original' })).toBeNull()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/mobile -- src/components/CatalogView.test.tsx src/components/SearchView.test.tsx`
Expected: FAIL — no TMDB cards, no credit, no "Buscando…", no source chips.

- [ ] **Step 3: Implement**

`CatalogView.tsx`:
- Imports: `import { externalTitlesEnabled } from '@go10/core/external/config'`, `import { mergeSearch } from '@go10/core/external/mergeSearch'`, `import { useTmdbSearch } from '../external/useTmdbSearch'`.
- Props: add `/** "Doblaje latino": skip TMDB for this search. */ catalogOnly?: boolean` (default `false`); update the doc comment's "catalog-only until Phase 6 brings TMDB" to "with TMDB hits appended when external titles are on".
- Body:

```tsx
  const selection = useMemo(() => selectTitles(titles, section, query), [titles, section, query])
  const tmdb = useTmdbSearch(query, section, externalTitlesEnabled() && !catalogOnly && selection.mode !== 'browse')
  const shown = mergeSearch(selection, tmdb)
  const counted = shown.mode === 'results' || shown.mode === 'browse'
```

  and use `shown` in place of `selection` below it (heading mode, count, suggestions line, grid titles). The `empty` element becomes `<Text style={styles.empty}>{shown.mode === 'searching' ? 'Buscando…' : 'No hay títulos.'}</Text>`, and the grid gains a footer:

```tsx
      // TMDB's API terms require the credit wherever its data is shown.
      footer={shown.external ? <Text style={styles.credit}>Datos de títulos: TMDB</Text> : undefined}
```

  with `credit: { marginHorizontal: theme.space.safeX, marginTop: 8, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta, letterSpacing: 1, opacity: 0.7 }`.

`CatalogGrid.tsx`: add `footer?: ReactElement` to the props and `ListFooterComponent={footer}` to the FlatList.

`SearchView.tsx`:
- Props: add `catalogOnly: boolean` and `onCatalogOnlyChange: (catalogOnly: boolean) => void`; import `externalTitlesEnabled`.
- Extract the chip into a local component used by both groups:

```tsx
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ focused }) => [styles.chip, selected && styles.chipActive, focused && styles.chipFocused]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}
```

  The section chips render `<Chip key={target} label={CHIP_LABELS[target]} selected={target === section} onPress={() => onSectionChange(target)} />`. After that focus guide, add:

```tsx
        {/* The web's "Fuente": only while searching with external titles on. */}
        {externalTitlesEnabled() && query.trim() !== '' && (
          <TVFocusGuideView autoFocus style={styles.chips}>
            <Chip label="Lenguaje original" selected={!catalogOnly} onPress={() => onCatalogOnlyChange(false)} />
            <Chip label="Doblaje latino" selected={catalogOnly} onPress={() => onCatalogOnlyChange(true)} />
          </TVFocusGuideView>
        )}
```

  and pass `catalogOnly={catalogOnly}` to `CatalogView`.

`app/buscar.tsx`: keep the parsed route, and seed a `catalogOnly` state from it:

```tsx
  const [initialRoute] = useState(() => {
    const search = new URLSearchParams({
      q: params.q || ' ',
      ...(params.en ? { en: params.en } : {}),
      ...(params.solo ? { solo: params.solo } : {}),
    })
    return parseRoute('/buscar', `?${search}`)
  })
  const [section, setSection] = useState<Section>(initialRoute.name === 'catalog' ? initialRoute.section : 'all')
  const [catalogOnly, setCatalogOnly] = useState(initialRoute.name === 'catalog' && initialRoute.catalogOnly === true)
```

(the params type gains `solo?: string`), and pass `catalogOnly={catalogOnly} onCatalogOnlyChange={setCatalogOnly}` to `SearchView`.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/mobile && npm run typecheck -w @go10/mobile`
Expected: all pass; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): TMDB hits in search, the source choice and the TMDB credit"
```

---

### Task 3: TMDB titles on Detail and in the player

**Files:**
- Create: `apps/mobile/src/browse/titleSource.ts`, `titleSource.test.ts`
- Create: `apps/mobile/src/browse/useTitleSource.ts`
- Create: `apps/mobile/src/components/StateScreen.tsx`, `StateScreen.test.tsx`
- Modify: `apps/mobile/src/app/title/[key]/index.tsx`, `apps/mobile/src/app/title/[key]/play/[videoId].tsx`

**Interfaces:**
- Consumes: Task 1 `useTmdbTitle`, `TmdbTitleState`; core `isTmdbKey`, `externalTitlesEnabled`, `saveSnapshot`, `resolveRoute`.
- Produces:
  - `type TitleSource = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; titles: Title[] }`
  - `titleSource(catalog: CatalogState, key: string, tmdb: TmdbTitleState, external: boolean): TitleSource`
  - `useTitleSource(key: string): TitleSource`
  - `StateScreen({ message, onBack? }: { message: string; onBack?: () => void })` — the web's `.go-state` (mark + message), with a spinner when there's no `onBack` and a Volver button when there is.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/browse/titleSource.test.ts`:

```ts
import type { Title } from '@go10/core/types'
import type { CatalogState } from '../data/catalogStore'
import { titleSource } from './titleSource'

const catalogTitle = { key: 'coraje' } as Title
const tmdbTitle = { key: 'tmdb-movie-155', external: true } as Title
const ready: CatalogState = { status: 'ready', data: { rows: [], collections: [], titles: [catalogTitle] } }

describe('titleSource', () => {
  it('waits for the catalog, and has nothing without one', () => {
    expect(titleSource({ status: 'loading' }, 'coraje', { status: 'idle' }, true)).toEqual({ status: 'loading' })
    expect(titleSource({ status: 'error' }, 'coraje', { status: 'idle' }, true)).toEqual({ status: 'missing' })
  })

  it('resolves catalog keys from the catalog alone', () => {
    expect(titleSource(ready, 'coraje', { status: 'idle' }, true)).toEqual({ status: 'ready', titles: [catalogTitle] })
  })

  it('adds a loaded TMDB title to what routes can resolve', () => {
    expect(titleSource(ready, 'tmdb-movie-155', { status: 'ready', title: tmdbTitle }, true))
      .toEqual({ status: 'ready', titles: [catalogTitle, tmdbTitle] })
  })

  it('reports TMDB loading, failing and not knowing the title', () => {
    expect(titleSource(ready, 'tmdb-movie-155', { status: 'loading' }, true)).toEqual({ status: 'loading' })
    expect(titleSource(ready, 'tmdb-movie-155', { status: 'error' }, true)).toEqual({ status: 'error' })
    expect(titleSource(ready, 'tmdb-movie-155', { status: 'not-found' }, true)).toEqual({ status: 'missing' })
  })

  it('treats a TMDB key as unknown while external titles are off', () => {
    expect(titleSource(ready, 'tmdb-movie-155', { status: 'idle' }, false)).toEqual({ status: 'ready', titles: [catalogTitle] })
  })
})
```

`apps/mobile/src/components/StateScreen.test.tsx`:

```tsx
import { render, screen, userEvent } from '@testing-library/react-native'
import { StateScreen } from './StateScreen'

describe('StateScreen', () => {
  it('shows a loading message with a spinner', async () => {
    await render(<StateScreen message="Cargando título…" />)
    expect(screen.getByText('GO10 TV')).toBeTruthy()
    expect(screen.getByText('Cargando título…')).toBeTruthy()
    expect(screen.getByLabelText('Cargando')).toBeTruthy()
  })

  it('offers a way back from an error, focused first on TV', async () => {
    const onBack = jest.fn()
    await render(<StateScreen message="No se pudo cargar el título." onBack={onBack} />)
    const back = screen.getByRole('button', { name: 'Volver' })
    expect(back.props.hasTVPreferredFocus).toBe(true)
    await userEvent.setup().press(back)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Cargando')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/mobile -- src/browse src/components/StateScreen.test.tsx`
Expected: FAIL — `./titleSource` and `./StateScreen` not found.

- [ ] **Step 3: Implement**

`apps/mobile/src/browse/titleSource.ts`:

```ts
import { isTmdbKey } from '@go10/core/external/tmdb/keys'
import type { Title } from '@go10/core/types'
import type { CatalogState } from '../data/catalogStore'
import type { TmdbTitleState } from '../external/useTmdbTitle'

export type TitleSource = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; titles: Title[] }

/**
 * What a title or play route can resolve against (apps/web/src/App.tsx):
 * the catalog, plus the TMDB title when the key is one and external titles
 * are on. `missing` sends the route Home.
 */
export function titleSource(catalog: CatalogState, key: string, tmdb: TmdbTitleState, external: boolean): TitleSource {
  if (catalog.status === 'loading') return { status: 'loading' }
  if (catalog.status === 'error') return { status: 'missing' }
  const titles = catalog.data.titles
  if (!external || !isTmdbKey(key)) return { status: 'ready', titles }
  if (tmdb.status === 'ready') return { status: 'ready', titles: [...titles, tmdb.title] }
  if (tmdb.status === 'error') return { status: 'error' }
  if (tmdb.status === 'not-found') return { status: 'missing' }
  return { status: 'loading' }
}
```

`apps/mobile/src/browse/useTitleSource.ts`:

```ts
import { externalTitlesEnabled } from '@go10/core/external/config'
import { isTmdbKey } from '@go10/core/external/tmdb/keys'
import { useCatalog } from '../data/CatalogProvider'
import { useTmdbTitle } from '../external/useTmdbTitle'
import { titleSource, type TitleSource } from './titleSource'

/** The titles a route keyed by `key` resolves against; TMDB keys are fetched. */
export function useTitleSource(key: string): TitleSource {
  const { state } = useCatalog()
  const external = externalTitlesEnabled()
  const tmdb = useTmdbTitle(external && isTmdbKey(key) ? key : null)
  return titleSource(state, key, tmdb, external)
}
```

`apps/mobile/src/components/StateScreen.tsx`:

```tsx
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

/** The web's `.go-state`: the mark and one line — loading (spinner) or a dead end (Volver). */
export function StateScreen({ message, onBack }: { message: string; onBack?: () => void }) {
  return (
    <View style={styles.root}>
      <Text style={styles.mark}>GO10 TV</Text>
      <Text style={styles.msg}>{message}</Text>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hasTVPreferredFocus
          onPress={onBack}
          style={({ focused, pressed }) => [styles.button, (focused || pressed) && styles.buttonActive]}
        >
          {({ focused, pressed }) => <Text style={[styles.buttonText, (focused || pressed) && styles.onAccent]}>Volver</Text>}
        </Pressable>
      ) : (
        <ActivityIndicator color={theme.color.accent} accessibilityLabel="Cargando" />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: theme.space.safeX, backgroundColor: theme.color.bg },
  mark: { color: theme.color.accent, fontFamily: theme.font.displayHeavy, fontSize: theme.size.section },
  msg: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.body, textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: theme.radius, borderWidth: 2, borderColor: theme.color.accent },
  buttonActive: { backgroundColor: theme.color.accent },
  buttonText: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
  onAccent: { color: theme.color.bg },
})
```

`apps/mobile/src/app/title/[key]/index.tsx` — the body after the progress state becomes:

```tsx
  const source = useTitleSource(key)
  if (source.status === 'loading') return isTmdbKey(key) ? <StateScreen message="Cargando título…" /> : <LoadingScreen />
  // A slow or failing TMDB mustn't trap anyone: the way back is on screen.
  if (source.status === 'error') return <StateScreen message="No se pudo cargar el título." onBack={() => router.back()} />
  const view = source.status === 'ready' ? resolveRoute({ name: 'title', key }, source.titles) : null
  // Unknown key (or no catalog at all): Home, which shows why.
  if (view?.name !== 'detail') return <Redirect href="/" />
  const { title } = view
```

(drop the `useCatalog` import and call; import `useTitleSource` from `../../../browse/useTitleSource`, `StateScreen` from `../../../components/StateScreen`, `isTmdbKey` from `@go10/core/external/tmdb/keys`).

`apps/mobile/src/app/title/[key]/play/[videoId].tsx` — same shape:

```tsx
export default function PlayScreen() {
  const { key, videoId } = useLocalSearchParams<{ key: string; videoId: string }>()
  const source = useTitleSource(key)
  const view = source.status === 'ready' ? resolveRoute({ name: 'play', key, videoId }, source.titles) : null
  const playing = view?.name === 'player' ? view.title : null

  // Played TMDB titles are remembered for Home's Seguir viendo (as the web does).
  useEffect(() => {
    if (playing?.external) saveSnapshot(playing)
  }, [playing])

  if (source.status === 'loading') return isTmdbKey(key) ? <StateScreen message="Cargando título…" /> : <LoadingScreen />
  if (source.status === 'error') return <StateScreen message="No se pudo cargar el título." onBack={() => router.back()} />
  if (view?.name !== 'player') return <Redirect href="/" />
  const { title, row } = view
```

followed by the existing `next` / `previous` / `go` / `PlayerView` lines (drop `useCatalog`; import `useEffect` from react, `saveSnapshot` from `@go10/core/external/snapshots`, `isTmdbKey`, `useTitleSource`, `StateScreen`).

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/mobile && npm run typecheck -w @go10/mobile`
Expected: all pass; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): TMDB titles open on Detail and play through vidlove; played ones are snapshotted"
```

---

### Task 4: Played TMDB titles in Seguir viendo

**Files:**
- Modify: `apps/mobile/src/components/HomeView.tsx`, `HomeView.test.tsx`

**Interfaces:**
- Consumes: core `listSnapshots`, `externalTitlesEnabled`, `saveSnapshot` (test).

- [ ] **Step 1: Write the failing test**

Append to `HomeView.test.tsx` (imports: `setExternalConfigSource` from `@go10/core/external/config`, `saveSnapshot` from `@go10/core/external/snapshots`, `memoryStore, setKeyValueStore` from `@go10/core/ports/keyValueStore`):

```tsx
  it('lists played TMDB titles in Seguir viendo from their snapshots, only with external titles on', async () => {
    setKeyValueStore(memoryStore())
    const batman: Title = { ...title('tmdb-movie-155'), title: 'Batman', external: true, seasons: [{ video_id: 'tmdb-movie-155', type: 'movie' } as CatalogRow] }
    saveSnapshot(batman)
    const progress: Record<string, Progress> = { 'tmdb-movie-155': { time: 600, duration: 1200, updatedAt: 5, watched: false } }

    setExternalConfigSource(() => ({ externalTitles: 'on', tmdbToken: 'test' }))
    const on = await render(<HomeView progress={progress} model={model()} imageBase="https://tv.test/" {...handlers()} />)
    expect(screen.getByRole('button', { name: 'Batman' })).toBeTruthy()
    on.unmount()

    setExternalConfigSource(() => ({ externalTitles: undefined, tmdbToken: undefined }))
    await render(<HomeView progress={progress} model={model()} imageBase="https://tv.test/" {...handlers()} />)
    expect(screen.queryByRole('button', { name: 'Batman' })).toBeNull()
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @go10/mobile -- src/components/HomeView.test.tsx`
Expected: FAIL — no 'Batman' card.

- [ ] **Step 3: Implement**

In `HomeView.tsx` (imports `externalTitlesEnabled` from `@go10/core/external/config`, `listSnapshots` from `@go10/core/external/snapshots`), the Seguir viendo memo becomes:

```ts
  // Re-read on arriving at Home (the screen passes fresh progress), like the
  // web's per-mount read. Played TMDB titles aren't in the catalog; their
  // snapshots stand in for them here, and only here.
  const continueItems = useMemo(() => {
    const candidates = externalTitlesEnabled() ? [...model.titles, ...listSnapshots()] : model.titles
    return continueWatching(candidates, progress).slice(0, ROW_LIMIT)
  }, [model.titles, progress])
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @go10/mobile && npm run typecheck -w @go10/mobile`
Expected: all pass; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/HomeView.tsx apps/mobile/src/components/HomeView.test.tsx
git commit -m "feat(mobile): played TMDB titles in Seguir viendo"
```

---

### Task 5: Verify, phone, checklists

**Files:**
- Modify: `docs/superpowers/tv-checklist.md`, `README.md`

- [ ] **Step 1: Whole-repo verification**

Run: `npm test && npm run typecheck --workspaces --if-present && npm run build -w @go10/web && python3 -m pytest tests/ -q`
Expected: every suite passes; typecheck and build exit 0.

- [ ] **Step 2: Phone** — no native changes: restart Metro with `--clear` (it re-reads `app.config.ts`, so the baked `extra` is current), `adb reverse`, relaunch.
Expected: the app opens on Home. Confirm (without printing it) that the switch is on: `grep -c '^VITE_EXTERNAL_TITLES=on' .env.local` prints 1 and `grep -c '^VITE_TMDB_TOKEN=.' .env.local` prints 1.

- [ ] **Step 3: TV checklist — append**

```markdown
## From Phase 6 (External titles)
- [ ] With a query, Down from the section chips reaches Lenguaje original / Doblaje latino, then the first result.
- [ ] A TMDB result opens its Detail (Cargando título… first on a cold start); Back returns to the results with focus on that card.
- [ ] A vidlove title plays on the TV's system WebView; FF/RW and Left/Right seek; the bar has no play/pause button.
- [ ] A played TMDB title shows in Seguir viendo after a relaunch, and resumes where it stopped.
```

- [ ] **Step 4: README counts** — update the `npm test` line under "## Tests" to the real totals, in the existing format.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/tv-checklist.md README.md
git commit -m "docs: Phase 6 TV checklist and test counts"
```

- [ ] **Step 6: Hand to the user for the phone check** — search something not in the catalog (e.g. "breaking bad"): TMDB cards after the catalog's, the credit; switch to Doblaje latino (catalog only); open a TMDB series, play an episode via vidlove, Back, relaunch: it's in Seguir viendo and resumes. The spec's Phase 6 row is marked done only after they confirm.
