import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import type { Section } from '@go10/core/catalog/selectTitles'
import { parseRoute } from '@go10/core/router/route'
import { openTitle } from '../browse/navigate'
import { LoadingScreen } from '../components/LoadingScreen'
import { SearchView } from '../components/SearchView'
import { appExtra, siteBase } from '../config/appConfig'
import { useCatalog } from '../data/CatalogProvider'

const imageBase = siteBase(appExtra().siteUrl)

/** `/buscar?q=&en=` — the web's search URL; its params seed the screen, which then owns them. */
export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; en?: string }>()
  const [query, setQuery] = useState(params.q ?? '')
  const [section, setSection] = useState<Section>(() => {
    const search = new URLSearchParams({ q: params.q || ' ', ...(params.en ? { en: params.en } : {}) })
    const route = parseRoute('/buscar', `?${search}`)
    return route.name === 'catalog' ? route.section : 'all'
  })
  const { state } = useCatalog()

  if (state.status === 'loading') return <LoadingScreen />
  if (state.status !== 'ready') return <Redirect href="/" />
  return (
    <SearchView
      titles={state.data.titles}
      section={section}
      query={query}
      imageBase={imageBase}
      onQueryChange={setQuery}
      onSectionChange={setSection}
      onSelect={openTitle}
      onBack={() => router.back()}
    />
  )
}
