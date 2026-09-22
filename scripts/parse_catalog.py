"""Turn the scraped ok.ru catalog HTML into public/data/catalog.csv.

Run: python3 scripts/parse_catalog.py
"""
import csv
import html
import json
import os
import re
import shutil
import sys

from title_parser import parse_title, parse_episode_title, slugify

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SOURCE_HTML = os.path.join(ROOT, "catalogo-solo-videos.html")
GENRES_CSV = os.path.join(ROOT, "data", "genres.csv")
OUTPUT_CSV = os.path.join(ROOT, "public", "data", "catalog.csv")
SERIES_DIR = os.path.join(ROOT, "data", "series")
ASSETS_DIR = os.path.join(ROOT, "assets")

COLUMNS = [
    "catalog_index", "video_id", "type", "title", "title_raw",
    "series_id", "series_title", "season_number", "season_label",
    "episode_number", "year", "studio", "genre", "genre_secondary",
    "quality", "language", "subtitled", "duration_raw", "duration_seconds",
    "views", "thumbnail", "video_url", "embed_url",
]

CARD_RE = re.compile(
    r'<div class="video-card js-movie-card[^>]*?data-id="(\d+)"'
    r'(.*?)(?=<div class="video-card js-movie-card|\Z)',
    re.S,
)
TITLE_RE = re.compile(r'class="video-card_n ellip[^"]*"[^>]*title="([^"]*)"')
DURATION_RE = re.compile(r'class="video-card_duration">([^<]*)<')
VIEWS_RE = re.compile(r'class="video-card_info_i">([^<]*)<')
THUMB_RE = re.compile(r'<img[^>]*src="([\w.-]+_files/[^"]+)"')


def parse_duration(text):
    """'4:08:29' -> 14909. Accepts H:MM:SS or MM:SS."""
    parts = [p for p in text.strip().split(":") if p.isdigit()]
    seconds = 0
    for part in parts:
        seconds = seconds * 60 + int(part)
    return seconds


def parse_views(text):
    digits = re.sub(r"\D", "", html.unescape(text).replace("\xa0", ""))
    return int(digits) if digits else 0


def _search(pattern, segment):
    match = pattern.search(segment)
    return match.group(1) if match else ""


def extract_cards(html_text):
    cards = []
    for video_id, segment in CARD_RE.findall(html_text):
        cards.append({
            "video_id": video_id,
            "title_raw": html.unescape(_search(TITLE_RE, segment)),
            "duration_raw": _search(DURATION_RE, segment).strip(),
            "views_raw": _search(VIEWS_RE, segment),
            "thumbnail": _search(THUMB_RE, segment),
        })
    return cards


def build_rows(html_text, genres):
    rows = []
    for index, card in enumerate(extract_cards(html_text)):
        parsed = parse_title(card["title_raw"])
        genre = genres.get(card["video_id"], {})
        rows.append({
            "catalog_index": index,
            "video_id": card["video_id"],
            "type": parsed["type"],
            "title": parsed["title"],
            "title_raw": card["title_raw"],
            "series_id": parsed["series_id"],
            "series_title": parsed["series_title"],
            "season_number": parsed["season_number"],
            "season_label": parsed["season_label"],
            "episode_number": "",
            "year": parsed["year"],
            "studio": parsed["studio"],
            "genre": genre.get("genre", ""),
            "genre_secondary": genre.get("genre_secondary", ""),
            "quality": parsed["quality"],
            "language": parsed["language"],
            "subtitled": "true" if parsed["subtitled"] else "false",
            "duration_raw": card["duration_raw"],
            "duration_seconds": parse_duration(card["duration_raw"]),
            "views": parse_views(card["views_raw"]),
            "thumbnail": card["thumbnail"],
            "video_url": f"https://ok.ru/video/{card['video_id']}",
            "embed_url": f"https://ok.ru/videoembed/{card['video_id']}",
        })
    return rows


def load_genres(path):
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8", newline="") as handle:
        return {
            row["video_id"]: {
                "genre": row.get("genre", ""),
                "genre_secondary": row.get("genre_secondary", ""),
            }
            for row in csv.DictReader(handle)
        }


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
    reported, never guessed -- unless *no* card in the series has an
    explicit number, in which case the whole series is numbered season 1,
    episode 1..N in card order (the source lists no numbering at all, so
    there's nothing to mis-parse; this is reported too).
    """
    assets_dir = assets_dir or ASSETS_DIR
    series_id = slugify(sidecar["series_title"])
    dest_dir = os.path.join(assets_dir, slug)
    os.makedirs(dest_dir, exist_ok=True)

    cards = extract_cards(html_text)
    parsed_numbers = [parse_episode_title(card["title_raw"]) for card in cards]
    sequential = bool(cards) and all(p is None for p in parsed_numbers)
    if sequential:
        print(f"no 'Temporada N Episodio M' titles in {slug!r}; "
              f"numbering {len(cards)} episodes sequentially as season 1")

    rows = []
    index = start_index
    for position, (card, parsed) in enumerate(zip(cards, parsed_numbers), start=1):
        if sequential:
            season_number, episode_number = 1, position
        elif parsed is None:
            print(f"skip (no season/episode match): {card['title_raw']!r}")
            continue
        else:
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


def report_coverage(rows):
    print(f"rows: {len(rows)}")
    for column in COLUMNS:
        filled = sum(1 for row in rows if str(row[column]) not in ("", "0", "false"))
        print(f"  {column:<18} {filled:>4}/{len(rows)}")


def main():
    html_text = open(SOURCE_HTML, encoding="utf-8").read()
    rows = build_rows(html_text, load_genres(GENRES_CSV))

    for slug, sidecar in load_series_sidecars(SERIES_DIR):
        series_html = open(os.path.join(ROOT, f"{slug}.html"), encoding="utf-8").read()
        rows.extend(build_episode_rows(series_html, sidecar, slug, len(rows)))

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        writer.writerows(rows)

    report_coverage(rows)
    print(f"\nwrote {OUTPUT_CSV}")


if __name__ == "__main__":
    sys.exit(main())
