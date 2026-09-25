import type { CatalogRow } from '../../types'

/** A playback event, whatever the embed's own message format. */
export type PlayerEvent =
  | { kind: 'time'; time: number; duration: number }
  | { kind: 'paused' }
  | { kind: 'ended'; time: number }

/** Everything the Player needs to know about one embed provider. */
export interface EmbedProvider {
  /** The only origin whose messages are trusted, and the target for commands. */
  origin: string
  src(row: CatalogRow, fromTime: number | null): string
  /** `row` is what's playing now, so stale events can be dropped. */
  parse(data: unknown, row: CatalogRow): PlayerEvent | null
  seekMessage(time: number): unknown
  /** true: resume via `src`'s start time; false: post `seekMessage` once playing. */
  resumesViaUrl: boolean
  /** Text of the fallback link to `row.video_url`. */
  fallbackLabel: string
  /** iframe `sandbox`; undefined means no sandbox attribute at all. */
  sandbox?: string
}
