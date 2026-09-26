import type { EmbedProvider } from './types'
import { buildEmbedSrc } from '../embedSrc'

/**
 * ok.ru's /videoembed/ iframe posts `{event: 'timeupdate' | 'paused' |
 * 'ended', time, duration}` to the parent (confirmed on real traffic) and
 * accepts `{action: 'seek', time}` and `{action: 'play' | 'pause'}`.
 */
export const okru: EmbedProvider = {
  origin: 'https://ok.ru',
  src: (row, fromTime) => buildEmbedSrc(row.embed_url, fromTime),
  parse(data) {
    const d = data as { event?: string; time?: number; duration?: number } | null
    if (d?.event === 'timeupdate' && typeof d.time === 'number') return { kind: 'time', time: d.time, duration: d.duration ?? 0 }
    if (d?.event === 'paused') return { kind: 'paused' }
    if (d?.event === 'ended') return { kind: 'ended', time: d.time ?? 0 }
    return null
  },
  seekMessage: (time) => ({ action: 'seek', time }),
  playMessage: { action: 'play' },
  pauseMessage: { action: 'pause' },
  resumesViaUrl: true,
  fallbackLabel: 'Abrir en ok.ru',
}
