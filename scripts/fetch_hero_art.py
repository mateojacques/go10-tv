"""Match catalog titles to TMDB backdrops for the Home hero carousel.

Writes apps/web/public/data/hero_art.json (title key -> TMDB backdrop). Run by
hand when the catalog changes; the output is committed. The TMDB v4 read access
token comes from TMDB_TOKEN, else from VITE_TMDB_TOKEN in .env.local (the web
app's). Hand fixes go in data/hero_art_overrides.json:
{"pin": {"<key>": "tv/123"}, "block": ["<key>"]}.
"""
import argparse
import csv
import http.client
import json
import os
import re
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
ENV_LOCAL = os.path.join(ROOT, ".env.local")
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


def build_index(titles, get, overrides, log=None):
    """Match every title; `log`, if given, gets one progress line per title as it finishes."""
    pins = overrides.get("pin", {})
    blocks = set(overrides.get("block", []))
    known = {t["key"] for t in titles}
    items = {}
    report = {"matched": 0, "pinned": 0, "blocked": 0, "unmatched": [], "failed": 0,
              "unknown_overrides": sorted((set(pins) | blocks) - known)}
    for number, entry in enumerate(titles, 1):
        key = entry["key"]
        outcome = _match_one(entry, get, pins, blocks, items, report)
        if log:
            log(f"[{number}/{len(titles)}] {key}  {entry['name']}  →  {outcome}")
    return items, report


def _match_one(entry, get, pins, blocks, items, report):
    """Match one title into `items`/`report`; returns what happened, for the progress log."""
    key = entry["key"]
    if key in blocks:
        report["blocked"] += 1
        return "blocked"
    try:
        if key in pins:
            detail = get(f"/{pins[key]}", {})
            if detail.get("backdrop_path"):
                items[key] = {"tmdb": pins[key], "backdrop": detail["backdrop_path"]}
                report["pinned"] += 1
                return f"{pins[key]} (pinned)"
        else:
            media = "movie" if entry["kind"] == "movie" else "tv"
            found = get(f"/search/{media}", {"query": entry["name"], "language": "es-MX", "include_adult": "false"})
            match = best_match(entry, found.get("results", []))
            if match:
                items[key] = {"tmdb": f"{media}/{match['id']}", "backdrop": match["backdrop_path"]}
                report["matched"] += 1
                return f"{media}/{match['id']}"
        outcome = "unmatched"
    except urllib.error.HTTPError as error:
        if error.code == 401:
            raise  # a rejected token fails every title: stop instead of reporting them all unmatched
        report["failed"] += 1
        outcome = f"error: HTTP {error.code}"
    except (OSError, ValueError, http.client.HTTPException) as error:
        report["failed"] += 1  # network or JSON trouble on one title: report it, keep going
        outcome = f"error: {error}"
    report["unmatched"].append((key, entry["name"]))
    return outcome


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


def env_file_token(path):
    """VITE_TMDB_TOKEN from a dotenv file, or None."""
    try:
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                name, sep, value = line.strip().partition("=")
                if sep and name.strip() == "VITE_TMDB_TOKEN":
                    return value.strip().strip("'\"") or None
    except OSError:
        pass
    return None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--catalog", default=CATALOG_CSV)
    parser.add_argument("--output", default=OUTPUT_JSON)
    parser.add_argument("--overrides", default=OVERRIDES_JSON)
    parser.add_argument("--env-file", default=ENV_LOCAL)
    args = parser.parse_args(argv)

    token = os.environ.get("TMDB_TOKEN") or env_file_token(args.env_file)
    if not token:
        print(f"TMDB_TOKEN is not set, and {args.env_file} has no VITE_TMDB_TOKEN (TMDB v4 read access token).", file=sys.stderr)
        return 1
    # A v4 token is a JWT: base64url segments joined by dots. Anything else (a pasted "…",
    # a stray space) can't go in an HTTP header and would fail every request.
    if not re.fullmatch(r"[A-Za-z0-9._-]+", token):
        print("The TMDB token contains invalid characters (expected a v4 read access token).", file=sys.stderr)
        return 1
    overrides = {"pin": {}, "block": []}
    if os.path.exists(args.overrides):
        with open(args.overrides, encoding="utf-8") as handle:
            overrides = json.load(handle)

    titles = load_titles(args.catalog)
    print(f"Matching {len(titles)} titles against TMDB (one request each; a few minutes)…", file=sys.stderr, flush=True)

    def progress(line):
        print(line, file=sys.stderr, flush=True)

    try:
        items, report = build_index(titles, tmdb_getter(token), overrides, log=progress)
    except urllib.error.HTTPError as error:
        print(f"TMDB rejected the token (HTTP {error.code}); {args.output} left as it was.", file=sys.stderr)
        return 1
    searched = len(titles) - report["blocked"]
    if searched > 0 and report["failed"] == searched:
        print(f"Every TMDB request failed (offline?); {args.output} left as it was.", file=sys.stderr)
        return 1
    write_index(args.output, items)

    print(f"matched {report['matched']} · pinned {report['pinned']} · blocked {report['blocked']} · unmatched {len(report['unmatched'])} (request errors {report['failed']})")
    for key, name in report["unmatched"]:
        print(f"  unmatched  {key}  {name}")
    for key in report["unknown_overrides"]:
        print(f"  warning: override for unknown key {key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
