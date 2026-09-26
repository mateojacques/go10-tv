/**
 * The catalog grid's columns (apps/web/src/screens/Catalog.css): a phone
 * gets two cards per line that fill the screen; a TV as many fixed-width
 * cards as fit, left-aligned.
 */
export function catalogGrid(available: number, cardWidth: number, gap: number, phone: boolean): { columns: number; card: number } {
  if (phone) return { columns: 2, card: Math.floor((available - gap) / 2) }
  return { columns: Math.max(1, Math.floor((available + gap) / (cardWidth + gap))), card: cardWidth }
}
