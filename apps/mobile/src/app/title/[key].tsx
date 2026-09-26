import { useLocalSearchParams } from 'expo-router'
import { ComingSoon } from '../../components/ComingSoon'
import { useCatalog } from '../../data/CatalogProvider'

/** Phase 4 replaces this with the real Detail screen. */
export default function TitleScreen() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const { state } = useCatalog()
  const title = state.status === 'ready' ? state.data.titles.find((t) => t.key === key) : undefined
  return <ComingSoon heading={title?.title ?? 'Título'} note="La ficha del título llega en la próxima versión." />
}
