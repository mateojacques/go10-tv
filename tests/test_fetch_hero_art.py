import csv
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import fetch_hero_art as fha

FIELDS = ["catalog_index", "video_id", "type", "title", "series_id", "series_title", "year"]


def _csv(path, rows):
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in FIELDS})


def test_normalise_strips_case_accents_and_punctuation():
    assert fha.normalise("  ¡Coraje, el Perro Cobarde!  ") == "coraje el perro cobarde"
    assert fha.normalise("Pokémon: La Película") == "pokemon la pelicula"


def test_load_titles_keys_like_build_titles(tmp_path):
    path = tmp_path / "catalog.csv"
    _csv(path, [
        {"video_id": "10", "type": "movie", "title": "Toy Story", "year": "1995"},
        {"video_id": "20", "type": "season", "series_id": "castlevania", "series_title": "Castlevania", "year": "2017"},
        {"video_id": "21", "type": "season", "series_id": "castlevania", "series_title": "Castlevania", "year": "2018"},
    ])
    titles = fha.load_titles(str(path))
    assert titles == [
        {"key": "10", "name": "Toy Story", "year": 1995, "kind": "movie"},
        {"key": "castlevania", "name": "Castlevania", "year": 2017, "kind": "show"},
    ]


def test_best_match_accepts_localized_or_original_title_and_prefers_closest_year():
    entry = {"key": "k", "name": "El Rey León", "year": 1994, "kind": "movie"}
    results = [
        {"id": 1, "title": "El rey león", "original_title": "The Lion King", "release_date": "2019-07-12", "backdrop_path": "/new.jpg"},
        {"id": 2, "title": "El Rey León", "original_title": "The Lion King", "release_date": "1994-06-23", "backdrop_path": "/old.jpg"},
        {"id": 3, "title": "Otra", "original_title": "Other", "release_date": "1994-01-01", "backdrop_path": "/x.jpg"},
    ]
    assert fha.best_match(entry, results)["id"] == 2
    by_original = {"key": "k", "name": "The Lion King", "year": None, "kind": "movie"}
    assert fha.best_match(by_original, results)["id"] == 1  # no year: TMDB's order


def test_best_match_ignores_results_without_a_backdrop_and_uses_tv_fields():
    entry = {"key": "k", "name": "Castlevania", "year": 2017, "kind": "show"}
    assert fha.best_match(entry, [{"id": 1, "name": "Castlevania", "first_air_date": "2017-07-07", "backdrop_path": None}]) is None
    assert fha.best_match(entry, [{"id": 2, "original_name": "Castlevania", "first_air_date": "2017-07-07", "backdrop_path": "/c.jpg"}])["id"] == 2


def _fake_get(responses):
    calls = []

    def get(path, params):
        calls.append((path, params))
        return responses[(path, params.get("query"))]

    get.calls = calls
    return get


def test_build_index_matches_pins_and_blocks():
    titles = [
        {"key": "10", "name": "Toy Story", "year": 1995, "kind": "movie"},
        {"key": "cast", "name": "Castlevania", "year": 2017, "kind": "show"},
        {"key": "zz", "name": "Nada", "year": None, "kind": "movie"},
        {"key": "blk", "name": "Toy Story", "year": 1995, "kind": "movie"},
    ]
    get = _fake_get({
        ("/search/movie", "Toy Story"): {"results": [{"id": 862, "title": "Toy Story", "release_date": "1995-11-22", "backdrop_path": "/toy.jpg"}]},
        ("/search/movie", "Nada"): {"results": []},
        ("/tv/999", None): {"id": 999, "backdrop_path": "/pinned.jpg"},
    })
    overrides = {"pin": {"cast": "tv/999"}, "block": ["blk"]}
    items, report = fha.build_index(titles, get, overrides)
    assert items == {
        "10": {"tmdb": "movie/862", "backdrop": "/toy.jpg"},
        "cast": {"tmdb": "tv/999", "backdrop": "/pinned.jpg"},
    }
    assert report["matched"] == 1 and report["pinned"] == 1 and report["blocked"] == 1
    assert report["unmatched"] == [("zz", "Nada")]
    # A pinned title is not searched; the search uses es-MX.
    assert all(path != "/search/tv" for path, _ in get.calls)
    assert all(params.get("language") == "es-MX" for path, params in get.calls if path.startswith("/search"))


def test_build_index_survives_a_network_error_on_one_title():
    titles = [{"key": "a", "name": "A", "year": None, "kind": "movie"}, {"key": "b", "name": "B", "year": None, "kind": "movie"}]

    def get(path, params):
        if params.get("query") == "A":
            raise OSError("boom")
        return {"results": [{"id": 5, "title": "B", "backdrop_path": "/b.jpg"}]}

    items, report = fha.build_index(titles, get, {"pin": {}, "block": []})
    assert items == {"b": {"tmdb": "movie/5", "backdrop": "/b.jpg"}}
    assert report["unmatched"] == [("a", "A")]


def test_build_index_warns_about_unknown_override_keys():
    _, report = fha.build_index([], _fake_get({}), {"pin": {"ghost": "movie/1"}, "block": ["ghost2"]})
    assert report["unknown_overrides"] == ["ghost", "ghost2"]


def test_write_index_is_sorted_and_versioned(tmp_path):
    path = tmp_path / "hero_art.json"
    fha.write_index(str(path), {"b": {"tmdb": "movie/2", "backdrop": "/b.jpg"}, "a": {"tmdb": "tv/1", "backdrop": "/a.jpg"}})
    text = path.read_text(encoding="utf-8")
    data = json.loads(text)
    assert data["schema_version"] == 1
    assert list(data["items"]) == ["a", "b"]
    assert text.endswith("\n")


def test_main_without_a_token_exits_1_and_writes_nothing(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("TMDB_TOKEN", raising=False)
    out = tmp_path / "hero_art.json"
    assert fha.main(["--output", str(out)]) == 1
    assert not out.exists()
    assert "TMDB_TOKEN" in capsys.readouterr().err


def _catalog(tmp_path):
    path = tmp_path / "catalog.csv"
    _csv(path, [
        {"video_id": "10", "type": "movie", "title": "Toy Story", "year": "1995"},
        {"video_id": "11", "type": "movie", "title": "Cars", "year": "2006"},
    ])
    return str(path)


def test_main_keeps_the_committed_file_when_every_request_failed(tmp_path, monkeypatch):
    def offline(path, params):
        raise OSError("network unreachable")

    monkeypatch.setenv("TMDB_TOKEN", "t")
    monkeypatch.setattr(fha, "tmdb_getter", lambda token: offline)
    out = tmp_path / "hero_art.json"
    out.write_text("committed\n", encoding="utf-8")
    assert fha.main(["--catalog", _catalog(tmp_path), "--output", str(out), "--overrides", str(tmp_path / "none.json")]) == 1
    assert out.read_text(encoding="utf-8") == "committed\n"


def test_main_stops_on_a_rejected_token(tmp_path, monkeypatch):
    import urllib.error

    def unauthorized(path, params):
        raise urllib.error.HTTPError(path, 401, "Unauthorized", {}, None)

    monkeypatch.setenv("TMDB_TOKEN", "bad")
    monkeypatch.setattr(fha, "tmdb_getter", lambda token: unauthorized)
    out = tmp_path / "hero_art.json"
    assert fha.main(["--catalog", _catalog(tmp_path), "--output", str(out), "--overrides", str(tmp_path / "none.json")]) == 1
    assert not out.exists()


def test_build_index_treats_a_truncated_response_as_one_failed_title():
    import http.client

    def get(path, params):
        if params.get("query") == "A":
            raise http.client.IncompleteRead(b"")
        return {"results": [{"id": 5, "title": "B", "backdrop_path": "/b.jpg"}]}

    titles = [{"key": "a", "name": "A", "year": None, "kind": "movie"}, {"key": "b", "name": "B", "year": None, "kind": "movie"}]
    items, report = fha.build_index(titles, get, {"pin": {}, "block": []})
    assert items == {"b": {"tmdb": "movie/5", "backdrop": "/b.jpg"}}
    assert report["unmatched"] == [("a", "A")]
