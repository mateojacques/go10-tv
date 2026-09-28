# Hero carousel — design

Status: **approved design** (2026-09-27).

## Problem

The Home hero, on the web and in the Android app, is a fixed promo slot:
`packages/core/src/featured.ts` hard-codes Spidey (`FEATURED_SERIES_ID`) and
its key art (`FEATURED_ART`). Every launch shows the same title, and the
catalog's range (animation, drama, horror, kids, anime) is invisible above the
fold.

Goal: a hero that auto-advances through a small set of titles, re-picked at
random on every launch, spread across genres the way big streaming platforms
do it. The genre spread is how titles are *picked*; it is never shown.

## Decisions (from brainstorming)

- **Art: TMDB backdrops, fetched offline** into a committed sidecar, with the
  existing blurred-thumbnail treatment as the fallback. Catalog thumbnails are
  368x210 and look weak full-bleed.
- **The hero only features titles with art** (amended after the first
  sidecar run matched ~500 titles). Within each genre bucket it picks at random
  among titles that have a backdrop (or local key art); a bucket with none is
  left out, and with no art at all there is no hero.
- **5 slides**, one per bucket: Animación, Drama, Terror, Infantil, Anime.
- **8 s per slide**, crossfade, segment indicators.
- Picked **once per launch**; a background catalog refresh does not reshuffle.
- Logic is shared in `@go10/core`; both apps render it.

## Hero art data

### Script: `scripts/fetch_hero_art.py`

Python stdlib only (`urllib`, `json`, `csv`), like the other scripts; imports
`ROOT` from `parse_catalog`.

- Reads `apps/web/public/data/catalog.csv` and reduces it to one entry per
  title, keyed exactly as `buildTitles` keys them (`series_id || video_id`),
  with the title's display name (`series_title` for shows, `title` for
  movies), year and kind.
- Token from the `TMDB_TOKEN` env var (TMDB v4 read access token). Missing
  token: exit non-zero with a message; no partial file is written.
- For each title: `GET /3/search/movie` (movie) or `/3/search/tv` (show) with
  `query=<name>`, `language=es-MX`, `include_adult=false`.
- **Match rule:** a result matches when `normalise(name)` equals the
  normalised `title`/`name` **or** `original_title`/`original_name`.
  `normalise` = lowercase, strip accents (NFKD, drop combining marks), drop
  punctuation, collapse whitespace. Among matching results the one whose
  release/first-air year is closest to the catalog year wins (ties or no
  catalog year: TMDB's order). Year never rejects a match. A match without a
  `backdrop_path` counts as unmatched.
- **Overrides:** `data/hero_art_overrides.json`, hand-edited, applied after
  matching on every run so manual fixes survive re-runs:
  ```json
  {
    "pin":   { "<title key>": "tv/12345" },
    "block": ["<title key>"]
  }
  ```
  A pin fetches `/3/<movie|tv>/<id>` and uses its backdrop; a block removes
  the entry.
- Rate: sequential requests, retry once on HTTP 429 after its `Retry-After`.
- **Output:** `apps/web/public/data/hero_art.json`, keys sorted, stable
  formatting (diff-friendly):
  ```json
  {
    "schema_version": 1,
    "items": {
      "<title key>": { "tmdb": "movie/123", "backdrop": "/abc.jpg" }
    }
  }
  ```
- **Report** on stdout: matched / unmatched / pinned / blocked counts, and the
  unmatched titles' keys and names.
- It's run by hand when the catalog changes (TMDB egress may be blocked in
  some sandboxes; the user runs it locally). Its output is committed.

### Local key art

`packages/core/src/featured.ts` is replaced by
`packages/core/src/hero/localArt.ts`: `LOCAL_ART: Record<string, HeroArt>`
holding Spidey's existing 960/1920 webp pair. Local art beats TMDB art.

## Selection logic (`packages/core/src/hero/`)

```ts
export interface HeroArt { small: string; large: string }
export interface HeroSlide { title: Title; art: HeroArt | null }
export type HeroArtIndex = Record<string, { tmdb: string; backdrop: string }>

export const HERO_BUCKETS = ['Animación', 'Drama', 'Terror', 'Infantil', 'Anime'] as const

export function parseHeroArt(json: string): HeroArtIndex | null
export function resolveArt(key: string, index: HeroArtIndex): HeroArt | null
export function pickHero(titles: Title[], index: HeroArtIndex, random?: () => number): HeroSlide[]
```

- `parseHeroArt`: `null` for anything that isn't a schema-1 object with an
  `items` object; entries whose `backdrop` isn't a non-empty string are
  dropped.
- `resolveArt`: `LOCAL_ART[key]`, else TMDB
  `{ small: https://image.tmdb.org/t/p/w780<backdrop>, large: …/w1280<backdrop> }`,
  else `null`. URLs are absolute, so `imageSrc` passes them through on both
  apps.
- `pickHero`:
  1. Shuffle `HERO_BUCKETS` with `random` (Fisher–Yates).
  2. For each bucket: candidates = titles whose `genre` or
     `genre_secondary` equals the bucket, not already picked, and not
     `external`, and with `resolveArt(...) !== null`; if empty, skip the
     bucket.
  3. Pick one uniformly with `random`.
  - Result: 0–5 slides, no duplicates, in shuffled bucket order.
  - Empty result: no hero; Home starts with the rows (below the navbar).
    `pickHeroOnce` does not lock in an empty pick, so art arriving with a
    later refresh still gets a hero. No titles at all: the existing
    empty-catalog state.
- `random` defaults to `Math.random`; tests inject a seeded generator.

### Once per launch

`pickHeroOnce(titles, index)` in `packages/core/src/hero/pickHero.ts` holds
the pick in module state: the first call with a non-empty catalog picks, and
every later call returns the same slides for the process lifetime (a page
load on the web, an app launch on mobile). Navigating back to Home shows the
same slides, restarting at slide 0; a mobile background refresh
(`applyPending`) rebuilds rows and strip but not the hero.
`resetHeroPickForTests()` is exported, and both apps' test setups call it
before each test.

## Loading the sidecar

- **Web:** `apps/web/src/catalog/useHeroArt.ts` fetches `/data/hero_art.json`
  once and reports `{ settled: boolean, index: HeroArtIndex }` (`index` is
  `{}` on any failure). `Home` picks only once the request has settled
  (loaded or failed), so the first slide set already prefers art. The rows
  render immediately; while the request is pending the hero area renders its
  empty stage (same height, no text), so no other title flashes first.
- **Mobile:** a third `Resource` in `catalogStore` —
  `{ name: 'hero_art.json', path: 'data/hero_art.json', parse: parseHeroArt }`
  — cached and ETag-revalidated exactly like collections; `CatalogData` gains
  `heroArt: HeroArtIndex` (`{}` when missing or corrupt). Never fatal.

## UI

### Shared behaviour

- One slide visible at a time, 8 s each, crossfade (web: CSS opacity
  transition on stacked slides; TV: `Animated` opacity).
- **Stable hero height** across slides, so the rows below never jump:
  - Web: every slide's text block is stacked in one grid cell (inactive ones
    `visibility: hidden`), so the hero is as tall as its tallest slide; the
    header always has the with-art `min-height`. On wide screens a no-art
    slide shows the blurred backdrop + crisp thumbnail; on narrow screens
    (≤ 900px) it puts the thumbnail itself in the 16:9 art frame — at phone
    widths that is close to its native 368px.
  - Phone app: the horizontal pager is as tall as its tallest page.
  - TV app: one `Hero` whose props swap, at the TV hero's fixed min-height.
- Segment indicators at the foot of the hero; the active one fills over the
  8 s.
- **Pauses** while the pointer hovers the hero, while a finger is down on it
  (phone), and while the document/app is hidden. Resuming restarts the
  current slide's 8 s.
- **Focus does not pause it.** Home opens with focus on the hero's Reproducir
  button on TV, so pausing on focus would mean the carousel never moves
  there. Instead any slide change (timer, remote, arrow, indicator, swipe)
  restarts the 8 s, so a remote user who is navigating isn't raced.
- **Reduced motion** (web `prefers-reduced-motion`, mobile
  `AccessibilityInfo.isReduceMotionEnabled`): no auto-advance, no crossfade;
  manual navigation only.
- The next slide's large image is preloaded.
- An image that fails to load turns that slide into the blurred layout
  (web `onError`; `expo-image` `onError`).
- Reanudar / Reproducir / Más información act on the visible slide; progress
  (`titleProgress`) is computed per slide.
- Single slide: no indicators, no timer, no arrows.

### Web (`apps/web/src/screens/`)

- `HeroCarousel.tsx` owns the timer, index and pause state; `HeroSlide.tsx`
  is today's hero markup parameterised by `{ title, art, progress }`.
  `Home.tsx` renders `<HeroCarousel slides=… />` in place of the inline hero.
- Pointer: ‹ › arrow buttons appear on hover at the hero's sides; indicators
  are clickable.
- Remote/keyboard: the two hero buttons keep ids `hero:play` (col 0) and
  `hero:select` (col 1). Via the existing `onKey` hook, `ArrowLeft` on col 0
  goes to the previous slide and `ArrowRight` on col 1 to the next, keeping
  focus on the same button. When a slide has no Reproducir button (no
  progress target), `hero:select` handles both directions.
- The hero's `aria-roledescription="carousel"`; each slide
  `aria-roledescription="slide"` with `aria-label="n de N"`; non-visible
  slides `aria-hidden` and `inert`.

### Mobile (`apps/mobile/src/components/`)

- `Hero.tsx` stays the single-slide view (gains `onArtError`).
  `HeroCarousel.tsx` wraps it and is the FlatList header (never virtualised,
  per the existing HomeView note).
- **Phone:** a horizontal `FlatList` with `pagingEnabled` of `Hero`s, width =
  window width; swipe to change; the timer calls `scrollToIndex`; touch
  (`onScrollBeginDrag`/`onTouchStart`) pauses, `onMomentumScrollEnd` syncs
  the index and resumes.
- **TV:** a single `Hero` stays mounted and its props swap to the next
  slide behind a short `Animated` opacity dip (out 200 ms, in 300 ms), so the
  focused button never unmounts and native focus stays put. The actions row
  is wrapped in `TVFocusGuideView trapFocusLeft trapFocusRight` so focus
  can't leave it sideways; `useRemoteKeys` turns `left` while Reproducir is
  focused / `right` while Más información is focused into prev/next
  (tracked with `onFocus`, read at key-down, before the native focus move
  is reported). `hasTVPreferredFocus` stays on Reproducir as today.
- Pause when `AppState` isn't `active`.

## Error handling

- Sidecar missing, 404, corrupt, or offline: `{}` → only titles with local
  key art (Spidey) are featured; none → no hero. Never blocks Home.
- TMDB image fails: that slide shows the blurred layout.
- Catalog missing a bucket, or a bucket without art: fewer slides. Nothing
  with art in any bucket: no hero.
- Script: missing token → exit 1, nothing written; network error on a title
  → that title unmatched and listed in the report, run continues; overrides
  referencing unknown keys → warned in the report.

## Testing

- **Core (vitest):** `pickHero` with a seeded `random` — one per bucket,
  primary or secondary genre qualifies, no duplicates, only titles
  with art, art-less bucket skipped, empty bucket skipped, external titles
  excluded, empty result → no hero; `resolveArt` precedence (local > TMDB >
  null) and URL sizes; `parseHeroArt` rejects bad shapes and drops bad
  entries.
- **Web (vitest + RTL):** carousel advances after 8 s (fake timers); pauses
  on hover/focus and resumes; reduced motion → no advance; indicator click
  and arrows; `ArrowLeft`/`ArrowRight` at the edge buttons change slide and
  keep focus; buttons act on the visible slide; image `error` → blurred
  layout; `useHeroArt` failure → `{}`.
- **Mobile (jest-expo):** `catalogStore` loads/caches/revalidates
  `hero_art.json` and tolerates its absence; `buildHome` returns slides;
  refresh keeps slides; `HeroCarousel` advances and pauses on touch (phone
  branch); the TV edge rule as a pure function (`edgeStep`); `Hero` art
  error fallback. The TV rendering branch waits for real hardware.
- **Script (pytest):** `normalise`; match selection (localized vs original
  title, closest year, no backdrop → unmatched); overrides pin/block; output
  shape and sorting; missing token exits. HTTP stubbed — no live TMDB.
- Existing Spidey-specific assertions in `Home`/`App`/`Hero`/`HomeView`/
  `homeModel` tests are rewritten against the carousel.
- **Manual:** the user verifies web and phone; TV waits for real hardware.

## Out of scope

- Hand-curated editorial slots, per-user personalisation, weighting by views.
- Downloading TMDB images into the repo.
- Trailers / video in the hero.
- Showing the bucket (genre) as a label.
