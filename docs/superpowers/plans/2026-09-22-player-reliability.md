# Player Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OK.ru embedded player recoverable and fast to get back into on low-end TV hardware, via a path-based router, an in-place reload mechanism (manual key + auto-retry), best-effort resume, and a session-cached catalog.

**Architecture:** A small hand-rolled path router (no new dependency) replaces `App.tsx`'s local `view` state, so every screen — including mid-playback — is a refreshable URL. `Player.tsx` gains a pure retry/backoff reducer driving both automatic retry-on-load-failure and a manual "R" in-place reload, plus a `localStorage`-backed best-effort resume timestamp. `useCatalog` gains a `sessionStorage` cache so a full-page refresh (the fallback recovery path) doesn't re-fetch/re-parse the 907-row CSV every time.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + @testing-library/react (jsdom). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-player-reliability-design.md`

## Global Constraints

- No new npm dependencies (no `react-router` or similar) — router is hand-rolled.
- Router uses real path routes (`/title/:key`, `/title/:key/play/:videoId`), not hash routes; `netlify.toml` must provide an SPA fallback redirect so deep-link refreshes don't 404.
- `MAX_RETRIES = 3` auto-retries on player load failure, `LOAD_TIMEOUT_MS = 8000` (unchanged from today), backoff = `1000ms × attempt`.
- Manual reload key is `r`/`R`, always resets the retry budget and reloads immediately, independent of auto-retry state.
- Resume uses `localStorage` key `go10:resume:<videoId>`, max age `6h` (`21600000ms`), rewind buffer `5s`. Entry is cleared on normal close or video change.
- Catalog cache uses `sessionStorage` key `go10:catalog:v1`.
- All `localStorage`/`sessionStorage` access must be wrapped so a throw (private mode, quota, disabled storage) degrades gracefully instead of crashing the app.
- Follow the existing colocated `*.test.ts`/`*.test.tsx` pattern; extract pure logic into small, independently testable files rather than embedding it in components (matches the existing `groupSeasons.ts`/`buildRows.ts` split from their screens).

---

### Task 1: Route parsing (pure)

**Files:**
- Create: `src/router/route.ts`
- Test: `src/router/route.test.ts`

**Interfaces:**
- Produces: `Route` type (`{name:'home'} | {name:'title';key:string} | {name:'play';key:string;videoId:string}`), `parseRoute(pathname: string): Route`, `routeToPath(route: Route): string`. Consumed by Tasks 2, 3, 4.

- [ ] **Step 1: Write the failing test**

```ts
// src/router/route.test.ts
import { describe, it, expect } from 'vitest'
import { parseRoute, routeToPath } from './route'

describe('parseRoute', () => {
  it('parses the root path as home', () => {
    expect(parseRoute('/')).toEqual({ name: 'home' })
  })

  it('parses an empty path as home', () => {
    expect(parseRoute('')).toEqual({ name: 'home' })
  })

  it('parses a title path', () => {
    expect(parseRoute('/title/hora-de-aventura')).toEqual({ name: 'title', key: 'hora-de-aventura' })
  })

  it('parses a play path', () => {
    expect(parseRoute('/title/hora-de-aventura/play/222')).toEqual({
      name: 'play',
      key: 'hora-de-aventura',
      videoId: '222',
    })
  })

  it('decodes URL-encoded segments', () => {
    expect(parseRoute('/title/crows%20zero')).toEqual({ name: 'title', key: 'crows zero' })
  })

  it('falls back to home for an unrecognised path', () => {
    expect(parseRoute('/something/unexpected')).toEqual({ name: 'home' })
  })

  it('falls back to home for a malformed play path', () => {
    expect(parseRoute('/title/x/play')).toEqual({ name: 'home' })
  })
})

describe('routeToPath', () => {
  it('serialises home', () => {
    expect(routeToPath({ name: 'home' })).toBe('/')
  })

  it('serialises a title route', () => {
    expect(routeToPath({ name: 'title', key: 'hora-de-aventura' })).toBe('/title/hora-de-aventura')
  })

  it('serialises a play route', () => {
    expect(routeToPath({ name: 'play', key: 'hora-de-aventura', videoId: '222' })).toBe(
      '/title/hora-de-aventura/play/222',
    )
  })

  it('encodes special characters in segments', () => {
    expect(routeToPath({ name: 'title', key: 'crows zero' })).toBe('/title/crows%20zero')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/router/route.test.ts`
Expected: FAIL — `Cannot find module './route'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/router/route.ts
export type Route =
  | { name: 'home' }
  | { name: 'title'; key: string }
  | { name: 'play'; key: string; videoId: string }

export function parseRoute(pathname: string): Route {
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (segments.length === 0) return { name: 'home' }

  if (segments[0] === 'title' && segments.length === 2) {
    return { name: 'title', key: segments[1] }
  }

  if (segments[0] === 'title' && segments.length === 4 && segments[2] === 'play') {
    return { name: 'play', key: segments[1], videoId: segments[3] }
  }

  return { name: 'home' }
}

export function routeToPath(route: Route): string {
  switch (route.name) {
    case 'home':
      return '/'
    case 'title':
      return `/title/${encodeURIComponent(route.key)}`
    case 'play':
      return `/title/${encodeURIComponent(route.key)}/play/${encodeURIComponent(route.videoId)}`
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/router/route.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/router/route.ts src/router/route.test.ts
git commit -m "feat: add route parsing for the app router"
```

---

### Task 2: History-backed route hook

**Files:**
- Create: `src/router/useRoute.ts`
- Test: `src/router/useRoute.test.tsx`

**Interfaces:**
- Consumes: `Route`, `parseRoute`, `routeToPath` from `src/router/route.ts` (Task 1).
- Produces: `useRoute(): { route: Route; navigate: (route: Route, options?: { replace?: boolean }) => void }`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

```tsx
// src/router/useRoute.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRoute } from './useRoute'

beforeEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('useRoute', () => {
  it('reads the initial route from the current URL', () => {
    window.history.replaceState({}, '', '/title/abc')
    const { result } = renderHook(() => useRoute())
    expect(result.current.route).toEqual({ name: 'title', key: 'abc' })
  })

  it('navigate pushes a new history entry and updates the route', () => {
    const { result } = renderHook(() => useRoute())
    act(() => {
      result.current.navigate({ name: 'title', key: 'abc' })
    })
    expect(result.current.route).toEqual({ name: 'title', key: 'abc' })
    expect(window.location.pathname).toBe('/title/abc')
  })

  it('navigate with replace does not grow history length', () => {
    const { result } = renderHook(() => useRoute())
    const before = window.history.length
    act(() => {
      result.current.navigate({ name: 'title', key: 'abc' }, { replace: true })
    })
    expect(window.history.length).toBe(before)
    expect(window.location.pathname).toBe('/title/abc')
  })

  it('updates the route when a popstate event fires (browser back/forward)', () => {
    const { result } = renderHook(() => useRoute())
    act(() => {
      result.current.navigate({ name: 'title', key: 'abc' })
    })
    act(() => {
      window.history.pushState({}, '', '/title/xyz')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current.route).toEqual({ name: 'title', key: 'xyz' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/router/useRoute.test.tsx`
Expected: FAIL — `Cannot find module './useRoute'`

- [ ] **Step 3: Write the implementation**

```ts
// src/router/useRoute.ts
import { useCallback, useEffect, useState } from 'react'
import { parseRoute, routeToPath, type Route } from './route'

export function useRoute(): {
  route: Route
  navigate: (route: Route, options?: { replace?: boolean }) => void
} {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))

  useEffect(() => {
    function onPopState() {
      setRoute(parseRoute(window.location.pathname))
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((next: Route, options?: { replace?: boolean }) => {
    const path = routeToPath(next)
    if (options?.replace) {
      window.history.replaceState({}, '', path)
    } else {
      window.history.pushState({}, '', path)
    }
    setRoute(next)
  }, [])

  return { route, navigate }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/router/useRoute.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/router/useRoute.ts src/router/useRoute.test.tsx
git commit -m "feat: add history-backed route hook"
```

---

### Task 3: Route resolution against loaded titles (pure)

**Files:**
- Create: `src/router/resolveRoute.ts`
- Test: `src/router/resolveRoute.test.ts`

**Interfaces:**
- Consumes: `Route` from `src/router/route.ts` (Task 1); `CatalogRow`, `Title` from `src/types.ts`.
- Produces: `ResolvedView` type (`{name:'home'} | {name:'detail';title:Title} | {name:'player';title:Title;row:CatalogRow} | {name:'not-found'}`), `resolveRoute(route: Route, titles: Title[]): ResolvedView`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

```ts
// src/router/resolveRoute.test.ts
import { describe, it, expect } from 'vitest'
import { resolveRoute } from './resolveRoute'
import type { CatalogRow, Title } from '../types'

function row(overrides: Partial<CatalogRow>): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'movie', title: 'X', title_raw: '',
    series_id: '', series_title: '', season_number: null, season_label: '',
    episode_number: null, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
    ...overrides,
  }
}

function title(overrides: Partial<Title> & { seasons?: CatalogRow[] }): Title {
  const seasons = overrides.seasons ?? [row({})]
  return {
    key: 'x', kind: 'movie', title: 'X', year: null, studio: '', genre: '',
    genre_secondary: '', quality: '', language: '', subtitled: false, thumbnail: '',
    views: 0, durationSeconds: 0, catalogIndex: 0,
    ...overrides,
    seasons,
  }
}

describe('resolveRoute', () => {
  it('resolves the home route without needing titles', () => {
    expect(resolveRoute({ name: 'home' }, [])).toEqual({ name: 'home' })
  })

  it('resolves a title route to its matching Title', () => {
    const t = title({ key: 'abc' })
    expect(resolveRoute({ name: 'title', key: 'abc' }, [t])).toEqual({ name: 'detail', title: t })
  })

  it('resolves a play route to its matching Title and CatalogRow', () => {
    const r = row({ video_id: '9' })
    const t = title({ key: 'abc', seasons: [r] })
    expect(resolveRoute({ name: 'play', key: 'abc', videoId: '9' }, [t])).toEqual({
      name: 'player',
      title: t,
      row: r,
    })
  })

  it('returns not-found when the title key does not match any loaded title', () => {
    expect(resolveRoute({ name: 'title', key: 'missing' }, [title({ key: 'abc' })])).toEqual({
      name: 'not-found',
    })
  })

  it('returns not-found when the video id does not match any row on the title', () => {
    const t = title({ key: 'abc', seasons: [row({ video_id: '9' })] })
    expect(resolveRoute({ name: 'play', key: 'abc', videoId: 'missing' }, [t])).toEqual({
      name: 'not-found',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/router/resolveRoute.test.ts`
Expected: FAIL — `Cannot find module './resolveRoute'`

- [ ] **Step 3: Write the implementation**

```ts
// src/router/resolveRoute.ts
import type { Route } from './route'
import type { CatalogRow, Title } from '../types'

export type ResolvedView =
  | { name: 'home' }
  | { name: 'detail'; title: Title }
  | { name: 'player'; title: Title; row: CatalogRow }
  | { name: 'not-found' }

export function resolveRoute(route: Route, titles: Title[]): ResolvedView {
  if (route.name === 'home') return { name: 'home' }

  const title = titles.find((t) => t.key === route.key)
  if (!title) return { name: 'not-found' }

  if (route.name === 'title') return { name: 'detail', title }

  const row = title.seasons.find((r) => r.video_id === route.videoId)
  if (!row) return { name: 'not-found' }

  return { name: 'player', title, row }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/router/resolveRoute.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/router/resolveRoute.ts src/router/resolveRoute.test.ts
git commit -m "feat: add route-to-title resolution"
```

---

### Task 4: Wire the router into App.tsx

**Files:**
- Modify: `src/App.tsx` (full rewrite, see below)
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `useRoute` (Task 2), `resolveRoute`/`ResolvedView` (Task 3), existing `useCatalog`, `Home`, `Detail`, `Player`.
- Produces: no new exports — `App` remains the default export with the same external behavior (renders Home/Detail/Player), now URL-driven.

- [ ] **Step 1: Write the failing test**

```tsx
// src/App.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'

const CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,111,movie,Foo Movie,Foo Movie,,,,,2020,,Drama,,1080p,Español,false,1:00:00,3600,10,thumb.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
`

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  sessionStorage.clear()
  localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App routing', () => {
  it('navigates from home to detail to player, updating the URL each time, and back again', async () => {
    render(<App />)

    await screen.findByText('Foo Movie')
    fireEvent.click(screen.getByText('Más información'))

    await waitFor(() => expect(window.location.pathname).toBe('/title/111'))
    expect(screen.getByRole('heading', { name: 'Foo Movie' })).toBeInTheDocument()

    fireEvent.click(screen.getByText('Reproducir'))
    await waitFor(() => expect(window.location.pathname).toBe('/title/111/play/111'))
    expect(document.querySelector('.go-player_frame')).not.toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(window.location.pathname).toBe('/title/111'))
  })

  it('resolves a direct deep link to the player route on first render', async () => {
    window.history.replaceState({}, '', '/title/111/play/111')
    render(<App />)
    await waitFor(() => expect(document.querySelector('.go-player_frame')).not.toBeNull())
  })

  it('redirects to home when the URL does not match any loaded title', async () => {
    window.history.replaceState({}, '', '/title/does-not-exist')
    render(<App />)
    await screen.findByText('Foo Movie')
    expect(window.location.pathname).toBe('/')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — current `App.tsx` never touches the URL, so `window.location.pathname` assertions fail.

- [ ] **Step 3: Rewrite `src/App.tsx`**

```tsx
// src/App.tsx
import { useCallback } from 'react'
import { useCatalog } from './catalog/useCatalog'
import { FocusProvider } from './focus/FocusProvider'
import { Home } from './screens/Home'
import { Detail } from './screens/Detail'
import { Player } from './screens/Player'
import { useRoute } from './router/useRoute'
import { resolveRoute } from './router/resolveRoute'
import './styles/global.css'

export default function App() {
  const { titles, loading, error } = useCatalog()
  const { route, navigate } = useRoute()

  const back = useCallback(() => {
    navigate(route.name === 'play' ? { name: 'title', key: route.key } : { name: 'home' })
  }, [route, navigate])

  if (loading) {
    return (
      <div className="go-state">
        <span className="go-state_mark is-loading">GO10 TV</span>
        <p className="go-state_msg">Cargando catálogo…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="go-state">
        <span className="go-state_mark">GO10 TV</span>
        <p className="go-state_msg">No se pudo cargar el catálogo: {error}</p>
      </div>
    )
  }

  const resolved = resolveRoute(route, titles)

  if (resolved.name === 'not-found') {
    // Stale or hand-typed URL — bounce to Home without leaving a broken
    // history entry behind.
    navigate({ name: 'home' }, { replace: true })
    return null
  }

  if (resolved.name === 'home') {
    return (
      <FocusProvider key="home" onBack={back}>
        <Home titles={titles} onSelect={(title) => navigate({ name: 'title', key: title.key })} />
      </FocusProvider>
    )
  }

  const title = resolved.title

  return (
    <>
      {/* The player is an overlay on top of the detail screen, so the screen
          beneath keeps its identity — and its chosen season — while playback
          is open. */}
      <FocusProvider key="detail" onBack={back} enabled={resolved.name !== 'player'}>
        <Detail
          title={title}
          onPlay={(row) => navigate({ name: 'play', key: title.key, videoId: row.video_id })}
          onBack={back}
        />
      </FocusProvider>

      {resolved.name === 'player' && <Player row={resolved.row} onClose={back} />}
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full suite to check nothing else broke**

Run: `npx vitest run`
Expected: PASS (all existing suites unaffected — `Detail`/`Home`/`Player` weren't changed in this task)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: drive App navigation from the URL router"
```

---

### Task 5: Netlify SPA redirect config

**Files:**
- Create: `netlify.toml`

**Interfaces:**
- None (deployment config only; no code interface).

- [ ] **Step 1: Create `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 2: Verify the production build still works**

Run: `npm run build`
Expected: succeeds, `dist/index.html` and `dist/assets/*` are produced as before — `netlify.toml` doesn't affect the Vite build itself, only how Netlify serves the output.

- [ ] **Step 3: Commit**

```bash
git add netlify.toml
git commit -m "feat: add Netlify SPA fallback for deep-linked routes"
```

---

### Task 6: Player retry/reload state machine (pure)

**Files:**
- Create: `src/screens/playerRetry.ts`
- Test: `src/screens/playerRetry.test.ts`

**Interfaces:**
- Produces: `PlayerStatus`, `PlayerRetryState`, `PlayerRetryEvent` types; `MAX_RETRIES`; `initialPlayerRetryState`; `backoffMs(attempt: number): number`; `playerRetryReducer(state, event): PlayerRetryState`. Consumed by Task 8.

- [ ] **Step 1: Write the failing test**

```ts
// src/screens/playerRetry.test.ts
import { describe, it, expect } from 'vitest'
import {
  playerRetryReducer,
  initialPlayerRetryState,
  backoffMs,
  MAX_RETRIES,
  type PlayerRetryState,
} from './playerRetry'

describe('backoffMs', () => {
  it('scales linearly with the attempt number', () => {
    expect(backoffMs(0)).toBe(0)
    expect(backoffMs(1)).toBe(1000)
    expect(backoffMs(2)).toBe(2000)
    expect(backoffMs(3)).toBe(3000)
  })
})

describe('playerRetryReducer', () => {
  it('reset always returns to attempt 0 / loading and bumps reloadToken', () => {
    const state: PlayerRetryState = { attempt: 2, status: 'failed', reloadToken: 5 }
    expect(playerRetryReducer(state, { type: 'reset' })).toEqual({
      attempt: 0,
      status: 'loading',
      reloadToken: 6,
    })
  })

  it('timeout increments attempt and moves to retrying, while under the budget', () => {
    const state = playerRetryReducer(initialPlayerRetryState, { type: 'timeout' })
    expect(state).toEqual({ attempt: 1, status: 'retrying', reloadToken: 0 })
  })

  it('retryLoadStarted moves back to loading and bumps reloadToken, keeping attempt', () => {
    const retrying: PlayerRetryState = { attempt: 1, status: 'retrying', reloadToken: 0 }
    expect(playerRetryReducer(retrying, { type: 'retryLoadStarted' })).toEqual({
      attempt: 1,
      status: 'loading',
      reloadToken: 1,
    })
  })

  it('loaded moves to ready without touching attempt or reloadToken', () => {
    const loading: PlayerRetryState = { attempt: 1, status: 'loading', reloadToken: 1 }
    expect(playerRetryReducer(loading, { type: 'loaded' })).toEqual({
      attempt: 1,
      status: 'ready',
      reloadToken: 1,
    })
  })

  it('exhausts the retry budget after MAX_RETRIES timeouts', () => {
    let state = initialPlayerRetryState
    for (let i = 0; i < MAX_RETRIES; i++) {
      state = playerRetryReducer(state, { type: 'timeout' })
      state = playerRetryReducer(state, { type: 'retryLoadStarted' })
    }
    state = playerRetryReducer(state, { type: 'timeout' })
    expect(state.status).toBe('failed')
    expect(state.attempt).toBe(MAX_RETRIES)
  })

  it('manualReload resets the budget and bumps reloadToken even from failed', () => {
    const failed: PlayerRetryState = { attempt: MAX_RETRIES, status: 'failed', reloadToken: 7 }
    expect(playerRetryReducer(failed, { type: 'manualReload' })).toEqual({
      attempt: 0,
      status: 'loading',
      reloadToken: 8,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/playerRetry.test.ts`
Expected: FAIL — `Cannot find module './playerRetry'`

- [ ] **Step 3: Write the implementation**

```ts
// src/screens/playerRetry.ts
export type PlayerStatus = 'loading' | 'retrying' | 'ready' | 'failed'

export interface PlayerRetryState {
  attempt: number
  status: PlayerStatus
  /** Bump to force the iframe to remount with a freshly computed src. */
  reloadToken: number
}

export type PlayerRetryEvent =
  | { type: 'reset' }
  | { type: 'timeout' }
  | { type: 'retryLoadStarted' }
  | { type: 'loaded' }
  | { type: 'manualReload' }

export const MAX_RETRIES = 3
const RETRY_BACKOFF_MS = 1000

export const initialPlayerRetryState: PlayerRetryState = {
  attempt: 0,
  status: 'loading',
  reloadToken: 0,
}

export function backoffMs(attempt: number): number {
  return RETRY_BACKOFF_MS * attempt
}

export function playerRetryReducer(
  state: PlayerRetryState,
  event: PlayerRetryEvent,
): PlayerRetryState {
  switch (event.type) {
    case 'reset':
      return { attempt: 0, status: 'loading', reloadToken: state.reloadToken + 1 }
    case 'timeout': {
      const nextAttempt = state.attempt + 1
      if (nextAttempt > MAX_RETRIES) return { ...state, status: 'failed' }
      return { ...state, attempt: nextAttempt, status: 'retrying' }
    }
    case 'retryLoadStarted':
      return { ...state, status: 'loading', reloadToken: state.reloadToken + 1 }
    case 'loaded':
      return { ...state, status: 'ready' }
    case 'manualReload':
      return { attempt: 0, status: 'loading', reloadToken: state.reloadToken + 1 }
    default:
      return state
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/playerRetry.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/screens/playerRetry.ts src/screens/playerRetry.test.ts
git commit -m "feat: add player retry/backoff state machine"
```

---

### Task 7: Resume timestamp + embed URL builder (pure)

**Files:**
- Create: `src/screens/resume.ts`
- Create: `src/screens/embedSrc.ts`
- Test: `src/screens/resume.test.ts`
- Test: `src/screens/embedSrc.test.ts`

**Interfaces:**
- Produces: `markResumeStart(videoId: string, now?: number): void`, `readResumeFromTime(videoId: string, now?: number): number | null`, `clearResume(videoId: string): void`, `RESUME_MAX_AGE_MS`, `RESUME_REWIND_SECONDS` (from `resume.ts`); `buildEmbedSrc(embedUrl: string, fromTimeSeconds: number | null): string` (from `embedSrc.ts`). Consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

```ts
// src/screens/resume.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { markResumeStart, readResumeFromTime, clearResume, RESUME_MAX_AGE_MS } from './resume'

beforeEach(() => {
  localStorage.clear()
})

describe('resume', () => {
  it('returns null when nothing has been marked', () => {
    expect(readResumeFromTime('1')).toBeNull()
  })

  it('returns 0 immediately after marking (nothing to rewind past yet)', () => {
    markResumeStart('1', 1000)
    expect(readResumeFromTime('1', 1000)).toBe(0)
  })

  it('returns elapsed seconds minus the rewind buffer', () => {
    markResumeStart('1', 0)
    expect(readResumeFromTime('1', 30_000)).toBe(25) // 30s elapsed - 5s rewind
  })

  it('returns null once the entry is older than the max age', () => {
    markResumeStart('1', 0)
    expect(readResumeFromTime('1', RESUME_MAX_AGE_MS + 1000)).toBeNull()
  })

  it('returns null after clearResume', () => {
    markResumeStart('1', 0)
    clearResume('1')
    expect(readResumeFromTime('1', 1000)).toBeNull()
  })

  it('returns null for malformed stored data instead of throwing', () => {
    localStorage.setItem('go10:resume:1', 'not json')
    expect(readResumeFromTime('1')).toBeNull()
  })

  it('keys entries per video id', () => {
    markResumeStart('1', 0)
    expect(readResumeFromTime('2', 30_000)).toBeNull()
  })
})
```

```ts
// src/screens/embedSrc.test.ts
import { describe, it, expect } from 'vitest'
import { buildEmbedSrc } from './embedSrc'

describe('buildEmbedSrc', () => {
  it('appends autoplay when there is no resume point', () => {
    expect(buildEmbedSrc('https://ok.ru/videoembed/1', null)).toBe(
      'https://ok.ru/videoembed/1?autoplay=1',
    )
  })

  it('appends fromTime when a positive resume point is given', () => {
    expect(buildEmbedSrc('https://ok.ru/videoembed/1', 42)).toBe(
      'https://ok.ru/videoembed/1?autoplay=1&fromTime=42',
    )
  })

  it('omits fromTime when the resume point is 0', () => {
    expect(buildEmbedSrc('https://ok.ru/videoembed/1', 0)).toBe(
      'https://ok.ru/videoembed/1?autoplay=1',
    )
  })

  it('uses & when the embed URL already has a query string', () => {
    expect(buildEmbedSrc('https://ok.ru/videoembed/1?foo=bar', 42)).toBe(
      'https://ok.ru/videoembed/1?foo=bar&autoplay=1&fromTime=42',
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/screens/resume.test.ts src/screens/embedSrc.test.ts`
Expected: FAIL — neither module exists yet.

- [ ] **Step 3: Write the implementations**

```ts
// src/screens/resume.ts
export const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000
export const RESUME_REWIND_SECONDS = 5

interface ResumeEntry {
  startedAt: number
}

function resumeKey(videoId: string): string {
  return `go10:resume:${videoId}`
}

/** Best-effort: if storage is unavailable, resume simply degrades to starting at 0. */
export function markResumeStart(videoId: string, now: number = Date.now()): void {
  try {
    localStorage.setItem(resumeKey(videoId), JSON.stringify({ startedAt: now } satisfies ResumeEntry))
  } catch {
    // ignore — private mode, quota exceeded, or storage disabled
  }
}

export function clearResume(videoId: string): void {
  try {
    localStorage.removeItem(resumeKey(videoId))
  } catch {
    // ignore
  }
}

export function readResumeFromTime(videoId: string, now: number = Date.now()): number | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(resumeKey(videoId))
  } catch {
    return null
  }
  if (!raw) return null

  let entry: ResumeEntry
  try {
    entry = JSON.parse(raw)
  } catch {
    return null
  }

  const age = now - entry.startedAt
  if (age < 0 || age > RESUME_MAX_AGE_MS) return null

  const elapsedSeconds = Math.floor(age / 1000)
  return Math.max(0, elapsedSeconds - RESUME_REWIND_SECONDS)
}
```

```ts
// src/screens/embedSrc.ts
/**
 * OK.ru's player is known to honor `fromTime=<seconds>` (used by
 * yt-dlp/youtube-dl's Odnoklassniki extractor); unconfirmed on the
 * `/videoembed/` iframe form specifically. If ignored, playback just starts
 * at 0 as it does today — never a crash.
 */
export function buildEmbedSrc(embedUrl: string, fromTimeSeconds: number | null): string {
  const separator = embedUrl.includes('?') ? '&' : '?'
  const fromTimePart = fromTimeSeconds && fromTimeSeconds > 0 ? `&fromTime=${fromTimeSeconds}` : ''
  return `${embedUrl}${separator}autoplay=1${fromTimePart}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/screens/resume.test.ts src/screens/embedSrc.test.ts`
Expected: PASS (7 + 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/screens/resume.ts src/screens/resume.test.ts src/screens/embedSrc.ts src/screens/embedSrc.test.ts
git commit -m "feat: add resume timestamp tracking and embed URL builder"
```

---

### Task 8: Wire retry + resume into Player.tsx

**Files:**
- Modify: `src/screens/Player.tsx` (full rewrite, see below)
- Modify: `src/screens/Player.css` (append reconnecting-indicator styles)
- Test: `src/screens/Player.test.tsx`

**Interfaces:**
- Consumes: `playerRetryReducer`, `initialPlayerRetryState`, `backoffMs` (Task 6); `markResumeStart`, `readResumeFromTime`, `clearResume` (Task 7); `buildEmbedSrc` (Task 7).
- Produces: no new exports — `Player`'s props (`{ row: CatalogRow; onClose: () => void }`) are unchanged, consumed by `App.tsx` (Task 4) as before.

- [ ] **Step 1: Write the failing test**

```tsx
// src/screens/Player.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Player } from './Player'
import type { CatalogRow } from '../types'

function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'movie', title: 'Foo', title_raw: 'Foo',
    series_id: '', series_title: '', season_number: null, season_label: '',
    episode_number: null, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: 'https://ok.ru/video/1',
    embed_url: 'https://ok.ru/videoembed/1',
    ...overrides,
  }
}

function getFrame() {
  return document.querySelector('.go-player_frame') as HTMLIFrameElement
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Player', () => {
  it('renders the embed with autoplay', () => {
    render(<Player row={row()} onClose={() => {}} />)
    expect(getFrame().src).toBe('https://ok.ru/videoembed/1?autoplay=1')
  })

  it('calls onClose on Escape and Backspace', () => {
    const onClose = vi.fn()
    render(<Player row={row()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows a reconnecting indicator on load timeout, then recovers on load', () => {
    render(<Player row={row()} onClose={() => {}} />)
    expect(screen.queryByText('Reconectando…')).toBeNull()

    act(() => vi.advanceTimersByTime(8000)) // load timeout -> retrying
    expect(screen.getByText('Reconectando…')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1000)) // backoff for attempt 1 -> reload
    expect(screen.queryByText('Reconectando…')).toBeNull()

    fireEvent.load(getFrame())
    expect(screen.queryByText('Reconectando…')).toBeNull()
    expect(screen.queryByText('No se pudo reproducir aquí.')).toBeNull()
  })

  it('falls back to the manual link after exhausting retries', () => {
    render(<Player row={row()} onClose={() => {}} />)

    act(() => vi.advanceTimersByTime(8000)) // timeout 1 -> retrying (attempt 1)
    act(() => vi.advanceTimersByTime(1000)) // backoff 1 -> loading
    act(() => vi.advanceTimersByTime(8000)) // timeout 2 -> retrying (attempt 2)
    act(() => vi.advanceTimersByTime(2000)) // backoff 2 -> loading
    act(() => vi.advanceTimersByTime(8000)) // timeout 3 -> retrying (attempt 3)
    act(() => vi.advanceTimersByTime(3000)) // backoff 3 -> loading
    act(() => vi.advanceTimersByTime(8000)) // timeout 4 -> failed

    expect(screen.getByText('No se pudo reproducir aquí.')).toBeInTheDocument()
    expect(screen.getByText('Abrir en ok.ru')).toBeInTheDocument()
  })

  it('reloads immediately on "r", bypassing backoff', () => {
    render(<Player row={row()} onClose={() => {}} />)
    act(() => vi.advanceTimersByTime(8000)) // -> retrying, attempt 1
    expect(screen.getByText('Reconectando…')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'r' })
    expect(screen.queryByText('Reconectando…')).toBeNull()
    expect(getFrame()).not.toBeNull()
  })

  it('writes a resume timestamp on first successful load, reused as fromTime on the next reload', () => {
    render(<Player row={row()} onClose={() => {}} />)
    fireEvent.load(getFrame())
    expect(localStorage.getItem('go10:resume:1')).not.toBeNull()

    act(() => vi.advanceTimersByTime(30_000))
    fireEvent.keyDown(window, { key: 'r' })
    expect(getFrame().src).toContain('fromTime=')
  })

  it('clears the resume timestamp when the video changes', () => {
    const { rerender } = render(<Player row={row({ video_id: '1' })} onClose={() => {}} />)
    fireEvent.load(getFrame())
    expect(localStorage.getItem('go10:resume:1')).not.toBeNull()

    rerender(<Player row={row({ video_id: '2' })} onClose={() => {}} />)
    expect(localStorage.getItem('go10:resume:1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/Player.test.tsx`
Expected: FAIL — current `Player.tsx` has no retry/resume/"r" behavior.

- [ ] **Step 3: Rewrite `src/screens/Player.tsx`**

```tsx
// src/screens/Player.tsx
import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { CatalogRow } from '../types'
import { playerRetryReducer, initialPlayerRetryState, backoffMs } from './playerRetry'
import { markResumeStart, readResumeFromTime, clearResume } from './resume'
import { buildEmbedSrc } from './embedSrc'
import './Player.css'

/** How long to wait for the embed before treating it as a load failure. */
const LOAD_TIMEOUT_MS = 8000

export function Player({ row, onClose }: { row: CatalogRow; onClose: () => void }) {
  const [state, dispatch] = useReducer(playerRetryReducer, initialPlayerRetryState)
  const loaded = useRef(false)
  // Tracks whether this video_id has ever loaded successfully, so the resume
  // clock starts once per viewing session and isn't reset by retries/reloads.
  const startedRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loaded.current = false
    startedRef.current = false
    dispatch({ type: 'reset' })
  }, [row.video_id])

  useEffect(() => {
    return () => clearResume(row.video_id)
  }, [row.video_id])

  useEffect(() => {
    if (state.status === 'loading') {
      const timer = setTimeout(() => {
        if (!loaded.current) dispatch({ type: 'timeout' })
      }, LOAD_TIMEOUT_MS)
      return () => clearTimeout(timer)
    }
    if (state.status === 'retrying') {
      const timer = setTimeout(() => {
        loaded.current = false
        dispatch({ type: 'retryLoadStarted' })
      }, backoffMs(state.attempt))
      return () => clearTimeout(timer)
    }
  }, [state.status, state.attempt])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' || event.key === 'Backspace') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        if (document.fullscreenElement) {
          document.exitFullscreen()
        } else {
          containerRef.current?.requestFullscreen().catch(() => {})
        }
      } else if (event.key === 'r' || event.key === 'R') {
        event.preventDefault()
        loaded.current = false
        dispatch({ type: 'manualReload' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleLoad = useCallback(() => {
    loaded.current = true
    if (!startedRef.current) {
      startedRef.current = true
      markResumeStart(row.video_id)
    }
    dispatch({ type: 'loaded' })
  }, [row.video_id])

  const heading = row.series_title || row.title
  const season = row.season_number
    ? row.season_label || `Temporada ${row.season_number}`
    : null

  const fromTime = readResumeFromTime(row.video_id)
  const embedSrc = buildEmbedSrc(row.embed_url, fromTime)

  return (
    <div className="go-player" ref={containerRef}>
      <div className="go-player_bar">
        <button type="button" className="go-player_back" onClick={onClose} aria-label="Volver">
          <span className="go-back_chevron" aria-hidden="true" />
        </button>
        <span className="go-player_mark" aria-hidden="true" />
        <span className="go-player_title">{heading}</span>
        {season && <span className="go-player_season">{season}</span>}
        <span className="go-player_hint">
          Pulsa Atrás para salir · F para pantalla completa · R para recargar
        </span>
      </div>

      {state.status === 'retrying' && (
        <div className="go-player_reconnecting" role="status">
          Reconectando…
        </div>
      )}

      {state.status === 'failed' ? (
        <div className="go-player_fallback">
          <p className="go-player_fallback-msg">No se pudo reproducir aquí.</p>
          <a className="go-player_open" href={row.video_url} target="_blank" rel="noreferrer">
            Abrir en ok.ru
          </a>
        </div>
      ) : (
        <iframe
          key={state.reloadToken}
          className="go-player_frame"
          src={embedSrc}
          title={row.title}
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          onLoad={handleLoad}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Append the reconnecting-indicator style**

Add to the end of `src/screens/Player.css`:

```css
.go-player_reconnecting {
  position: absolute;
  left: 50%;
  bottom: 2rem;
  transform: translateX(-50%);
  padding: 0.625rem 1.25rem;
  border-radius: var(--go-radius);
  background: var(--go-scrim);
  box-shadow: inset 0 0 0 1px var(--go-hairline);
  font-family: var(--go-font-mono);
  font-size: 0.8125rem;
  letter-spacing: 0.06em;
  color: var(--go-text-muted);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/screens/Player.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 6: Run the full suite to check nothing else broke**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/screens/Player.tsx src/screens/Player.css src/screens/Player.test.tsx
git commit -m "feat: add in-place player reload with auto-retry and resume"
```

---

### Task 9: Catalog session cache (pure-ish)

**Files:**
- Create: `src/catalog/catalogCache.ts`
- Test: `src/catalog/catalogCache.test.ts`

**Interfaces:**
- Consumes: `CatalogRow` from `src/types.ts`.
- Produces: `readCachedCatalog(): CatalogRow[] | null`, `writeCachedCatalog(rows: CatalogRow[]): void`. Consumed by Task 10.

- [ ] **Step 1: Write the failing test**

```ts
// src/catalog/catalogCache.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { readCachedCatalog, writeCachedCatalog } from './catalogCache'
import type { CatalogRow } from '../types'

function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'movie', title: 'X', title_raw: '',
    series_id: '', series_title: '', season_number: null, season_label: '',
    episode_number: null, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
    ...overrides,
  }
}

beforeEach(() => {
  sessionStorage.clear()
})

describe('catalogCache', () => {
  it('returns null when nothing has been cached', () => {
    expect(readCachedCatalog()).toBeNull()
  })

  it('round-trips rows written to the cache', () => {
    const rows = [row({ video_id: '1' }), row({ video_id: '2' })]
    writeCachedCatalog(rows)
    expect(readCachedCatalog()).toEqual(rows)
  })

  it('returns null for malformed stored data instead of throwing', () => {
    sessionStorage.setItem('go10:catalog:v1', 'not json')
    expect(readCachedCatalog()).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/catalog/catalogCache.test.ts`
Expected: FAIL — `Cannot find module './catalogCache'`

- [ ] **Step 3: Write the implementation**

```ts
// src/catalog/catalogCache.ts
import type { CatalogRow } from '../types'

const CATALOG_CACHE_KEY = 'go10:catalog:v1'

interface CachedCatalog {
  rows: CatalogRow[]
  builtAt: number
}

export function readCachedCatalog(): CatalogRow[] | null {
  try {
    const raw = sessionStorage.getItem(CATALOG_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedCatalog
    return Array.isArray(parsed.rows) ? parsed.rows : null
  } catch {
    return null
  }
}

/** Best-effort: if storage is unavailable, this just costs a re-fetch next load. */
export function writeCachedCatalog(rows: CatalogRow[]): void {
  try {
    const payload: CachedCatalog = { rows, builtAt: Date.now() }
    sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // ignore — private mode, quota exceeded, or storage disabled
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/catalog/catalogCache.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/catalog/catalogCache.ts src/catalog/catalogCache.test.ts
git commit -m "feat: add session-scoped catalog cache"
```

---

### Task 10: Wire catalog cache into useCatalog

**Files:**
- Modify: `src/catalog/useCatalog.ts` (full rewrite, see below)
- Test: `src/catalog/useCatalog.test.ts`

**Interfaces:**
- Consumes: `readCachedCatalog`, `writeCachedCatalog` (Task 9).
- Produces: no change to `useCatalog(): CatalogState`'s public shape — consumed by `App.tsx` (Task 4) as before.

- [ ] **Step 1: Write the failing test**

```ts
// src/catalog/useCatalog.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCatalog } from './useCatalog'

const CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,111,movie,Foo,Foo,,,,,2020,,Drama,,1080p,Español,false,1:00:00,3600,10,thumb.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
`

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useCatalog', () => {
  it('fetches and parses the catalog when there is no cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useCatalog())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.titles).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates synchronously from the session cache and skips the fetch', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    sessionStorage.setItem(
      'go10:catalog:v1',
      JSON.stringify({
        rows: [
          {
            catalog_index: 0, video_id: '111', type: 'movie', title: 'Foo', title_raw: 'Foo',
            series_id: '', series_title: '', season_number: null, season_label: '',
            episode_number: null, year: 2020, studio: '', genre: 'Drama', genre_secondary: '',
            quality: '1080p', language: 'Español', subtitled: false, duration_raw: '1:00:00',
            duration_seconds: 3600, views: 10, thumbnail: 'thumb.webp',
            video_url: 'https://ok.ru/video/111', embed_url: 'https://ok.ru/videoembed/111',
          },
        ],
        builtAt: Date.now(),
      }),
    )

    const { result } = renderHook(() => useCatalog())
    expect(result.current.loading).toBe(false)
    expect(result.current.titles).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('writes the parsed catalog to the session cache after a successful fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) }))

    const { result } = renderHook(() => useCatalog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(sessionStorage.getItem('go10:catalog:v1')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/catalog/useCatalog.test.ts`
Expected: FAIL — current `useCatalog` always fetches and never reads/writes a cache.

- [ ] **Step 3: Rewrite `src/catalog/useCatalog.ts`**

```ts
// src/catalog/useCatalog.ts
import { useEffect, useState } from 'react'
import type { CatalogRow, Title } from '../types'
import { parseCatalogCsv, buildTitles } from './loadCatalog'
import { readCachedCatalog, writeCachedCatalog } from './catalogCache'

interface CatalogState {
  rows: CatalogRow[]
  titles: Title[]
  loading: boolean
  error: string | null
}

export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>(() => {
    const rows = readCachedCatalog()
    return rows
      ? { rows, titles: buildTitles(rows), loading: false, error: null }
      : { rows: [], titles: [], loading: true, error: null }
  })

  useEffect(() => {
    if (readCachedCatalog()) return // already hydrated synchronously above

    let cancelled = false

    fetch('/data/catalog.csv')
      .then((response) => {
        if (!response.ok) throw new Error(`catalog.csv: ${response.status}`)
        return response.text()
      })
      .then((text) => {
        if (cancelled) return
        const rows = parseCatalogCsv(text)
        writeCachedCatalog(rows)
        setState({ rows, titles: buildTitles(rows), loading: false, error: null })
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setState({ rows: [], titles: [], loading: false, error: error.message })
        }
      })

    return () => { cancelled = true }
  }, [])

  return state
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/catalog/useCatalog.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS (all suites, full project)

- [ ] **Step 6: Commit**

```bash
git add src/catalog/useCatalog.ts src/catalog/useCatalog.test.ts
git commit -m "feat: cache the parsed catalog in sessionStorage"
```

---

## Manual verification (cannot be automated)

After all tasks land, on the real TV or a browser standing in for it:

1. Confirm `fromTime=<seconds>` actually seeks the `/videoembed/` iframe (flagged as unconfirmed in the spec) — play a video, wait ~30s, press "r", check playback resumes near that point rather than from 0.
2. Confirm a hard refresh on a `/title/:key/play/:videoId` URL restores the player directly (not Home), both locally (`npm run preview`) and once deployed to Netlify (`netlify.toml` redirect).
