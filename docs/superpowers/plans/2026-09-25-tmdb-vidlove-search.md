# External Titles (TMDB search + vidlove playback) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Search reaches TMDB alongside our catalog; TMDB titles open on the same Detail screen and play through vidlove in the same Player — all behind a build-time switch that, when off, leaves today's app untouched.

**Architecture:** TMDB responses are mapped into the existing `Title`/`CatalogRow` shapes (flagged `external: true`, keyed `tmdb-*`), so screens need only small tweaks. `App` resolves `tmdb-*` keys through an async `useTmdbTitle` hook and hands the result to the unchanged `resolveRoute`. `Player` keeps its logic and delegates embed specifics to an `EmbedProvider` adapter (ok.ru or vidlove).

**Tech Stack:** React 19, TypeScript 6 (`erasableSyntaxOnly` — no parameter properties/enums), Vite 8, Vitest 5 + Testing Library (jsdom), TMDB API v3 with a v4 bearer token.

**Spec:** `docs/superpowers/specs/2026-09-25-tmdb-vidlove-search-design.md`

## Global Constraints

- Switch: on only when `VITE_EXTERNAL_TITLES === 'on'` **and** `VITE_TMDB_TOKEN` is non-empty; otherwise the app behaves exactly as before.
- With the switch off: zero TMDB requests, no vidlove iframe, no chip, no attribution, `solo=` ignored, `tmdb-*` keys → not-found → Home, snapshots ignored.
- The existing test suite must pass **unchanged** (don't edit existing assertions or fixtures). New behaviour gets new tests.
- `external?: true` is optional on `Title`/`CatalogRow`; catalog data never sets it.
- Keys: title `tmdb-movie-<id>` / `tmdb-tv-<id>`; row `tmdb-movie-<id>` / `tmdb-tv-<id>-s<S>e<E>`.
- TMDB: base `https://api.themoviedb.org/3`, `Authorization: Bearer <token>`, always `language=es-MX`; search adds `include_adult=false`, `page=1`.
- Images: backdrop `https://image.tmdb.org/t/p/w780<path>`, else poster `https://image.tmdb.org/t/p/w500<path>`.
- vidlove: embed base `https://player.vidlove.cc/embed`; origin `https://player.vidlove.cc`; query `autoplay=true&primarycolor=c6f24e&secondarycolor=08090c&iconcolor=f2f4f0&autonext=false&episodelist=false&showNextEpisode=false`; sandbox `allow-scripts allow-same-origin allow-presentation` (subject to Task 1's findings).
- Copy (Spanish, verbatim): `Todo`, `Solo catálogo`, `Buscando…`, `Datos de títulos: TMDB`, `Cargando título…`, `No se pudo cargar el título.`, `Abrir en una pestaña nueva`.
- Search debounce 400 ms, minimum 2 trimmed characters. Snapshot limit 30.
- Storage keys: `go10:tmdb-title:<key>` (localStorage snapshots), `go10:tmdb-cache:<key>` (sessionStorage title cache).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No browser automation for verification: the user checks UI manually.

## Review Focus

- A TMDB **show** in search results has `seasons: []` — its card must not read "0 Temporadas". (Task 9 test.)
- With the new chip present, Enter/Down from the search box must still land on the **first result**, not the chip. (Task 8 test.)
- A late vidlove event from the **previous episode** (after autoplay moved on) must not write progress for, or end, the current one. (Task 10 test.)
- A deep link to a TMDB title already played, while TMDB is **unreachable**, must still open (from the snapshot), not show the error. (Task 6 test.)
- Queries with accents and `&` ("amélie & co") must reach TMDB intact. (Task 4 test.)

---

### Task 1: Verify vidlove's URL options and sandbox by hand (USER, non-blocking)

The option names come from vidlove's minified bundle. The user confirms them in a real browser; Tasks 2–9 can proceed meanwhile. Findings adjust the constants in Task 10.

**Files:**
- Create (scratch, not committed): `<scratchpad>/vidlove-check.html`

- [ ] **Step 1: Save this page and open it in a desktop browser (double-click the file)**

```html
<!doctype html>
<meta charset="utf-8">
<title>vidlove check</title>
<style>body{background:#08090c;color:#f2f4f0;font:14px monospace} iframe{width:640px;height:360px;border:0;margin:4px}</style>
<p>Left: sandboxed · Right: not sandboxed. Both: tv/1396/1/1 with our options.</p>
<iframe id="a" sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; fullscreen; encrypted-media" allowfullscreen
  src="https://player.vidlove.cc/embed/tv/1396/1/1?autoplay=true&primarycolor=c6f24e&secondarycolor=08090c&iconcolor=f2f4f0&autonext=false&episodelist=false&showNextEpisode=false"></iframe>
<iframe id="b" allow="autoplay; fullscreen; encrypted-media" allowfullscreen
  src="https://player.vidlove.cc/embed/tv/1396/1/1?autoplay=true&primarycolor=c6f24e&secondarycolor=08090c&iconcolor=f2f4f0&autonext=false&episodelist=false&showNextEpisode=false"></iframe>
<p><button onclick="seek('a')">Seek left to 600s</button> <button onclick="seek('b')">Seek right to 600s</button></p>
<pre id="log"></pre>
<script>
  function seek(id) { document.getElementById(id).contentWindow.postMessage({ type: 'seek', time: 600 }, 'https://player.vidlove.cc') }
  addEventListener('message', (e) => {
    if (e.origin !== 'https://player.vidlove.cc') return
    const who = e.source === document.getElementById('a').contentWindow ? 'A' : 'B'
    if (e.data?.data?.event === 'timeupdate' && Math.floor(e.data.data.currentTime) % 10) return
    document.getElementById('log').textContent = `${who} ${JSON.stringify(e.data)}\n` + document.getElementById('log').textContent
  })
</script>
```

- [ ] **Step 2: Record the answers for Task 10**

1. Does the **sandboxed** (left) player load and play? Did any popup/new tab open from either?
2. Do controls use lime `#c6f24e` accents?
3. Does it autoplay (possibly muted)?
4. Is the in-player episode list / next-episode button hidden?
5. Does the log show `PLAYER_EVENT` `timeupdate` / `pause` / `ended` with `tmdbId: 1396, season: 1, episode: 1`?
6. Does "Seek to 600s" jump playback?

If (1) fails for the sandboxed player, Task 10 sets `sandbox: undefined` for vidlove. Drop any option from `PARAMS` that has no visible effect (keep `autoplay`).

---

### Task 2: Feature switch, `external` flag, and `imageSrc`

**Files:**
- Create: `src/external/config.ts`, `src/external/config.test.ts`, `src/env.d.ts`, `src/lib/imageSrc.ts`, `src/lib/imageSrc.test.ts`
- Modify: `src/types.ts`, `vite.config.ts`, `.gitignore`, `src/components/Card.tsx:45`, `src/components/Backdrop.tsx:14`, `src/screens/Detail.tsx:161`, `src/screens/Home.tsx:192`

**Interfaces:**
- Produces: `externalTitlesEnabled(): boolean`, `tmdbToken(): string` (from `src/external/config.ts`); `imageSrc(path: string): string` (from `src/lib/imageSrc.ts`); `external?: true` on `Title` and `CatalogRow`.

- [ ] **Step 1: Write the failing tests**

`src/external/config.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalTitlesEnabled, tmdbToken } from './config'

afterEach(() => vi.unstubAllEnvs())

describe('externalTitlesEnabled', () => {
  it('is off by default in tests', () => {
    expect(externalTitlesEnabled()).toBe(false)
  })

  it('is off without a token, even when switched on', () => {
    vi.stubEnv('VITE_EXTERNAL_TITLES', 'on')
    vi.stubEnv('VITE_TMDB_TOKEN', '')
    expect(externalTitlesEnabled()).toBe(false)
  })

  it('is off for any value other than "on"', () => {
    vi.stubEnv('VITE_TMDB_TOKEN', 'tok')
    for (const value of ['true', 'ON', '1', 'yes', '']) {
      vi.stubEnv('VITE_EXTERNAL_TITLES', value)
      expect(externalTitlesEnabled()).toBe(false)
    }
  })

  it('is on with the switch and a token', () => {
    vi.stubEnv('VITE_EXTERNAL_TITLES', 'on')
    vi.stubEnv('VITE_TMDB_TOKEN', 'tok')
    expect(externalTitlesEnabled()).toBe(true)
    expect(tmdbToken()).toBe('tok')
  })
})
```

`src/lib/imageSrc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { imageSrc } from './imageSrc'

describe('imageSrc', () => {
  it('roots a relative catalog path', () => {
    expect(imageSrc('catalogo_files/a.webp')).toBe('/catalogo_files/a.webp')
  })

  it('passes absolute URLs through', () => {
    expect(imageSrc('https://image.tmdb.org/t/p/w780/x.jpg')).toBe('https://image.tmdb.org/t/p/w780/x.jpg')
    expect(imageSrc('http://example.com/x.jpg')).toBe('http://example.com/x.jpg')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/external/config.test.ts src/lib/imageSrc.test.ts`
Expected: FAIL — cannot resolve `./config` / `./imageSrc`.

- [ ] **Step 3: Implement**

`src/external/config.ts`:

```ts
/**
 * Build-time switch for external titles (TMDB search + vidlove playback).
 * Off unless `VITE_EXTERNAL_TITLES=on` *and* a TMDB token is set; off, the
 * app is exactly the catalog-only app. Read per call so tests can stub it.
 */
export function externalTitlesEnabled(): boolean {
  return import.meta.env.VITE_EXTERNAL_TITLES === 'on' && Boolean(import.meta.env.VITE_TMDB_TOKEN)
}

/** TMDB v4 read-access token. Ships in the bundle: read-only by design. */
export function tmdbToken(): string {
  return import.meta.env.VITE_TMDB_TOKEN ?? ''
}
```

`src/env.d.ts`:

```ts
interface ImportMetaEnv {
  /** `on` enables TMDB search + vidlove playback. Anything else: off. */
  readonly VITE_EXTERNAL_TITLES?: string
  readonly VITE_TMDB_TOKEN?: string
}
```

`src/lib/imageSrc.ts`:

```ts
/** Catalog art is a path relative to the site root; TMDB art is an absolute URL. */
export function imageSrc(path: string): string {
  return /^https?:\/\//.test(path) ? path : `/${path}`
}
```

In `src/types.ts`, add as the last field of **both** `CatalogRow` and `Title`:

```ts
  /** Mapped from TMDB and played through vidlove. Absent on catalog data. */
  external?: true
```

`vite.config.ts` — pin the switch off for tests so a local `.env.local` can't leak in:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // External titles are off for the suite; tests that need them stub these.
    env: { VITE_EXTERNAL_TITLES: 'off', VITE_TMDB_TOKEN: '' },
  },
})
```

`.gitignore` — append:

```
# Local env (TMDB token, feature switches)
.env.local
.env.*.local
```

Replace the four `` src={`/${…thumbnail}`} `` usages with `imageSrc(...)` (add `import { imageSrc } from '../lib/imageSrc'` to each file):

- `src/components/Card.tsx:45` → `src={imageSrc(title.thumbnail)}`
- `src/components/Backdrop.tsx:14` → `src={imageSrc(thumbnail)}`
- `src/screens/Detail.tsx:161` → `src={imageSrc(title.thumbnail)}`
- `src/screens/Home.tsx:192` → `src={imageSrc(featured.thumbnail)}` (leave the `art.small`/`art.large` hero lines alone)

- [ ] **Step 4: Run the new tests and the whole suite**

Run: `npx vitest run src/external/config.test.ts src/lib/imageSrc.test.ts && npm test`
Expected: PASS, including every pre-existing test.

- [ ] **Step 5: Commit**

```bash
git add src/external/config.ts src/external/config.test.ts src/env.d.ts src/lib/imageSrc.ts src/lib/imageSrc.test.ts src/types.ts vite.config.ts .gitignore src/components/Card.tsx src/components/Backdrop.tsx src/screens/Detail.tsx src/screens/Home.tsx
git commit -m "feat: add the external-titles switch and absolute image support

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: TMDB keys and mapping (pure)

**Files:**
- Create: `src/external/tmdb/keys.ts`, `src/external/tmdb/keys.test.ts`, `src/external/tmdb/map.ts`, `src/external/tmdb/map.test.ts`

**Interfaces:**
- Consumes: `Title`, `CatalogRow` (with `external?: true`) from Task 2.
- Produces:
  - `type TmdbMedia = 'movie' | 'tv'`
  - `tmdbTitleKey(media: TmdbMedia, id: number): string`
  - `tmdbEpisodeVideoId(id: number, season: number, episode: number): string`
  - `isTmdbKey(key: string): boolean`
  - `parseTmdbKey(key: string): { media: TmdbMedia; id: number } | null` (accepts title keys and row video ids)
  - Types `TmdbGenre`, `TmdbMovie`, `TmdbShow`, `TmdbSeason`, `TmdbEpisode`, `TmdbSearchResult`
  - `mapMovie(movie: TmdbMovie): Title`
  - `mapShow(show: TmdbShow, seasons: TmdbSeason[], today: string): Title | null` (`today` is `YYYY-MM-DD`)
  - `mapSearchResult(result: TmdbSearchResult, genres: Map<number, string>, media?: TmdbMedia): Title | null`
  - `languageName(code?: string): string`, `imageUrl(backdrop?: string | null, poster?: string | null): string`

- [ ] **Step 1: Write the failing tests**

`src/external/tmdb/keys.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isTmdbKey, parseTmdbKey, tmdbEpisodeVideoId, tmdbTitleKey } from './keys'

describe('tmdb keys', () => {
  it('builds title keys and episode video ids', () => {
    expect(tmdbTitleKey('movie', 155)).toBe('tmdb-movie-155')
    expect(tmdbTitleKey('tv', 1396)).toBe('tmdb-tv-1396')
    expect(tmdbEpisodeVideoId(1396, 1, 3)).toBe('tmdb-tv-1396-s1e3')
  })

  it('parses title keys and episode ids', () => {
    expect(parseTmdbKey('tmdb-movie-155')).toEqual({ media: 'movie', id: 155 })
    expect(parseTmdbKey('tmdb-tv-1396')).toEqual({ media: 'tv', id: 1396 })
    expect(parseTmdbKey('tmdb-tv-1396-s1e3')).toEqual({ media: 'tv', id: 1396 })
  })

  it('rejects anything else', () => {
    expect(parseTmdbKey('hora-de-aventura')).toBeNull()
    expect(parseTmdbKey('tmdb-person-3')).toBeNull()
    expect(parseTmdbKey('tmdb-movie-abc')).toBeNull()
    expect(isTmdbKey('tmdb-movie-1')).toBe(true)
    expect(isTmdbKey('111')).toBe(false)
  })
})
```

`src/external/tmdb/map.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { languageName, mapMovie, mapSearchResult, mapShow, type TmdbMovie, type TmdbSeason, type TmdbShow } from './map'

const MOVIE: TmdbMovie = {
  id: 155,
  title: 'Batman: El caballero de la noche',
  release_date: '2008-07-16',
  genres: [{ id: 18, name: 'Drama' }, { id: 28, name: 'Acción' }, { id: 80, name: 'Crimen' }],
  production_companies: [{ name: 'Warner Bros. Pictures' }],
  original_language: 'en',
  runtime: 152,
  backdrop_path: '/back.jpg',
  poster_path: '/poster.jpg',
}

const SHOW: TmdbShow = {
  id: 1396,
  name: 'Breaking Bad',
  first_air_date: '2008-01-20',
  genres: [{ id: 18, name: 'Drama' }],
  networks: [{ name: 'AMC' }],
  original_language: 'en',
  episode_run_time: [47],
  backdrop_path: '/bb.jpg',
  poster_path: null,
  seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }],
}

const SEASONS: TmdbSeason[] = [
  { season_number: 0, episodes: [{ season_number: 0, episode_number: 1, name: 'Especial', air_date: '2009-02-17', runtime: 5 }] },
  {
    season_number: 2,
    episodes: [
      { season_number: 2, episode_number: 1, name: 'Siete treinta y siete', air_date: '2009-03-08', runtime: 47, still_path: '/s2e1.jpg' },
      { season_number: 2, episode_number: 2, name: 'Futuro', air_date: '2099-01-01', runtime: 47 },
      { season_number: 2, episode_number: 3, name: 'Sin fecha', air_date: null, runtime: 47 },
    ],
  },
  {
    season_number: 1,
    episodes: [
      { season_number: 1, episode_number: 2, name: 'El gato está en la bolsa', air_date: '2008-01-27', runtime: null },
      { season_number: 1, episode_number: 1, name: 'Piloto', air_date: '2008-01-20', runtime: 58 },
    ],
  },
]

describe('languageName', () => {
  it('names languages in Spanish, capitalised', () => {
    expect(languageName('en')).toBe('Inglés')
    expect(languageName('es')).toBe('Español')
    expect(languageName('ja')).toBe('Japonés')
  })

  it('falls back to the code, and to blank', () => {
    expect(languageName('xx')).toBe('XX')
    expect(languageName(undefined)).toBe('')
  })
})

describe('mapMovie', () => {
  it('maps a movie into a one-row title', () => {
    const title = mapMovie(MOVIE)
    expect(title).toMatchObject({
      key: 'tmdb-movie-155', kind: 'movie', title: 'Batman: El caballero de la noche', year: 2008,
      studio: 'Warner Bros. Pictures', source: '', genre: 'Drama', genre_secondary: 'Acción',
      quality: '', language: 'Inglés', subtitled: true, views: 0, durationSeconds: 9120,
      thumbnail: 'https://image.tmdb.org/t/p/w780/back.jpg', external: true,
    })
    expect(title.seasons).toHaveLength(1)
    expect(title.seasons[0]).toMatchObject({
      video_id: 'tmdb-movie-155', type: 'movie', series_id: '', season_number: null,
      chapter_start_seconds: null, chapter_end_seconds: null, duration_seconds: 9120,
      embed_url: 'https://player.vidlove.cc/embed/movie/155',
      video_url: 'https://player.vidlove.cc/embed/movie/155', external: true,
    })
  })

  it('falls back to the poster, and handles Spanish originals and missing runtime', () => {
    const title = mapMovie({ ...MOVIE, backdrop_path: null, original_language: 'es', runtime: null })
    expect(title.thumbnail).toBe('https://image.tmdb.org/t/p/w500/poster.jpg')
    expect(title.language).toBe('Español')
    expect(title.subtitled).toBe(false)
    expect(title.durationSeconds).toBe(0)
  })

  it('leaves the year blank for a missing date', () => {
    expect(mapMovie({ ...MOVIE, release_date: '' }).year).toBeNull()
  })
})

describe('mapShow', () => {
  it('flattens aired episodes, in order, without specials', () => {
    const title = mapShow(SHOW, SEASONS, '2026-09-25')!
    expect(title).toMatchObject({ key: 'tmdb-tv-1396', kind: 'show', title: 'Breaking Bad', studio: 'AMC', year: 2008, durationSeconds: 3480 })
    expect(title.seasons.map((r) => r.video_id)).toEqual(['tmdb-tv-1396-s1e1', 'tmdb-tv-1396-s1e2', 'tmdb-tv-1396-s2e1'])
    expect(title.seasons[0]).toMatchObject({
      type: 'episode', title: 'Piloto', series_id: 'tmdb-tv-1396', series_title: 'Breaking Bad',
      season_number: 1, season_label: 'Temporada 1', episode_number: 1, duration_seconds: 3480,
      embed_url: 'https://player.vidlove.cc/embed/tv/1396/1/1', thumbnail: 'https://image.tmdb.org/t/p/w780/bb.jpg',
      external: true,
    })
  })

  it("uses the show's runtime and art when an episode has none", () => {
    const title = mapShow(SHOW, SEASONS, '2026-09-25')!
    expect(title.seasons[1].duration_seconds).toBe(47 * 60)
    expect(title.seasons[2].thumbnail).toBe('https://image.tmdb.org/t/p/w780/s2e1.jpg')
  })

  it('is null when nothing has aired', () => {
    expect(mapShow(SHOW, [], '2026-09-25')).toBeNull()
  })
})

describe('mapSearchResult', () => {
  const genres = new Map([[18, 'Drama'], [28, 'Acción']])

  it('maps a movie result into a lightweight title', () => {
    expect(
      mapSearchResult({ id: 155, media_type: 'movie', title: 'Batman', release_date: '2008-07-16', genre_ids: [28, 18], original_language: 'en', backdrop_path: '/b.jpg' }, genres),
    ).toMatchObject({
      key: 'tmdb-movie-155', kind: 'movie', title: 'Batman', year: 2008, genre: 'Acción', genre_secondary: 'Drama',
      language: 'Inglés', subtitled: true, thumbnail: 'https://image.tmdb.org/t/p/w780/b.jpg', seasons: [], external: true,
    })
  })

  it('maps a TV result by name and first air date', () => {
    expect(
      mapSearchResult({ id: 1396, media_type: 'tv', name: 'Breaking Bad', first_air_date: '2008-01-20', poster_path: '/p.jpg' }, genres),
    ).toMatchObject({ key: 'tmdb-tv-1396', kind: 'show', title: 'Breaking Bad', year: 2008, thumbnail: 'https://image.tmdb.org/t/p/w500/p.jpg' })
  })

  it('takes the media type from the endpoint when the result has none', () => {
    expect(mapSearchResult({ id: 1, title: 'X', backdrop_path: '/x.jpg' }, genres, 'movie')?.kind).toBe('movie')
  })

  it('drops people, imageless results and nameless results', () => {
    expect(mapSearchResult({ id: 1, media_type: 'person', name: 'Someone', poster_path: '/p.jpg' }, genres)).toBeNull()
    expect(mapSearchResult({ id: 2, media_type: 'movie', title: 'No art' }, genres)).toBeNull()
    expect(mapSearchResult({ id: 3, media_type: 'movie', title: '', backdrop_path: '/x.jpg' }, genres)).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/external/tmdb`
Expected: FAIL — cannot resolve `./keys` / `./map`.

- [ ] **Step 3: Implement**

`src/external/tmdb/keys.ts`:

```ts
/**
 * Keys for TMDB titles. Namespaced so they can never collide with catalog
 * keys (`series_id` slugs and numeric ok.ru ids), and so a route alone says
 * where a title comes from.
 */
export type TmdbMedia = 'movie' | 'tv'

const PREFIX = 'tmdb-'
const PATTERN = /^tmdb-(movie|tv)-(\d+)(?:-s\d+e\d+)?$/

export function tmdbTitleKey(media: TmdbMedia, id: number): string {
  return `${PREFIX}${media}-${id}`
}

/** A TV episode's row id — and the key its watch progress is stored under. */
export function tmdbEpisodeVideoId(id: number, season: number, episode: number): string {
  return `${PREFIX}tv-${id}-s${season}e${episode}`
}

export function isTmdbKey(key: string): boolean {
  return key.startsWith(PREFIX)
}

/** The TMDB media and id behind a title key or a row's video id. */
export function parseTmdbKey(key: string): { media: TmdbMedia; id: number } | null {
  const match = PATTERN.exec(key)
  return match ? { media: match[1] as TmdbMedia, id: Number(match[2]) } : null
}
```

`src/external/tmdb/map.ts`:

```ts
import type { CatalogRow, Title } from '../../types'
import { tmdbEpisodeVideoId, tmdbTitleKey, type TmdbMedia } from './keys'

/**
 * TMDB JSON → the catalog's own `Title`/`CatalogRow` shapes, so every screen
 * renders a TMDB title exactly like a catalog one. Only the fields we read
 * are typed.
 */

const IMAGE_BASE = 'https://image.tmdb.org/t/p'
const VIDLOVE_EMBED = 'https://player.vidlove.cc/embed'

export interface TmdbGenre { id: number; name: string }
interface TmdbCompany { name: string }

export interface TmdbMovie {
  id: number
  title: string
  release_date?: string | null
  genres?: TmdbGenre[]
  production_companies?: TmdbCompany[]
  original_language?: string
  runtime?: number | null
  backdrop_path?: string | null
  poster_path?: string | null
}

export interface TmdbEpisode {
  season_number: number
  episode_number: number
  name?: string
  air_date?: string | null
  runtime?: number | null
  still_path?: string | null
}

export interface TmdbSeason {
  season_number: number
  episodes?: TmdbEpisode[]
}

export interface TmdbShow {
  id: number
  name: string
  first_air_date?: string | null
  genres?: TmdbGenre[]
  networks?: TmdbCompany[]
  production_companies?: TmdbCompany[]
  original_language?: string
  episode_run_time?: number[]
  backdrop_path?: string | null
  poster_path?: string | null
  seasons?: { season_number: number }[]
}

export interface TmdbSearchResult {
  id: number
  media_type?: string
  title?: string
  name?: string
  release_date?: string | null
  first_air_date?: string | null
  genre_ids?: number[]
  original_language?: string
  backdrop_path?: string | null
  poster_path?: string | null
}

/** 16:9 backdrop like our catalog art, else the poster; '' when neither exists. */
export function imageUrl(backdrop?: string | null, poster?: string | null): string {
  if (backdrop) return `${IMAGE_BASE}/w780${backdrop}`
  if (poster) return `${IMAGE_BASE}/w500${poster}`
  return ''
}

const languageNames = new Intl.DisplayNames(['es'], { type: 'language' })

/** ISO 639-1 → Spanish language name, capitalised as the catalog writes it ("Inglés"). */
export function languageName(code?: string): string {
  if (!code) return ''
  let name: string | undefined
  try {
    name = languageNames.of(code)
  } catch {
    name = undefined
  }
  if (!name || name.toLowerCase() === code.toLowerCase()) return code.toUpperCase()
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function yearOf(date?: string | null): number | null {
  const year = date ? Number(date.slice(0, 4)) : NaN
  return Number.isFinite(year) && year > 0 ? year : null
}

function seconds(minutes?: number | null): number {
  return minutes && minutes > 0 ? minutes * 60 : 0
}

function baseTitle(fields: {
  key: string
  kind: Title['kind']
  title: string
  year: number | null
  studio: string
  genres: string[]
  language?: string
  thumbnail: string
}): Title {
  return {
    key: fields.key,
    kind: fields.kind,
    title: fields.title,
    year: fields.year,
    studio: fields.studio,
    source: '',
    genre: fields.genres[0] ?? '',
    genre_secondary: fields.genres[1] ?? '',
    quality: '',
    language: languageName(fields.language),
    subtitled: Boolean(fields.language) && fields.language !== 'es',
    thumbnail: fields.thumbnail,
    views: 0,
    durationSeconds: 0,
    catalogIndex: 0,
    seasons: [],
    external: true,
  }
}

function baseRow(title: Title): CatalogRow {
  return {
    catalog_index: 0,
    video_id: title.key,
    type: 'movie',
    title: title.title,
    title_raw: title.title,
    series_id: '',
    series_title: '',
    season_number: null,
    season_label: '',
    episode_number: null,
    chapter_start_seconds: null,
    chapter_end_seconds: null,
    year: title.year,
    studio: title.studio,
    source: '',
    genre: title.genre,
    genre_secondary: title.genre_secondary,
    quality: '',
    language: title.language,
    subtitled: title.subtitled,
    duration_raw: '',
    duration_seconds: 0,
    views: 0,
    thumbnail: title.thumbnail,
    video_url: '',
    embed_url: '',
    external: true,
  }
}

export function mapMovie(movie: TmdbMovie): Title {
  const title = baseTitle({
    key: tmdbTitleKey('movie', movie.id),
    kind: 'movie',
    title: movie.title,
    year: yearOf(movie.release_date),
    studio: movie.production_companies?.[0]?.name ?? '',
    genres: (movie.genres ?? []).map((g) => g.name),
    language: movie.original_language,
    thumbnail: imageUrl(movie.backdrop_path, movie.poster_path),
  })
  const embed = `${VIDLOVE_EMBED}/movie/${movie.id}`
  const duration = seconds(movie.runtime)
  return {
    ...title,
    durationSeconds: duration,
    seasons: [{ ...baseRow(title), duration_seconds: duration, embed_url: embed, video_url: embed }],
  }
}

/**
 * A show's aired episodes as one row each, ordered season → episode like the
 * catalog's `seasons`. Specials (season 0) and episodes without an air date,
 * or airing after `today`, are left out. Null when nothing is left.
 */
export function mapShow(show: TmdbShow, seasons: TmdbSeason[], today: string): Title | null {
  const title = baseTitle({
    key: tmdbTitleKey('tv', show.id),
    kind: 'show',
    title: show.name,
    year: yearOf(show.first_air_date),
    studio: show.networks?.[0]?.name ?? show.production_companies?.[0]?.name ?? '',
    genres: (show.genres ?? []).map((g) => g.name),
    language: show.original_language,
    thumbnail: imageUrl(show.backdrop_path, show.poster_path),
  })
  const fallbackRuntime = show.episode_run_time?.[0]

  const rows = seasons
    .flatMap((season) => season.episodes ?? [])
    .filter((ep) => ep.season_number > 0 && Boolean(ep.air_date) && (ep.air_date as string) <= today)
    .sort((a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number)
    .map((ep): CatalogRow => {
      const embed = `${VIDLOVE_EMBED}/tv/${show.id}/${ep.season_number}/${ep.episode_number}`
      return {
        ...baseRow(title),
        video_id: tmdbEpisodeVideoId(show.id, ep.season_number, ep.episode_number),
        type: 'episode',
        title: ep.name || `Episodio ${ep.episode_number}`,
        title_raw: ep.name ?? '',
        series_id: title.key,
        series_title: title.title,
        season_number: ep.season_number,
        season_label: `Temporada ${ep.season_number}`,
        episode_number: ep.episode_number,
        year: yearOf(ep.air_date) ?? title.year,
        duration_seconds: seconds(ep.runtime ?? fallbackRuntime),
        thumbnail: ep.still_path ? `${IMAGE_BASE}/w780${ep.still_path}` : title.thumbnail,
        embed_url: embed,
        video_url: embed,
      }
    })

  if (rows.length === 0) return null
  return { ...title, durationSeconds: rows[0].duration_seconds, seasons: rows }
}

/**
 * A search hit as a card-only title: `seasons` stays empty until Detail
 * fetches the full record. `media` is the endpoint's type for
 * `search/movie`/`search/tv`, whose results carry no `media_type`.
 */
export function mapSearchResult(
  result: TmdbSearchResult,
  genres: Map<number, string>,
  media?: TmdbMedia,
): Title | null {
  const type = media ?? result.media_type
  if (type !== 'movie' && type !== 'tv') return null
  const name = type === 'movie' ? result.title : result.name
  const thumbnail = imageUrl(result.backdrop_path, result.poster_path)
  if (!name || !thumbnail) return null

  return baseTitle({
    key: tmdbTitleKey(type, result.id),
    kind: type === 'tv' ? 'show' : 'movie',
    title: name,
    year: yearOf(type === 'movie' ? result.release_date : result.first_air_date),
    studio: '',
    genres: (result.genre_ids ?? []).map((id) => genres.get(id)).filter((g): g is string => Boolean(g)),
    language: result.original_language,
    thumbnail,
  })
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/external/tmdb`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/external/tmdb/keys.ts src/external/tmdb/keys.test.ts src/external/tmdb/map.ts src/external/tmdb/map.test.ts
git commit -m "feat: map TMDB movies, shows and search hits into catalog titles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: TMDB HTTP client

**Files:**
- Create: `src/external/tmdb/client.ts`, `src/external/tmdb/client.test.ts`

**Interfaces:**
- Consumes: `externalTitlesEnabled()`, `tmdbToken()` (Task 2).
- Produces:
  - `class TmdbError extends Error { status: number }` (`status` 0 = not attempted: switch off or disabled)
  - `tmdbAvailable(): boolean`
  - `tmdbGet<T>(path: string, params?: Record<string, string>, signal?: AbortSignal): Promise<T>`
  - `resetTmdbClientForTests(): void`

- [ ] **Step 1: Write the failing tests**

`src/external/tmdb/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTmdbClientForTests, TmdbError, tmdbAvailable, tmdbGet } from './client'

function respond(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
}

beforeEach(() => {
  vi.stubEnv('VITE_EXTERNAL_TITLES', 'on')
  vi.stubEnv('VITE_TMDB_TOKEN', 'tok')
  resetTmdbClientForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('tmdbGet', () => {
  it('sends the bearer token and es-MX, and encodes params intact', async () => {
    const fetch = respond(200, { ok: 1 })
    vi.stubGlobal('fetch', fetch)

    await expect(tmdbGet('/search/multi', { query: 'amélie & co' })).resolves.toEqual({ ok: 1 })

    const [input, init] = fetch.mock.calls[0]
    const url = new URL(String(input))
    expect(url.origin + url.pathname).toBe('https://api.themoviedb.org/3/search/multi')
    expect(url.searchParams.get('query')).toBe('amélie & co')
    expect(url.searchParams.get('language')).toBe('es-MX')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it('throws a TmdbError carrying the status', async () => {
    vi.stubGlobal('fetch', respond(404))
    await expect(tmdbGet('/movie/1')).rejects.toMatchObject({ status: 404 })
  })

  it('switches itself off for the session on 401', async () => {
    const fetch = respond(401)
    vi.stubGlobal('fetch', fetch)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(tmdbGet('/movie/1')).rejects.toBeInstanceOf(TmdbError)
    expect(tmdbAvailable()).toBe(false)
    expect(error).toHaveBeenCalledOnce()

    await expect(tmdbGet('/movie/2')).rejects.toMatchObject({ status: 0 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('never fetches while the switch is off', async () => {
    vi.stubEnv('VITE_EXTERNAL_TITLES', 'off')
    const fetch = respond(200)
    vi.stubGlobal('fetch', fetch)

    await expect(tmdbGet('/movie/1')).rejects.toMatchObject({ status: 0 })
    expect(fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/external/tmdb/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Implement**

`src/external/tmdb/client.ts`:

```ts
import { externalTitlesEnabled, tmdbToken } from '../config'

/**
 * The only module that talks to TMDB. Everything goes through `tmdbGet`, so
 * swapping the browser-side token for a server proxy later touches this
 * file alone.
 */

const BASE = 'https://api.themoviedb.org/3'

export class TmdbError extends Error {
  /** HTTP status; 0 when no request was made (switch off, or disabled). */
  status: number

  constructor(status: number) {
    super(`TMDB request failed (${status})`)
    this.status = status
  }
}

// A rejected token won't start working mid-session; stop asking.
let unauthorized = false

export function tmdbAvailable(): boolean {
  return externalTitlesEnabled() && !unauthorized
}

export async function tmdbGet<T>(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  if (!tmdbAvailable()) throw new TmdbError(0)

  const url = new URL(BASE + path)
  url.searchParams.set('language', 'es-MX')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${tmdbToken()}`, Accept: 'application/json' },
    signal,
  })
  if (response.status === 401) {
    unauthorized = true
    console.error('TMDB rejected the token (401); external titles are off for this session.')
  }
  if (!response.ok) throw new TmdbError(response.status)
  return (await response.json()) as T
}

export function resetTmdbClientForTests(): void {
  unauthorized = false
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/external/tmdb/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/external/tmdb/client.ts src/external/tmdb/client.test.ts
git commit -m "feat: add the TMDB client with session-wide 401 shutoff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Snapshot store for played TMDB titles

**Files:**
- Create: `src/external/snapshots.ts`, `src/external/snapshots.test.ts`

**Interfaces:**
- Consumes: `Title` (Task 2), `mapMovie` (Task 3, tests only).
- Produces: `SNAPSHOT_LIMIT = 30`, `saveSnapshot(title: Title, now?: number): void`, `readSnapshot(key: string): Title | null`, `listSnapshots(): Title[]` (newest first).

- [ ] **Step 1: Write the failing tests**

`src/external/snapshots.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listSnapshots, readSnapshot, saveSnapshot, SNAPSHOT_LIMIT } from './snapshots'
import { mapMovie } from './tmdb/map'

const movie = (id: number) => mapMovie({ id, title: `Movie ${id}`, backdrop_path: '/x.jpg' })

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('snapshots', () => {
  it('round-trips a title', () => {
    saveSnapshot(movie(1))
    expect(readSnapshot('tmdb-movie-1')).toEqual(movie(1))
  })

  it('lists newest first', () => {
    saveSnapshot(movie(1), 100)
    saveSnapshot(movie(2), 200)
    expect(listSnapshots().map((t) => t.key)).toEqual(['tmdb-movie-2', 'tmdb-movie-1'])
  })

  it(`keeps only the newest ${SNAPSHOT_LIMIT}`, () => {
    for (let i = 0; i < SNAPSHOT_LIMIT + 2; i++) saveSnapshot(movie(i), i)
    expect(listSnapshots()).toHaveLength(SNAPSHOT_LIMIT)
    expect(readSnapshot('tmdb-movie-0')).toBeNull()
    expect(readSnapshot('tmdb-movie-1')).toBeNull()
    expect(readSnapshot('tmdb-movie-2')).not.toBeNull()
  })

  it('ignores corrupt entries', () => {
    localStorage.setItem('go10:tmdb-title:tmdb-movie-9', '{nope')
    localStorage.setItem('go10:tmdb-title:tmdb-movie-8', JSON.stringify({ savedAt: 1, title: { key: 3 } }))
    expect(listSnapshots()).toEqual([])
    expect(readSnapshot('tmdb-movie-9')).toBeNull()
  })

  it('never throws when storage does', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => saveSnapshot(movie(1))).not.toThrow()
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/external/snapshots.test.ts`
Expected: FAIL — cannot resolve `./snapshots`.

- [ ] **Step 3: Implement**

`src/external/snapshots.ts`:

```ts
import type { Title } from '../types'

/**
 * TMDB titles the viewer has played, kept whole (seasons included) so Home's
 * "Seguir viendo" and next-episode logic can use them without the network.
 * Best-effort like the progress store: storage failures are ignored.
 */

const PREFIX = 'go10:tmdb-title:'
export const SNAPSHOT_LIMIT = 30

interface Snapshot {
  savedAt: number
  title: Title
}

function isSnapshot(value: unknown): value is Snapshot {
  const s = value as Snapshot | null
  return typeof s?.savedAt === 'number' && typeof s.title?.key === 'string' && Array.isArray(s.title.seasons)
}

function parse(raw: string | null): Snapshot | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return isSnapshot(value) ? value : null
  } catch {
    return null
  }
}

function entries(): { storageKey: string; snapshot: Snapshot }[] {
  const found: { storageKey: string; snapshot: Snapshot }[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i)
      if (!storageKey?.startsWith(PREFIX)) continue
      const snapshot = parse(localStorage.getItem(storageKey))
      if (snapshot) found.push({ storageKey, snapshot })
    }
  } catch {
    // ignore
  }
  return found.sort((a, b) => b.snapshot.savedAt - a.snapshot.savedAt)
}

export function saveSnapshot(title: Title, now: number = Date.now()): void {
  try {
    localStorage.setItem(PREFIX + title.key, JSON.stringify({ savedAt: now, title }))
    for (const { storageKey } of entries().slice(SNAPSHOT_LIMIT)) localStorage.removeItem(storageKey)
  } catch {
    // ignore — private mode, quota exceeded, or storage disabled
  }
}

export function readSnapshot(key: string): Title | null {
  try {
    return parse(localStorage.getItem(PREFIX + key))?.title ?? null
  } catch {
    return null
  }
}

export function listSnapshots(): Title[] {
  return entries().map((entry) => entry.snapshot.title)
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/external/snapshots.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/external/snapshots.ts src/external/snapshots.test.ts
git commit -m "feat: remember played TMDB titles for Seguir viendo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Fetching a TMDB title (`fetchTmdbTitle`, `useTmdbTitle`) and test helpers

**Files:**
- Create: `src/external/testing.ts`, `src/external/tmdb/title.ts`, `src/external/useTmdbTitle.ts`, `src/external/useTmdbTitle.test.ts`

**Interfaces:**
- Consumes: `tmdbGet`, `TmdbError` (Task 4); `mapMovie`, `mapShow`, `TmdbMovie`, `TmdbShow`, `TmdbSeason` (Task 3); `parseTmdbKey` (Task 3); `readSnapshot` (Task 5).
- Produces:
  - `enableExternalTitles(): void` and `tmdbFetch(routes, fallback?)` (from `src/external/testing.ts`; tests only)
  - `fetchTmdbTitle(key: string, signal?: AbortSignal): Promise<Title | null>` (null = not found; rejects on other failures)
  - `type TmdbTitleState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; title: Title } | { status: 'not-found' } | { status: 'error' }`
  - `useTmdbTitle(key: string | null): TmdbTitleState`
  - `resetTmdbTitleCacheForTests(): void`

- [ ] **Step 1: Write the test helpers**

`src/external/testing.ts`:

```ts
import { vi } from 'vitest'

/** Turns the external-titles switch on for the current test (undo: `vi.unstubAllEnvs()`). */
export function enableExternalTitles(): void {
  vi.stubEnv('VITE_EXTERNAL_TITLES', 'on')
  vi.stubEnv('VITE_TMDB_TOKEN', 'test-token')
}

type Route = unknown | ((url: URL) => unknown)

/**
 * A `fetch` mock that answers TMDB paths (e.g. `/movie/155`, no `/3`) from
 * `routes` — a value, or a function of the request URL (which may throw to
 * simulate a network failure). Unknown TMDB paths get a 404. Any other URL
 * goes to `fallback`, e.g. the catalog CSV.
 */
export function tmdbFetch(routes: Record<string, Route>, fallback?: (input: string) => Promise<unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.hostname === 'api.themoviedb.org') {
      const route = routes[url.pathname.replace(/^\/3/, '')]
      if (route === undefined) return { ok: false, status: 404, json: async () => ({}) }
      const body = typeof route === 'function' ? (route as (url: URL) => unknown)(url) : route
      return { ok: true, status: 200, json: async () => body }
    }
    if (fallback) return fallback(String(input))
    throw new Error(`unexpected fetch: ${String(input)}`)
  })
}
```

- [ ] **Step 2: Write the failing tests**

`src/external/useTmdbTitle.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { resetTmdbTitleCacheForTests, useTmdbTitle } from './useTmdbTitle'
import { resetTmdbClientForTests } from './tmdb/client'
import { saveSnapshot } from './snapshots'
import { mapMovie, type TmdbMovie } from './tmdb/map'
import { enableExternalTitles, tmdbFetch } from './testing'

const MOVIE: TmdbMovie = { id: 155, title: 'Batman: El caballero de la noche', release_date: '2008-07-16', backdrop_path: '/b.jpg' }

beforeEach(() => {
  enableExternalTitles()
  resetTmdbClientForTests()
  resetTmdbTitleCacheForTests()
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('useTmdbTitle', () => {
  it('is idle without a key', () => {
    const { result } = renderHook(() => useTmdbTitle(null))
    expect(result.current).toEqual({ status: 'idle' })
  })

  it('loads a movie', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ '/movie/155': MOVIE }))
    const { result } = renderHook(() => useTmdbTitle('tmdb-movie-155'))
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.status === 'ready' && result.current.title.title).toBe('Batman: El caballero de la noche')
  })

  it('loads a show with its seasons in batches of 20', async () => {
    const numbers = Array.from({ length: 21 }, (_, i) => i + 1)
    const fetch = tmdbFetch({
      '/tv/7': (url: URL) => {
        const append = url.searchParams.get('append_to_response')
        if (!append) return { id: 7, name: 'Larga', seasons: [{ season_number: 0 }, ...numbers.map((n) => ({ season_number: n }))] }
        const parts = append.split(',')
        expect(parts.length).toBeLessThanOrEqual(20)
        return Object.fromEntries(parts.map((part) => {
          const n = Number(part.split('/')[1])
          return [part, { season_number: n, episodes: [{ season_number: n, episode_number: 1, name: `E${n}`, air_date: '2000-01-01' }] }]
        }))
      },
    })
    vi.stubGlobal('fetch', fetch)

    const { result } = renderHook(() => useTmdbTitle('tmdb-tv-7'))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.status === 'ready' && result.current.title.seasons).toHaveLength(21)
    expect(fetch).toHaveBeenCalledTimes(3) // details + two season batches
  })

  it('is not-found on 404', async () => {
    vi.stubGlobal('fetch', tmdbFetch({}))
    const { result } = renderHook(() => useTmdbTitle('tmdb-movie-404'))
    await waitFor(() => expect(result.current.status).toBe('not-found'))
  })

  it('is not-found, without fetching, for a key it cannot parse', async () => {
    const fetch = tmdbFetch({})
    vi.stubGlobal('fetch', fetch)
    const { result } = renderHook(() => useTmdbTitle('tmdb-person-3'))
    await waitFor(() => expect(result.current.status).toBe('not-found'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is error on a network failure', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ '/movie/155': () => { throw new TypeError('offline') } }))
    const { result } = renderHook(() => useTmdbTitle('tmdb-movie-155'))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('serves a snapshot at once, and keeps it while TMDB is unreachable', async () => {
    saveSnapshot(mapMovie(MOVIE))
    const fetch = tmdbFetch({ '/movie/155': () => { throw new TypeError('offline') } })
    vi.stubGlobal('fetch', fetch)

    const { result } = renderHook(() => useTmdbTitle('tmdb-movie-155'))
    expect(result.current.status).toBe('ready')
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(result.current.status).toBe('ready')
  })

  it('does not refetch a title already loaded this session', async () => {
    const fetch = tmdbFetch({ '/movie/155': MOVIE })
    vi.stubGlobal('fetch', fetch)

    const first = renderHook(() => useTmdbTitle('tmdb-movie-155'))
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    first.unmount()

    const second = renderHook(() => useTmdbTitle('tmdb-movie-155'))
    expect(second.result.current.status).toBe('ready')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run src/external/useTmdbTitle.test.ts`
Expected: FAIL — cannot resolve `./useTmdbTitle`.

- [ ] **Step 4: Implement**

`src/external/tmdb/title.ts`:

```ts
import type { Title } from '../../types'
import { TmdbError, tmdbGet } from './client'
import { parseTmdbKey } from './keys'
import { mapMovie, mapShow, type TmdbMovie, type TmdbSeason, type TmdbShow } from './map'

/** TMDB caps `append_to_response` at 20 sub-requests. */
const SEASONS_PER_CALL = 20

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function fetchSeasons(id: number, numbers: number[], signal?: AbortSignal): Promise<TmdbSeason[]> {
  const batches: number[][] = []
  for (let i = 0; i < numbers.length; i += SEASONS_PER_CALL) batches.push(numbers.slice(i, i + SEASONS_PER_CALL))

  const responses = await Promise.all(
    batches.map((batch) =>
      tmdbGet<Record<string, TmdbSeason | undefined>>(
        `/tv/${id}`,
        { append_to_response: batch.map((n) => `season/${n}`).join(',') },
        signal,
      ).then((response) => batch.map((n) => response[`season/${n}`])),
    ),
  )
  return responses.flat().filter((season): season is TmdbSeason => Boolean(season))
}

/** The full title behind a `tmdb-*` key; null when TMDB doesn't know it. */
export async function fetchTmdbTitle(key: string, signal?: AbortSignal): Promise<Title | null> {
  const parsed = parseTmdbKey(key)
  if (!parsed) return null
  try {
    if (parsed.media === 'movie') return mapMovie(await tmdbGet<TmdbMovie>(`/movie/${parsed.id}`, {}, signal))

    const show = await tmdbGet<TmdbShow>(`/tv/${parsed.id}`, {}, signal)
    const numbers = (show.seasons ?? []).map((s) => s.season_number).filter((n) => n > 0)
    return mapShow(show, await fetchSeasons(parsed.id, numbers, signal), today())
  } catch (error) {
    if (error instanceof TmdbError && error.status === 404) return null
    throw error
  }
}
```

`src/external/useTmdbTitle.ts`:

```ts
import { useEffect, useState } from 'react'
import type { Title } from '../types'
import { fetchTmdbTitle } from './tmdb/title'
import { readSnapshot } from './snapshots'

export type TmdbTitleState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; title: Title }
  | { status: 'not-found' }
  | { status: 'error' }

const SESSION_PREFIX = 'go10:tmdb-cache:'

// Loaded this session: served without asking TMDB again.
const memory = new Map<string, Title>()

function fresh(key: string): Title | null {
  const cached = memory.get(key)
  if (cached) return cached
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key)
    if (!raw) return null
    const title = JSON.parse(raw) as Title
    memory.set(key, title)
    return title
  } catch {
    return null
  }
}

function remember(title: Title): void {
  memory.set(title.key, title)
  try {
    sessionStorage.setItem(SESSION_PREFIX + title.key, JSON.stringify(title))
  } catch {
    // ignore
  }
}

function initial(key: string | null): TmdbTitleState {
  if (!key) return { status: 'idle' }
  const title = fresh(key) ?? readSnapshot(key)
  return title ? { status: 'ready', title } : { status: 'loading' }
}

/**
 * The TMDB title behind a `tmdb-*` key. Served at once from this session's
 * cache or a snapshot of a played title; a snapshot is then refreshed in the
 * background, and stays on screen if TMDB can't be reached.
 */
export function useTmdbTitle(key: string | null): TmdbTitleState {
  const [entry, setEntry] = useState(() => ({ key, state: initial(key) }))

  useEffect(() => {
    if (!key) return
    const cached = fresh(key)
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
          remember(title)
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

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/external/useTmdbTitle.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/external/testing.ts src/external/tmdb/title.ts src/external/useTmdbTitle.ts src/external/useTmdbTitle.test.ts
git commit -m "feat: load TMDB titles by key, with session cache and snapshot fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: TMDB search and its hook

**Files:**
- Create: `src/external/tmdb/search.ts`, `src/external/useTmdbSearch.ts`, `src/external/useTmdbSearch.test.ts`

**Interfaces:**
- Consumes: `tmdbGet`, `tmdbAvailable` (Task 4); `mapSearchResult`, `TmdbSearchResult`, `TmdbGenre` (Task 3); `Section` from `src/catalog/selectTitles.ts`; `normalize` from `src/search/search.ts`; `enableExternalTitles`, `tmdbFetch` (Task 6).
- Produces:
  - `searchTmdb(query: string, section: Section, signal?: AbortSignal): Promise<Title[]>`
  - `SEARCH_DEBOUNCE_MS = 400`, `SEARCH_MIN_CHARS = 2`
  - `type TmdbSearchState = { status: 'off' | 'pending' | 'done' | 'failed'; titles: Title[] }`
  - `useTmdbSearch(query: string, section: Section, enabled: boolean): TmdbSearchState`
  - `resetTmdbSearchForTests(): void` (clears the genre and result caches)

- [ ] **Step 1: Write the failing tests**

`src/external/useTmdbSearch.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { resetTmdbSearchForTests, useTmdbSearch } from './useTmdbSearch'
import { resetTmdbClientForTests } from './tmdb/client'
import { enableExternalTitles, tmdbFetch } from './testing'

const GENRES = {
  '/genre/movie/list': { genres: [{ id: 28, name: 'Acción' }] },
  '/genre/tv/list': { genres: [{ id: 18, name: 'Drama' }] },
}
const BATMAN = { id: 155, media_type: 'movie', title: 'Batman', genre_ids: [28], backdrop_path: '/b.jpg' }
const BB = { id: 1396, name: 'Breaking Bad', genre_ids: [18], poster_path: '/p.jpg' }

const searchCalls = (fetch: ReturnType<typeof tmdbFetch>) =>
  fetch.mock.calls.filter(([input]) => String(input).includes('/search/'))

beforeEach(() => {
  enableExternalTitles()
  resetTmdbClientForTests()
  resetTmdbSearchForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('useTmdbSearch', () => {
  it('searches everything with search/multi and maps the hits', async () => {
    const fetch = tmdbFetch({ ...GENRES, '/search/multi': { results: [BATMAN, { id: 9, media_type: 'person', name: 'X' }] } })
    vi.stubGlobal('fetch', fetch)

    const { result } = renderHook(() => useTmdbSearch('batman', 'all', true))
    expect(result.current.status).toBe('pending')
    await waitFor(() => expect(result.current.status).toBe('done'))
    expect(result.current.titles.map((t) => [t.key, t.genre])).toEqual([['tmdb-movie-155', 'Acción']])

    const url = new URL(String(searchCalls(fetch)[0][0]))
    expect(url.searchParams.get('query')).toBe('batman')
    expect(url.searchParams.get('include_adult')).toBe('false')
  })

  it('uses the section endpoint, typing results by it', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/tv': { results: [BB] } }))
    const { result } = renderHook(() => useTmdbSearch('breaking', 'show', true))
    await waitFor(() => expect(result.current.status).toBe('done'))
    expect(result.current.titles[0]).toMatchObject({ key: 'tmdb-tv-1396', kind: 'show', genre: 'Drama' })
  })

  it('is off when disabled, or for fewer than 2 characters, without fetching', async () => {
    const fetch = tmdbFetch(GENRES)
    vi.stubGlobal('fetch', fetch)
    expect(renderHook(() => useTmdbSearch('batman', 'all', false)).result.current.status).toBe('off')
    expect(renderHook(() => useTmdbSearch(' b ', 'all', true)).result.current.status).toBe('off')
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is off while the switch is off', () => {
    vi.stubEnv('VITE_EXTERNAL_TITLES', 'off')
    expect(renderHook(() => useTmdbSearch('batman', 'all', true)).result.current.status).toBe('off')
  })

  it('debounces a burst of typing into one request', async () => {
    const fetch = tmdbFetch({ ...GENRES, '/search/multi': { results: [BATMAN] } })
    vi.stubGlobal('fetch', fetch)

    const { result, rerender } = renderHook(({ q }) => useTmdbSearch(q, 'all', true), { initialProps: { q: 'ba' } })
    rerender({ q: 'bat' })
    rerender({ q: 'batm' })
    await waitFor(() => expect(result.current.status).toBe('done'))
    expect(searchCalls(fetch)).toHaveLength(1)
    expect(new URL(String(searchCalls(fetch)[0][0])).searchParams.get('query')).toBe('batm')
  })

  it('reports a failure', async () => {
    vi.stubGlobal('fetch', tmdbFetch(GENRES)) // no /search/multi route -> 404
    const { result } = renderHook(() => useTmdbSearch('batman', 'all', true))
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(result.current.titles).toEqual([])
  })

  it('serves a repeated query from cache', async () => {
    const fetch = tmdbFetch({ ...GENRES, '/search/multi': { results: [BATMAN] } })
    vi.stubGlobal('fetch', fetch)
    const first = renderHook(() => useTmdbSearch('batman', 'all', true))
    await waitFor(() => expect(first.result.current.status).toBe('done'))
    first.unmount()

    const second = renderHook(() => useTmdbSearch('Batman ', 'all', true))
    expect(second.result.current.status).toBe('done')
    expect(searchCalls(fetch)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/external/useTmdbSearch.test.ts`
Expected: FAIL — cannot resolve `./useTmdbSearch`.

- [ ] **Step 3: Implement**

`src/external/tmdb/search.ts`:

```ts
import type { Title } from '../../types'
import type { Section } from '../../catalog/selectTitles'
import { tmdbGet } from './client'
import type { TmdbMedia } from './keys'
import { mapSearchResult, type TmdbGenre, type TmdbSearchResult } from './map'

const ENDPOINTS: Record<Section, string> = { all: '/search/multi', movie: '/search/movie', show: '/search/tv' }
/** `search/movie` and `search/tv` results carry no `media_type`. */
const MEDIA: Record<Section, TmdbMedia | undefined> = { all: undefined, movie: 'movie', show: 'tv' }

let genres: Promise<Map<number, string>> | null = null

/** Genre id → es-MX name, movie and TV lists merged; fetched once per session. */
function genreNames(): Promise<Map<number, string>> {
  // Deliberately not abortable: it's shared by every search.
  genres ??= Promise.all([
    tmdbGet<{ genres: TmdbGenre[] }>('/genre/movie/list'),
    tmdbGet<{ genres: TmdbGenre[] }>('/genre/tv/list'),
  ])
    .then(([movie, tv]) => new Map([...movie.genres, ...tv.genres].map((g) => [g.id, g.name])))
    .catch((error: unknown) => {
      genres = null
      throw error
    })
  return genres
}

/** First page of TMDB hits for a query, as card-only titles. */
export async function searchTmdb(query: string, section: Section, signal?: AbortSignal): Promise<Title[]> {
  const [names, page] = await Promise.all([
    genreNames(),
    tmdbGet<{ results: TmdbSearchResult[] }>(
      ENDPOINTS[section],
      { query, include_adult: 'false', page: '1' },
      signal,
    ),
  ])
  return page.results
    .map((result) => mapSearchResult(result, names, MEDIA[section]))
    .filter((title): title is Title => title !== null)
}

export function resetGenresForTests(): void {
  genres = null
}
```

`src/external/useTmdbSearch.ts`:

```ts
import { useEffect, useState } from 'react'
import type { Title } from '../types'
import type { Section } from '../catalog/selectTitles'
import { normalize } from '../search/search'
import { tmdbAvailable } from './tmdb/client'
import { resetGenresForTests, searchTmdb } from './tmdb/search'

export const SEARCH_DEBOUNCE_MS = 400
export const SEARCH_MIN_CHARS = 2

export interface TmdbSearchState {
  status: 'off' | 'pending' | 'done' | 'failed'
  titles: Title[]
}

const OFF: TmdbSearchState = { status: 'off', titles: [] }
const PENDING: TmdbSearchState = { status: 'pending', titles: [] }
const FAILED: TmdbSearchState = { status: 'failed', titles: [] }

// Per query and section, for the session: re-typing a query costs nothing.
const cache = new Map<string, Title[]>()

/**
 * TMDB hits for the search box, waiting for typing to settle. `enabled` is
 * the caller's say (e.g. "Solo catálogo" turns it off); the switch and a
 * rejected token turn it off regardless.
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
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // `trimmed` and `section` are folded into `cacheKey`.
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

Note on the cache key: `normalize` lowercases and strips accents/punctuation, so "Batman " and "batman" share an entry. The request itself sends the trimmed query as typed.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/external/useTmdbSearch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/external/tmdb/search.ts src/external/useTmdbSearch.ts src/external/useTmdbSearch.test.ts
git commit -m "feat: debounced TMDB search hook scoped by section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `solo=catalogo` route param and the navbar source chip

**Files:**
- Modify: `src/router/route.ts`, `src/components/Navbar.tsx`
- Create: `src/router/route.external.test.ts`, `src/components/Navbar.external.test.tsx`

**Interfaces:**
- Consumes: `externalTitlesEnabled()` (Task 2), `enableExternalTitles()` (Task 6).
- Produces: `Route` catalog variant `{ name: 'catalog'; section: Section; query: string; catalogOnly?: true }`; URL `&solo=catalogo`; navbar chip `nav:source` at `NAV_ROW`, col 4.

- [ ] **Step 1: Write the failing tests**

`src/router/route.external.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseRoute, routeToPath } from './route'
import { enableExternalTitles } from '../external/testing'

afterEach(() => vi.unstubAllEnvs())

describe('catalog-only search', () => {
  it('parses solo=catalogo while external titles are on', () => {
    enableExternalTitles()
    expect(parseRoute('/buscar', '?q=batman&solo=catalogo')).toEqual({
      name: 'catalog', section: 'all', query: 'batman', catalogOnly: true,
    })
  })

  it('writes it back after the section scope', () => {
    expect(routeToPath({ name: 'catalog', section: 'movie', query: 'batman', catalogOnly: true })).toBe(
      '/buscar?q=batman&en=peliculas&solo=catalogo',
    )
  })

  it('drops it with a blank query', () => {
    enableExternalTitles()
    expect(parseRoute('/buscar', '?q=&solo=catalogo')).toEqual({ name: 'home' })
  })

  it('ignores it while external titles are off', () => {
    expect(parseRoute('/buscar', '?q=batman&solo=catalogo')).toEqual({ name: 'catalog', section: 'all', query: 'batman' })
  })
})
```

`src/components/Navbar.external.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { Navbar } from './Navbar'
import { FocusProvider } from '../focus/FocusProvider'
import { useFocusable } from '../focus/useFocusable'
import type { Route } from '../router/route'
import { enableExternalTitles } from '../external/testing'

function Result() {
  const { ref, focused } = useFocusable('grid:a', 0, 0, () => {})
  return <div ref={ref} tabIndex={-1} data-testid="grid:a" data-focused={focused} />
}

function Harness({ initial, spy }: { initial: Route; spy?: (route: Route, options?: { replace?: boolean }) => void }) {
  const [route, setRoute] = useState<Route>(initial)
  const onNavigate = (next: Route, options?: { replace?: boolean }) => {
    spy?.(next, options)
    setRoute(next)
  }
  return (
    <FocusProvider onBack={() => {}}>
      <Navbar route={route} onNavigate={onNavigate} />
      <Result />
    </FocusProvider>
  )
}

const input = () => screen.getByRole('searchbox') as HTMLInputElement

afterEach(() => vi.unstubAllEnvs())

describe('Navbar source chip (external titles on)', () => {
  beforeEach(() => enableExternalTitles())

  it('toggles between Todo and Solo catálogo in place', () => {
    const spy = vi.fn()
    render(<Harness initial={{ name: 'catalog', section: 'all', query: 'bat' }} spy={spy} />)

    fireEvent.click(screen.getByText('Todo'))
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'all', query: 'bat', catalogOnly: true }, { replace: true })

    fireEvent.click(screen.getByText('Solo catálogo'))
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'all', query: 'bat' }, { replace: true })
  })

  it('keeps catalog-only while typing and when the section chip is removed', () => {
    const spy = vi.fn()
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: 'bat', catalogOnly: true }} spy={spy} />)

    fireEvent.click(input())
    fireEvent.change(input(), { target: { value: 'batm' } })
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'movie', query: 'batm', catalogOnly: true }, { replace: true })

    fireEvent.click(screen.getByLabelText('Quitar filtro Películas'))
    expect(spy).toHaveBeenLastCalledWith({ name: 'catalog', section: 'all', query: 'batm', catalogOnly: true }, { replace: true })
  })

  it('still sends Enter from the search box to the first result, not the chip', () => {
    render(<Harness initial={{ name: 'catalog', section: 'all', query: 'bat' }} />)
    fireEvent.click(input())
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByTestId('grid:a').dataset.focused).toBe('true')
  })

  it('has no chip without a query', () => {
    render(<Harness initial={{ name: 'catalog', section: 'movie', query: '' }} />)
    expect(screen.queryByText('Todo')).toBeNull()
  })
})

describe('Navbar source chip (external titles off)', () => {
  it('is never shown', () => {
    render(<Harness initial={{ name: 'catalog', section: 'all', query: 'bat' }} />)
    expect(screen.queryByText('Todo')).toBeNull()
    expect(screen.queryByText('Solo catálogo')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/router/route.external.test.ts src/components/Navbar.external.test.tsx`
Expected: FAIL — `catalogOnly` missing from the parsed route; no "Todo" chip.

- [ ] **Step 3: Implement the route param**

In `src/router/route.ts`:

1. Add `import { externalTitlesEnabled } from '../external/config'`.
2. Change the catalog variant of `Route` to:

```ts
  | { name: 'catalog'; section: Section; query: string; catalogOnly?: true }
```

3. In `parseRoute`, replace the `/buscar` branch body with:

```ts
    const params = new URLSearchParams(search)
    const section = sectionFromSlug(params.get('en'))
    const query = params.get('q') ?? ''
    // "Solo catálogo" only means something while external titles exist.
    const catalogOnly = externalTitlesEnabled() && params.get('solo') === 'catalogo'
    // A blank search is just the section it was scoped to.
    if (query.trim() === '') return browseRoute(section)
    return catalogOnly ? { name: 'catalog', section, query, catalogOnly: true } : { name: 'catalog', section, query }
```

4. In `routeToPath`'s `catalog` case, after `if (route.section !== 'all') params.set(...)`, add:

```ts
      if (route.catalogOnly) params.set('solo', 'catalogo')
```

- [ ] **Step 4: Implement the chip**

In `src/components/Navbar.tsx`:

1. Add `import { externalTitlesEnabled } from '../external/config'`.
2. After `const isBrowsing = …`, add:

```ts
  const catalogOnly = route.name === 'catalog' && route.catalogOnly === true
  // Carried through every search navigation, like the section scope.
  const scope = catalogOnly ? { catalogOnly: true as const } : {}
```

3. In `onQueryChange`, change the search navigation to `onNavigate({ name: 'catalog', section, query: value, ...scope }, { replace: hasQuery })`.
4. In the section scope chip's `onSelect`, change the navigation to `onNavigate({ name: 'catalog', section: 'all', query, ...scope }, { replace: true })`.
5. Right after the `<SearchBox … />` element (before the `go-nav_cancel` button), add:

```tsx
        {hasQuery && externalTitlesEnabled() && (
          // In the navbar, not above the grid: Enter/Down from the search box
          // must keep landing on the first result.
          <NavButton
            id="nav:source"
            col={4}
            className="go-nav_scope go-nav_source"
            ariaLabel={catalogOnly ? 'Buscar en todo' : 'Buscar solo en el catálogo'}
            onSelect={() =>
              onNavigate(
                catalogOnly ? { name: 'catalog', section, query } : { name: 'catalog', section, query, catalogOnly: true },
                { replace: true },
              )
            }
          >
            {catalogOnly ? 'Solo catálogo' : 'Todo'}
          </NavButton>
        )}
```

The chip reuses `.go-nav_scope` styling; no CSS change is needed.

- [ ] **Step 5: Run the new tests and the whole suite**

Run: `npx vitest run src/router src/components && npm test`
Expected: PASS, including the unchanged `route.test.ts` and `Navbar.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/router/route.ts src/router/route.external.test.ts src/components/Navbar.tsx src/components/Navbar.external.test.tsx
git commit -m "feat: add the Todo / Solo catálogo search chip and solo=catalogo param

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Merge TMDB results into the catalog grid

**Files:**
- Create: `src/external/mergeSearch.ts`, `src/external/mergeSearch.test.ts`, `src/screens/Catalog.external.test.tsx`
- Modify: `src/screens/Catalog.tsx`, `src/screens/Catalog.css`, `src/components/Card.tsx`, `src/App.tsx` (pass `catalogOnly`)

**Interfaces:**
- Consumes: `selectTitles`, `CatalogMode` (existing); `useTmdbSearch`, `TmdbSearchState`, `resetTmdbSearchForTests` (Task 7); `externalTitlesEnabled` (Task 2); test helpers (Task 6).
- Produces: `type SearchMode = CatalogMode | 'searching'`; `mergeSearch(selection: { titles: Title[]; mode: CatalogMode }, tmdb: TmdbSearchState): { titles: Title[]; mode: SearchMode; external: boolean }`; `Catalog` prop `catalogOnly?: boolean`.

- [ ] **Step 1: Write the failing tests**

`src/external/mergeSearch.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mergeSearch } from './mergeSearch'
import type { Title } from '../types'
import type { TmdbSearchState } from './useTmdbSearch'

const t = (key: string) => ({ key, title: key }) as Title
const catalog = [t('c1'), t('c2')]
const tmdb = (status: TmdbSearchState['status'], titles: Title[] = []): TmdbSearchState => ({ status, titles })

describe('mergeSearch', () => {
  it('leaves browsing and switched-off searches alone', () => {
    expect(mergeSearch({ titles: catalog, mode: 'browse' }, tmdb('off'))).toEqual({ titles: catalog, mode: 'browse', external: false })
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('off'))).toEqual({ titles: catalog, mode: 'results', external: false })
  })

  it('appends TMDB hits after catalog matches', () => {
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('done', [t('x')]))).toEqual({
      titles: [...catalog, t('x')], mode: 'results', external: true,
    })
  })

  it('keeps catalog matches alone while TMDB is pending or failed', () => {
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('pending')).titles).toEqual(catalog)
    expect(mergeSearch({ titles: catalog, mode: 'results' }, tmdb('failed')).titles).toEqual(catalog)
  })

  it('waits instead of flashing suggestions', () => {
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('pending'))).toEqual({ titles: [], mode: 'searching', external: false })
  })

  it('shows TMDB hits as results when the catalog had none', () => {
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('done', [t('x')]))).toEqual({ titles: [t('x')], mode: 'results', external: true })
  })

  it('falls back to suggestions when TMDB is empty or failed', () => {
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('done'))).toEqual({ titles: catalog, mode: 'suggestions', external: false })
    expect(mergeSearch({ titles: catalog, mode: 'suggestions' }, tmdb('failed'))).toEqual({ titles: catalog, mode: 'suggestions', external: false })
  })
})
```

`src/screens/Catalog.external.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Catalog } from './Catalog'
import { FocusProvider } from '../focus/FocusProvider'
import type { Title } from '../types'
import type { Section } from '../catalog/selectTitles'
import { resetTmdbClientForTests } from '../external/tmdb/client'
import { resetTmdbSearchForTests } from '../external/useTmdbSearch'
import { enableExternalTitles, tmdbFetch } from '../external/testing'

function title(key: string, name: string): Title {
  return {
    key, kind: 'movie', title: name, year: null, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, thumbnail: '', views: 0,
    durationSeconds: 0, catalogIndex: 0, seasons: [],
  }
}

const CATALOG = [title('m0', 'Batman Returns')]
const GENRES = { '/genre/movie/list': { genres: [] }, '/genre/tv/list': { genres: [] } }
const DARK_KNIGHT = { id: 155, media_type: 'movie', title: 'Batman: El caballero de la noche', backdrop_path: '/b.jpg' }
const BREAKING_BAD = { id: 1396, media_type: 'tv', name: 'Breaking Bad', poster_path: '/p.jpg' }

function renderSearch(query: string, { section = 'all' as Section, catalogOnly = false } = {}) {
  return render(
    <FocusProvider onBack={() => {}}>
      <Catalog titles={CATALOG} section={section} query={query} catalogOnly={catalogOnly} onSelect={() => {}} />
    </FocusProvider>,
  )
}

const cardNames = () => Array.from(document.querySelectorAll('.go-card_name')).map((n) => n.textContent)

beforeEach(() => {
  enableExternalTitles()
  resetTmdbClientForTests()
  resetTmdbSearchForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Catalog with external titles', () => {
  it('appends TMDB results after catalog matches, with the TMDB credit', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/multi': { results: [DARK_KNIGHT, BREAKING_BAD] } }))
    renderSearch('batman')

    expect(cardNames()).toEqual(['Batman Returns'])
    expect(screen.queryByText('Datos de títulos: TMDB')).toBeNull()

    await screen.findByText('Batman: El caballero de la noche')
    expect(cardNames()).toEqual(['Batman Returns', 'Batman: El caballero de la noche', 'Breaking Bad'])
    expect(screen.getByText('Datos de títulos: TMDB')).not.toBeNull()
  })

  it('keeps focus on the catalog card when TMDB results arrive', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/multi': { results: [DARK_KNIGHT] } }))
    renderSearch('batman')
    expect(screen.getByLabelText('Batman Returns').dataset.focused).toBe('true')
    await screen.findByText('Batman: El caballero de la noche')
    expect(screen.getByLabelText('Batman Returns').dataset.focused).toBe('true')
  })

  it('shows Buscando… rather than suggestions while TMDB is pending, then its results', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/multi': { results: [BREAKING_BAD] } }))
    renderSearch('breaking')

    expect(screen.getByText('Buscando…')).not.toBeNull()
    expect(screen.queryByText('Quizás te interese')).toBeNull()

    await screen.findByText('Breaking Bad')
    expect(screen.getByRole('heading', { name: /Resultados para "breaking"/ })).not.toBeNull()
  })

  it('does not label a TMDB show "0 Temporadas"', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/multi': { results: [BREAKING_BAD] } }))
    renderSearch('breaking')
    await screen.findByText('Breaking Bad')
    expect(screen.queryByText(/0 Temporadas/)).toBeNull()
  })

  it('falls back to suggestions when TMDB has nothing or fails', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/multi': { results: [] } }))
    renderSearch('zzzz')
    await screen.findByText('Quizás te interese')

    vi.stubGlobal('fetch', tmdbFetch(GENRES)) // search 404s
    renderSearch('yyyy')
    expect(await screen.findAllByText('Quizás te interese')).toHaveLength(2)
  })

  it('makes no TMDB request with Solo catálogo', async () => {
    const fetch = tmdbFetch({ ...GENRES, '/search/multi': { results: [BREAKING_BAD] } })
    vi.stubGlobal('fetch', fetch)
    renderSearch('breaking', { catalogOnly: true })

    expect(screen.getByText('Quizás te interese')).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(fetch).not.toHaveBeenCalled()
  })

  it("searches the section's endpoint", async () => {
    vi.stubGlobal('fetch', tmdbFetch({ ...GENRES, '/search/tv': { results: [{ ...BREAKING_BAD, media_type: undefined }] } }))
    renderSearch('breaking', { section: 'show' })
    await screen.findByText('Breaking Bad')
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/external/mergeSearch.test.ts src/screens/Catalog.external.test.tsx`
Expected: FAIL — cannot resolve `./mergeSearch`; Catalog shows no TMDB cards.

- [ ] **Step 3: Implement `mergeSearch`**

`src/external/mergeSearch.ts`:

```ts
import type { Title } from '../types'
import type { CatalogMode } from '../catalog/selectTitles'
import type { TmdbSearchState } from './useTmdbSearch'

/** `searching`: nothing in the catalog matched and TMDB hasn't answered yet. */
export type SearchMode = CatalogMode | 'searching'

/**
 * The grid for a search: catalog matches first, TMDB hits appended after
 * them — appending never moves a card already on screen, or the focus on it.
 * Catalog "suggestions" (fuzzy near-misses) only show once TMDB has nothing.
 */
export function mergeSearch(
  selection: { titles: Title[]; mode: CatalogMode },
  tmdb: TmdbSearchState,
): { titles: Title[]; mode: SearchMode; external: boolean } {
  const none = { ...selection, external: false }
  if (selection.mode === 'browse' || tmdb.status === 'off') return none

  if (selection.mode === 'results') {
    if (tmdb.status !== 'done' || tmdb.titles.length === 0) return none
    return { titles: [...selection.titles, ...tmdb.titles], mode: 'results', external: true }
  }

  if (tmdb.status === 'pending') return { titles: [], mode: 'searching', external: false }
  if (tmdb.status === 'done' && tmdb.titles.length > 0) return { titles: tmdb.titles, mode: 'results', external: true }
  return none
}
```

- [ ] **Step 4: Wire it into `Catalog`, `Card` and `App`**

In `src/screens/Catalog.tsx`:

1. Add imports:

```ts
import { externalTitlesEnabled } from '../external/config'
import { useTmdbSearch } from '../external/useTmdbSearch'
import { mergeSearch, type SearchMode } from '../external/mergeSearch'
```

2. Change `heading` to take `SearchMode`:

```ts
function heading(mode: SearchMode, section: Section, query: string) {
  if (mode === 'results' || mode === 'searching') return `Resultados para "${query.trim()}"`
  if (mode === 'suggestions') return `Sin resultados para "${query.trim()}"`
  return SECTION_LABELS[section]
}
```

3. Replace the `Catalog` component with:

```tsx
export function Catalog({
  titles,
  section,
  query,
  catalogOnly = false,
  onSelect,
}: {
  titles: Title[]
  section: Section
  query: string
  /** "Solo catálogo": skip TMDB for this search. */
  catalogOnly?: boolean
  onSelect: (title: Title) => void
}) {
  const selection = useMemo(() => selectTitles(titles, section, query), [titles, section, query])
  const tmdb = useTmdbSearch(query, section, externalTitlesEnabled() && !catalogOnly && selection.mode !== 'browse')
  const shown = mergeSearch(selection, tmdb)

  return (
    <div className="go-catalog">
      <header className="go-catalog_head">
        <h1 className="go-catalog_title">
          {heading(shown.mode, section, query)}
          {(shown.mode === 'results' || shown.mode === 'browse') && (
            <span className="go-row_count">{shown.titles.length}</span>
          )}
        </h1>
        {shown.mode === 'suggestions' && <p className="go-catalog_sub">Quizás te interese</p>}
      </header>

      {shown.mode === 'searching' ? (
        <p className="go-catalog_empty">Buscando…</p>
      ) : shown.titles.length === 0 ? (
        <p className="go-catalog_empty">No hay títulos.</p>
      ) : (
        // Keyed so a new filter starts again from the first batch.
        <CatalogGrid key={`${section}|${query.trim()}`} titles={shown.titles} onSelect={onSelect} />
      )}

      {/* TMDB's API terms require the credit wherever its data is shown. */}
      {shown.external && <p className="go-catalog_credit">Datos de títulos: TMDB</p>}
    </div>
  )
}
```

With the switch off, `tmdb.status` is `'off'`, so `mergeSearch` returns the selection unchanged and the rendered output is identical to before.

4. Append to `src/screens/Catalog.css`:

```css
/* TMDB attribution, as quiet as the Detail hint line. */
.go-catalog_credit {
  margin: 0 var(--go-safe-x) 1.5rem;
  font-family: var(--go-font-mono);
  font-size: var(--go-size-meta);
  letter-spacing: 0.08em;
  color: var(--go-text-muted);
  opacity: 0.7;
}
```

5. In `src/components/Card.tsx`, change the show tag condition from `title.kind === 'show' && (` to:

```tsx
          {title.kind === 'show' && seasons > 0 && (
```

(Catalog shows always have at least one season; a TMDB search hit has none until Detail loads it.)

6. In `src/App.tsx`, pass the route's flag to `Catalog`:

```tsx
            <Catalog
              titles={titles}
              section={resolved.section}
              query={resolved.query}
              catalogOnly={route.name === 'catalog' && route.catalogOnly === true}
              onSelect={openTitle}
            />
```

- [ ] **Step 5: Run the new tests and the whole suite**

Run: `npx vitest run src/external/mergeSearch.test.ts src/screens/Catalog.external.test.tsx && npm test`
Expected: PASS, including the unchanged `Catalog.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/external/mergeSearch.ts src/external/mergeSearch.test.ts src/screens/Catalog.tsx src/screens/Catalog.css src/screens/Catalog.external.test.tsx src/components/Card.tsx src/App.tsx
git commit -m "feat: append TMDB search results after catalog matches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Player provider adapters (ok.ru extracted, vidlove added)

**Files:**
- Create: `src/screens/providers/types.ts`, `src/screens/providers/okru.ts`, `src/screens/providers/vidlove.ts`, `src/screens/providers/index.ts`, `src/screens/providers/vidlove.test.ts`, `src/screens/Player.vidlove.test.tsx`
- Modify: `src/screens/Player.tsx`

**Interfaces:**
- Consumes: `buildEmbedSrc` (existing `src/screens/embedSrc.ts`), `parseTmdbKey` (Task 3), `CatalogRow.external` (Task 2), `writeProgress` (existing).
- Produces: `EmbedProvider`, `PlayerEvent` (types.ts); `okru`, `vidlove` providers; `providerFor(row: CatalogRow): EmbedProvider`.

Apply Task 1's findings here: if the sandboxed player didn't play, set `sandbox: undefined` in `vidlove.ts` and drop the sandbox assertion below. Remove any `PARAMS` entry the user found ineffective, and update the matching assertion.

- [ ] **Step 1: Write the failing tests**

`src/screens/providers/vidlove.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { vidlove } from './vidlove'
import type { CatalogRow } from '../../types'

const episode = {
  video_id: 'tmdb-tv-1396-s1e2', type: 'episode', season_number: 1, episode_number: 2,
  embed_url: 'https://player.vidlove.cc/embed/tv/1396/1/2',
} as CatalogRow
const movie = { video_id: 'tmdb-movie-155', type: 'movie', season_number: null, episode_number: null, embed_url: 'https://player.vidlove.cc/embed/movie/155' } as CatalogRow
const event = (name: string, extra: Record<string, unknown> = {}) => ({
  type: 'PLAYER_EVENT', data: { event: name, tmdbId: 1396, mediaType: 'tv', season: 1, episode: 2, ...extra },
})

describe('vidlove provider', () => {
  it('adds our options to the embed and never uses a start time', () => {
    const src = new URL(vidlove.src(episode, 600))
    expect(src.origin + src.pathname).toBe('https://player.vidlove.cc/embed/tv/1396/1/2')
    expect(Object.fromEntries(src.searchParams)).toEqual({
      autoplay: 'true', primarycolor: 'c6f24e', secondarycolor: '08090c', iconcolor: 'f2f4f0',
      autonext: 'false', episodelist: 'false', showNextEpisode: 'false',
    })
  })

  it('parses time, pause and ended', () => {
    expect(vidlove.parse(event('timeupdate', { currentTime: 12.5, duration: 2800 }), episode)).toEqual({ kind: 'time', time: 12.5, duration: 2800 })
    expect(vidlove.parse(event('pause'), episode)).toEqual({ kind: 'paused' })
    expect(vidlove.parse(event('ended', { currentTime: 2800 }), episode)).toEqual({ kind: 'ended', time: 2800 })
  })

  it('ignores other messages and other titles or episodes', () => {
    expect(vidlove.parse({ event: 'timeupdate', time: 1 }, episode)).toBeNull()
    expect(vidlove.parse(event('fullscreen-enter'), episode)).toBeNull()
    expect(vidlove.parse(event('timeupdate', { currentTime: 1, tmdbId: 99 }), episode)).toBeNull()
    expect(vidlove.parse(event('timeupdate', { currentTime: 1, episode: 1 }), episode)).toBeNull()
    expect(vidlove.parse(event('timeupdate', { currentTime: 1, season: 2 }), episode)).toBeNull()
  })

  it('does not check seasons for a movie', () => {
    expect(vidlove.parse(event('timeupdate', { currentTime: 1, tmdbId: 155, mediaType: 'movie', season: undefined, episode: undefined }), movie))
      .toEqual({ kind: 'time', time: 1, duration: 0 })
  })

  it('seeks with its own command shape', () => {
    expect(vidlove.seekMessage(597)).toEqual({ type: 'seek', time: 597 })
    expect(vidlove.resumesViaUrl).toBe(false)
  })
})
```

`src/screens/Player.vidlove.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Player } from './Player'
import type { CatalogRow } from '../types'
import { writeProgress } from '../progress/progressStore'

const VIDLOVE = 'https://player.vidlove.cc'

function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    catalog_index: 0, video_id: 'tmdb-tv-1396-s1e2', type: 'episode', title: 'Ep 2', title_raw: 'Ep 2',
    series_id: 'tmdb-tv-1396', series_title: 'Breaking Bad', season_number: 1, season_label: 'Temporada 1',
    episode_number: 2, chapter_start_seconds: null, chapter_end_seconds: null, year: 2008, studio: '', source: '',
    genre: '', genre_secondary: '', quality: '', language: 'Inglés', subtitled: true, duration_raw: '',
    duration_seconds: 2820, views: 0, thumbnail: '',
    video_url: 'https://player.vidlove.cc/embed/tv/1396/1/2',
    embed_url: 'https://player.vidlove.cc/embed/tv/1396/1/2',
    external: true,
    ...overrides,
  }
}

const frame = () => document.querySelector('.go-player_frame') as HTMLIFrameElement
const event = (name: string, extra: Record<string, unknown> = {}) => ({
  type: 'PLAYER_EVENT', data: { event: name, tmdbId: 1396, mediaType: 'tv', season: 1, episode: 2, ...extra },
})
function post(data: unknown, origin = VIDLOVE) {
  fireEvent(window, new MessageEvent('message', { data, origin, source: frame().contentWindow }))
}
function stored(videoId = 'tmdb-tv-1396-s1e2') {
  const raw = localStorage.getItem(`go10:progress:${videoId}`)
  return raw ? JSON.parse(raw) : null
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Player with vidlove', () => {
  it('embeds vidlove sandboxed, and leaves ok.ru unsandboxed', () => {
    const { unmount } = render(<Player row={row()} onClose={() => {}} />)
    expect(frame().src.startsWith('https://player.vidlove.cc/embed/tv/1396/1/2?autoplay=true')).toBe(true)
    expect(frame().getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-presentation')
    unmount()

    render(<Player row={row({ external: undefined, embed_url: 'https://ok.ru/videoembed/1', video_url: 'https://ok.ru/video/1' })} onClose={() => {}} />)
    expect(frame().getAttribute('sandbox')).toBeNull()
  })

  it('saves the position vidlove reports and ignores other origins', () => {
    render(<Player row={row()} onClose={() => {}} />)
    post(event('timeupdate', { currentTime: 30, duration: 2820 }), 'https://ok.ru')
    expect(stored()).toBeNull()

    post(event('timeupdate', { currentTime: 120, duration: 2820 }))
    expect(stored()).toMatchObject({ time: 120, duration: 2820, watched: false })
  })

  it('drops a late event from another episode', () => {
    const onEnded = vi.fn()
    render(<Player row={row()} onClose={() => {}} onEnded={onEnded} />)
    post(event('timeupdate', { currentTime: 300, duration: 2820, episode: 1 }))
    post(event('ended', { currentTime: 2820, episode: 1 }))
    expect(stored()).toBeNull()
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('resumes by posting one seek once playback starts', () => {
    writeProgress('tmdb-tv-1396-s1e2', { time: 600, duration: 2820 })
    render(<Player row={row()} onClose={() => {}} />)
    expect(frame().src).not.toContain('fromTime')
    const send = vi.spyOn(frame().contentWindow!, 'postMessage')

    post(event('timeupdate', { currentTime: 2, duration: 2820 }))
    post(event('timeupdate', { currentTime: 3, duration: 2820 }))

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ type: 'seek', time: 597 }, VIDLOVE)
  })

  it('marks the episode watched and moves on when vidlove reports the end', () => {
    const onEnded = vi.fn()
    render(<Player row={row()} onClose={() => {}} onEnded={onEnded} />)
    post(event('timeupdate', { currentTime: 2810, duration: 2820 }))
    post(event('ended', { currentTime: 2820 }))
    expect(onEnded).toHaveBeenCalledOnce()
    expect(stored()).toMatchObject({ watched: true })
  })

  it('offers the embed in a new tab once retries run out', () => {
    render(<Player row={row()} onClose={() => {}} />)
    for (const ms of [8000, 1000, 8000, 2000, 8000, 3000, 8000]) act(() => vi.advanceTimersByTime(ms))
    const link = screen.getByText('Abrir en una pestaña nueva')
    expect(link.getAttribute('href')).toBe('https://player.vidlove.cc/embed/tv/1396/1/2')
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/screens/providers src/screens/Player.vidlove.test.tsx`
Expected: FAIL — cannot resolve `./vidlove`; Player builds an ok.ru-style src.

- [ ] **Step 3: Implement the providers**

`src/screens/providers/types.ts`:

```ts
import type { CatalogRow } from '../../types'

/** A playback event, whatever the embed's own message format. */
export type PlayerEvent =
  | { kind: 'time'; time: number; duration: number }
  | { kind: 'paused' }
  | { kind: 'ended'; time: number }

/** Everything the Player needs to know about one embed provider. */
export interface EmbedProvider {
  /** The only origin whose messages are trusted, and the target for commands. */
  origin: string
  src(row: CatalogRow, fromTime: number | null): string
  /** `row` is what's playing now, so stale events can be dropped. */
  parse(data: unknown, row: CatalogRow): PlayerEvent | null
  seekMessage(time: number): unknown
  /** true: resume via `src`'s start time; false: post `seekMessage` once playing. */
  resumesViaUrl: boolean
  /** Text of the fallback link to `row.video_url`. */
  fallbackLabel: string
  /** iframe `sandbox`; undefined means no sandbox attribute at all. */
  sandbox?: string
}
```

`src/screens/providers/okru.ts`:

```ts
import type { EmbedProvider } from './types'
import { buildEmbedSrc } from '../embedSrc'

/**
 * ok.ru's /videoembed/ iframe posts `{event: 'timeupdate' | 'paused' |
 * 'ended', time, duration}` to the parent (confirmed on real traffic) and
 * accepts `{action: 'seek', time}`.
 */
export const okru: EmbedProvider = {
  origin: 'https://ok.ru',
  src: (row, fromTime) => buildEmbedSrc(row.embed_url, fromTime),
  parse(data) {
    const d = data as { event?: string; time?: number; duration?: number } | null
    if (d?.event === 'timeupdate' && typeof d.time === 'number') return { kind: 'time', time: d.time, duration: d.duration ?? 0 }
    if (d?.event === 'paused') return { kind: 'paused' }
    if (d?.event === 'ended') return { kind: 'ended', time: d.time ?? 0 }
    return null
  },
  seekMessage: (time) => ({ action: 'seek', time }),
  resumesViaUrl: true,
  fallbackLabel: 'Abrir en ok.ru',
}
```

`src/screens/providers/vidlove.ts`:

```ts
import type { EmbedProvider } from './types'
import { parseTmdbKey } from '../../external/tmdb/keys'

/**
 * player.vidlove.cc, driven by TMDB ids. Its public docs cover only the URL;
 * the message format and options come from its player bundle:
 * `{type: 'PLAYER_EVENT', data: {event, currentTime, duration, tmdbId,
 * mediaType, season, episode}}` out, `{type: 'seek', time}` in. No start-time
 * URL param exists, so resume is a seek once playback starts.
 */
const PARAMS = new URLSearchParams({
  autoplay: 'true',
  // GO10 palette: accent, background, text (tokens.css).
  primarycolor: 'c6f24e',
  secondarycolor: '08090c',
  iconcolor: 'f2f4f0',
  // Our onEnded owns next-episode; don't show a second episode UI.
  autonext: 'false',
  episodelist: 'false',
  showNextEpisode: 'false',
})

interface VidloveEvent {
  event?: string
  currentTime?: number
  duration?: number
  tmdbId?: number
  season?: number
  episode?: number
}

export const vidlove: EmbedProvider = {
  origin: 'https://player.vidlove.cc',
  src: (row) => `${row.embed_url}?${PARAMS}`,
  parse(data, row) {
    const message = data as { type?: string; data?: VidloveEvent } | null
    if (message?.type !== 'PLAYER_EVENT' || !message.data) return null
    const e = message.data

    // After autoplay moves on, the previous episode can still be talking.
    const target = parseTmdbKey(row.video_id)
    if (target && e.tmdbId !== undefined && e.tmdbId !== target.id) return null
    if (row.type === 'episode') {
      if (e.season !== undefined && e.season !== row.season_number) return null
      if (e.episode !== undefined && e.episode !== row.episode_number) return null
    }

    if (e.event === 'timeupdate' && typeof e.currentTime === 'number') {
      return { kind: 'time', time: e.currentTime, duration: e.duration ?? 0 }
    }
    if (e.event === 'pause') return { kind: 'paused' }
    if (e.event === 'ended') return { kind: 'ended', time: e.currentTime ?? 0 }
    return null
  },
  seekMessage: (time) => ({ type: 'seek', time }),
  resumesViaUrl: false,
  fallbackLabel: 'Abrir en una pestaña nueva',
  // No allow-popups: aggregator players like to open ad tabs.
  sandbox: 'allow-scripts allow-same-origin allow-presentation',
}
```

`src/screens/providers/index.ts`:

```ts
import type { CatalogRow } from '../../types'
import type { EmbedProvider } from './types'
import { okru } from './okru'
import { vidlove } from './vidlove'

export type { EmbedProvider, PlayerEvent } from './types'

/** Catalog rows play on ok.ru; TMDB rows on vidlove. */
export function providerFor(row: CatalogRow): EmbedProvider {
  return row.external ? vidlove : okru
}
```

- [ ] **Step 4: Route `Player` through the provider**

Edit `src/screens/Player.tsx`:

1. Imports: remove `import { buildEmbedSrc } from './embedSrc'`, and add `import { providerFor } from './providers'`.
2. Delete the `OK_RU_ORIGIN` constant and its comment.
3. After `const frameRef = useRef<HTMLIFrameElement>(null)`, add:

```ts
  const provider = providerFor(row)
  // Kept in refs for the message listener, which never re-subscribes.
  const providerRef = useRef(provider)
  providerRef.current = provider
  const rowRef = useRef(row)
  rowRef.current = row
  // For providers that can't start mid-video from the URL: where to seek
  // once the embed first reports playback.
  const pendingSeekRef = useRef<number | null>(null)
```

4. In the chapter-jump effect, replace the `postMessage(...)` call with:

```ts
    frameRef.current?.contentWindow?.postMessage(
      providerRef.current.seekMessage(row.chapter_start_seconds ?? 0),
      providerRef.current.origin,
    )
```

5. Replace the whole message-listener effect (the block starting `// ok.ru's /videoembed/ iframe posts playback events`) with:

```ts
  // The embed posts its real playback state to this window (each provider
  // parses its own format). Unlike a wall-clock guess from
  // `duration_seconds`, it's immune to seeking, pausing, and buffering.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const current = providerRef.current
      if (event.origin !== current.origin) return
      if (event.source !== frameRef.current?.contentWindow) return
      const parsed = current.parse(event.data, rowRef.current)
      if (!parsed) return
      const videoId = videoIdRef.current

      if (parsed.kind === 'time') {
        const resumeAt = pendingSeekRef.current
        if (resumeAt !== null) {
          pendingSeekRef.current = null
          frameRef.current?.contentWindow?.postMessage(current.seekMessage(resumeAt), current.origin)
        }

        positionRef.current = { videoId, time: parsed.time, duration: parsed.duration }
        if (Date.now() - lastSaveRef.current >= PROGRESS_SAVE_INTERVAL_MS) flushProgress()

        const chapterEnd = chapterEndRef.current
        if (chapterEnd != null && parsed.time >= chapterEnd) {
          markWatched(videoId, chapterDurationRef.current)
          positionRef.current = null
          onEndedRef.current?.()
        }
      } else if (parsed.kind === 'paused') {
        flushProgress()
      } else {
        markWatched(videoId, positionRef.current?.duration || parsed.time || 0)
        positionRef.current = null
        onEndedRef.current?.()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [flushProgress])
```

6. Directly after the `fromTime` `useMemo`, add:

```ts
  // Reloads restart the embed from zero too, so re-arm on each one.
  useEffect(() => {
    pendingSeekRef.current = provider.resumesViaUrl ? null : fromTime
  }, [fromTime, state.reloadToken, provider])
```

7. Replace `const embedSrc = buildEmbedSrc(row.embed_url, fromTime)` with:

```ts
  const embedSrc = provider.src(row, provider.resumesViaUrl ? fromTime : null)
```

8. In the JSX: the fallback link text `Abrir en ok.ru` becomes `{provider.fallbackLabel}`, and the `<iframe>` gains `sandbox={provider.sandbox}` (React omits the attribute when it's undefined).

- [ ] **Step 5: Run the new tests and the whole suite**

Run: `npx vitest run src/screens && npm test`
Expected: PASS, including the unchanged `Player.test.tsx` (ok.ru behaviour and origin checks unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/screens/providers src/screens/Player.tsx src/screens/Player.vidlove.test.tsx
git commit -m "feat: play TMDB titles through a vidlove embed adapter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Wire TMDB titles into App, Detail and Home

**Files:**
- Modify: `src/App.tsx`, `src/screens/Detail.tsx:97`, `src/screens/Home.tsx:77-80`
- Create: `src/App.external.test.tsx`

**Interfaces:**
- Consumes: `externalTitlesEnabled` (Task 2); `isTmdbKey` (Task 3); `saveSnapshot`, `listSnapshots` (Task 5); `useTmdbTitle`, `resetTmdbTitleCacheForTests`, `tmdbFetch`, `enableExternalTitles` (Task 6); `mapMovie` (Task 3); `resetTmdbClientForTests` (Task 4); `writeProgress` (existing).
- Produces: the end-to-end behaviour; no new exports.

- [ ] **Step 1: Write the failing tests**

`src/App.external.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import { enableExternalTitles, tmdbFetch } from './external/testing'
import { resetTmdbClientForTests } from './external/tmdb/client'
import { resetTmdbTitleCacheForTests } from './external/useTmdbTitle'
import { listSnapshots, saveSnapshot } from './external/snapshots'
import { mapMovie, type TmdbMovie } from './external/tmdb/map'
import { writeProgress } from './progress/progressStore'

const CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,111,movie,Foo Movie,Foo Movie,,,,,2020,,Drama,,1080p,Español,false,1:00:00,3600,10,thumb.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
`

const MOVIE: TmdbMovie = {
  id: 155, title: 'Batman: El caballero de la noche', release_date: '2008-07-16',
  genres: [{ id: 28, name: 'Acción' }], original_language: 'en', runtime: 152, backdrop_path: '/b.jpg',
}

const csv = async () => ({ ok: true, text: async () => CSV })

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  sessionStorage.clear()
  localStorage.clear()
  resetTmdbClientForTests()
  resetTmdbTitleCacheForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('App with external titles on', () => {
  beforeEach(() => enableExternalTitles())

  it('opens a TMDB title from a deep link and plays it through vidlove', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ '/movie/155': MOVIE }, csv))
    window.history.replaceState({}, '', '/title/tmdb-movie-155')
    render(<App />)

    await screen.findByRole('heading', { name: 'Batman: El caballero de la noche' })
    expect(screen.getByText('Inglés (sub)')).not.toBeNull()
    expect(screen.queryByText(/vistas/)).toBeNull()

    fireEvent.click(screen.getByText('Reproducir'))
    await waitFor(() => expect(window.location.pathname).toBe('/title/tmdb-movie-155/play/tmdb-movie-155'))
    const frame = document.querySelector('.go-player_frame') as HTMLIFrameElement
    expect(frame.src.startsWith('https://player.vidlove.cc/embed/movie/155?')).toBe(true)
    await waitFor(() => expect(listSnapshots().map((t) => t.key)).toEqual(['tmdb-movie-155']))
  })

  it('shows the load error with a way back when TMDB is unreachable', async () => {
    vi.stubGlobal('fetch', tmdbFetch({ '/movie/155': () => { throw new TypeError('offline') } }, csv))
    window.history.replaceState({}, '', '/title/tmdb-movie-155')
    render(<App />)

    await screen.findByText('No se pudo cargar el título.')
    fireEvent.click(screen.getByLabelText('Volver'))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('bounces an unknown TMDB id home', async () => {
    vi.stubGlobal('fetch', tmdbFetch({}, csv))
    window.history.replaceState({}, '', '/title/tmdb-movie-404')
    render(<App />)
    await screen.findByRole('heading', { name: 'Foo Movie' })
    expect(window.location.pathname).toBe('/')
  })

  it('lists a played TMDB title under Seguir viendo', async () => {
    vi.stubGlobal('fetch', tmdbFetch({}, csv))
    saveSnapshot(mapMovie(MOVIE))
    writeProgress('tmdb-movie-155', { time: 600, duration: 9120 })
    render(<App />)

    await screen.findByText('Seguir viendo')
    expect(screen.getAllByText('Batman: El caballero de la noche').length).toBeGreaterThan(0)
  })
})

describe('App with external titles off', () => {
  it('treats TMDB keys as unknown and never calls TMDB', async () => {
    const fetch = tmdbFetch({ '/movie/155': MOVIE }, csv)
    vi.stubGlobal('fetch', fetch)
    window.history.replaceState({}, '', '/title/tmdb-movie-155')
    render(<App />)

    await screen.findByRole('heading', { name: 'Foo Movie' })
    expect(window.location.pathname).toBe('/')
    expect(fetch.mock.calls.some(([input]) => String(input).includes('themoviedb'))).toBe(false)
  })

  it('ignores snapshots on Home', async () => {
    vi.stubGlobal('fetch', tmdbFetch({}, csv))
    saveSnapshot(mapMovie(MOVIE))
    writeProgress('tmdb-movie-155', { time: 600, duration: 9120 })
    render(<App />)

    await screen.findByRole('heading', { name: 'Foo Movie' })
    expect(screen.queryByText('Seguir viendo')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/App.external.test.tsx`
Expected: FAIL — the TMDB deep link bounces to Home; no "Seguir viendo".

- [ ] **Step 3: Implement in `App`**

In `src/App.tsx`:

1. Change the React import to `import { useCallback, useEffect, useRef } from 'react'` and add:

```ts
import { externalTitlesEnabled } from './external/config'
import { isTmdbKey } from './external/tmdb/keys'
import { useTmdbTitle } from './external/useTmdbTitle'
import { saveSnapshot } from './external/snapshots'
```

2. After the `back` callback (still before `if (loading)`), add:

```ts
  // TMDB titles aren't in the catalog: a `tmdb-*` key is fetched instead.
  const tmdbKey =
    externalTitlesEnabled() && (route.name === 'title' || route.name === 'play') && isTmdbKey(route.key)
      ? route.key
      : null
  const tmdb = useTmdbTitle(tmdbKey)
  const playingExternal = route.name === 'play' && tmdb.status === 'ready' ? tmdb.title : null

  // Played TMDB titles are remembered for Home's "Seguir viendo".
  useEffect(() => {
    if (playingExternal) saveSnapshot(playingExternal)
  }, [playingExternal])
```

3. After the `if (error) { … }` block, before `const resolved = …`, add:

```tsx
  if (tmdbKey && tmdb.status === 'loading') {
    return (
      <div className="go-state">
        <span className="go-state_mark is-loading">GO10 TV</span>
        <p className="go-state_msg">Cargando título…</p>
      </div>
    )
  }

  if (tmdbKey && tmdb.status === 'error') {
    return (
      <FocusProvider key="external-error" onBack={back}>
        <div className="go-state">
          <button type="button" className="go-back" onClick={back} aria-label="Volver">
            <span className="go-back_chevron" aria-hidden="true" />
          </button>
          <span className="go-state_mark">GO10 TV</span>
          <p className="go-state_msg">No se pudo cargar el título.</p>
        </div>
      </FocusProvider>
    )
  }
```

4. Change `const resolved = resolveRoute(route, titles, COLLECTIONS)` to:

```ts
  // A loaded TMDB title resolves exactly like a catalog one; `not-found`
  // falls through to the usual bounce Home.
  const available = tmdb.status === 'ready' ? [...titles, tmdb.title] : titles
  const resolved = resolveRoute(route, available, COLLECTIONS)
```

- [ ] **Step 4: Detail views and Home "Seguir viendo"**

In `src/screens/Detail.tsx`, in the `meta` array, change `formatViews(title.views),` to:

```ts
    // TMDB has no view counts; "0 vistas" would read as unpopular.
    title.external ? null : formatViews(title.views),
```

In `src/screens/Home.tsx`:

1. Add imports:

```ts
import { externalTitlesEnabled } from '../external/config'
import { listSnapshots } from '../external/snapshots'
```

2. Replace the `continueItems` memo with:

```ts
  // Home remounts each time it's navigated back to, so reading once per
  // mount picks up whatever was just watched. Played TMDB titles aren't in
  // the catalog; their snapshots stand in for them here, and only here.
  const continueItems = useMemo(() => {
    const candidates = externalTitlesEnabled() ? [...titles, ...listSnapshots()] : titles
    return new Map(
      continueWatching(candidates, listProgress()).slice(0, ROW_LIMIT).map((item) => [item.title.key, item]),
    )
  }, [titles])
```

- [ ] **Step 5: Run the new tests and the whole suite, then type-check and build**

Run: `npx vitest run src/App.external.test.tsx && npm test && npm run build`
Expected: all tests PASS (including the unchanged `App.test.tsx`, `Detail.test.tsx`, `Home.test.tsx`), `tsc -b` reports no errors, and `vite build` succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.external.test.tsx src/screens/Detail.tsx src/screens/Home.tsx
git commit -m "feat: open, play and resume TMDB titles behind the external-titles switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Documentation and final verification

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-09-25-tmdb-vidlove-search-design.md` (status line)

- [ ] **Step 1: Document it in the README**

Add this section after `## Run` in `README.md`:

````markdown
### External titles (TMDB + vidlove) — optional

Search can reach beyond the catalog: with this on, results also include
TMDB matches, which open on the same Detail screen and play through the
[vidlove](https://player.vidlove.cc/) embed. Home and collections stay
catalog-only.

It's **off unless both variables are set**:

```bash
# .env.local (gitignored)
VITE_EXTERNAL_TITLES=on
VITE_TMDB_TOKEN=<TMDB v4 read access token>
```

On Netlify, set the same two variables and **redeploy**: Vite bakes them in
at build time. Remove either one (or set the switch to anything but `on`)
and the build is exactly the catalog-only app.

- The token ships in the JS bundle. It's TMDB's read-only token, so the
  worst case is someone else using your rate limit; rotate it if so.
- A search chip toggles **Todo** / **Solo catálogo** (`&solo=catalogo`);
  Solo catálogo makes no TMDB requests.
- TMDB titles are keyed `tmdb-movie-<id>` / `tmdb-tv-<id>` and show their
  original language, e.g. `Inglés (sub)`: vidlove streams original audio.
- They're web-only: the Aniyomi feed is built from `catalog.csv` and never
  includes them.
- Titles in both the catalog and TMDB currently show twice in results.
- This product uses the TMDB API but is not endorsed or certified by TMDB.
````

- [ ] **Step 2: Update the spec's status line**

In the spec, change `Status: **proposed** (2026-09-25).` to `Status: **implemented** (2026-09-25).`

- [ ] **Step 3: Verify everything**

Run: `npm test && npm run build && VITE_EXTERNAL_TITLES=on VITE_TMDB_TOKEN=x npm run build`
Expected: all tests pass; both builds succeed (switch off and on).

Also run `git grep -n "OK_RU_ORIGIN\|buildEmbedSrc" src` and expect only `src/screens/embedSrc.ts`, `src/screens/embedSrc.test.ts` and `src/screens/providers/okru.ts`.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-25-tmdb-vidlove-search-design.md
git commit -m "docs: document the external-titles switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand off for manual checks (user)**

With `.env.local` set, run `npm run dev` and check:
1. A search appends TMDB titles after catalog ones, and the chip toggles them off.
2. A TMDB movie and a TMDB show open on Detail, play, and resume after closing and reopening.
3. A show's autoplay moves to the next episode.
4. "Seguir viendo" lists the TMDB title on Home.
5. With `VITE_EXTERNAL_TITLES` removed and the dev server restarted, the app is back to catalog-only.
