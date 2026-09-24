import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from parse_catalog import COLUMNS
from build_aniyomi_feed import group_rows, build_item


def row(**overrides):
    """A catalog.csv row as csv.DictReader yields it: every column present, all strings."""
    base = {column: "" for column in COLUMNS}
    base.update({
        "catalog_index": "0", "video_id": "1", "type": "movie", "title": "T",
        "views": "0", "duration_seconds": "0", "subtitled": "false",
    })
    base.update({key: str(value) for key, value in overrides.items()})
    return base


def test_groups_by_series_id_else_video_id():
    rows = [
        row(video_id="10", type="episode", series_id="show", episode_number=1),
        row(video_id="11", type="episode", series_id="show", episode_number=2),
        row(video_id="20", type="movie"),
    ]
    groups = group_rows(rows)
    assert list(groups) == ["show", "20"]
    assert [r["video_id"] for r in groups["show"]] == ["10", "11"]


def test_groups_are_sorted_by_season_then_episode_blanks_first():
    rows = [
        row(video_id="a", series_id="s", season_number=2, episode_number=1),
        row(video_id="b", series_id="s", season_number=1, episode_number=2),
        row(video_id="c", series_id="s", season_number="", episode_number=""),
        row(video_id="d", series_id="s", season_number=1, episode_number=1),
    ]
    assert [r["video_id"] for r in group_rows(rows)["s"]] == ["c", "d", "b", "a"]


def test_series_item_uses_primary_row_and_aggregates():
    group = group_rows([
        row(catalog_index=7, video_id="10", type="episode", series_id="show",
            series_title="The Show", title="Episodio 2", season_number=1,
            episode_number=2, views=5, genre="Comedia", genre_secondary="",
            studio="Disney", thumbnail="catalogo_files/b.webp"),
        row(catalog_index=3, video_id="11", type="episode", series_id="show",
            series_title="The Show", title="Episodio 1", season_number=1,
            episode_number=1, views=10, year=2004, genre="Acción",
            genre_secondary="Aventura", studio="Pixar", quality="1080p",
            language="Español", subtitled="true",
            thumbnail="catalogo_files/a.webp"),
    ])["show"]
    item = build_item("show", group)
    assert item == {
        "id": "s:show",
        "kind": "series",
        "title": "The Show",
        "thumbnail": "catalogo_files/a.webp",
        "year": 2004,
        "studio": "Pixar",
        "genres": ["Acción", "Aventura"],
        "quality": "1080p",
        "language": "Español",
        "subtitled": True,
        "views": 15,
        "recent_rank": 3,
    }


def test_movie_item_carries_video_id_and_duration():
    group = group_rows([row(catalog_index=4, video_id="99", title="Película X",
                            duration_seconds=5400, views=2)])["99"]
    item = build_item("99", group)
    assert item["id"] == "m:99"
    assert item["kind"] == "movie"
    assert item["title"] == "Película X"
    assert item["video_id"] == "99"
    assert item["duration_seconds"] == 5400
    assert "episode_count" not in item


def test_blank_numeric_cells_become_none_or_zero():
    group = group_rows([row(video_id="5", year="", views="", duration_seconds="",
                            studio="", quality="", language="")])["5"]
    item = build_item("5", group)
    assert item["year"] is None
    assert item["views"] == 0
    assert item["duration_seconds"] is None
    assert item["studio"] is None
    assert item["quality"] is None
    assert item["language"] is None
    assert item["genres"] == []


def test_series_title_falls_back_to_row_title():
    group = group_rows([row(video_id="1", type="season", series_id="s",
                            series_title="", title="Love Death & Robots")])["s"]
    assert build_item("s", group)["title"] == "Love Death & Robots"
