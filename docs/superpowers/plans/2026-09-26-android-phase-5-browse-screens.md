# Android Phase 5 — Seguir viendo, catalog, search, collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every remaining web screen gets a mobile counterpart: Home's "Seguir viendo" row, the Películas / Series grids, search (with "Quizás te interese"), and the collection pages, plus the navbar that reaches them.

**Architecture:** Two pure web-local helpers (Seguir viendo's card label, the catalog heading) move into `packages/core` and the web uses them from there. The mobile app gains a virtualised `CatalogGrid` (FlatList, `numColumns`) that the section, search and collection screens share; a `Navbar` overlay on Home and the section pages; a dedicated `/buscar` screen whose input owns the keyboard (typing never navigates, so the IME never closes). Navigation helpers live in one module so every screen routes the same way.

**Tech Stack:** Expo SDK 57, react-native-tvos 0.86, expo-router (`push`, `replace`, `dismissAll`), expo-image, react-native-safe-area-context; Jest + RNTL 14 (mobile), Vitest (core, web).

**Spec:** `docs/superpowers/specs/2026-09-26-android-app-design.md` (Phase 5 row; *Routes → screens*, *TV focus*, *Search on TV*, *Error handling*).

## Global Constraints

- Full parity: catalog grids (Películas / Series), search (incl. "Quizás te interese"), collections, Seguir viendo.
- Routes: `/peliculas`, `/series`, `/buscar?q=&en=&solo=` (one Catalog screen), `/coleccion/[id]`. Back is the stack; Back on Home exits the app. Unknown route or missing key → Home.
- TV focus: every card is a `Pressable`; grids are FlatLists with a generous `windowSize`; initial focus via `hasTVPreferredFocus`: Catalog → first result. Returning via Back restores focus to the item that opened the next screen.
- Search on TV: the input opens Android's IME; results update as you type (debounced); Down moves from the input to the first result. The web's custom typing mode is not ported.
- Faithful port, not a redesign; Spanish copy verbatim from the web: "Seguir viendo", "Siguiente: …", "Películas", "Series", "Catálogo", `Resultados para "…"`, `Sin resultados para "…"`, "Quizás te interese", "No hay títulos.", "Buscar", "Buscar en Películas", "Ir al inicio".
- External titles (TMDB, "Solo catálogo", the source chip, snapshots in Seguir viendo) are Phase 6: search here is catalog-only.
- Testing on the user's phone only; TV items go to `docs/superpowers/tv-checklist.md`.

## Review Focus

1. **A search that matches nothing** — shows `Sin resultados para "…"`, "Quizás te interese" and the fallback titles, never an empty screen. Pinned in Task 3 (`suggests near titles when nothing matches`).
2. **Rapid typing** — the grid only recomputes after typing pauses, and the text field never loses what was typed. Pinned in Task 5 (`useDebounced` tests; `results follow the typed query after a pause`).
3. **A collection id that no longer resolves, or resolves to zero catalog titles** — Home, not a blank page. Pinned in Task 6 through core's `resolveRoute` (`not-found`) plus the route's Redirect; the core rule is already tested (`resolveRoute.test.ts`).
4. **Seguir viendo for a finished last episode** — the title drops out (titleProgress `start`), and a finished episode with a next one shows "Siguiente: T1 · E3" with no bar. Pinned in Task 1 (`continueCardProgress`) and Task 2 (`Seguir viendo` HomeView test).
5. **The 774-title Películas grid** — virtualised, not 774 mounted cards. Pinned in Task 3 (`mounts a window of cards, not all of them`).

---

### Task 1: Core — Seguir viendo labels and the catalog heading, shared with the web

**Files:**
- Modify: `packages/core/src/progress/describe.ts`, `packages/core/src/progress/describe.test.ts`
- Create: `packages/core/src/catalog/catalogHeading.ts`, `packages/core/src/catalog/catalogHeading.test.ts`
- Modify: `apps/web/src/screens/Home.tsx`, `apps/web/src/screens/Catalog.tsx`, `apps/web/src/components/Card.tsx`

**Interfaces:**
- Produces:
  - `interface CardProgress { fraction: number; label: string }` and `continueCardProgress(item: ContinueItem): CardProgress` in `progress/describe.ts`
  - `SECTION_LABELS: Record<Section, string>` and `catalogHeading(mode: SearchMode, section: Section, query: string): string` in `catalog/catalogHeading.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/progress/describe.test.ts` (add `continueCardProgress` to the `./describe` import, and `import type { ContinueItem } from './titleProgress'`):

```ts
describe('continueCardProgress', () => {
  const show = { kind: 'show' } as Title
  const movieRow = { ...row, type: 'movie' } as CatalogRow
  const item = (progress: ContinueItem['progress']): ContinueItem => ({ title: show, progress })

  it('shows the played share and what is left of the episode in progress', () => {
    expect(continueCardProgress(item({ row, mode: 'resume', progress: p(720), updatedAt: 1 })))
      .toEqual({ fraction: 0.5, label: 'T1 · E2 · Quedan 12 min' })
    expect(continueCardProgress(item({ row: movieRow, mode: 'resume', progress: p(720), updatedAt: 1 })))
      .toEqual({ fraction: 0.5, label: 'Quedan 12 min' })
  })

  it('names the next episode, with no bar, once the last one was finished', () => {
    expect(continueCardProgress(item({ row, mode: 'next', progress: null, updatedAt: 1 })))
      .toEqual({ fraction: 0, label: 'Siguiente: T1 · E2' })
  })
})
```

`packages/core/src/catalog/catalogHeading.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { catalogHeading } from './catalogHeading'

describe('catalogHeading', () => {
  it('names the section when browsing', () => {
    expect(catalogHeading('browse', 'movie', '')).toBe('Películas')
    expect(catalogHeading('browse', 'show', '')).toBe('Series')
    expect(catalogHeading('browse', 'all', '')).toBe('Catálogo')
  })

  it('quotes the trimmed query for results and for suggestions', () => {
    expect(catalogHeading('results', 'all', ' dragon ')).toBe('Resultados para "dragon"')
    expect(catalogHeading('searching', 'all', 'dragon')).toBe('Resultados para "dragon"')
    expect(catalogHeading('suggestions', 'movie', 'zzz')).toBe('Sin resultados para "zzz"')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/core -- src/progress/describe.test.ts src/catalog/catalogHeading.test.ts`
Expected: FAIL — `continueCardProgress` not exported; `./catalogHeading` not found.

- [ ] **Step 3: Implement**

Append to `packages/core/src/progress/describe.ts` (and add `import { playedFraction, type ContinueItem } from './titleProgress'` to its imports):

```ts
/** Shown on "Seguir viendo" cards in place of the usual year/genre line. */
export interface CardProgress {
  fraction: number
  label: string
}

/** A Seguir viendo card: the share played and what is left, or the episode that comes next. */
export function continueCardProgress({ progress }: ContinueItem): CardProgress {
  const position = rowLabel(progress.row)
  if (progress.mode === 'next' || !progress.progress) {
    return { fraction: 0, label: `Siguiente${position ? `: ${position}` : ''}` }
  }
  return {
    fraction: playedFraction(progress.progress),
    label: [position, remainingLabel(progress.progress)].filter(Boolean).join(' · '),
  }
}
```

`packages/core/src/catalog/catalogHeading.ts`:

```ts
import type { SearchMode } from '../external/mergeSearch'
import type { Section } from './selectTitles'

export const SECTION_LABELS: Record<Section, string> = {
  all: 'Catálogo',
  movie: 'Películas',
  show: 'Series',
}

/** The catalog screen's heading: the section when browsing, the query when searching. */
export function catalogHeading(mode: SearchMode, section: Section, query: string): string {
  if (mode === 'results' || mode === 'searching') return `Resultados para "${query.trim()}"`
  if (mode === 'suggestions') return `Sin resultados para "${query.trim()}"`
  return SECTION_LABELS[section]
}
```

Web rewires:
- `apps/web/src/screens/Home.tsx`: delete the local `continueCardProgress` function at the end of the file; import it with `import { continueCardProgress, remainingLabel, rowLabel } from '@go10/core/progress/describe'` (replacing the existing `remainingLabel, rowLabel` import); drop `type CardProgress` from the `../components/Card` import (remove that import line if it becomes empty) and drop `type ContinueItem` from the titleProgress import if now unused.
- `apps/web/src/components/Card.tsx`: replace the local `CardProgress` interface (and its comment) with `export type { CardProgress } from '@go10/core/progress/describe'` plus `import type { CardProgress } from '@go10/core/progress/describe'`.
- `apps/web/src/screens/Catalog.tsx`: delete the local `SECTION_LABELS` and `heading`; `import { catalogHeading } from '@go10/core/catalog/catalogHeading'`; the `<h1>` uses `{catalogHeading(shown.mode, section, query)}`.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/core && npm test -w @go10/web && npm run typecheck -w @go10/web && npm run typecheck -w @go10/core`
Expected: all pass (core 269, web 180); typechecks exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src apps/web/src
git commit -m "feat(core): Seguir viendo card labels and the catalog heading, shared with the web"
```

---

### Task 2: Mobile — Seguir viendo on Home, and the hero's resume line

**Files:**
- Modify: `apps/mobile/src/components/Card.tsx`, `Card.test.tsx`
- Modify: `apps/mobile/src/components/Row.tsx`
- Modify: `apps/mobile/src/home/homeModel.ts`, `homeModel.test.ts` (the model gains `titles`)
- Modify: `apps/mobile/src/components/HomeView.tsx`, `HomeView.test.tsx`
- Modify: `apps/mobile/src/components/Hero.tsx`, `Hero.test.tsx`

**Interfaces:**
- Consumes: Task 1 `continueCardProgress`, `CardProgress`; core `continueWatching`, `ROW_LIMIT`, `remainingLabel`, `playedFraction`.
- Produces:
  - `Card` gains `progress?: CardProgress`, `width?: number`, `preferred?: boolean`.
  - `Row` gains `progressFor?: (title: Title) => CardProgress | undefined`.
  - `HomeModel` gains `titles: Title[]`.
  - `homeSections(model: HomeModel, continueCount = 0)` returns `{ kind: 'strip' } | { kind: 'continue' } | { kind: 'row'; index }` in that order.

- [ ] **Step 1: Write the failing tests**

Append to `Card.test.tsx` (inside the describe):

```tsx
  it('shows a Seguir viendo progress bar and label instead of the meta line', async () => {
    await render(<Card title={title()} imageBase={IMG} onSelect={jest.fn()} progress={{ fraction: 0.5, label: 'Quedan 12 min' }} />)
    expect(screen.getByText('Quedan 12 min')).toBeTruthy()
    expect(screen.queryByText('2001 · Animación')).toBeNull()
    expect(screen.getByTestId('progress')).toBeTruthy()
  })

  it('takes a width for grids and can ask for TV focus first', async () => {
    await render(<Card title={title()} imageBase={IMG} onSelect={jest.fn()} width={160} preferred />)
    const card = screen.getByRole('button', { name: 'Coraje' })
    expect(card.props.hasTVPreferredFocus).toBe(true)
    expect(screen.getByTestId('card-frame')).toHaveStyle({ width: 160, height: 90 })
  })
```

In `HomeView.test.tsx`: add `import type { Progress } from '@go10/core/progress/progressStore'`; the `model()` factory gains `titles: [title('a'), title('b'), title('c')],`; the section test becomes:

```tsx
  it('keeps the hero out of the virtualised sections, so it never remounts and re-takes TV focus', async () => {
    expect(homeSections(model()).map((s) => s.kind)).toEqual(['strip', 'row', 'row'])
    expect(homeSections(model({ strip: [] })).map((s) => s.kind)).toEqual(['row', 'row'])
    expect(homeSections(model(), 1).map((s) => s.kind)).toEqual(['strip', 'continue', 'row', 'row'])
  })
```

and append:

```tsx
  it('shows Seguir viendo with progress, and plays straight from it', async () => {
    const h = handlers()
    const progress: Record<string, Progress> = { b1: { time: 600, duration: 1200, updatedAt: 5, watched: false } }
    await render(<HomeView progress={progress} model={model()} imageBase="https://tv.test/" {...h} />)
    expect(screen.getByRole('header', { name: /Seguir viendo/ })).toBeTruthy()
    expect(screen.getByText('Quedan 10 min')).toBeTruthy()
    await userEvent.setup().press(screen.getAllByRole('button', { name: 'Título b' })[0])
    expect(h.onPlayTitle).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }), expect.objectContaining({ video_id: 'b1' }))
  })

  it('has no Seguir viendo row when nothing is in progress', async () => {
    await render(<HomeView progress={{}} model={model()} imageBase="https://tv.test/" {...handlers()} />)
    expect(screen.queryByRole('header', { name: /Seguir viendo/ })).toBeNull()
  })
```

In `homeModel.test.ts`, add to its first expectation that `buildHome(...)!.titles` equals the input titles:

```ts
  it('keeps every title, for Seguir viendo', () => {
    const data = { rows: [], collections: [], titles: [title('a'), title('b')] }
    expect(buildHome(data)!.titles).toBe(data.titles)
  })
```

(use whatever title factory `homeModel.test.ts` already defines; if its name differs, use that name.)

Append to `Hero.test.tsx`:

```tsx
  it('shows how much is left under the buttons while resuming', async () => {
    const row = { type: 'episode', season_number: 2, episode_number: 5 } as CatalogRow
    const progress = { row, mode: 'resume' as const, progress: { time: 700, duration: 1400, updatedAt: 1, watched: false }, updatedAt: 1 }
    await render(<Hero title={spidey} art={ART} imageBase={IMG} progress={progress} onPlay={jest.fn()} onInfo={jest.fn()} />)
    expect(screen.getByText('Quedan 11 min')).toBeTruthy()
    expect(screen.getByTestId('progress')).toBeTruthy()
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/mobile -- src/components/Card.test.tsx src/components/HomeView.test.tsx src/components/Hero.test.tsx src/home`
Expected: FAIL — no progress label, no `card-frame`, no 'continue' section, no Seguir viendo header, no 'Quedan 11 min'.

- [ ] **Step 3: Implement**

`Card.tsx` becomes:

```tsx
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { cardMeta, seasonCount } from '@go10/core/catalog/describeTitle'
import { imageSrc } from '@go10/core/lib/imageSrc'
import type { CardProgress } from '@go10/core/progress/describe'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'
import { ProgressBar } from './ProgressBar'

/** A catalog card (apps/web/src/components/Card.tsx): art, tags, name, year · genre (or Seguir viendo's progress). */
export function Card({ title, imageBase, onSelect, progress, width = theme.card.width, preferred }: {
  title: Title
  imageBase: string
  onSelect: (title: Title) => void
  progress?: CardProgress
  /** Grids size their cards to the screen; rows use the theme's card width. */
  width?: number
  /** The first result of a grid takes TV focus when the screen opens. */
  preferred?: boolean
}) {
  const seasons = seasonCount(title)
  const height = Math.round(width * 0.5625)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title.title}
      hasTVPreferredFocus={preferred}
      onPress={() => onSelect(title)}
      style={({ focused }) => [styles.card, { width }, focused && styles.cardFocused]}
    >
      {({ focused }) => (
        <>
          <View testID="card-frame" style={[styles.frame, { width, height }, focused && styles.frameFocused]}>
            {title.thumbnail !== '' && (
              <Image testID="card-image" source={{ uri: imageSrc(title.thumbnail, imageBase) }} style={styles.image} contentFit="cover" />
            )}
            <View style={styles.tags}>
              {title.quality === '4K' && <Text style={[styles.tag, styles.tagAccent]}>4K</Text>}
              {title.kind === 'show' && seasons > 0 && (
                <Text style={styles.tag}>{`${seasons} ${seasons === 1 ? 'Temporada' : 'Temporadas'}`}</Text>
              )}
            </View>
            {progress && <ProgressBar fraction={progress.fraction} style={styles.progress} />}
            {!focused && <View style={styles.dim} pointerEvents="none" />}
          </View>
          <Text style={[styles.name, !focused && styles.dimText]} numberOfLines={1}>{title.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{progress ? progress.label : cardMeta(title)}</Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {},
  cardFocused: { transform: [{ scale: theme.focusScale }], zIndex: 2 },
  frame: { borderRadius: theme.radius, overflow: 'hidden', backgroundColor: theme.color.bgRaised, borderWidth: 1, borderColor: theme.color.hairline },
  frameFocused: { borderWidth: 3, borderColor: theme.color.accent },
  image: { width: '100%', height: '100%' },
  tags: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 4 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.color.scrim, color: theme.color.text, fontFamily: theme.font.monoSemi, fontSize: theme.size.tag, letterSpacing: 0.6 },
  tagAccent: { backgroundColor: theme.color.accent, color: theme.color.bg },
  progress: { position: 'absolute', left: 8, right: 8, bottom: 8, height: 3 },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: `rgba(0, 0, 0, ${theme.dim})` },
  name: { marginTop: 8, color: theme.color.text, fontFamily: theme.font.displaySemi, fontSize: theme.size.card },
  dimText: { opacity: 0.62 },
  meta: { marginTop: 2, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.tag + 2 },
})
```

`Row.tsx`: add the prop `progressFor?: (title: Title) => CardProgress | undefined` (import the type from `@go10/core/progress/describe`), destructure it, and pass `progress={progressFor?.(title)}` to each `Card`.

`homeModel.ts`: add `/** Every title, for Seguir viendo. */ titles: Title[]` to `HomeModel`, `titles: data.titles,` to the returned object, and change the doc line to `/** The web Home's layout decisions (apps/web/src/screens/Home.tsx); Seguir viendo is built by HomeView from live progress. */`.

`HomeView.tsx`:
- Imports: add `import { ROW_LIMIT, type CatalogRowGroup } from '@go10/core/catalog/buildRows'`, `import { continueCardProgress } from '@go10/core/progress/describe'`, and `continueWatching` to the titleProgress import.
- `Section` gains `| { kind: 'continue' }`; `homeSections` becomes:

```ts
/** The virtualised part of Home: the strip (when any collection shows), Seguir viendo (when anything is in progress), the rows. The hero is the list header. */
export function homeSections(model: HomeModel, continueCount = 0): Section[] {
  return [
    ...(model.strip.length > 0 ? [{ kind: 'strip' } as const] : []),
    ...(continueCount > 0 ? [{ kind: 'continue' } as const] : []),
    ...model.rows.map((_, index) => ({ kind: 'row', index }) as const),
  ]
}
```

- In the body, before `sections`:

```ts
  // Re-read on arriving at Home (the screen passes fresh progress), like the web's per-mount read.
  const continueItems = useMemo(
    () => continueWatching(model.titles, progress).slice(0, ROW_LIMIT),
    [model.titles, progress],
  )
  const continueByKey = useMemo(() => new Map(continueItems.map((item) => [item.title.key, item])), [continueItems])
  const continueGroup: CatalogRowGroup = { id: 'seguir-viendo', label: 'Seguir viendo', titles: continueItems.map((item) => item.title) }
  const sections = homeSections(model, continueItems.length)
```

- `keyExtractor`: `(s) => (s.kind === 'row' ? model.rows[s.index].id : s.kind)` stays (it already covers `continue`).
- `renderItem` gains, before the row case:

```tsx
        if (item.kind === 'continue') {
          return (
            <Row
              group={continueGroup}
              imageBase={imageBase}
              // Seguir viendo skips Detail and plays the resume target.
              onSelect={(title) => {
                const entry = continueByKey.get(title.key)
                if (entry) onPlayTitle(title, entry.progress.row)
              }}
              progressFor={(title) => {
                const entry = continueByKey.get(title.key)
                return entry && continueCardProgress(entry)
              }}
            />
          )
        }
```

`Hero.tsx`: import `ProgressBar` from `./ProgressBar`, `remainingLabel` alongside `rowLabel`, and `playedFraction` from `@go10/core/progress/titleProgress`. After the actions `View`, add:

```tsx
        {resuming && progress?.progress && (
          <View style={styles.resume}>
            <ProgressBar fraction={playedFraction(progress.progress)} style={styles.resumeBar} />
            <Text style={styles.resumeText}>{remainingLabel(progress.progress)}</Text>
          </View>
        )}
```

with styles `resume: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }`, `resumeBar: { width: 96, height: 3 }`, `resumeText: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta }`.

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/mobile && npm run typecheck -w @go10/mobile`
Expected: all pass (mobile 103); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): Seguir viendo on Home, and the hero's resume line"
```

---

### Task 3: Mobile — the catalog grid and CatalogView

**Files:**
- Create: `apps/mobile/src/catalog/gridLayout.ts`, `gridLayout.test.ts`
- Create: `apps/mobile/src/components/CatalogGrid.tsx`
- Create: `apps/mobile/src/components/CatalogView.tsx`, `CatalogView.test.tsx`

**Interfaces:**
- Consumes: Task 1 `catalogHeading`; Task 2 `Card` (`width`, `preferred`); core `selectTitles`.
- Produces:
  - `catalogGrid(available: number, cardWidth: number, gap: number, phone: boolean): { columns: number; card: number }`
  - `CatalogGrid({ titles, imageBase, onSelect, header?, empty?, preferFirst? })`
  - `CatalogView({ titles, section, query, imageBase, onSelect, top?, preferFirst? })` — `top` is the space left for an overlaid navbar.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/catalog/gridLayout.test.ts`:

```ts
import { catalogGrid } from './gridLayout'

describe('catalogGrid', () => {
  it('fills a phone with two cards per line', () => {
    expect(catalogGrid(372, 240, 12, true)).toEqual({ columns: 2, card: 180 })
  })

  it('fits as many fixed-width cards as the TV allows', () => {
    expect(catalogGrid(880, 192, 10, false)).toEqual({ columns: 4, card: 192 })
    expect(catalogGrid(100, 192, 10, false)).toEqual({ columns: 1, card: 192 })
  })
})
```

`apps/mobile/src/components/CatalogView.test.tsx`:

```tsx
import { render, screen, userEvent } from '@testing-library/react-native'
import type { Title } from '@go10/core/types'
import { CatalogView } from './CatalogView'

const t = (key: string, title: string, kind: Title['kind'] = 'movie'): Title => ({
  key, kind, title, year: 2001, studio: '', source: '', genre: '', genre_secondary: '', quality: '', language: '',
  subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})
const titles = [t('a', 'Coraje'), t('b', 'Dragon Ball', 'show'), t('c', 'Digimon', 'show')]
const IMG = 'https://tv.test/'

describe('CatalogView', () => {
  it('browses a section with its name and count, first card focused on TV', async () => {
    await render(<CatalogView titles={titles} section="show" query="" imageBase={IMG} onSelect={jest.fn()} preferFirst />)
    expect(screen.getByRole('header', { name: /Series/ })).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dragon Ball' }).props.hasTVPreferredFocus).toBe(true)
    expect(screen.getByRole('button', { name: 'Digimon' }).props.hasTVPreferredFocus).toBeFalsy()
    expect(screen.queryByRole('button', { name: 'Coraje' })).toBeNull()
  })

  it('shows search results and opens the one pressed', async () => {
    const onSelect = jest.fn()
    await render(<CatalogView titles={titles} section="all" query="dragon" imageBase={IMG} onSelect={onSelect} />)
    expect(screen.getByRole('header', { name: /Resultados para "dragon"/ })).toBeTruthy()
    await userEvent.setup().press(screen.getByRole('button', { name: 'Dragon Ball' }))
    expect(onSelect).toHaveBeenCalledWith(titles[1])
  })

  it('suggests near titles when nothing matches', async () => {
    await render(<CatalogView titles={titles} section="all" query="zzzz" imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByRole('header', { name: /Sin resultados para "zzzz"/ })).toBeTruthy()
    expect(screen.getByText('Quizás te interese')).toBeTruthy()
    expect(screen.getAllByRole('button').length).toBe(3)
  })

  it('says so when a section has nothing', async () => {
    await render(<CatalogView titles={[titles[0]]} section="show" query="" imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByText('No hay títulos.')).toBeTruthy()
  })

  it('mounts a window of cards, not all of them', async () => {
    const many = Array.from({ length: 300 }, (_, i) => t(`m${i}`, `Película ${i}`))
    await render(<CatalogView titles={many} section="movie" query="" imageBase={IMG} onSelect={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Película 0' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Película 299' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/mobile -- src/catalog src/components/CatalogView.test.tsx`
Expected: FAIL — `./gridLayout` and `./CatalogView` not found.

- [ ] **Step 3: Implement**

`apps/mobile/src/catalog/gridLayout.ts`:

```ts
/**
 * The catalog grid's columns (apps/web/src/screens/Catalog.css): a phone
 * gets two cards per line that fill the screen; a TV as many fixed-width
 * cards as fit, left-aligned.
 */
export function catalogGrid(available: number, cardWidth: number, gap: number, phone: boolean): { columns: number; card: number } {
  if (phone) return { columns: 2, card: Math.floor((available - gap) / 2) }
  return { columns: Math.max(1, Math.floor((available + gap) / (cardWidth + gap))), card: cardWidth }
}
```

`apps/mobile/src/components/CatalogGrid.tsx`:

```tsx
import type { ReactElement } from 'react'
import { FlatList, Platform, StyleSheet, useWindowDimensions } from 'react-native'
import type { Title } from '@go10/core/types'
import { catalogGrid } from '../catalog/gridLayout'
import { theme } from '../theme'
import { Card } from './Card'

/**
 * Titles as a virtualised grid (the web's CatalogGrid batches 60 cards at a
 * time for the same reason: Películas alone is 774 titles). The window is
 * generous so D-pad focus never targets an unmounted card.
 */
export function CatalogGrid({ titles, imageBase, onSelect, header, empty, preferFirst }: {
  titles: Title[]
  imageBase: string
  onSelect: (title: Title) => void
  header?: ReactElement
  empty?: ReactElement
  /** TV: the first card takes focus when the screen opens. */
  preferFirst?: boolean
}) {
  const { width } = useWindowDimensions()
  const { columns, card } = catalogGrid(width - theme.space.safeX * 2, theme.card.width, theme.space.gap, !Platform.isTV)
  return (
    <FlatList
      // numColumns can't change on a mounted FlatList.
      key={columns}
      style={styles.root}
      data={titles}
      numColumns={columns}
      keyExtractor={(title) => title.key}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      columnWrapperStyle={columns > 1 ? styles.line : undefined}
      contentContainerStyle={styles.content}
      initialNumToRender={columns * 4}
      windowSize={9}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => (
        <Card title={item} imageBase={imageBase} onSelect={onSelect} width={card} preferred={preferFirst && index === 0} />
      )}
    />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  content: { paddingBottom: theme.space.safeY * 2 },
  // Room for the focused card's scale-up, as in the Home rows.
  line: { gap: theme.space.gap, paddingHorizontal: theme.space.safeX, paddingVertical: Platform.isTV ? 10 : 12 },
})
```

Note: with `numColumns={1}` there is no `columnWrapperStyle`, so a single-column TV grid is only reached at widths under one card; the padding then comes from `content` being edge-to-edge — acceptable for that degenerate case.

`apps/mobile/src/components/CatalogView.tsx`:

```tsx
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { catalogHeading } from '@go10/core/catalog/catalogHeading'
import { selectTitles, type Section } from '@go10/core/catalog/selectTitles'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'
import { CatalogGrid } from './CatalogGrid'

/**
 * Every title matching a section and/or a query (apps/web/src/screens/Catalog.tsx),
 * catalog-only until Phase 6 brings TMDB: the same view serves Películas,
 * Series and search results.
 */
export function CatalogView({ titles, section, query, imageBase, onSelect, top = 0, preferFirst }: {
  titles: Title[]
  section: Section
  query: string
  imageBase: string
  onSelect: (title: Title) => void
  /** Room above the heading for an overlaid navbar. */
  top?: number
  preferFirst?: boolean
}) {
  const selection = useMemo(() => selectTitles(titles, section, query), [titles, section, query])
  const counted = selection.mode === 'results' || selection.mode === 'browse'

  const header = (
    <View style={[styles.head, { paddingTop: top + 16 }]}>
      <Text accessibilityRole="header" style={styles.title}>
        {catalogHeading(selection.mode, section, query)}
        {counted && <Text style={styles.count}>{`  ${selection.titles.length}`}</Text>}
      </Text>
      {selection.mode === 'suggestions' && <Text style={styles.sub}>Quizás te interese</Text>}
    </View>
  )

  return (
    <CatalogGrid
      // A new filter starts again at the top.
      key={`${section}|${query.trim()}`}
      titles={selection.titles}
      imageBase={imageBase}
      onSelect={onSelect}
      header={header}
      empty={<Text style={styles.empty}>No hay títulos.</Text>}
      preferFirst={preferFirst}
    />
  )
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: theme.space.safeX, paddingBottom: 4 },
  title: { color: theme.color.text, fontFamily: theme.font.displayHeavy, fontSize: theme.size.section * 1.3, letterSpacing: -theme.size.section * 0.02 },
  count: { color: theme.color.textMuted, fontFamily: theme.font.monoMedium, fontSize: theme.size.tag + 3 },
  sub: { marginTop: 8, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta, letterSpacing: 2.5, textTransform: 'uppercase' },
  empty: { marginHorizontal: theme.space.safeX, marginTop: 24, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.body },
})
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/mobile -- src/catalog src/components/CatalogView.test.tsx && npm run typecheck -w @go10/mobile`
Expected: PASS (7 tests); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/catalog apps/mobile/src/components/CatalogGrid.tsx apps/mobile/src/components/CatalogView.tsx apps/mobile/src/components/CatalogView.test.tsx
git commit -m "feat(mobile): a virtualised catalog grid, and the catalog view with search headings"
```

---

### Task 4: Mobile — the navbar, Películas / Series screens, one navigation module

**Files:**
- Create: `apps/mobile/src/browse/navigate.ts`
- Create: `apps/mobile/src/components/Navbar.tsx`, `Navbar.test.tsx`
- Create: `apps/mobile/src/browse/SectionScreen.tsx`
- Create: `apps/mobile/src/app/peliculas.tsx`, `apps/mobile/src/app/series.tsx`
- Modify: `apps/mobile/src/components/HomeView.tsx`, `HomeContent.tsx` (navbar overlay, two new handlers), their tests' handler objects
- Modify: `apps/mobile/src/app/index.tsx`, `apps/mobile/src/app/title/[key]/index.tsx` (use the navigation module)

**Interfaces:**
- Consumes: Task 3 `CatalogView`.
- Produces:
  - `navigate.ts`: `openTitle(title)`, `playTitle(title, row)`, `openCollection(collection)`, `openSection(section: 'movie' | 'show', replace: boolean)`, `openSearch(section: Section)`, `goHome()`
  - `NAV_HEIGHT` (tv 44, phone 56) and `Navbar({ section, onHome?, onSection, onSearch }: { section: Section; onHome?: () => void; onSection: (section: 'movie' | 'show') => void; onSearch: () => void })` — absolutely positioned at the top, under the status bar inset.
  - `HomeView` / `HomeContent` gain `onOpenSection(section: 'movie' | 'show')` and `onSearch()`.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/components/Navbar.test.tsx`:

```tsx
import { render, screen, userEvent } from '@testing-library/react-native'
import { Navbar } from './Navbar'

describe('Navbar', () => {
  it('opens the sections and search, marking the one on screen', async () => {
    const onSection = jest.fn()
    const onSearch = jest.fn()
    const onHome = jest.fn()
    await render(<Navbar section="movie" onHome={onHome} onSection={onSection} onSearch={onSearch} />)
    expect(screen.getByRole('button', { name: 'Películas' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByRole('button', { name: 'Series' }).props.accessibilityState).toMatchObject({ selected: false })
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Series' }))
    await user.press(screen.getByRole('button', { name: 'Buscar' }))
    await user.press(screen.getByRole('button', { name: 'Ir al inicio' }))
    expect(onSection).toHaveBeenCalledWith('show')
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onHome).toHaveBeenCalledTimes(1)
  })

  it('pressing the section already on screen does nothing', async () => {
    const onSection = jest.fn()
    await render(<Navbar section="movie" onSection={onSection} onSearch={jest.fn()} />)
    await userEvent.setup().press(screen.getByRole('button', { name: 'Películas' }))
    expect(onSection).not.toHaveBeenCalled()
  })

  it('on Home the wordmark is not a button', async () => {
    await render(<Navbar section="all" onSection={jest.fn()} onSearch={jest.fn()} />)
    expect(screen.queryByRole('button', { name: 'Ir al inicio' })).toBeNull()
    expect(screen.getByText('GO10 TV')).toBeTruthy()
  })
})
```

Also append to `HomeView.test.tsx`:

```tsx
  it('reaches Películas, Series and search from the navbar', async () => {
    const h = handlers()
    await render(<HomeView progress={{}} model={model()} imageBase="https://tv.test/" {...h} />)
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Películas' }))
    await user.press(screen.getByRole('button', { name: 'Buscar' }))
    expect(h.onOpenSection).toHaveBeenCalledWith('movie')
    expect(h.onSearch).toHaveBeenCalledTimes(1)
  })
```

and extend its `handlers` factory with `onOpenSection: jest.fn(), onSearch: jest.fn()`; in `HomeContent.test.tsx` add the same two to `props`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @go10/mobile -- src/components/Navbar.test.tsx src/components/HomeView.test.tsx`
Expected: FAIL — `./Navbar` not found; no 'Películas' button on Home.

- [ ] **Step 3: Implement**

`apps/mobile/src/browse/navigate.ts`:

```ts
import { router } from 'expo-router'
import { rowKey } from '@go10/core/catalog/rowKey'
import type { Collection } from '@go10/core/collections/types'
import type { Section } from '@go10/core/catalog/selectTitles'
import type { CatalogRow, Title } from '@go10/core/types'

/** Every screen routes through here, so Back behaves the same wherever a title was opened. */
export function openTitle(title: Title): void {
  router.push({ pathname: '/title/[key]', params: { key: title.key } })
}

export function playTitle(title: Title, row: CatalogRow): void {
  router.push({ pathname: '/title/[key]/play/[videoId]', params: { key: title.key, videoId: rowKey(row) } })
}

export function openCollection(collection: Collection): void {
  router.push({ pathname: '/coleccion/[id]', params: { id: collection.id } })
}

/** From Home a section stacks; from the other section it swaps in place, so Back still lands on Home. */
export function openSection(section: 'movie' | 'show', replace: boolean): void {
  const href = section === 'movie' ? '/peliculas' : '/series'
  if (replace) router.replace(href)
  else router.push(href)
}

/** The search screen, scoped to the section it was opened from (`en`, as on the web's /buscar). */
export function openSearch(section: Section): void {
  if (section === 'all') router.push('/buscar')
  else router.push({ pathname: '/buscar', params: { en: section === 'movie' ? 'peliculas' : 'series' } })
}

/** Back to Home, dropping everything stacked above it. */
export function goHome(): void {
  if (router.canDismiss()) router.dismissAll()
}
```

`apps/mobile/src/components/Navbar.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SECTION_LABELS } from '@go10/core/catalog/catalogHeading'
import type { Section } from '@go10/core/catalog/selectTitles'
import { theme } from '../theme'

const tv = Platform.isTV
export const NAV_HEIGHT = tv ? 44 : 56

function NavLink({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ focused }) => [styles.link, focused && styles.linkFocused]}
    >
      {({ focused }) => <Text style={[styles.linkText, active && styles.linkActive, focused && styles.onAccent]}>{label}</Text>}
    </Pressable>
  )
}

/**
 * The web navbar (apps/web/src/components/Navbar.tsx), overlaid on the top of
 * Home and the section pages: wordmark, Películas, Series, and a search
 * button that opens the search screen (typing lives there, so the IME never
 * closes on a navigation).
 */
export function Navbar({ section, onHome, onSection, onSearch }: {
  section: Section
  /** Absent on Home itself, where the wordmark is just a mark. */
  onHome?: () => void
  onSection: (section: 'movie' | 'show') => void
  onSearch: () => void
}) {
  const insets = useSafeAreaInsets()
  const mark = (
    <View style={styles.wordmark}>
      <View style={styles.dot} />
      <Text style={styles.wordmarkText}>GO10 TV</Text>
    </View>
  )
  return (
    <View style={[styles.root, { paddingTop: insets.top, height: NAV_HEIGHT + insets.top }]}>
      <LinearGradient colors={['rgba(8, 9, 12, 0.92)', 'rgba(8, 9, 12, 0)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {onHome ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Ir al inicio" onPress={onHome} style={({ focused }) => [styles.markButton, focused && styles.linkFocused]}>
          {mark}
        </Pressable>
      ) : (
        mark
      )}
      <View style={styles.links}>
        {(['movie', 'show'] as const).map((target) => (
          <NavLink key={target} label={SECTION_LABELS[target]} active={section === target} onPress={() => section !== target && onSection(target)} />
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Buscar" onPress={onSearch} style={({ focused }) => [styles.search, focused && styles.linkFocused]}>
        {({ focused }) => (
          <>
            <Ionicons name="search" size={tv ? 12 : 20} color={focused ? theme.color.bg : theme.color.text} />
            {tv && <Text style={[styles.linkText, focused && styles.onAccent]}>Buscar</Text>}
          </>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: tv ? 16 : 10, paddingHorizontal: theme.space.safeX },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markButton: { borderRadius: theme.radius, paddingHorizontal: 4, paddingVertical: 2 },
  dot: { width: tv ? 6 : 8, height: tv ? 6 : 8, borderRadius: 4, backgroundColor: theme.color.accent },
  wordmarkText: { color: theme.color.text, fontFamily: theme.font.displayHeavy, fontSize: tv ? 11 : 17, letterSpacing: -0.3 },
  links: { flex: 1, flexDirection: 'row', gap: 4 },
  link: { borderRadius: 999, paddingHorizontal: tv ? 10 : 10, paddingVertical: tv ? 4 : 8 },
  linkFocused: { backgroundColor: theme.color.accent },
  linkText: { color: theme.color.textMuted, fontFamily: theme.font.displayBold, fontSize: tv ? 9 : 15 },
  linkActive: { color: theme.color.text },
  onAccent: { color: theme.color.bg },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: tv ? 10 : 10, paddingVertical: tv ? 4 : 8 },
})
```

`HomeView.tsx`: add props `onOpenSection: (section: 'movie' | 'show') => void` and `onSearch: () => void`; wrap the returned `FlatList` in `<View style={styles.root}>…</View>` (move `styles.root` from the list to the wrapper and give the list `style={styles.list}` with `list: { flex: 1 }`), and render after the list:

```tsx
      <Navbar section="all" onSection={onOpenSection} onSearch={onSearch} />
```

(import `View` from react-native and `Navbar` from `./Navbar`). `HomeContent.tsx`: add and pass through the same two props.

`apps/mobile/src/browse/SectionScreen.tsx`:

```tsx
import { Redirect } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CatalogView } from '../components/CatalogView'
import { LoadingScreen } from '../components/LoadingScreen'
import { NAV_HEIGHT, Navbar } from '../components/Navbar'
import { appExtra, siteBase } from '../config/appConfig'
import { useCatalog } from '../data/CatalogProvider'
import { theme } from '../theme'
import { goHome, openSearch, openSection, openTitle } from './navigate'

const imageBase = siteBase(appExtra().siteUrl)

/** Películas or Series: the section's whole grid under the navbar. */
export function SectionScreen({ section }: { section: 'movie' | 'show' }) {
  const { state } = useCatalog()
  const insets = useSafeAreaInsets()
  if (state.status === 'loading') return <LoadingScreen />
  if (state.status !== 'ready') return <Redirect href="/" />
  return (
    <View style={styles.root}>
      <CatalogView titles={state.data.titles} section={section} query="" imageBase={imageBase} onSelect={openTitle} top={NAV_HEIGHT + insets.top} preferFirst />
      <Navbar section={section} onHome={goHome} onSection={(target) => openSection(target, true)} onSearch={() => openSearch(section)} />
    </View>
  )
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: theme.color.bg } })
```

`apps/mobile/src/app/peliculas.tsx`:

```tsx
import { SectionScreen } from '../browse/SectionScreen'

export default function Peliculas() {
  return <SectionScreen section="movie" />
}
```

`apps/mobile/src/app/series.tsx`:

```tsx
import { SectionScreen } from '../browse/SectionScreen'

export default function Series() {
  return <SectionScreen section="show" />
}
```

`apps/mobile/src/app/index.tsx`: replace the inline `router.push` handlers with the navigation module — `onSelectTitle={openTitle}`, `onPlayTitle={playTitle}`, `onSelectCollection={openCollection}`, `onOpenSection={(section) => openSection(section, false)}`, `onSearch={() => openSearch('all')}`; drop the now-unused `router` and `rowKey` imports (keep `useFocusEffect`).

`apps/mobile/src/app/title/[key]/index.tsx`: `onPlay={(row) => playTitle(title, row)}` with `import { playTitle } from '../../../browse/navigate'`; drop the unused `rowKey` import.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @go10/mobile && npm run typecheck -w @go10/mobile`
Expected: all pass (mobile 108); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): navbar, Películas and Series screens, one navigation module"
```

---

### Task 5: Mobile — the search screen

**Files:**
- Create: `apps/mobile/src/hooks/useDebounced.ts`, `useDebounced.test.tsx`
- Create: `apps/mobile/src/components/SearchView.tsx`, `SearchView.test.tsx`
- Create: `apps/mobile/src/app/buscar.tsx`

**Interfaces:**
- Consumes: Task 3 `CatalogView`; Task 4 `openTitle`; core `parseRoute`, `SECTION_LABELS`.
- Produces:
  - `useDebounced<T>(value: T, ms: number): T`; `SEARCH_DEBOUNCE_MS = 250`
  - `SearchView({ titles, section, query, imageBase, onQueryChange, onSectionChange, onSelect, onBack })` — controlled: the screen owns `query` and `section`.

- [ ] **Step 1: Write the failing tests**

`apps/mobile/src/hooks/useDebounced.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react-native'
import { useDebounced } from './useDebounced'

// RNTL 14's async render and act settle through setImmediate/queueMicrotask; freezing them hangs.
beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] }))
afterEach(() => jest.useRealTimers())

describe('useDebounced', () => {
  it('follows the value only once it stops changing', async () => {
    const { result, rerender } = await renderHook(({ value }) => useDebounced(value, 250), { initialProps: { value: 'a' } })
    expect(result.current).toBe('a')
    await rerender({ value: 'ab' })
    await act(() => { jest.advanceTimersByTime(200) })
    await rerender({ value: 'abc' })
    await act(() => { jest.advanceTimersByTime(200) })
    expect(result.current).toBe('a')
    await act(() => { jest.advanceTimersByTime(60) })
    expect(result.current).toBe('abc')
  })
})
```

`apps/mobile/src/components/SearchView.test.tsx`:

```tsx
import { act, render, screen, userEvent } from '@testing-library/react-native'
import { useState } from 'react'
import type { Section } from '@go10/core/catalog/selectTitles'
import type { Title } from '@go10/core/types'
import { SearchView } from './SearchView'

const t = (key: string, title: string, kind: Title['kind'] = 'movie'): Title => ({
  key, kind, title, year: 2001, studio: '', source: '', genre: '', genre_secondary: '', quality: '', language: '',
  subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})
const titles = [t('a', 'Coraje'), t('b', 'Dragon Ball', 'show'), t('c', 'Digimon', 'show')]

function Harness({ initialSection = 'all' as Section, onSelect = jest.fn(), onBack = jest.fn() }) {
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<Section>(initialSection)
  return (
    <SearchView titles={titles} section={section} query={query} imageBase="https://tv.test/"
      onQueryChange={setQuery} onSectionChange={setSection} onSelect={onSelect} onBack={onBack} />
  )
}

beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] }))
afterEach(() => jest.useRealTimers())

describe('SearchView', () => {
  it('results follow the typed query after a pause', async () => {
    await render(<Harness />)
    const input = screen.getByPlaceholderText('Buscar')
    expect(input.props.autoFocus).toBe(true)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.type(input, 'dragon')
    expect(input.props.value).toBe('dragon')
    await act(() => { jest.advanceTimersByTime(300) })
    expect(screen.getByRole('header', { name: /Resultados para "dragon"/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dragon Ball' })).toBeTruthy()
  })

  it('scopes the search to a section from its chips', async () => {
    await render(<Harness initialSection="movie" />)
    expect(screen.getByPlaceholderText('Buscar en Películas')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Películas' }).props.accessibilityState).toMatchObject({ selected: true })
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.press(screen.getByRole('button', { name: 'Series' }))
    expect(screen.getByPlaceholderText('Buscar en Series')).toBeTruthy()
    expect(screen.getByRole('header', { name: /Series/ })).toBeTruthy()
  })

  it('clears the query from its button', async () => {
    await render(<Harness />)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).toBeNull()
    await user.type(screen.getByPlaceholderText('Buscar'), 'digi')
    await user.press(screen.getByRole('button', { name: 'Borrar búsqueda' }))
    expect(screen.getByPlaceholderText('Buscar').props.value).toBe('')
  })

  it('opens a result, and has a touch back button', async () => {
    const onSelect = jest.fn()
    const onBack = jest.fn()
    await render(<Harness onSelect={onSelect} onBack={onBack} />)
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    await user.press(screen.getByRole('button', { name: 'Coraje' }))
    await user.press(screen.getByRole('button', { name: 'Volver' }))
    expect(onSelect).toHaveBeenCalledWith(titles[0])
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @go10/mobile -- src/hooks src/components/SearchView.test.tsx`
Expected: FAIL — `./useDebounced` and `./SearchView` not found.

- [ ] **Step 3: Implement**

`apps/mobile/src/hooks/useDebounced.ts`:

```ts
import { useEffect, useState } from 'react'

/** Search re-ranks the whole catalog; typing waits this long for a pause before it does. */
export const SEARCH_DEBOUNCE_MS = 250

/** `value`, once it has held still for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
```

`apps/mobile/src/components/SearchView.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons'
import { Platform, Pressable, StyleSheet, Text, TextInput, TVFocusGuideView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SECTION_LABELS } from '@go10/core/catalog/catalogHeading'
import type { Section } from '@go10/core/catalog/selectTitles'
import type { Title } from '@go10/core/types'
import { SEARCH_DEBOUNCE_MS, useDebounced } from '../hooks/useDebounced'
import { theme } from '../theme'
import { CatalogView } from './CatalogView'

const tv = Platform.isTV
const SECTIONS: Section[] = ['all', 'movie', 'show']
const CHIP_LABELS: Record<Section, string> = { all: 'Todo', movie: SECTION_LABELS.movie, show: SECTION_LABELS.show }

/**
 * Search (the web's navbar field plus its catalog results). The input owns
 * the keyboard — the IME on TV — and results follow it after a pause. The
 * section chips replace the web's scope chip and phone menu; D-pad Down
 * from the input reaches them, then the first result.
 */
export function SearchView({ titles, section, query, imageBase, onQueryChange, onSectionChange, onSelect, onBack }: {
  titles: Title[]
  section: Section
  query: string
  imageBase: string
  onQueryChange: (query: string) => void
  onSectionChange: (section: Section) => void
  onSelect: (title: Title) => void
  onBack: () => void
}) {
  const insets = useSafeAreaInsets()
  const shown = useDebounced(query, SEARCH_DEBOUNCE_MS)
  const placeholder = section === 'all' ? 'Buscar' : `Buscar en ${SECTION_LABELS[section]}`

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + (tv ? 16 : 10) }]}>
        <View style={styles.fieldRow}>
          {!tv && (
            <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={styles.back}>
              <Ionicons name="chevron-back" size={22} color={theme.color.text} />
            </Pressable>
          )}
          <View style={styles.field}>
            <Ionicons name="search" size={tv ? 12 : 18} color={theme.color.textMuted} />
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={onQueryChange}
              placeholder={placeholder}
              placeholderTextColor={theme.color.textMuted}
              accessibilityLabel={placeholder}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              selectionColor={theme.color.accent}
            />
            {query !== '' && (
              <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => onQueryChange('')} hitSlop={8}>
                <Ionicons name="close" size={tv ? 12 : 18} color={theme.color.textMuted} />
              </Pressable>
            )}
          </View>
        </View>
        <TVFocusGuideView autoFocus style={styles.chips}>
          {SECTIONS.map((target) => {
            const selected = target === section
            return (
              <Pressable
                key={target}
                accessibilityRole="button"
                accessibilityLabel={CHIP_LABELS[target]}
                accessibilityState={{ selected }}
                onPress={() => onSectionChange(target)}
                style={({ focused }) => [styles.chip, selected && styles.chipActive, focused && styles.chipFocused]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{CHIP_LABELS[target]}</Text>
              </Pressable>
            )
          })}
        </TVFocusGuideView>
      </View>
      <CatalogView titles={titles} section={section} query={shown} imageBase={imageBase} onSelect={onSelect} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  head: { paddingHorizontal: theme.space.safeX, gap: tv ? 8 : 12 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.scrim, borderWidth: 1, borderColor: theme.color.hairline },
  field: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: tv ? 32 : 44, paddingHorizontal: 12,
    borderRadius: 999, backgroundColor: theme.color.bgRaised, borderWidth: 1, borderColor: theme.color.hairline,
  },
  input: { flex: 1, padding: 0, color: theme.color.text, fontFamily: theme.font.display, fontSize: tv ? 11 : 17 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: tv ? 10 : 14, paddingVertical: tv ? 4 : 7, borderRadius: 999, backgroundColor: 'rgba(242, 244, 240, 0.07)', borderWidth: 2, borderColor: 'transparent' },
  chipActive: { backgroundColor: theme.color.text },
  chipFocused: { borderColor: theme.color.accent },
  chipText: { color: theme.color.textMuted, fontFamily: theme.font.displayBold, fontSize: tv ? 9 : 14 },
  chipTextActive: { color: theme.color.bg },
})
```

`apps/mobile/src/app/buscar.tsx`:

```tsx
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import type { Section } from '@go10/core/catalog/selectTitles'
import { parseRoute } from '@go10/core/router/route'
import { openTitle } from '../browse/navigate'
import { LoadingScreen } from '../components/LoadingScreen'
import { SearchView } from '../components/SearchView'
import { appExtra, siteBase } from '../config/appConfig'
import { useCatalog } from '../data/CatalogProvider'

const imageBase = siteBase(appExtra().siteUrl)

/** `/buscar?q=&en=` — the web's search URL; its params seed the screen, which then owns them. */
export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; en?: string }>()
  const [query, setQuery] = useState(params.q ?? '')
  const [section, setSection] = useState<Section>(() => {
    const search = new URLSearchParams({ q: params.q || ' ', ...(params.en ? { en: params.en } : {}) })
    const route = parseRoute('/buscar', `?${search}`)
    return route.name === 'catalog' ? route.section : 'all'
  })
  const { state } = useCatalog()

  if (state.status === 'loading') return <LoadingScreen />
  if (state.status !== 'ready') return <Redirect href="/" />
  return (
    <SearchView
      titles={state.data.titles}
      section={section}
      query={query}
      imageBase={imageBase}
      onQueryChange={setQuery}
      onSectionChange={setSection}
      onSelect={openTitle}
      onBack={() => router.back()}
    />
  )
}
```

(The `q: params.q || ' '` keeps `parseRoute` from collapsing a blank query to Home before it reads `en`: a blank-but-present query still yields `browseRoute(section)`, whose `section` we keep; `browseRoute('all')` is `home`, which maps to `'all'`.)

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w @go10/mobile && npm run typecheck -w @go10/mobile`
Expected: all pass (mobile 113); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks apps/mobile/src/components/SearchView.tsx apps/mobile/src/components/SearchView.test.tsx apps/mobile/src/app/buscar.tsx
git commit -m "feat(mobile): the search screen — IME-owned input, debounced results, section chips"
```

---

### Task 6: Mobile — the collection screen

**Files:**
- Create: `apps/mobile/src/components/CollectionView.tsx`, `CollectionView.test.tsx`
- Modify: `apps/mobile/src/app/coleccion/[id].tsx`
- Delete: `apps/mobile/src/components/ComingSoon.tsx`, `ComingSoon.test.tsx` (no screen uses it any more)

**Interfaces:**
- Consumes: Task 3 `CatalogGrid`; Task 4 `openTitle`; core `resolveRoute`, `imageSrc`.
- Produces: `CollectionView({ collection, titles, imageBase, onSelect, onBack })`.

- [ ] **Step 1: Write the failing test**

`apps/mobile/src/components/CollectionView.test.tsx`:

```tsx
import { render, screen, userEvent } from '@testing-library/react-native'
import type { Collection } from '@go10/core/collections/types'
import type { Title } from '@go10/core/types'
import { CollectionView } from './CollectionView'

const t = (key: string, title: string): Title => ({
  key, kind: 'movie', title, year: 2001, studio: '', source: '', genre: '', genre_secondary: '', quality: '', language: '',
  subtitled: false, thumbnail: '', views: 0, durationSeconds: 0, catalogIndex: 0, seasons: [],
})
const pixar: Collection = {
  id: 'pixar', name: 'Pixar', order: 1, logo: 'assets/collections/pixar/logo.svg',
  tile: { color: '#123456', background: 'assets/collections/pixar/bg.webp' }, titles: ['b', 'a'],
}
const IMG = 'https://tv.test/'

describe('CollectionView', () => {
  it('heads the grid with the collection banner and keeps its order', async () => {
    await render(<CollectionView collection={pixar} titles={[t('b', 'Toy Story'), t('a', 'Cars')]} imageBase={IMG} onSelect={jest.fn()} onBack={jest.fn()} />)
    expect(screen.getByRole('header', { name: 'Pixar' })).toBeTruthy()
    expect(screen.getByTestId('collection-logo').props.source).toEqual([{ uri: 'https://tv.test/assets/collections/pixar/logo.svg' }])
    expect(screen.getByTestId('collection-background').props.source).toEqual([{ uri: 'https://tv.test/assets/collections/pixar/bg.webp' }])
    const cards = screen.getAllByRole('button').filter((b) => b.props.accessibilityLabel !== 'Volver')
    expect(cards.map((c) => c.props.accessibilityLabel)).toEqual(['Toy Story', 'Cars'])
    expect(cards[0].props.hasTVPreferredFocus).toBe(true)
  })

  it('opens a title and goes back', async () => {
    const onSelect = jest.fn()
    const onBack = jest.fn()
    const titles = [t('b', 'Toy Story')]
    await render(<CollectionView collection={{ ...pixar, tile: { color: '#000' } }} titles={titles} imageBase={IMG} onSelect={onSelect} onBack={onBack} />)
    expect(screen.queryByTestId('collection-background')).toBeNull()
    const user = userEvent.setup()
    await user.press(screen.getByRole('button', { name: 'Toy Story' }))
    await user.press(screen.getByRole('button', { name: 'Volver' }))
    expect(onSelect).toHaveBeenCalledWith(titles[0])
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -w @go10/mobile -- src/components/CollectionView.test.tsx`
Expected: FAIL — `./CollectionView` not found.

- [ ] **Step 3: Implement**

`apps/mobile/src/components/CollectionView.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Collection } from '@go10/core/collections/types'
import { imageSrc } from '@go10/core/lib/imageSrc'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'
import { CatalogGrid } from './CatalogGrid'

const tv = Platform.isTV

/**
 * One collection's titles in the order it lists them
 * (apps/web/src/screens/Collection.tsx): the logo banner is the heading.
 */
export function CollectionView({ collection, titles, imageBase, onSelect, onBack }: {
  collection: Collection
  titles: Title[]
  imageBase: string
  onSelect: (title: Title) => void
  onBack: () => void
}) {
  const insets = useSafeAreaInsets()
  const { color, background } = collection.tile

  const banner = (
    <View
      accessibilityRole="header"
      accessibilityLabel={collection.name}
      style={[styles.banner, { backgroundColor: color, marginTop: insets.top + (tv ? 24 : 64) }]}
    >
      {background && <Image testID="collection-background" source={{ uri: imageSrc(background, imageBase) }} style={StyleSheet.absoluteFill} contentFit="cover" />}
      <Image testID="collection-logo" source={{ uri: imageSrc(collection.logo, imageBase) }} style={styles.logo} contentFit="contain" />
    </View>
  )

  return (
    <View style={styles.root}>
      <CatalogGrid key={collection.id} titles={titles} imageBase={imageBase} onSelect={onSelect} header={banner} preferFirst />
      {!tv && (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={[styles.back, { top: insets.top + 10 }]}>
          <Ionicons name="chevron-back" size={22} color={theme.color.text} />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  banner: { height: tv ? 104 : 144, marginHorizontal: theme.space.safeX, marginBottom: 4, borderRadius: theme.radius, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logo: { width: '40%', height: '62%' },
  back: {
    position: 'absolute', left: theme.space.safeX, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.color.scrim, borderWidth: 1, borderColor: theme.color.hairline,
  },
})
```

`apps/mobile/src/app/coleccion/[id].tsx`:

```tsx
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { resolveRoute } from '@go10/core/router/resolveRoute'
import { openTitle } from '../../browse/navigate'
import { CollectionView } from '../../components/CollectionView'
import { LoadingScreen } from '../../components/LoadingScreen'
import { appExtra, siteBase } from '../../config/appConfig'
import { useCatalog } from '../../data/CatalogProvider'

const imageBase = siteBase(appExtra().siteUrl)

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { state } = useCatalog()
  if (state.status === 'loading') return <LoadingScreen />
  const view = state.status === 'ready' ? resolveRoute({ name: 'collection', id }, state.data.titles, state.data.collections) : null
  // Unknown, or nothing of it left in the catalog: Home.
  if (view?.name !== 'collection') return <Redirect href="/" />
  return <CollectionView collection={view.collection} titles={view.titles} imageBase={imageBase} onSelect={openTitle} onBack={() => router.back()} />
}
```

Delete `ComingSoon.tsx` and `ComingSoon.test.tsx` (`git rm`); confirm with `grep -rn ComingSoon apps/mobile/src` that nothing references it.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -w @go10/mobile && npm run typecheck -w @go10/mobile`
Expected: all pass (mobile 114 = 113 + 2 new − 1 ComingSoon test; adjust to the real count); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mobile/src
git commit -m "feat(mobile): the collection screen; ComingSoon retired"
```

---

### Task 7: Verify, build on the phone, checklists

**Files:**
- Modify: `docs/superpowers/tv-checklist.md`, `README.md`

- [ ] **Step 1: Whole-repo verification**

Run: `npm test && npm run typecheck --workspaces --if-present && npm run build -w @go10/web && python3 -m pytest tests/ -q`
Expected: every suite passes; typecheck and build exit 0.

- [ ] **Step 2: Phone build** — no new native modules, so a JS reload suffices: restart Metro (`EXPO_TV=1 npx expo start --port 8081 --clear < /dev/null`, background), `adb -s ZY22MTK86Z reverse tcp:8081 tcp:8081`, relaunch with `adb shell monkey -p blog.go10.tv -c android.intent.category.LAUNCHER 1`.
Expected: the app opens on Home with the navbar.

- [ ] **Step 3: TV checklist — append**

```markdown
## From Phase 5 (Seguir viendo, catalog, search, collections)
- [ ] Up from the hero reaches the navbar (Películas, Series, Buscar); Down returns to the hero.
- [ ] Seguir viendo sits after the collection strip; Select on a card starts playback directly; Back returns to Home with focus on that card.
- [ ] Películas / Series open with focus on the first card; Down/Right move through the grid and it keeps loading as focus goes down (no dead end at the bottom).
- [ ] Series from the Películas navbar swaps screens; Back from either goes to Home.
- [ ] Buscar opens the IME on the input; results update after a pause; Down leaves the input for the section chips, then the first result.
- [ ] A collection opens with focus on its first title; Back returns to Home with focus on its tile.
```

- [ ] **Step 4: README counts** — update the `npm test` line under "## Tests" to the real totals from Step 1, in the existing format.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/tv-checklist.md README.md
git commit -m "docs: Phase 5 TV checklist and test counts"
```

- [ ] **Step 6: Hand to the user for the phone check** — every web screen has a counterpart: Seguir viendo after watching; Películas / Series from the navbar; search (a hit, a miss with "Quizás te interese", section chips); a collection from the strip. The spec's Phase 5 row is marked done only after they confirm.
