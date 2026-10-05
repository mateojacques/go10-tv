import json, sys, os
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


def test_columns_are_the_26_specified_in_order():
    assert COLUMNS == [
        "catalog_index", "video_id", "type", "title", "title_raw",
        "series_id", "series_title", "season_number", "season_label",
        "episode_number", "chapter_start_seconds", "chapter_end_seconds",
        "year", "studio", "source", "genre", "genre_secondary",
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


def test_base_rows_are_credited_to_animax():
    html_text = open(os.path.join(ROOT, "catalogo-solo-videos.html"), encoding="utf-8").read()
    rows = build_rows(html_text, {})
    assert all(r["source"] == "Animax" for r in rows)


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


def test_explode_season_row_takes_a_chapters_own_season_number():
    # One video holding two seasons: its chapters say which season they're in.
    chapters = [{**THREE_CHAPTERS[0]}, {**THREE_CHAPTERS[1], "season_number": 2}]
    rows = parse_catalog.explode_season_row(SEASON_ROW, {"111": chapters})
    assert [r["season_number"] for r in rows] == ["1", "2"]


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


def test_load_reclassifications_reads_csv(tmp_path):
    path = tmp_path / "reclassify.csv"
    path.write_text(
        "video_id,series_title\n111,Dave el Barbaro\n222,Death Note\n",
        encoding="utf-8",
    )
    assert parse_catalog.load_reclassifications(str(path)) == {
        "111": "Dave el Barbaro",
        "222": "Death Note",
    }


def test_load_reclassifications_returns_empty_dict_when_file_missing(tmp_path):
    assert parse_catalog.load_reclassifications(str(tmp_path / "nope.csv")) == {}


MOVIE_ROW = {
    "catalog_index": 5, "video_id": "111", "type": "movie",
    "title": "Dave el Barbaro", "title_raw": "Dave el Barbaro (2004) [1080p] [Español]",
    "series_id": "", "series_title": "", "season_number": "", "season_label": "",
    "episode_number": "", "year": "2004", "studio": "", "genre": "Animación",
    "genre_secondary": "Comedia", "quality": "1080p", "language": "Español",
    "subtitled": "false", "duration_raw": "7:35:06", "duration_seconds": 27306,
    "views": 1996, "thumbnail": "catalogo_files/a.webp",
    "video_url": "https://ok.ru/video/111", "embed_url": "https://ok.ru/videoembed/111",
}


def test_apply_reclassifications_turns_a_movie_row_into_a_season_row():
    rows = parse_catalog.apply_reclassifications(
        [MOVIE_ROW], {"111": "Dave el Barbaro"},
    )
    row = rows[0]
    assert row["type"] == "season"
    assert row["series_id"] == "dave-el-barbaro"
    assert row["series_title"] == "Dave el Barbaro"
    assert row["season_number"] == "1"
    assert row["title"] == "Dave el Barbaro"


def test_apply_reclassifications_ignores_rows_not_listed():
    rows = parse_catalog.apply_reclassifications([MOVIE_ROW], {"999": "Other"})
    assert rows == [MOVIE_ROW]


def test_apply_reclassifications_feeds_explode_chapters():
    rows = parse_catalog.apply_reclassifications(
        [MOVIE_ROW], {"111": "Dave el Barbaro"},
    )
    exploded = parse_catalog.explode_chapters(rows, {"111": THREE_CHAPTERS})
    assert len(exploded) == 3
    assert all(r["type"] == "episode" for r in exploded)
    assert all(r["series_id"] == "dave-el-barbaro" for r in exploded)


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
    assert all(r["source"] == "" for r in rows)
    assert {int(r["season_number"]) for r in rows} == {1, 2, 3, 4, 5}
    assert rows[0]["catalog_index"] == 907
    assert rows[-1]["catalog_index"] == 955


def test_build_episode_rows_overrides_earliest_episode_thumbnail_with_sidecar_poster(tmp_path):
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    sidecar = {**SPIDEY_SIDECAR, "thumbnail": "assets/spidey/poster.jpg"}
    rows = parse_catalog.build_episode_rows(
        html_text, sidecar, "spidey", start_index=0,
        root=ROOT, assets_dir=str(tmp_path),
    )
    earliest = min(rows, key=lambda r: (int(r["season_number"]), int(r["episode_number"])))
    assert earliest["thumbnail"] == "assets/spidey/poster.jpg"
    others = [r for r in rows if r is not earliest]
    assert all(r["thumbnail"] != "assets/spidey/poster.jpg" for r in others)


def test_build_episode_rows_uses_sidecar_source_when_present(tmp_path):
    html_text = open(os.path.join(ROOT, "spidey.html"), encoding="utf-8").read()
    sidecar = {**SPIDEY_SIDECAR, "source": "Nick Jr."}
    rows = parse_catalog.build_episode_rows(
        html_text, sidecar, "spidey", start_index=0,
        root=ROOT, assets_dir=str(tmp_path),
    )
    assert all(r["source"] == "Nick Jr." for r in rows)


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


UPDATE_HTML = os.path.join(ROOT, "catalogo-actualizacion-28-09.html")


def test_extract_feed_cards_reads_every_post_once():
    cards = parse_catalog.extract_feed_cards(open(UPDATE_HTML, encoding="utf-8").read())
    # 24 posts, two of them re-posts of a video already above them.
    assert len(cards) == 22
    simpsons = next(c for c in cards if c["video_id"] == "15704565615342")
    assert simpsons == {
        "video_id": "15704565615342",
        "title_raw": "Los Simpsons - Temporada 4 (20th Television) [1080p] [Español]",
        "duration_raw": "8:26:06",
        "views_raw": "982&nbsp;views",
        "thumbnail": "catalogo-actualizacion-28-09_files/i_070_mSIU.webp",
        "thumbnail_url": "",
    }


def test_take_new_cards_stops_at_the_first_known_video():
    cards = [{"video_id": v} for v in ["3", "2", "1", "0"]]
    assert parse_catalog.take_new_cards(cards, {"1", "0"}) == [{"video_id": "3"}, {"video_id": "2"}]


def test_update_save_adds_only_the_posts_above_the_base_catalog():
    base = extract_cards(open(os.path.join(ROOT, "catalogo-solo-videos.html"), encoding="utf-8").read())
    feed = parse_catalog.extract_feed_cards(open(UPDATE_HTML, encoding="utf-8").read())
    new = parse_catalog.take_new_cards(feed, {c["video_id"] for c in base})
    assert len(new) == 13
    assert new[-1]["title_raw"].startswith("Los Simpsons - Temporada 4")


def test_merge_update_sources_puts_new_cards_first_with_copied_thumbnails(tmp_path):
    (tmp_path / "upd_files").mkdir()
    (tmp_path / "upd_files" / "a.webp").write_bytes(b"img")
    card = ('<div data-module="OKVideo" data-movie-id="{id}"></div>'
            '<img src="upd_files/a.webp" alt="{title}" class="vid-card_img">'
            '<div class="vid-card_duration">1:00</div>'
            '<span class="video-card_info_i">5&nbsp;views</span>')
    (tmp_path / "upd.html").write_text(
        card.format(id="2", title="New") + card.format(id="1", title="Old"), encoding="utf-8")
    base = [{"video_id": "1", "thumbnail": "catalogo_files/x.webp"}]

    cards = parse_catalog.merge_update_sources(base, ["upd"], root=str(tmp_path),
                                               assets_dir=str(tmp_path / "assets"))

    assert [c["video_id"] for c in cards] == ["2", "1"]
    assert cards[0]["thumbnail"] == "assets/upd/a.webp"
    assert (tmp_path / "assets" / "upd" / "a.webp").read_bytes() == b"img"


SHREK_PICK = {
    "title": "Shrek 4: Felices para siempre",
    "type": "movie",
    "added": "2026-09-28",
    "year": "2010",
    "studio": "DreamWorks",
    "source": "Peliculas",
    "quality": "1080p",
    "language": "Español Latino",
    "genre": "Animación",
    "genre_secondary": "Comedia",
    "videos": [{
        "video_id": "4658593663605",
        "title_raw": "Shrek 4 Felices Para Siempre [1080p] [Latino]",
        "duration_raw": "1:33:13",
        "views": 15600,
        "thumbnail_url": "",
    }],
}

FUTURAMA_PICK = {
    "title": "Futurama",
    "type": "series",
    "added": "2026-09-27",
    "source": "Uploader",
    "quality": "1080p",
    "language": "Español Latino",
    "genre": "Animación",
    "genre_secondary": "Comedia",
    "videos": [
        {"video_id": "111", "title_raw": "Futurama T5 pack", "duration_raw": "2:00:00",
         "views": 1, "thumbnail_url": "", "season_number": 5},
        {"video_id": "222", "title_raw": "Futurama 6x01", "duration_raw": "22:00",
         "views": 2, "thumbnail_url": "", "season_number": 6, "episode_number": 1,
         "quality": "720p"},
    ],
}


def test_build_pick_rows_turns_a_movie_pick_into_a_movie_row(tmp_path):
    [row] = parse_catalog.build_pick_rows(SHREK_PICK, "shrek-4", assets_dir=str(tmp_path))
    assert row["type"] == "movie"
    assert row["title"] == "Shrek 4: Felices para siempre"
    assert row["title_raw"] == "Shrek 4 Felices Para Siempre [1080p] [Latino]"
    assert row["series_id"] == ""
    assert row["year"] == "2010"
    assert row["studio"] == "DreamWorks"
    assert row["source"] == "Peliculas"
    assert row["genre"] == "Animación"
    assert row["genre_secondary"] == "Comedia"
    assert row["quality"] == "1080p"
    assert row["language"] == "Español Latino"
    assert row["subtitled"] == "false"
    assert row["duration_seconds"] == 5593
    assert row["views"] == 15600
    assert row["thumbnail"] == "assets/shrek-4/4658593663605.jpg"
    assert row["embed_url"] == "https://ok.ru/videoembed/4658593663605"
    assert set(row) == set(COLUMNS) - {"chapter_start_seconds", "chapter_end_seconds"}


def test_build_pick_rows_makes_season_packs_and_episodes_for_a_series(tmp_path):
    pack, episode = parse_catalog.build_pick_rows(FUTURAMA_PICK, "futurama", assets_dir=str(tmp_path))
    assert pack["type"] == "season"
    assert pack["series_id"] == "futurama"
    assert pack["series_title"] == "Futurama"
    assert pack["title"] == "Futurama"
    assert pack["season_number"] == "5"
    assert pack["episode_number"] == ""
    assert episode["type"] == "episode"
    assert episode["season_number"] == "6"
    assert episode["episode_number"] == "1"
    # A per-video field overrides the pick-wide one.
    assert episode["quality"] == "720p"
    assert pack["quality"] == "1080p"


def test_build_pick_rows_season_packs_feed_explode_chapters(tmp_path):
    rows = parse_catalog.build_pick_rows(FUTURAMA_PICK, "futurama", assets_dir=str(tmp_path))
    chapters = {"111": [
        {"episode_number": 1, "title": "Episodio 1", "start_seconds": 0, "end_seconds": 3600},
        {"episode_number": 2, "title": "Episodio 2", "start_seconds": 3600, "end_seconds": None},
    ]}
    exploded = parse_catalog.explode_chapters(rows, chapters)
    assert [(r["type"], r["season_number"], r["episode_number"]) for r in exploded] == [
        ("episode", "5", "1"), ("episode", "5", "2"), ("episode", "6", "1"),
    ]


def test_build_pick_rows_downloads_each_thumbnail_once(tmp_path, monkeypatch):
    calls = []

    def fake_download(url, dest_path):
        calls.append(url)
        open(dest_path, "wb").close()

    monkeypatch.setattr(parse_catalog, "download_thumbnail", fake_download)
    pick = {**SHREK_PICK, "videos": [{**SHREK_PICK["videos"][0], "thumbnail_url": "https://x/1.jpg"}]}
    parse_catalog.build_pick_rows(pick, "shrek-4", assets_dir=str(tmp_path))
    parse_catalog.build_pick_rows(pick, "shrek-4", assets_dir=str(tmp_path))
    assert calls == ["https://x/1.jpg"]
    assert (tmp_path / "shrek-4" / "4658593663605.jpg").exists()


def test_load_picks_orders_newest_added_first(tmp_path):
    for slug, pick in (("futurama", FUTURAMA_PICK), ("shrek-4", SHREK_PICK)):
        (tmp_path / f"{slug}.json").write_text(json.dumps(pick), encoding="utf-8")
    assert [slug for slug, _ in parse_catalog.load_picks(str(tmp_path))] == ["shrek-4", "futurama"]


def test_load_picks_returns_empty_list_when_dir_missing(tmp_path):
    assert parse_catalog.load_picks(str(tmp_path / "missing")) == []


def test_merge_pick_rows_leads_the_catalog_and_skips_known_videos(tmp_path, capsys):
    base = [{"video_id": "4658593663605", "catalog_index": 0}, {"video_id": "9", "catalog_index": 1}]
    picks = [("shrek-4", SHREK_PICK), ("futurama", FUTURAMA_PICK)]
    rows = parse_catalog.merge_pick_rows(base, picks, assets_dir=str(tmp_path))
    assert [r["video_id"] for r in rows] == ["111", "222", "4658593663605", "9"]
    assert "4658593663605" in capsys.readouterr().out
