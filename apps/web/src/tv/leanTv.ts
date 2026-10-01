import { isTvDevice } from '../focus/inputMode'

/**
 * TV hardware: a weak browser, steered by a remote. Live TV runs one embed
 * at a time there: no preload, no previews, no mini-player (no remote key
 * reaches it), and zaps settle before they tune.
 */
export function leanTv(): boolean {
  return isTvDevice()
}
