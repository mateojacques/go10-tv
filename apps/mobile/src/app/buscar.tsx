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

/** `/buscar?q=&en=&solo=` — the web's search URL; its params seed the screen, which then owns them. */
export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; en?: string; solo?: string }>()
  const [query, setQuery] = useState(params.q ?? '')
  const [initialRoute] = useState(() => {
    const search = new URLSearchParams({
      q: params.q || ' ',
      ...(params.en ? { en: params.en } : {}),
      ...(params.solo ? { solo: params.solo } : {}),
    })
    return parseRoute('/buscar', `?${search}`)
  })
  const [section, setSection] = useState<Section>(initialRoute.name === 'catalog' ? initialRoute.section : 'all')
  const [catalogOnly, setCatalogOnly] = useState(initialRoute.name === 'catalog' && initialRoute.catalogOnly === true)
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
      catalogOnly={catalogOnly}
      onCatalogOnlyChange={setCatalogOnly}
      onSelect={openTitle}
      onBack={() => router.back()}
    />
  )
}
