import { rowLabel } from '../progress/describe'
import type { Schedule, Unit } from './types'

/** "Mulán", "Coraje · T2 · E5", "Love, Death & Robots · Volumen 1". */
export function programLabel(unit: Unit): string {
  const row = unit.row
  if (row.type === 'movie') return row.title
  const position = rowLabel(row)
  return position ? `${row.series_title} · ${position}` : row.series_title
}

/** Local wall-clock time, "21:40". */
export function clockLabel(ms: number): string {
  const date = new Date(ms)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** How much of the current program has aired, 0..1. */
export function progressOf(schedule: Schedule): number {
  return Math.min(1, Math.max(0, schedule.offset / schedule.current.unit.length))
}
