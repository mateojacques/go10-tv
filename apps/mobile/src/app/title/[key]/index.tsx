import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { isTmdbKey } from '@go10/core/external/tmdb/keys'
import { listProgress } from '@go10/core/progress/progressStore'
import { resolveRoute } from '@go10/core/router/resolveRoute'
import { playTitle } from '../../../browse/navigate'
import { useTitleSource } from '../../../browse/useTitleSource'
import { DetailView } from '../../../components/DetailView'
import { LoadingScreen } from '../../../components/LoadingScreen'
import { StateScreen } from '../../../components/StateScreen'
import { appExtra, siteBase } from '../../../config/appConfig'

const imageBase = siteBase(appExtra().siteUrl)

export default function TitleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>()
  // Re-read on every return to this screen (the player saves as it plays).
  const [progress, setProgress] = useState(listProgress)
  useFocusEffect(useCallback(() => setProgress(listProgress()), []))

  const source = useTitleSource(key)
  if (source.status === 'loading') return isTmdbKey(key) ? <StateScreen message="Cargando título…" /> : <LoadingScreen />
  // A slow or failing TMDB mustn't trap anyone: the way back is on screen.
  if (source.status === 'error') return <StateScreen message="No se pudo cargar el título." onBack={() => router.back()} />
  const view = source.status === 'ready' ? resolveRoute({ name: 'title', key }, source.titles) : null
  // Unknown key (or no catalog at all): Home, which shows why.
  if (view?.name !== 'detail') return <Redirect href="/" />
  const { title } = view

  return (
    <DetailView
      title={title}
      progress={progress}
      imageBase={imageBase}
      onBack={() => router.back()}
      onPlay={(row) => playTitle(title, row)}
    />
  )
}
