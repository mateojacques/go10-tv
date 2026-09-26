"""Build the Aniyomi extension feed (apps/web/public/data/aniyomi/) from apps/web/public/data/catalog.csv.

The feed is the extension's stable contract with the site: titles are grouped
exactly like `buildTitles` in src/catalog/loadCatalog.ts, and chapter-split
season packs are collapsed back into one episode per ok.ru video. Run it after
parse_catalog.py.
"""
import csv
import json
import os
import shutil
import sys
from datetime import datetime, timezone

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CATALOG_CSV = os.path.join(ROOT, "apps", "web", "public", "data", "catalog.csv")
OUTPUT_DIR = os.path.join(ROOT, "apps", "web", "public", "data", "aniyomi")
SCHEMA_VERSION = 1


def load_rows(path):
    with open(path, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _int(value):
    return int(value) if value not in ("", None) else None


def _sort_key(row):
    return (_int(row["season_number"]) or 0, _int(row["episode_number"]) or 0)


def group_rows(rows):
    """Group rows by `series_id or video_id`, each group sorted by
    (season_number, episode_number) with blanks as 0 -- the same rule the
    site uses, so the extension and the site agree on what a title is."""
    groups = {}
    for row in rows:
        groups.setdefault(row["series_id"] or row["video_id"], []).append(row)
    return {key: sorted(group, key=_sort_key) for key, group in groups.items()}


def build_item(key, group):
    primary = group[0]
    is_series = bool(primary["series_id"])
    item = {
        "id": ("s:" if is_series else "m:") + key,
        "kind": "series" if is_series else "movie",
        "title": (primary["series_title"] or primary["title"]) if is_series else primary["title"],
        "thumbnail": primary["thumbnail"],
        "year": _int(primary["year"]),
        "studio": primary["studio"] or None,
        "genres": [g for g in (primary["genre"], primary["genre_secondary"]) if g],
        "quality": primary["quality"] or None,
        "language": primary["language"] or None,
        "subtitled": primary["subtitled"] == "true",
        # Chapter rows repeat their video's views, so count each ok.ru video once.
        "views": sum(_int(r["views"]) or 0 for r in {r["video_id"]: r for r in group}.values()),
        "recent_rank": min(int(r["catalog_index"]) for r in group),
    }
    if not is_series:
        item["video_id"] = primary["video_id"]
        item["duration_seconds"] = _int(primary["duration_seconds"])
    return item


def _is_pack(rows):
    return any(r["chapter_start_seconds"] or r["type"] == "season" for r in rows)


def _full_duration(rows):
    """A pack's chapter rows each carry their own duration; the whole video
    runs to the furthest chapter end (start + duration), which also covers an
    open-ended last chapter."""
    chapter_ends = [
        (_int(r["chapter_start_seconds"]) or 0) + (_int(r["duration_seconds"]) or 0)
        for r in rows if r["chapter_start_seconds"]
    ]
    return max(chapter_ends) if chapter_ends else _int(rows[0]["duration_seconds"])


def _pack_title(first, season):
    if first["season_label"]:
        return first["season_label"]
    if season is not None:
        return f"Temporada {season}"
    return first["series_title"] or first["title"]


def build_episodes(group):
    """One episode per ok.ru video, in (season, number) order. Season packs --
    chapter-split or not -- stay whole: the site's per-chapter split is a
    display trick the extension doesn't reproduce in v1."""
    by_video = {}
    for row in group:
        by_video.setdefault(row["video_id"], []).append(row)

    episodes = []
    packs_per_season = {}
    for video_id, rows in by_video.items():
        first = rows[0]
        season = _int(first["season_number"])
        if _is_pack(rows):
            packs_per_season[season] = packs_per_season.get(season, 0) + 1
            number = packs_per_season[season]
            title = _pack_title(first, season)
            pack = True
        else:
            number = _int(first["episode_number"])
            title = first["title"]
            pack = False
        episodes.append({
            "video_id": video_id,
            "season": season,
            "number": number,
            "title": title,
            "pack": pack,
            "duration_seconds": _full_duration(rows),
            "thumbnail": first["thumbnail"],
            "quality": first["quality"] or None,
        })
    # Several packs in one season (re-uploads, part 1/2) often share a label;
    # suffix them so they aren't indistinguishable in Aniyomi.
    for episode in episodes:
        if episode["pack"] and packs_per_season[episode["season"]] > 1:
            episode["title"] = f"{episode['title']} (parte {episode['number']})"
    return sorted(episodes, key=lambda e: (e["season"] or 0, e["number"] or 0))


def build_feed(rows):
    items = []
    series_files = {}
    for key, group in group_rows(rows).items():
        item = build_item(key, group)
        if item["kind"] == "series":
            episodes = build_episodes(group)
            item["episode_count"] = len(episodes)
            series_files[key] = {"schema_version": SCHEMA_VERSION, "episodes": episodes}
        items.append(item)
    items.sort(key=lambda i: i["recent_rank"])
    return items, series_files


def _dump(path, data):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")


def write_feed(output_dir, items, series_files, generated_at):
    """Replace output_dir wholesale so a removed series can't linger as a
    stale file (Netlify would keep serving it)."""
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(os.path.join(output_dir, "series"))
    _dump(os.path.join(output_dir, "index.json"), {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "items": items,
    })
    for series_id, data in series_files.items():
        _dump(os.path.join(output_dir, "series", f"{series_id}.json"), data)


def main():
    items, series_files = build_feed(load_rows(CATALOG_CSV))
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    write_feed(OUTPUT_DIR, items, series_files, generated_at)
    movies = sum(1 for i in items if i["kind"] == "movie")
    print(f"wrote {OUTPUT_DIR}: {len(items)} titles ({len(series_files)} series, {movies} movies)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
