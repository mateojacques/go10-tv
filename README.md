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

Run both from the repo root: it's an npm workspace. The web app lives in
`apps/web`; its platform-free logic (catalog parsing, rows, search, progress,
routing, TMDB mapping, player providers) is `packages/core` (`@go10/core`),
shared with the upcoming Android app.

The catalog CSV is committed, so the app runs without regenerating anything.
To rebuild it from the source HTML:

```bash
python3 scripts/parse_catalog.py
python3 scripts/build_aniyomi_feed.py   # Aniyomi extension feed → apps/web/public/data/aniyomi/
```

`build_aniyomi_feed.py` writes the static JSON feed the Go10 TV Aniyomi
extension reads (`/data/aniyomi/index.json` plus `series/<series_id>.json`).
**Never rename a `series_id` or re-upload a video under a new ok.ru id** for
an existing title: the feed's `s:<series_id>` / `m:<video_id>` ids and each
episode's `video_id` are what Aniyomi stores in users' libraries and watch
history, so changing them orphans those entries.

### External titles (TMDB + vidlove) — optional

Search can reach beyond the catalog: with this on, results also include
TMDB matches, which open on the same Detail screen and play through the
[vidlove](https://player.vidlove.cc/) embed. Home and collections stay
catalog-only, except that TMDB titles you've started appear in Seguir viendo.

It's **off unless both variables are set**:

```bash
# .env.local (gitignored)
VITE_EXTERNAL_TITLES=on
VITE_TMDB_TOKEN=<TMDB v4 read access token>
```

On Netlify, set the same two variables and **redeploy**: Vite bakes them in
at build time. Remove either one (or set the switch to anything but `on`)
and the build is exactly the catalog-only app.

- The token ships in the JS bundle. It's TMDB's read-only token, so the
  worst case is someone else using your rate limit; rotate it if so.
- A search chip toggles **Todo** / **Solo catálogo** (`&solo=catalogo`);
  Solo catálogo makes no TMDB requests.
- TMDB titles are keyed `tmdb-movie-<id>` / `tmdb-tv-<id>` and show their
  original language, e.g. `Inglés (sub)`: vidlove streams original audio.
- They're web-only: the Aniyomi feed is built from `catalog.csv` and never
  includes them.
- Titles in both the catalog and TMDB currently show twice in results.
- This product uses the TMDB API but is not endorsed or certified by TMDB.

## Android app (apps/mobile)

An Expo + react-native-tvos app for Android TV and phones (one APK), built on
the same `@go10/core`. It fetches the catalog and collections from the live
site (`https://tv.go10.blog`, override with `GO10_SITE_URL`), caches them for
offline use, and reads the external-titles switch from the same root
`.env.local` as the web app. Needs the Android SDK and JDK 17.

```bash
cd apps/mobile
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
npm run prebuild          # EXPO_TV=1 expo prebuild: one APK for TV and phone
cd android && ./gradlew app:assembleDebug -PreactNativeArchitectures=arm64-v8a && cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
npx expo start            # the debug build loads its JS from Metro (adb reverse tcp:8081 tcp:8081)
npm test                  # Jest
```

The repo's `.npmrc` sets `legacy-peer-deps`: react-native-tvos versions are
prereleases (`0.86.3-0`) that never satisfy peer ranges, so peers are not
auto-installed and must be declared explicitly. React is pinned to 19.2.3
repo-wide, the exact version React Native's renderer requires.

### Release APK (Android)

One universal APK (phone + TV), signed with a local keystore that never enters the repo:

- Keystore: `~/.config/go10-tv/go10-release.jks`; its alias and passwords are in `~/.gradle/gradle.properties` (`GO10_RELEASE_*`). **Back both up** — an APK signed with a different key can't update an installed one.
- Build: `npm run build:release -w @go10/mobile` → `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`.
- Install: `adb install -r app-release.apk`. A debug build on the device must be uninstalled first (different signature), which clears its progress.
- Brand images: `python3 apps/mobile/scripts/brand_images.py` regenerates `apps/mobile/assets/images/`.

## Controls

Designed for a TV remote first. On a TV (detected from the browser's user
agent, or forced with `?tv=1`; `?tv=0` undoes it) one item is always lit and
holds focus. Anywhere else the app starts in pointer mode, with nothing lit:
mouse users get hover states and touch just taps. The first arrow or Enter
press switches to keyboard mode and shows where focus is, without moving it;
any click or tap switches back.

| Key | Action |
| --- | --- |
| Arrows | Move focus |
| Enter | Select |
| Escape / Backspace | Back (player → detail → the page it was opened from → home) |

In the search box, Enter starts typing (a TV opens its on-screen keyboard).
While typing, Left/Right/Backspace edit the text, Enter or Down jump to the
first result, and Up or Escape stop typing without leaving the page.

Touch (phone/tablet) is also supported: tap a card, the play button, a season
tab or an episode number to select it directly, and tap the back button on the
detail screen (there's no hardware back key to fall back on there). The player
starts full-screen with its bar folded away: the small tab at the top edge
opens it, with back and previous/next-episode buttons. The player also
autoplays on open, so watching never needs an extra tap or click.

## What's in it

- **Home** — a hero for the featured title, a strip of collection tiles
  (Disney+-style brand cards, e.g. Cartoon Network), then 28 focus-navigable
  rows: Recién añadidos, Series, En 4K, 13 genre rows, 6 studio rows, 5 decade
  rows and Más vistos.
- **Navbar** — on Home and the catalog: "Películas", "Series" and a search
  box.
- **Catalog** — one grid screen for `/peliculas`, `/series` and search
  results (`/buscar?q=…`, plus `&en=peliculas|series` when a search is scoped
  to the section it was typed in, shown as a removable chip). Search is on the
  title only: partial, accent-insensitive and typo-tolerant ("castelvania",
  "yugioh"). When nothing matches it shows the closest titles under "Quizás
  te interese" rather than an empty page.
- **Collections** — `/coleccion/<id>`: a hand-curated collection's banner and
  its titles in curated order, on the same grid as the catalog. Collections
  are defined in `data/collections/` (see *Collections* under *Data*).
- **Detail** — metadata, genre chips, and for series a season list where each
  season is separately focusable and playable.
- **Player** — full-screen overlay wrapping the ok.ru embed, with a visible
  "Abrir en ok.ru" fallback if the embed fails to load.
- **Watch progress** — the player saves the real playback position ok.ru's
  embed reports (`timeupdate` via `postMessage`) to `localStorage`, per
  video, and reopens at it with the embed's `fromTime` param. Home gets a
  "Seguir viendo" row (in-progress titles, or the next episode once one is
  finished) and Detail shows "Reanudar" plus progress bars on episodes.
  Progress is per-browser only — there's no backend.

## Data

`apps/web/public/data/catalog.csv` is generated by `scripts/parse_catalog.py`: **one
row per video.** The base scrape (`catalogo-solo-videos.html`) contributes
907 movie/season rows across 22 of the CSV's 23 columns; the 23rd,
`episode_number`, is used only by series ingested individually — see below.

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

### Episodic series

Some series are scraped as individual ~20-minute episode videos rather than
one file per season. Adding one:

1. Drop the scraped `<slug>.html` (and its `<slug>_files/` thumbnail dump)
   at the repo root, exactly as scraped.
2. Write `data/series/<slug>.json` with the metadata the HTML can't supply:
   `series_title`, `studio`, `quality`, `language`, `genre`,
   `genre_secondary`.
3. Re-run `python3 scripts/parse_catalog.py`.

The parser copies only the thumbnails that series' episodes actually
reference into a committed `assets/<slug>/` folder (served at `/assets/...`
via the `public/assets` symlink) and appends `type=episode` rows to
`catalog.csv`. The raw `<slug>_files/` dump is gitignored and safe to delete
once ingestion succeeds — `assets/<slug>/` already has what's needed.

*Spidey y sus Sorprendentes Amigos* (`data/series/spidey.json`) is the first
series ingested this way: 49 episodes across 5 seasons. Episode numbering
has gaps (the source album doesn't list every episode) — the app doesn't
assume contiguous numbers.

### Collections

Collections are hand-curated, labeled groups of titles (think Disney+'s
Marvel or Star Wars tiles). There's one JSON file per collection in
`data/collections/<id>.json`:

```json
{
  "id": "cartoon-network",
  "name": "Cartoon Network",
  "order": 1,
  "logo": "assets/collections/cartoon-network/logo.webp",
  "tile": { "color": "#000000", "background": "assets/collections/cartoon-network/tile.webp" },
  "titles": ["hora-de-aventura", "15692556471022"]
}
```

- `id` must match the filename.
- `order` sets the tile position on Home and must be unique.
- `tile.background` is optional.
- `titles` are title keys, listed in display order: a show's `series_id`, or a
  movie's `video_id`. Write movie keys as strings.
- Put the logo and art in `assets/collections/<id>/`. Paths are relative, with
  no leading `/`.

The app bundles these files directly, so there's no parser step. `npm test`
validates every file against `catalog.csv` and the asset folder: unknown keys,
duplicates, missing images and clashing `order` values all fail the suite.
The build also publishes every collection as `/data/collections/index.json`,
which the Android app fetches.

## Design notes

The thumbnails are **368×210** — too small to fill a 1080p screen. Rather than
upscaling them, the hero and detail views blur one hard into an atmospheric
colour field and show the art crisp beside it at close to its native size.

## Tests

```bash
python3 -m pytest tests/ -v   # 97 — parser, genres, merge, feed, chapters, output paths, brand images
npm test                      # 602 — core (logic: 268) + web (components: 180) + mobile (154), every workspace
```

## Not in this MVP

Search, filters, My List, profiles, authentication. The
original 907-video scrape still isn't split into episodes — its season rows
stay one video per season; only series ingested via the "Episodic series"
pipeline above get individual episodes.
