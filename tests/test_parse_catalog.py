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


def test_columns_are_the_25_specified_in_order():
    assert COLUMNS == [
        "catalog_index", "video_id", "type", "title", "title_raw",
        "series_id", "series_title", "season_number", "season_label",
        "episode_number", "chapter_start_seconds", "chapter_end_seconds",
        "year", "studio", "genre", "genre_secondary",
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


def test_columns_include_chapter_boundaries_after_episode_number():
    assert COLUMNS[9:12] == ["episode_number", "chapter_start_seconds", "chapter_end_seconds"]


def test_load_chapters_merges_every_sidecar_in_the_dir(tmp_path):
    chapters_dir = tmp_path / "chapters"
    chapters_dir.mkdir()
    (chapters_dir / "show-a.json").write_text(
        '{"111": [{"episode_number": 1, "title": "E1", "start_seconds": 0, "end_seconds": 1435}]}',
        encoding="utf-8",
    )
    (chapters_dir / "show-b.json").write_text(
        '{"222": [{"episode_number": 1, "title": "E1", "start_seconds": 0, "end_seconds": 1200}]}',
        encoding="utf-8",
    )
    chapters = parse_catalog.load_chapters(str(chapters_dir))
    assert set(chapters) == {"111", "222"}
    assert chapters["111"][0]["end_seconds"] == 1435


def test_load_chapters_returns_empty_dict_when_dir_missing(tmp_path):
    assert parse_catalog.load_chapters(str(tmp_path / "nope")) == {}


SEASON_ROW = {
    "catalog_index": 5, "video_id": "111", "type": "season",
    "title": "Hora de Aventura", "title_raw": "Hora de Aventura - Temporada 1",
    "series_id": "hora-de-aventura", "series_title": "Hora de Aventura",
    "season_number": "1", "season_label": "", "episode_number": "",
    "year": "2010", "studio": "Cartoon N.", "genre": "Animación",
    "genre_secondary": "", "quality": "1080p", "language": "Español",
    "subtitled": "false", "duration_raw": "4:08:29", "duration_seconds": 14909,
    "views": 173, "thumbnail": "catalogo_files/b.webp",
    "video_url": "https://ok.ru/video/111", "embed_url": "https://ok.ru/videoembed/111",
}

THREE_CHAPTERS = [
    {"episode_number": 1, "title": "Episodio 1", "start_seconds": 0, "end_seconds": 1435},
    {"episode_number": 2, "title": "Episodio 2", "start_seconds": 1440, "end_seconds": 2810},
    {"episode_number": 3, "title": "Episodio 3", "start_seconds": 2815, "end_seconds": None},
]


def test_explode_season_row_returns_row_unchanged_without_a_chapters_entry():
    assert parse_catalog.explode_season_row(SEASON_ROW, {}) == [SEASON_ROW]


def test_explode_season_row_produces_one_episode_row_per_chapter():
    rows = parse_catalog.explode_season_row(SEASON_ROW, {"111": THREE_CHAPTERS})
    assert len(rows) == 3
    assert all(r["type"] == "episode" for r in rows)
    assert all(r["video_id"] == "111" for r in rows)
    assert all(r["series_id"] == "hora-de-aventura" for r in rows)
    assert [r["episode_number"] for r in rows] == ["1", "2", "3"]
    assert [r["chapter_start_seconds"] for r in rows] == ["0", "1440", "2815"]
    assert [r["chapter_end_seconds"] for r in rows] == ["1435", "2810", ""]


def test_explode_season_row_computes_per_chapter_duration_including_open_ended_last():
    rows = parse_catalog.explode_season_row(SEASON_ROW, {"111": THREE_CHAPTERS})
    assert rows[0]["duration_seconds"] == 1435  # 1435 - 0
    assert rows[1]["duration_seconds"] == 1370  # 2810 - 1440
    assert rows[2]["duration_seconds"] == 14909 - 2815  # open-ended: parent's total duration


def test_explode_season_row_ignores_a_non_season_row():
    episode_row = {**SEASON_ROW, "type": "episode", "video_id": "111"}
    assert parse_catalog.explode_season_row(episode_row, {"111": THREE_CHAPTERS}) == [episode_row]


def test_explode_chapters_renumbers_catalog_index_across_the_result():
    other = {**SEASON_ROW, "catalog_index": 6, "video_id": "222"}
    rows = parse_catalog.explode_chapters([SEASON_ROW, other], {"111": THREE_CHAPTERS})
    assert len(rows) == 4  # 3 exploded + 1 unchanged
    assert [r["catalog_index"] for r in rows] == [0, 1, 2, 3]
    assert rows[3]["video_id"] == "222"


def test_genres_are_joined_when_supplied():
    html_text = open(os.path.join(ROOT, "catalogo-solo-videos.html"), encoding="utf-8").read()
    first_id = extract_cards(html_text)[0]["video_id"]
    genres = {first_id: {"genre": "Animación", "genre_secondary": "Aventura"}}
    rows = build_rows(html_text, genres)
    assert rows[0]["genre"] == "Animación"
    assert rows[0]["genre_secondary"] == "Aventura"
    assert rows[1]["genre"] == ""


def test_thumbnail_regex_matches_any_series_files_folder():
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    cards = extract_cards(html_text)
    assert len(cards) == 49
    assert all(c["thumbnail"].startswith("spidey_files/") for c in cards)


def test_load_series_sidecars_reads_json_files(tmp_path):
    series_dir = tmp_path / "series"
    series_dir.mkdir()
    (series_dir / "spidey.json").write_text(
        '{"series_title": "Spidey y sus Sorprendentes Amigos", "studio": "Marvel"}',
        encoding="utf-8",
    )
    sidecars = parse_catalog.load_series_sidecars(str(series_dir))
    assert sidecars == [
        ("spidey", {"series_title": "Spidey y sus Sorprendentes Amigos", "studio": "Marvel"})
    ]


def test_load_series_sidecars_returns_empty_list_when_dir_missing(tmp_path):
    assert parse_catalog.load_series_sidecars(str(tmp_path / "nope")) == []


SPIDEY_SIDECAR = {
    "series_title": "Spidey y sus Sorprendentes Amigos",
    "studio": "Marvel",
    "quality": "1080p",
    "language": "Español",
    "genre": "Superhéroes",
    "genre_secondary": "Infantil",
}


def test_build_episode_rows_extracts_all_spidey_episodes(tmp_path):
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    rows = parse_catalog.build_episode_rows(
        html_text, SPIDEY_SIDECAR, "spidey", start_index=907,
        root=ROOT, assets_dir=str(tmp_path),
    )
    assert len(rows) == 49
    assert all(r["type"] == "episode" for r in rows)
    assert all(r["series_id"] == "spidey-y-sus-sorprendentes-amigos" for r in rows)
    assert all(r["series_title"] == "Spidey y sus Sorprendentes Amigos" for r in rows)
    assert all(r["studio"] == "Marvel" for r in rows)
    assert {int(r["season_number"]) for r in rows} == {1, 2, 3, 4, 5}
    assert rows[0]["catalog_index"] == 907
    assert rows[-1]["catalog_index"] == 955


def test_build_episode_rows_copies_thumbnails_into_assets(tmp_path):
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    rows = parse_catalog.build_episode_rows(
        html_text, SPIDEY_SIDECAR, "spidey", start_index=0,
        root=ROOT, assets_dir=str(tmp_path),
    )
    for row in rows:
        assert row["thumbnail"].startswith("assets/spidey/")
        copied = tmp_path / "spidey" / os.path.basename(row["thumbnail"])
        assert copied.exists(), row["thumbnail"]


def test_build_episode_rows_skips_already_copied_thumbnails(tmp_path):
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    parse_catalog.build_episode_rows(
        html_text, SPIDEY_SIDECAR, "spidey", 0, root=ROOT, assets_dir=str(tmp_path),
    )
    # Re-running after the raw dump is hypothetically gone must not fail or
    # try to re-copy — every destination file already exists.
    rows = parse_catalog.build_episode_rows(
        html_text, SPIDEY_SIDECAR, "spidey", 0, root=ROOT, assets_dir=str(tmp_path),
    )
    assert len(rows) == 49


MASCOTAS_SIDECAR = {
    "series_title": "Las Mascotas Maravilla",
    "studio": "Nickelodeon",
    "quality": "1080p",
    "language": "Español",
    "genre": "Superhéroes",
    "genre_secondary": "Infantil",
}


def test_build_episode_rows_numbers_sequentially_when_no_title_has_numbers(tmp_path, capsys):
    # Mascotas Maravilla's titles carry no "Temporada N Episodio M" at all
    # ("Las Mascotas Maravilla - Salvan a Las Ovejas"), unlike Spidey's.
    html_text = open(os.path.join(ROOT, "mascotas-maravilla.html"), encoding="utf-8").read()
    rows = parse_catalog.build_episode_rows(
        html_text, MASCOTAS_SIDECAR, "mascotas-maravilla", start_index=0,
        root=ROOT, assets_dir=str(tmp_path),
    )
    assert len(rows) == 3
    assert all(r["season_number"] == "1" for r in rows)
    assert [r["episode_number"] for r in rows] == ["1", "2", "3"]
    assert "sequentially" in capsys.readouterr().out.lower()


def test_build_episode_rows_skips_titles_that_dont_match(tmp_path, capsys):
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    # Corrupt one card's title (its title="" and alt="" copies both contain
    # the same text) so it no longer matches "Temporada N Episodio M". The
    # trailing " -" is required so this doesn't also match "Episodio 21/22/
    # 24/25", which all share the "Episodio 2" prefix.
    broken_html = html_text.replace("Temporada 1 Episodio 2 -", "Special -")
    rows = parse_catalog.build_episode_rows(
        broken_html, SPIDEY_SIDECAR, "spidey", 0, root=ROOT, assets_dir=str(tmp_path),
    )
    assert len(rows) == 48
    assert "skip" in capsys.readouterr().out.lower()
