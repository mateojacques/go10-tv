"""Seed data/genres.csv, applying only the heuristics that are trustworthy.

Genre is INFERRED, not scraped — the source data has no genre field.

Only studio-based rules are applied here, because only they are reliable:
a Pixar release is animation, a DC release is a superhero title. Rules that
looked tempting but were rejected: `subtitled -> Anime` (conflates Spanish
subtitles with anime; would mislabel live-action foreign film) and
`year < 1970 -> Clásicos` (conflates era with genre). Everything else is left
UNCLASSIFIED for deliberate classification in Task 3b.

Re-running never overwrites an existing row, so manual corrections survive.
"""
import csv
import os

from parse_catalog import ROOT, SOURCE_HTML, extract_cards
from title_parser import parse_title

GENRES_CSV = os.path.join(ROOT, "data", "genres.csv")
FIELDNAMES = ["video_id", "title", "genre", "genre_secondary"]

ANIMATION_STUDIOS = {
    "Disney", "Pixar", "Cartoon N.", "DreamWorks", "Nickelodeon", "Adult Swim",
}
SUPERHERO_STUDIOS = {"DC", "Marvel"}


def guess(parsed):
    """Return (genre, genre_secondary) from trustworthy signals only."""
    studio = parsed["studio"]
    if studio in SUPERHERO_STUDIOS:
        return "Superhéroes", "Acción"
    if studio in ANIMATION_STUDIOS:
        return "Animación", ""
    return "UNCLASSIFIED", ""


def main():
    existing = {}
    if os.path.exists(GENRES_CSV):
        with open(GENRES_CSV, encoding="utf-8", newline="") as handle:
            existing = {r["video_id"]: r for r in csv.DictReader(handle)}

    html_text = open(SOURCE_HTML, encoding="utf-8").read()
    rows = []
    for card in extract_cards(html_text):
        if card["video_id"] in existing:
            rows.append(existing[card["video_id"]])
            continue
        parsed = parse_title(card["title_raw"])
        genre, secondary = guess(parsed)
        rows.append({
            "video_id": card["video_id"],
            "title": parsed["title"],
            "genre": genre,
            "genre_secondary": secondary,
        })

    os.makedirs(os.path.dirname(GENRES_CSV), exist_ok=True)
    with open(GENRES_CSV, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    unclassified = sum(1 for r in rows if r["genre"] == "UNCLASSIFIED")
    print(f"wrote {len(rows)} rows, {unclassified} UNCLASSIFIED")


if __name__ == "__main__":
    main()
