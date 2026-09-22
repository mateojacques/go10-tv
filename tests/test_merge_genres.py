import csv
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from merge_genres import load_batches

FIELDNAMES = ["video_id", "title", "genre", "genre_secondary"]


def _write_batch(path, rows):
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def test_load_batches_merges_disjoint_batches(tmp_path):
    _write_batch(tmp_path / "batch-01.csv", [
        {"video_id": "1", "title": "A", "genre": "Drama", "genre_secondary": ""},
    ])
    _write_batch(tmp_path / "batch-02.csv", [
        {"video_id": "2", "title": "B", "genre": "Comedia", "genre_secondary": ""},
    ])

    merged = load_batches(str(tmp_path / "batch-*.csv"))

    assert set(merged) == {"1", "2"}
    assert merged["1"]["genre"] == "Drama"
    assert merged["2"]["genre"] == "Comedia"


def test_load_batches_raises_on_duplicate_video_id(tmp_path):
    _write_batch(tmp_path / "batch-01.csv", [
        {"video_id": "1", "title": "A", "genre": "Drama", "genre_secondary": ""},
    ])
    _write_batch(tmp_path / "batch-02.csv", [
        {"video_id": "1", "title": "A", "genre": "Comedia", "genre_secondary": ""},
    ])

    try:
        load_batches(str(tmp_path / "batch-*.csv"))
        assert False, "expected ValueError for duplicate video_id across batches"
    except ValueError as exc:
        assert "1" in str(exc)
