import csv, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from parse_catalog import extract_cards

ROOT = os.path.join(os.path.dirname(__file__), "..")
GENRES = os.path.join(ROOT, "data", "genres.csv")

VOCABULARY = {
    "Animación", "Anime", "Acción", "Aventura", "Comedia", "Drama", "Terror",
    "Ciencia Ficción", "Fantasía", "Infantil", "Superhéroes", "Documental",
    "Clásicos",
}


def load_genres():
    with open(GENRES, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def corpus_ids():
    html_text = open(os.path.join(ROOT, "catalogo-solo-videos.html"), encoding="utf-8").read()
    return {c["video_id"] for c in extract_cards(html_text)}


def test_every_video_has_exactly_one_genre_row():
    rows = load_genres()
    ids = [r["video_id"] for r in rows]
    assert len(rows) == 907
    assert len(set(ids)) == 907, "duplicate video_id in genres.csv"
    assert set(ids) == corpus_ids()


def test_columns_are_exact():
    with open(GENRES, encoding="utf-8", newline="") as handle:
        assert csv.DictReader(handle).fieldnames == [
            "video_id", "title", "genre", "genre_secondary",
        ]


def test_genres_are_vocabulary_or_unclassified():
    """Task 3a may leave UNCLASSIFIED; Task 3b must eliminate it."""
    for row in load_genres():
        assert row["genre"] in VOCABULARY | {"UNCLASSIFIED"}, row
        assert row["genre_secondary"] in VOCABULARY or row["genre_secondary"] == "", row


def test_secondary_never_duplicates_primary():
    for row in load_genres():
        if row["genre_secondary"]:
            assert row["genre_secondary"] != row["genre"], row


def test_seeded_studio_rules_applied():
    """Spot-check that the two trusted heuristics actually fired."""
    rows = {r["video_id"]: r for r in load_genres()}
    seeded = [r for r in rows.values() if r["genre"] != "UNCLASSIFIED"]
    assert len(seeded) >= 50, "studio heuristics should seed at least 50 rows"
    assert {r["genre"] for r in seeded} <= {"Animación", "Superhéroes"}
