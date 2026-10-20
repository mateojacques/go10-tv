import { createLiveSession, type LiveSession } from './liveSession'
import { createYoutubeLiveSession } from './youtubeLiveSession'
import type { Channel } from './types'

/** The session that keeps a slot's embed on air: the schedule for a collection channel, the live edge for a YouTube live. */
export function createSessionFor({ channel, epochMs, send, onFinishedEarly, onError }: {
  channel: Channel
  epochMs: number
  send: (command: unknown) => void
  onFinishedEarly?: () => void
  /** The embed can't play at all (YouTube lives; ok.ru reports no such thing). */
  onError?: (code: number) => void
}): LiveSession {
  if (channel.kind === 'live') return createYoutubeLiveSession({ channel, send, onError })
  return createLiveSession({ plan: channel.plan, epochMs, send, onFinishedEarly })
}
