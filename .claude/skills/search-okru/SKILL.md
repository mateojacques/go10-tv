---
name: search-okru
description: Use when asked to find a movie or show on ok.ru and add it to the GO10 catalog, or when invoked as /search-okru <title> [latino|original] [--html <saved page>] — picking which ok.ru upload(s) to ingest, and ingesting them with chapters for season packs.
---

# Search ok.ru and ingest into the catalog

Finding the right upload is judgment, not a script: ok.ru search returns
trailers, clips, wrong sequels, other dubs and re-encodes next to the real
thing. The scripts fetch and measure; **you** decide.

**Arguments:** `<title>` (Spanish or original title), then optional
`latino` (default) or `original`, and `--html <path>` for a search or
channel page the user saved from a browser (use it instead of a live search).

**Links given → no search.** When the user passes ok.ru video links or ids,
those are the picks: skip step 2 and the ranking in step 3, and don't look
for alternatives. Still run step 1, and `check` the ids (title, duration,
real resolution, playable) — if one doesn't play or is clearly the wrong
work/language, tell the user instead of replacing it. For the pick's
`thumbnail_url` and `views`, read the video's record from its uploader's
`channel` listing.

## 1. Check what the catalog already has

```bash
grep -i "<title words>" apps/web/public/data/catalog.csv | cut -d, -f2-8 | head
```

- Already there with the requested language → stop and say so.
- An existing **series** gaining seasons → reuse its exact `series_title`
  (it becomes the `series_id`). Never rename a `series_id`, never
  re-ingest an episode it already has under a different ok.ru id: that
  orphans users' Aniyomi libraries (see README).

## 2. Search

```bash
python3 scripts/search_okru.py search "<query>"            # table, to skim
python3 scripts/search_okru.py search "<query>" --json     # full records
python3 scripts/search_okru.py channel <c<id>|group/<id>|owner_url>
python3 scripts/search_okru.py search --html <saved.html>  # user's saved page
```

Run several queries — one rarely finds the best upload:

| Want | Queries to try |
|---|---|
| `latino` | `<title> latino`, `<title> audio latino`, `<title> español latino`, Latin-American release title + `latino` |
| `original` | original title alone, `<original title> subtitulado`, `<title> sub español`, `<title> vose` |
| series | add `temporada N`, `capitulo 1`, `1x01`; then list the best uploader's channel — a show usually lives complete in one channel |

A live search only returns page 1 (~7–20 videos). If a series needs more
than a channel listing gives, ask the user to open the search/channel in a
browser, scroll until everything has loaded, save the page, and give you
the path for `--html`.

## 3. Pick

Shortlist, then measure with the embed player the app actually uses:

```bash
python3 scripts/search_okru.py check <id> <id> ...
```

`check` gives real resolution (titles lie: a "[1080p]" upload can be
480p), exact duration and whether it plays embedded. Never pick a video
`check` reports not playable.

Rank candidates by, in order:

1. **Right work.** Correct title/sequel/year; duration matches the real
   runtime (movie ±10 min; episode ≈ its show's runtime; season pack ≈
   episodes × runtime). Reject trailers, clips, menus, "parte 1/2" splits,
   compilations of several works.
2. **Right language.** Title tags (`language_hints`) are strong evidence;
   `description_hints` are weak (uploaders list every language they post).
   `latino` ≠ `castellano`: reject Spain dubs for `latino`. For `original`,
   prefer Spanish subtitles. **Never analyze a video's audio** (samples,
   loudness comparisons, speech recognition) to work out its language: it's
   complex and unreliable. If the tags don't settle it, stop and ask (below).
3. **Quality** from `check`: 4K > 1440p > 1080p > 720p > rest. Reject CAM/TS.
4. **Series consistency.** One source for the whole show beats mixing
   uploaders; never mix dubs within a series. Build a season × episode
   coverage table and report gaps.
5. **Tiebreaks:** views, uploader with many matching uploads.

Stop and ask the user only when the choice isn't yours: two different works
match, the requested language doesn't exist, a series can't be covered
without mixing dubs, or the best candidates' language is unclear. For unclear
language, list the candidates as `https://ok.ru/video/<id>` links with
uploader, duration and resolution, and let the user check them by hand.
Otherwise pick and keep going.

## 4. Ingest

Write `data/picks/<slug>.json` (`<slug>` = slugified title; one file per
title; see `build_pick_rows` in `scripts/parse_catalog.py`):

```json
{
  "title": "Shrek 4: Felices para siempre",
  "type": "movie",
  "added": "YYYY-MM-DD",
  "query": "shrek 4 latino",
  "year": "2010",
  "studio": "DreamWorks",
  "source": "<uploader owner_name>",
  "quality": "1080p",
  "language": "Español Latino",
  "subtitled": false,
  "genre": "Animación",
  "genre_secondary": "Comedia",
  "videos": [
    {"video_id": "4658593663605", "title_raw": "<ok.ru title>", "duration_raw": "1:33:13",
     "views": 15600, "thumbnail_url": "<from search JSON>"}
  ]
}
```

- `type`: `movie` or `series`. Series videos add `season_number`; an
  episode adds `episode_number`, a season pack omits it.
- `title`: the canonical Spanish title as the catalog names things, not the
  uploader's title. For an existing series, its exact `series_title`.
- `quality`: from `check`, not the title. Per-video `quality`/`language`
  override the pick's when uploads differ.
- `language`: `Español Latino` for latino. For original, the original
  language (`Inglés`, `Japonés`, …) with `"subtitled": true` when it has
  Spanish subs; it shows as "Inglés (sub)".
- `studio`: only a value from `STUDIOS` in `scripts/title_parser.py`, else `""`.
- `genre`/`genre_secondary`: from the vocabulary already in
  `data/genres.csv` (Animación, Anime, Comedia, Superhéroes, Drama, Terror,
  Ciencia Ficción, Fantasía, Acción, Documental, Aventura, Clásicos,
  Infantil).

**Season packs need chapters**, `data/chapters/<series_id>.json`, first
method that applies:

1. The description lists timestamps → save them to a file, then
   `python3 scripts/make_chapters.py <series_id> <video_id> --timestamps <file>`
2. You know the season's official episode count and episodes run the same
   length (duration ÷ count ≈ normal episode length) →
   `python3 scripts/make_chapters.py <series_id> <video_id> --equal <N> --duration <H:MM:SS>`
3. Neither → after step 5's rebuild, `python3 scripts/detect_chapters.py <video_id> --episodes <N>`, and tell the user the draft needs review.

If the studio has a collection in `data/collections/` (Disney, Pixar, …),
add the title key (`series_id`, or `video_id` for a movie) to its `titles`.

## 5. Rebuild and verify

```bash
python3 scripts/parse_catalog.py        # downloads thumbnails into assets/<slug>/
python3 scripts/build_aniyomi_feed.py
python3 scripts/fetch_hero_art.py       # hero backdrops for the new titles only
python3 -m pytest -q
grep <video_id> apps/web/public/data/catalog.csv | head
```

`parse_catalog.py` prints `skip <id>, already in the catalog` for a
duplicate — remove it from the pick.

`fetch_hero_art.py` is incremental: it only asks TMDB about titles it hasn't
settled before (it needs `VITE_TMDB_TOKEN` in `.env.local`). It searches
TMDB by the catalog title, so a new title can come back `unmatched` or
match the wrong work (another version, a remake). For each new title, check
the `→ tv/… | movie/…` line it printed against the real work (year,
runtime, animated vs live action); fix a miss or mismatch with a pin in
`data/hero_art_overrides.json` (`"<title key>": "movie/<id>"`) and re-run.
Pinned title keys go in the report.

## 6. Report

Don't commit. Tell the user: what you picked and why (resolution, runtime,
language evidence, uploader), the runners-up you rejected and why, chapter
method used, and any gaps (missing episodes, unverified language, draft
chapters needing review).
