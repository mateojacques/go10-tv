# Collections UI — design

Status: **implemented** (2026-09-24). This is step 3 of 3. Step 1 (structure) is in
`2026-09-23-collections-design.md`. Step 2 added
`data/collections/cartoon-network.json`.

## Goal

Show collections the way Disney+ shows Marvel, Pixar or Star Wars: a strip of
brand tiles directly below the Home hero, above the first row ("Seguir viendo"
or "Recién añadidos"). Selecting a tile opens a collection page that lists the
collection's titles.

## Decisions

The user asked for this to go straight to spec, so these defaults were chosen
here:

- **The tile is a brand card with no text.** It has a 16:9 rounded frame filled
  with `tile.color`, optional `tile.background` art covering it, and the logo
  centered on top. There's no label under it (Disney+ tiles have none). The
  name is the tile's `aria-label`.
- **Tile width fits five across a 1080p screen** (`--go-tile-w`), so the strip
  looks right as more collections are added. With one collection there's a
  single left-aligned tile.
- **Focus matches cards.** An unfocused tile is dimmed. A focused tile lifts to
  full brightness, scales up and shows the accent ring, the same treatment as
  `.go-card.is-focused`. Hover works the same with a fine pointer. There's no
  focus video (out of scope in step 1).
- **The strip has no heading**, like Disney+.
- **The strip is hidden** when `visibleCollections` returns nothing.
- **The collection page reuses the catalog grid.** It shows a branded banner
  (tile color, background art if any, and a large logo). The banner is the
  `h1`, named by the logo's alt text, with no visible title or count. Then the titles in collection order in the same lazily
  batched focus grid as `/peliculas`.
- **The navbar stays on the collection page.** The page lives inside the same
  browse `FocusProvider` as Home and the catalog, so search works there too.
- **URL: `/coleccion/<id>`.** An unknown id, or a collection whose titles have
  all gone stale, counts as not found and redirects to Home, like a stale
  title URL.
- **Back:**
  - collection page → Home;
  - detail opened from a collection → back to that collection, which the
    existing `lastBrowseRoute` gives for free.
- **Cartoon Network's tile color changes to `#e4007c`.** The CN logo mixes
  white shapes with black ones (the left square and the wordmark), so on the
  approved `#000000` half of it disappeared. `#e4007c` is a CN magenta with
  about 4.6:1 contrast against both black and white.

## 1. Routing

`Route` gains `{ name: 'collection'; id: string }`.

- `parseRoute('/coleccion/<id>')` returns the collection route, and the
  segment is URL-decoded.
- `routeToPath` encodes the id.

`resolveRoute(route, titles, collections = [])` gains a
`{ name: 'collection'; collection: Collection; titles: Title[] }` view. It
finds the collection by id and resolves it with `resolveCollection`. It
returns `not-found` if the id is unknown or the collection has no titles.
`App` passes `COLLECTIONS`. The default `[]` keeps existing callers and tests
unchanged.

## 2. Components

- **`CollectionTile`** (`src/components/CollectionTile.tsx` + `.css`) is
  focusable through `useFocusable`, with focus id `collection:<id>`. It takes
  `row`, `col`, and `onSelect(collection)`. Logo and background paths get the
  same `/` prefix as `Card` thumbnails.
- **`CollectionStrip`** (same folder) renders a
  `<nav aria-label="Colecciones">` holding a horizontal track of tiles on one
  focus row. The track reuses the `go-row_track` layout: horizontal scroll and
  room for the focus scale-up.
- **`Collection` screen** (`src/screens/Collection.tsx` + `.css`) is the banner
  plus the grid. To reuse it, `CatalogGrid` is exported from
  `src/screens/Catalog.tsx`. The screen root uses the `go-catalog` class, so the
  grid's `IntersectionObserver` root (`.closest('.go-catalog')`), the scroller
  and the navbar offset all keep working.

## 3. Home

`Home` gains two props: `collections: Collection[]` and
`onOpenCollection(collection)`. It computes
`useMemo(() => visibleCollections(collections, titles), [collections, titles])`
and renders the strip as the first child of `.go-rows`.

Focus rows:
- navbar: -2
- hero: -1
- strip: 0, when present
- "Seguir viendo" and the catalog rows: shifted down by one when the strip is
  present

Initial focus doesn't change: the hero registers first.

## 4. App

- `back()`: `collection` → Home.
- The browse branch renders `Collection` for the resolved `collection` view,
  inside the same provider and navbar, and records it as `lastBrowseRoute`.
- `Home` gets `collections={COLLECTIONS}` and an `onOpenCollection` that
  navigates to the collection route.

## 5. Testing

- **Route:** parse, serialize and round-trip `/coleccion/<id>`, including an
  encoded id.
- **Resolver:** a found collection resolves its titles in order, an unknown id
  is `not-found`, a collection with only stale keys is `not-found`, and callers
  that don't pass collections are unaffected.
- **Tile and strip:**
  - the tile renders the logo with the collection name as its accessible name
    and paints `tile.color`;
  - Enter on a focused tile selects it;
  - arrows move between tiles.
- **Home:**
  - the strip sits between the hero and the first row;
  - Down from the hero lands on the first tile;
  - Down from a tile lands on the first row;
  - the strip is absent when no collection is visible.
- **Collection screen:**
  - the banner is the heading, named after the collection, with no visible count;
  - cards appear in collection order;
  - Up from the grid reaches the navbar.
- **App:**
  - a tile click navigates to `/coleccion/<id>`;
  - a deep link renders the page;
  - Back returns to Home;
  - an unknown id redirects to Home.

## Out of scope

Tile focus video, collection descriptions or hero art, a "Colecciones" index
page, collection rows inside Detail, and search matching collection names.
