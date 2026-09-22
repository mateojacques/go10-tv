# GO10 TV — Catalog MVP Design

**Date:** 2026-09-21
**Status:** Approved, ready for implementation planning

## Purpose

Validate the idea of a Netflix-like on-demand experience built on an existing
scraped video catalog. The deliverable is a **UI prototype only** — no backend,
no auth, no real user accounts. Success means someone can pick up a remote,
browse a catalog of 907 titles, open a title, and watch it, and come away
believing this is a product.

Two things are being validated:

1. Does the catalog feel like a real streaming service when presented well?
2. Does a D-pad-driven 10-foot interface work for this catalog?

## Scope

**In scope:**

- A parser that turns the scraped HTML into a CSV catalog database
- A derived genre classification for the catalog
- Home screen: hero + focus-navigable category rows
- Title detail view, including season selection for series
- Inline playback via the ok.ru embed player
- Remote/D-pad (arrow key) navigation throughout
- GO10 TV visual identity

**Explicitly out of scope:**

- Search, browse grid, and filters
- Continue Watching, My List, watch progress *(watch progress and Continue
  Watching added later — see `docs/superpowers/specs/2026-09-22-watch-progress-design.md`)*
- User profiles, authentication, backend of any kind
- Recommendations or any personalization
- Real episode-level splitting of season videos

## Source Data

`catalogo-solo-videos.html` — a 4.7 MB single-line scrape of one ok.ru
profile's video listing (profile id `593095464686`).

Verified facts about the source:

| Fact | Value |
| --- | --- |
| Video cards | 907 |
| Unique video ids | 907 (no duplicates) |
| Unique titles | 905 (2 titles repeat under different ids) |
| Thumbnails referenced | 907 (904 unique paths) |
| Thumbnails missing from disk | 0 |
| Thumbnail dimensions | 368x210 (16:9, low resolution) |
| Videos with a year in the title | 721 |
| Season/series videos | 133 |
| Distinct series | 84 (85 spellings; `Love, Death & Robots` and `Love Death & Robots` are one show) |
| Titles with a malformed bracket | 1 (`[Sub Español}`) |

Per card the scrape provides: `data-id`, watch URL, title, duration, view
count, thumbnail path. There is no genre, synopsis, cast, or rating field, and
no remote CDN thumbnail URL to fall back on.

### Title grammar

Titles are consistently structured and parseable:

```
Hora de Aventura - Temporada 2 (Cartoon N.) [1080p] [Español]
Crows Zero (2007) [1080p] [Español]
Batman: Knightfall Part 1: Knightfall [DC] [4K] [Español]
Temporada 1: Invincible [4K] [Español]
```

Parsing rules:

- **Brackets** `[...]` carry quality (`4K`, `1440p`, `1080p`, `2K`, `HD`),
  language (`Español`, `Sub Español`, `Español Latino`, `Mudo`), and
  occasionally a studio (`[DC]`).
- **Parentheses** `(...)` carry either a 4-digit year or a studio
  (`Disney`, `Cartoon N.`, `Pixar`, `WarnerBros`, `Marvel`, `Adult Swim`,
  `Nickelodeon`, `20th Television`, `Dreamworks`, `Lucasfilm`).
- **Seasons appear in four formats**, all of which must be handled. A strict
  two-format parser silently drops 13 titles, so the separator must accept
  `-`, `–` and `:`, and the season number must accept a list:
  - `<Show> - Temporada <N>` — the common case
  - `Temporada <N>: <Show>` — e.g. `Temporada 1: Invincible`
  - `<Show> - Temporada <N>: <Arc>` — e.g. `Dragon Ball - Temporada 5: 22º Torneo…`
  - `<Show> - Temporada 1, 2 y 3` — multi-season packs, e.g. `Spawn`, `Æon Flux`
  Together these account for exactly 133 videos across 84 series — 85 distinct
  show spellings, two of which are the same show punctuated differently and
  correctly collapse to one `series_id`.
  Movies containing colons (`Batman: Knightfall Part 1: Knightfall`) must NOT
  be misread as seasons — requiring the literal word `Temporada` prevents this.
- One title closes a bracket with a brace (`[Sub Español}`); bracket matching
  must tolerate `]` or `}` or that title loses its language.
- Quality values need normalizing (`4k` → `4K`, `1080` → `1080p`).
- Studio values need normalizing (`Dreamworks`/`DreamWorks` → one value).

## Architecture

```
catalogo-solo-videos.html ──┐
                            ├── scripts/parse_catalog.py ──> public/data/catalog.csv
data/genres.csv ────────────┘                                        │
                                                                     v
                                          Vite + React + TS app ── useCatalog()
                                                                     │
                                            ┌────────────────────────┼─────────────┐
                                            v                        v             v
                                          Home                    Detail        Player
                                            └──────── FocusProvider (D-pad) ──────┘
```

The build-time pipeline and the runtime app are fully decoupled: the app never
parses HTML, and the parser never knows about the UI. The CSV is the contract
between them.

### Component boundaries

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `parse_catalog.py` | HTML → CSV, deterministic, joins genres | source HTML, `data/genres.csv` |
| `useCatalog` | Load + parse CSV, build typed models, group series | `catalog.csv` |
| `buildRows` | Turn the catalog into ordered named rows | catalog models |
| `FocusProvider` | Spatial focus registry, key handling | nothing |
| `Home` / `Detail` / `Player` | Presentation only | catalog models, focus |
| `appReducer` | Which view is active, current title, current season | nothing |

## Data Design

### `public/data/catalog.csv`

**One row per video — 907 rows**, in original scrape order. Series grouping is
expressed through a `series_id` column rather than by collapsing rows, so the
CSV stays a faithful, flat representation of the source and the UI does the
grouping. Columns in this order:

| # | Column | Type | Notes |
| --- | --- | --- | --- |
| 1 | `catalog_index` | int | 0-based position in the scrape; preserves original order |
| 2 | `video_id` | string | ok.ru numeric id; unique; primary key |
| 3 | `type` | enum | `movie` or `season` |
| 4 | `title` | string | Cleaned display title, brackets/parens/season stripped |
| 5 | `title_raw` | string | Verbatim title from the scrape |
| 6 | `series_id` | string | Slug of `series_title`; empty for movies |
| 7 | `series_title` | string | Show name without season; empty for movies |
| 8 | `season_number` | int | Empty for movies; lowest season for multi-season packs |
| 9 | `season_label` | string | Arc name (`22º Torneo de las Artes Marciales`) or span (`Temporadas 1, 2 y 3`); empty otherwise. Prevents data loss on the 13 irregular season titles |
| 10 | `year` | int | Empty when absent (186 rows) |
| 11 | `studio` | string | Normalized; empty when absent |
| 12 | `genre` | string | **Derived — see below** |
| 13 | `genre_secondary` | string | **Derived**; may be empty |
| 14 | `quality` | string | `4K` / `1440p` / `1080p` / `2K` / `HD` |
| 15 | `language` | string | `Español` / `Español Latino` / `Mudo` |
| 16 | `subtitled` | bool | `true` when the source said `Sub Español` |
| 17 | `duration_raw` | string | As scraped, e.g. `4:08:29` |
| 18 | `duration_seconds` | int | Parsed from `duration_raw` |
| 19 | `views` | int | Digits only, separators stripped |
| 20 | `thumbnail` | string | `catalogo_files/i_NNN_AN8C.webp` |
| 21 | `video_url` | string | `https://ok.ru/video/<id>` |
| 22 | `embed_url` | string | `https://ok.ru/videoembed/<id>` |

Encoding is UTF-8 with a header row, RFC 4180 quoting (titles contain commas
and ampersands).

The parser prints a per-column coverage report (how many rows got a value) so
extraction gaps are visible rather than silent. Unparseable fields are left
empty; the parser never invents a value.

### `data/genres.csv`

A separate, human-editable file keyed by `video_id`, with columns
`video_id`, `title`, `genre`, `genre_secondary`. The parser left-joins it.

Genre is **inferred, not scraped** — this must be stated wherever the data is
presented as a database. It is produced in two passes:

1. **Studio heuristics only** — `Disney`/`Pixar`/`Cartoon N.`/`DreamWorks`/
   `Nickelodeon`/`Adult Swim` → Animación; `DC`/`Marvel` → Superhéroes. This
   seeds ~61 rows.
2. **Deliberate classification** — the remaining 846 titles are classified in
   batches against a fixed rule set, then merged back.

Two tempting heuristics were deliberately rejected. `Sub Español → Anime`
conflates having Spanish subtitles with being Japanese animation and would
mislabel ~285 titles, many of them live-action foreign films (`Crows Zero`,
`Blue Spring`). `year < 1970 → Clásicos` conflates era with genre. A confident
wrong label is worse than `UNCLASSIFIED`, which the classification pass is
guaranteed to visit.

Genre vocabulary (fixed, closed set): `Animación`, `Anime`, `Acción`,
`Aventura`, `Comedia`, `Drama`, `Terror`, `Ciencia Ficción`, `Fantasía`,
`Infantil`, `Superhéroes`, `Documental`, `Clásicos`.

Keeping this file separate and stable means a wrong call is fixed by editing
one line, and re-running the parser never discards those corrections.

## UI Design

### Interaction model

The interface is driven entirely by a remote/D-pad. There are **no hover
states anywhere** — hover is not available on the target device, and building
against it would invalidate the prototype.

| Key | Action |
| --- | --- |
| Arrows | Move focus spatially |
| Enter | Activate focused element |
| Escape / Backspace | Back (Player → Detail → Home) |

`FocusProvider` keeps a registry of focusable elements grouped into rows.
Arrow keys resolve to the nearest neighbor in that direction; horizontal
movement inside a row scrolls the row so the focused card stays in a stable
position. Focus is always visible: a focused card scales up and gains an
accent ring, and there is always exactly one focused element on screen.

### Screens

**Home**

- Hero band for a featured title: backdrop wash, title, metadata line,
  Play and Más información actions.
- Because the source thumbnail is only 368x210, the hero does **not** upscale
  it to full bleed. It renders the image blurred and scaled as an atmospheric
  color wash, with a gradient scrim and large type on top, plus the thumbnail
  shown crisp at or near native size as a card. The low resolution becomes a
  deliberate aesthetic rather than a visible defect.
- Below the hero, horizontal focus-navigable rows.

Row set (order matters):

1. Recién añadidos — first 20 by `catalog_index`
2. Series — one entry per `series_id`, represented by its lowest-numbered season
3. En 4K — `quality == 4K`, capped at 20 entries
4. Genre rows — one per genre holding at least 12 titles, ordered by title count descending
5. Studio rows — Disney, Pixar, Cartoon N., WarnerBros, DC, 20th Television
6. Por década — 1980s, 1990s, 2000s, 2010s, 2020s
7. Más vistos — top 20 by `views` descending

Every row is capped at 20 cards. Rows render only the cards near the viewport, so 907 titles stay smooth.

**Detail**

- Backdrop wash from the title's thumbnail, same treatment as the hero.
- Title, plus a metadata line: año · calidad · idioma · duración · vistas.
- Genre chips.
- Play action.
- For series: a season list (`Temporada 1…N`) where each season is a
  separately focusable, playable item. Selecting a season sets the active
  season; Play plays that season's video.
- There is no synopsis in the source data. The detail view shows the metadata
  it actually has rather than a placeholder paragraph of filler text.

**Player**

- Full-screen overlay containing an iframe pointed at
  `https://ok.ru/videoembed/<video_id>`.
- GO10 chrome on entry and exit (title card, fade), Escape to close.
- Playback controls inside the iframe belong to ok.ru; we do not attempt to
  proxy or reimplement them.
- If the iframe fails to load, a visible fallback panel offers
  "Abrir en ok.ru" rather than leaving a black rectangle. This is a
  demo-safety requirement, not an optional nicety.

### Identity

GO10 TV, its own brand rather than a Netflix skin.

- **Canvas:** near-black, slightly blue-shifted, not pure `#000`.
- **Accent:** one saturated color, used for focus rings, the wordmark, and
  primary actions — nowhere else.
- **Type:** large and confident, sized for 10-foot legibility. Minimum body
  size well above desktop norms.
- **Motion:** restrained. Focus scale and crossfade only; no parallax, no
  decorative animation. Motion must never delay input response.
- The exact palette and type scale are defined as tokens in one place during
  implementation and reviewed before the rest of the UI is built on them.

## Testing Strategy

**Parser** — unit tests over real samples drawn from the actual catalog:

- both season formats (`X - Temporada 2`, `Temporada 1: X`)
- bracket studio (`[DC]`) vs. paren studio (`(Disney)`)
- titles with no year (186 of them)
- the 2 repeated titles with distinct ids
- quality and studio normalization
- duration parsing (`4:08:29` → 14909)
- view parsing with separators (`1 444 views` → 1444)
- CSV round-trip: titles containing commas and `&` survive quoting

Plus whole-file assertions: exactly 907 rows, `video_id` unique, every
`thumbnail` path exists on disk, every `type` in the enum, every `genre` in
the closed vocabulary.

**UI** — component tests for focus navigation (arrow key moves focus as
expected, Escape pops the view stack), and a manual verification pass that
completes the full journey — home → row → card → detail → season → player →
back — using only the keyboard, never the mouse. That traversal is the
prototype's core hypothesis, so it is verified by running the app, not by
assertion alone.

## Risks

| Risk | Mitigation |
| --- | --- |
| ok.ru blocks iframe embedding | Fallback panel with "Abrir en ok.ru"; verify embedding early in implementation, before the player is styled |
| Low-res thumbnails look poor at TV scale | Hero/detail treat the image as a blurred wash rather than upscaling it |
| Derived genres are wrong for some titles | Genres live in a separate editable file; documented as inference, not fact |
| 907 rows janky on a low-power TV browser | Render only near-viewport cards; keep motion minimal |

## Open Decisions Deliberately Made

- One row per video, not per show — the CSV is a database, the UI does grouping.
- Genres in a separate file, not inline in the parser — so corrections survive.
- No synopsis placeholder text — showing real metadata beats showing filler.
- No search in the MVP, per scope; rows are the only way to reach a title.
