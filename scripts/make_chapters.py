"""Write a season pack's data/chapters/<series_id>.json entry without
downloading it: from the timestamps its uploader listed, or by dividing its
runtime equally.

Run:
  python3 scripts/make_chapters.py <series_id> <video_id> --timestamps desc.txt
  python3 scripts/make_chapters.py <series_id> <video_id> --timestamps - < desc.txt
  python3 scripts/make_chapters.py <series_id> <video_id> --equal 13 --duration 4:53:33

--timestamps reads text like an ok.ru description ("00:00:00 - Ep 1
00:19:07 - Ep 2 ..."), one timestamp per chapter. --equal splits the
runtime into N same-length chapters -- right when the pack holds N episodes
of one runtime; check the count against the show's real episode list. When
neither fits, scripts/detect_chapters.py proposes cut points from the video
itself. The entry is merged into the series' file, keeping other videos'.
"""
import argparse
import re
import sys

from detect_chapters import CHAPTERS_DIR, write_chapters_file
from parse_catalog import parse_duration

# A timestamp, then its label up to the next timestamp (descriptions often
# run every chapter together on one line).
TIMESTAMP_RE = re.compile(r"(?<![\d:])(\d{1,2}(?::\d{2}){1,2})(?![\d:])")


def chapter(number, start, end):
    return {"episode_number": number, "title": f"Episodio {number}", "start_seconds": start, "end_seconds": end}


def equal_chapters(total_seconds, count):
    bounds = [round(k * total_seconds / count) for k in range(count)]
    return [
        chapter(number, start, bounds[number] if number < count else None)
        for number, start in enumerate(bounds, start=1)
    ]


def chapters_from_timestamps(text):
    """Chapters from every timestamp in `text`, in order. The label's first
    number is the episode number when every label has one and they're all
    distinct; otherwise chapters are numbered 1..N in order.
    """
    matches = list(TIMESTAMP_RE.finditer(text))
    starts = [parse_duration(match.group(1)) for match in matches]
    if not starts:
        raise ValueError("no timestamps found")
    if starts != sorted(starts) or len(set(starts)) != len(starts):
        raise ValueError(f"timestamps are not in increasing order: {[m.group(1) for m in matches]}")

    labels = [
        text[match.end(): matches[index + 1].start() if index + 1 < len(matches) else None]
        for index, match in enumerate(matches)
    ]
    numbers = []
    for label in labels:
        found = re.search(r"\d+", label)
        numbers.append(int(found.group()) if found else None)
    if None in numbers or len(set(numbers)) != len(numbers):
        numbers = list(range(1, len(starts) + 1))

    ends = [*starts[1:], None]
    return [chapter(number, start, end) for number, start, end in zip(numbers, starts, ends)]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("series_id")
    parser.add_argument("video_id")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--timestamps", metavar="FILE", help="text with one timestamp per chapter ('-' for stdin)")
    mode.add_argument("--equal", type=int, metavar="N", help="split the runtime into N equal chapters")
    parser.add_argument("--duration", help="the video's runtime, e.g. 4:53:33 (needed with --equal)")
    parser.add_argument("--chapters-dir", default=CHAPTERS_DIR, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    if args.equal:
        if not args.duration:
            parser.error("--equal needs --duration")
        chapters = equal_chapters(parse_duration(args.duration), args.equal)
    else:
        text = sys.stdin.read() if args.timestamps == "-" else open(args.timestamps, encoding="utf-8").read()
        chapters = chapters_from_timestamps(text)

    path = write_chapters_file(args.chapters_dir, args.series_id, args.video_id, chapters)
    print(f"{len(chapters)} chapters for {args.video_id} -> {path}")
    for entry in chapters:
        print(f"  {entry['episode_number']:>3}  {entry['start_seconds']:>6}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
