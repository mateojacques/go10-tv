import { ScrollView, StyleSheet, TVFocusGuideView } from 'react-native'
import type { Collection } from '@go10/core/collections/types'
import { theme } from '../theme'
import { CollectionTile } from './CollectionTile'

/** The brand tiles under the hero: one focus row, no heading (web: .go-strip). */
export function CollectionStrip({ collections, imageBase, onSelect }: { collections: Collection[]; imageBase: string; onSelect: (c: Collection) => void }) {
  return (
    <TVFocusGuideView autoFocus style={styles.strip}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
        {collections.map((collection) => (
          <CollectionTile key={collection.id} collection={collection} imageBase={imageBase} onSelect={onSelect} />
        ))}
      </ScrollView>
    </TVFocusGuideView>
  )
}

const styles = StyleSheet.create({
  strip: { marginBottom: theme.space.rowGap / 2 },
  track: { paddingHorizontal: theme.space.safeX, paddingVertical: 10, gap: theme.space.gap },
})
