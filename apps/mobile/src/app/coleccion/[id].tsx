import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { resolveRoute } from '@go10/core/router/resolveRoute'
import { openTitle } from '../../browse/navigate'
import { CollectionView } from '../../components/CollectionView'
import { LoadingScreen } from '../../components/LoadingScreen'
import { appExtra, siteBase } from '../../config/appConfig'
import { useCatalog } from '../../data/CatalogProvider'

const imageBase = siteBase(appExtra().siteUrl)

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { state } = useCatalog()
  if (state.status === 'loading') return <LoadingScreen />
  const view = state.status === 'ready' ? resolveRoute({ name: 'collection', id }, state.data.titles, state.data.collections) : null
  // Unknown, or nothing of it left in the catalog: Home.
  if (view?.name !== 'collection') return <Redirect href="/" />
  return <CollectionView collection={view.collection} titles={view.titles} imageBase={imageBase} onSelect={openTitle} onBack={() => router.back()} />
}
