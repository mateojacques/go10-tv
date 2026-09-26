import { router, useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { rowKey } from '@go10/core/catalog/rowKey'
import { listProgress } from '@go10/core/progress/progressStore'
import { HomeContent } from '../components/HomeContent'
import { appExtra, siteBase } from '../config/appConfig'
import { useCatalog } from '../data/CatalogProvider'

const imageBase = siteBase(appExtra().siteUrl)

export default function Home() {
  const { state, store } = useCatalog()
  const [progress, setProgress] = useState(listProgress)
  // Arriving at Home: apply a background catalog refresh (never mid-browse)
  // and re-read progress, so the hero says Reanudar after watching.
  useFocusEffect(
    useCallback(() => {
      store.applyPending()
      setProgress(listProgress())
    }, [store]),
  )
  return (
    <HomeContent
      state={state}
      progress={progress}
      onRetry={() => void store.retry()}
      imageBase={imageBase}
      onSelectTitle={(title) => router.push({ pathname: '/title/[key]', params: { key: title.key } })}
      onPlayTitle={(title, row) => router.push({ pathname: '/title/[key]/play/[videoId]', params: { key: title.key, videoId: rowKey(row) } })}
      onSelectCollection={(c) => router.push({ pathname: '/coleccion/[id]', params: { id: c.id } })}
    />
  )
}
