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


def test_seed_genres_main_preserves_hand_edits_and_seeds_new_rows(tmp_path, monkeypatch):
    """Regression test for the never-overwrite guarantee `seed_genres.main()` relies on.

    Writes a temp genres.csv with one row hand-edited away from UNCLASSIFIED
    (as a human classifying for Task 3b would do) and one known corpus id
    deliberately absent, points seed_genres.GENRES_CSV at it, runs main(),
    and asserts: (a) the hand-edited row survives verbatim, both genre and
    genre_secondary; (b) the absent row still gets seeded on this same run.
    """
    import seed_genres

    ids = sorted(corpus_ids())
    hand_edited_id, fresh_id = ids[0], ids[1]
    real_rows = {r["video_id"]: r for r in load_genres()}

    temp_csv = tmp_path / "genres.csv"
    with open(temp_csv, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle, fieldnames=["video_id", "title", "genre", "genre_secondary"]
        )
        writer.writeheader()
        writer.writerow({
            "video_id": hand_edited_id,
            "title": real_rows[hand_edited_id]["title"],
            "genre": "Drama",
            "genre_secondary": "Comedia",
        })
        # fresh_id intentionally omitted: it must be seeded fresh by this run.

    monkeypatch.setattr(seed_genres, "GENRES_CSV", str(temp_csv))
    seed_genres.main()

    with open(temp_csv, encoding="utf-8", newline="") as handle:
        result = {r["video_id"]: r for r in csv.DictReader(handle)}

    assert result[hand_edited_id]["genre"] == "Drama"
    assert result[hand_edited_id]["genre_secondary"] == "Comedia"

    assert fresh_id in result
    assert result[fresh_id]["genre"] in VOCABULARY | {"UNCLASSIFIED"}

    # The real, committed data/genres.csv must be untouched by this test.
    assert load_genres() == list(real_rows.values())
