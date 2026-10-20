import type { EmbedProvider, PlayerEvent } from './types'
import { parseYoutube, type YoutubeSource } from '../youtubeUrl'

/**
 * YouTube's iframe player, driven over raw postMessage (no iframe_api
 * script; see docs/superpowers/spikes/2026-10-20-youtube-embed-probe.md).
 * It stays silent until it hears `listening`, then posts JSON strings:
 * `infoDelivery` with partial `{currentTime, duration, playerState}` updates
 * (state 0 ended, 1 playing, 2 paused, 3 buffering) and `onError`. Commands
 * are `{event: 'command', func, args}` strings.
 */
const EMBED_HOST = 'https://www.youtube-nocookie.com'
const PARAMS = 'enablejsapi=1&autoplay=1&playsinline=1&rel=0'

interface YoutubeConfig {
  /** The page's own http(s) origin, passed as `origin` so YouTube addresses its messages to it. */
  pageOrigin: string | null
  /**
   * A page on the site that hosts the embed and relays messages both ways.
   * For a file:// page (packaged Tizen), which YouTube refuses with error 153.
   */
  relayUrl: string | null
}

let config: YoutubeConfig = { pageOrigin: null, relayUrl: null }

/** Set by each platform at startup (core can't read `location`). */
export function configureYoutube(next: YoutubeConfig): void {
  config = next
}

function relayOrigin(): string | null {
  return config.relayUrl ? new URL(config.relayUrl).origin : null
}

/** The embed URL for a video or a channel's live, wrapped in the relay when there is one. */
export function youtubeEmbedSrc(source: YoutubeSource, { start = null, mute = false }: { start?: number | null; mute?: boolean }): string {
  const path = 'videoId' in source ? `${source.videoId}?` : `live_stream?channel=${source.channelId}&`
  let src = `${EMBED_HOST}/embed/${path}${PARAMS}`
  if (start !== null && start >= 1) src += `&start=${Math.floor(start)}`
  if (mute) src += '&mute=1'
  // Through the relay, the relay page is the embed's parent.
  const origin = relayOrigin() ?? config.pageOrigin
  if (origin) src += `&origin=${encodeURIComponent(origin)}`
  return config.relayUrl ? `${config.relayUrl}?src=${encodeURIComponent(src)}` : src
}

const command = (func: string, args: unknown[] = []) => JSON.stringify({ event: 'command', func, args })

/**
 * A parser for one embed's messages. `infoDelivery` only carries what
 * changed, so the duration last reported is kept for the time events.
 */
export function createYoutubeParser(): (data: unknown) => PlayerEvent | null {
  let duration = 0
  return (data) => {
    if (typeof data !== 'string') return null
    let message: { event?: string; info?: unknown }
    try {
      message = JSON.parse(data)
    } catch {
      return null
    }
    if (message?.event === 'onError' && typeof message.info === 'number') return { kind: 'error', code: message.info }
    if (message?.event === 'onStateChange') return message.info === 1 ? { kind: 'playing' } : null
    const delivery = message?.event === 'infoDelivery' || message?.event === 'initialDelivery'
    if (!delivery || typeof message.info !== 'object' || message.info === null) return null
    const info = message.info as { currentTime?: number; duration?: number; playerState?: number }
    if (typeof info.duration === 'number') duration = info.duration
    const time = typeof info.currentTime === 'number' ? info.currentTime : null
    if (info.playerState === 0) return { kind: 'ended', time: time ?? duration }
    if (info.playerState === 2) return { kind: 'paused' }
    if (time !== null) return { kind: 'time', time, duration }
    if (info.playerState === 1) return { kind: 'playing' }
    return null
  }
}

// For callers without a session; the playback session takes a fresh one per load.
const parse = createYoutubeParser()

export const youtube: EmbedProvider = {
  get origin() {
    return relayOrigin() ?? EMBED_HOST
  },
  src: (row, fromTime) => {
    const source = parseYoutube(row.embed_url) ?? { videoId: row.video_id }
    return youtubeEmbedSrc(source, { start: fromTime })
  },
  parse: (data) => parse(data),
  createParser: createYoutubeParser,
  seekMessage: (time) => command('seekTo', [time, true]),
  handshakeMessage: JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
  playMessage: command('playVideo'),
  pauseMessage: command('pauseVideo'),
  muteMessage: command('mute'),
  unmuteMessage: command('unMute'),
  volumeMessage: (volume) => command('setVolume', [Math.round(volume * 100)]),
  resumesViaUrl: true,
  fallbackLabel: 'Abrir en YouTube',
}
