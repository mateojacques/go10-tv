import json
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from parse_catalog import COLUMNS
from build_aniyomi_feed import group_rows, build_item, build_episodes, build_feed, write_feed


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


def chapter(video_id, season, number, start, duration, **extra):
    return row(video_id=video_id, type="episode", series_id="s", series_title="S",
               season_number=season, episode_number=number,
               chapter_start_seconds=start, duration_seconds=duration,
               title=f"Episodio {number}", thumbnail="catalogo_files/p.webp",
               quality="1080p", **extra)


def test_chapter_split_pack_collapses_to_one_full_length_episode():
    group = group_rows([
        chapter("900", 1, 1, 0, 1491, chapter_end_seconds=1491),
        chapter("900", 1, 2, 1491, 1491, chapter_end_seconds=2982),
        chapter("900", 1, 3, 2982, 11927, chapter_end_seconds=""),  # open-ended last chapter
    ])["s"]
    assert build_episodes(group) == [{
        "video_id": "900", "season": 1, "number": 1, "title": "Temporada 1",
        "pack": True, "duration_seconds": 14909,
        "thumbnail": "catalogo_files/p.webp", "quality": "1080p",
    }]


def test_pack_title_prefers_season_label():
    group = group_rows([chapter("900", 2, 1, 0, 100, season_label="Parte final")])["s"]
    assert build_episodes(group)[0]["title"] == "Parte final"


def test_season_row_without_chapters_is_one_pack_episode():
    group = group_rows([
        row(video_id="31", type="season", series_id="ldr", series_title="LDR",
            season_number=3, title="Love Death & Robots", duration_seconds=7000),
        row(video_id="32", type="season", series_id="ldr", series_title="LDR",
            season_number=2, title="Love, Death & Robots", duration_seconds=6000),
    ])["ldr"]
    episodes = build_episodes(group)
    assert [(e["video_id"], e["season"], e["number"], e["title"], e["duration_seconds"])
            for e in episodes] == [
        ("32", 2, 1, "Temporada 2", 6000),
        ("31", 3, 1, "Temporada 3", 7000),
    ]
    assert all(e["pack"] for e in episodes)


def test_plain_episodes_keep_number_and_title():
    group = group_rows([
        row(video_id="2", type="episode", series_id="gx", series_title="GX",
            season_number=1, episode_number=2, title="El duelo", duration_seconds=1300),
        row(video_id="1", type="episode", series_id="gx", series_title="GX",
            season_number=1, episode_number=1, title="Llegada", duration_seconds=1400),
    ])["gx"]
    assert [(e["video_id"], e["number"], e["title"], e["pack"], e["duration_seconds"])
            for e in build_episodes(group)] == [
        ("1", 1, "Llegada", False, 1400),
        ("2", 2, "El duelo", False, 1300),
    ]


def test_two_packs_in_same_season_are_numbered_sequentially():
    group = group_rows([
        chapter("A", 1, 1, 0, 100),
        chapter("A", 1, 2, 100, 100),
        chapter("B", 1, 1, 0, 100),
    ])["s"]
    assert [(e["video_id"], e["season"], e["number"]) for e in build_episodes(group)] == [
        ("A", 1, 1), ("B", 1, 2),
    ]


def test_mixed_series_keeps_packs_and_plain_episodes():
    group = group_rows([
        chapter("P", 1, 1, 0, 500),
        chapter("P", 1, 2, 500, 500),
        row(video_id="E", type="episode", series_id="s", series_title="S",
            season_number=2, episode_number=1, title="Especial", duration_seconds=900),
    ])["s"]
    episodes = build_episodes(group)
    assert [(e["video_id"], e["season"], e["number"], e["pack"]) for e in episodes] == [
        ("P", 1, 1, True), ("E", 2, 1, False),
    ]
    assert episodes[0]["duration_seconds"] == 1000


def test_pack_without_season_number_falls_back_to_series_title():
    group = group_rows([row(video_id="7", type="season", series_id="s",
                            series_title="Serie Única", season_number="")])["s"]
    episode = build_episodes(group)[0]
    assert episode["season"] is None
    assert episode["title"] == "Serie Única"


def test_build_feed_sorts_by_recent_rank_and_counts_episodes():
    rows = [
        row(catalog_index=5, video_id="m1", title="Película"),
        chapter("P", 1, 1, 0, 100, catalog_index=2),
        chapter("P", 1, 2, 100, 100, catalog_index=3),
    ]
    items, series_files = build_feed(rows)
    assert [i["id"] for i in items] == ["s:s", "m:m1"]
    assert items[0]["episode_count"] == 1
    assert series_files == {"s": {"schema_version": 1, "episodes": build_episodes(group_rows(rows)["s"])}}


def test_write_feed_layout(tmp_path):
    out = tmp_path / "aniyomi"
    items = [{"id": "s:show", "kind": "series", "title": "Show"}]
    write_feed(str(out), items, {"show": {"schema_version": 1, "episodes": []}}, "2026-09-24T00:00:00Z")
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    assert index == {"schema_version": 1, "generated_at": "2026-09-24T00:00:00Z", "items": items}
    assert json.loads((out / "series" / "show.json").read_text(encoding="utf-8")) == \
        {"schema_version": 1, "episodes": []}


def test_rewrite_removes_stale_series_files(tmp_path):
    out = tmp_path / "aniyomi"
    write_feed(str(out), [], {"old": {"schema_version": 1, "episodes": []}}, "t1")
    write_feed(str(out), [], {"new": {"schema_version": 1, "episodes": []}}, "t2")
    assert sorted(p.name for p in (out / "series").iterdir()) == ["new.json"]


def test_output_is_utf8_without_ascii_escapes(tmp_path):
    out = tmp_path / "aniyomi"
    write_feed(str(out), [{"id": "m:1", "title": "Año de la Niña", "genres": ["Acción"]}], {}, "t")
    text = (out / "index.json").read_text(encoding="utf-8")
    assert "Año de la Niña" in text and "Acción" in text
    assert "\\u00" not in text


def test_views_count_each_video_once_for_chapter_split_packs():
    # parse_catalog copies a pack's views onto every chapter row; summing rows
    # would inflate Popular N-fold for chapter-split series.
    group = group_rows([
        chapter("P", 1, 1, 0, 100, views=173),
        chapter("P", 1, 2, 100, 100, views=173),
        chapter("P", 1, 3, 200, 100, views=173),
        chapter("Q", 2, 1, 0, 100, views=27),
    ])["s"]
    assert build_item("s", group)["views"] == 200


def test_packs_sharing_a_season_get_distinct_titles():
    # Real case: spawn has two season-1 packs both labelled "Temporadas 1, 2 y 3".
    group = group_rows([
        chapter("A", 1, 1, 0, 100, season_label="Temporadas 1, 2 y 3"),
        chapter("B", 1, 1, 0, 100, season_label="Temporadas 1, 2 y 3"),
        chapter("C", 2, 1, 0, 100),
    ])["s"]
    assert [e["title"] for e in build_episodes(group)] == [
        "Temporadas 1, 2 y 3 (parte 1)",
        "Temporadas 1, 2 y 3 (parte 2)",
        "Temporada 2",
    ]
