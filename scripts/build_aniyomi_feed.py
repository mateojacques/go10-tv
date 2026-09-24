"""Build the Aniyomi extension feed (public/data/aniyomi/) from public/data/catalog.csv.

The feed is the extension's stable contract with the site: titles are grouped
exactly like `buildTitles` in src/catalog/loadCatalog.ts, and chapter-split
season packs are collapsed back into one episode per ok.ru video. Run it after
parse_catalog.py.
"""
import csv
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CATALOG_CSV = os.path.join(ROOT, "public", "data", "catalog.csv")
OUTPUT_DIR = os.path.join(ROOT, "public", "data", "aniyomi")
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
        "views": sum(_int(r["views"]) or 0 for r in group),
        "recent_rank": min(int(r["catalog_index"]) for r in group),
    }
    if not is_series:
        item["video_id"] = primary["video_id"]
        item["duration_seconds"] = _int(primary["duration_seconds"])
    return item
