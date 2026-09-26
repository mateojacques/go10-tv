import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Collection } from '@go10/core/collections/types'
import type { Progress } from '@go10/core/progress/progressStore'
import type { CatalogRow, Title } from '@go10/core/types'
import type { CatalogState } from '../data/catalogStore'
import { buildHome } from '../home/homeModel'
import { theme } from '../theme'
import { HomeView } from './HomeView'
import { LoadingScreen } from './LoadingScreen'
import { OfflineScreen } from './OfflineScreen'

export function HomeContent({ state, progress, onRetry, imageBase, onSelectTitle, onPlayTitle, onSelectCollection }: {
  state: CatalogState
  progress: Record<string, Progress>
  onRetry: () => void
  imageBase: string
  onSelectTitle: (title: Title) => void
  onPlayTitle: (title: Title, row: CatalogRow) => void
  onSelectCollection: (collection: Collection) => void
}) {
  // Rebuilt only when the catalog changes (applyPending), not on every render.
  const model = useMemo(() => (state.status === 'ready' ? buildHome(state.data) : null), [state])
  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <OfflineScreen onRetry={onRetry} />
  if (!model) {
    return (
      <View style={styles.empty}>
        <Text style={styles.mark}>GO10 TV</Text>
        <Text style={styles.msg}>El catálogo está vacío.</Text>
      </View>
    )
  }
  return <HomeView model={model} progress={progress} imageBase={imageBase} onSelectTitle={onSelectTitle} onPlayTitle={onPlayTitle} onSelectCollection={onSelectCollection} />
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.color.bg },
  mark: { color: theme.color.accent, fontFamily: theme.font.displayHeavy, fontSize: theme.size.section },
  msg: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.body },
})
