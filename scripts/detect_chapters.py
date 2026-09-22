"""Propose episode-boundary timestamps inside a season-pack ok.ru video.

Run: python3 scripts/detect_chapters.py <video_id> [--episodes N]

Downloads the video with yt-dlp, runs ffmpeg silence/black-frame detection,
and writes a *draft* data/chapters/<series_id>.json. Review the candidates
against the downloaded file (printed at the end) in mpv/VLC and hand-edit
the draft before committing it -- detection is a starting point, not the
final answer.
"""
import argparse
import csv
import glob
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUTPUT_CSV = os.path.join(ROOT, "public", "data", "catalog.csv")
CHAPTERS_DIR = os.path.join(ROOT, "data", "chapters")

SILENCE_START_RE = re.compile(r"silence_start:\s*([\d.]+)")
SILENCE_END_RE = re.compile(r"silence_end:\s*([\d.]+)")
BLACK_RE = re.compile(r"black_start:([\d.]+)\s+black_end:([\d.]+)")


def parse_silencedetect(output):
    """Pair each silence_start with its silence_end, in emitted order.

    A trailing silence_start with no matching silence_end (still silent at
    EOF) is dropped by zip() truncating to the shorter list -- there's no
    boundary to propose for it.
    """
    starts = [float(m.group(1)) for m in SILENCE_START_RE.finditer(output)]
    ends = [float(m.group(1)) for m in SILENCE_END_RE.finditer(output)]
    return list(zip(starts, ends))


def parse_blackdetect(output):
    return [(float(m.group(1)), float(m.group(2))) for m in BLACK_RE.finditer(output)]


def merge_candidates(silences, blacks, merge_window=1.5):
    """Collapse each (start, end) interval to its midpoint, then merge
    midpoints within `merge_window` seconds of each other -- a real
    transition often trips both silence and black-frame detection at
    nearly the same instant.
    """
    midpoints = sorted((start + end) / 2 for start, end in [*silences, *blacks])
    merged = []
    for point in midpoints:
        if merged and point - merged[-1] <= merge_window:
            continue
        merged.append(point)
    return merged


def build_draft_chapters(candidates, total_duration, expected_count=None):
    """Bracket ordered cut-point candidates into a draft chapter list.

    Each candidate becomes both the previous chapter's `end_seconds` and
    the next chapter's `start_seconds` -- review should nudge these apart
    to bracket the real transition's dead zone, per the chapters file
    convention (see the design spec).
    """
    bounds = [0, *candidates, total_duration]
    chapters = []
    for number, (start, end) in enumerate(zip(bounds, bounds[1:]), start=1):
        chapters.append({
            "episode_number": number,
            "title": f"Episodio {number}",
            "start_seconds": round(start),
            "end_seconds": None if end == total_duration else round(end),
        })
    if expected_count is not None and len(chapters) != expected_count:
        print(f"warning: detected {len(chapters)} candidate chapters, expected {expected_count}")
    return chapters


def format_timestamp(seconds):
    seconds = int(seconds)
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def find_row(csv_path, video_id):
    with open(csv_path, encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["video_id"] == video_id:
                return row
    return None


def write_chapters_file(chapters_dir, series_id, video_id, chapters):
    """Merge `chapters` under `video_id` into data/chapters/<series_id>.json,
    preserving any other video_id entries already there (a series with one
    season-pack video per season has one entry per video in the same file).
    """
    os.makedirs(chapters_dir, exist_ok=True)
    path = os.path.join(chapters_dir, f"{series_id}.json")
    existing = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            existing = json.load(handle)
    existing[video_id] = chapters
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(existing, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return path


def download_video(video_url, dest_dir):
    subprocess.run(
        ["yt-dlp", "-o", os.path.join(dest_dir, "%(id)s.%(ext)s"), video_url],
        check=True,
    )
    matches = glob.glob(os.path.join(dest_dir, "*"))
    if not matches:
        raise RuntimeError(f"yt-dlp produced no file for {video_url}")
    return matches[0]


def probe_duration(video_path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video_path],
        check=True, capture_output=True, text=True,
    )
    return float(result.stdout.strip())


def run_silencedetect(video_path, noise_db=-30, min_duration=1.0):
    result = subprocess.run(
        ["ffmpeg", "-i", video_path, "-af",
         f"silencedetect=noise={noise_db}dB:d={min_duration}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    return result.stderr


def run_blackdetect(video_path, min_duration=0.5):
    result = subprocess.run(
        ["ffmpeg", "-i", video_path, "-vf",
         f"blackdetect=d={min_duration}:pic_th=0.98", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    return result.stderr


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video_id")
    parser.add_argument("--episodes", type=int, default=None,
                         help="expected episode count, for a sanity-check warning")
    args = parser.parse_args()

    row = find_row(OUTPUT_CSV, args.video_id)
    if not row:
        sys.exit(f"video_id {args.video_id!r} not found in {OUTPUT_CSV}")
    if row["type"] != "season":
        sys.exit(f"video_id {args.video_id!r} is type={row['type']!r}, not a season-pack row")
    if not row["series_id"]:
        sys.exit(f"video_id {args.video_id!r} has no series_id")

    scratch_dir = tempfile.mkdtemp(prefix="go10-chapters-")
    print(f"downloading into {scratch_dir} ...")
    video_path = download_video(row["video_url"], scratch_dir)

    print("probing duration...")
    duration = probe_duration(video_path)

    print("running silence/black-frame detection (this scans the whole file)...")
    silences = parse_silencedetect(run_silencedetect(video_path))
    blacks = parse_blackdetect(run_blackdetect(video_path))
    candidates = merge_candidates(silences, blacks)
    chapters = build_draft_chapters(candidates, duration, args.episodes)

    chapters_path = write_chapters_file(CHAPTERS_DIR, row["series_id"], args.video_id, chapters)

    print(f"\n{len(chapters)} candidate chapters:")
    for chapter in chapters:
        print(f"  {chapter['episode_number']:>3}  {format_timestamp(chapter['start_seconds'])}")
    print(f"\nwrote draft {chapters_path}")
    print(f"review against the downloaded file before committing: {video_path}")


if __name__ == "__main__":
    sys.exit(main())
