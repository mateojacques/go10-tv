import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import detect_chapters


SILENCEDETECT_OUTPUT = """
[silencedetect @ 0x1] silence_start: 1434.2
[silencedetect @ 0x1] silence_end: 1436.8 | silence_duration: 2.6
[silencedetect @ 0x1] silence_start: 2809.0
[silencedetect @ 0x1] silence_end: 2811.4 | silence_duration: 2.4
[silencedetect @ 0x1] silence_start: 4200.0
"""

BLACKDETECT_OUTPUT = """
[blackdetect @ 0x2] black_start:1435.0 black_end:1436.5 black_duration:1.5
"""


def test_parse_silencedetect_pairs_starts_with_ends():
    assert detect_chapters.parse_silencedetect(SILENCEDETECT_OUTPUT) == [
        (1434.2, 1436.8), (2809.0, 2811.4),
    ]


def test_parse_silencedetect_drops_a_trailing_unterminated_silence():
    # The third silence_start above has no matching silence_end (EOF).
    assert len(detect_chapters.parse_silencedetect(SILENCEDETECT_OUTPUT)) == 2


def test_parse_blackdetect_extracts_start_end_pairs():
    assert detect_chapters.parse_blackdetect(BLACKDETECT_OUTPUT) == [(1435.0, 1436.5)]


def test_merge_candidates_collapses_nearby_silence_and_black_hits():
    # silence midpoint 1435.5, black midpoint 1435.75 -> within 1.5s, merge to one
    candidates = detect_chapters.merge_candidates(
        [(1434.2, 1436.8), (2809.0, 2811.4)], [(1435.0, 1436.5)],
    )
    assert len(candidates) == 2
    assert abs(candidates[0] - 1435.6) < 1
    assert abs(candidates[1] - 2810.2) < 1


def test_merge_candidates_keeps_distant_hits_separate():
    candidates = detect_chapters.merge_candidates([(0, 2), (100, 102)], [])
    assert candidates == [1.0, 101.0]


def test_build_draft_chapters_brackets_candidates_into_episodes():
    chapters = detect_chapters.build_draft_chapters([1435, 2810], 4200, expected_count=None)
    assert chapters == [
        {"episode_number": 1, "title": "Episodio 1", "start_seconds": 0, "end_seconds": 1435},
        {"episode_number": 2, "title": "Episodio 2", "start_seconds": 1435, "end_seconds": 2810},
        {"episode_number": 3, "title": "Episodio 3", "start_seconds": 2810, "end_seconds": None},
    ]


def test_build_draft_chapters_warns_on_expected_count_mismatch(capsys):
    detect_chapters.build_draft_chapters([1435], 4200, expected_count=5)
    assert "expected 5" in capsys.readouterr().out


def test_format_timestamp_omits_hours_under_an_hour():
    assert detect_chapters.format_timestamp(125) == "2:05"


def test_format_timestamp_includes_hours_over_an_hour():
    assert detect_chapters.format_timestamp(3725) == "1:02:05"


def test_find_row_returns_the_matching_row(tmp_path):
    csv_path = tmp_path / "catalog.csv"
    csv_path.write_text(
        "video_id,type,series_id\n111,season,hora-de-aventura\n222,movie,\n",
        encoding="utf-8",
    )
    row = detect_chapters.find_row(str(csv_path), "111")
    assert row["series_id"] == "hora-de-aventura"


def test_find_row_returns_none_when_missing(tmp_path):
    csv_path = tmp_path / "catalog.csv"
    csv_path.write_text("video_id,type,series_id\n111,season,x\n", encoding="utf-8")
    assert detect_chapters.find_row(str(csv_path), "999") is None


def test_write_chapters_file_creates_and_merges(tmp_path):
    chapters = [{"episode_number": 1, "title": "E1", "start_seconds": 0, "end_seconds": None}]
    path = detect_chapters.write_chapters_file(str(tmp_path), "hora-de-aventura", "111", chapters)
    assert json.loads(open(path, encoding="utf-8").read()) == {"111": chapters}

    other_chapters = [{"episode_number": 1, "title": "E1", "start_seconds": 0, "end_seconds": None}]
    detect_chapters.write_chapters_file(str(tmp_path), "hora-de-aventura", "222", other_chapters)
    merged = json.loads(open(path, encoding="utf-8").read())
    assert set(merged) == {"111", "222"}
