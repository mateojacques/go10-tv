import { isTvDevice } from '../focus/inputMode'

/**
 * Live TV is web-only for now: a TV build has no remote path to the
 * mini-player and pays for hidden embeds. Its own spec will bring it back.
 */
export function liveTvEnabled(): boolean {
  return !isTvDevice()
}
