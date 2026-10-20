import { createYoutubeParser, youtube, youtubeEmbedSrc } from '../player/providers/youtube'
import { startHandshake } from '../player/handshake'
import { RESUME_INTERVAL_MS, type LiveSession } from './liveSession'
import type { LiveChannel } from './types'

/**
 * A YouTube live on a channel slot: always joined at the live edge (a fresh
 * load, never a seek), started muted so autoplay is never refused (the slot
 * asks for sound like it does of ok.ru), and played again if it pauses.
 */
export function createYoutubeLiveSession({ channel, send, now = Date.now }: {
  channel: LiveChannel
  send: (command: unknown) => void
  now?: () => number
}): LiveSession {
  // Per slot: partial infoDelivery updates are tracked per embed.
  const parse = createYoutubeParser()
  let handshake: { stop(): void } | null = null
  let lastResume = -Infinity

  return {
    get origin() {
      return youtube.origin
    },
    playMessage: youtube.playMessage,
    soundMessages: (on) => (on ? [youtube.unmuteMessage, youtube.volumeMessage?.(1)] : [youtube.muteMessage]),

    tune() {
      handshake?.stop()
      return youtubeEmbedSrc(channel.source, { mute: true })
    },
    sync: () => 'load',
    attach() {
      handshake?.stop()
      handshake = startHandshake(youtube.handshakeMessage, send)
    },
    handle(data) {
      const event = parse(data)
      if (!event) return
      handshake?.stop()
      if (event.kind !== 'paused' || now() - lastResume < RESUME_INTERVAL_MS) return
      lastResume = now()
      send(youtube.playMessage)
    },
    parseTime(data) {
      const event = parse(data)
      return event?.kind === 'time' ? event.time : null
    },
    current: () => null,
    finishedEarly: () => false,
  }
}
