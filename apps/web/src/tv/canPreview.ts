import { isTvDevice } from '../focus/inputMode'

/** Hover previews are desktop-only: phones would pay in data, TVs in frames. */
export function canPreview(): boolean {
  return !isTvDevice() && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
}
