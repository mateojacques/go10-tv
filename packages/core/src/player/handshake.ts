export const HANDSHAKE_INTERVAL_MS = 250
export const HANDSHAKE_MAX_TRIES = 40

/**
 * Posts `message` now and every HANDSHAKE_INTERVAL_MS until stopped (the
 * embed answered) or HANDSHAKE_MAX_TRIES are spent: an embed that only talks
 * once it hears from its parent may not be listening yet on the first try.
 */
export function startHandshake(message: unknown, send: (message: unknown) => void): { stop(): void } {
  let tries = 1
  send(message)
  const timer = setInterval(() => {
    send(message)
    if (++tries >= HANDSHAKE_MAX_TRIES) clearInterval(timer)
  }, HANDSHAKE_INTERVAL_MS)
  return { stop: () => clearInterval(timer) }
}
