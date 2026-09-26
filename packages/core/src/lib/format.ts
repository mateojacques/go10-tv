/**
 * Human-readable duration, e.g. 14909 -> "4 h 8 min".
 *
 * Minutes are truncated, not rounded: rounding would label a 12-minute-30
 * video "13 min", which reads as wrong next to the source's own timestamp.
 */
export function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`
}

/** e.g. 1444 -> "1.444 vistas" (Spanish thousands separator). */
export function formatViews(views: number): string {
  return `${views.toLocaleString('es-ES')} ${views === 1 ? 'vista' : 'vistas'}`
}
