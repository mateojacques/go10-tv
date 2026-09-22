/**
 * OK.ru's player is known to honor `fromTime=<seconds>` (used by
 * yt-dlp/youtube-dl's Odnoklassniki extractor); unconfirmed on the
 * `/videoembed/` iframe form specifically. If ignored, playback just starts
 * at 0 as it does today — never a crash.
 */
export function buildEmbedSrc(embedUrl: string, fromTimeSeconds: number | null): string {
  const separator = embedUrl.includes('?') ? '&' : '?'
  const fromTimePart = fromTimeSeconds && fromTimeSeconds > 0 ? `&fromTime=${fromTimeSeconds}` : ''
  return `${embedUrl}${separator}autoplay=1${fromTimePart}`
}
