# Search, navbar and catalog grid — design

Status: **implemented** (2026-09-23).

## Problem

Rows on Home are the only way to reach a title, and each row is capped at 20
(`ROW_LIMIT`). Of the 774 movies and 86 shows, most can't be reached at all,
and a title you already know the name of can't be looked up. The MVP spec left
"search, browse grid, and filters" out of scope. This spec brings them in.

Goal: a navbar with two links, **Películas** and **Series**, a search box that
finds titles as you type, and one reusable **catalog** screen that renders
every title matching a filter. Browsing movies is the catalog filtered to
movies, and a search is the catalog filtered by a query.

## Decisions (from brainstorming)

- **Text entry: a native `<input>`.** No on-screen keyboard grid. On Tizen and
  phones, focusing the input opens the system keyboard.
- **The search box lives in the navbar.** It's on Home and the catalog screen
  only. Detail and Player stay full-bleed, with no navbar.
- **Search matches the title only.** Genre, studio and year are not searched.
- **Search is scoped to the section you're in.** Typing while on Películas
  searches movies only. The scope is shown as a removable chip,
  `Películas ✕`, next to the input. Searches started from Home have no scope.
- **Search always shows something.** Matching uses a low fuzzy threshold. If
  nothing passes it, the closest 10 titles are shown under
  "Quizás te interese" instead of an empty state.
- **The search engine is hand-rolled.** No Fuse.js or uFuzzy: 860 titles is a
  trivial scan, and owning the tiers is what keeps clean prefix matches above
  fuzzy ones.

## 1. Routes

`Route` gains one variant:

```ts
type Section = 'all' | 'movie' | 'show'
| { name: 'catalog'; section: Section; query: string }
```

| URL | Route |
| --- | --- |
| `/peliculas` | `{ catalog, section: 'movie', query: '' }` |
| `/series` | `{ catalog, section: 'show', query: '' }` |
| `/buscar?q=spidy` | `{ catalog, section: 'all', query: 'spidy' }` |
| `/buscar?q=spidy&en=peliculas` | `{ catalog, section: 'movie', query: 'spidy' }` |
| `/buscar?q=spidy&en=series` | `{ catalog, section: 'show', query: 'spidy' }` |

- `parseRoute(pathname, search = '')` now reads the query string too.
  `/buscar` with an empty or missing `q` parses as the section browse route:
  `/peliculas`, `/series`, or Home when there's no `en`. An unknown `en` is
  ignored.
- `routeToPath` is the inverse. `section: 'all'` with an empty query maps to
  `/`, which is Home. There is no "browse everything" page.
- `useRoute` passes `location.search` on first load and on `popstate`.
- `resolveRoute` returns `{ name: 'catalog', section, query }` for it. A
  catalog route can't be "not found".

### History

- **Typing:** the keystroke that turns an empty query into a non-empty one
  **pushes** `/buscar…`. Each keystroke after that **replaces** the entry, so
  Back doesn't step through every letter.
- **Clearing the input** (query becomes empty) **replaces** the entry with the
  scope's browse route: `/peliculas`, `/series`, or `/`.
- **Removing the scope chip** replaces `/buscar?q=x&en=peliculas` with
  `/buscar?q=x`.
- **Navbar links** push `/peliculas` or `/series`, dropping any query.

### Back

- **Catalog → Home.** Escape or Backspace, handled by `FocusProvider` and only
  when the input isn't being edited (§2).
- **Detail → the browse route the title was opened from.** `App` keeps a ref,
  `lastBrowseRoute`, set whenever the resolved view is Home or catalog.
  Detail's back navigates to it (a push, like the existing back). It defaults
  to Home, which covers deep links. Opening a title from a search and backing
  out returns to that search with its query intact.
- **Player → Detail.** Unchanged.

## 2. Navbar and search box

### Layout

```
GO10 TV    Películas   Series                    [Películas ✕] [🔍 Buscar…    ]
```

- **Wordmark:** not focusable. It moves out of the hero on Home and into the
  navbar.
- **Links:** Películas and Series. The link for the current section gets an
  active style (accent underline). On Home neither is active.
- **Scope chip:** only rendered when the route is a catalog route with a query
  and a section other than `'all'`.
- **Search box:** right-aligned. Its placeholder is "Buscar", or
  "Buscar en Películas" / "Buscar en Series" when a scope applies.
- **Placement:** on Home the navbar sits at the top, above the hero. On the
  catalog screen it's sticky at the top.

### One shell, so the input keeps its keyboard

The first keystroke on Home navigates to `/buscar`. If that navigation
remounted the navbar, the input would lose DOM focus and the system keyboard
would close after one letter. So Home and the catalog render inside **one**
`FocusProvider key="browse"`, with the `Navbar` as a persistent sibling of the
screen content:

```tsx
<FocusProvider key="browse" onBack={back}>
  <Navbar route={route} navigate={navigate} />
  {resolved.name === 'home' ? <Home … /> : <Catalog … />}
</FocusProvider>
```

Switching between Home and the catalog only swaps the screen content. The
navbar and its input stay mounted, and so does the model focus on the search
box, since it's still registered.

### Focus grid

- **Navbar:** focus row **-2** on both screens. Home's hero CTA stays at -1
  and the rows start at 0. The catalog grid starts at row 0.
- **Navbar columns:** Películas (0), Series (1), scope chip (2, when present),
  search box (3).
- **Focus ids:** `nav:peliculas`, `nav:series`, `nav:scope`, `nav:search`.

### The search box has two states

1. **Selected:** the model focus is on the search box. It's a focusable
   wrapper (`tabIndex=-1`, DOM-focused like any other item, for Tizen), and
   the input inside is *not* focused. Arrow keys move on normally, so passing
   over the search box doesn't pop the keyboard up. Enter or a tap moves to
   editing.
2. **Editing:** the `<input>` itself has DOM focus and the system keyboard is
   open.
   - **Passed through to the input:** Left, Right, Backspace and printable
     keys.
   - **Enter or Down:** stop editing and move focus to the first result, if
     there is one.
   - **Up or Escape:** stop editing. The search box stays selected. Escape
     does **not** go back, so a stray Escape never throws away a query.
   - **Blur** (tapping elsewhere, or a TV IME's Done/Cancel key): stops
     editing too, so the two states can't disagree.

### FocusProvider change

Before handling a key, `FocusProvider` checks whether `document.activeElement`
is an editable element (`input`, `textarea`, or `[contenteditable]`):

- **Left, Right, Backspace:** it does nothing, letting the key reach the input.
- **Enter, Up, Down, Escape:** it still sees these, but the focusable can
  claim them. `useFocusable` gains an optional `onKey(key): boolean`. When the
  focused item returns `true`, the provider skips its default handling. The
  search box uses this to implement the editing rules above.

This is the only change to the focus core. Items that don't pass `onKey`
behave exactly as before.

## 3. Catalog screen

### Filtering

```ts
selectTitles(titles, section, query): { titles: Title[]; mode: 'browse' | 'results' | 'suggestions' }
```

- **Section filter:** titles are filtered by kind (`movie` or `show`), or not
  at all for `'all'`.
- **Empty query:** `browse`, in catalog order (newest first, as in "Recién
  añadidos").
- **Non-empty query:** the search (§4) runs over the section-filtered titles.
  `results` if anything passes the threshold, otherwise `suggestions`, which
  is the top 10 by raw score.

### Header

| Mode | Header |
| --- | --- |
| browse movies | **Películas** · 774 |
| browse shows | **Series** · 86 |
| results | **Resultados para "spidy"** · 12 |
| suggestions | **Sin resultados para "xqzv"**, with the subheading *Quizás te interese* |

The count uses the existing `go-row_count` mono style.

### Grid

- **Layout:** CSS grid, `grid-template-columns: repeat(auto-fill, var(--go-card-w))`
  with `var(--go-gap)`, using the existing `Card` unchanged.
- **Column count:** measured from the rendered grid with a `ResizeObserver`
  (the number of cards sharing the first card's `offsetTop`). When measuring
  isn't possible, as in jsdom, it defaults to 5.
- **Focus position:** card *i* gets focus row `floor(i / cols)` and col
  `i % cols`, with id `grid:${title.key}`. The existing nearest-row /
  nearest-column neighbour logic then navigates it with no changes. Moving
  Down from a short last row lands on its nearest card, and moving Up from
  row 0 reaches the navbar.

### Incremental rendering

Up to 774 focus registrations and DOM nodes at once is heavy for a TV
browser.

- **Batches:** the grid renders the first **60** cards, then 60 more whenever
  a sentinel after the last card enters an `IntersectionObserver` with a
  generous root margin (about one viewport). Moving focus down calls
  `scrollIntoView`, which scrolls the sentinel into range ahead of the last
  row, so the remote never hits a dead end.
- **Reset:** the batch goes back to 60 when section or query changes.
- **No `IntersectionObserver`** (jsdom): render everything.

### Focus when results change

- **While typing:** the model focus is on `nav:search`, which is always
  registered, so a disappearing card never strands focus.
- **Removing the scope chip:** the chip unmounts, so focus is explicitly
  moved to `nav:search` rather than left to the provider's arbitrary
  fallback.
- **Returning from Detail:** the catalog remounts and focus starts on the
  first registered item, the same as Home today. Restoring the exact card is
  out of scope.

## 4. Search engine (`src/search/search.ts`)

Pure functions with no React, unit-tested in isolation.

### Normalization

`normalize(s)` works in three steps:

1. NFD, then strip combining marks, so "Película" becomes "pelicula".
2. Lowercase.
3. Every run of non-`[a-z0-9]` characters becomes one space, then trim.

Titles are normalized once per catalog load, memoized alongside the tokens.

### Scoring

`scoreTitle(query, title) → number` in `[0, 1]`. Query `q` and title `t` are
both normalized. The first tier that matches wins:

| Tier | Condition | Score |
| --- | --- | --- |
| Title prefix | `t.startsWith(q)` | 1.0 |
| Word prefix | `q` occurs in `t` at a word start | 0.9 |
| Substring | `q` occurs anywhere in `t` | 0.8 |
| Fuzzy | otherwise | `0.7 × fuzzy(q, t)` |

**Compact forms:** the three substring tiers also compare the *compact*
forms, `q` and `t` with all spaces removed, and score 0.05 lower when only
the compact form matches. Without this, "yugioh" wouldn't find "Yu-Gi-Oh!",
which normalizes to "yu gi oh", and "spiderman" wouldn't find "Spider-Man".

`fuzzy(q, t)` is the mean over query tokens of each token's best similarity
against the title's tokens:

- `sim(a, b) = 1 − DL(a, b) / max(|a|, |b|)`, where DL is optimal-string-
  alignment Damerau-Levenshtein, so a transposition counts as one edit.
- **Prefix awareness:** a query token is compared both to the whole title
  token and to that token's prefix of length `|a|`, and the higher similarity
  wins. That way "castelv" scores well against "castlevania" while it's
  still being typed.
- **An exact prefix of a title token** counts as similarity 1.
- **Query tokens shorter than 3 characters** only score on an exact prefix
  (otherwise 0). A one-letter typo can't make "a" fuzzy-match every
  title.

**Threshold:** `MATCH_MIN = 0.42` (so `fuzzy ≥ 0.6`), which is roughly one
edit per 2.5 characters. It's deliberately low, and tuned against real
catalog titles in tests.

### Search

`search(query, titles) → { matches: Title[]; fallback: boolean }`

- **Ordering:** every title is scored and sorted by score descending, with
  catalog order breaking ties.
- **Matches:** titles with score ≥ `MATCH_MIN`, with `fallback: false`.
- **Fallback:** if none pass, the top 10 by score (score > 0 preferred, then
  catalog order) with `fallback: true`.

## Components and files

| File | Change |
| --- | --- |
| `src/router/route.ts` | `catalog` route, `Section`, query-string parse and print |
| `src/router/useRoute.ts` | pass `location.search` |
| `src/router/resolveRoute.ts` | `catalog` view |
| `src/focus/FocusProvider.tsx` | editable-element passthrough, `onKey` claim |
| `src/focus/useFocusable.ts` | optional `onKey` |
| `src/search/search.ts` | new: normalize, score, search |
| `src/catalog/selectTitles.ts` | new: section filter + search into a mode |
| `src/components/Navbar.tsx` / `.css` | new: wordmark, links, scope chip, `SearchBox` |
| `src/components/SearchBox.tsx` | new: selected/editing states |
| `src/screens/Catalog.tsx` / `.css` | new: header, measured grid, incremental rendering |
| `src/screens/Home.tsx` / `.css` | drop the wordmark from the hero, make room for the navbar |
| `src/App.tsx` | browse shell, `lastBrowseRoute`, Detail back |

## Testing

- **`search.test.ts`**
  - Normalization: accents, case, punctuation.
  - Tier ordering: a prefix outranks a fuzzy match.
  - Typo cases against real titles: "spidy" → Spidey, "castelvania" →
    Castlevania, "yugioh" → Yu-Gi-Oh!.
  - Partial words while typing: "castelv".
  - Short tokens don't fuzzy-match.
  - Fallback returns 10 titles, flagged as a fallback.
- **`selectTitles.test.ts`**
  - Section filtering.
  - Browse order is catalog order.
  - Results vs suggestions mode.
- **`route.test.ts` / `resolveRoute.test.ts`**
  - Every URL in §1 round-trips.
  - An empty `q` collapses to the browse route.
  - An unknown `en` is ignored.
- **`FocusProvider.test.tsx`**
  - Left, Right and Backspace are ignored while an input has DOM focus.
  - An `onKey` claim suppresses the default handling.
  - Existing behavior is unchanged when there's no input.
- **`SearchBox`/`Navbar` tests**
  - Enter starts editing; Escape stops editing without calling back.
  - Down moves to the first result.
  - The scope chip removes the section and refocuses the search box.
- **`Catalog.test.tsx`**
  - Headers per mode.
  - Grid focus geometry with 5 columns: Right wraps into nothing, Down moves
    one row, and Up from row 0 reaches the navbar.
  - Everything renders when there's no `IntersectionObserver`.
- **`App.test.tsx`**
  - Typing on Home navigates to `/buscar?q=…`, and the same input element
    stays mounted and focused.
  - Opening a result and pressing Escape on Detail returns to the search URL.
  - The navbar links navigate to `/peliculas` and `/series`.

## Out of scope

- An on-screen keyboard grid.
- Searching genre, studio or year.
- Genre, decade or studio filters on the catalog screen.
- Restoring the focused card when returning from Detail.
- Recent searches and search suggestions.
