# Episodic Series Ingestion — Design

**Date:** 2026-09-22
**Status:** Approved, ready for implementation planning

## Purpose

The MVP design explicitly put "real episode-level splitting of the season
videos" out of scope: every series in the catalog today is represented as one
row per *season* — a single multi-hour video that concatenates all its
episodes. That model breaks down for a series scraped as individual episode
videos rather than one binged file per season.

This change adds a second, repeatable path into the catalog: ingesting a
series whose source HTML lists individual ~20-minute episode videos, and
surfacing those episodes in the Detail screen without disturbing the existing
133 season rows or the 84 shows built from them.

The concrete deliverable is `spidey.html` — *Spidey y sus Sorprendentes
Amigos* — added to the catalog as the first series ingested this way.

## Scope

**In scope:**

- A `data/series/<slug>.json` sidecar convention for per-series metadata that
  isn't recoverable from the HTML (studio, quality, language, genre).
- Extending `scripts/parse_catalog.py` to also ingest every
  `data/series/*.json` + its paired `<slug>.html`, emitting `episode` rows
  into the same `catalog.csv`.
- A curated `assets/<slug>/` thumbnail folder per series, populated by copying
  only the referenced images out of the raw scrape dump.
- Detail screen support for a season that has more than one playable row:
  season tabs stay one-per-season, and a season with multiple rows reveals a
  second focusable row of episodes.
- Ingesting Spidey specifically as the first series through this pipeline.

**Explicitly out of scope:**

- Touching the existing `catalogo_files/` convention or re-ingesting the base
  907-row catalog through the new pipeline.
- Episode-level synopses, air dates, or any field the source doesn't provide.
- A UI or CLI for "uploading" a series interactively — ingestion remains a
  scripted, file-drop workflow, matching how the base catalog is rebuilt today.
- Backfilling missing episode numbers. The source is incomplete (see below);
  the parser represents exactly what's there and never invents rows.

## Source Data: `spidey.html`

A 1.1 MB ok.ru "album" scrape (album id `c71645560`), structurally identical
to `catalogo-solo-videos.html` — same `video-card js-movie-card` markup, so
the existing `extract_cards()` regexes apply unchanged.

| Fact | Value |
| --- | --- |
| Video cards | 49 |
| Unique video ids | 49 |
| Seasons represented | 5 (S1: 16 eps, S2: 13 eps, S3: 17 eps, S4: 1 ep, S5: 2 eps) |
| Duration range | 23:11–24:08 (~20-24 min per episode) |
| Bracket metadata (quality/language/studio) | **None** — unlike the base catalog, titles carry no `[...]` or `(...)` tokens at all |
| Views field | Present (`N views`, low counts) |
| Thumbnails referenced | 49, all present on disk under `spidey_files/` |

**Episode numbering has gaps** — season 1 has episodes 2–25 but is missing
1, 6, 9, 11, 16, 19, 20, 23, for example. This is an ok.ru feed/album
limitation, not a parsing bug: the source simply doesn't list every episode.
The UI must not assume contiguous numbering.

**Title grammar** is a single flat pattern, looser than the base catalog's:

```
Spidey y sus Sorprendentes Amigos - Temporada 1 Episodio 2 -
Spidey Y Sus Sorprendentes Amigos - Temporada 3 Episodio 17 -
```

- Casing of the show name is inconsistent between cards (`y sus` vs `Y Sus`)
  — the parser must not derive `series_title` from this text; it comes from
  the sidecar instead.
- A trailing ` -` (or nothing) follows the episode number, with inconsistent
  spacing. Only `Temporada <N> Episodio <M>` need be extracted; everything
  else in the title is discarded.

Because there's no bracket data, `studio`, `quality`, `language`, `genre`,
and `genre_secondary` for Spidey must come from a hand-written sidecar file,
not inference.

## Architecture

```
data/series/spidey.json ──┐
spidey.html ───────────────┼── scripts/parse_catalog.py ──> public/data/catalog.csv
catalogo-solo-videos.html ─┤                              ╲
data/genres.csv ───────────┘                                └─> assets/spidey/*.webp (copied from spidey_files/)
```

`parse_catalog.py` still produces one `catalog.csv` from one command. It now
runs two passes that share the existing `extract_cards()` / `parse_duration()`
/ `parse_views()` helpers: the base pass (unchanged) and a new series pass
that loops over `data/series/*.json`.

### Component boundaries (additions only)

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `data/series/<slug>.json` | Per-series metadata the HTML can't supply | hand-written, versioned |
| `parse_episode_title()` (new, in `title_parser.py`) | Extract `(season_number, episode_number)` from an episode card title | none — pure function |
| series pass in `parse_catalog.py` | For each sidecar: read `<slug>.html`, extract cards, parse episode numbers, copy referenced thumbnails into `assets/<slug>/`, emit `episode` rows | `extract_cards`, `parse_episode_title`, sidecar JSON |
| `Detail.tsx` (extended) | Group a title's flat row list by season number; render an episode row when a season has more than one row | `Title.seasons` (unchanged shape) |

## Data Design

### `catalog.csv` schema change

One column added: **`episode_number`** (int, empty for `movie`/`season`
rows), inserted after `season_label`. `type` gains a third value: `episode`.
An episode row otherwise has the same shape as a season row:
`series_id`/`series_title` identify the show, `season_number` groups it to a
season, `duration_seconds`/`views`/`thumbnail`/`video_url`/`embed_url` are
populated exactly as for any other row. `season_label` stays empty for
episode rows — `Temporada N` is derived from `season_number` in the UI, same
as it already is for the common season-row case.

### `data/series/<slug>.json`

```json
{
  "series_title": "Spidey y sus Sorprendentes Amigos",
  "studio": "Marvel",
  "quality": "1080p",
  "language": "Español",
  "genre": "Superhéroes",
  "genre_secondary": "Infantil"
}
```

Applied uniformly to every episode row ingested from that series' HTML.
`series_id` is derived from `series_title` via the existing `slugify()`, so
it's guaranteed consistent with how the base catalog derives its own
`series_id`s and collisions would be caught by the same mechanism season
rows already rely on. The actual values for Spidey's `studio`/`quality`/
`genre`/`genre_secondary` are confirmed with the user during implementation,
not guessed by the parser.

### `assets/<slug>/` thumbnails

A committed folder, one subfolder per series ingested this way, holding only
the `.webp` files actually referenced by that series' episode rows — copied
from the throwaway `<slug>_files/` scrape dump the first time
`parse_catalog.py` runs, and left alone (skip-if-exists) on subsequent runs so
deleting the raw dump afterward is safe. `public/assets` is a single symlink
to `../assets`, added once, serving every current and future series. The CSV
`thumbnail` value for an episode row is `assets/<slug>/<file>.webp`.

### `.gitignore`

```
# Raw per-series scrape dumps (HTML asset bundles) are throwaway once
# ingested — scripts/parse_catalog.py copies the referenced thumbnails into
# assets/<slug>/. The base catalog's own dump keeps its existing exception.
*_files/
!catalogo_files/
```

The pre-existing `catalogo_files/*` / `!catalogo_files/*.webp` rules are
unaffected: `!catalogo_files/` re-admits that directory before its own
finer-grained rules apply.

## UI Design

### `Title.seasons` stays `CatalogRow[]`

No change to `types.ts` or `buildTitles()` beyond sorting: rows sort by
`season_number` then `episode_number` (nulls first, i.e. a plain season row
sorts before any episode row sharing its season number — moot in practice
since a season never mixes row kinds). `Home`, `Player`, `buildRows`, and
existing tests are untouched.

### `Detail.tsx`

Today, one season tab is rendered per row in `title.seasons`, which is
correct only because every existing show has exactly one row per season.
That's generalized to: group `title.seasons` by `season_number`, render one
tab per **group**.

- A group with exactly one row (every existing show, unchanged): tapping its
  tab plays that row directly — identical behavior and markup to today.
- A group with more than one row (Spidey): tapping its tab selects that
  season and reveals a second focusable row of episodes (`Episodio N`,
  labeled from `episode_number`, sorted ascending); tapping an episode makes
  it the active row and plays it. The Play button plays whichever row is
  currently active, same as today.

The internal "active row" state (currently `activeSeason`) represents either
a season video or a single episode depending on the show; no renaming is
required for correctness, but call sites reading `activeSeason.season_label`
already fall back to `Temporada N`, which continues to work unchanged for
episode rows since `season_label` is empty for them.

`Player.tsx` needs no changes: it already renders `season_label ||
"Temporada N"` from whatever row it's given, and an episode row's
`video_id`/`embed_url` behave like any other row.

## Testing Strategy

**Parser** (`tests/`):

- `parse_episode_title()` against real Spidey titles: both casings, the
  trailing-dash variants, and a title with no trailing dash — asserting
  extracted `(season_number, episode_number)` and that the raw show-name
  text is *not* used for `series_id`.
- Series pass end-to-end: given `data/series/spidey.json` + `spidey.html`,
  the resulting rows have `type == "episode"`, correct `series_id` matching
  the sidecar's slug, exactly 49 rows, and every `thumbnail` path exists
  under `assets/spidey/` after the run.
- Regression: base-catalog row count stays 907 and existing season-row tests
  are unaffected by the schema addition (new column empty for them).

**UI** (`npm test`):

- `Detail` grouping: a show with all single-row seasons renders identically
  to today (existing tests should require no changes); a show with a
  multi-row season renders an episode row only for that season, and
  selecting an episode updates the active/play target.

**Manual verification:** the existing full-journey walkthrough (home → row →
card → detail → season → player → back), repeated once against Spidey
specifically: select season 3, select an episode other than the first, play
it, confirm the correct video loads.

## Risks

| Risk | Mitigation |
| --- | --- |
| Gaps in episode numbering confuse users expecting contiguous episodes | Not fixed in this change — out of scope; episodes render exactly as the source lists them |
| A future series' scrape has yet another title grammar `parse_episode_title()` doesn't handle | Parser never invents values; a title that doesn't match falls through to a printed coverage gap, matching the base parser's existing philosophy, rather than silently mis-numbering an episode |
| `assets/<slug>/` grows uncommitted-large if many series are added | Only referenced `.webp` files are copied, mirroring the discipline already applied to `catalogo_files/` |

## Open Decisions Deliberately Made

- Episode rows live in the same `catalog.csv`/schema as movies and seasons,
  not a separate file — one schema, one join, consistent with "the CSV is a
  database" from the original design.
- `Title.seasons` keeps its existing flat `CatalogRow[]` shape; season/episode
  grouping is computed where it's consumed (`Detail.tsx`) rather than
  reshaping the type everywhere, to keep the blast radius on existing shows
  at zero.
- Series metadata (studio/quality/genre) is hand-supplied per series via a
  sidecar file, not inferred — the source genuinely doesn't carry it, and a
  guessed value would be presented as fact.
