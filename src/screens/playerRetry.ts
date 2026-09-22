export type PlayerStatus = 'loading' | 'retrying' | 'ready' | 'failed'

export interface PlayerRetryState {
  attempt: number
  status: PlayerStatus
  /** Bump to force the iframe to remount with a freshly computed src. */
  reloadToken: number
}

export type PlayerRetryEvent =
  | { type: 'reset' }
  | { type: 'timeout' }
  | { type: 'retryLoadStarted' }
  | { type: 'loaded' }
  | { type: 'manualReload' }

export const MAX_RETRIES = 3
const RETRY_BACKOFF_MS = 1000

export const initialPlayerRetryState: PlayerRetryState = {
  attempt: 0,
  status: 'loading',
  reloadToken: 0,
}

export function backoffMs(attempt: number): number {
  return RETRY_BACKOFF_MS * attempt
}

export function playerRetryReducer(
  state: PlayerRetryState,
  event: PlayerRetryEvent,
): PlayerRetryState {
  switch (event.type) {
    case 'reset':
      return { attempt: 0, status: 'loading', reloadToken: state.reloadToken + 1 }
    case 'timeout': {
      const nextAttempt = state.attempt + 1
      if (nextAttempt > MAX_RETRIES) return { ...state, status: 'failed' }
      return { ...state, attempt: nextAttempt, status: 'retrying' }
    }
    case 'retryLoadStarted':
      return { ...state, status: 'loading', reloadToken: state.reloadToken + 1 }
    case 'loaded':
      return { ...state, status: 'ready' }
    case 'manualReload':
      return { attempt: 0, status: 'loading', reloadToken: state.reloadToken + 1 }
    default:
      return state
  }
}
