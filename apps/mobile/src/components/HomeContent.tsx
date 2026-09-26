import type { CatalogState } from '../data/catalogStore'
import { LoadingScreen } from './LoadingScreen'
import { OfflineScreen } from './OfflineScreen'
import { TitleList } from './TitleList'

export function HomeContent({ state, onRetry, imageBase }: { state: CatalogState; onRetry: () => void; imageBase: string }) {
  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <OfflineScreen onRetry={onRetry} />
  return <TitleList titles={state.data.titles} imageBase={imageBase} />
}
