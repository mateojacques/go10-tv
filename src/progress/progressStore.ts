/**
 * Per-video watch progress, fed by the real playback position ok.ru's embed
 * posts (`timeupdate`) — not a wall-clock estimate. Everything is
 * best-effort: if storage is unavailable, progress simply isn't tracked.
 */

export interface Progress {
  /** Seconds into the video. */
  time: number
  duration: number
  updatedAt: number
  watched: boolean
}

const PREFIX = 'go10:progress:'

/** Below this, opening a video doesn't count as having started it. */
export const MIN_START_SECONDS = 10
/** Resume slightly before where playback stopped, to reorient. */
export const RESUME_REWIND_SECONDS = 3
/** Credits/outros: the tail counted as "watched" on long videos... */
const WATCHED_TAIL_SECONDS = 60
/** ...and the share counted as "watched" on short ones. */
const WATCHED_RATIO = 0.95

export function isWatchedAt(time: number, duration: number): boolean {
  if (!duration) return false
  if (duration >= WATCHED_TAIL_SECONDS * 10) return duration - time <= WATCHED_TAIL_SECONDS
  return time >= duration * WATCHED_RATIO
}

function isProgress(value: unknown): value is Progress {
  const p = value as Progress | null
  return (
    typeof p?.time === 'number' &&
    typeof p.duration === 'number' &&
    typeof p.updatedAt === 'number' &&
    typeof p.watched === 'boolean'
  )
}

function parse(raw: string | null): Progress | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return isProgress(value) ? value : null
  } catch {
    return null
  }
}

function save(videoId: string, progress: Progress): void {
  try {
    localStorage.setItem(PREFIX + videoId, JSON.stringify(progress))
  } catch {
    // ignore — private mode, quota exceeded, or storage disabled
  }
}

export function readProgress(videoId: string): Progress | null {
  try {
    return parse(localStorage.getItem(PREFIX + videoId))
  } catch {
    return null
  }
}

export function writeProgress(
  videoId: string,
  { time, duration }: { time: number; duration: number },
  now: number = Date.now(),
): void {
  if (time < MIN_START_SECONDS) return
  save(videoId, { time, duration, updatedAt: now, watched: isWatchedAt(time, duration) })
}

export function markWatched(videoId: string, duration: number, now: number = Date.now()): void {
  save(videoId, { time: duration, duration, updatedAt: now, watched: true })
}

export function listProgress(): Record<string, Progress> {
  const entries: Record<string, Progress> = {}
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(PREFIX)) continue
      const progress = parse(localStorage.getItem(key))
      if (progress) entries[key.slice(PREFIX.length)] = progress
    }
  } catch {
    // ignore
  }
  return entries
}

/** The `fromTime` to open a video at, or null to start from the beginning. */
export function resumeFromTime(progress: Progress | null): number | null {
  if (!progress || progress.watched) return null
  const from = Math.floor(progress.time - RESUME_REWIND_SECONDS)
  return from > 0 ? from : null
}
