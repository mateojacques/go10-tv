"""Match catalog titles to TMDB backdrops for the Home hero carousel.

Writes apps/web/public/data/hero_art.json (title key -> TMDB backdrop). Run by
hand when the catalog changes; the output is committed. Runs are incremental:
titles already in hero_art.json, or searched without a match (listed in
data/hero_art_misses.json, also committed), are not searched again, so a run
after an ingest only asks TMDB about the new titles. A request error is not a
miss: that title is retried next run. --all re-searches everything. The TMDB v4 read access
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
MISSES_JSON = os.path.join(ROOT, "data", "hero_art_misses.json")
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


def build_index(titles, get, overrides, done=None, misses=(), log=None):
    """Match the titles not settled by an earlier run; returns (items, misses, report).

    `done` is the previous run's items and `misses` the keys it searched without a
    match; both are carried over (dropping keys no longer in the catalog or now
    blocked) and only the rest is searched. A pin that differs from the stored
    match is searched again. `log`, if given, gets a line announcing the search,
    then one progress line per searched title as it finishes.
    """
    pins = overrides.get("pin", {})
    blocks = set(overrides.get("block", []))
    known = {t["key"] for t in titles}
    done = done or {}
    missed = set(misses)
    items = {}
    new_misses = set()
    todo = []
    for entry in titles:
        key = entry["key"]
        if key in blocks:
            continue
        previous = done.get(key)
        if key in pins:
            settled = previous is not None and previous.get("tmdb") == pins[key]
        else:
            settled = previous is not None or key in missed
        if not settled:
            todo.append(entry)
        elif previous is not None:
            items[key] = previous
        else:
            new_misses.add(key)
    report = {"matched": 0, "pinned": 0, "blocked": len(blocks & known), "unmatched": [], "failed": 0,
              "kept": len(titles) - len(blocks & known) - len(todo), "searched": len(todo),
              "unknown_overrides": sorted((set(pins) | blocks) - known)}
    if log and todo:
        log(f"Matching {len(todo)} titles against TMDB (one request each; {report['kept']} settled by earlier runs)…")
    for number, entry in enumerate(todo, 1):
        key = entry["key"]
        failed = report["failed"]
        outcome = _match_one(entry, get, pins, items, report)
        if key not in items and report["failed"] == failed:
            new_misses.add(key)  # searched fine, nothing matched: don't ask again
        if log:
            log(f"[{number}/{len(todo)}] {key}  {entry['name']}  →  {outcome}")
    return items, new_misses, report


def _match_one(entry, get, pins, items, report):
    """Match one title into `items`/`report`; returns what happened, for the progress log."""
    key = entry["key"]
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


def read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_misses(path, misses):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(sorted(misses), handle, ensure_ascii=False, indent=2)
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
    parser.add_argument("--misses", default=MISSES_JSON)
    parser.add_argument("--env-file", default=ENV_LOCAL)
    parser.add_argument("--all", action="store_true", help="re-search every title, ignoring earlier runs")
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
    overrides = read_json(args.overrides, {"pin": {}, "block": []})
    done, misses = {}, []
    if not args.all:
        done = read_json(args.output, {}).get("items", {})
        misses = read_json(args.misses, [])

    titles = load_titles(args.catalog)

    def progress(line):
        print(line, file=sys.stderr, flush=True)

    try:
        items, new_misses, report = build_index(titles, tmdb_getter(token), overrides, done, misses, log=progress)
    except urllib.error.HTTPError as error:
        print(f"TMDB rejected the token (HTTP {error.code}); {args.output} left as it was.", file=sys.stderr)
        return 1
    if report["searched"] > 0 and report["failed"] == report["searched"]:
        print(f"Every TMDB request failed (offline?); {args.output} left as it was.", file=sys.stderr)
        return 1
    write_index(args.output, items)
    write_misses(args.misses, new_misses)

    print(f"searched {report['searched']} of {len(titles)} titles ({report['kept']} settled earlier) · "
          f"matched {report['matched']} · pinned {report['pinned']} · blocked {report['blocked']} · "
          f"unmatched {len(report['unmatched'])} (request errors {report['failed']})")
    for key, name in report["unmatched"]:
        print(f"  unmatched  {key}  {name}")
    for key in report["unknown_overrides"]:
        print(f"  warning: override for unknown key {key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
