import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { rowKey } from '@go10/core/catalog/rowKey'
import { listProgress } from '@go10/core/progress/progressStore'
import { resolveRoute } from '@go10/core/router/resolveRoute'
import { DetailView } from '../../../components/DetailView'
import { LoadingScreen } from '../../../components/LoadingScreen'
import { appExtra, siteBase } from '../../../config/appConfig'
import { useCatalog } from '../../../data/CatalogProvider'

const imageBase = siteBase(appExtra().siteUrl)

export default function TitleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const { state } = useCatalog()
  // Re-read on every return to this screen (the player saves as it plays).
  const [progress, setProgress] = useState(listProgress)
  useFocusEffect(useCallback(() => setProgress(listProgress()), []))

  if (state.status === 'loading') return <LoadingScreen />
  const view = state.status === 'ready' ? resolveRoute({ name: 'title', key }, state.data.titles) : null
  // Unknown key (or no catalog at all): Home, which shows why.
  if (view?.name !== 'detail') return <Redirect href="/" />
  const { title } = view

  return (
    <DetailView
      title={title}
      progress={progress}
      imageBase={imageBase}
      onBack={() => router.back()}
      onPlay={(row) => router.push({ pathname: '/title/[key]/play/[videoId]', params: { key: title.key, videoId: rowKey(row) } })}
    />
  )
}
