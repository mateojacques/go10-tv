/**
 * The episode grid's columns (CSS `repeat(auto-fill, minmax(min, 1fr))`):
 * as many tiles at least `min` wide as fit in `width`, stretched to fill it.
 */
export function episodeGrid(width: number, min: number, gap: number): { columns: number; tile: number } {
  const columns = Math.max(1, Math.floor((width + gap) / (min + gap)))
  return { columns, tile: Math.floor((width - gap * (columns - 1)) / columns) }
}
