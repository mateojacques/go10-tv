import { useMemo } from 'react'
import { resolveLineup } from '@go10/core/tv/lineup'
import type { Lineup } from '@go10/core/tv/types'
import type { CatalogData } from '../data/catalogStore'

/** The channels on air for this catalog; null without a channels file or when nothing can air. */
export function lineupOf(data: CatalogData): Lineup | null {
  return data.channels === null || data.titles.length === 0 ? null : resolveLineup(data.channels, data.collections, data.titles)
}

export function useLineup(data: CatalogData | null): Lineup | null {
  return useMemo(() => (data ? lineupOf(data) : null), [data])
}
