"""Parse an ok.ru scraped video title into structured catalog fields.

Pure functions only: no file or network I/O. Every rule here was validated
against all 907 titles in catalogo-solo-videos.html.
"""
import re
import unicodedata

# One title closes its bracket with a brace: "[Sub Español}". Tolerate both.
BRACKET = re.compile(r"\[([^\]\}]*)[\]\}]")
PAREN = re.compile(r"\(([^)]*)\)")

QUALITY = {
    "4k": "4K", "2k": "2K", "1440p": "1440p",
    "1080p": "1080p", "1080": "1080p", "1080p 60fps": "1080p", "hd": "HD",
}
LANGUAGES = {
    "español": "Español",
    "español latino": "Español Latino",
    "mudo": "Mudo",
}
STUDIOS = {
    "disney": "Disney", "pixar": "Pixar", "cartoon n.": "Cartoon N.",
    "warnerbros": "WarnerBros", "marvel": "Marvel", "dc": "DC",
    "adult swim": "Adult Swim", "nickelodeon": "Nickelodeon",
    "20th television": "20th Television", "dreamworks": "DreamWorks",
    "lucasfilm": "Lucasfilm", "comedy c.": "Comedy C.", "tim b.": "Tim B.",
}

# Requiring the literal word "Temporada" is what stops movie titles containing
# colons (e.g. "Batman: Knightfall Part 1: Knightfall") being read as seasons.
SEASON_SUFFIX = re.compile(
    r"^(?P<show>.+?)\s*[-–:]\s*Temporada\s*(?P<nums>\d+(?:\s*(?:,|y)\s*\d+)*)"
    r"(?:\s*:\s*(?P<label>.+?))?\s*$",
    re.I,
)
SEASON_PREFIX = re.compile(
    r"^Temporada\s*(?P<nums>\d+)\s*:\s*(?P<show>.+?)\s*$", re.I
)

EPISODE_RE = re.compile(
    r"Temporada\s*(?P<season>\d+)\s*Episodio\s*(?P<episode>\d+)"
    r"|\b(?P<season_x>\d{1,2})x(?P<episode_x>\d{1,3})\b",
    re.I,
)


def slugify(text):
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", ascii_text.lower())).strip("-")


def parse_seasons(rest):
    """Return (series_title, season_number, season_label) or None."""
    match = SEASON_SUFFIX.match(rest) or SEASON_PREFIX.match(rest)
    if not match:
        return None
    numbers = [int(n) for n in re.findall(r"\d+", match.group("nums"))]
    label = match.groupdict().get("label") or ""
    if len(numbers) > 1:
        label = "Temporadas " + match.group("nums").strip()
    return match.group("show").strip(), min(numbers), label


def parse_episode_title(raw):
    """Return (season_number, episode_number) or None.

    Only the numbers are trusted from the raw title. The show-name portion
    is deliberately not parsed here — casing is inconsistent across cards
    for the same show, so a per-series sidecar supplies the canonical name.
    """
    match = EPISODE_RE.search(raw)
    if not match:
        return None
    season = match.group("season") or match.group("season_x")
    episode = match.group("episode") or match.group("episode_x")
    return int(season), int(episode)


def parse_title(raw):
    result = {
        "title": "", "type": "movie", "series_title": "", "series_id": "",
        "season_number": "", "season_label": "", "year": "", "studio": "",
        "quality": "", "language": "", "subtitled": False,
    }

    for token in BRACKET.findall(raw):
        key = token.strip().lower()
        if key in QUALITY:
            result["quality"] = QUALITY[key]
        elif key.startswith("sub"):
            result["subtitled"] = True
            if "español" in key:
                result["language"] = result["language"] or "Español"
        elif key in LANGUAGES:
            result["language"] = LANGUAGES[key]
        elif key in STUDIOS:
            result["studio"] = STUDIOS[key]

    rest = BRACKET.sub("", raw)

    for token in PAREN.findall(rest):
        key = token.strip()
        if re.fullmatch(r"(19|20)\d\d", key):
            result["year"] = key
        elif key.lower() in STUDIOS:
            result["studio"] = result["studio"] or STUDIOS[key.lower()]

    rest = PAREN.sub("", rest)
    rest = re.sub(r"\s+", " ", rest).strip(" -–—")

    season = parse_seasons(rest)
    if season:
        series_title, number, label = season
        result.update({
            "type": "season",
            "series_title": series_title,
            "series_id": slugify(series_title),
            "season_number": str(number),
            "season_label": label,
            "title": series_title,
        })
    else:
        result["title"] = rest

    return result
