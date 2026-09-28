"""Match catalog titles to TMDB backdrops for the Home hero carousel.

Writes apps/web/public/data/hero_art.json (title key -> TMDB backdrop). Run by
hand when the catalog changes, with TMDB_TOKEN set to a TMDB v4 read access
token; the output is committed. Hand fixes go in data/hero_art_overrides.json:
{"pin": {"<key>": "tv/123"}, "block": ["<key>"]}.
"""
import argparse
import csv
import json
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

from parse_catalog import ROOT

CATALOG_CSV = os.path.join(ROOT, "apps", "web", "public", "data", "catalog.csv")
OUTPUT_JSON = os.path.join(ROOT, "apps", "web", "public", "data", "hero_art.json")
OVERRIDES_JSON = os.path.join(ROOT, "data", "hero_art_overrides.json")
API = "https://api.themoviedb.org/3"


def normalise(text):
    decomposed = unicodedata.normalize("NFKD", text or "")
    kept = "".join(c for c in decomposed if not unicodedata.combining(c))
    cleaned = "".join(c if c.isalnum() else " " for c in kept.lower())
    return " ".join(cleaned.split())


def load_titles(csv_path):
    """One entry per title, keyed like buildTitles (series_id or video_id), in catalog order."""
    seen = {}
    with open(csv_path, encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            key = row.get("series_id") or row["video_id"]
            if key in seen:
                continue
            is_show = bool(row.get("series_id"))
            year = row.get("year") or ""
            seen[key] = {
                "key": key,
                "name": row["series_title"] if is_show else row["title"],
                "year": int(year) if year.isdigit() else None,
                "kind": "show" if is_show else "movie",
            }
    return list(seen.values())


def _year(result):
    date = result.get("release_date") or result.get("first_air_date") or ""
    return int(date[:4]) if date[:4].isdigit() else None


def best_match(entry, results):
    wanted = normalise(entry["name"])
    matches = [
        r for r in results
        if r.get("backdrop_path")
        and wanted in {normalise(r.get(f, "")) for f in ("title", "original_title", "name", "original_name")}
    ]
    if not matches:
        return None
    if entry["year"] is None:
        return matches[0]
    # sorted() is stable: equal distances keep TMDB's order.
    return sorted(matches, key=lambda r: abs((_year(r) or 9999) - entry["year"]))[0]


def build_index(titles, get, overrides):
    pins = overrides.get("pin", {})
    blocks = set(overrides.get("block", []))
    known = {t["key"] for t in titles}
    items = {}
    report = {"matched": 0, "pinned": 0, "blocked": 0, "unmatched": [],
              "unknown_overrides": sorted((set(pins) | blocks) - known)}
    for entry in titles:
        key = entry["key"]
        if key in blocks:
            report["blocked"] += 1
            continue
        try:
            if key in pins:
                detail = get(f"/{pins[key]}", {})
                if detail.get("backdrop_path"):
                    items[key] = {"tmdb": pins[key], "backdrop": detail["backdrop_path"]}
                    report["pinned"] += 1
                    continue
            else:
                media = "movie" if entry["kind"] == "movie" else "tv"
                found = get(f"/search/{media}", {"query": entry["name"], "language": "es-MX", "include_adult": "false"})
                match = best_match(entry, found.get("results", []))
                if match:
                    items[key] = {"tmdb": f"{media}/{match['id']}", "backdrop": match["backdrop_path"]}
                    report["matched"] += 1
                    continue
        except (OSError, ValueError):
            pass  # network or JSON trouble on one title: report it, keep going
        report["unmatched"].append((key, entry["name"]))
    return items, report


def write_index(path, items):
    data = {"schema_version": 1, "items": {k: items[k] for k in sorted(items)}}
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def tmdb_getter(token):
    def get(path, params):
        url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
        for attempt in (1, 2):
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if error.code == 429 and attempt == 1:
                    time.sleep(float(error.headers.get("Retry-After", "2")))
                    continue
                raise
    return get


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--catalog", default=CATALOG_CSV)
    parser.add_argument("--output", default=OUTPUT_JSON)
    parser.add_argument("--overrides", default=OVERRIDES_JSON)
    args = parser.parse_args(argv)

    token = os.environ.get("TMDB_TOKEN")
    if not token:
        print("TMDB_TOKEN is not set (TMDB v4 read access token).", file=sys.stderr)
        return 1
    overrides = {"pin": {}, "block": []}
    if os.path.exists(args.overrides):
        with open(args.overrides, encoding="utf-8") as handle:
            overrides = json.load(handle)

    items, report = build_index(load_titles(args.catalog), tmdb_getter(token), overrides)
    write_index(args.output, items)

    print(f"matched {report['matched']} · pinned {report['pinned']} · blocked {report['blocked']} · unmatched {len(report['unmatched'])}")
    for key, name in report["unmatched"]:
        print(f"  unmatched  {key}  {name}")
    for key in report["unknown_overrides"]:
        print(f"  warning: override for unknown key {key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
