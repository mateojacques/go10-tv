# Episode Chapters for Season-Pack Videos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a season-pack ok.ru video (one file containing a whole season) be split into individually-playable, navigable episodes by detecting in-file boundaries, without a new source upload.

**Architecture:** A per-series `data/chapters/<series_id>.json` sidecar (produced by a new `scripts/detect_chapters.py` detection tool + manual review) drives `parse_catalog.py` to explode a `season`-type CSV row into multiple `episode` rows sharing one `video_id` but carrying distinct `chapter_start_seconds`/`chapter_end_seconds`. Because rows can now share a `video_id`, every runtime call site that assumed `video_id` uniquely identified a row (progress storage, React list keys, route matching, next/prev lookup) switches to a new `rowKey()` helper. `Player.tsx` gains two behaviors: treating a `timeupdate` crossing `chapter_end_seconds` as an in-file "ended" event, and seeking (not reloading) when navigating between two rows that share a `video_id`.

**Tech Stack:** React 19 + TypeScript (Vite), Vitest + Testing Library; Python 3 (`csv`, `json`, `subprocess`, `argparse`) + pytest; `yt-dlp` and `ffmpeg`/`ffprobe` as external CLI tools (both already installed on this machine).

**Spec:** `docs/superpowers/specs/2026-09-22-episode-chapters-design.md`

## Global Constraints

- Chapters are opt-in per title: a `season` row with no matching `data/chapters/<series_id>.json` entry is emitted unchanged.
- The source video is never modified — only played back with a different start/end window.
- No new UI is built for reviewing detected boundaries; review happens in mpv/VLC against the locally downloaded file, then hand-editing the draft JSON.
- `catalog_index` stays a unique, sequential value across the whole output CSV.
- `progressStore`'s own signature (`readProgress(videoId)`, `writeProgress(videoId, {time, duration})`, `markWatched(videoId, duration)`) does not change — callers pass whatever key `rowKey()` computes.

---

## Task 1: Explode chaptered season rows in `parse_catalog.py`

**Files:**
- Modify: `scripts/parse_catalog.py`
- Modify: `tests/test_parse_catalog.py`

**Interfaces:**
- Produces: `load_chapters(chapters_dir: str) -> dict[str, list[dict]]` — merges every `data/chapters/*.json` file into one `{video_id: [chapter, ...]}` mapping.
- Produces: `explode_season_row(row: dict, chapters: dict) -> list[dict]` — returns `[row]` unchanged, or one exploded `episode` row dict per chapter.
- Produces: `explode_chapters(rows: list[dict], chapters: dict) -> list[dict]` — applies `explode_season_row` across a row list and renumbers `catalog_index` sequentially over the result.
- Consumes: nothing new from other tasks (`COLUMNS`, `build_rows`, `main` already exist in this file).

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_parse_catalog.py`:

```python
def test_columns_include_chapter_boundaries_after_episode_number():
    assert COLUMNS[9:12] == ["episode_number", "chapter_start_seconds", "chapter_end_seconds"]


def test_load_chapters_merges_every_sidecar_in_the_dir(tmp_path):
    chapters_dir = tmp_path / "chapters"
    chapters_dir.mkdir()
    (chapters_dir / "show-a.json").write_text(
        '{"111": [{"episode_number": 1, "title": "E1", "start_seconds": 0, "end_seconds": 1435}]}',
        encoding="utf-8",
    )
    (chapters_dir / "show-b.json").write_text(
        '{"222": [{"episode_number": 1, "title": "E1", "start_seconds": 0, "end_seconds": 1200}]}',
        encoding="utf-8",
    )
    chapters = parse_catalog.load_chapters(str(chapters_dir))
    assert set(chapters) == {"111", "222"}
    assert chapters["111"][0]["end_seconds"] == 1435


def test_load_chapters_returns_empty_dict_when_dir_missing(tmp_path):
    assert parse_catalog.load_chapters(str(tmp_path / "nope")) == {}


SEASON_ROW = {
    "catalog_index": 5, "video_id": "111", "type": "season",
    "title": "Hora de Aventura", "title_raw": "Hora de Aventura - Temporada 1",
    "series_id": "hora-de-aventura", "series_title": "Hora de Aventura",
    "season_number": "1", "season_label": "", "episode_number": "",
    "year": "2010", "studio": "Cartoon N.", "genre": "Animación",
    "genre_secondary": "", "quality": "1080p", "language": "Español",
    "subtitled": "false", "duration_raw": "4:08:29", "duration_seconds": 14909,
    "views": 173, "thumbnail": "catalogo_files/b.webp",
    "video_url": "https://ok.ru/video/111", "embed_url": "https://ok.ru/videoembed/111",
}

THREE_CHAPTERS = [
    {"episode_number": 1, "title": "Episodio 1", "start_seconds": 0, "end_seconds": 1435},
    {"episode_number": 2, "title": "Episodio 2", "start_seconds": 1440, "end_seconds": 2810},
    {"episode_number": 3, "title": "Episodio 3", "start_seconds": 2815, "end_seconds": None},
]


def test_explode_season_row_returns_row_unchanged_without_a_chapters_entry():
    assert parse_catalog.explode_season_row(SEASON_ROW, {}) == [SEASON_ROW]


def test_explode_season_row_produces_one_episode_row_per_chapter():
    rows = parse_catalog.explode_season_row(SEASON_ROW, {"111": THREE_CHAPTERS})
    assert len(rows) == 3
    assert all(r["type"] == "episode" for r in rows)
    assert all(r["video_id"] == "111" for r in rows)
    assert all(r["series_id"] == "hora-de-aventura" for r in rows)
    assert [r["episode_number"] for r in rows] == ["1", "2", "3"]
    assert [r["chapter_start_seconds"] for r in rows] == ["0", "1440", "2815"]
    assert [r["chapter_end_seconds"] for r in rows] == ["1435", "2810", ""]


def test_explode_season_row_computes_per_chapter_duration_including_open_ended_last():
    rows = parse_catalog.explode_season_row(SEASON_ROW, {"111": THREE_CHAPTERS})
    assert rows[0]["duration_seconds"] == 1435  # 1435 - 0
    assert rows[1]["duration_seconds"] == 1370  # 2810 - 1440
    assert rows[2]["duration_seconds"] == 14909 - 2815  # open-ended: parent's total duration


def test_explode_season_row_ignores_a_non_season_row():
    episode_row = {**SEASON_ROW, "type": "episode", "video_id": "111"}
    assert parse_catalog.explode_season_row(episode_row, {"111": THREE_CHAPTERS}) == [episode_row]


def test_explode_chapters_renumbers_catalog_index_across_the_result():
    other = {**SEASON_ROW, "catalog_index": 6, "video_id": "222"}
    rows = parse_catalog.explode_chapters([SEASON_ROW, other], {"111": THREE_CHAPTERS})
    assert len(rows) == 4  # 3 exploded + 1 unchanged
    assert [r["catalog_index"] for r in rows] == [0, 1, 2, 3]
    assert rows[3]["video_id"] == "222"
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `python3 -m pytest tests/test_parse_catalog.py -v`
Expected: FAIL — `AttributeError: module 'parse_catalog' has no attribute 'load_chapters'` (and similar for the others), and `test_columns_include_chapter_boundaries_after_episode_number` fails because those columns don't exist yet.

- [ ] **Step 3: Implement `load_chapters`, `explode_season_row`, `explode_chapters`; add the two columns; fix `report_coverage`; wire into `main`**

In `scripts/parse_catalog.py`, add the constant near the other `*_DIR` constants:

```python
CHAPTERS_DIR = os.path.join(ROOT, "data", "chapters")
```

Update `COLUMNS` (insert two entries right after `"episode_number"`):

```python
COLUMNS = [
    "catalog_index", "video_id", "type", "title", "title_raw",
    "series_id", "series_title", "season_number", "season_label",
    "episode_number", "chapter_start_seconds", "chapter_end_seconds",
    "year", "studio", "genre", "genre_secondary",
    "quality", "language", "subtitled", "duration_raw", "duration_seconds",
    "views", "thumbnail", "video_url", "embed_url",
]
```

Add the three new functions (near `load_series_sidecars`):

```python
def load_chapters(chapters_dir):
    """Return {video_id: [chapter, ...]} merged from every data/chapters/*.json file."""
    if not os.path.isdir(chapters_dir):
        return {}
    chapters = {}
    for name in sorted(os.listdir(chapters_dir)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(chapters_dir, name), encoding="utf-8") as handle:
            chapters.update(json.load(handle))
    return chapters


def explode_season_row(row, chapters):
    """Turn one `season`-type row dict into one `episode` row dict per entry
    in `chapters.get(row["video_id"])`, or return `[row]` unchanged if the
    row isn't a season row or has no matching chapters entry.

    All chapters of one video share its `video_id`/`embed_url`/`video_url`/
    `thumbnail`; only `episode_number`, `chapter_start_seconds`,
    `chapter_end_seconds`, `duration_seconds`, and `title` vary per chapter.
    The final chapter's `end_seconds` may be `None` (open-ended, plays out
    to ok.ru's real `ended` event) — its duration is computed against the
    parent row's own total `duration_seconds`.
    """
    video_chapters = chapters.get(row["video_id"])
    if row["type"] != "season" or not video_chapters:
        return [row]

    total_duration = row["duration_seconds"]
    exploded = []
    for chapter in video_chapters:
        start = chapter["start_seconds"]
        end = chapter["end_seconds"]
        new_row = {**row}
        new_row.update({
            "type": "episode",
            "episode_number": str(chapter["episode_number"]),
            "chapter_start_seconds": str(start),
            "chapter_end_seconds": "" if end is None else str(end),
            "duration_seconds": (end if end is not None else total_duration) - start,
            "title": chapter.get("title") or row["title"],
        })
        exploded.append(new_row)
    return exploded


def explode_chapters(rows, chapters):
    """Apply `explode_season_row` across `rows`, then renumber
    `catalog_index` sequentially over the result so it stays a unique,
    ordered position even though one row may have become several.
    """
    exploded = []
    for row in rows:
        exploded.extend(explode_season_row(row, chapters))
    for index, row in enumerate(exploded):
        row["catalog_index"] = index
    return exploded
```

Fix `report_coverage` (it indexes `row[column]` directly, which would `KeyError` on the many rows that don't carry the two new keys — every existing row-building function relies on `csv.DictWriter`'s `restval` to fill missing keys with `''` only at write time, not before):

```python
def report_coverage(rows):
    print(f"rows: {len(rows)}")
    for column in COLUMNS:
        filled = sum(1 for row in rows if str(row.get(column, "")) not in ("", "0", "false"))
        print(f"  {column:<18} {filled:>4}/{len(rows)}")
```

Wire the explode pass into `main()`, right after the base rows are built and before the series-sidecar pass appends its own rows:

```python
def main():
    html_text = open(SOURCE_HTML, encoding="utf-8").read()
    rows = build_rows(html_text, load_genres(GENRES_CSV))
    rows = explode_chapters(rows, load_chapters(CHAPTERS_DIR))

    for slug, sidecar in load_series_sidecars(SERIES_DIR):
        series_html = open(os.path.join(ROOT, f"{slug}.html"), encoding="utf-8").read()
        rows.extend(build_episode_rows(series_html, sidecar, slug, len(rows)))
    ...
```

(Leave the rest of `main()` — `os.makedirs`, the `csv.DictWriter` block, `report_coverage`, the final print — exactly as it is.)

- [ ] **Step 4: Run the tests and verify they pass**

Run: `python3 -m pytest tests/test_parse_catalog.py -v`
Expected: PASS — all tests green, including the pre-existing ones (row counts for the base 907-row catalog are unaffected since `data/chapters/` doesn't exist yet in the real repo).

- [ ] **Step 5: Commit**

```bash
git add scripts/parse_catalog.py tests/test_parse_catalog.py
git commit -m "feat: explode chaptered season rows into episode rows in parse_catalog"
```

---

## Task 2: `scripts/detect_chapters.py` — chapter boundary detection tool

**Files:**
- Create: `scripts/detect_chapters.py`
- Create: `tests/test_detect_chapters.py`

**Interfaces:**
- Produces (pure, tested): `parse_silencedetect(ffmpeg_stderr: str) -> list[tuple[float, float]]`, `parse_blackdetect(ffmpeg_stderr: str) -> list[tuple[float, float]]`, `merge_candidates(silences, blacks, merge_window: float = 1.5) -> list[float]`, `build_draft_chapters(candidates: list[float], total_duration: float, expected_count: int | None) -> list[dict]`, `format_timestamp(seconds: float) -> str`, `find_row(csv_path: str, video_id: str) -> dict | None`, `write_chapters_file(chapters_dir: str, series_id: str, video_id: str, chapters: list[dict]) -> str`.
- Produces (I/O wrappers, not unit-tested — see rationale below): `download_video`, `probe_duration`, `run_silencedetect`, `run_blackdetect`, `main`.
- Consumes: nothing from other tasks (reads `public/data/catalog.csv` directly, same as `parse_catalog.py`'s own constants).

`download_video`/`probe_duration`/`run_silencedetect`/`run_blackdetect` each wrap one external process (`yt-dlp`, `ffprobe`, `ffmpeg`) with no fixture-friendly pure logic of their own — same reasoning `parse_catalog.py`'s own `main()` isn't unit tested: they're thin shells around real I/O, verified by actually running the tool once against a real title (a manual step, not part of this task).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_detect_chapters.py`:

```python
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import detect_chapters


SILENCEDETECT_OUTPUT = """
[silencedetect @ 0x1] silence_start: 1434.2
[silencedetect @ 0x1] silence_end: 1436.8 | silence_duration: 2.6
[silencedetect @ 0x1] silence_start: 2809.0
[silencedetect @ 0x1] silence_end: 2811.4 | silence_duration: 2.4
[silencedetect @ 0x1] silence_start: 4200.0
"""

BLACKDETECT_OUTPUT = """
[blackdetect @ 0x2] black_start:1435.0 black_end:1436.5 black_duration:1.5
"""


def test_parse_silencedetect_pairs_starts_with_ends():
    assert detect_chapters.parse_silencedetect(SILENCEDETECT_OUTPUT) == [
        (1434.2, 1436.8), (2809.0, 2811.4),
    ]


def test_parse_silencedetect_drops_a_trailing_unterminated_silence():
    # The third silence_start above has no matching silence_end (EOF).
    assert len(detect_chapters.parse_silencedetect(SILENCEDETECT_OUTPUT)) == 2


def test_parse_blackdetect_extracts_start_end_pairs():
    assert detect_chapters.parse_blackdetect(BLACKDETECT_OUTPUT) == [(1435.0, 1436.5)]


def test_merge_candidates_collapses_nearby_silence_and_black_hits():
    # silence midpoint 1435.5, black midpoint 1435.75 -> within 1.5s, merge to one
    candidates = detect_chapters.merge_candidates(
        [(1434.2, 1436.8), (2809.0, 2811.4)], [(1435.0, 1436.5)],
    )
    assert len(candidates) == 2
    assert abs(candidates[0] - 1435.6) < 1
    assert abs(candidates[1] - 2810.2) < 1


def test_merge_candidates_keeps_distant_hits_separate():
    candidates = detect_chapters.merge_candidates([(0, 2), (100, 102)], [])
    assert candidates == [1.0, 101.0]


def test_build_draft_chapters_brackets_candidates_into_episodes():
    chapters = detect_chapters.build_draft_chapters([1435, 2810], 4200, expected_count=None)
    assert chapters == [
        {"episode_number": 1, "title": "Episodio 1", "start_seconds": 0, "end_seconds": 1435},
        {"episode_number": 2, "title": "Episodio 2", "start_seconds": 1435, "end_seconds": 2810},
        {"episode_number": 3, "title": "Episodio 3", "start_seconds": 2810, "end_seconds": None},
    ]


def test_build_draft_chapters_warns_on_expected_count_mismatch(capsys):
    detect_chapters.build_draft_chapters([1435], 4200, expected_count=5)
    assert "expected 5" in capsys.readouterr().out


def test_format_timestamp_omits_hours_under_an_hour():
    assert detect_chapters.format_timestamp(125) == "2:05"


def test_format_timestamp_includes_hours_over_an_hour():
    assert detect_chapters.format_timestamp(3725) == "1:02:05"


def test_find_row_returns_the_matching_row(tmp_path):
    csv_path = tmp_path / "catalog.csv"
    csv_path.write_text(
        "video_id,type,series_id\n111,season,hora-de-aventura\n222,movie,\n",
        encoding="utf-8",
    )
    row = detect_chapters.find_row(str(csv_path), "111")
    assert row["series_id"] == "hora-de-aventura"


def test_find_row_returns_none_when_missing(tmp_path):
    csv_path = tmp_path / "catalog.csv"
    csv_path.write_text("video_id,type,series_id\n111,season,x\n", encoding="utf-8")
    assert detect_chapters.find_row(str(csv_path), "999") is None


def test_write_chapters_file_creates_and_merges(tmp_path):
    chapters = [{"episode_number": 1, "title": "E1", "start_seconds": 0, "end_seconds": None}]
    path = detect_chapters.write_chapters_file(str(tmp_path), "hora-de-aventura", "111", chapters)
    assert json.loads(open(path, encoding="utf-8").read()) == {"111": chapters}

    other_chapters = [{"episode_number": 1, "title": "E1", "start_seconds": 0, "end_seconds": None}]
    detect_chapters.write_chapters_file(str(tmp_path), "hora-de-aventura", "222", other_chapters)
    merged = json.loads(open(path, encoding="utf-8").read())
    assert set(merged) == {"111", "222"}
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `python3 -m pytest tests/test_detect_chapters.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'detect_chapters'`.

- [ ] **Step 3: Implement `scripts/detect_chapters.py`**

```python
"""Propose episode-boundary timestamps inside a season-pack ok.ru video.

Run: python3 scripts/detect_chapters.py <video_id> [--episodes N]

Downloads the video with yt-dlp, runs ffmpeg silence/black-frame detection,
and writes a *draft* data/chapters/<series_id>.json. Review the candidates
against the downloaded file (printed at the end) in mpv/VLC and hand-edit
the draft before committing it -- detection is a starting point, not the
final answer.
"""
import argparse
import csv
import glob
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUTPUT_CSV = os.path.join(ROOT, "public", "data", "catalog.csv")
CHAPTERS_DIR = os.path.join(ROOT, "data", "chapters")

SILENCE_START_RE = re.compile(r"silence_start:\s*([\d.]+)")
SILENCE_END_RE = re.compile(r"silence_end:\s*([\d.]+)")
BLACK_RE = re.compile(r"black_start:([\d.]+)\s+black_end:([\d.]+)")


def parse_silencedetect(output):
    """Pair each silence_start with its silence_end, in emitted order.

    A trailing silence_start with no matching silence_end (still silent at
    EOF) is dropped by zip() truncating to the shorter list -- there's no
    boundary to propose for it.
    """
    starts = [float(m.group(1)) for m in SILENCE_START_RE.finditer(output)]
    ends = [float(m.group(1)) for m in SILENCE_END_RE.finditer(output)]
    return list(zip(starts, ends))


def parse_blackdetect(output):
    return [(float(m.group(1)), float(m.group(2))) for m in BLACK_RE.finditer(output)]


def merge_candidates(silences, blacks, merge_window=1.5):
    """Collapse each (start, end) interval to its midpoint, then merge
    midpoints within `merge_window` seconds of each other -- a real
    transition often trips both silence and black-frame detection at
    nearly the same instant.
    """
    midpoints = sorted((start + end) / 2 for start, end in [*silences, *blacks])
    merged = []
    for point in midpoints:
        if merged and point - merged[-1] <= merge_window:
            continue
        merged.append(point)
    return merged


def build_draft_chapters(candidates, total_duration, expected_count=None):
    """Bracket ordered cut-point candidates into a draft chapter list.

    Each candidate becomes both the previous chapter's `end_seconds` and
    the next chapter's `start_seconds` -- review should nudge these apart
    to bracket the real transition's dead zone, per the chapters file
    convention (see the design spec).
    """
    bounds = [0, *candidates, total_duration]
    chapters = []
    for number, (start, end) in enumerate(zip(bounds, bounds[1:]), start=1):
        chapters.append({
            "episode_number": number,
            "title": f"Episodio {number}",
            "start_seconds": round(start),
            "end_seconds": None if end == total_duration else round(end),
        })
    if expected_count is not None and len(chapters) != expected_count:
        print(f"warning: detected {len(chapters)} candidate chapters, expected {expected_count}")
    return chapters


def format_timestamp(seconds):
    seconds = int(seconds)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def find_row(csv_path, video_id):
    with open(csv_path, encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["video_id"] == video_id:
                return row
    return None


def write_chapters_file(chapters_dir, series_id, video_id, chapters):
    """Merge `chapters` under `video_id` into data/chapters/<series_id>.json,
    preserving any other video_id entries already there (a series with one
    season-pack video per season has one entry per video in the same file).
    """
    os.makedirs(chapters_dir, exist_ok=True)
    path = os.path.join(chapters_dir, f"{series_id}.json")
    existing = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            existing = json.load(handle)
    existing[video_id] = chapters
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(existing, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return path


def download_video(video_url, dest_dir):
    subprocess.run(
        ["yt-dlp", "-o", os.path.join(dest_dir, "%(id)s.%(ext)s"), video_url],
        check=True,
    )
    matches = glob.glob(os.path.join(dest_dir, "*"))
    if not matches:
        raise RuntimeError(f"yt-dlp produced no file for {video_url}")
    return matches[0]


def probe_duration(video_path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video_path],
        check=True, capture_output=True, text=True,
    )
    return float(result.stdout.strip())


def run_silencedetect(video_path, noise_db=-30, min_duration=1.0):
    result = subprocess.run(
        ["ffmpeg", "-i", video_path, "-af",
         f"silencedetect=noise={noise_db}dB:d={min_duration}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    return result.stderr


def run_blackdetect(video_path, min_duration=0.5):
    result = subprocess.run(
        ["ffmpeg", "-i", video_path, "-vf",
         f"blackdetect=d={min_duration}:pic_th=0.98", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    return result.stderr


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video_id")
    parser.add_argument("--episodes", type=int, default=None,
                         help="expected episode count, for a sanity-check warning")
    args = parser.parse_args()

    row = find_row(OUTPUT_CSV, args.video_id)
    if not row:
        sys.exit(f"video_id {args.video_id!r} not found in {OUTPUT_CSV}")
    if row["type"] != "season":
        sys.exit(f"video_id {args.video_id!r} is type={row['type']!r}, not a season-pack row")
    if not row["series_id"]:
        sys.exit(f"video_id {args.video_id!r} has no series_id")

    scratch_dir = tempfile.mkdtemp(prefix="go10-chapters-")
    print(f"downloading into {scratch_dir} ...")
    video_path = download_video(row["video_url"], scratch_dir)

    print("probing duration...")
    duration = probe_duration(video_path)

    print("running silence/black-frame detection (this scans the whole file)...")
    silences = parse_silencedetect(run_silencedetect(video_path))
    blacks = parse_blackdetect(run_blackdetect(video_path))
    candidates = merge_candidates(silences, blacks)
    chapters = build_draft_chapters(candidates, duration, args.episodes)

    chapters_path = write_chapters_file(CHAPTERS_DIR, row["series_id"], args.video_id, chapters)

    print(f"\n{len(chapters)} candidate chapters:")
    for chapter in chapters:
        print(f"  {chapter['episode_number']:>3}  {format_timestamp(chapter['start_seconds'])}")
    print(f"\nwrote draft {chapters_path}")
    print(f"review against the downloaded file before committing: {video_path}")


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `python3 -m pytest tests/test_detect_chapters.py -v`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add scripts/detect_chapters.py tests/test_detect_chapters.py
git commit -m "feat: add chapter boundary detection tool (yt-dlp + ffmpeg)"
```

---

## Task 3: `CatalogRow` chapter fields

**Files:**
- Modify: `src/types.ts`
- Modify: `src/catalog/loadCatalog.ts`
- Modify: `src/catalog/loadCatalog.test.ts`
- Modify: `src/catalog/catalogCache.test.ts`
- Modify: `src/progress/titleProgress.test.ts`
- Modify: `src/screens/nextEpisode.test.ts`
- Modify: `src/screens/Player.test.tsx`
- Modify: `src/screens/Detail.test.tsx`
- Modify: `src/router/resolveRoute.test.ts`
- Modify: `src/screens/groupSeasons.test.ts`

**Interfaces:**
- Produces: `CatalogRow.chapter_start_seconds: number | null`, `CatalogRow.chapter_end_seconds: number | null` — consumed by `rowKey()` (Task 4) and `Player.tsx` (Tasks 9–10).

- [ ] **Step 1: Write the failing test**

Add to `src/catalog/loadCatalog.test.ts`:

```ts
const CHAPTER_CSV = `catalog_index,video_id,type,title,title_raw,series_id,series_title,season_number,season_label,episode_number,chapter_start_seconds,chapter_end_seconds,year,studio,genre,genre_secondary,quality,language,subtitled,duration_raw,duration_seconds,views,thumbnail,video_url,embed_url
0,111,episode,Hora de Aventura,"Hora de Aventura - Temporada 1",hora-de-aventura,Hora de Aventura,1,,1,0,1435,2010,Cartoon N.,Animación,,1080p,Español,false,23:55,1435,173,catalogo_files/b.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
1,111,episode,Hora de Aventura,"Hora de Aventura - Temporada 1",hora-de-aventura,Hora de Aventura,1,,2,1435,,2010,Cartoon N.,Animación,,1080p,Español,false,45:34,2735,50,catalogo_files/b.webp,https://ok.ru/video/111,https://ok.ru/videoembed/111
`

describe('parseCatalogCsv with chapter boundaries', () => {
  it('types chapter_start_seconds/chapter_end_seconds as numbers, and an open end as null', () => {
    const rows = parseCatalogCsv(CHAPTER_CSV)
    expect(rows[0].chapter_start_seconds).toBe(0)
    expect(rows[0].chapter_end_seconds).toBe(1435)
    expect(rows[1].chapter_end_seconds).toBeNull()
  })

  it('leaves chapter fields null for a CSV with no such columns', () => {
    expect(parseCatalogCsv(CSV)[0].chapter_start_seconds).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- loadCatalog`
Expected: FAIL — TypeScript error, `chapter_start_seconds` does not exist on type `CatalogRow` (or the value is `undefined` rather than typed/asserted `null`, depending on how strict the runner surfaces it — either way, red).

- [ ] **Step 3: Add the fields**

In `src/types.ts`, insert into `CatalogRow` right after `episode_number: number | null`:

```ts
  episode_number: number | null
  chapter_start_seconds: number | null
  chapter_end_seconds: number | null
```

In `src/catalog/loadCatalog.ts`, add both to `NUMERIC`:

```ts
const NUMERIC = [
  'catalog_index', 'season_number', 'episode_number', 'chapter_start_seconds',
  'chapter_end_seconds', 'year', 'duration_seconds', 'views',
]
```

(No other change needed there — the existing `value === '' || value === undefined ? null : Number(value)` handles both a missing column and an empty cell.)

In each of the seven fixture files' `row()` helper, insert `chapter_start_seconds: null, chapter_end_seconds: null,` immediately after the `episode_number` field, exactly as below (each is a one-line find-and-replace within that file's `row()` function):

`src/catalog/catalogCache.test.ts`, `src/screens/Player.test.tsx`, `src/router/resolveRoute.test.ts`, `src/screens/groupSeasons.test.ts` — these four all share this exact line:

```ts
    episode_number: null, year: null, studio: '', genre: '', genre_secondary: '',
```

replace with:

```ts
    episode_number: null, chapter_start_seconds: null, chapter_end_seconds: null, year: null, studio: '', genre: '', genre_secondary: '',
```

`src/screens/nextEpisode.test.ts`, `src/screens/Detail.test.tsx` — these two share this exact line:

```ts
    episode_number: 1, year: null, studio: '', genre: '', genre_secondary: '',
```

replace with:

```ts
    episode_number: 1, chapter_start_seconds: null, chapter_end_seconds: null, year: null, studio: '', genre: '', genre_secondary: '',
```

`src/progress/titleProgress.test.ts` — its `row()` takes `episode_number` as a parameter and uses shorthand, so its line is:

```ts
    episode_number, year: null, studio: '', genre: '', genre_secondary: '',
```

replace with:

```ts
    episode_number, chapter_start_seconds: null, chapter_end_seconds: null, year: null, studio: '', genre: '', genre_secondary: '',
```

- [ ] **Step 4: Run the full test suite and verify it passes**

Run: `npm test`
Expected: PASS — the new `loadCatalog` tests are green, and no other test file fails to compile.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/catalog/loadCatalog.ts src/catalog/loadCatalog.test.ts \
  src/catalog/catalogCache.test.ts src/progress/titleProgress.test.ts \
  src/screens/nextEpisode.test.ts src/screens/Player.test.tsx src/screens/Detail.test.tsx \
  src/router/resolveRoute.test.ts src/screens/groupSeasons.test.ts
git commit -m "feat: add chapter_start_seconds/chapter_end_seconds to CatalogRow"
```

---

## Task 4: `rowKey()` helper

**Files:**
- Create: `src/catalog/rowKey.ts`
- Create: `src/catalog/rowKey.test.ts`

**Interfaces:**
- Consumes: `CatalogRow.chapter_start_seconds`, `CatalogRow.video_id`, `CatalogRow.episode_number` (Task 3).
- Produces: `rowKey(row: CatalogRow): string` — consumed by Tasks 5–10.

- [ ] **Step 1: Write the failing tests**

Create `src/catalog/rowKey.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rowKey } from './rowKey'
import type { CatalogRow } from '../types'

function row(overrides: Partial<CatalogRow>): CatalogRow {
  return {
    catalog_index: 0, video_id: '1', type: 'episode', title: 'X', title_raw: '',
    series_id: 'x', series_title: 'X', season_number: 1, season_label: '',
    episode_number: 1, chapter_start_seconds: null, chapter_end_seconds: null,
    year: null, studio: '', genre: '', genre_secondary: '',
    quality: '', language: '', subtitled: false, duration_raw: '', duration_seconds: 0,
    views: 0, thumbnail: '', video_url: '', embed_url: '',
    ...overrides,
  }
}

describe('rowKey', () => {
  it('is the bare video_id for a row with no chapter boundary', () => {
    expect(rowKey(row({ video_id: '42', chapter_start_seconds: null }))).toBe('42')
  })

  it('composes video_id and episode_number for a chaptered row', () => {
    expect(rowKey(row({ video_id: '42', chapter_start_seconds: 0, episode_number: 3 }))).toBe('42:3')
  })

  it('differs between two chapters of the same video', () => {
    const a = row({ video_id: '42', chapter_start_seconds: 0, episode_number: 1 })
    const b = row({ video_id: '42', chapter_start_seconds: 1435, episode_number: 2 })
    expect(rowKey(a)).not.toBe(rowKey(b))
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- rowKey`
Expected: FAIL — `Failed to resolve import "./rowKey"`.

- [ ] **Step 3: Implement `rowKey`**

Create `src/catalog/rowKey.ts`:

```ts
import type { CatalogRow } from '../types'

/**
 * Unique identifier for a row, and the key its watch progress is stored
 * under. `video_id` alone identifies a row everywhere except a chaptered
 * episode, where multiple chapters share one `video_id` and only
 * `episode_number` distinguishes them.
 */
export function rowKey(row: CatalogRow): string {
  return row.chapter_start_seconds != null ? `${row.video_id}:${row.episode_number}` : row.video_id
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- rowKey`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/rowKey.ts src/catalog/rowKey.test.ts
git commit -m "feat: add rowKey, a unique identifier for chapter-sharing rows"
```

---

## Task 5: `titleProgress` uses `rowKey`

**Files:**
- Modify: `src/progress/titleProgress.ts`
- Modify: `src/progress/titleProgress.test.ts`

**Interfaces:**
- Consumes: `rowKey` from `../catalog/rowKey` (Task 4).

- [ ] **Step 1: Write the failing test**

Add to `src/progress/titleProgress.test.ts`:

```ts
import { rowKey } from '../catalog/rowKey'

function chapterRow(video_id: string, episode_number: number): CatalogRow {
  return { ...row(video_id, episode_number), chapter_start_seconds: 0 }
}

describe('titleProgress with chaptered episodes', () => {
  it('tracks two chapters of the same video_id independently', () => {
    const chaptered = title('chaptered', [chapterRow('9', 1), chapterRow('9', 2)])
    const key1 = rowKey(chaptered.seasons[0])
    const key2 = rowKey(chaptered.seasons[1])
    const result = titleProgress(chaptered, { [key1]: p(1435, 1, true), [key2]: p(300, 2) })
    expect(result).toMatchObject({ mode: 'resume', row: { episode_number: 2 } })
    expect(result.progress?.time).toBe(300)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- titleProgress`
Expected: FAIL — with two chapters sharing `video_id: '9'`, the current `entries[title.seasons[i].video_id]` lookup reads the same `entries['9']` for both, so the test's distinct-key expectations aren't met (the resume target/time come back wrong).

- [ ] **Step 3: Implement**

In `src/progress/titleProgress.ts`, add the import and replace all four `.video_id` lookups with `rowKey(...)`:

```ts
import { rowKey } from '../catalog/rowKey'
```

```ts
export function titleProgress(title: Title, entries: Record<string, Progress>): TitleProgress {
  let latestIndex = -1
  for (let i = 0; i < title.seasons.length; i++) {
    const entry = entries[rowKey(title.seasons[i])]
    const latest = latestIndex === -1 ? undefined : entries[rowKey(title.seasons[latestIndex])]
    if (entry && (!latest || entry.updatedAt > latest.updatedAt)) latestIndex = i
  }

  const first = title.seasons[0]
  if (latestIndex === -1) return { row: first, mode: 'start', progress: null, updatedAt: 0 }

  const latestRow = title.seasons[latestIndex]
  const latest = entries[rowKey(latestRow)]
  const { updatedAt } = latest

  if (!latest.watched) return { row: latestRow, mode: 'resume', progress: latest, updatedAt }

  const next = title.seasons[latestIndex + 1]
  if (!next) return { row: first, mode: 'start', progress: entries[rowKey(first)] ?? null, updatedAt }

  const nextProgress = entries[rowKey(next)] ?? null
  if (nextProgress && !nextProgress.watched) {
    return { row: next, mode: 'resume', progress: nextProgress, updatedAt }
  }
  return { row: next, mode: 'next', progress: null, updatedAt }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- titleProgress`
Expected: PASS — including all pre-existing cases, since `rowKey` returns bare `video_id` for every non-chaptered row used there.

- [ ] **Step 5: Commit**

```bash
git add src/progress/titleProgress.ts src/progress/titleProgress.test.ts
git commit -m "fix: key titleProgress lookups by rowKey, not bare video_id"
```

---

## Task 6: `nextEpisode` uses `rowKey`

**Files:**
- Modify: `src/screens/nextEpisode.ts`
- Modify: `src/screens/nextEpisode.test.ts`

**Interfaces:**
- Consumes: `rowKey` (Task 4).

- [ ] **Step 1: Write the failing test**

Add to `src/screens/nextEpisode.test.ts`:

```ts
describe('findNextEpisode with chaptered episodes', () => {
  it('finds the current chapter by rowKey, not by video_id alone', () => {
    const rows = [
      row({ video_id: '9', season_number: 1, episode_number: 1, chapter_start_seconds: 0 }),
      row({ video_id: '9', season_number: 1, episode_number: 2, chapter_start_seconds: 1435 }),
    ]
    expect(findNextEpisode(rows, rows[0])?.episode_number).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- nextEpisode`
Expected: FAIL — `sortedEpisodeIndex` finds the *first* row matching `video_id === '9'` (index 0) regardless of which chapter was passed in as `current`, so asking for the row after `rows[0]` (itself) still resolves its own index to 0 and correctly returns index 1 in this specific case — construct the assertion instead around chapter 2 to expose the real bug:

```ts
  it('does not treat every chapter of one video as the same row', () => {
    const rows = [
      row({ video_id: '9', season_number: 1, episode_number: 1, chapter_start_seconds: 0 }),
      row({ video_id: '9', season_number: 1, episode_number: 2, chapter_start_seconds: 1435 }),
      row({ video_id: '9', season_number: 1, episode_number: 3, chapter_start_seconds: 2810 }),
    ]
    expect(findNextEpisode(rows, rows[1])?.episode_number).toBe(3)
    expect(findPreviousEpisode(rows, rows[1])?.episode_number).toBe(1)
  })
```

Expected: FAIL — `r.video_id === current.video_id` matches the *first* row with `video_id: '9'` (episode 1) regardless of which chapter `current` actually is, so `findNextEpisode(rows, rows[1])` incorrectly resolves `current`'s index as 0 and returns episode 2 (itself) instead of episode 3.

- [ ] **Step 3: Implement**

In `src/screens/nextEpisode.ts`:

```ts
import type { CatalogRow } from '../types'
import { rowKey } from '../catalog/rowKey'

function sortedEpisodeIndex(rows: CatalogRow[], current: CatalogRow): { episodes: CatalogRow[]; index: number } | null {
  if (current.type !== 'episode') return null

  const episodes = rows
    .filter((r) => r.type === 'episode')
    .sort((a, b) => (a.season_number ?? 0) - (b.season_number ?? 0) || (a.episode_number ?? 0) - (b.episode_number ?? 0))

  const index = episodes.findIndex((r) => rowKey(r) === rowKey(current))
  if (index === -1) return null

  return { episodes, index }
}
```

(`findNextEpisode`/`findPreviousEpisode` below it are unchanged.)

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- nextEpisode`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/nextEpisode.ts src/screens/nextEpisode.test.ts
git commit -m "fix: locate the current episode by rowKey in nextEpisode"
```

---

## Task 7: Route matching and navigation use `rowKey`

**Files:**
- Modify: `src/router/resolveRoute.ts`
- Modify: `src/router/resolveRoute.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `rowKey` (Task 4).
- Note: `Route.videoId` (in `src/router/route.ts`) keeps its existing name and type (`string`) — only the *value* callers put into it changes, from `row.video_id` to `rowKey(row)`. `route.ts`/`routeToPath`/`parseRoute` need no changes: a chapter's rowKey (e.g. `"9:3"`) is still one URL path segment once `encodeURIComponent`'d, same as any other string id.

- [ ] **Step 1: Write the failing test**

Add to `src/router/resolveRoute.test.ts`:

```ts
describe('resolveRoute with chaptered episodes', () => {
  it('resolves a play route to the specific chapter, not just any row sharing its video_id', () => {
    const ep1 = row({ video_id: '9', episode_number: 1, chapter_start_seconds: 0 })
    const ep2 = row({ video_id: '9', episode_number: 2, chapter_start_seconds: 1435 })
    const t = title({ key: 'abc', seasons: [ep1, ep2] })
    expect(resolveRoute({ name: 'play', key: 'abc', videoId: '9:2' }, [t])).toEqual({
      name: 'player',
      title: t,
      row: ep2,
    })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- resolveRoute`
Expected: FAIL — `title.seasons.find((r) => r.video_id === route.videoId)` compares against `route.videoId` (`'9:2'`) using bare `video_id` (`'9'`), so it never matches and the route resolves to `not-found`.

- [ ] **Step 3: Implement**

In `src/router/resolveRoute.ts`:

```ts
import type { Route } from './route'
import type { CatalogRow, Title } from '../types'
import { rowKey } from '../catalog/rowKey'

export type ResolvedView =
  | { name: 'home' }
  | { name: 'detail'; title: Title }
  | { name: 'player'; title: Title; row: CatalogRow }
  | { name: 'not-found' }

export function resolveRoute(route: Route, titles: Title[]): ResolvedView {
  if (route.name === 'home') return { name: 'home' }

  const title = titles.find((t) => t.key === route.key)
  if (!title) return { name: 'not-found' }

  if (route.name === 'title') return { name: 'detail', title }

  const row = title.seasons.find((r) => rowKey(r) === route.videoId)
  if (!row) return { name: 'not-found' }

  return { name: 'player', title, row }
}
```

In `src/App.tsx`, add the import and replace the three places a route is built from a row's `video_id`:

```ts
import { rowKey } from './catalog/rowKey'
```

```ts
          onResume={(title, row) => navigate({ name: 'play', key: title.key, videoId: rowKey(row) })}
```

```ts
  const goToEpisode = (episodeRow: CatalogRow) =>
    navigate({ name: 'play', key: title.key, videoId: rowKey(episodeRow) })
```

```ts
          onPlay={(row) => navigate({ name: 'play', key: title.key, videoId: rowKey(row) })}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- resolveRoute && npm test -- App`
Expected: PASS — including the pre-existing `App.test.tsx` cases, since `rowKey` returns bare `video_id` for every row used there.

- [ ] **Step 5: Commit**

```bash
git add src/router/resolveRoute.ts src/router/resolveRoute.test.ts src/App.tsx
git commit -m "fix: match and build play routes by rowKey, not bare video_id"
```

---

## Task 8: `Detail.tsx` uses `rowKey`

**Files:**
- Modify: `src/screens/Detail.tsx`
- Modify: `src/screens/Detail.test.tsx`

**Interfaces:**
- Consumes: `rowKey` (Task 4).

- [ ] **Step 1: Write the failing test**

Add to `src/screens/Detail.test.tsx`:

```ts
describe('Detail with chaptered episodes', () => {
  it('tracks progress and active state per chapter, not per shared video_id', () => {
    const ep1 = row({ video_id: '9', season_number: 1, episode_number: 1, chapter_start_seconds: 0 })
    const ep2 = row({ video_id: '9', season_number: 1, episode_number: 2, chapter_start_seconds: 1435 })
    const title = makeTitle([ep1, ep2])

    localStorage.setItem('go10:progress:9:1', JSON.stringify({ time: 1435, duration: 1435, updatedAt: 1, watched: true }))
    localStorage.setItem('go10:progress:9:2', JSON.stringify({ time: 300, duration: 1370, updatedAt: 2, watched: false }))

    render(
      <FocusProvider onBack={() => {}}>
        <Detail title={title} onPlay={() => {}} onBack={() => {}} />
      </FocusProvider>,
    )

    expect(screen.getByText('Episodio 1').closest('[data-focused]')?.textContent).toContain('Visto')
    expect(screen.getByText('Episodio 2').closest('[data-focused]')?.textContent).not.toContain('Visto')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- Detail`
Expected: FAIL — `progress[episode.video_id]` reads `progress['9']` for both rows (there's no such key; both read `undefined`), so neither shows "Visto" and the two chapters can't be told apart.

- [ ] **Step 3: Implement**

In `src/screens/Detail.tsx`, add the import:

```ts
import { rowKey } from '../catalog/rowKey'
```

Replace the five direct `.video_id` progress/identity lookups:

```ts
  const activeProgress = progress[rowKey(activeRow)] ?? null
```

```ts
  useEffect(() => {
    if (!playingRow || rowKey(playingRow) === rowKey(activeRow)) return
    setActiveRow(playingRow)
    setSelectedSeasonNumber(playingRow.season_number ?? selectedSeasonNumber)
  }, [playingRow, activeRow, selectedSeasonNumber])
```

(Note the effect's dependency array changes from `activeRow.video_id` to `activeRow` — `rowKey` needs the whole row, not just its `video_id`.)

```tsx
                <span className="go-season_d">
                  {group.rows.length > 1
                    ? `${group.rows.length} episodios`
                    : tileDetail(group.rows[0], progress[rowKey(group.rows[0])])}
                </span>
                {group.rows.length === 1 && (
                  <ProgressBar fraction={playedFraction(progress[rowKey(group.rows[0])])} />
                )}
```

```tsx
                {selectedGroup.rows.map((episode, index) => (
                  <FocusButton
                    key={rowKey(episode)}
                    id={`detail:episode:${rowKey(episode)}`}
                    row={2}
                    col={index}
                    onEnter={() => {
                      setActiveRow(episode)
                      onPlay(episode)
                    }}
                    className={`go-season${
                      rowKey(episode) === rowKey(activeRow) ? ' is-active' : ''
                    }`}
                  >
                    <span className="go-season_n">Episodio {episode.episode_number}</span>
                    <span className="go-season_d">{tileDetail(episode, progress[rowKey(episode)])}</span>
                    <ProgressBar fraction={playedFraction(progress[rowKey(episode)])} />
                  </FocusButton>
                ))}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- Detail`
Expected: PASS — including the pre-existing "syncs the active season/episode" test, since `rowKey` returns bare `video_id` for its non-chaptered fixture rows.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Detail.tsx src/screens/Detail.test.tsx
git commit -m "fix: key Detail progress lookups and row identity by rowKey"
```

---

## Task 9: `Player.tsx` — in-file chapter-end detection and chapter-aware resume

**Files:**
- Modify: `src/screens/Player.tsx`
- Modify: `src/screens/Player.test.tsx`

**Interfaces:**
- Consumes: `rowKey` (Task 4), `CatalogRow.chapter_end_seconds`/`chapter_start_seconds`/`duration_seconds` (Task 3).

- [ ] **Step 1: Write the failing tests**

Add to `src/screens/Player.test.tsx`:

```ts
  function chapterRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
    return row({
      video_id: '9', type: 'episode', episode_number: 1,
      chapter_start_seconds: 1435, chapter_end_seconds: 2810, duration_seconds: 1375,
      embed_url: 'https://ok.ru/videoembed/9',
      ...overrides,
    })
  }

  it('treats a timeupdate crossing chapter_end_seconds as the episode ending', () => {
    const onEnded = vi.fn()
    render(<Player row={chapterRow()} onClose={() => {}} onEnded={onEnded} />)
    const frame = getFrame()
    fireEvent.load(frame)

    postFromEmbed(frame, { event: 'timeupdate', time: 2000, duration: 14909 })
    expect(onEnded).not.toHaveBeenCalled()

    postFromEmbed(frame, { event: 'timeupdate', time: 2810, duration: 14909 })
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(stored('9:1').watched).toBe(true)
    expect(stored('9:1').duration).toBe(1375) // the chapter's own duration, not the file's
  })

  it('does not end early on a timeupdate before chapter_end_seconds', () => {
    const onEnded = vi.fn()
    render(<Player row={chapterRow()} onClose={() => {}} onEnded={onEnded} />)
    postFromEmbed(getFrame(), { event: 'timeupdate', time: 1500, duration: 14909 })
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('opens a fresh chapter at its own chapter_start_seconds', () => {
    render(<Player row={chapterRow()} onClose={() => {}} />)
    expect(getFrame().src).toBe('https://ok.ru/videoembed/9?autoplay=1&fromTime=1435')
  })

  it('resumes an in-progress chapter from its stored position, not chapter_start_seconds', () => {
    localStorage.setItem(
      'go10:progress:9:1',
      JSON.stringify({ time: 2000, duration: 1375, updatedAt: 0, watched: false }),
    )
    render(<Player row={chapterRow()} onClose={() => {}} />)
    expect(getFrame().src).toBe('https://ok.ru/videoembed/9?autoplay=1&fromTime=1997')
  })

  it('attributes progress to the composite chapter key, not the bare shared video_id', () => {
    render(<Player row={chapterRow()} onClose={() => {}} />)
    postFromEmbed(getFrame(), { event: 'timeupdate', time: 1500, duration: 14909 })
    expect(stored('9:1').time).toBe(1500)
    expect(stored('9')).toBeNull()
  })
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- Player`
Expected: FAIL — `onEnded` is never called on a chapter-boundary crossing (there's no such check yet), progress writes use the bare `video_id` (`'9'`, not `'9:1'`), and `fromTime` starts at 0/whatever `resumeFromTime` returns off the wrong storage key rather than `chapter_start_seconds`.

- [ ] **Step 3: Implement**

In `src/screens/Player.tsx`, add the import:

```ts
import { rowKey } from '../catalog/rowKey'
```

Change the `videoIdRef` initialization/update to use `rowKey`:

```ts
  const videoIdRef = useRef(rowKey(row))
  videoIdRef.current = rowKey(row)
```

Add two more refs alongside the existing `onEndedRef`/`onPrevRef`/`onNextRef` block:

```ts
  const chapterEndRef = useRef(row.chapter_end_seconds)
  chapterEndRef.current = row.chapter_end_seconds
  const chapterDurationRef = useRef(row.duration_seconds)
  chapterDurationRef.current = row.duration_seconds
```

In the `onMessage` handler, extend the `timeupdate` branch to also check the chapter boundary:

```ts
      if (data?.event === 'timeupdate' && typeof data.time === 'number') {
        positionRef.current = { videoId, time: data.time, duration: data.duration ?? 0 }
        if (Date.now() - lastSaveRef.current >= PROGRESS_SAVE_INTERVAL_MS) flushProgress()

        const chapterEnd = chapterEndRef.current
        if (chapterEnd != null && data.time >= chapterEnd) {
          markWatched(videoId, chapterDurationRef.current)
          positionRef.current = null
          onEndedRef.current?.()
        }
      } else if (data?.event === 'paused') {
```

Update the `fromTime` memo to key progress by `rowKey` and fall back to the chapter's own start:

```ts
  const fromTime = useMemo(() => {
    flushProgress() // a reload should resume from the very latest position
    const resumeAt = resumeFromTime(readProgress(rowKey(row)))
    if (resumeAt !== null) return resumeAt
    // A chapter's own beginning isn't the file's beginning. row.video_id is
    // still the only thing gating recomputation (see the comment above) --
    // this only takes effect the render a genuinely new video starts loading.
    return row.chapter_start_seconds && row.chapter_start_seconds > 0 ? row.chapter_start_seconds : null
  }, [row.video_id, state.reloadToken, flushProgress])
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- Player`
Expected: PASS — including every pre-existing Player test, since `rowKey` returns bare `video_id` and `chapter_end_seconds` is `null` for all of their fixture rows.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Player.tsx src/screens/Player.test.tsx
git commit -m "feat: detect in-file chapter end and resume chapters from their own start"
```

---

## Task 10: `Player.tsx` — seek instead of reload between chapters of one video

**Files:**
- Modify: `src/screens/Player.tsx`
- Modify: `src/screens/Player.test.tsx`

**Interfaces:**
- Consumes: `rowKey` (Task 4), the refs/handler from Task 9.

- [ ] **Step 1: Write the failing tests**

Add to `src/screens/Player.test.tsx`:

```ts
  it('seeks instead of reloading when moving to a chapter of the same video', () => {
    const { rerender } = render(<Player row={chapterRow({ episode_number: 1 })} onClose={() => {}} />)
    const frame = getFrame()
    fireEvent.load(frame)
    const postSpy = vi.spyOn(frame.contentWindow as Window, 'postMessage')
    const srcBefore = frame.src

    rerender(
      <Player
        row={chapterRow({ episode_number: 2, chapter_start_seconds: 2810, chapter_end_seconds: 4200 })}
        onClose={() => {}}
      />,
    )

    expect(getFrame()).toBe(frame) // no remount
    expect(getFrame().src).toBe(srcBefore) // no navigation via src
    expect(postSpy).toHaveBeenCalledWith({ action: 'seek', time: 2810 }, 'https://ok.ru')
  })

  it('still reloads the iframe when moving to a genuinely different video', () => {
    const { rerender } = render(<Player row={chapterRow({ episode_number: 1 })} onClose={() => {}} />)
    const firstFrame = getFrame()
    fireEvent.load(firstFrame)

    rerender(
      <Player
        row={row({ video_id: '10', embed_url: 'https://ok.ru/videoembed/10' })}
        onClose={() => {}}
      />,
    )

    expect(getFrame().src).toBe('https://ok.ru/videoembed/10?autoplay=1')
  })

  it('does not re-seek on an unrelated re-render of the same chapter', () => {
    const { rerender } = render(<Player row={chapterRow({ episode_number: 1 })} onClose={() => {}} />)
    const frame = getFrame()
    fireEvent.load(frame)
    const postSpy = vi.spyOn(frame.contentWindow as Window, 'postMessage')

    rerender(<Player row={chapterRow({ episode_number: 1 })} onClose={() => {}} />) // same chapter, new object
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('flushes the outgoing chapter\'s progress before seeking to the next one', () => {
    const { rerender } = render(<Player row={chapterRow({ episode_number: 1 })} onClose={() => {}} />)
    postFromEmbed(getFrame(), { event: 'timeupdate', time: 2000, duration: 14909 })

    rerender(
      <Player
        row={chapterRow({ episode_number: 2, chapter_start_seconds: 2810, chapter_end_seconds: 4200 })}
        onClose={() => {}}
      />,
    )

    expect(stored('9:1').time).toBe(2000)
  })
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- Player`
Expected: FAIL — today, a row change that keeps `video_id` the same doesn't trigger the reset effect (correct — no reload) but nothing else happens either: no `seek` postMessage is sent, so the iframe silently keeps playing the previous chapter instead of jumping to the new one's start, and no progress flush happens for the chapter being left.

- [ ] **Step 3: Implement**

In `src/screens/Player.tsx`, add a ref to track the previously-rendered row, and a new effect right after the existing reset-on-`video_id`-change effect:

```ts
  const prevRowRef = useRef(row)

  useEffect(() => {
    const prev = prevRowRef.current
    prevRowRef.current = row
    if (prev.video_id !== row.video_id) return // a different file — the effect above handles reloading it
    if (rowKey(prev) === rowKey(row)) return // same chapter — nothing to do

    flushProgress() // save the outgoing chapter's position under its own key first
    videoIdRef.current = rowKey(row)
    positionRef.current = null
    frameRef.current?.contentWindow?.postMessage(
      { action: 'seek', time: row.chapter_start_seconds ?? 0 },
      OK_RU_ORIGIN,
    )
  }, [row, flushProgress])
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- Player`
Expected: PASS — including every pre-existing test (no two non-chapter test rows ever share a `video_id`, so `prev.video_id !== row.video_id` is always true for them and this effect is a no-op).

- [ ] **Step 5: Run the full test suite**

Run: `npm test && python3 -m pytest tests/ -v`
Expected: PASS — every JS and Python test green.

- [ ] **Step 6: Commit**

```bash
git add src/screens/Player.tsx src/screens/Player.test.tsx
git commit -m "feat: seek instead of reloading between chapters of the same video"
```

---

## After this plan

The capability is complete and fully tested, but no real title has been split yet — chaptering one is a separate, manual, per-title step the user runs themselves:

1. `python3 scripts/detect_chapters.py <video_id> --episodes <N>` (downloads the real video — slow, and not something to run unattended as part of this plan).
2. Review the draft `data/chapters/<series_id>.json` against the downloaded file in mpv/VLC, adjusting any timestamp that's off.
3. `python3 scripts/parse_catalog.py` to rebuild `catalog.csv` with the new episode rows.
4. Verify manually in the running app: the season now lists individual episodes, playback starts at the right chapter, autoplay crosses chapter boundaries without a reload flash, and "Seguir viendo"/resume tracks each chapter independently.
