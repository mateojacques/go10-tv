# Episodic Series Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable pipeline for ingesting a series scraped as individual episode videos (rather than one video per season), and use it to add *Spidey y sus Sorprendentes Amigos* (`spidey.html`, 49 episodes across 5 seasons) to the catalog.

**Architecture:** `scripts/parse_catalog.py` gains a second pass alongside its existing base-catalog pass: for every `data/series/<slug>.json` metadata sidecar, it reads the paired `<slug>.html`, extracts episode cards with the existing `extract_cards()` helper, derives `(season_number, episode_number)` with a new `parse_episode_title()`, copies referenced thumbnails into a committed `assets/<slug>/` folder, and appends `type=episode` rows to the same `catalog.csv`. On the frontend, `Title.seasons` keeps its existing flat `CatalogRow[]` shape (sorted by season then episode number); `Detail.tsx` groups that flat list by season number via a new pure `groupSeasons()` helper and reveals a second focusable row of episodes only for a season that has more than one row — every existing show, which has exactly one row per season, renders identically to today.

**Tech Stack:** Python 3 + pytest (parser); Vite, React 19, TypeScript, Vitest, PapaParse (app). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-22-episodic-series-ingestion-design.md`

## Global Constraints

- `catalog.csv` gains one column, `episode_number`, inserted immediately after `season_label`; `type` gains a third value, `episode`. Existing `movie`/`season` rows get an empty `episode_number`.
- Per-series metadata (`studio`, `quality`, `language`, `genre`, `genre_secondary`) comes only from `data/series/<slug>.json` — never inferred, never guessed by the parser.
- The parser **never invents values**: an episode card whose title doesn't match `Temporada N Episodio M` is skipped with a printed warning, not silently misnumbered.
- The base catalog pass (907 movie/season rows, `catalogo-solo-videos.html`, `catalogo_files/`) is untouched — same rows, same existing gitignore exception, now with an empty `episode_number` column.
- Only the `.webp` thumbnails actually referenced by a series' episodes are copied into `assets/<slug>/`; the raw `<slug>_files/` scrape dump stays gitignored and safe to delete once ingested.
- `Title.seasons` stays a flat `CatalogRow[]` (sorted by `season_number` then `episode_number`) — season/episode grouping is computed where it's consumed (`Detail.tsx`), not by reshaping the type.
- All user-facing copy is in **Spanish** (`Episodios`, `Temporada N`, etc.), matching the rest of the app.
- Confirmed sidecar values for Spidey: `studio="Marvel"`, `quality="1080p"`, `language="Español"`, `genre="Superhéroes"`, `genre_secondary="Infantil"`.

---

### Task 1: `catalog.csv` schema — add `episode_number`

**Files:**
- Modify: `scripts/parse_catalog.py`
- Modify: `tests/test_parse_catalog.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `COLUMNS` (23 entries, `episode_number` after `season_label`); `build_rows()` output rows now include `"episode_number": ""`.

- [ ] **Step 1: Update the failing test for the new column list**

In `tests/test_parse_catalog.py`, replace `test_columns_are_the_22_specified_in_order` with:

```python
def test_columns_are_the_23_specified_in_order():
    assert COLUMNS == [
        "catalog_index", "video_id", "type", "title", "title_raw",
        "series_id", "series_title", "season_number", "season_label",
        "episode_number", "year", "studio", "genre", "genre_secondary",
        "quality", "language", "subtitled", "duration_raw", "duration_seconds",
        "views", "thumbnail", "video_url", "embed_url",
    ]


def test_base_rows_have_empty_episode_number():
    html_text = open(os.path.join(ROOT, "catalogo-solo-videos.html"), encoding="utf-8").read()
    rows = build_rows(html_text, {})
    assert all(r["episode_number"] == "" for r in rows)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m pytest tests/test_parse_catalog.py -v`
Expected: `test_columns_are_the_23_specified_in_order` FAILs (old `COLUMNS` has 22 entries, no `episode_number`); `test_base_rows_have_empty_episode_number` FAILs with `KeyError: 'episode_number'`.

- [ ] **Step 3: Add the column and default value**

In `scripts/parse_catalog.py`, change:

```python
COLUMNS = [
    "catalog_index", "video_id", "type", "title", "title_raw",
    "series_id", "series_title", "season_number", "season_label",
    "year", "studio", "genre", "genre_secondary", "quality",
    "language", "subtitled", "duration_raw", "duration_seconds",
    "views", "thumbnail", "video_url", "embed_url",
]
```

to:

```python
COLUMNS = [
    "catalog_index", "video_id", "type", "title", "title_raw",
    "series_id", "series_title", "season_number", "season_label",
    "episode_number", "year", "studio", "genre", "genre_secondary",
    "quality", "language", "subtitled", "duration_raw", "duration_seconds",
    "views", "thumbnail", "video_url", "embed_url",
]
```

In `build_rows()`, in the dict passed to `rows.append(...)`, add a line right after `"season_label": parsed["season_label"],`:

```python
            "episode_number": "",
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest tests/test_parse_catalog.py -v`
Expected: PASS (all tests in the file, including the two above).

- [ ] **Step 5: Run the full Python suite**

Run: `python3 -m pytest tests/ -v`
Expected: PASS (30 existing tests + 1 new, minus the renamed one).

- [ ] **Step 6: Commit**

```bash
git add scripts/parse_catalog.py tests/test_parse_catalog.py
git commit -m "feat: add episode_number column to catalog schema"
```

---

### Task 2: `parse_episode_title()` — episode title parsing

**Files:**
- Modify: `scripts/title_parser.py`
- Modify: `tests/test_title_parser.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `parse_episode_title(raw: str) -> tuple[int, int] | None` — `(season_number, episode_number)`, or `None` if the title doesn't contain `Temporada N Episodio M`.

- [ ] **Step 1: Write the failing tests**

In `tests/test_title_parser.py`, change the import line:

```python
from title_parser import parse_title, parse_seasons, slugify
```

to:

```python
from title_parser import parse_title, parse_seasons, parse_episode_title, slugify
```

Append:

```python
def test_parse_episode_title_extracts_season_and_episode():
    assert parse_episode_title(
        "Spidey y sus Sorprendentes Amigos - Temporada 1 Episodio 2 -"
    ) == (1, 2)


def test_parse_episode_title_ignores_show_name_casing():
    # Same show, inconsistent capitalization across cards; only the numbers
    # are trusted from the title — the show name comes from a sidecar file.
    assert parse_episode_title(
        "Spidey Y Sus Sorprendentes Amigos - Temporada 3 Episodio 17 -"
    ) == (3, 17)


def test_parse_episode_title_handles_no_trailing_dash():
    assert parse_episode_title(
        "Spidey y sus Sorprendentes Amigos - Temporada 2 Episodio 12"
    ) == (2, 12)


def test_parse_episode_title_returns_none_when_no_match():
    assert parse_episode_title("Crows Zero (2007) [1080p] [Español]") is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m pytest tests/test_title_parser.py -v`
Expected: FAIL with `ImportError: cannot import name 'parse_episode_title'`.

- [ ] **Step 3: Implement `parse_episode_title()`**

In `scripts/title_parser.py`, add near the other compiled patterns (after `SEASON_PREFIX`):

```python
EPISODE_RE = re.compile(
    r"Temporada\s*(?P<season>\d+)\s*Episodio\s*(?P<episode>\d+)", re.I
)
```

Add the function after `parse_seasons()`:

```python
def parse_episode_title(raw):
    """Return (season_number, episode_number) or None.

    Only the numbers are trusted from the raw title. The show-name portion
    is deliberately not parsed here — casing is inconsistent across cards
    for the same show, so a per-series sidecar supplies the canonical name.
    """
    match = EPISODE_RE.search(raw)
    if not match:
        return None
    return int(match.group("season")), int(match.group("episode"))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m pytest tests/test_title_parser.py -v`
Expected: PASS.

- [ ] **Step 5: Run the full Python suite**

Run: `python3 -m pytest tests/ -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/title_parser.py tests/test_title_parser.py
git commit -m "feat: parse season/episode numbers from episode titles"
```

---

### Task 3: Series ingestion pass in `parse_catalog.py`

**Files:**
- Modify: `scripts/parse_catalog.py`
- Modify: `tests/test_parse_catalog.py`

**Interfaces:**
- Consumes: `extract_cards()`, `parse_duration()`, `parse_views()` (existing, unchanged); `parse_episode_title()`, `slugify()` (Task 2).
- Produces:
  - `load_series_sidecars(series_dir: str) -> list[tuple[str, dict]]` — `(slug, sidecar_dict)` pairs, one per `<slug>.json` found; `[]` if the directory doesn't exist.
  - `build_episode_rows(html_text: str, sidecar: dict, slug: str, start_index: int, root: str = ROOT, assets_dir: str | None = None) -> list[dict]` — episode row dicts with `catalog_index` continuing from `start_index`; copies referenced thumbnails from `<root>/<slug>_files/` into `<assets_dir or ASSETS_DIR>/<slug>/`, skipping files that already exist there.
  - `SERIES_DIR`, `ASSETS_DIR` module constants.
  - `THUMB_RE` generalized to match any `<name>_files/...` path, not only `catalogo_files/`.
  - `main()` now also ingests every `data/series/*.json` after building the base rows.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_parse_catalog.py`:

```python
def test_thumbnail_regex_matches_any_series_files_folder():
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    cards = extract_cards(html_text)
    assert len(cards) == 49
    assert all(c["thumbnail"].startswith("spidey_files/") for c in cards)


def test_load_series_sidecars_reads_json_files(tmp_path):
    series_dir = tmp_path / "series"
    series_dir.mkdir()
    (series_dir / "spidey.json").write_text(
        '{"series_title": "Spidey y sus Sorprendentes Amigos", "studio": "Marvel"}',
        encoding="utf-8",
    )
    sidecars = parse_catalog.load_series_sidecars(str(series_dir))
    assert sidecars == [
        ("spidey", {"series_title": "Spidey y sus Sorprendentes Amigos", "studio": "Marvel"})
    ]


def test_load_series_sidecars_returns_empty_list_when_dir_missing(tmp_path):
    assert parse_catalog.load_series_sidecars(str(tmp_path / "nope")) == []


SPIDEY_SIDECAR = {
    "series_title": "Spidey y sus Sorprendentes Amigos",
    "studio": "Marvel",
    "quality": "1080p",
    "language": "Español",
    "genre": "Superhéroes",
    "genre_secondary": "Infantil",
}


def test_build_episode_rows_extracts_all_spidey_episodes(tmp_path):
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    rows = parse_catalog.build_episode_rows(
        html_text, SPIDEY_SIDECAR, "spidey", start_index=907,
        root=ROOT, assets_dir=str(tmp_path),
    )
    assert len(rows) == 49
    assert all(r["type"] == "episode" for r in rows)
    assert all(r["series_id"] == "spidey-y-sus-sorprendentes-amigos" for r in rows)
    assert all(r["series_title"] == "Spidey y sus Sorprendentes Amigos" for r in rows)
    assert all(r["studio"] == "Marvel" for r in rows)
    assert {int(r["season_number"]) for r in rows} == {1, 2, 3, 4, 5}
    assert rows[0]["catalog_index"] == 907
    assert rows[-1]["catalog_index"] == 955


def test_build_episode_rows_copies_thumbnails_into_assets(tmp_path):
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    rows = parse_catalog.build_episode_rows(
        html_text, SPIDEY_SIDECAR, "spidey", start_index=0,
        root=ROOT, assets_dir=str(tmp_path),
    )
    for row in rows:
        assert row["thumbnail"].startswith("assets/spidey/")
        copied = tmp_path / "spidey" / os.path.basename(row["thumbnail"])
        assert copied.exists(), row["thumbnail"]


def test_build_episode_rows_skips_already_copied_thumbnails(tmp_path):
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    parse_catalog.build_episode_rows(
        html_text, SPIDEY_SIDECAR, "spidey", 0, root=ROOT, assets_dir=str(tmp_path),
    )
    # Re-running after the raw dump is hypothetically gone must not fail or
    # try to re-copy — every destination file already exists.
    rows = parse_catalog.build_episode_rows(
        html_text, SPIDEY_SIDECAR, "spidey", 0, root=ROOT, assets_dir=str(tmp_path),
    )
    assert len(rows) == 49


def test_build_episode_rows_skips_titles_that_dont_match(tmp_path, capsys):
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    # Corrupt one card's title (its title="" and alt="" copies both contain
    # the same text) so it no longer matches "Temporada N Episodio M". The
    # trailing " -" is required so this doesn't also match "Episodio 21/22/
    # 24/25", which all share the "Episodio 2" prefix.
    broken_html = html_text.replace("Temporada 1 Episodio 2 -", "Special -")
    rows = parse_catalog.build_episode_rows(
        broken_html, SPIDEY_SIDECAR, "spidey", 0, root=ROOT, assets_dir=str(tmp_path),
    )
    assert len(rows) == 48
    assert "skip" in capsys.readouterr().out.lower()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m pytest tests/test_parse_catalog.py -v`
Expected: FAIL — `AttributeError: module 'parse_catalog' has no attribute 'load_series_sidecars'` (and similarly for `build_episode_rows`).

- [ ] **Step 3: Add imports and constants**

In `scripts/parse_catalog.py`, change the import block:

```python
import csv
import html
import os
import re
import sys

from title_parser import parse_title
```

to:

```python
import csv
import html
import json
import os
import re
import shutil
import sys

from title_parser import parse_title, parse_episode_title, slugify
```

Add constants after `OUTPUT_CSV`:

```python
SERIES_DIR = os.path.join(ROOT, "data", "series")
ASSETS_DIR = os.path.join(ROOT, "assets")
```

- [ ] **Step 4: Generalize the thumbnail regex**

Change:

```python
THUMB_RE = re.compile(r'<img[^>]*src="(catalogo_files/[^"]+)"')
```

to:

```python
THUMB_RE = re.compile(r'<img[^>]*src="([\w.-]+_files/[^"]+)"')
```

- [ ] **Step 5: Implement `load_series_sidecars()` and `build_episode_rows()`**

Add after `load_genres()`:

```python
def load_series_sidecars(series_dir):
    """Return [(slug, sidecar_dict), ...] for every data/series/<slug>.json."""
    if not os.path.isdir(series_dir):
        return []
    sidecars = []
    for name in sorted(os.listdir(series_dir)):
        if not name.endswith(".json"):
            continue
        slug = name[: -len(".json")]
        with open(os.path.join(series_dir, name), encoding="utf-8") as handle:
            sidecars.append((slug, json.load(handle)))
    return sidecars


def build_episode_rows(html_text, sidecar, slug, start_index, root=ROOT, assets_dir=None):
    """Turn one series' scraped HTML into episode rows.

    Copies each referenced thumbnail from `<root>/<slug>_files/` into
    `<assets_dir>/<slug>/`, skipping any that already exist there so a
    second run is safe after the raw scrape dump has been deleted. A card
    whose title doesn't match "Temporada N Episodio M" is skipped and
    reported, never guessed.
    """
    assets_dir = assets_dir or ASSETS_DIR
    series_id = slugify(sidecar["series_title"])
    dest_dir = os.path.join(assets_dir, slug)
    os.makedirs(dest_dir, exist_ok=True)

    rows = []
    index = start_index
    for card in extract_cards(html_text):
        parsed = parse_episode_title(card["title_raw"])
        if parsed is None:
            print(f"skip (no season/episode match): {card['title_raw']!r}")
            continue
        season_number, episode_number = parsed

        filename = os.path.basename(card["thumbnail"])
        source_thumb = os.path.join(root, card["thumbnail"])
        dest_thumb = os.path.join(dest_dir, filename)
        if os.path.exists(source_thumb) and not os.path.exists(dest_thumb):
            shutil.copy2(source_thumb, dest_thumb)

        rows.append({
            "catalog_index": index,
            "video_id": card["video_id"],
            "type": "episode",
            "title": sidecar["series_title"],
            "title_raw": card["title_raw"],
            "series_id": series_id,
            "series_title": sidecar["series_title"],
            "season_number": str(season_number),
            "season_label": "",
            "episode_number": str(episode_number),
            "year": "",
            "studio": sidecar.get("studio", ""),
            "genre": sidecar.get("genre", ""),
            "genre_secondary": sidecar.get("genre_secondary", ""),
            "quality": sidecar.get("quality", ""),
            "language": sidecar.get("language", ""),
            "subtitled": "false",
            "duration_raw": card["duration_raw"],
            "duration_seconds": parse_duration(card["duration_raw"]),
            "views": parse_views(card["views_raw"]),
            "thumbnail": f"assets/{slug}/{filename}",
            "video_url": f"https://ok.ru/video/{card['video_id']}",
            "embed_url": f"https://ok.ru/videoembed/{card['video_id']}",
        })
        index += 1
    return rows
```

- [ ] **Step 6: Wire the series pass into `main()`**

Change:

```python
def main():
    html_text = open(SOURCE_HTML, encoding="utf-8").read()
    rows = build_rows(html_text, load_genres(GENRES_CSV))

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
```

to:

```python
def main():
    html_text = open(SOURCE_HTML, encoding="utf-8").read()
    rows = build_rows(html_text, load_genres(GENRES_CSV))

    for slug, sidecar in load_series_sidecars(SERIES_DIR):
        series_html = open(os.path.join(ROOT, f"{slug}.html"), encoding="utf-8").read()
        rows.extend(build_episode_rows(series_html, sidecar, slug, len(rows)))

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `python3 -m pytest tests/test_parse_catalog.py -v`
Expected: PASS.

- [ ] **Step 8: Run the full Python suite**

Run: `python3 -m pytest tests/ -v`
Expected: PASS. (`data/series/` doesn't exist yet, so `main()`'s new loop is a no-op for now — the base catalog is unaffected until Task 4.)

- [ ] **Step 9: Commit**

```bash
git add scripts/parse_catalog.py tests/test_parse_catalog.py
git commit -m "feat: add series-episode ingestion pass to parse_catalog.py"
```

---

### Task 4: Ingest Spidey for real

**Files:**
- Create: `data/series/spidey.json`
- Modify: `.gitignore`
- Create: `assets/` directory, `public/assets` symlink (not code — filesystem state)
- Modify (generated): `public/data/catalog.csv`
- Create (generated): `assets/spidey/*.webp`
- Modify: `README.md`

**Interfaces:**
- Consumes: `main()` / `load_series_sidecars()` / `build_episode_rows()` from Task 3.
- Produces: a real, committed `catalog.csv` containing Spidey's 49 episode rows, and `assets/spidey/` populated with their thumbnails.

- [ ] **Step 1: Create the sidecar metadata file**

`data/series/spidey.json`:

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

- [ ] **Step 2: Update `.gitignore`**

Append to `.gitignore`:

```
# Raw per-series scrape dumps (HTML asset bundles) are throwaway once
# ingested: scripts/parse_catalog.py copies the referenced thumbnails into
# assets/<slug>/. The base catalog's own dump keeps its exception above.
*_files/
!catalogo_files/
```

- [ ] **Step 3: Verify the gitignore rules do what's intended**

Run:

```bash
git check-ignore -v catalogo_files/i_666_AN8C.webp; echo "exit=$?"
git check-ignore -v spidey_files/videoPreview_025_nNrS.webp; echo "exit=$?"
```

Expected: the first prints nothing and `exit=1` (still tracked, not ignored); the second prints a match against the new `*_files/` rule and `exit=0` (ignored).

- [ ] **Step 4: Create the `assets/` folder and the `public/assets` symlink**

```bash
mkdir -p assets
ln -s ../assets public/assets
ls -la public/assets
```

Expected: `public/assets -> ../assets`.

- [ ] **Step 5: Regenerate the catalog**

```bash
python3 scripts/parse_catalog.py
```

Expected: the coverage report prints, ending with `wrote public/data/catalog.csv`, with no errors or "skip" lines for Spidey.

- [ ] **Step 6: Verify the regenerated catalog**

```bash
python3 - <<'EOF'
import csv
with open("public/data/catalog.csv", newline="", encoding="utf-8") as handle:
    rows = list(csv.DictReader(handle))
episodes = [r for r in rows if r["type"] == "episode"]
print("total rows:", len(rows))
print("episode rows:", len(episodes))
print("seasons:", sorted({int(r["season_number"]) for r in episodes}))
print("series_id:", {r["series_id"] for r in episodes})
EOF
ls assets/spidey | wc -l
```

Expected: `total rows: 956`, `episode rows: 49`, `seasons: [1, 2, 3, 4, 5]`, `series_id: {'spidey-y-sus-sorprendentes-amigos'}`, and `ls assets/spidey` reports `49`.

- [ ] **Step 7: Update `README.md`**

Change:

```markdown
`public/data/catalog.csv` is generated from `catalogo-solo-videos.html` by
`scripts/parse_catalog.py`: **one row per video, 907 rows, 22 columns.**
```

to:

```markdown
`public/data/catalog.csv` is generated by `scripts/parse_catalog.py`: **one
row per video.** The base scrape (`catalogo-solo-videos.html`) contributes
907 movie/season rows across 22 of the CSV's 23 columns; the 23rd,
`episode_number`, is used only by series ingested individually — see below.
```

Change:

```markdown
## Not in this MVP

Search, filters, My List, Continue Watching, profiles, authentication, and real
episode-level splitting of the season videos.
```

to:

```markdown
## Not in this MVP

Search, filters, My List, Continue Watching, profiles, authentication. The
original 907-video scrape still isn't split into episodes — its season rows
stay one video per season; only series ingested via the per-series pipeline
below get individual episodes.
```

Add a new subsection after "### Genres are inferred, not scraped":

```markdown
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
```

- [ ] **Step 8: Run the full test suite**

```bash
python3 -m pytest tests/ -v
npm test
```

Expected: PASS (both suites unaffected — no Python or TS test reads the committed `catalog.csv` directly).

- [ ] **Step 9: Commit**

```bash
git add data/series/spidey.json .gitignore public/assets assets/spidey \
  public/data/catalog.csv README.md
git commit -m "feat: ingest Spidey y sus Sorprendentes Amigos as episodic series"
```

---

### Task 5: Frontend catalog loader — `episode_number` support

**Files:**
- Modify: `src/types.ts`
- Modify: `src/catalog/loadCatalog.ts`
- Modify: `src/catalog/loadCatalog.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CatalogRow.episode_number: number | null`; `CatalogRow.type` includes `'episode'`; `buildTitles()` sorts a title's rows by `season_number` then `episode_number`.

- [ ] **Step 1: Write the failing test**

Append to `src/catalog/loadCatalog.test.ts`:

```ts
const EPISODIC_CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,episode_number,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,901,episode,Spidey,"Spidey - T1E2",spidey,Spidey,1,,2,,Marvel,Superhéroes,Infantil,1080p,Español,false,23:32,1412,2,assets/spidey/a.webp,https://ok.ru/video/901,https://ok.ru/videoembed/901
1,902,episode,Spidey,"Spidey - T1E1",spidey,Spidey,1,,1,,Marvel,Superhéroes,Infantil,1080p,Español,false,23:20,1400,3,assets/spidey/b.webp,https://ok.ru/video/902,https://ok.ru/videoembed/902
2,903,episode,Spidey,"Spidey - T2E1",spidey,Spidey,2,,1,,Marvel,Superhéroes,Infantil,1080p,Español,false,23:40,1420,1,assets/spidey/c.webp,https://ok.ru/video/903,https://ok.ru/videoembed/903
`

describe('buildTitles with episode rows', () => {
  it('types episode_number as a number', () => {
    const rows = parseCatalogCsv(EPISODIC_CSV)
    expect(rows[0].episode_number).toBe(2)
  })

  it('sorts episodes by season then episode number regardless of scrape order', () => {
    const show = buildTitles(parseCatalogCsv(EPISODIC_CSV))[0]
    expect(show.seasons.map((s) => [s.season_number, s.episode_number])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- loadCatalog`
Expected: `episode_number` assertions fail — `rows[0].episode_number` is the string `"2"` (not yet in the numeric-conversion list), and the sort test fails because `buildTitles` doesn't sort by episode number, so the scrape order (`[1,2]` then `[1,1]`) comes through unchanged.

- [ ] **Step 3: Add `episode_number` to the type and the numeric-conversion list**

In `src/types.ts`, in `CatalogRow`, change:

```ts
  type: 'movie' | 'season'
```

to:

```ts
  type: 'movie' | 'season' | 'episode'
```

and add, right after `season_label: string`:

```ts
  episode_number: number | null
```

In `src/catalog/loadCatalog.ts`, change:

```ts
const NUMERIC = ['catalog_index', 'season_number', 'year', 'duration_seconds', 'views']
```

to:

```ts
const NUMERIC = ['catalog_index', 'season_number', 'episode_number', 'year', 'duration_seconds', 'views']
```

- [ ] **Step 4: Sort by season then episode number**

In `src/catalog/loadCatalog.ts`, in `buildTitles()`, change:

```ts
    const seasons = [...group].sort(
      (a, b) => (a.season_number ?? 0) - (b.season_number ?? 0),
    )
```

to:

```ts
    const seasons = [...group].sort(
      (a, b) =>
        (a.season_number ?? 0) - (b.season_number ?? 0) ||
        (a.episode_number ?? 0) - (b.episode_number ?? 0),
    )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- loadCatalog`
Expected: PASS.

- [ ] **Step 6: Run the full frontend suite**

Run: `npm test`
Expected: PASS (36 existing tests + 2 new; no existing test's CSV fixture includes `episode_number`, so those rows parse it as `null` and are unaffected by the sort's tie-breaker).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/catalog/loadCatalog.ts src/catalog/loadCatalog.test.ts
git commit -m "feat: support episode_number in the catalog loader"
```

---

### Task 6: Detail screen — season/episode grouping

**Files:**
- Create: `src/screens/groupSeasons.ts`
- Create: `src/screens/groupSeasons.test.ts`
- Modify: `src/screens/Detail.tsx`
- Modify: `src/screens/Detail.css`

**Interfaces:**
- Consumes: `CatalogRow`, `Title` (Task 5).
- Produces: `groupSeasons(rows: CatalogRow[]): SeasonGroup[]`, `SeasonGroup { seasonNumber: number; label: string; rows: CatalogRow[] }`.

- [ ] **Step 1: Write the failing test**

`src/screens/groupSeasons.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupSeasons } from './groupSeasons'
import type { CatalogRow } from '../types'

function row(overrides: Partial<CatalogRow>): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'season', title: 'X', title_raw: '',
    series_id: 'x', series_title: 'X', season_number: 1, season_label: '',
    episode_number: null, year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
    ...overrides,
  }
}

describe('groupSeasons', () => {
  it('gives one group per season row for a legacy single-video show', () => {
    const rows = [row({ video_id: '1', season_number: 1 }), row({ video_id: '2', season_number: 2 })]
    const groups = groupSeasons(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0].rows).toHaveLength(1)
    expect(groups[1].rows).toHaveLength(1)
  })

  it('groups multiple episode rows sharing a season number together', () => {
    const rows = [
      row({ video_id: '1', type: 'episode', season_number: 1, episode_number: 1 }),
      row({ video_id: '2', type: 'episode', season_number: 1, episode_number: 2 }),
      row({ video_id: '3', type: 'episode', season_number: 2, episode_number: 1 }),
    ]
    const groups = groupSeasons(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0].rows.map((r) => r.video_id)).toEqual(['1', '2'])
    expect(groups[1].rows.map((r) => r.video_id)).toEqual(['3'])
  })

  it('falls back to "Temporada N" when season_label is empty', () => {
    const groups = groupSeasons([row({ season_number: 3, season_label: '' })])
    expect(groups[0].label).toBe('Temporada 3')
  })

  it('uses season_label verbatim when present', () => {
    const groups = groupSeasons([
      row({ season_number: 5, season_label: '22º Torneo de las Artes Marciales' }),
    ])
    expect(groups[0].label).toBe('22º Torneo de las Artes Marciales')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- groupSeasons`
Expected: FAIL — `Failed to resolve import "./groupSeasons"`.

- [ ] **Step 3: Implement `groupSeasons()`**

`src/screens/groupSeasons.ts`:

```ts
import type { CatalogRow } from '../types'

export interface SeasonGroup {
  seasonNumber: number
  label: string
  rows: CatalogRow[]
}

/** `rows` must already be sorted by season_number (buildTitles guarantees this). */
export function groupSeasons(rows: CatalogRow[]): SeasonGroup[] {
  const groups: SeasonGroup[] = []

  for (const row of rows) {
    const seasonNumber = row.season_number ?? 0
    const current = groups[groups.length - 1]

    if (current && current.seasonNumber === seasonNumber) {
      current.rows.push(row)
    } else {
      groups.push({
        seasonNumber,
        label: row.season_label || `Temporada ${seasonNumber}`,
        rows: [row],
      })
    }
  }

  return groups
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- groupSeasons`
Expected: PASS.

- [ ] **Step 5: Update `Detail.tsx`**

Replace the full contents of `src/screens/Detail.tsx` with:

```tsx
import { useMemo, useState, type ReactNode } from 'react'
import type { CatalogRow, Title } from '../types'
import { Backdrop } from '../components/Backdrop'
import { useFocusable } from '../focus/useFocusable'
import { formatDuration, formatViews } from '../lib/format'
import { groupSeasons } from './groupSeasons'
import './Detail.css'

function FocusButton({
  id,
  row,
  col,
  onEnter,
  className,
  children,
}: {
  id: string
  row: number
  col: number
  onEnter: () => void
  className: string
  children: ReactNode
}) {
  const { ref, focused, activate, tabIndex } = useFocusable(id, row, col, onEnter)
  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      role="button"
      className={`${className}${focused ? ' is-focused' : ''}`}
      data-focused={focused}
      onClick={activate}
    >
      {children}
    </div>
  )
}

export function Detail({
  title,
  onPlay,
  onBack,
}: {
  title: Title
  onPlay: (row: CatalogRow) => void
  /**
   * A remote/keyboard user backs out with Escape/Backspace (handled in
   * FocusProvider); a phone has no such key, so touch needs a visible,
   * tappable way back too.
   */
  onBack: () => void
}) {
  const [activeRow, setActiveRow] = useState<CatalogRow>(title.seasons[0])
  const isShow = title.kind === 'show'

  const seasonGroups = useMemo(() => groupSeasons(title.seasons), [title.seasons])
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(
    activeRow.season_number ?? seasonGroups[0]?.seasonNumber ?? 0,
  )
  const selectedGroup = seasonGroups.find((group) => group.seasonNumber === selectedSeasonNumber)

  const meta = [
    activeRow.year ?? title.year,
    title.quality,
    title.subtitled ? `${title.language} (sub)` : title.language,
    formatDuration(activeRow.duration_seconds),
    formatViews(title.views),
  ].filter(Boolean)

  return (
    <div className="go-detail">
      <Backdrop thumbnail={title.thumbnail} />

      <button type="button" className="go-back" onClick={onBack} aria-label="Volver">
        <span className="go-back_chevron" aria-hidden="true" />
      </button>

      <div className="go-detail_body">
        <div className="go-detail_main">
          <p className="go-detail_eyebrow">
            {isShow ? `Serie · ${seasonGroups.length} temporadas` : 'Película'}
            {title.studio && ` · ${title.studio}`}
          </p>

          <h1 className="go-detail_title">{title.title}</h1>

          <p className="go-detail_meta">
            {meta.map((item, index) => (
              <span key={index}>
                {index > 0 && <span className="go-detail_sep" aria-hidden="true" />}
                {item}
              </span>
            ))}
          </p>

          <div className="go-detail_genres">
            {[title.genre, title.genre_secondary].filter(Boolean).map((genre) => (
              <span key={genre} className="go-chip">
                {genre}
              </span>
            ))}
          </div>

          <FocusButton
            id="detail:play"
            row={0}
            col={0}
            onEnter={() => onPlay(activeRow)}
            className="go-play"
          >
            <span className="go-play_icon" aria-hidden="true" />
            Reproducir
            {isShow && (
              <span className="go-play_season">
                {activeRow.season_label || `Temporada ${activeRow.season_number}`}
                {activeRow.episode_number ? ` · Episodio ${activeRow.episode_number}` : ''}
              </span>
            )}
          </FocusButton>

          <p className="go-detail_hint">
            Usa las flechas para navegar · Atrás para volver
          </p>
        </div>

        <figure className="go-detail_art">
          <img src={`/${title.thumbnail}`} alt="" />
        </figure>
      </div>

      {isShow && (
        <section className="go-seasons">
          <h2 className="go-seasons_label">Temporadas</h2>
          <div className="go-seasons_list">
            {seasonGroups.map((group, index) => (
              <FocusButton
                key={group.seasonNumber}
                id={`detail:season:${group.seasonNumber}`}
                row={1}
                col={index}
                onEnter={() => {
                  const first = group.rows[0]
                  setActiveRow(first)
                  setSelectedSeasonNumber(group.seasonNumber)
                  if (group.rows.length === 1) onPlay(first)
                }}
                className={`go-season${
                  group.seasonNumber === selectedSeasonNumber ? ' is-active' : ''
                }`}
              >
                <span className="go-season_n">{group.label}</span>
                <span className="go-season_d">
                  {group.rows.length > 1
                    ? `${group.rows.length} episodios`
                    : [formatDuration(group.rows[0].duration_seconds), group.rows[0].quality]
                        .filter(Boolean)
                        .join(' · ')}
                </span>
              </FocusButton>
            ))}
          </div>

          {selectedGroup && selectedGroup.rows.length > 1 && (
            <div className="go-episodes">
              <h2 className="go-seasons_label">Episodios</h2>
              <div className="go-seasons_list">
                {selectedGroup.rows.map((episode, index) => (
                  <FocusButton
                    key={episode.video_id}
                    id={`detail:episode:${episode.video_id}`}
                    row={2}
                    col={index}
                    onEnter={() => {
                      setActiveRow(episode)
                      onPlay(episode)
                    }}
                    className={`go-season${
                      episode.video_id === activeRow.video_id ? ' is-active' : ''
                    }`}
                  >
                    <span className="go-season_n">Episodio {episode.episode_number}</span>
                    <span className="go-season_d">
                      {[formatDuration(episode.duration_seconds), episode.quality]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </FocusButton>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Add episode-row spacing to `Detail.css`**

In `src/screens/Detail.css`, add after the `.go-seasons_list` rule:

```css
.go-episodes {
  margin-top: 1.5rem;
}
```

- [ ] **Step 7: Run the full frontend suite**

Run: `npm test`
Expected: PASS (existing tests, none of which render `Detail`, are unaffected; `groupSeasons` tests pass).

- [ ] **Step 8: Manual verification**

```bash
npm run dev
```

With the dev server running and Task 4's data in place:

1. Navigate Home → the "Series" row (or search visually) → open *Spidey y sus Sorprendentes Amigos*.
2. Confirm the eyebrow reads "Serie · 5 temporadas" and 5 season tabs are focusable.
3. Select a season tab with more than one episode (e.g. season 1) — confirm an "Episodios" row appears below with that season's episodes, without navigating to the player.
4. Move focus down into the episode row, select an episode other than the first — confirm it becomes the active/highlighted one and the player opens on the correct video (check the title bar in the player matches the expected episode).
5. Back out (Escape/Backspace) to Detail, open a legacy show with single-video seasons (e.g. *Hora de Aventura*) — confirm its season tabs behave exactly as before (selecting a season plays it directly; no episode row ever appears).

- [ ] **Step 9: Commit**

```bash
git add src/screens/groupSeasons.ts src/screens/groupSeasons.test.ts \
  src/screens/Detail.tsx src/screens/Detail.css
git commit -m "feat: show per-season episode list in Detail for episodic series"
```
