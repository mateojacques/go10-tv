import { useMemo } from 'react'
import type { Title } from '@go10/core/types'
import type { Lineup } from '@go10/core/tv/types'
import { resolveLineup } from '@go10/core/tv/lineup'
import { COLLECTIONS } from '../collections/collections'
import { CHANNELS_FILE } from './channels'

/** The channels on air for the loaded catalog; null while it loads or when nothing can air. */
export function useLineup(titles: Title[]): Lineup | null {
  return useMemo(() => (titles.length > 0 ? resolveLineup(CHANNELS_FILE, COLLECTIONS, titles) : null), [titles])
}
