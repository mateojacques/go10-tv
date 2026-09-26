import { router, useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { HomeContent } from '../components/HomeContent'
import { appExtra, siteBase } from '../config/appConfig'
import { useCatalog } from '../data/CatalogProvider'

const imageBase = siteBase(appExtra().siteUrl)

export default function Home() {
  const { state, store } = useCatalog()
  // A background refresh is applied on arriving at Home, never mid-browse.
  useFocusEffect(useCallback(() => store.applyPending(), [store]))
  return (
    <HomeContent
      state={state}
      onRetry={() => void store.retry()}
      imageBase={imageBase}
      onSelectTitle={(title) => router.push({ pathname: '/title/[key]', params: { key: title.key } })}
      // Playback arrives in Phase 4; until then Reproducir opens the title too.
      onPlayTitle={(title) => router.push({ pathname: '/title/[key]', params: { key: title.key } })}
      onSelectCollection={(c) => router.push({ pathname: '/coleccion/[id]', params: { id: c.id } })}
    />
  )
}
