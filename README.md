# GO10 TV — Catalog MVP

A remote-navigable, Netflix-like prototype over a catalog of 907 videos scraped
from an ok.ru profile. **UI only — there is no backend.**

Built to validate two things: whether the catalog feels like a real streaming
service when presented well, and whether a D-pad-driven 10-foot interface works
for it.

## Run

```bash
npm install
npm run dev
```

The catalog CSV is committed, so the app runs without regenerating anything.
To rebuild it from the source HTML:

```bash
python3 scripts/parse_catalog.py
```

## Controls

Designed for a TV remote. **There are no hover states anywhere** and the mouse
cursor is hidden — the target device has no pointer.

| Key | Action |
| --- | --- |
| Arrows | Move focus |
| Enter | Select |
| Escape / Backspace | Back (player → detail → home) |

## What's in it

- **Home** — a hero for the most recently added title, then 28 focus-navigable
  rows: Recién añadidos, Series, En 4K, 13 genre rows, 6 studio rows, 5 decade
  rows and Más vistos.
- **Detail** — metadata, genre chips, and for series a season list where each
  season is separately focusable and playable.
- **Player** — full-screen overlay wrapping the ok.ru embed, with a visible
  "Abrir en ok.ru" fallback if the embed fails to load.

## Data

`public/data/catalog.csv` is generated from `catalogo-solo-videos.html` by
`scripts/parse_catalog.py`: **one row per video, 907 rows, 22 columns.**

Titles in the scrape encode their own metadata, which the parser decomposes:

```
Hora de Aventura - Temporada 2 (Cartoon N.) [1080p] [Español]
└─ series_title ──┘  └ season ┘  └ studio ┘ └ quality ┘ └ language ┘
```

The 133 season rows group into 84 series via `series_id`; the UI collapses them
into 84 shows, so the catalog presents 858 titles rather than 907 rows.

### Genres are inferred, not scraped

The source data has **no genre field**. The `genre` and `genre_secondary`
columns are inferred from titles and studios, so some labels are wrong — the
live-action *Ghost in the Shell* is tagged `Anime`, for instance.

They live in `data/genres.csv`, which is safe to edit by hand: the seeder never
overwrites an existing row, and a regression test pins that guarantee. After
editing, re-run `python3 scripts/parse_catalog.py` to join the change into the
catalog.

Only studio-based heuristics are applied automatically (Pixar → Animación,
DC → Superhéroes). Two tempting rules were measured and rejected:
`subtitled → Anime` conflates Spanish subtitles with Japanese animation and
would mislabel ~285 titles, and `year < 1970 → Clásicos` conflates era with
genre.

## Design notes

The thumbnails are **368×210** — too small to fill a 1080p screen. Rather than
upscaling them, the hero and detail views blur one hard into an atmospheric
colour field and show the art crisp beside it at close to its native size.

## Tests

```bash
python3 -m pytest tests/ -v   # 30 — parser, genres, merge
npm test                      # 36 — loader, rows, focus, formatters
```

## Not in this MVP

Search, filters, My List, Continue Watching, profiles, authentication, and real
episode-level splitting of the season videos.
