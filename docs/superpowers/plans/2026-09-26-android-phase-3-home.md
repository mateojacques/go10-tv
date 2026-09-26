# Android Phase 3: Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 2's plain title list with the real Home screen: the featured hero, the collection strip and every catalog row (all 28 at today's catalog size). It is a faithful port of the web Home. On TV it is navigable by D-pad through react-native-tvos focus guides; on the phone it scrolls by touch. Selecting a card, tile or hero button opens placeholder Detail and Collection screens that Phases 4 and 5 replace.

**Architecture:**
- **Shared text helpers move to core.** The copy the web Home and Card compute inline goes to `@go10/core/catalog/describeTitle`, and the web switches to it: the "3 temporadas" extent, the hero metadata line, the card's "year · genre" line and the season count.
- **A pure mobile `homeModel`** turns `CatalogData` into what Home shows: the featured title and its art, the visible collections and the rows.
- **Presentational components:** `Card`, `CollectionTile`, `Row`, `CollectionStrip`, `Hero`, and `HomeView`, which is one vertical `FlatList` of sections so off-screen rows are virtualised.
- **Routes** wire them to expo-router.

**Tech Stack:** Expo SDK 57, react-native-tvos 0.86 (`TVFocusGuideView`, `hasTVPreferredFocus`, `Pressable` focus state), expo-router, expo-image (including `blurRadius` for the backdrop, and SVG logos), expo-linear-gradient, expo-font with `@expo-google-fonts/bricolage-grotesque` and `@expo-google-fonts/ibm-plex-mono`, Jest + @testing-library/react-native 14. Core and web stay on Vitest.

**Spec:** `docs/superpowers/specs/2026-09-26-android-app-design.md`. Relevant sections: *Navigation, focus, layout* (Routes → screens, Device mode, TV focus, Styling), *Phases → 3*.

## Global Constraints

- **Test on the phone only** (`adb` serial `ZY22MTK86Z`). **TV focus can't be verified in this phase**: there's no TV hardware, and the emulator is out of scope. Build the TV behaviour to the spec anyway. Task 7 writes the TV checklist to `docs/superpowers/tv-checklist.md` for when hardware arrives.
- **Faithful port, not a redesign.** Source files:
  - `apps/web/src/screens/Home.tsx` and `Home.css`
  - `components/Card.tsx` and `Card.css`
  - `CollectionTile.tsx` and `CollectionTile.css`
  - `Row.css`
  - `Backdrop.tsx`
  - `styles/tokens.css`

  Unfocused cards and tiles are dimmed (`brightness(0.62)`) exactly as the web does. On a phone the web never lifts that dim, since touch has no hover, so the port doesn't either.
- **Units.** A 1080p TV is 960×540 dp. TV sizes are the web's 1920-px values halved; phone sizes are the web's CSS px at a phone viewport. Final numbers live in `theme.ts`.
- **Fonts.** Display type is Bricolage Grotesque and metadata is IBM Plex Mono, as on the web. Android can't synthesise weights for custom fonts, so each weight is its own `fontFamily` (`theme.font.*`). Never set `fontWeight` together with a custom family.
- **Out of scope for Phase 3:**
  - the "Seguir viendo" row, and the hero's Reanudar/progress state (Phase 5 and Phase 4: both need playback);
  - the navbar with Películas, Series and search (Phase 5, with those screens);
  - real Detail and Collection screens (Phases 4 and 5). Phase 3 ships placeholders at their final routes, `/title/[key]` and `/coleccion/[id]`.
- **Images.** Every image URL goes through core's `imageSrc(path, imageBase)`, where `imageBase = siteBase(appExtra().siteUrl)` ends in `/`. Collection logos are SVG; expo-image renders SVG on Android.
- **Install flags.** Peer deps are not auto-installed (`legacy-peer-deps`). Use `npx expo install <pkg>` inside `apps/mobile` so the versions match SDK 57. If `expo install` files a test-only package under `dependencies`, move it to `devDependencies`.
- **Builds.** Use `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64` and prebuild with `EXPO_TV=1` (`npm run prebuild`). Build `./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a`, then `adb install -r`.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A featured title that's gone.** If `spidey-y-sus-sorprendentes-amigos` disappears from the catalog, the hero must feature the first title instead, using its blurred thumbnail backdrop rather than Spidey's key art. It must not crash or show an empty hero. Tests: `homeModel` "falls back to the first title" (Task 3) and `Hero` "without key art" (Task 5).
2. **Collections that resolve to no titles** (keys renamed, or the catalog shrank) must be left out of the strip. Collections that aren't in the index at all mean no strip, and the rows shift up. Tests: `homeModel` "hides collections…" (Task 3) and `HomeView` "no strip" (Task 6).
3. **An empty catalog** must show "El catálogo está vacío.", like the web, and not a blank or crashing screen. Tests: `homeModel` and `HomeView` "empty" (Tasks 3 and 6).
4. **Missing art.** A title with no thumbnail (`''`) or a tile with no background must render the placeholder surface, not an image request to the site root. Tests: `Card` "no thumbnail" and `CollectionTile` "no background" (Task 4).
5. **Long titles** must stay on one line, so a long name can't push a row's cards out of alignment (web: `nowrap` + ellipsis). Test: `Card` "one line" (Task 4).

---

### Task 1: Core `describeTitle`: the copy both apps show

**Files:**
- Create: `packages/core/src/catalog/describeTitle.ts`
- Test: `packages/core/src/catalog/describeTitle.test.ts`
- Modify: `apps/web/src/screens/Home.tsx` (drop its local `showExtent` and the inline meta array), `apps/web/src/components/Card.tsx` (use `seasonCount` and `cardMeta`)

**Interfaces:**
- Consumes: `formatDuration` (`@go10/core/lib/format`), `groupSeasons` (`@go10/core/player/groupSeasons`), `Title` (`@go10/core/types`).
- Produces (`@go10/core/catalog/describeTitle`):
  - `showExtent(title: Title): string`
  - `heroMeta(title: Title): string[]`
  - `seasonCount(title: Title): number`
  - `cardMeta(title: Title): string`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/catalog/describeTitle.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { CatalogRow, Title } from '../types'
import { cardMeta, heroMeta, seasonCount, showExtent } from './describeTitle'

const row = (season: number | null, episode: number | null = null) =>
  ({ season_number: season, episode_number: episode, season_label: '' }) as CatalogRow

function title(overrides: Partial<Title>): Title {
  return {
    key: 'k', kind: 'movie', title: 'T', year: 2001, studio: '', source: '', genre: 'Animación', genre_secondary: '',
    quality: '1080p', language: 'Español', subtitled: false, thumbnail: '', views: 0, durationSeconds: 5400,
    catalogIndex: 0, seasons: [], ...overrides,
  }
}

describe('showExtent', () => {
  it('counts seasons when a show has several', () => {
    expect(showExtent(title({ kind: 'show', seasons: [row(1), row(2), row(3)] }))).toBe('3 temporadas')
  })

  it('counts episodes for a single season of episodes', () => {
    expect(showExtent(title({ kind: 'show', seasons: [row(1, 1), row(1, 2)] }))).toBe('2 episodios')
  })

  it('falls back to the runtime for a single one-file season', () => {
    expect(showExtent(title({ kind: 'show', seasons: [row(1)], durationSeconds: 14909 }))).toBe('4 h 8 min')
  })
})

describe('heroMeta', () => {
  it('lists runtime, year, quality and language for a movie', () => {
    expect(heroMeta(title({}))).toEqual(['1 h 30 min', '2001', '1080p', 'Español'])
  })

  it('uses the extent for a show, marks subtitles and skips blanks', () => {
    expect(heroMeta(title({ kind: 'show', seasons: [row(1), row(2)], year: null, quality: '', language: 'Japonés', subtitled: true })))
      .toEqual(['2 temporadas', 'Japonés (sub)'])
  })
})

describe('seasonCount', () => {
  it('counts distinct seasons, not rows', () => {
    expect(seasonCount(title({ seasons: [row(1, 1), row(1, 2), row(2, 1)] }))).toBe(2)
    expect(seasonCount(title({ seasons: [] }))).toBe(0)
  })
})

describe('cardMeta', () => {
  it('joins year and genre, skipping what is missing', () => {
    expect(cardMeta(title({}))).toBe('2001 · Animación')
    expect(cardMeta(title({ year: null }))).toBe('Animación')
    expect(cardMeta(title({ year: null, genre: '' }))).toBe('')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @go10/core -- src/catalog/describeTitle.test.ts`
Expected: FAIL with `Failed to resolve import "./describeTitle"`.

- [ ] **Step 3: Implement**

`packages/core/src/catalog/describeTitle.ts`:
```ts
import { formatDuration } from '../lib/format'
import { groupSeasons } from '../player/groupSeasons'
import type { Title } from '../types'

/** "3 temporadas", or "26 episodios" for a single season of episodes. */
export function showExtent(title: Title): string {
  const seasons = groupSeasons(title.seasons)
  if (seasons.length > 1) return `${seasons.length} temporadas`
  const rows = seasons[0]?.rows ?? []
  return rows.length > 1 ? `${rows.length} episodios` : formatDuration(title.durationSeconds)
}

/** The hero's metadata line: extent (shows) or runtime (movies), year, quality, language. */
export function heroMeta(title: Title): string[] {
  return [
    title.kind === 'show' ? showExtent(title) : formatDuration(title.durationSeconds),
    title.year,
    title.quality,
    title.subtitled ? `${title.language} (sub)` : title.language,
  ]
    .filter(Boolean)
    .map(String)
}

/** Distinct seasons, for the card's "2 Temporadas" tag. */
export function seasonCount(title: Title): number {
  return new Set(title.seasons.map((s) => s.season_number)).size
}

/** The card's second line: "2001 · Animación". */
export function cardMeta(title: Title): string {
  return [title.year, title.genre].filter(Boolean).join(' · ')
}
```

- [ ] **Step 4: Point the web app at it**

In `apps/web/src/screens/Home.tsx`:
- delete the local `function showExtent(…) {…}` and its doc comment;
- replace the `const meta = [ … ].filter(Boolean)` block with `const meta = heroMeta(featured)`;
- add `import { heroMeta } from '@go10/core/catalog/describeTitle'`;
- remove the imports that become unused. `groupSeasons` and `formatDuration` are only used by what moved; the typecheck will tell you.

In `apps/web/src/components/Card.tsx`:
- replace `const seasons = new Set(title.seasons.map((s) => s.season_number)).size` with `const seasons = seasonCount(title)`;
- replace `[title.year, title.genre].filter(Boolean).join(' · ')` with `cardMeta(title)`;
- add `import { cardMeta, seasonCount } from '@go10/core/catalog/describeTitle'`.

- [ ] **Step 5: Run everything**

Run: `npm test -w @go10/core 2>&1 | grep -E "Tests "; npm test -w @go10/web 2>&1 | grep -E "Tests "; npm run typecheck > /dev/null 2>&1; echo typecheck=$?`
Expected: core `245 passed` (237 + 8), web `180 passed`, `typecheck=0`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/catalog apps/web/src/screens/Home.tsx apps/web/src/components/Card.tsx
git commit -m "refactor(core): share the hero and card copy (describeTitle) between web and mobile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Mobile foundation: fonts, gradient, theme, placeholder routes

**Files:**
- Modify: `apps/mobile/package.json` (via `npx expo install`)
- Modify: `apps/mobile/src/theme.ts`, `apps/mobile/src/app/_layout.tsx`
- Create: `apps/mobile/src/components/ComingSoon.tsx`, `apps/mobile/src/app/title/[key].tsx`, `apps/mobile/src/app/coleccion/[id].tsx`
- Test: `apps/mobile/src/components/ComingSoon.test.tsx`

**Interfaces:**
- Consumes: `useCatalog` (Phase 2, `src/data/CatalogProvider`), `CatalogState`.
- Produces:
  - `theme.font`, with keys `display`, `displaySemi`, `displayBold`, `displayHeavy`, `mono`, `monoMedium`, `monoSemi`
  - `theme.card: { width: number; height: number }`
  - `theme.tile: { width: number; height: number }`
  - `theme.focusScale: number`
  - `theme.dim: number` (the unfocused opacity overlay, 0.38 = 1 − 0.62)
  - `ComingSoon({ heading, note }: { heading: string; note: string })`
  - the routes `/title/[key]` and `/coleccion/[id]`

- [ ] **Step 1: Install the packages**

```bash
cd apps/mobile
npx expo install expo-font expo-linear-gradient @expo-google-fonts/bricolage-grotesque @expo-google-fonts/ibm-plex-mono
cd ../..
grep -oE "BricolageGrotesque_[0-9]+[A-Za-z]+|IBMPlexMono_[0-9]+[A-Za-z]+" node_modules/@expo-google-fonts/bricolage-grotesque/index.js node_modules/@expo-google-fonts/ibm-plex-mono/index.js | sort -u
```
Expected: the install exits 0. The grep lists the exported font names, including `BricolageGrotesque_400Regular`, `_600SemiBold`, `_700Bold`, `_800ExtraBold` and `IBMPlexMono_400Regular`, `_500Medium`, `_600SemiBold`. If a name differs, use the real one in Steps 4-5 and ledger it. If the package's entry file isn't `index.js`, find the exports with `grep -rl "_400Regular" node_modules/@expo-google-fonts/bricolage-grotesque | head -3`.

- [ ] **Step 2: Write the failing test**

`apps/mobile/src/components/ComingSoon.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native'
import { ComingSoon } from './ComingSoon'

describe('ComingSoon', () => {
  it('names what was opened and what is coming', async () => {
    await render(<ComingSoon heading="Hora de Aventura" note="La ficha del título llega en la próxima versión." />)
    expect(screen.getByRole('header', { name: 'Hora de Aventura' })).toBeTruthy()
    expect(screen.getByText('La ficha del título llega en la próxima versión.')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -w @go10/mobile -- src/components/ComingSoon`
Expected: FAIL with `Cannot find module './ComingSoon'`.

- [ ] **Step 4: Theme, component, routes**

Replace `apps/mobile/src/theme.ts` with:
```ts
import { Platform } from 'react-native'

/**
 * The web app's tokens (apps/web/src/styles/tokens.css) in dp. A 1080p TV is
 * 960x540 dp, so TV values are the web's 1920-px values halved; phone values
 * are the web's CSS px at a phone viewport.
 */
const tv = Platform.isTV

const cardWidth = tv ? 192 : 240 // --go-card-w: clamp(15rem, 20vw, 22rem)
const tileWidth = tv ? 158 : 176 // --go-tile-w: clamp(11rem, 16.5vw, 20rem)

export const theme = {
  color: {
    bg: '#08090c',
    bgRaised: '#12141a',
    bgSunken: '#050609',
    scrim: 'rgba(8, 9, 12, 0.92)',
    hairline: 'rgba(242, 244, 240, 0.09)',
    accent: '#c6f24e',
    accentDim: '#7f9b2c',
    accentGlow: 'rgba(198, 242, 78, 0.28)',
    text: '#f2f4f0',
    textMuted: '#878d99',
    textMeta: '#aab0bb',
  },
  /** One family per weight: Android can't synthesise weights for custom fonts. */
  font: {
    display: 'BricolageGrotesque_400Regular',
    displaySemi: 'BricolageGrotesque_600SemiBold',
    displayBold: 'BricolageGrotesque_700Bold',
    displayHeavy: 'BricolageGrotesque_800ExtraBold',
    mono: 'IBMPlexMono_400Regular',
    monoMedium: 'IBMPlexMono_500Medium',
    monoSemi: 'IBMPlexMono_600SemiBold',
  },
  space: { safeX: tv ? 40 : 20, safeY: tv ? 20 : 24, gap: tv ? 10 : 12, rowGap: tv ? 18 : 28 },
  size: { hero: tv ? 42 : 40, section: tv ? 15 : 22, card: tv ? 9.5 : 16, body: tv ? 10.5 : 17, meta: tv ? 8.5 : 15, eyebrow: tv ? 7 : 12, tag: tv ? 6 : 11 },
  card: { width: cardWidth, height: Math.round(cardWidth * 0.5625) },
  tile: { width: tileWidth, height: Math.round(tileWidth * 0.5625) },
  /** Focused cards and tiles grow like the web's `scale(1.09)`. */
  focusScale: 1.09,
  /** Unfocused cards sit under a scrim of this opacity: the web's brightness(0.62). */
  dim: 0.38,
  radius: 8,
}
```
`apps/mobile/src/components/ComingSoon.tsx`:
```tsx
import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

/** Stand-in for screens that arrive in later phases, at their final routes. */
export function ComingSoon({ heading, note }: { heading: string; note: string }) {
  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.heading}>{heading}</Text>
      <Text style={styles.note}>{note}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', gap: 12, padding: theme.space.safeX, backgroundColor: theme.color.bg },
  heading: { color: theme.color.text, fontFamily: theme.font.displayHeavy, fontSize: theme.size.hero },
  note: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta },
})
```
`apps/mobile/src/app/title/[key].tsx`:
```tsx
import { useLocalSearchParams } from 'expo-router'
import { ComingSoon } from '../../components/ComingSoon'
import { useCatalog } from '../../data/CatalogProvider'

/** Phase 4 replaces this with the real Detail screen. */
export default function TitleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const { state } = useCatalog()
  const title = state.status === 'ready' ? state.data.titles.find((t) => t.key === key) : undefined
  return <ComingSoon heading={title?.title ?? 'Título'} note="La ficha del título llega en la próxima versión." />
}
```
`apps/mobile/src/app/coleccion/[id].tsx`:
```tsx
import { useLocalSearchParams } from 'expo-router'
import { ComingSoon } from '../../components/ComingSoon'
import { useCatalog } from '../../data/CatalogProvider'

/** Phase 5 replaces this with the real Collection screen. */
export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { state } = useCatalog()
  const collection = state.status === 'ready' ? state.data.collections.find((c) => c.id === id) : undefined
  return <ComingSoon heading={collection?.name ?? 'Colección'} note="Las colecciones llegan en una próxima versión." />
}
```

- [ ] **Step 5: Load the fonts in the root layout**

Replace `apps/mobile/src/app/_layout.tsx` with:
```tsx
// First: wires core's storage and config before any other module evaluates.
import '../platform/install'
import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque'
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { CatalogProvider } from '../data/CatalogProvider'
import { theme } from '../theme'

export default function RootLayout() {
  // Bundled with the app, so this settles in a frame or two; on an error the
  // system font stands in rather than blocking the app.
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  })
  if (!fontsLoaded && !fontError) return null

  return (
    <CatalogProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.bg } }} />
    </CatalogProvider>
  )
}
```
`src/components/TitleList.tsx` still uses the removed `theme.card.width` sizes. Leave it untouched; Task 6 deletes it. If typecheck fails only inside `TitleList.tsx`, go on to Step 6 and let Task 6 remove it. Ledger this if it happens.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -w @go10/mobile 2>&1 | grep -E "Tests:"; npm run typecheck -w @go10/mobile; echo typecheck=$?`
Expected: `Tests: 39 passed, 39 total` (38 + 1) and `typecheck=0`.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile package.json package-lock.json
git commit -m "feat(mobile): web type and tokens, placeholder Detail and Collection routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `homeModel`: what Home shows

**Files:**
- Create: `apps/mobile/src/home/homeModel.ts`
- Test: `apps/mobile/src/home/homeModel.test.ts`

**Interfaces:**
- Consumes: `buildRows`, `CatalogRowGroup` (`@go10/core/catalog/buildRows`); `visibleCollections` (`@go10/core/collections/resolveCollection`); `FEATURED_ART`, `FEATURED_SERIES_ID` (`@go10/core/featured`); `CatalogData` (Phase 2, `src/data/catalogStore`).
- Produces:
  - `interface HomeModel { featured: Title; featuredArt: { small: string; large: string } | null; strip: Collection[]; rows: CatalogRowGroup[] }`
  - `buildHome(data: CatalogData): HomeModel | null`, which returns null for an empty catalog

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/home/homeModel.test.ts`:
```ts
import type { Collection } from '@go10/core/collections/types'
import type { Title } from '@go10/core/types'
import { FEATURED_SERIES_ID } from '@go10/core/featured'
import { buildHome } from './homeModel'

function title(key: string, overrides: Partial<Title> = {}): Title {
  return {
    key, kind: 'movie', title: key, year: 2001, studio: '', source: '', genre: '', genre_secondary: '',
    quality: '1080p', language: 'Español', subtitled: false, thumbnail: `catalogo_files/${key}.webp`, views: 0,
    durationSeconds: 5400, catalogIndex: 0, seasons: [], ...overrides,
  }
}
const collection = (id: string, titles: string[]): Collection => ({
  id, name: id, order: 1, logo: `assets/collections/${id}/logo.svg`, tile: { color: '#000000' }, titles,
})
const data = (titles: Title[], collections: Collection[] = []) => ({ rows: [], titles, collections })

describe('buildHome', () => {
  it('features the promo title with its key art', () => {
    const home = buildHome(data([title('a'), title(FEATURED_SERIES_ID, { kind: 'show' })]))!
    expect(home.featured.key).toBe(FEATURED_SERIES_ID)
    expect(home.featuredArt?.large).toMatch(/spidey-hero-1920\.webp$/)
  })

  it('falls back to the first title, without key art, when the promo title is gone', () => {
    const home = buildHome(data([title('a'), title('b')]))!
    expect(home.featured.key).toBe('a')
    expect(home.featuredArt).toBeNull()
  })

  it('builds the same rows as the web Home', () => {
    const home = buildHome(data([title('a'), title('b', { kind: 'show' })]))!
    expect(home.rows.map((r) => r.id)).toEqual(expect.arrayContaining(['recientes', 'series', 'populares']))
  })

  it('hides collections that resolve to no titles, keeping the order of the rest', () => {
    const home = buildHome(data([title('a')], [collection('x', ['gone']), collection('y', ['a'])]))!
    expect(home.strip.map((c) => c.id)).toEqual(['y'])
  })

  it('is null for an empty catalog', () => {
    expect(buildHome(data([]))).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @go10/mobile -- src/home`
Expected: FAIL with `Cannot find module './homeModel'`.

- [ ] **Step 3: Implement**

`apps/mobile/src/home/homeModel.ts`:
```ts
import { buildRows, type CatalogRowGroup } from '@go10/core/catalog/buildRows'
import { visibleCollections } from '@go10/core/collections/resolveCollection'
import type { Collection } from '@go10/core/collections/types'
import { FEATURED_ART, FEATURED_SERIES_ID } from '@go10/core/featured'
import type { Title } from '@go10/core/types'
import type { CatalogData } from '../data/catalogStore'

export interface HomeModel {
  featured: Title
  /** Full-resolution key art, only for the promo title; others get the blurred thumbnail. */
  featuredArt: { small: string; large: string } | null
  /** Collections with at least one title in the catalog, in tile order. */
  strip: Collection[]
  rows: CatalogRowGroup[]
}

/** The web Home's layout decisions (apps/web/src/screens/Home.tsx), minus "Seguir viendo" (Phase 5). */
export function buildHome(data: CatalogData): HomeModel | null {
  const featured = data.titles.find((t) => t.key === FEATURED_SERIES_ID) ?? data.titles[0]
  if (!featured) return null
  return {
    featured,
    featuredArt: featured.key === FEATURED_SERIES_ID ? FEATURED_ART : null,
    strip: visibleCollections(data.collections, data.titles).map((resolved) => resolved.collection),
    rows: buildRows(data.titles),
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -w @go10/mobile 2>&1 | grep -E "Tests:"`
Expected: `Tests: 44 passed, 44 total`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/home
git commit -m "feat(mobile): home model (featured title, visible collections, rows)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cards, tiles and rows

**Files:**
- Create: `apps/mobile/src/components/Card.tsx`, `apps/mobile/src/components/CollectionTile.tsx`, `apps/mobile/src/components/Row.tsx`, `apps/mobile/src/components/CollectionStrip.tsx`
- Test: `apps/mobile/src/components/Card.test.tsx`, `apps/mobile/src/components/CollectionTile.test.tsx`, `apps/mobile/src/components/Row.test.tsx`

**Interfaces:**
- Consumes: `theme` (Task 2); `cardMeta`, `seasonCount` (Task 1); `imageSrc` (core); `CatalogRowGroup` (core); `Collection` (core).
- Produces:
  - `Card({ title, imageBase, onSelect })`, with `accessibilityLabel = title.title`
  - `CollectionTile({ collection, imageBase, onSelect })`, with `accessibilityLabel = collection.name`
  - `Row({ group, imageBase, onSelect })`
  - `CollectionStrip({ collections, imageBase, onSelect })`

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/components/Card.test.tsx`:
```tsx
import { render, screen, userEvent } from '@testing-library/react-native'
import type { CatalogRow, Title } from '@go10/core/types'
import { Card } from './Card'

function title(overrides: Partial<Title> = {}): Title {
  return {
    key: 'k', kind: 'movie', title: 'Coraje', year: 2001, studio: '', source: '', genre: 'Animación', genre_secondary: '',
    quality: '1080p', language: 'Español', subtitled: false, thumbnail: 'catalogo_files/a.webp', views: 0,
    durationSeconds: 5400, catalogIndex: 0, seasons: [], ...overrides,
  }
}
const IMG = 'https://tv.test/'

describe('Card', () => {
  it('shows the title, its year and genre, and its art from the site', async () => {
    await render(<Card title={title()} imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('Coraje')).toBeTruthy()
    expect(screen.getByText('2001 · Animación')).toBeTruthy()
    expect(screen.getByTestId('card-image').props.source).toEqual([{ uri: 'https://tv.test/catalogo_files/a.webp' }])
  })

  it('tags 4K and a show’s seasons', async () => {
    const seasons = [{ season_number: 1 }, { season_number: 2 }] as CatalogRow[]
    await render(<Card title={title({ quality: '4K', kind: 'show', seasons })} imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('4K')).toBeTruthy()
    expect(screen.getByText('2 Temporadas')).toBeTruthy()
  })

  it('selects its title when pressed', async () => {
    const onSelect = jest.fn()
    const t = title()
    await render(<Card title={t} imageBase={IMG} onSelect={onSelect} />)
    await userEvent.setup().press(screen.getByRole('button', { name: 'Coraje' }))
    expect(onSelect).toHaveBeenCalledWith(t)
  })

  it('keeps a long name on one line', async () => {
    await render(<Card title={title({ title: 'Un título larguísimo que no entra en una tarjeta de catálogo' })} imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('Un título larguísimo que no entra en una tarjeta de catálogo').props.numberOfLines).toBe(1)
  })

  it('shows the placeholder surface, and requests nothing, without a thumbnail', async () => {
    await render(<Card title={title({ thumbnail: '' })} imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.queryByTestId('card-image')).toBeNull()
  })
})
```
`apps/mobile/src/components/CollectionTile.test.tsx`:
```tsx
import { render, screen, userEvent } from '@testing-library/react-native'
import type { Collection } from '@go10/core/collections/types'
import { CollectionTile } from './CollectionTile'

const collection = (tile: Collection['tile']): Collection => ({
  id: 'pixar', name: 'Pixar', order: 1, logo: 'assets/collections/pixar/logo.svg', tile, titles: ['a'],
})

describe('CollectionTile', () => {
  it('shows the logo on the tile colour and opens the collection', async () => {
    const onSelect = jest.fn()
    const c = collection({ color: '#0a3d62' })
    await render(<CollectionTile collection={c} imageBase="https://tv.test/" onSelect={onSelect} />)
    const tile = screen.getByRole('button', { name: 'Pixar' })
    expect(screen.getByTestId('tile-logo').props.source).toEqual([{ uri: 'https://tv.test/assets/collections/pixar/logo.svg' }])
    expect(screen.getByTestId('tile-surface')).toHaveStyle({ backgroundColor: '#0a3d62' })
    await userEvent.setup().press(tile)
    expect(onSelect).toHaveBeenCalledWith(c)
  })

  it('draws the background art only when the collection has one', async () => {
    await render(<CollectionTile collection={collection({ color: '#000' })} imageBase="https://tv.test/" onSelect={jest.fn()} />)
    expect(screen.queryByTestId('tile-background')).toBeNull()
  })
})
```
`apps/mobile/src/components/Row.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native'
import type { Title } from '@go10/core/types'
import { Row } from './Row'

const title = (key: string): Title => ({
  key, kind: 'movie', title: `Título ${key}`, year: 2001, studio: '', source: '', genre: '', genre_secondary: '',
  quality: '', language: '', subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})

describe('Row', () => {
  it('heads its cards with the label and count, like the web', async () => {
    await render(<Row group={{ id: 'series', label: 'Series', titles: [title('a'), title('b')] }} imageBase="https://tv.test/" onSelect={jest.fn()} />)
    expect(screen.getByRole('header', { name: /Series/ })).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Título a' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Título b' })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @go10/mobile -- src/components/Card src/components/CollectionTile src/components/Row`
Expected: FAIL with `Cannot find module './Card'` (and the same for the other two).

- [ ] **Step 3: Implement**

`apps/mobile/src/components/Card.tsx`:
```tsx
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { cardMeta, seasonCount } from '@go10/core/catalog/describeTitle'
import { imageSrc } from '@go10/core/lib/imageSrc'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'

/** A catalog card (apps/web/src/components/Card.tsx): art, tags, name, year · genre. */
export function Card({ title, imageBase, onSelect }: { title: Title; imageBase: string; onSelect: (title: Title) => void }) {
  const seasons = seasonCount(title)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title.title}
      onPress={() => onSelect(title)}
      style={({ focused }) => [styles.card, focused && styles.cardFocused]}
    >
      {({ focused }) => (
        <>
          <View style={[styles.frame, focused && styles.frameFocused]}>
            {title.thumbnail !== '' && (
              <Image testID="card-image" source={{ uri: imageSrc(title.thumbnail, imageBase) }} style={styles.image} contentFit="cover" />
            )}
            <View style={styles.tags}>
              {title.quality === '4K' && <Text style={[styles.tag, styles.tagAccent]}>4K</Text>}
              {title.kind === 'show' && seasons > 0 && (
                <Text style={styles.tag}>{`${seasons} ${seasons === 1 ? 'Temporada' : 'Temporadas'}`}</Text>
              )}
            </View>
            {!focused && <View style={styles.dim} pointerEvents="none" />}
          </View>
          <Text style={[styles.name, !focused && styles.dimText]} numberOfLines={1}>{title.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{cardMeta(title)}</Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { width: theme.card.width },
  cardFocused: { transform: [{ scale: theme.focusScale }], zIndex: 2 },
  frame: { width: theme.card.width, height: theme.card.height, borderRadius: theme.radius, overflow: 'hidden', backgroundColor: theme.color.bgRaised, borderWidth: 1, borderColor: theme.color.hairline },
  frameFocused: { borderWidth: 3, borderColor: theme.color.accent },
  image: { width: '100%', height: '100%' },
  tags: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 4 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.color.scrim, color: theme.color.text, fontFamily: theme.font.monoSemi, fontSize: theme.size.tag, letterSpacing: 0.6 },
  tagAccent: { backgroundColor: theme.color.accent, color: theme.color.bg },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: `rgba(0, 0, 0, ${theme.dim})` },
  name: { marginTop: 8, color: theme.color.text, fontFamily: theme.font.displaySemi, fontSize: theme.size.card },
  dimText: { opacity: 0.62 },
  meta: { marginTop: 2, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.tag + 2 },
})
```
`apps/mobile/src/components/CollectionTile.tsx`:
```tsx
import { Image } from 'expo-image'
import { Pressable, StyleSheet, View } from 'react-native'
import type { Collection } from '@go10/core/collections/types'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { theme } from '../theme'

/** A brand card (apps/web/src/components/CollectionTile.tsx): the logo on its colour, no text. */
export function CollectionTile({ collection, imageBase, onSelect }: { collection: Collection; imageBase: string; onSelect: (c: Collection) => void }) {
  const { color, background } = collection.tile
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={collection.name}
      onPress={() => onSelect(collection)}
      style={({ focused }) => [styles.tile, focused && styles.tileFocused]}
    >
      {({ focused }) => (
        <View testID="tile-surface" style={[styles.surface, { backgroundColor: color }, focused && styles.surfaceFocused]}>
          {background && <Image testID="tile-background" source={{ uri: imageSrc(background, imageBase) }} style={StyleSheet.absoluteFill} contentFit="cover" />}
          <Image testID="tile-logo" source={{ uri: imageSrc(collection.logo, imageBase) }} style={styles.logo} contentFit="contain" />
          {!focused && <View style={styles.dim} pointerEvents="none" />}
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tile: { width: theme.tile.width, height: theme.tile.height },
  tileFocused: { transform: [{ scale: theme.focusScale }], zIndex: 2 },
  surface: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.hairline },
  surfaceFocused: { borderWidth: 3, borderColor: theme.color.accent },
  logo: { width: '70%', height: '62%' },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: `rgba(0, 0, 0, ${theme.dim})` },
})
```
`apps/mobile/src/components/Row.tsx`:
```tsx
import { ScrollView, StyleSheet, Text, TVFocusGuideView, View } from 'react-native'
import type { CatalogRowGroup } from '@go10/core/catalog/buildRows'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'
import { Card } from './Card'

/**
 * One labelled row of cards. The focus guide's autoFocus sends D-pad focus
 * entering the row to the card last focused in it, instead of whichever card
 * is geometrically nearest (Android TV's default). Rows are capped at 20
 * titles (core's ROW_LIMIT), so every card is rendered and focus can never
 * target one that isn't mounted.
 */
export function Row({ group, imageBase, onSelect }: { group: CatalogRowGroup; imageBase: string; onSelect: (title: Title) => void }) {
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={styles.label}>
        {group.label}
        <Text style={styles.count}>{`  ${group.titles.length}`}</Text>
      </Text>
      <TVFocusGuideView autoFocus>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
          {group.titles.map((title) => (
            <Card key={`${group.id}:${title.key}`} title={title} imageBase={imageBase} onSelect={onSelect} />
          ))}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { marginBottom: theme.space.rowGap },
  label: { marginLeft: theme.space.safeX, marginBottom: 8, color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.section },
  count: { color: theme.color.textMuted, fontFamily: theme.font.monoMedium, fontSize: theme.size.tag + 2 },
  // Vertical padding leaves room for the focused card's 1.09 scale.
  track: { paddingHorizontal: theme.space.safeX, paddingVertical: 10, gap: theme.space.gap },
})
```
The `Row` test finds the count text `2` inside the label's nested `Text`. If it only matches the whole label (`'Series  2'`), change the assertion to `screen.getByText(/Series\s+2/)`: test mechanics only, ledger it.

`apps/mobile/src/components/CollectionStrip.tsx`:
```tsx
import { ScrollView, StyleSheet, TVFocusGuideView } from 'react-native'
import type { Collection } from '@go10/core/collections/types'
import { theme } from '../theme'
import { CollectionTile } from './CollectionTile'

/** The brand tiles under the hero: one focus row, no heading (web: .go-strip). */
export function CollectionStrip({ collections, imageBase, onSelect }: { collections: Collection[]; imageBase: string; onSelect: (c: Collection) => void }) {
  return (
    <TVFocusGuideView autoFocus style={styles.strip}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
        {collections.map((collection) => (
          <CollectionTile key={collection.id} collection={collection} imageBase={imageBase} onSelect={onSelect} />
        ))}
      </ScrollView>
    </TVFocusGuideView>
  )
}

const styles = StyleSheet.create({
  strip: { marginBottom: theme.space.rowGap / 2 },
  track: { paddingHorizontal: theme.space.safeX, paddingVertical: 10, gap: theme.space.gap },
})
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @go10/mobile 2>&1 | grep -E "Tests:"; npm run typecheck -w @go10/mobile; echo typecheck=$?`
Expected: `Tests: 52 passed, 52 total` (44 + 8) and `typecheck=0`. `TitleList.tsx` may still fail typecheck; see Task 2 Step 5.
If `TVFocusGuideView` renders as `undefined` in Jest (the component isn't in the preset's mocks), check `node_modules/react-native/Libraries/Components/TV/TVFocusGuideView.js`. It is plain JS and should render as a `View`. If it doesn't, add `jest.mock` in a Jest setup file mapping it to `View`, and ledger that.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components
git commit -m "feat(mobile): catalog cards, collection tiles and focus-guided rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The hero

**Files:**
- Create: `apps/mobile/src/components/Hero.tsx`
- Test: `apps/mobile/src/components/Hero.test.tsx`

**Interfaces:**
- Consumes: `heroMeta` (Task 1); `theme` (Task 2); `imageSrc`; `expo-linear-gradient`'s `LinearGradient`; `HomeModel['featuredArt']` (Task 3).
- Produces: `Hero({ title, art, imageBase, onPlay, onInfo })`, with the buttons labelled `Reproducir` and `Más información`. `Reproducir` has `hasTVPreferredFocus`.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/components/Hero.test.tsx`:
```tsx
import { render, screen, userEvent } from '@testing-library/react-native'
import type { CatalogRow, Title } from '@go10/core/types'
import { Hero } from './Hero'

const spidey: Title = {
  key: 'spidey', kind: 'show', title: 'Spidey y sus Sorprendentes Amigos', year: 2021, studio: 'Disney', source: '',
  genre: 'Animación', genre_secondary: 'Infantil', quality: '1080p', language: 'Español', subtitled: false,
  thumbnail: 'assets/spidey/thumb.webp', views: 0, durationSeconds: 0, catalogIndex: 0,
  seasons: [{ season_number: 1 }, { season_number: 2 }] as CatalogRow[],
}
const ART = { small: 'assets/spidey/spidey-hero-960.webp', large: 'assets/spidey/spidey-hero-1920.webp' }
const IMG = 'https://tv.test/'

describe('Hero', () => {
  it('presents the featured title like the web hero', async () => {
    await render(<Hero title={spidey} art={ART} imageBase={IMG} onPlay={jest.fn()} onInfo={jest.fn()} />)
    expect(screen.getByText('Destacado')).toBeTruthy()
    expect(screen.getByText(/Serie · Disney/)).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Spidey y sus Sorprendentes Amigos' })).toBeTruthy()
    expect(screen.getByText('2 temporadas')).toBeTruthy()
    expect(screen.getByText('Animación')).toBeTruthy()
    expect(screen.getByText('Infantil')).toBeTruthy()
    expect(screen.getByTestId('hero-art').props.source).toEqual([{ uri: 'https://tv.test/assets/spidey/spidey-hero-1920.webp' }])
  })

  it('plays and opens the title from its two buttons, Reproducir taking focus first on TV', async () => {
    const onPlay = jest.fn()
    const onInfo = jest.fn()
    await render(<Hero title={spidey} art={ART} imageBase={IMG} onPlay={onPlay} onInfo={onInfo} />)
    const play = screen.getByRole('button', { name: 'Reproducir' })
    expect(play.props.hasTVPreferredFocus).toBe(true)
    const user = userEvent.setup()
    await user.press(play)
    await user.press(screen.getByRole('button', { name: 'Más información' }))
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onInfo).toHaveBeenCalledTimes(1)
  })

  it('without key art, blurs the thumbnail behind and shows it crisp', async () => {
    await render(<Hero title={{ ...spidey, key: 'other' }} art={null} imageBase={IMG} onPlay={jest.fn()} onInfo={jest.fn()} />)
    expect(screen.queryByTestId('hero-art')).toBeNull()
    expect(screen.getByTestId('hero-backdrop').props.source).toEqual([{ uri: 'https://tv.test/assets/spidey/thumb.webp' }])
    expect(screen.getByTestId('hero-thumb').props.source).toEqual([{ uri: 'https://tv.test/assets/spidey/thumb.webp' }])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @go10/mobile -- src/components/Hero`
Expected: FAIL with `Cannot find module './Hero'`.

- [ ] **Step 3: Implement**

`apps/mobile/src/components/Hero.tsx`:
```tsx
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { heroMeta } from '@go10/core/catalog/describeTitle'
import { imageSrc } from '@go10/core/lib/imageSrc'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'

const BG = theme.color.bg
const tv = Platform.isTV

function HeroButton({ label, primary, preferred, onPress, icon }: { label: string; primary?: boolean; preferred?: boolean; onPress: () => void; icon: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hasTVPreferredFocus={preferred}
      onPress={onPress}
      style={({ focused }) => [styles.button, primary ? styles.primary : styles.secondary, focused && styles.buttonFocused]}
    >
      {({ focused }) => (
        <View style={styles.buttonInner}>
          {icon}
          <Text style={[styles.buttonText, (primary || focused) && styles.buttonTextOnAccent]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

/** The Home hero (apps/web/src/screens/Home.tsx + Home.css): key art or a blurred backdrop, then the title block. */
export function Hero({ title, art, imageBase, onPlay, onInfo }: {
  title: Title
  art: { small: string; large: string } | null
  imageBase: string
  onPlay: () => void
  onInfo: () => void
}) {
  const { width } = useWindowDimensions()
  const isShow = title.kind === 'show'
  // TV: full-bleed art with the text over its left side. Phone: 16:9 art on top, text over its foot.
  const artHeight = tv ? Math.min(width * 0.5, 540 * 0.8) : width * 0.5625

  return (
    <View style={[styles.hero, { minHeight: tv ? artHeight : undefined }]}>
      {art ? (
        <View style={[styles.stage, !tv && { height: artHeight, bottom: undefined }]} pointerEvents="none">
          <Image testID="hero-art" source={{ uri: imageSrc(tv ? art.large : art.small, imageBase) }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={tv ? { top: '20%' } : 'center'} />
          {tv ? (
            <LinearGradient colors={['rgba(8,9,12,0.94)', 'rgba(8,9,12,0.82)', 'rgba(8,9,12,0.4)', 'rgba(8,9,12,0)']} locations={[0, 0.24, 0.44, 0.62]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          ) : null}
          <LinearGradient colors={['rgba(8,9,12,0)', 'rgba(8,9,12,0.6)', BG]} locations={[0.5, 0.78, 1]} style={StyleSheet.absoluteFill} />
        </View>
      ) : (
        <View style={styles.stage} pointerEvents="none">
          <Image testID="hero-backdrop" source={{ uri: imageSrc(title.thumbnail, imageBase) }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,9,12,0.55)' }]} />
          <LinearGradient colors={['rgba(8,9,12,0)', BG]} locations={[0.55, 1]} style={StyleSheet.absoluteFill} />
        </View>
      )}

      <View style={[styles.body, art && !tv && { paddingTop: artHeight - 48 }, art && tv && styles.bodyOverArt]}>
        <View style={styles.eyebrowRow}>
          <Text style={styles.badge}>Destacado</Text>
          <Text style={styles.eyebrow}>{`${isShow ? 'Serie' : 'Película'}${title.studio ? ` · ${title.studio}` : ''}`}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>{title.title}</Text>
        <View style={styles.metaRow}>
          {heroMeta(title).map((item, index) => (
            <View key={index} style={styles.metaItem}>
              {index > 0 && <View style={styles.sep} />}
              <Text style={styles.meta}>{item}</Text>
            </View>
          ))}
        </View>
        <View style={styles.genres}>
          {[title.genre, title.genre_secondary].filter(Boolean).map((genre) => (
            <Text key={genre} style={styles.chip}>{genre}</Text>
          ))}
        </View>
        <View style={styles.actions}>
          <HeroButton label="Reproducir" primary preferred onPress={onPlay} icon={<View style={styles.playIcon} />} />
          <HeroButton label="Más información" onPress={onInfo} icon={<Text style={styles.infoIcon}>i</Text>} />
        </View>
      </View>

      {!art && !tv ? null : !art ? (
        <Image testID="hero-thumb" source={{ uri: imageSrc(title.thumbnail, imageBase) }} style={styles.thumb} contentFit="cover" />
      ) : null}
      {!art && !tv && <Image testID="hero-thumb" source={{ uri: imageSrc(title.thumbnail, imageBase) }} style={styles.thumbPhone} contentFit="cover" />}
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { position: 'relative', justifyContent: 'flex-end', paddingHorizontal: theme.space.safeX, paddingBottom: tv ? 28 : 36, paddingTop: tv ? 40 : 24 },
  stage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', backgroundColor: BG },
  body: { maxWidth: tv ? 352 : undefined },
  bodyOverArt: { maxWidth: 384 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.color.accent, color: BG, fontFamily: theme.font.monoSemi, fontSize: theme.size.eyebrow, letterSpacing: 1.8, textTransform: 'uppercase' },
  eyebrow: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.eyebrow, letterSpacing: 2, textTransform: 'uppercase' },
  title: { color: theme.color.text, fontFamily: theme.font.displayHeavy, fontSize: theme.size.hero, lineHeight: theme.size.hero * 1.02, letterSpacing: -theme.size.hero * 0.03, marginBottom: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  sep: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 10, backgroundColor: theme.color.textMeta },
  meta: { color: theme.color.textMeta, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.hairline, color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.tag + 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  button: { borderRadius: theme.radius, paddingHorizontal: tv ? 18 : 22, paddingVertical: tv ? 9 : 13 },
  primary: { backgroundColor: theme.color.accent },
  secondary: { backgroundColor: 'rgba(242,244,240,0.12)', borderWidth: 1, borderColor: 'rgba(242,244,240,0.16)' },
  buttonFocused: { backgroundColor: theme.color.accent, transform: [{ scale: 1.04 }] },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonText: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
  buttonTextOnAccent: { color: BG },
  playIcon: { width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderLeftWidth: 11, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: BG },
  infoIcon: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: theme.color.text, color: theme.color.text, textAlign: 'center', fontFamily: theme.font.monoSemi, fontSize: 11, lineHeight: 14 },
  thumb: { position: 'absolute', right: theme.space.safeX, bottom: 28, width: 184, height: 105, borderRadius: theme.radius },
  thumbPhone: { width: '100%', aspectRatio: 368 / 210, borderRadius: theme.radius, marginTop: 20 },
})
```
The two `hero-thumb` branches cover different devices. TV shows the crisp thumbnail at the right. On a phone the web's `.go-hero_art` is `display: none` under 900 px, but with no key art the hero would be just text on blur, so the phone shows the thumbnail below the text. **Simplify before committing:** keep a single `{!art && <Image testID="hero-thumb" … style={tv ? styles.thumb : styles.thumbPhone} />}` and delete the two conditional blocks above. The test only needs one `hero-thumb`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -w @go10/mobile 2>&1 | grep -E "Tests:"; npm run typecheck -w @go10/mobile; echo typecheck=$?`
Expected: `Tests: 55 passed, 55 total` and `typecheck=0` (see Task 2 Step 5 about `TitleList.tsx`).
If `contentPosition={{ top: '20%' }}` doesn't typecheck in this expo-image version, use `contentPosition="top"`, and ledger it.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/Hero.tsx apps/mobile/src/components/Hero.test.tsx
git commit -m "feat(mobile): the Home hero

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `HomeView` and the Home route

**Files:**
- Create: `apps/mobile/src/components/HomeView.tsx`
- Modify: `apps/mobile/src/components/HomeContent.tsx`, `apps/mobile/src/components/HomeContent.test.tsx`, `apps/mobile/src/app/index.tsx`
- Delete: `apps/mobile/src/components/TitleList.tsx`, `apps/mobile/src/components/TitleList.test.tsx`
- Test: `apps/mobile/src/components/HomeView.test.tsx`

**Interfaces:**
- Consumes: `HomeModel`, `buildHome` (Task 3); `Hero` (Task 5); `Row`, `CollectionStrip` (Task 4); `CatalogState` (Phase 2).
- Produces:
  - `HomeView({ model, imageBase, onSelectTitle, onPlayTitle, onSelectCollection })`
  - `HomeContent({ state, onRetry, imageBase, onSelectTitle, onPlayTitle, onSelectCollection })`

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/components/HomeView.test.tsx`:
```tsx
import { render, screen, userEvent } from '@testing-library/react-native'
import type { Collection } from '@go10/core/collections/types'
import type { Title } from '@go10/core/types'
import type { HomeModel } from '../home/homeModel'
import { HomeView } from './HomeView'

const title = (key: string): Title => ({
  key, kind: 'movie', title: `Título ${key}`, year: 2001, studio: '', source: '', genre: '', genre_secondary: '',
  quality: '', language: '', subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})
const pixar: Collection = { id: 'pixar', name: 'Pixar', order: 1, logo: 'assets/collections/pixar/logo.svg', tile: { color: '#000' }, titles: ['a'] }

function model(overrides: Partial<HomeModel> = {}): HomeModel {
  return {
    featured: title('a'),
    featuredArt: null,
    strip: [pixar],
    rows: [
      { id: 'recientes', label: 'Recién añadidos', titles: [title('a'), title('b')] },
      { id: 'series', label: 'Series', titles: [title('c')] },
    ],
    ...overrides,
  }
}
const handlers = () => ({ onSelectTitle: jest.fn(), onPlayTitle: jest.fn(), onSelectCollection: jest.fn() })

describe('HomeView', () => {
  it('stacks the hero, the collection strip and the rows', async () => {
    await render(<HomeView model={model()} imageBase="https://tv.test/" {...handlers()} />)
    expect(screen.getByRole('header', { name: 'Título a' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pixar' })).toBeTruthy()
    expect(screen.getByRole('header', { name: /Recién añadidos/ })).toBeTruthy()
    expect(screen.getByRole('header', { name: /Series/ })).toBeTruthy()
  })

  it('routes each kind of press to its handler', async () => {
    const h = handlers()
    await render(<HomeView model={model()} imageBase="https://tv.test/" {...h} />)
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Reproducir' }))
    await user.press(screen.getByRole('button', { name: 'Más información' }))
    await user.press(screen.getByRole('button', { name: 'Pixar' }))
    await user.press(screen.getByRole('button', { name: 'Título c' }))
    expect(h.onPlayTitle).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }))
    expect(h.onSelectTitle).toHaveBeenNthCalledWith(1, expect.objectContaining({ key: 'a' }))
    expect(h.onSelectCollection).toHaveBeenCalledWith(pixar)
    expect(h.onSelectTitle).toHaveBeenNthCalledWith(2, expect.objectContaining({ key: 'c' }))
  })

  it('leaves the strip out when no collection is visible', async () => {
    await render(<HomeView model={model({ strip: [] })} imageBase="https://tv.test/" {...handlers()} />)
    expect(screen.queryByRole('button', { name: 'Pixar' })).toBeNull()
    expect(screen.getByRole('header', { name: /Recién añadidos/ })).toBeTruthy()
  })
})
```
Replace `apps/mobile/src/components/HomeContent.test.tsx` with:
```tsx
import { render, screen } from '@testing-library/react-native'
import type { Title } from '@go10/core/types'
import { HomeContent } from './HomeContent'

const props = { onRetry: jest.fn(), imageBase: 'https://tv.test/', onSelectTitle: jest.fn(), onPlayTitle: jest.fn(), onSelectCollection: jest.fn() }
const title: Title = {
  key: 'a', kind: 'movie', title: 'Coraje', year: 2001, studio: '', source: '', genre: '', genre_secondary: '',
  quality: '', language: '', subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
}

describe('HomeContent', () => {
  it('shows a spinner while loading', async () => {
    await render(<HomeContent state={{ status: 'loading' }} {...props} />)
    expect(screen.getByLabelText('Cargando catálogo')).toBeTruthy()
  })

  it('shows the offline screen on error', async () => {
    await render(<HomeContent state={{ status: 'error' }} {...props} />)
    expect(screen.getByText('Sin conexión')).toBeTruthy()
  })

  it('shows Home when ready', async () => {
    await render(<HomeContent state={{ status: 'ready', data: { rows: [], collections: [], titles: [title] } }} {...props} />)
    expect(screen.getByRole('header', { name: 'Coraje' })).toBeTruthy()
  })

  it('says the catalog is empty instead of showing a blank Home', async () => {
    await render(<HomeContent state={{ status: 'ready', data: { rows: [], collections: [], titles: [] } }} {...props} />)
    expect(screen.getByText('El catálogo está vacío.')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @go10/mobile -- src/components/HomeView src/components/HomeContent`
Expected: FAIL with `Cannot find module './HomeView'`. HomeContent's "shows Home when ready" and "empty" tests fail too, since it still renders `TitleList`.

- [ ] **Step 3: Implement**

`apps/mobile/src/components/HomeView.tsx`:
```tsx
import { FlatList, StyleSheet } from 'react-native'
import type { Collection } from '@go10/core/collections/types'
import type { Title } from '@go10/core/types'
import type { HomeModel } from '../home/homeModel'
import { theme } from '../theme'
import { CollectionStrip } from './CollectionStrip'
import { Hero } from './Hero'
import { Row } from './Row'

type Section = { kind: 'hero' } | { kind: 'strip' } | { kind: 'row'; index: number }

/**
 * Home as one vertical list of sections, so only the rows near the viewport
 * are mounted (28 rows x 20 cards is too many images to hold at once). The
 * window is generous so a row focused by the D-pad is always mounted.
 */
export function HomeView({ model, imageBase, onSelectTitle, onPlayTitle, onSelectCollection }: {
  model: HomeModel
  imageBase: string
  onSelectTitle: (title: Title) => void
  onPlayTitle: (title: Title) => void
  onSelectCollection: (collection: Collection) => void
}) {
  const sections: Section[] = [
    { kind: 'hero' },
    ...(model.strip.length > 0 ? [{ kind: 'strip' } as const] : []),
    ...model.rows.map((_, index) => ({ kind: 'row', index }) as const),
  ]
  return (
    <FlatList
      style={styles.root}
      data={sections}
      keyExtractor={(s) => (s.kind === 'row' ? model.rows[s.index].id : s.kind)}
      initialNumToRender={4}
      windowSize={7}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => {
        if (item.kind === 'hero') {
          return (
            <Hero
              title={model.featured}
              art={model.featuredArt}
              imageBase={imageBase}
              onPlay={() => onPlayTitle(model.featured)}
              onInfo={() => onSelectTitle(model.featured)}
            />
          )
        }
        if (item.kind === 'strip') return <CollectionStrip collections={model.strip} imageBase={imageBase} onSelect={onSelectCollection} />
        return <Row group={model.rows[item.index]} imageBase={imageBase} onSelect={onSelectTitle} />
      }}
    />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
})
```
Replace `apps/mobile/src/components/HomeContent.tsx` with:
```tsx
import { StyleSheet, Text, View } from 'react-native'
import type { Collection } from '@go10/core/collections/types'
import type { Title } from '@go10/core/types'
import type { CatalogState } from '../data/catalogStore'
import { buildHome } from '../home/homeModel'
import { theme } from '../theme'
import { HomeView } from './HomeView'
import { LoadingScreen } from './LoadingScreen'
import { OfflineScreen } from './OfflineScreen'

export function HomeContent({ state, onRetry, imageBase, onSelectTitle, onPlayTitle, onSelectCollection }: {
  state: CatalogState
  onRetry: () => void
  imageBase: string
  onSelectTitle: (title: Title) => void
  onPlayTitle: (title: Title) => void
  onSelectCollection: (collection: Collection) => void
}) {
  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <OfflineScreen onRetry={onRetry} />
  const model = buildHome(state.data)
  if (!model) {
    return (
      <View style={styles.empty}>
        <Text style={styles.mark}>GO10 TV</Text>
        <Text style={styles.msg}>El catálogo está vacío.</Text>
      </View>
    )
  }
  return <HomeView model={model} imageBase={imageBase} onSelectTitle={onSelectTitle} onPlayTitle={onPlayTitle} onSelectCollection={onSelectCollection} />
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.color.bg },
  mark: { color: theme.color.accent, fontFamily: theme.font.displayHeavy, fontSize: theme.size.section },
  msg: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.body },
})
```
`buildHome` runs every render. That's cheap next to rendering, but wrap it in `useMemo(() => …, [state])` if the typecheck/lint setup asks for hooks-safe ordering; hooks must then sit above the early returns. The simplest correct form is to compute `const model = state.status === 'ready' ? buildHome(state.data) : null` with `useMemo` at the top.

Replace `apps/mobile/src/app/index.tsx` with:
```tsx
import { router, useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { HomeContent } from '../components/HomeContent'
import { appExtra, siteBase } from '../config/appConfig'
import { useCatalog } from '../data/CatalogProvider'

const imageBase = siteBase(appExtra().siteUrl)

export default function Home() {
  const { state, store } = useCatalog()
  // A background refresh is applied on arriving at Home, never mid-browse.
  useFocusEffect(useCallback(() => store.applyPending(), [store]))
  return (
    <HomeContent
      state={state}
      onRetry={() => void store.retry()}
      imageBase={imageBase}
      onSelectTitle={(title) => router.push({ pathname: '/title/[key]', params: { key: title.key } })}
      // Playback arrives in Phase 4; until then Reproducir opens the title too.
      onPlayTitle={(title) => router.push({ pathname: '/title/[key]', params: { key: title.key } })}
      onSelectCollection={(c) => router.push({ pathname: '/coleccion/[id]', params: { id: c.id } })}
    />
  )
}
```
Delete `apps/mobile/src/components/TitleList.tsx` and `TitleList.test.tsx`.

- [ ] **Step 4: Run tests, typecheck, bundle**

Run:
```bash
npm test -w @go10/mobile 2>&1 | grep -E "Tests:"
npm run typecheck -w @go10/mobile; echo typecheck=$?
cd apps/mobile && EXPO_TV=1 npx expo export --platform android --output-dir /tmp/p3-export > /tmp/p3-export.log 2>&1; echo export=$?; cd ../..
```
Expected: `Tests: 57 passed, 57 total`. The arithmetic: 55 + 3 HomeView + 1 new HomeContent − 2 TitleList = 57. Also `typecheck=0` and `export=0`.
If `router.push({ pathname: '/title/[key]', … })` fails typecheck because typed routes aren't generated, use `router.push(\`/title/${encodeURIComponent(title.key)}\`)` (and the same for the collection), and ledger it.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mobile/src
git commit -m "feat(mobile): Home with hero, collection strip and every catalog row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: On the phone, the TV checklist, docs

**Files:**
- Create: `docs/superpowers/tv-checklist.md`
- Modify: `docs/superpowers/specs/2026-09-26-android-app-design.md` (Phase 3 status), `README.md` (test count)

**Interfaces:**
- Consumes: everything above.
- Produces: Phase 3 confirmed on the phone, and a written checklist of what a TV must still confirm.

- [ ] **Step 1: Rebuild and install**

This phase added native modules (expo-font, expo-linear-gradient), so a new native build is needed. Run in the background:
```bash
cd apps/mobile && export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
npm run prebuild > /tmp/p3-prebuild.log 2>&1 && (cd android && ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a > /tmp/p3-gradle.log 2>&1); echo exit=$?
adb -s ZY22MTK86Z install -r android/app/build/outputs/apk/debug/app-debug.apk && adb -s ZY22MTK86Z reverse tcp:8081 tcp:8081
```
Start Metro from `apps/mobile` in the background (`EXPO_TV=1 npx expo start --port 8081 < /dev/null`), then launch with `adb -s ZY22MTK86Z shell monkey -p blog.go10.tv -c android.intent.category.LAUNCHER 1`. Check `adb -s ZY22MTK86Z logcat -d -s ReactNativeJS:V AndroidRuntime:E | tail -20` for errors.

- [ ] **Step 2: The phone check (user)**

Ask the user to compare against the web app open on the same phone (`https://tv.go10.blog`) and confirm:
1. The hero shows Spidey's key art full-width, with the "Destacado · Serie · Disney" eyebrow, the title in the display font, the meta line, the genre chips, and the Reproducir and Más información buttons.
2. The collection tiles scroll sideways, showing logos on their colours.
3. The rows run top to bottom, starting "Recién añadidos 20", "Series 20", and so on. Each row scrolls sideways and the page scrolls smoothly top to bottom.
4. Tapping a card opens a screen named after that title; Back returns to Home **at the same scroll position**. Tapping a tile does the same for the collection.
5. Fonts match the web: Bricolage headings and Plex Mono metadata.

Record anything that looks off compared with the web. Fix sizing or spacing in `theme.ts` only if the user asks, then hot-reload.

- [ ] **Step 3: Write the TV checklist**

`docs/superpowers/tv-checklist.md`:
```markdown
# Android TV checklist (run on real hardware)

Deferred from the phone-only phases. Run with the remote on a Google TV / Android TV device.

## From Phase 0 (player spike)
- [ ] Every remote key (D-pad, Select, Play/Pause, FF/RW) reaches `useTVEventHandler` while a WebView plays, with the WebView `focusable={false}`.
- [ ] The remote's Back reaches `BackHandler`.
- [ ] Autoplay and `timeupdate` work on the TV's system WebView.
- [ ] The app shows in the launcher's app row with its banner.

## From Phase 3 (Home)
- [ ] On launch, focus starts on the hero's **Reproducir**.
- [ ] Down from the hero lands on the collection strip, then row by row; focus never disappears.
- [ ] Moving down into a row, then back up and down again, returns to the card last focused in that row (focus guides), not the nearest card.
- [ ] Right along a row scrolls it; the focused card is fully visible, scaled up and ringed in lime.
- [ ] Holding Down through all rows keeps up (virtualised list mounts rows before focus reaches them).
- [ ] Select on a card opens its screen; Back returns to Home with focus on that same card.
- [ ] Unfocused cards are dimmed; the focused one is at full brightness.
```

- [ ] **Step 4: Docs and full verification**

In the spec's *Phases* table, prefix the Phase 3 "Done when" cell with `✅ Done <date> (phone; TV focus in docs/superpowers/tv-checklist.md).` In `README.md`'s Tests section, update the `npm test` line with the real counts.
Run:
```bash
npm test 2>&1 | grep -E "Tests:|Tests "
python3 -m pytest tests -q 2>&1 | tail -1
npm run typecheck > /dev/null 2>&1; echo typecheck=$?
npm run build > /dev/null 2>&1; echo build=$?
```
Expected: core 245, web 180, mobile 57; Python 92; `typecheck=0`; `build=0`.
```bash
git add docs/superpowers/tv-checklist.md docs/superpowers/specs/2026-09-26-android-app-design.md README.md
git commit -m "docs: Phase 3 done on the phone, and the TV checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
