import { createLiveSession, type LiveSession } from './liveSession'
import { createYoutubeLiveSession } from './youtubeLiveSession'
import type { Channel } from './types'

/** The session that keeps a slot's embed on air: the schedule for a collection channel, the live edge for a YouTube live. */
export function createSessionFor({ channel, epochMs, send, onFinishedEarly }: {
  channel: Channel
  epochMs: number
  send: (command: unknown) => void
  onFinishedEarly?: () => void
}): LiveSession {
  if (channel.kind === 'live') return createYoutubeLiveSession({ channel, send })
  return createLiveSession({ plan: channel.plan, epochMs, send, onFinishedEarly })
}
