import { useLocalSearchParams } from 'expo-router'
import { ComingSoon } from '../../components/ComingSoon'
import { useCatalog } from '../../data/CatalogProvider'

/** Phase 5 replaces this with the real Collection screen. */
export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { state } = useCatalog()
  const collection = state.status === 'ready' ? state.data.collections.find((c) => c.id === id) : undefined
  return <ComingSoon heading={collection?.name ?? 'Colección'} note="Las colecciones llegan en una próxima versión." />
}
