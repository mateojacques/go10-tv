import { buildEmbedSrc } from '../player/embedSrc'
import { okru } from '../player/providers/okru'
import { scheduleAt } from './schedule'
import type { Airing, ChannelPlan } from './types'

/** Drift past this many seconds… */
export const DRIFT_SECONDS = 20
/** …on this many reports in a row seeks back to live. */
export const DRIFT_STRIKES = 2

export interface LiveSession {
  /** Joins the live second now; returns the embed src. Call on every load and every retry. */
  tune(): string
  /** Re-joins at max(now, atLeast): seeks in place if the file is the same ('seek'), else the caller reloads ('load'). */
  sync(atLeast?: number): 'seek' | 'load'
  /** A raw postMessage payload from the embed. */
  handle(data: unknown): void
  current(): Airing | null
  finishedEarly(): boolean
}

/**
 * Keeps one embed on a channel's live schedule. A sibling of the on-demand
 * playback session that writes no watch progress. Channels are catalog-only,
 * so the embed is always ok.ru.
 */
export function createLiveSession({
  plan,
  epochMs,
  send,
  now = Date.now,
  onFinishedEarly,
}: {
  plan: ChannelPlan
  epochMs: number
  send: (command: unknown) => void
  now?: () => number
  onFinishedEarly?: () => void
}): LiveSession {
  let airing: Airing | null = null
  let strikes = 0
  let early = false

  /** Moves to the airing at `at`; returns the position in its file, in seconds. */
  function settle(at: number): number {
    const schedule = scheduleAt(plan, epochMs, at, 0)
    airing = schedule.current
    strikes = 0
    early = false
    return schedule.current.unit.start + schedule.offset
  }

  function markEarly() {
    if (early || !airing || now() >= airing.endsAt) return
    early = true
    onFinishedEarly?.()
  }

  return {
    tune() {
      const position = settle(now())
      return buildEmbedSrc((airing as Airing).unit.row.embed_url, Math.floor(position))
    },

    sync(atLeast = 0) {
      const before = airing
      const position = settle(Math.max(now(), atLeast))
      if (before && before.unit.row.video_id === (airing as Airing).unit.row.video_id) {
        send(okru.seekMessage(Math.floor(position)))
        return 'seek'
      }
      return 'load'
    },

    handle(data) {
      if (!airing) return
      const event = okru.parse(data, airing.unit.row)
      if (!event) return
      if (event.kind === 'ended') return markEarly()
      if (event.kind !== 'time') return
      if (event.time >= airing.unit.start + airing.unit.length) return markEarly()
      const expected = airing.unit.start + (now() - airing.startsAt) / 1000
      if (Math.abs(event.time - expected) <= DRIFT_SECONDS) {
        strikes = 0
        return
      }
      strikes++
      if (strikes >= DRIFT_STRIKES) {
        strikes = 0
        send(okru.seekMessage(Math.floor(expected)))
      }
    },

    current: () => airing,
    finishedEarly: () => early,
  }
}
