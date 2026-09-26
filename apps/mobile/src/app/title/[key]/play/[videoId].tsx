import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'
import { rowKey } from '@go10/core/catalog/rowKey'
import { saveSnapshot } from '@go10/core/external/snapshots'
import { isTmdbKey } from '@go10/core/external/tmdb/keys'
import { findNextEpisode, findPreviousEpisode } from '@go10/core/player/nextEpisode'
import { resolveRoute } from '@go10/core/router/resolveRoute'
import type { CatalogRow } from '@go10/core/types'
import { useTitleSource } from '../../../../browse/useTitleSource'
import { LoadingScreen } from '../../../../components/LoadingScreen'
import { PlayerView } from '../../../../components/PlayerView'
import { StateScreen } from '../../../../components/StateScreen'
import { appExtra, siteBase } from '../../../../config/appConfig'

const siteUrl = siteBase(appExtra().siteUrl)

export default function PlayScreen() {
  const { key, videoId } = useLocalSearchParams<{ key: string; videoId: string }>()
  const source = useTitleSource(key)
  const view = source.status === 'ready' ? resolveRoute({ name: 'play', key, videoId }, source.titles) : null
  const playing = view?.name === 'player' ? view.title : null

  // Played TMDB titles are remembered for Home's Seguir viendo (as the web does).
  useEffect(() => {
    if (playing?.external) saveSnapshot(playing)
  }, [playing])

  if (source.status === 'loading') return isTmdbKey(key) ? <StateScreen message="Cargando título…" /> : <LoadingScreen />
  if (source.status === 'error') return <StateScreen message="No se pudo cargar el título." onBack={() => router.back()} />
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
