# Watch progress and resume — design

Status: **implemented** (2026-09-22).

## Problem

Viewers couldn't pick up where they left off. The only "resume" in the app
was crash recovery (player-reliability spec §3): a wall-clock guess of the
position, deleted as soon as the player closed. Reopening a video later
always started at 0, and nothing showed what had been watched.

Goal: track per-video progress in the browser and resume from it, with a
"Seguir viendo" row on Home and progress on Detail. No backend — this is
`localStorage` only, per browser.

## What made it possible

The player-reliability spec assumed ok.ru's `/videoembed/` iframe had no
cross-origin API. That turned out to be wrong. Confirmed live on
2026-09-22 (a diagnostic listener, then a throwaway test page, watching
real playback):

- **Outbound events.** The iframe `postMessage`s playback events to the
  parent window from origin `https://ok.ru`:
  `inited`, `autoplay`, `started {time, duration}`,
  `timeupdate {time, duration}`, `paused`, `resumed`,
  `rewound {time, previousTime}`, `ended {time}`, `volumechange`, `mute`.
  `time` and `duration` are seconds.
- **`fromTime` works on `/videoembed/`.** `?fromTime=120` loads the player
  config with `flashvars.fromTime: "120"` and playback `started` at 120s.
- **Inbound commands** (read from ok.ru's `OK/VideoEmbed` module, then
  confirmed): the iframe accepts `postMessage({action})` with `play`,
  `pause`, `stop`, `volume` (`value`), `mute`, `unmute` and
  `seek` (`time`, **seconds**; out-of-range clamps to the end and fires
  `ended`). It does not check the sender's origin. The app doesn't use
  these yet — `fromTime` is enough for resume — but they're available.

None of this is officially documented by ok.ru; it's observed behavior and
could change.

## Design

### Progress store — `src/progress/progressStore.ts`

One `localStorage` entry per video:

```
key:   go10:progress:<videoId>
value: { time: number, duration: number, updatedAt: number, watched: boolean }
```

- `writeProgress(videoId, {time, duration})` stamps `updatedAt` and derives
  `watched`. Positions under `MIN_START_SECONDS` (10s) are ignored, so
  opening a video by accident doesn't start it, and a later near-zero
  position doesn't wipe an existing one.
- **Watched** = within the last 60s of a video of 10 min or more, or past
  95% of a shorter one (`isWatchedAt`), or `markWatched` on `ended`. A
  rewatch that's back in progress is un-watched again.
- `resumeFromTime(progress)` → saved time minus a 3s rewind, or `null`
  (start at 0) for missing or watched entries.
- `listProgress()` scans keys with the `go10:progress:` prefix.
- Every storage call is wrapped in try/catch; malformed entries read as
  absent. With storage unavailable the feature quietly switches off.

This replaced `src/screens/resume.ts` (the wall-clock `go10:resume:*`
entries). Crash/freeze recovery is covered by the same store: a manual "R"
reload or full-page refresh resumes from the last saved position.

### Player — `src/screens/Player.tsx`

- The existing `message` listener (origin + `event.source` checked) keeps
  the latest `timeupdate` position in a ref and saves it at most every 5s,
  immediately on `paused`, and on close / video change. `ended` marks the
  video watched before firing `onEnded` (autoplay-next).
- `fromTime` is computed with `useMemo` keyed on `video_id` and the reload
  token — **never per render**. Saving during playback would otherwise
  change the iframe `src` and restart the video every few seconds. Before
  computing it, the latest unsaved position is flushed so a reload resumes
  from exactly where it was.

### What a title resumes to — `src/progress/titleProgress.ts`

`titleProgress(title, entries)` picks the row "play" should open, going by
the most recently updated entry among the title's rows (`title.seasons`,
ordered season → episode):

| Latest entry | Result |
| --- | --- |
| none | `start` — first row |
| not watched | `resume` — that row |
| watched, next row partly watched | `resume` — the next row |
| watched, next row exists | `next` — the next row, from 0 |
| watched, no next row | `start` — first row |

`continueWatching(titles, entries)` = titles not in `start` mode, most
recent first.

### UI

- **Home**: a "Seguir viendo" row, first, only when non-empty (capped at
  `ROW_LIMIT`). Cards show a progress bar and "T1 · E4 · Quedan 8 min" (or
  "Siguiente: T1 · E5") in place of year/genre. Selecting one **plays
  directly**; Back from the player lands on Detail.
- **Detail**: opens on the title's resume target. The primary button reads
  "Reanudar" with the time left and a progress bar when resuming. Episode
  and single-video season tiles show a progress bar and "Visto" once
  finished. Progress is re-read on every render, so it's current after
  closing the player.
- `src/components/ProgressBar.tsx`: thin accent bar, renders nothing at 0.

## Out of scope

- Sync across devices/browsers (needs a backend).
- Removing a title from "Seguir viendo", or marking watched/unwatched by
  hand.
- Using the inbound `seek`/`play`/`pause` commands.

## Testing

- `progressStore.test.ts`: round-trip, min-start, watched thresholds,
  malformed data, throwing storage, listing.
- `titleProgress.test.ts`: every row of the table above, recency ordering,
  played fraction.
- `Player.test.tsx`: throttled saves, flush on pause/close, `fromTime` on
  open and on "R", watched on `ended`, iframe `src` stable during saves,
  progress attributed to the right video when switching episodes.
- `App.test.tsx`: "Seguir viendo" appears and plays at the saved spot,
  "Siguiente" after a finished episode, "Reanudar" on Detail, no row
  without progress.
- Manual: confirmed `fromTime` and the event stream against real ok.ru
  playback; visual layout of the bars checked by hand.
