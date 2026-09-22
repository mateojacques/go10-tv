# Episode Chapters for Season-Pack Videos — Design

**Date:** 2026-09-22
**Status:** Approved, ready for implementation planning

## Purpose

The MVP design explicitly left "real episode-level splitting of the season
videos" out of scope, and the episodic-series ingestion pipeline only solves
it for shows whose *source* already provides individual episode uploads
(Spidey, Las Mascotas Maravilla). It does nothing for the other 131 season
rows: single ok.ru videos, each several hours long, concatenating an entire
season's episodes back to back with no in-app way to jump to a specific one.

This change adds a way to split a specific season-pack video into navigable,
individually-playable chapters *without* a new source video — by detecting
episode boundaries inside the existing file and teaching the player to treat
them as seek points rather than requiring a second upload. It is a per-title,
opt-in process: a season-pack row is unaffected until someone deliberately
runs the new chapter-detection tooling against it and commits the result.

## Scope

**In scope:**

- `data/chapters/<series_id>.json`, a per-series sidecar listing each
  detected episode's boundary inside its season-pack video(s).
- `scripts/detect_chapters.py`, a CLI tool that downloads a season-pack video
  with `yt-dlp` and proposes chapter boundaries with `ffmpeg` silence/black-
  frame detection, for manual review before being committed.
- Extending `scripts/parse_catalog.py` to explode a `season` row into
  multiple `episode` rows when a matching chapters file exists.
- Two new `catalog.csv` columns: `chapter_start_seconds`, `chapter_end_seconds`.
- `Player.tsx` changes: detecting "episode ended" at an in-file chapter
  boundary (not just ok.ru's real `ended` event), and seeking within the
  existing iframe instead of reloading it when moving between chapters of the
  same video.
- `progressStore` changes: a composite progress key for chaptered rows so
  multiple chapters of one video track watch progress independently.

**Explicitly out of scope:**

- Automatically splitting every season-pack row. This is a manual, opt-in
  tool run per title — nothing changes for a row until its chapters file
  exists.
- A custom review UI for adjusting detected boundaries. Review happens by
  scrubbing the locally downloaded file in an existing video player (mpv/VLC)
  and hand-editing the JSON; see [Open Decisions](#open-decisions-deliberately-made).
- Re-encoding, trimming, or otherwise producing new video files. The source
  video is never modified — only played back with a different start/end
  window.
- Episode-level synopses, titles beyond what's inferable, or thumbnails per
  chapter — chapters reuse the parent video's thumbnail, same as any other
  episode row today.
- Chaptering movies or already-episodic rows (`type == 'movie'` or an
  existing `type == 'episode'` row) — this only applies to `type == 'season'`
  rows.

## Architecture

```
data/chapters/<series_id>.json ──┐
catalog.csv (season rows) ───────┼── scripts/parse_catalog.py ──> public/data/catalog.csv
data/genres.csv ──────────────────┘                                (season row exploded
                                                                      into episode rows)

ok.ru video ── yt-dlp ──> local .mp4 (gitignored, scratch) ── ffmpeg ── scripts/detect_chapters.py
                                                                              │
                                                                              v
                                                        draft data/chapters/<series_id>.json
                                                          (reviewed by hand against the same
                                                           local file in mpv/VLC, then committed)
```

`parse_catalog.py` gains a third pass, alongside the base scrape and the
episodic-series sidecars: for every `season`-type row it emits, check whether
`data/chapters/<series_id>.json` has an entry naming that row's `video_id`.
If so, emit one `episode` row per chapter instead of the one `season` row;
otherwise the row is emitted unchanged, exactly as today.

### Component boundaries (additions only)

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `scripts/detect_chapters.py` | Download a season-pack video, propose chapter boundaries via silence/black-frame detection, write a draft sidecar | `yt-dlp`, `ffmpeg`, the row's `video_url` |
| `data/chapters/<series_id>.json` | Reviewed, committed chapter boundaries per season-pack video | hand-reviewed, versioned |
| chapters pass in `parse_catalog.py` | For each `season` row with a matching sidecar entry: emit one `episode` row per chapter, carrying `chapter_start_seconds`/`chapter_end_seconds` | existing row-emission helpers |
| `Player.tsx` (extended) | Detect in-file chapter end via `timeupdate`; seek (not reload) between same-video chapters | `chapter_start_seconds`/`chapter_end_seconds`, existing postMessage handling |
| `progressStore` (extended) | Composite key (`video_id:episode_number`) for chaptered rows | `writeProgress`/`readProgress` callers passing the right key |

## Data Design

### `data/chapters/<series_id>.json`

```json
{
  "15692556471022": [
    { "episode_number": 1, "title": "Episodio 1", "start_seconds": 0, "end_seconds": 1435 },
    { "episode_number": 2, "title": "Episodio 2", "start_seconds": 1435, "end_seconds": 2810 },
    { "episode_number": 3, "title": "Episodio 3", "start_seconds": 2810, "end_seconds": null }
  ]
}
```

Keyed by `video_id` (a series with multiple season-pack videos — one per
season — has one entry per video in the same file). Each chapter's
`start_seconds` is the next chapter's `end_seconds`, except intentionally:
they're stored on both sides rather than derived, because a real cut
(fade-to-black, title card) has a short dead zone that isn't split evenly
between the two neighbors — the detection tool proposes both ends of that
gap independently. The final chapter's `end_seconds` is `null`: it plays out
to the real ok.ru `ended` event like any unchaptered video does today.

`episode_number` follows the same non-contiguous-is-fine philosophy as the
episodic-series pipeline: whatever the reviewer confirms, in order, starting
wherever the season's existing episode/season data implies (usually 1 unless
mid-season numbering is already known).

### `catalog.csv` schema change

Two columns added, inserted after `episode_number`:
`chapter_start_seconds`, `chapter_end_seconds` (both int seconds, empty for
every row type except a chaptered `episode` row). An exploded chapter row is
otherwise a normal `episode` row: `series_id`/`series_title`/`season_number`
match the parent season row, `video_id`/`embed_url`/`video_url`/`thumbnail`
are copied unchanged from it (all chapters of one video share one
`video_id`), and `duration_seconds` becomes `end_seconds - start_seconds`
(or the parent's remaining duration for the final, open-ended chapter) so
existing duration-driven UI (progress bars, run-time labels) is correct per
chapter rather than showing the whole season's length.

Because chapter rows share a `video_id`, `video_id` is no longer guaranteed
unique per row in `catalog.csv` once any title is chaptered — existing code
that assumes row-per-`video_id` uniqueness needs auditing during
implementation (see [Risks](#risks)).

## Player Design

Two additive changes to `Player.tsx`'s existing postMessage handling — no
change to the embed itself, the retry/backoff state machine, or fullscreen
handling.

**In-file chapter end detection.** The `timeupdate` handler already updates
`positionRef` on every event; it now also compares `data.time` against
`row.chapter_end_seconds` when present. Crossing it triggers the same path
the real `ended` postMessage event triggers today (`markWatched` +
`onEnded()`), so autoplay-to-next-episode and "watched" state work
identically whether the boundary is a real end-of-file or an in-file cut.
Detection happens against the *reported* playhead the same way the real
`ended` event already does (via `positionRef` snapshotting `timeupdate`
data) — no separate polling loop.

**Seek instead of reload within one video.** `onNext`/`onPrev` today always
remount the iframe (`row` changes → new `embed_url` → new `key`). Before
remounting, Player checks whether the target row's `video_id` matches the
currently loaded one: if so, it posts `{action: 'seek', time:
targetRow.chapter_start_seconds}` to the existing iframe via `postMessage`
(the same command channel already documented for play/pause/seek) instead of
changing `embedSrc`. `positionRef`/`videoIdRef` update to the new row so
subsequent progress saves and end-detection use the new chapter's bounds. A
transition that *does* cross videos (last chapter of one season-pack video →
first chapter of the next) reloads the iframe exactly as any other episode
transition does today — this only short-circuits when the video is
literally the same file.

**Resume position.** `fromTime` computation gains one branch: for a chapter
row with no existing progress, it starts at `chapter_start_seconds` rather
than 0 (a chapter's "beginning" isn't the file's beginning). Resuming
existing progress is unchanged — `resumeFromTime` already returns an
absolute in-file position, which happens to already be within the chapter's
bounds since progress was written while playing it.

## Progress Tracking Design

`progressStore` is keyed by `video_id`, which stops being a 1:1 stand-in for
"the watchable thing" once multiple chapters share one `video_id`. The key
passed to `readProgress`/`writeProgress`/`markWatched` becomes:

- `video_id` alone — unchanged — for any row without `episode_number`
  scoped to a chapter (movies, season rows, and non-chaptered episode rows,
  i.e. everything today).
- `` `${video_id}:${episode_number}` `` for a chaptered episode row.

This is computed once, where `Player` already has `row`, and passed as the
`videoId` argument these functions already take — no change to
`progressStore`'s own signatures or storage format. Because there's no
backend, this is a pure key-shape change with no migration: existing
whole-video progress entries for a title that later gets chaptered simply
become orphaned (harmless — `localStorage` isn't cleaned of stale keys today
either) rather than needing to be split retroactively.

## Chapter Detection Tooling Design

`scripts/detect_chapters.py <video_id>`:

1. Downloads the video via `yt-dlp` into a gitignored scratch directory
   (matching the existing throwaway-dump convention for `<slug>_files/`).
2. Runs `ffmpeg -af silencedetect` and `-vf blackdetect` over it and merges
   nearby silence+black-frame hits into candidate cut points.
3. Prints each candidate as an `mm:ss` timestamp, the resulting segment
   duration, and — when the row's title/episode data implies an expected
   episode count — a mismatch warning if the candidate count doesn't match.
4. Writes a draft entry into `data/chapters/<series_id>.json` pre-filled
   with the candidates.

Review is manual: open the same locally downloaded file in mpv or VLC,
scrub to each candidate, nudge any timestamp that's off (a false split from
a mid-episode silent beat, or a missed cut with an unusual transition), and
hand-edit the draft JSON to the confirmed values. No in-app or custom
scrubber tool is built for this — see [Open Decisions](#open-decisions-deliberately-made).
Once the file is finalized, re-running `parse_catalog.py` picks it up like
any other sidecar.

The downloaded video file itself is never committed — same disposability
rule as `<slug>_files/`.

## Testing Strategy

**Parser** (`tests/`):

- Chapters pass, given a `data/chapters/<slug>.json` fixture with 3 chapters
  for one `video_id`: the season row is replaced by exactly 3 `episode`
  rows, `chapter_start_seconds`/`chapter_end_seconds` match the fixture,
  `duration_seconds` is computed correctly per chapter (including the
  open-ended final chapter using the parent's total duration), and
  `series_id`/`season_number`/`video_id`/`embed_url` are copied from the
  parent row unchanged.
- Regression: a `season` row with no matching chapters entry is emitted
  unchanged — existing parser tests for row counts stay green.

**UI** (`npm test`):

- `Player`: given two rows sharing a `video_id` with different
  `chapter_start_seconds`/`chapter_end_seconds`, calling `onNext` posts a
  `seek` command rather than changing the iframe `src`; a `timeupdate` event
  crossing `chapter_end_seconds` triggers `markWatched`/`onEnded` the same
  way a real `ended` event does.
- `progressStore`: writing/reading progress with a composite
  `video_id:episode_number` key round-trips correctly and doesn't collide
  with a bare-`video_id` entry for the same video.
- `Detail`/`groupSeasons`/`nextEpisode`: no new tests expected — these
  already handle multi-row seasons correctly per the episodic-series design,
  and a chaptered row is just another `episode`-typed row to them.

**Manual verification:** chapter one season-pack title end to end — run
`detect_chapters.py`, review against mpv, commit the sidecar, rebuild the
catalog, then in the app: open the season, confirm it now lists individual
episodes, play episode 2, confirm it starts at its chapter boundary (not 0),
let it run to its end boundary and confirm autoplay advances to episode 3
without an iframe reload flash, and confirm "Seguir viendo"/resume tracks
episode 2 and episode 3 independently.

## Risks

| Risk | Mitigation |
| --- | --- |
| Detection false-positives/negatives on shows without a clean fade-to-black between episodes (cold opens, no bumper) | Detection is explicitly a *draft*; every chapters file is manually reviewed against the real file before commit — never auto-committed |
| `video_id` uniqueness assumption breaks elsewhere in the codebase (e.g. React list keys, dedup logic, catalog lookups by `video_id` alone) | Audit call sites during implementation; anywhere a unique row key is needed, use `video_id` + `episode_number` (already the natural key for episodic-series rows with gaps) |
| Downloading full videos via `yt-dlp` is slow/heavy for long season-packs | Acceptable for a one-time, per-title, manual tool — not run in CI or automatically; scratch files are deleted after review |
| A chapter's real audio/video cut doesn't align with the detected silence/black frame (e.g. a hard cut with no transition) | Reviewer nudges the timestamp by hand against the actual video in mpv; the tool's candidates are a starting point, not the final value |

## Open Decisions Deliberately Made

- No custom review UI is built. mpv/VLC already solve fast scrubbing and
  frame-stepping better than a bespoke tool would for what's an occasional,
  low-volume task; revisit only if chaptering many titles makes this
  genuinely tedious.
- Chapter rows live in the same `catalog.csv` schema as every other row
  (two new optional columns), not a separate table — consistent with how
  the episodic-series design extended the schema rather than forking it.
- Chapter boundaries are stored as both a `start_seconds` and the previous
  chapter's `end_seconds` independently, not derived from one shared cut
  point — real transitions have a short dead zone, and forcing them to meet
  at one point would either clip the end of one episode or the start of the
  next.
- Same-video chapter transitions seek via postMessage instead of reloading
  the iframe; cross-video transitions keep reloading. This is the only
  behavioral change to episode navigation for non-chaptered content, and it
  only ever activates when two neighboring rows already share a `video_id`
  — never today, since only this feature introduces that possibility.
