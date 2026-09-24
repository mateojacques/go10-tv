# Collections — design

Status: **implemented** (2026-09-23). Covers step 1 of 3 (structure only).

## Problem

Related content is scattered. Home has a few hardcoded studio rows
(`STUDIOS` in `buildRows.ts`), but they depend on a `studio` tag parsed from
raw ok.ru titles. The tag is incomplete (e.g. only 227 rows are tagged
"Cartoon N.") and can't express "aired on" or "linked to".

Goal: **collections**, hand-curated and labeled groups of titles, shown as
Disney+-style brand tiles (Marvel, National Geographic, Star Wars…) between the
hero and the first Home row. Selecting a tile opens a collection page that
lists its titles.

The work is split into three steps, each with its own spec or plan:

1. **Structure** (this spec): data format, loader, resolver, validation.
2. **First collection:** Cartoon Network, meaning everything in the catalog
   linked to or broadcast on the channel, plus its logo and tile art.
3. **UI:** the tile strip on Home, the `/coleccion/<id>` route and the
   collection page.

## Decisions (from brainstorming)

- **Manual and repo-stored.** Collections are JSON files we write by hand and
  commit. There's no runtime creation, no rules and no derived membership.
- **Members are catalog titles.** A member is a `Title.key`: the `series_id`
  slug for a show, the ok.ru `video_id` for a movie. Individual episodes or
  seasons can't be members.
- **Branding is part of the structure now.** Every collection has a logo and a
  tile color, and can optionally have tile background art. That's what step 3
  needs, so the step 2 file gets written once.
- **Selecting a tile opens a collection page** (step 3).
- **The app imports the JSON directly.** No Python pipeline step and no extra
  runtime fetch. Vite bundles the files at build time.
- **Lenient at runtime, strict in tests.** A bad member key is skipped on
  screen. The test suite fails on it.

## 1. Data format

One file per collection: `data/collections/<id>.json`.

```json
{
  "id": "cartoon-network",
  "name": "Cartoon Network",
  "order": 1,
  "logo": "assets/collections/cartoon-network/logo.webp",
  "tile": {
    "color": "#000000",
    "background": "assets/collections/cartoon-network/tile.webp"
  },
  "titles": ["hora-de-aventura", "las-chicas-superpoderosas"]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Kebab-case slug. It must equal the filename (without `.json`), and it becomes the collection page URL in step 3. |
| `name` | yes | Display label. Also used as the logo's alt text and the collection page heading. |
| `order` | yes | Integer tile position on Home, ascending. Unique across collections. |
| `logo` | yes | Transparent brand logo. The path is relative to `public/`, like `thumbnail`. |
| `tile.color` | yes | Hex base fill of the tile (`#rgb` or `#rrggbb`), so the tile works with no art. |
| `tile.background` | no | Art layered behind the logo. The path is relative to `public/`. |
| `titles` | yes | Ordered, non-empty, duplicate-free `Title.key`s. The collection page uses this order. |

Assets live in `assets/collections/<id>/`, served at `/assets/...` through the
existing `public/assets` symlink. Paths are relative (no leading `/`), and the UI
prefixes `/` the way `Card` does for `thumbnail`.

A title can belong to any number of collections.

**Out of scope (YAGNI):** tile focus video, description or tagline, hero image,
nested collections, rule-based membership and per-collection sorting. Each of
these can be added later as an optional field without touching existing files.

## 2. Code units

New module `src/collections/`:

- **`types.ts`**: the `Collection` interface, mirroring the JSON.
- **`collections.ts`**: `COLLECTIONS: Collection[]` holds every file under
  `data/collections/`, loaded with
  `import.meta.glob('../../data/collections/*.json', { eager: true, import: 'default' })`
  and sorted by `order`. `COLLECTION_FILES` exposes the raw `{ fileName, raw }`
  entries so the validator sees each file as written.
- **`resolveCollection.ts`**:
  - `resolveCollection(collection, titles): Title[]` maps keys to `Title`s in
    file order and skips unknown keys.
  - `visibleCollections(collections, titles)` returns
    `{ collection, titles }[]` in the order given, skipping any collection that
    resolves to zero titles. Callers pass `COLLECTIONS` (already sorted by
    `order`), which keeps the resolver pure. Step 3's tile strip uses it, so
    there are never empty tiles.
- **`validateCollection.ts`**: pure validation (section 3).

Data flow: the JSON files are bundled into `COLLECTIONS`. Consumers take the
catalog's `Title[]` from `useCatalog` and resolve against it. Collections are
static, so there's no hook and no loading state.

## 3. Validation

`validateCollections(files, { titleKeys, assetExists }): string[]` returns a
list of human-readable errors, each prefixed with the filename, e.g.
`cartoon-network.json: unknown title key "hora-de-aventur"`.

The input is the raw JSON (`unknown`), because JSON imports aren't type-checked.

Per file, it checks that:

- the value is an object
- `id` is a kebab-case string equal to the filename stem
- `name` is a non-empty string
- `order` is an integer
- `logo` is a relative path string (no leading `/`), and `assetExists(logo)`
  returns true
- `tile` is an object, `tile.color` matches `#rgb` or `#rrggbb`, and
  `tile.background`, if present, follows the same rule as `logo`
- `titles` is a non-empty array of strings with no duplicates, and every key is
  in `titleKeys`

Across files, it checks that no two collections share an `order`.

## 4. Testing

- **Validator unit tests** use one fixture per rule and assert the expected
  error string. A valid fixture must produce `[]`.
- **Resolver unit tests** check that file order is preserved, unknown keys are
  skipped, collections with no resolvable titles are hidden, and visible ones
  keep their input order.
- **Data test** (`collections.data.test.ts`) builds title keys from the real
  `public/data/catalog.csv` via `parseCatalogCsv` + `buildTitles`, checks
  assets with `fs.existsSync` under `public/`, and asserts
  `validateCollections(COLLECTION_FILES, …)` returns `[]`. This test is the
  guard for every future hand edit.

In step 1, `data/collections/` is empty (kept with a `.gitkeep`), so the data
test passes trivially until step 2 adds Cartoon Network.

## 5. Docs

The README gets a "Collections" section under "Data". It covers the file
format, where assets go, and that `npm test` validates them.
