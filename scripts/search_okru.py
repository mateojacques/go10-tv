"""Search ok.ru for videos and channels, or list a channel's videos.

Run:
  python3 scripts/search_okru.py search "shrek 2 latino"
  python3 scripts/search_okru.py search --html saved-search.html
  python3 scripts/search_okru.py channel c5765359
  python3 scripts/search_okru.py channel --html saved-channel.html
  python3 scripts/search_okru.py check 4658593663605 15502026410734

Add --json for the full records (what the /search-okru skill reads).

A live search only returns ok.ru's first page (~7-20 videos, ~3 channels):
the rest loads by in-page script as you scroll. For more, open the search
in a browser, scroll until enough results have loaded, save the page, and
pass it with --html. Search pages and channel pages are told apart by their
markup, so either subcommand reads either kind of save.

`check` opens each video's embed player -- what the app plays -- and
reports whether it plays there, its real resolution (titles often claim
more than the upload has) and its exact duration.

Titles and descriptions are scanned for quality and language hints, and
each video is flagged when its id is already in catalog.csv. Picking which
upload to ingest is left to the reader: this script never ranks results.
"""
import argparse
import csv
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from parse_catalog import OUTPUT_CSV, extract_cards, parse_duration
from title_parser import parse_episode_title, parse_title

BASE_URL = "https://ok.ru"
# ok.ru serves an empty body to clients without a browser-like User-Agent.
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)

# A search results page wraps each hit in one of these; a channel page (and
# the series pages parse_catalog reads) has bare `video-card js-movie-card`s.
SEARCH_VIDEO_SPLIT = 'class="video_search_result_video-card '
SEARCH_CHANNEL_SPLIT = 'class="video_search_result_channel-card '

VIDEO_ID_RE = re.compile(r'data-movie-id="(\d+)"|href="/video/(\d+)')
NAME_RE = re.compile(r'class="video_search_result_name" title="([^"]*)"')
NAME_TEXT_RE = re.compile(r'data-tsid="video-name">([^<]*)<')
IMG_RE = re.compile(r'<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*class="video-card_img"')
DURATION_RE = re.compile(r'class="video-card_duration">([^<]*)<')
VIEWS_RE = re.compile(r'data-tsid="video-views-count">([^<]*)<')
CREATED_RE = re.compile(r'data-tsid="video-created-date">([^<]*)<')
OWNER_RE = re.compile(
    r'<a href="(/(?:video/c\d+|group/\d+[^"]*|profile/\d+[^"]*|[\w.-]+/video[^"]*))"'
    r'[^>]*data-tsid="video-owner">.*?class="video_search_result_name2">([^<]*)<',
    re.S,
)
DESCRIPTION_RE = re.compile(r'data-tsid="video-description">(.*?)</div>', re.S)

CHANNEL_HREF_RE = re.compile(r'href="(/video/c\d+|/group/\d+[^"]*)"')
CHANNEL_NAME_RE = re.compile(r'class="video_search_result_link video_search_result_title[^"]*"[^>]*>([^<]*)<')
SUBSCRIBERS_RE = re.compile(r'data-tsid="channel-subscribers-count">([^<]*)<')
VIDEO_COUNT_RE = re.compile(r'data-tsid="channel-video-count">([^<]*)<')

EMBED_OPTIONS_RE = re.compile(r'data-options="([^"]*)"')
EMBED_STUB_RE = re.compile(r'class="vp_video_stub_txt">([^<]*)<')
# The embed player's quality variants, best last.
VARIANTS = [("mobile", "144p"), ("lowest", "240p"), ("low", "360p"), ("sd", "480p"),
            ("hd", "720p"), ("full", "1080p"), ("quad", "1440p"), ("ultra", "4K")]

ALBUM_NAME_RE = re.compile(r'class="album-info_name[^"]*">([^<]*)<')
CARD_INFO_RE = re.compile(r'class="video-card_info_i">([^<]*)<')
# Logged-in saves name each card's uploader in an extra info item.
CARD_AUTHOR_RE = re.compile(r'class="video-card_info_i __with-name[^"]*">([^<]*)<')

# Hints only: tags that uploaders commonly put in titles/descriptions.
QUALITY_HINTS = [
    ("4K", r"\b(?:4k|2160p?|uhd)\b"),
    ("1080p", r"\b(?:1080p?|full\s*hd|fhd)\b"),
    ("720p", r"\b720p?\b"),
    ("480p", r"\b480p?\b"),
    ("HD", r"\bhd\b"),
    ("CAM", r"\b(?:cam|ts|telesync|hdcam)\b"),
]
LANGUAGE_HINTS = [
    ("latino", r"\blat(?:ino|am)?\b|audio\s+latino"),
    ("castellano", r"\bcastellano\b|\bespaña\b|\bespañol\s+de\s+españa\b"),
    ("español", r"\bespa[ñn]ol\b"),
    ("subtitulado", r"\bsub(?:s|titulad[oa]|titulos|títulos)?\b|\bvose\b|\bvos\b"),
    ("dual", r"\bdual\b"),
    ("inglés", r"\bingl[eé]s\b|\benglish\b"),
    ("japonés", r"\bjapon[eé]s\b|\bjapanese\b"),
    ("doblaje", r"\bdoblad[oa]\b|\bdoblaje\b|\bdub\b"),
]


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def search_url(query):
    # Spaces must be '+': ok.ru returns no results for '%20' in the path.
    return f"{BASE_URL}/video/search/{urllib.parse.quote_plus(query.strip())}"


def channel_url(ref):
    """'c5765359', '/video/c5765359', a full URL, or 'group/<id>' -> page URL."""
    ref = ref.strip()
    if ref.startswith("http"):
        return ref
    ref = ref.lstrip("/")
    if re.fullmatch(r"c\d+", ref):
        return f"{BASE_URL}/video/{ref}"
    if re.fullmatch(r"group/\d+", ref):
        return f"{BASE_URL}/{ref}/video/all"
    return f"{BASE_URL}/{ref}"


def parse_count(text):
    """'4.5K просмотров' -> 4500, '10 699 views' -> 10699, '' -> 0."""
    text = html.unescape(text).replace("\xa0", " ").strip()
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*([KkMм]|тыс|млн)?", text.replace(" ", ""))
    if not match:
        return 0
    number = float(match.group(1).replace(",", "."))
    suffix = (match.group(2) or "").lower()
    if suffix in ("k", "тыс"):
        number *= 1_000
    elif suffix in ("m", "м", "млн"):
        number *= 1_000_000
    return int(number)


def _search(pattern, segment):
    match = pattern.search(segment)
    return match.group(1) if match else ""


def _clean(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text))).strip()


def owner_from_href(href):
    href = href.split("?")[0]
    if re.fullmatch(r"/video/c\d+", href):
        kind = "channel"
    elif href.startswith("/group/"):
        kind = "group"
    else:
        kind = "user"
    return kind, BASE_URL + href


# "LAS" (Latin American Spanish, as in "LAS dub") only in capitals: lowercase
# "las" is the Spanish article ("Las Mascotas Maravilla").
LAS_RE = re.compile(r"\bLAS\b")


def hints(text):
    lowered = text.lower()
    quality = [name for name, pattern in QUALITY_HINTS if re.search(pattern, lowered)]
    language = [name for name, pattern in LANGUAGE_HINTS if re.search(pattern, lowered)]
    if LAS_RE.search(text) and "latino" not in language:
        language.insert(0, "latino")
    return quality, language


def enrich(video, known_ids):
    """Add the fields the skill reasons over: parsed title tags, episode
    numbers, keyword hints, and whether the catalog already has the video.
    """
    parsed = parse_title(video["title"])
    episode = parse_episode_title(video["title"])
    quality, language = hints(video["title"])
    description_quality, description_language = hints(video.get("description", ""))
    return {
        **video,
        "duration_seconds": parse_duration(video["duration_raw"]),
        "url": f"{BASE_URL}/video/{video['video_id']}",
        "embed_url": f"{BASE_URL}/videoembed/{video['video_id']}",
        "parsed": {
            "type": parsed["type"],
            "title": parsed["title"],
            "year": parsed["year"],
            "quality": parsed["quality"],
            "language": parsed["language"],
            "subtitled": parsed["subtitled"],
            "season_number": parsed["season_number"],
        },
        "episode": {"season": episode[0], "episode": episode[1]} if episode else None,
        "quality_hints": quality,
        "language_hints": language,
        # Kept apart from the title's: descriptions often list every
        # language/quality an uploader ever posts, not this video's.
        "description_hints": description_quality + description_language,
        "in_catalog": video["video_id"] in known_ids,
    }


def extract_search_videos(html_text):
    videos = []
    seen = set()
    for segment in html_text.split(SEARCH_VIDEO_SPLIT)[1:]:
        segment = segment.split(SEARCH_VIDEO_SPLIT)[0]
        id_match = VIDEO_ID_RE.search(segment)
        if not id_match:
            continue
        video_id = id_match.group(1) or id_match.group(2)
        if video_id in seen:
            continue
        seen.add(video_id)
        image = IMG_RE.search(segment)
        title = _search(NAME_TEXT_RE, segment) or _search(NAME_RE, segment) or (image.group(2) if image else "")
        owner = OWNER_RE.search(segment)
        owner_kind, owner_url = owner_from_href(owner.group(1)) if owner else ("", "")
        videos.append({
            "video_id": video_id,
            "title": html.unescape(title).strip(),
            "duration_raw": _search(DURATION_RE, segment).strip(),
            "views": parse_count(_search(VIEWS_RE, segment)),
            "created": html.unescape(_search(CREATED_RE, segment)).strip(),
            "owner_name": html.unescape(owner.group(2)).strip() if owner else "",
            "owner_kind": owner_kind,
            "owner_url": owner_url,
            "description": _clean(_search(DESCRIPTION_RE, segment)),
            "thumbnail_url": html.unescape(image.group(1)) if image else "",
        })
    return videos


def extract_search_channels(html_text):
    channels = []
    for segment in html_text.split(SEARCH_CHANNEL_SPLIT)[1:]:
        segment = segment.split(SEARCH_VIDEO_SPLIT)[0]
        href = _search(CHANNEL_HREF_RE, segment)
        if not href:
            continue
        kind, url = owner_from_href(href)
        channels.append({
            "name": html.unescape(_search(CHANNEL_NAME_RE, segment)).strip(),
            "kind": kind,
            "url": url,
            "subscribers": parse_count(_search(SUBSCRIBERS_RE, segment)),
            "video_count": parse_count(_search(VIDEO_COUNT_RE, segment)),
        })
    return channels


def extract_channel_videos(html_text):
    """Videos on a channel/group/user video page, in page order. Reuses
    parse_catalog's card parser -- the same markup as the saved series pages.
    """
    videos = []
    segments = re.split(r'(?=<div class="video-card js-movie-card)', html_text)
    by_id = {}
    for segment in segments:
        match = re.search(r'data-id="(\d+)"', segment[:400])
        if match:
            by_id[match.group(1)] = segment
    for card in extract_cards(html_text):
        segment = by_id.get(card["video_id"], "")
        info = [html.unescape(i).replace("\xa0", " ").strip() for i in CARD_INFO_RE.findall(segment)]
        videos.append({
            "video_id": card["video_id"],
            "title": card["title_raw"].strip(),
            "duration_raw": card["duration_raw"],
            "views": parse_count(info[0]) if info else 0,
            "created": info[1] if len(info) > 1 else "",
            "owner_name": html.unescape(_search(CARD_AUTHOR_RE, segment)).strip(),
            "owner_kind": "",
            "owner_url": "",
            "description": "",
            "thumbnail_url": card["thumbnail_url"] or card["thumbnail"],
        })
    return videos


def parse_embed(html_text):
    """An https://ok.ru/videoembed/<id> page -> whether it plays, and the
    upload's real resolution and duration.
    """
    result = {
        "playable": False, "status": "", "width": 0, "height": 0,
        "best_variant": "", "resolution": "", "duration_seconds": 0, "title": "",
    }
    options = EMBED_OPTIONS_RE.search(html_text)
    if not options:
        result["status"] = html.unescape(_search(EMBED_STUB_RE, html_text)).strip() or "no player"
        return result
    metadata = json.loads(html.unescape(options.group(1)))["flashvars"]["metadata"]
    if isinstance(metadata, str):
        metadata = json.loads(metadata)
    movie = metadata.get("movie", {})
    names = {video.get("name") for video in metadata.get("videos", [])}
    best = [(name, label) for name, label in VARIANTS if name in names]
    result.update({
        "playable": movie.get("status") == "OK" and bool(best),
        "status": movie.get("status", ""),
        "width": int(movie.get("width") or 0),
        "height": int(movie.get("height") or 0),
        "best_variant": best[-1][0] if best else "",
        "resolution": best[-1][1] if best else "",
        "duration_seconds": int(movie.get("duration") or 0),
        "title": movie.get("title", ""),
    })
    return result


def check_videos(video_ids):
    results = []
    for index, video_id in enumerate(video_ids):
        if index:
            time.sleep(1)
        results.append({"video_id": video_id, **parse_embed(fetch(f"{BASE_URL}/videoembed/{video_id}"))})
    return results


def is_search_page(html_text):
    return SEARCH_VIDEO_SPLIT in html_text or SEARCH_CHANNEL_SPLIT in html_text


def parse_page(html_text, known_ids, kind=None):
    """A search or channel page -> {"kind", "channel_name", "videos",
    "channels"}. `kind` defaults to what the markup looks like: a zero-result
    search page has no result cards to tell it by, so a live fetch passes it.
    """
    kind = kind or ("search" if is_search_page(html_text) else "channel")
    if kind == "search":
        videos = extract_search_videos(html_text)
        channels = extract_search_channels(html_text)
        channel_name = ""
    else:
        videos = extract_channel_videos(html_text)
        channels = []
        channel_name = html.unescape(_search(ALBUM_NAME_RE, html_text)).strip()
    return {
        "kind": kind,
        "channel_name": channel_name,
        "videos": [enrich(video, known_ids) for video in videos],
        "channels": channels,
    }


def load_known_ids(path=OUTPUT_CSV):
    if not os.path.exists(path):
        return set()
    with open(path, encoding="utf-8", newline="") as handle:
        return {row["video_id"] for row in csv.DictReader(handle)}


def print_table(result):
    header = result["source"]
    if result["channel_name"]:
        header += f"  ({result['channel_name']})"
    print(header)
    print(f"{len(result['videos'])} videos, {len(result['channels'])} channels\n")
    if result["kind"] == "search" and not result["videos"] and not result["channels"]:
        print("no results -- or ok.ru served a page without them; retry later, "
              "rephrase, or save the search from a browser and pass --html")
    for index, video in enumerate(result["videos"], start=1):
        tags = " ".join(video["quality_hints"] + video["language_hints"])
        flag = " [EN CATALOGO]" if video["in_catalog"] else ""
        print(f"{index:>3}. {video['video_id']}  {video['duration_raw']:>8}  {video['views']:>8} views  {video['title']}{flag}")
        details = [part for part in (tags, video["owner_name"] and f"by {video['owner_name']}") if part]
        if details:
            print(f"     {' | '.join(details)}")
    if result["channels"]:
        print("\nchannels:")
        for channel in result["channels"]:
            print(f"  {channel['url']}  {channel['name']}  "
                  f"({channel['video_count']} videos, {channel['subscribers']} subs)")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    search = sub.add_parser("search", help="search videos and channels")
    search.add_argument("query", nargs="?", help="search text (omit with --html)")
    channel = sub.add_parser("channel", help="list a channel's / group's videos")
    channel.add_argument("ref", nargs="?", help="c<id>, group/<id>, or a URL (omit with --html)")
    check = sub.add_parser("check", help="check videos play in the embed player; real resolution")
    check.add_argument("video_ids", nargs="+")
    check.add_argument("--json", action="store_true", help="print full JSON records")
    for command in (search, channel):
        command.add_argument("--html", help="read a saved page instead of fetching")
        command.add_argument("--json", action="store_true", help="print full JSON records")
    args = parser.parse_args(argv)

    if args.command == "check":
        results = check_videos(args.video_ids)
        if args.json:
            json.dump(results, sys.stdout, ensure_ascii=False, indent=2)
            print()
        else:
            for item in results:
                state = "plays" if item["playable"] else f"NOT PLAYABLE ({item['status']})"
                print(f"{item['video_id']}  {state}  {item['resolution'] or '-'} "
                      f"({item['width']}x{item['height']})  {item['duration_seconds']}s  {item['title']}")
        return 0

    if args.html:
        source = args.html
        html_text = open(args.html, encoding="utf-8").read()
    else:
        target = args.query if args.command == "search" else args.ref
        if not target:
            parser.error(f"{args.command} needs {'a query' if args.command == 'search' else 'a channel ref'} or --html")
        source = search_url(target) if args.command == "search" else channel_url(target)
        html_text = fetch(source)
        if args.command == "search" and not is_search_page(html_text):
            # ok.ru occasionally serves a results-less page for a query that
            # does have results; a real zero-result search looks the same.
            time.sleep(3)
            html_text = fetch(source)
        if not html_text.strip():
            print(f"ok.ru returned an empty page for {source}", file=sys.stderr)
            return 1

    kind = None if args.html else args.command
    result = {"source": source, **parse_page(html_text, load_known_ids(), kind)}
    if args.command == "search" and args.query:
        result["query"] = args.query
    if args.json:
        json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        print_table(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
