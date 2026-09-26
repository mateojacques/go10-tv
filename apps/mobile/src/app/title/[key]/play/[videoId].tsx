import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { rowKey } from '@go10/core/catalog/rowKey'
import { findNextEpisode, findPreviousEpisode } from '@go10/core/player/nextEpisode'
import { resolveRoute } from '@go10/core/router/resolveRoute'
import type { CatalogRow } from '@go10/core/types'
import { LoadingScreen } from '../../../../components/LoadingScreen'
import { PlayerView } from '../../../../components/PlayerView'
import { appExtra, siteBase } from '../../../../config/appConfig'
import { useCatalog } from '../../../../data/CatalogProvider'

const siteUrl = siteBase(appExtra().siteUrl)

export default function PlayScreen() {
  const { key, videoId } = useLocalSearchParams<{ key: string; videoId: string }>()
  const { state } = useCatalog()

  if (state.status === 'loading') return <LoadingScreen />
  const view = state.status === 'ready' ? resolveRoute({ name: 'play', key, videoId }, state.data.titles) : null
  if (view?.name !== 'player') return <Redirect href="/" />
  const { title, row } = view

  const next = findNextEpisode(title.seasons, row)
  const previous = findPreviousEpisode(title.seasons, row)
  // Same screen, new episode: the player keeps its session, and for another
  // chapter of the same file, its loaded embed. Back still returns to Detail.
  const go = (target: CatalogRow) => router.setParams({ videoId: rowKey(target) })

  return (
    <PlayerView
      row={row}
      siteUrl={siteUrl}
      onClose={() => router.back()}
      onNext={next ? () => go(next) : undefined}
      onPrev={previous ? () => go(previous) : undefined}
    />
  )
}
