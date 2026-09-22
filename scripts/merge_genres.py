"""Merge classified batch files back into data/genres.csv.

Batches are authoritative for the rows they contain; rows absent from every
batch keep their seeded value.
"""
import csv
import glob
import os

from parse_catalog import ROOT

GENRES_CSV = os.path.join(ROOT, "data", "genres.csv")
BATCH_GLOB = os.path.join(ROOT, "data", "genre-batches", "batch-*.csv")
FIELDNAMES = ["video_id", "title", "genre", "genre_secondary"]


def load_batches(pattern=BATCH_GLOB):
    merged = {}
    for path in sorted(glob.glob(pattern)):
        with open(path, encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                if row["video_id"] in merged:
                    raise ValueError(f"{row['video_id']} appears in two batches")
                merged[row["video_id"]] = row
    return merged


def main():
    batches = load_batches()

    with open(GENRES_CSV, encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))

    applied = 0
    for row in rows:
        batch_row = batches.get(row["video_id"])
        if batch_row:
            row["genre"] = batch_row["genre"].strip()
            row["genre_secondary"] = batch_row["genre_secondary"].strip()
            applied += 1

    with open(GENRES_CSV, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    remaining = sum(1 for r in rows if r["genre"] == "UNCLASSIFIED")
    print(f"applied {applied} classified rows, {remaining} still UNCLASSIFIED")


if __name__ == "__main__":
    main()
