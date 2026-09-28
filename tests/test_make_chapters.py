import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from make_chapters import chapters_from_timestamps, equal_chapters, main


def test_equal_chapters_matches_the_28_09_season_packs():
    # Ed, Edd y Eddy T1: 4:53:33 split into 13, as committed in 84f5ded.
    chapters = equal_chapters(17613, 13)
    assert len(chapters) == 13
    assert chapters[0] == {"episode_number": 1, "title": "Episodio 1", "start_seconds": 0, "end_seconds": 1355}
    assert chapters[-1] == {"episode_number": 13, "title": "Episodio 13", "start_seconds": 16258, "end_seconds": None}
    assert all(a["end_seconds"] == b["start_seconds"] for a, b in zip(chapters, chapters[1:]))


def test_chapters_from_timestamps_reads_an_ok_ru_description():
    text = "48 CAPS EN 1. CAPÍTULOS: 00:00:00 - Ep 1 00:19:07 - Ep 2 00:38:53 - Ep 3 SINOPSIS: ..."
    assert chapters_from_timestamps(text) == [
        {"episode_number": 1, "title": "Episodio 1", "start_seconds": 0, "end_seconds": 1147},
        {"episode_number": 2, "title": "Episodio 2", "start_seconds": 1147, "end_seconds": 2333},
        {"episode_number": 3, "title": "Episodio 3", "start_seconds": 2333, "end_seconds": None},
    ]


def test_chapters_from_timestamps_accepts_one_per_line_and_mm_ss():
    text = "0:00 Capítulo 1\n21:40 Capítulo 2\n1:03:05 Capítulo 3\n"
    chapters = chapters_from_timestamps(text)
    assert [c["start_seconds"] for c in chapters] == [0, 1300, 3785]
    assert [c["episode_number"] for c in chapters] == [1, 2, 3]


def test_chapters_from_timestamps_numbers_in_order_when_labels_have_no_number():
    chapters = chapters_from_timestamps("00:00 Intro del show\n10:00 Otra cosa")
    assert [c["episode_number"] for c in chapters] == [1, 2]


def test_chapters_from_timestamps_rejects_out_of_order_times():
    try:
        chapters_from_timestamps("10:00 Ep 1\n05:00 Ep 2")
    except ValueError as error:
        assert "order" in str(error)
    else:
        raise AssertionError("expected ValueError")


def test_main_merges_into_the_series_file(tmp_path, capsys):
    path = tmp_path / "futurama.json"
    path.write_text(json.dumps({"111": []}), encoding="utf-8")
    main(["futurama", "222", "--equal", "2", "--duration", "40:00", "--chapters-dir", str(tmp_path)])
    data = json.loads(path.read_text(encoding="utf-8"))
    assert set(data) == {"111", "222"}
    assert [c["start_seconds"] for c in data["222"]] == [0, 1200]
    assert "2 chapters" in capsys.readouterr().out
