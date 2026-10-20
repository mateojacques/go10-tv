/** What a hand-written YouTube link points at: one video (or live), or a channel's current live. */
export type YoutubeSource = { videoId: string } | { channelId: string }

const HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be',
])
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/

function toUrl(input: string): URL | null {
  try {
    return new URL(input)
  } catch {
    return null
  }
}

export function isYoutubeUrl(url: string): boolean {
  const parsed = toUrl(url)
  return parsed !== null && HOSTS.has(parsed.hostname)
}

/**
 * The video or channel behind a watch, youtu.be, /embed/, /live/, /shorts/
 * or /channel/ URL, or a bare video id. `@handle` URLs need the Data API to
 * resolve, so they're rejected like anything else unrecognised.
 */
export function parseYoutube(input: string): YoutubeSource | null {
  if (VIDEO_ID.test(input)) return { videoId: input }
  const url = toUrl(input)
  if (!url || !HOSTS.has(url.hostname)) return null
  const video = (id: string | null | undefined) => (id && VIDEO_ID.test(id) ? { videoId: id } : null)
  const channel = (id: string | null | undefined) => (id && CHANNEL_ID.test(id) ? { channelId: id } : null)

  const [first, second] = url.pathname.split('/').filter(Boolean)
  if (url.hostname === 'youtu.be') return video(first)
  if (first === 'watch') return video(url.searchParams.get('v'))
  if (first === 'channel') return channel(second)
  if (first === 'embed' && second === 'live_stream') return channel(url.searchParams.get('channel'))
  if (first === 'embed' || first === 'live' || first === 'shorts') return video(second)
  return null
}
