import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { listProgress } from '@go10/core/progress/progressStore'
import { openCollection, openSearch, openSection, openTitle, playTitle } from '../browse/navigate'
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
      onSelectTitle={openTitle}
      onPlayTitle={playTitle}
      onSelectCollection={openCollection}
      onOpenSection={(section) => openSection(section, false)}
      onSearch={() => openSearch('all')}
    />
  )
}
