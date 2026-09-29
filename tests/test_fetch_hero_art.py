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
    items, _, report = fha.build_index(titles, get, overrides)
    assert items == {
        "10": {"tmdb": "movie/862", "backdrop": "/toy.jpg"},
        "cast": {"tmdb": "tv/999", "backdrop": "/pinned.jpg"},
    }
    assert report["matched"] == 1 and report["pinned"] == 1 and report["blocked"] == 1
    assert report["unmatched"] == [("zz", "Nada")]
    assert not any(params.get("query") == "Toy Story" for path, params in get.calls[1:])  # blocked: not searched
    # A pinned title is not searched; the search uses es-MX.
    assert all(path != "/search/tv" for path, _ in get.calls)
    assert all(params.get("language") == "es-MX" for path, params in get.calls if path.startswith("/search"))


def test_build_index_survives_a_network_error_on_one_title():
    titles = [{"key": "a", "name": "A", "year": None, "kind": "movie"}, {"key": "b", "name": "B", "year": None, "kind": "movie"}]

    def get(path, params):
        if params.get("query") == "A":
            raise OSError("boom")
        return {"results": [{"id": 5, "title": "B", "backdrop_path": "/b.jpg"}]}

    items, _, report = fha.build_index(titles, get, {"pin": {}, "block": []})
    assert items == {"b": {"tmdb": "movie/5", "backdrop": "/b.jpg"}}
    assert report["unmatched"] == [("a", "A")]


def test_build_index_warns_about_unknown_override_keys():
    _, _, report = fha.build_index([], _fake_get({}), {"pin": {"ghost": "movie/1"}, "block": ["ghost2"]})
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
    assert fha.main(["--output", str(out), "--misses", str(tmp_path / "misses.json"), "--env-file", str(tmp_path / "missing.env")]) == 1
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
    committed = '{"schema_version": 1, "items": {}}\n'
    out.write_text(committed, encoding="utf-8")
    assert fha.main(["--catalog", _catalog(tmp_path), "--output", str(out), "--overrides", str(tmp_path / "none.json"), "--misses", str(tmp_path / "misses.json")]) == 1
    assert out.read_text(encoding="utf-8") == committed
    assert not (tmp_path / "misses.json").exists()


def test_main_stops_on_a_rejected_token(tmp_path, monkeypatch):
    import urllib.error

    def unauthorized(path, params):
        raise urllib.error.HTTPError(path, 401, "Unauthorized", {}, None)

    monkeypatch.setenv("TMDB_TOKEN", "bad")
    monkeypatch.setattr(fha, "tmdb_getter", lambda token: unauthorized)
    out = tmp_path / "hero_art.json"
    assert fha.main(["--catalog", _catalog(tmp_path), "--output", str(out), "--overrides", str(tmp_path / "none.json"), "--misses", str(tmp_path / "misses.json")]) == 1
    assert not out.exists()


def test_build_index_treats_a_truncated_response_as_one_failed_title():
    import http.client

    def get(path, params):
        if params.get("query") == "A":
            raise http.client.IncompleteRead(b"")
        return {"results": [{"id": 5, "title": "B", "backdrop_path": "/b.jpg"}]}

    titles = [{"key": "a", "name": "A", "year": None, "kind": "movie"}, {"key": "b", "name": "B", "year": None, "kind": "movie"}]
    items, _, report = fha.build_index(titles, get, {"pin": {}, "block": []})
    assert items == {"b": {"tmdb": "movie/5", "backdrop": "/b.jpg"}}
    assert report["unmatched"] == [("a", "A")]


def test_main_reads_the_web_token_from_env_local(tmp_path, monkeypatch):
    monkeypatch.delenv("TMDB_TOKEN", raising=False)
    env = tmp_path / ".env.local"
    env.write_text('VITE_EXTERNAL_TITLES=on\nVITE_TMDB_TOKEN="eyJhbGci.abc-_123"\n', encoding="utf-8")
    seen = []

    def getter(token):
        seen.append(token)
        return lambda path, params: {"results": [{"id": 1, "title": params.get("query"), "backdrop_path": "/x.jpg"}]}

    monkeypatch.setattr(fha, "tmdb_getter", getter)
    out = tmp_path / "hero_art.json"
    assert fha.main(["--catalog", _catalog(tmp_path), "--output", str(out), "--overrides", str(tmp_path / "none.json"), "--misses", str(tmp_path / "misses.json"), "--env-file", str(env)]) == 0
    assert seen == ["eyJhbGci.abc-_123"]
    assert out.exists()


def test_main_prefers_tmdb_token_over_env_local(tmp_path, monkeypatch):
    monkeypatch.setenv("TMDB_TOKEN", "from.env-var")
    env = tmp_path / ".env.local"
    env.write_text("VITE_TMDB_TOKEN=from.file\n", encoding="utf-8")
    seen = []
    monkeypatch.setattr(fha, "tmdb_getter", lambda token: seen.append(token) or (lambda path, params: {"results": []}))
    fha.main(["--catalog", _catalog(tmp_path), "--output", str(tmp_path / "o.json"), "--overrides", str(tmp_path / "none.json"), "--misses", str(tmp_path / "misses.json"), "--env-file", str(env)])
    assert seen == ["from.env-var"]


@pytest.mark.parametrize("token", ["…", "abc def", "tok\u00e9n"])
def test_main_rejects_a_token_with_invalid_characters_before_any_request(tmp_path, monkeypatch, capsys, token):
    monkeypatch.setenv("TMDB_TOKEN", token)
    monkeypatch.setattr(fha, "tmdb_getter", lambda t: pytest.fail("no request with a malformed token"))
    out = tmp_path / "hero_art.json"
    assert fha.main(["--catalog", _catalog(tmp_path), "--output", str(out), "--misses", str(tmp_path / "misses.json"), "--env-file", str(tmp_path / "missing.env")]) == 1
    assert not out.exists()
    assert "invalid characters" in capsys.readouterr().err


def test_build_index_logs_every_title_as_it_goes():
    titles = [
        {"key": "a", "name": "A", "year": None, "kind": "movie"},
        {"key": "b", "name": "B", "year": None, "kind": "movie"},
        {"key": "c", "name": "C", "year": None, "kind": "movie"},
        {"key": "d", "name": "D", "year": None, "kind": "movie"},
    ]

    def get(path, params):
        if params.get("query") == "C":
            raise OSError("timed out")
        return {"results": [{"id": 5, "title": "A", "backdrop_path": "/a.jpg"}]}

    lines = []
    fha.build_index(titles, get, {"pin": {}, "block": ["d"]}, log=lines.append)
    assert lines == [
        "Matching 3 titles against TMDB (one request each; 0 settled by earlier runs)…",
        "[1/3] a  A  →  movie/5",
        "[2/3] b  B  →  unmatched",
        "[3/3] c  C  →  error: timed out",
    ]


def test_main_announces_the_run_before_the_first_request(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("TMDB_TOKEN", "t")
    monkeypatch.setattr(fha, "tmdb_getter", lambda token: lambda path, params: {"results": []})
    fha.main(["--catalog", _catalog(tmp_path), "--output", str(tmp_path / "o.json"), "--overrides", str(tmp_path / "none.json"), "--misses", str(tmp_path / "misses.json")])
    err = capsys.readouterr().err
    assert err.startswith("Matching 2 titles against TMDB")
    assert "[1/2] 10  Toy Story  →  unmatched" in err


def test_build_index_only_searches_titles_not_settled_by_an_earlier_run():
    titles = [
        {"key": "new", "name": "New", "year": None, "kind": "movie"},
        {"key": "hit", "name": "Hit", "year": None, "kind": "movie"},
        {"key": "miss", "name": "Miss", "year": None, "kind": "movie"},
        {"key": "flaky", "name": "Flaky", "year": None, "kind": "movie"},
    ]
    done = {"hit": {"tmdb": "movie/1", "backdrop": "/hit.jpg"}, "gone": {"tmdb": "movie/9", "backdrop": "/gone.jpg"}}
    get = _fake_get({("/search/movie", "New"): {"results": [{"id": 2, "title": "New", "backdrop_path": "/new.jpg"}]}})

    def flaky_get(path, params):
        if params.get("query") == "Flaky":
            raise OSError("timed out")
        return get(path, params)

    items, misses, report = fha.build_index(titles, flaky_get, {"pin": {}, "block": []}, done, ["miss", "gone2"])
    assert [params["query"] for _, params in get.calls] == ["New"]  # hit/miss not asked again
    assert items == {"new": {"tmdb": "movie/2", "backdrop": "/new.jpg"}, "hit": done["hit"]}  # "gone" left the catalog
    assert misses == {"miss"}  # a request error is retried next run, not recorded as a miss
    assert report["searched"] == 2 and report["kept"] == 2


def test_build_index_records_a_clean_no_match_as_a_miss():
    titles = [{"key": "zz", "name": "Nada", "year": None, "kind": "movie"}]
    _, misses, _ = fha.build_index(titles, _fake_get({("/search/movie", "Nada"): {"results": []}}), {"pin": {}, "block": []})
    assert misses == {"zz"}


def test_build_index_re_searches_a_changed_pin_and_drops_a_blocked_title():
    titles = [
        {"key": "p", "name": "P", "year": None, "kind": "show"},
        {"key": "b", "name": "B", "year": None, "kind": "movie"},
    ]
    done = {"p": {"tmdb": "tv/1", "backdrop": "/old.jpg"}, "b": {"tmdb": "movie/3", "backdrop": "/b.jpg"}}
    get = _fake_get({("/tv/2", None): {"id": 2, "backdrop_path": "/new.jpg"}})
    items, _, _ = fha.build_index(titles, get, {"pin": {"p": "tv/2"}, "block": ["b"]}, done)
    assert items == {"p": {"tmdb": "tv/2", "backdrop": "/new.jpg"}}
    # Pin unchanged: settled, not asked again.
    get = _fake_get({("/search/movie", "B"): {"results": []}})
    fha.build_index(titles, get, {"pin": {"p": "tv/2"}, "block": []}, items)
    assert [path for path, _ in get.calls] == ["/search/movie"]  # only "b", unblocked and unknown


def _run(tmp_path, monkeypatch, get, *extra):
    monkeypatch.setenv("TMDB_TOKEN", "t")
    monkeypatch.setattr(fha, "tmdb_getter", lambda token: get)
    return fha.main(["--catalog", _catalog(tmp_path), "--output", str(tmp_path / "o.json"),
                     "--overrides", str(tmp_path / "none.json"), "--misses", str(tmp_path / "misses.json"), *extra])


def test_main_second_run_asks_nothing_and_all_asks_everything(tmp_path, monkeypatch):
    responses = {("/search/movie", "Toy Story"): {"results": [{"id": 862, "title": "Toy Story", "backdrop_path": "/toy.jpg"}]},
                 ("/search/movie", "Cars"): {"results": []}}
    first = _fake_get(responses)
    assert _run(tmp_path, monkeypatch, first) == 0
    assert len(first.calls) == 2
    assert json.loads((tmp_path / "misses.json").read_text(encoding="utf-8")) == ["11"]
    again = _fake_get(responses)
    assert _run(tmp_path, monkeypatch, again) == 0
    assert again.calls == []
    assert json.loads((tmp_path / "o.json").read_text(encoding="utf-8"))["items"] == {"10": {"tmdb": "movie/862", "backdrop": "/toy.jpg"}}
    everything = _fake_get(responses)
    assert _run(tmp_path, monkeypatch, everything, "--all") == 0
    assert len(everything.calls) == 2
