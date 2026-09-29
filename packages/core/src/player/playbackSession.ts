import type { CatalogRow } from '../types'
import { rowKey } from '../catalog/rowKey'
import { markWatched, readProgress, resumeFromTime, writeProgress } from '../progress/progressStore'
import { providerFor, type EmbedProvider } from './providers/index'

/** How long to wait for the embed before treating it as a load failure. */
export const LOAD_TIMEOUT_MS = 8000

/** `timeupdate` fires several times a second; storage only needs a few. */
export const PROGRESS_SAVE_INTERVAL_MS = 5000

/** Where `row` starts: its saved position, else its chapter's own start, else the top (null). */
export function playbackStart(row: CatalogRow): number | null {
  const resumeAt = resumeFromTime(readProgress(rowKey(row)))
  if (resumeAt !== null) return resumeAt
  return row.chapter_start_seconds && row.chapter_start_seconds > 0 ? row.chapter_start_seconds : null
}

export interface PlaybackSession {
  /** Start `row`'s file: saves where the previous one got to, returns the embed src. */
  load(row: CatalogRow): string
  /** The row changed without a reload: another chapter of the loaded file seeks to its start. */
  select(row: CatalogRow): void
  /** A raw message from the embed. */
  handle(data: unknown): void
  flush(): void
  /** Seeks from the last known position; returns the target, or null before a load. */
  seekBy(delta: number): number | null
  togglePlay(): void
  /** Play or pause outright (the remote's own Play and Pause keys). */
  setPlaying(playing: boolean): void
  canTogglePlay(): boolean
}

/**
 * The Player's playback bookkeeping (apps/web/src/screens/Player.tsx and
 * apps/mobile's PlayerView), free of any UI: the embed's own reports drive
 * progress, never a clock. `send` posts a command to the embed; `onEnded`
 * fires once per row when it finishes (the file's `ended`, or its chapter's
 * end time). With `seekCoalesceMs`, seeks made within that window of the
 * first one go out as a single seek at its end, so a slow embed isn't handed
 * a queue of seeks to work through.
 */
export function createPlaybackSession({ send, onEnded, onPlayingChange, now = Date.now, seekCoalesceMs = 0 }: {
  send: (command: unknown) => void
  onEnded: () => void
  onPlayingChange?: (playing: boolean) => void
  now?: () => number
  seekCoalesceMs?: number
}): PlaybackSession {
  let row: CatalogRow | null = null
  let provider: EmbedProvider | null = null
  let position: { key: string; time: number; duration: number } | null = null
  // Kept apart from `position` so seeking still works after a save clears it.
  let lastTime = 0
  let lastDuration = 0
  let lastSave = 0
  let pendingSeek: number | null = null
  let playing = false
  let ended = false
  // A coalesced seek waiting to go out; while it waits, the target (lastTime)
  // is the position, not the embed's reports from before the seek.
  let seekTimer: ReturnType<typeof setTimeout> | null = null

  function cancelSeek() {
    if (seekTimer !== null) clearTimeout(seekTimer)
    seekTimer = null
  }

  function setPlaying(value: boolean) {
    if (value === playing) return
    playing = value
    onPlayingChange?.(value)
  }

  function play(value: boolean) {
    if (!provider?.playMessage || !provider.pauseMessage) return
    send(value ? provider.playMessage : provider.pauseMessage)
    setPlaying(value)
  }

  function flush() {
    if (!position) return
    writeProgress(position.key, position, now())
    lastSave = now()
  }

  function finish(current: CatalogRow, duration: number) {
    ended = true
    setPlaying(false)
    markWatched(rowKey(current), duration, now())
    position = null
    onEnded()
  }

  return {
    load(next) {
      flush()
      cancelSeek()
      row = next
      provider = providerFor(next)
      position = null
      ended = false
      setPlaying(false)
      const start = playbackStart(next)
      lastTime = start ?? 0
      lastDuration = 0
      pendingSeek = provider.resumesViaUrl ? null : start
      return provider.src(next, provider.resumesViaUrl ? start : null)
    },

    select(next) {
      if (!row || !provider || next.video_id !== row.video_id || rowKey(next) === rowKey(row)) return
      flush()
      cancelSeek()
      row = next
      position = null
      ended = false
      lastTime = next.chapter_start_seconds ?? 0
      send(provider.seekMessage(lastTime))
    },

    handle(data) {
      if (!row || !provider) return
      const event = provider.parse(data, row)
      if (!event || ended) return

      if (event.kind === 'time') {
        setPlaying(true)
        if (seekTimer === null) lastTime = event.time
        lastDuration = event.duration
        position = { key: rowKey(row), time: event.time, duration: event.duration }
        if (pendingSeek !== null) {
          send(provider.seekMessage(pendingSeek))
          lastTime = pendingSeek
          pendingSeek = null
        }
        if (now() - lastSave >= PROGRESS_SAVE_INTERVAL_MS) flush()
        const chapterEnd = row.chapter_end_seconds
        if (chapterEnd != null && event.time >= chapterEnd) finish(row, row.duration_seconds)
      } else if (event.kind === 'paused') {
        setPlaying(false)
        flush()
      } else {
        finish(row, position?.duration || event.time || 0)
      }
    },

    flush,

    seekBy(delta) {
      if (!row || !provider) return null
      // A chapter's range, else the whole file (its end once reported).
      const start = row.chapter_start_seconds ?? 0
      const end = row.chapter_end_seconds ?? (lastDuration > 0 ? lastDuration : null)
      let target = Math.max(start, lastTime + delta)
      if (end !== null) target = Math.min(target, Math.max(start, end - 1))
      lastTime = target
      if (seekCoalesceMs <= 0) {
        send(provider.seekMessage(target))
      } else if (seekTimer === null) {
        const current = provider
        seekTimer = setTimeout(() => {
          seekTimer = null
          send(current.seekMessage(lastTime))
        }, seekCoalesceMs)
      }
      return target
    },

    togglePlay: () => play(!playing),
    setPlaying: play,

    canTogglePlay: () => Boolean(provider?.playMessage && provider.pauseMessage),
  }
}
