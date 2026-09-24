import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from title_parser import parse_title, parse_seasons, parse_episode_title, slugify


def test_slugify_strips_accents_and_punctuation():
    assert slugify("Hora de Aventura") == "hora-de-aventura"
    assert slugify("Æon Flux") == "on-flux"
    assert slugify("Astérix y Obélix") == "asterix-y-obelix"


def test_movie_with_year_and_quality():
    r = parse_title("Crows Zero (2007) [1080p] [Español]")
    assert r["type"] == "movie"
    assert r["title"] == "Crows Zero"
    assert r["year"] == "2007"
    assert r["quality"] == "1080p"
    assert r["language"] == "Español"
    assert r["subtitled"] is False
    assert r["series_id"] == ""


def test_subtitled_movie():
    r = parse_title("Blue Spring (2001) [1080p] [Sub Español]")
    assert r["subtitled"] is True
    assert r["language"] == "Español"


def test_studio_in_parentheses():
    r = parse_title("Hoppers: Operación castor (Pixar) [4K] [Español]")
    assert r["studio"] == "Pixar"
    assert r["title"] == "Hoppers: Operación castor"


def test_studio_in_brackets():
    r = parse_title("Batman: Knightfall Part 1: Knightfall [DC] [4K] [Español]")
    assert r["studio"] == "DC"
    # a movie whose title contains colons must NOT become a season
    assert r["type"] == "movie"
    assert r["title"] == "Batman: Knightfall Part 1: Knightfall"


def test_season_suffix_format():
    r = parse_title("Hora de Aventura - Temporada 2 (Cartoon N.) [1080p] [Español]")
    assert r["type"] == "season"
    assert r["series_title"] == "Hora de Aventura"
    assert r["series_id"] == "hora-de-aventura"
    assert r["season_number"] == "2"
    assert r["season_label"] == ""
    assert r["studio"] == "Cartoon N."


def test_season_prefix_format():
    r = parse_title("Temporada 1: Invincible [4K] [Español]")
    assert r["type"] == "season"
    assert r["series_title"] == "Invincible"
    assert r["season_number"] == "1"


def test_season_with_arc_label():
    r = parse_title("Dragon Ball - Temporada 5: 22º Torneo de las Artes Marciales [1440p] [Español]")
    assert r["series_title"] == "Dragon Ball"
    assert r["season_number"] == "5"
    assert r["season_label"] == "22º Torneo de las Artes Marciales"


def test_multi_season_pack_uses_lowest_and_labels_span():
    r = parse_title("Spawn - Temporada 1, 2 y 3 (1997) [1080p] [Español]")
    assert r["series_title"] == "Spawn"
    assert r["season_number"] == "1"
    assert r["season_label"] == "Temporadas 1, 2 y 3"


def test_season_with_colon_separator():
    r = parse_title("Astérix y Obélix: Temporada 1 (2025) [1080p] [Español]")
    assert r["type"] == "season"
    assert r["series_title"] == "Astérix y Obélix"
    assert r["season_number"] == "1"


def test_malformed_closing_brace_still_parses_language():
    r = parse_title("El Samurái sin Nombre (2007) [1080p] [Sub Español}")
    assert r["quality"] == "1080p"
    assert r["subtitled"] is True


def test_quality_normalisation():
    assert parse_title("X [4k] [Español]")["quality"] == "4K"
    assert parse_title("X [1080] [Español]")["quality"] == "1080p"
    assert parse_title("X [1080p 60Fps] [Español]")["quality"] == "1080p"


def test_missing_fields_are_empty_not_invented():
    r = parse_title("Æon Flux - Temporada 1 y 2")
    assert r["quality"] == ""
    assert r["language"] == ""
    assert r["year"] == ""
    assert r["season_number"] == "1"


def test_parse_episode_title_extracts_season_and_episode():
    assert parse_episode_title(
        "Spidey y sus Sorprendentes Amigos - Temporada 1 Episodio 2 -"
    ) == (1, 2)


def test_parse_episode_title_ignores_show_name_casing():
    # Same show, inconsistent capitalization across cards; only the numbers
    # are trusted from the title — the show name comes from a sidecar file.
    assert parse_episode_title(
        "Spidey Y Sus Sorprendentes Amigos - Temporada 3 Episodio 17 -"
    ) == (3, 17)


def test_parse_episode_title_handles_no_trailing_dash():
    assert parse_episode_title(
        "Spidey y sus Sorprendentes Amigos - Temporada 2 Episodio 12"
    ) == (2, 12)


def test_parse_episode_title_returns_none_when_no_match():
    assert parse_episode_title("Crows Zero (2007) [1080p] [Español]") is None


def test_parse_episode_title_extracts_season_and_episode_from_sxee_format():
    assert parse_episode_title(
        "068 - Yu-Gi-Oh! GX 2x16 (Duelo de Bienvenida, Parte 2) LAS dub"
    ) == (2, 16)
