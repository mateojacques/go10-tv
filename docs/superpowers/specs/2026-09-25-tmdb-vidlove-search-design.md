# External titles: TMDB search + vidlove playback — design

Status: **proposed** (2026-09-25).

## Problem

The catalog only holds what we've scraped from ok.ru and curated by hand, so
a search for anything else is a dead end. TMDB can describe virtually every
movie and show, and `player.vidlove.cc` can play any of them from a TMDB id.

Goal: keep Home and the curated catalog exactly as they are, but make search
reach beyond it. A search returns our catalog matches *and* TMDB matches; a
TMDB title opens on the same Detail screen and plays in the same Player
overlay (backed by vidlove instead of ok.ru). To the viewer the two sources
should be nearly indistinguishable, apart from load time.

The whole integration sits behind a build-time switch. Off, the app is
exactly today's app.

## Decisions (from brainstorming)

- **Home is untouched.** TMDB titles never appear in curated rows or
  collections. The only place they can surface on Home is "Seguir viendo",
  once watched.
- **No dedupe (for now).** A title in both the catalog and TMDB shows twice:
  catalog match first, TMDB match later. A `tmdb_id` join column is the
  planned improvement, out of scope here.
- **The TMDB key ships in the bundle.** A read-only v4 token in
  `VITE_TMDB_TOKEN`, calling `api.themoviedb.org` from the browser. The client
  lives in one module so a Netlify Function proxy can replace it later.
- **Language shows the original audio.** TMDB titles show
  `original_language` as a Spanish name with `(sub)` when it isn't Spanish
  (`Inglés (sub)`). vidlove streams the original audio with subtitle tracks
  (verified: 9 Spanish subtitle tracks on a sample title); we don't claim a
  dub we don't have.
- **Search scope is user-controlled.** A chip toggles "Todo" (default) /
  "Solo catálogo". Solo catálogo makes zero TMDB requests.
- **One adapter per player, shared Player.** Rejected: separate TMDB screens
  (duplication, visual drift) and promoting TMDB titles into the catalog
  (impossible when deployed — `catalog.csv` and the Aniyomi feed are static,
  build-time files — and vidlove exposes no stable video id Aniyomi could
  resolve).
- **Web only.** TMDB/vidlove titles never reach the Aniyomi feed.
- **Gated by `VITE_EXTERNAL_TITLES`.** See *Feature switch*.

## Feature switch

`src/external/config.ts` exports one constant:

```ts
export const EXTERNAL_TITLES_ENABLED =
  import.meta.env.VITE_EXTERNAL_TITLES === 'on' && Boolean(import.meta.env.VITE_TMDB_TOKEN)
```

Unset (the default), anything other than `on`, or a missing token means off.
Off guarantees:

- No TMDB request is ever made, no vidlove iframe is ever rendered.
- No scope chip, no attribution line; the `solo=` param is ignored.
- `tmdb-*` title keys resolve like any unknown key (not-found → Home).
- Home ignores stored TMDB snapshots.
- Player only ever uses the ok.ru adapter.

The existing test suite runs with the switch off and must pass unchanged;
that is the regression guarantee. New tests enable it explicitly (a mockable
config module, not ambient env).

Vite inlines env vars at build time: flipping it on Netlify means changing
the variable **and redeploying**.

Config: `.env.local` (added to `.gitignore`) for development; Netlify
environment variables for deploys. Both documented in the README.

## Data model

`Title` and `CatalogRow` gain `source: 'catalog' | 'tmdb'` (catalog loader
sets `'catalog'`). TMDB data is mapped into the existing fields so no screen
needs a second shape:

| Field | TMDB value |
|---|---|
| `Title.key` | `tmdb-movie-<id>`, `tmdb-tv-<id>` |
| `CatalogRow.video_id` | `tmdb-movie-<id>`, `tmdb-tv-<id>-s<S>e<E>` — `rowKey` and the progress store work unchanged |
| `title` | `title` / `name` (es-MX) |
| `year` | year of `release_date` / `first_air_date`, else `null` |
| `genre`, `genre_secondary` | first two TMDB genres (es-MX names) |
| `studio` | first production company; first network for TV |
| `language`, `subtitled` | `original_language` → Spanish name (`en` → `Inglés`, fallback: the ISO code uppercased); `subtitled = original_language !== 'es'` |
| `duration_seconds` | movie `runtime` × 60; episode `runtime` × 60; `0` if missing |
| `thumbnail` | backdrop at `w780` (16:9 like our art), else poster at `w500` — absolute URL |
| `season_number`, `episode_number`, `season_label` | from TMDB; label `Temporada N` |
| `embed_url` | vidlove: `https://player.vidlove.cc/embed/movie/<id>` or `/embed/tv/<id>/<S>/<E>` |
| `video_url` | same as `embed_url` (the "open in a new tab" fallback) |
| `views`, `quality` | `0`, `''` |
| chapter fields | `null` |

Shared tweaks:

- `imageSrc(path)` in `src/lib/`: absolute URLs pass through, relative paths
  get the leading `/`. Used by Card, Backdrop, Detail and Home.
- Detail omits the views item when `views` is 0 (no "0 vistas").

## Routing and title loading

No new route shapes: TMDB titles use `title` and `play` routes with their
namespaced keys (`/title/tmdb-tv-1396/play/tmdb-tv-1396-s1e3`), so deep
links, Back and reload work.

`resolveRoute` stays synchronous and catalog-only. In `App`, a key starting
with `tmdb-` (switch on) goes through `useTmdbTitle(key)` →
`loading | error | not-found | Title`. Loading renders the existing
`go-state` screen.

Fetching:

- Movie: `GET /movie/<id>?language=es-MX`.
- Show: `GET /tv/<id>?language=es-MX&append_to_response=season/1,…` —
  TMDB caps `append_to_response` at 20, so longer shows take a second
  batched call. Season 0 (specials) and episodes whose `air_date` is in the
  future or missing are dropped. A show left with no episodes is not-found.
- Results cache in memory and `sessionStorage` (`go10:tmdb-cache:<key>`)
  for the session; snapshots (below) seed it as well.

## Search

Route: `catalog` gains `catalogOnly: boolean` ↔ `&solo=catalogo`; default
false. `parseRoute`/`routeToPath` round-trip it; the navbar preserves it
while typing, as it preserves `en`.

UI: a focusable chip beside the results heading reads **Todo** or **Solo
catálogo** and toggles the param with `replace` navigation.

`useTmdbSearch(query, section, enabled)`:

- 400 ms debounce, at least 2 characters after trimming; a new query aborts
  the previous request (`AbortController`); results cache per
  `query|section` for the session.
- Endpoint by section: all → `search/multi` (keep `movie`/`tv` only), movie
  → `search/movie`, show → `search/tv`. `language=es-MX`,
  `include_adult=false`, page 1 only.
- Each result maps to a lightweight `Title` (key, kind, title, year,
  thumbnail, genres, language, `source: 'tmdb'`, empty `seasons`). Genre
  ids resolve through `genre/movie/list` and `genre/tv/list`, fetched once
  per session. Results without any image are dropped.

Merge: catalog matches (ranked by the existing `search()`) first, TMDB
results after in TMDB's order. Appending means on-screen cards, and focus,
never move.

| Situation | Shows |
|---|---|
| Catalog matches, TMDB pending | catalog results; TMDB appended on arrival, count updates |
| No catalog match, TMDB pending | "Buscando…" (not suggestions, which would flash) |
| No catalog match, TMDB results | "Resultados para …" with the TMDB results |
| No catalog match, TMDB empty/failed | today's "Sin resultados" + "Quizás te interese" |
| TMDB fails, catalog matches | catalog results only; no error shown |
| Solo catálogo, or switch off | exactly today's behaviour; no requests |

Card renders TMDB titles as it does catalog ones; its progress bar only
shows when `seasons` is non-empty.

Attribution: while TMDB results are on screen, one quiet line under the grid
— "Datos de títulos: TMDB" — styled like the existing hint text. TMDB's API
terms require it; it's the only visible marker of a TMDB result.

## Player

`Player` keeps its retry/timeout, progress saving (5 s cadence, on pause,
on close), next/prev episode, keys and chrome. The ok.ru-specific parts
move behind an adapter chosen by `row.source`:

```ts
interface EmbedProvider {
  origin: string
  src(row: CatalogRow, fromTime: number | null): string
  parse(data: unknown, row: CatalogRow): PlayerEvent | null
  seekMessage(time: number): unknown
  /** false: resume by posting seekMessage once playback starts. */
  resumesViaUrl: boolean
}

type PlayerEvent =
  | { kind: 'time'; time: number; duration: number }
  | { kind: 'paused' }
  | { kind: 'ended'; time?: number }
```

**ok.ru** — today's behaviour, moved not rewritten: origin
`https://ok.ru`, `buildEmbedSrc` with `fromTime`, `{event}` messages,
`{action: 'seek', time}` for chapter jumps; `resumesViaUrl: true`.

**vidlove** — from the player bundle (the public docs only cover the URL
format):

- Origin `https://player.vidlove.cc`. It posts
  `{type: 'PLAYER_EVENT', data: {event, currentTime, duration, tmdbId,
  mediaType, season, episode}}` for `play`, `pause`, `timeupdate`, `seeked`
  and `ended`. `pause` → `paused`, `timeupdate` → `time`, `ended` → `ended`.
- Events whose `tmdbId`/`season`/`episode` don't match the row are dropped
  (stale events during an episode switch).
- Resume: no URL param exists. On the first `play` or `timeupdate`, post
  `{type: 'seek', time}` once. The player accepts a seek before the media is
  ready and applies it when it can. vidlove's own in-iframe resume may land
  first; ours follows and wins.
- URL options: `autoplay=true`; `primarycolor`, `secondarycolor`,
  `iconcolor` from our tokens (accent `#c6f24e`, bg `#08090c`, text
  `#f2f4f0`); `autonext=false`, `episodelist=false`,
  `showNextEpisode=false` so our `onEnded` owns next-episode.
- Try `sandbox="allow-scripts allow-same-origin allow-presentation"` (no
  `allow-popups`) against ad popups; drop it if vidlove refuses to play
  sandboxed.
- Fallback link text: "Abrir en una pestaña nueva" (ok.ru keeps "Abrir en
  ok.ru").

The URL option names and the sandbox come from a minified bundle: the first
implementation task is a manual check of each against the live player
(by the user), dropping any that don't work.

## Watch progress and "Seguir viendo"

Progress needs no change: TMDB rows key it by their `video_id`. Detail's
"Reanudar", episode bars and "Visto" work because Detail has the full title.

Home's "Seguir viendo" only sees catalog titles, so playing a TMDB title
writes a snapshot of its full mapped `Title` (seasons included, for
next-episode) to localStorage: `go10:tmdb-title:<key>`, newest 30 kept,
all access in try/catch like the progress store. Home feeds
`catalog titles ∪ snapshots` into its existing "Seguir viendo" logic only.
`useTmdbTitle` starts from a snapshot when there is one (instant Detail)
and refreshes in the background.

## Errors

| Case | Behaviour |
|---|---|
| Switch off / no token | integration inert; today's app |
| 401 | TMDB disabled for the session, `console.error`; search catalog-only |
| 429 / network, search | catalog results only, silently; next query retries |
| Title fetch 404 | not-found → Home |
| Title fetch network error | "No se pudo cargar el título" state with Back |
| vidlove load failure | existing retry, then the new-tab fallback link |

## Module layout

- `src/external/config.ts` — the switch.
- `src/external/tmdb/client.ts` — fetch wrapper (token, base URL, errors).
- `src/external/tmdb/map.ts` — TMDB JSON → `Title`/`CatalogRow`; pure.
- `src/external/tmdb/languages.ts` — ISO 639-1 → Spanish name.
- `src/external/useTmdbSearch.ts`, `src/external/useTmdbTitle.ts`.
- `src/external/snapshots.ts` — the "Seguir viendo" snapshot store.
- `src/screens/providers/okru.ts`, `src/screens/providers/vidlove.ts`,
  `src/screens/providers/types.ts`.

## Testing

Vitest, `fetch` mocked, no network.

- Switch off: the whole existing suite passes unchanged; plus a test that
  no `fetch` to TMDB happens and `tmdb-*` keys bounce.
- `map.ts` from fixtures: missing images, season 0, unaired episodes,
  language names, runtime missing.
- Router: `solo=catalogo` round-trip; navbar preserves it.
- Search: merge order and every row of the states table, with fake timers
  for the debounce; abort of stale requests.
- Adapters: `src` building, `parse`, wrong-origin rejection (in Player),
  stale-episode drop.
- Player with vidlove messages: progress written, resume seek posted exactly
  once, `ended` → next episode.
- `useTmdbTitle`: cache, snapshot seeding, 404 vs network error.
- Home: "Seguir viendo" includes a snapshot title.
- Manual (user): vidlove URL options and sandbox in a real browser.

## Out of scope

Catalog ↔ TMDB dedupe (`tmdb_id` join), TMDB art/synopses for catalog
titles, TMDB/vidlove in the Aniyomi feed, a Netlify proxy for the key,
TMDB-driven Home rows, runtime (non-rebuild) toggling.
