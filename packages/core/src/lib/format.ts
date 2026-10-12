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

/** A player clock: 75 -> "1:15", 3725 -> "1:02:05". */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
