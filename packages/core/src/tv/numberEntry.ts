/** A half-typed channel number tunes on its own after this long without another digit. */
export const NUMBER_ENTRY_MS = 1500

/**
 * A remote's number keys, as a TV takes them: a digit that could still begin
 * a longer channel number waits for the next one (or for NUMBER_ENTRY_MS),
 * anything else tunes at once. `tune` may name no channel at all; the caller
 * ignores those.
 */
export function enterDigit(pending: string, digit: string, numbers: number[]): { pending: string; tune: number | null } {
  const next = pending + digit
  const maxDigits = String(Math.max(0, ...numbers)).length
  const couldGrow =
    next.length < maxDigits &&
    (Number(next) === 0 || numbers.some((n) => String(n).length > next.length && String(n).startsWith(next)))
  return couldGrow ? { pending: next, tune: null } : { pending: '', tune: Number(next) }
}
