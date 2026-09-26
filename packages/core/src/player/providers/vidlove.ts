import type { EmbedProvider } from './types'
import { parseTmdbKey } from '../../external/tmdb/keys'

/**
 * player.vidlove.cc, driven by TMDB ids. Its public docs cover only the URL;
 * the message format and options come from its player bundle:
 * `{type: 'PLAYER_EVENT', data: {event, currentTime, duration, tmdbId,
 * mediaType, season, episode}}` out, `{type: 'seek', time}` in. No start-time
 * URL param exists, so resume is a seek once playback starts.
 */
const PARAMS = new URLSearchParams({
  autoplay: 'true',
  // GO10 palette: accent, background, text (tokens.css).
  primarycolor: 'c6f24e',
  secondarycolor: '08090c',
  iconcolor: 'f2f4f0',
  // Our onEnded owns next-episode; don't show a second episode UI.
  autonext: 'false',
  episodelist: 'false',
  showNextEpisode: 'false',
})

interface VidloveEvent {
  event?: string
  currentTime?: number
  duration?: number
  // Numbers in every sample seen; compared via Number() in case the
  // player ever passes its route params through as strings.
  tmdbId?: number | string
  season?: number | string
  episode?: number | string
}

export const vidlove: EmbedProvider = {
  origin: 'https://player.vidlove.cc',
  src: (row) => `${row.embed_url}?${PARAMS}`,
  parse(data, row) {
    const message = data as { type?: string; data?: VidloveEvent } | null
    if (message?.type !== 'PLAYER_EVENT' || !message.data) return null
    const e = message.data

    // After autoplay moves on, the previous episode can still be talking.
    const target = parseTmdbKey(row.video_id)
    if (target && e.tmdbId !== undefined && Number(e.tmdbId) !== target.id) return null
    if (row.type === 'episode') {
      if (e.season !== undefined && Number(e.season) !== row.season_number) return null
      if (e.episode !== undefined && Number(e.episode) !== row.episode_number) return null
    }

    if (e.event === 'timeupdate' && typeof e.currentTime === 'number') {
      return { kind: 'time', time: e.currentTime, duration: e.duration ?? 0 }
    }
    if (e.event === 'pause') return { kind: 'paused' }
    if (e.event === 'ended') return { kind: 'ended', time: e.currentTime ?? 0 }
    return null
  },
  seekMessage: (time) => ({ type: 'seek', time }),
  resumesViaUrl: false,
  fallbackLabel: 'Abrir en una pestaña nueva',
  // No allow-popups: aggregator players like to open ad tabs.
  sandbox: 'allow-scripts allow-same-origin allow-presentation',
}
