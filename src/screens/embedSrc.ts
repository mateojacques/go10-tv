/**
 * `fromTime=<seconds>` starts the `/videoembed/` player at that position —
 * confirmed on real playback (ok.ru copies it into the player's
 * `flashvars.fromTime`).
 */
export function buildEmbedSrc(embedUrl: string, fromTimeSeconds: number | null): string {
  const separator = embedUrl.includes('?') ? '&' : '?'
  const fromTimePart = fromTimeSeconds && fromTimeSeconds > 0 ? `&fromTime=${fromTimeSeconds}` : ''
  return `${embedUrl}${separator}autoplay=1${fromTimePart}`
}
