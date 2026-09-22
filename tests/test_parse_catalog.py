import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import parse_catalog
from parse_catalog import COLUMNS, parse_duration, parse_views, extract_cards, build_rows

ROOT = os.path.join(os.path.dirname(__file__), "..")


def test_parse_duration_converts_to_seconds():
    assert parse_duration("4:08:29") == 14909
    assert parse_duration("2:13:42 ") == 8022
    assert parse_duration("12:30") == 750
    assert parse_duration("") == 0


def test_parse_views_strips_separators():
    assert parse_views("173&nbsp;views") == 173
    assert parse_views("1&nbsp;444&nbsp;views") == 1444
    assert parse_views("") == 0


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


def test_extract_cards_finds_every_card_with_every_field():
    html_text = open(os.path.join(ROOT, "catalogo-solo-videos.html"), encoding="utf-8").read()
    cards = extract_cards(html_text)
    assert len(cards) == 907
    assert len({c["video_id"] for c in cards}) == 907
    for card in cards:
        assert card["title_raw"], card
        assert card["duration_raw"], card
        assert card["thumbnail"].startswith("catalogo_files/"), card


def test_build_rows_produces_full_catalog():
    html_text = open(os.path.join(ROOT, "catalogo-solo-videos.html"), encoding="utf-8").read()
    rows = build_rows(html_text, {})
    assert len(rows) == 907
    assert [r["catalog_index"] for r in rows] == list(range(907))
    assert sum(1 for r in rows if r["type"] == "season") == 133
    # 84, not 85: "Love, Death & Robots" and "Love Death & Robots" are the same
    # show spelled two ways in the scrape and correctly slugify to one series_id.
    assert len({r["series_id"] for r in rows if r["series_id"]}) == 84
    assert sum(1 for r in rows if r["year"]) == 721


def test_every_thumbnail_exists_on_disk():
    html_text = open(os.path.join(ROOT, "catalogo-solo-videos.html"), encoding="utf-8").read()
    for row in build_rows(html_text, {}):
        assert os.path.exists(os.path.join(ROOT, row["thumbnail"])), row["thumbnail"]


def test_urls_are_built_from_video_id():
    html_text = open(os.path.join(ROOT, "catalogo-solo-videos.html"), encoding="utf-8").read()
    row = build_rows(html_text, {})[0]
    assert row["video_url"] == f"https://ok.ru/video/{row['video_id']}"
    assert row["embed_url"] == f"https://ok.ru/videoembed/{row['video_id']}"


def test_genres_are_joined_when_supplied():
    html_text = open(os.path.join(ROOT, "catalogo-solo-videos.html"), encoding="utf-8").read()
    first_id = extract_cards(html_text)[0]["video_id"]
    genres = {first_id: {"genre": "Animación", "genre_secondary": "Aventura"}}
    rows = build_rows(html_text, genres)
    assert rows[0]["genre"] == "Animación"
    assert rows[0]["genre_secondary"] == "Aventura"
    assert rows[1]["genre"] == ""
