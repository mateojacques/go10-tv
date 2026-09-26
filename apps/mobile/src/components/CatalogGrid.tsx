import type { ReactElement } from 'react'
import { FlatList, Platform, StyleSheet, useWindowDimensions } from 'react-native'
import type { Title } from '@go10/core/types'
import { catalogGrid } from '../catalog/gridLayout'
import { theme } from '../theme'
import { Card } from './Card'

/**
 * Titles as a virtualised grid (the web's CatalogGrid batches 60 cards at a
 * time for the same reason: Películas alone is 774 titles). The window is
 * generous so D-pad focus never targets an unmounted card.
 */
export function CatalogGrid({ titles, imageBase, onSelect, header, empty, preferFirst }: {
  titles: Title[]
  imageBase: string
  onSelect: (title: Title) => void
  header?: ReactElement
  empty?: ReactElement
  /** TV: the first card takes focus when the screen opens. */
  preferFirst?: boolean
}) {
  const { width } = useWindowDimensions()
  const { columns, card } = catalogGrid(width - theme.space.safeX * 2, theme.card.width, theme.space.gap, !Platform.isTV)
  return (
    <FlatList
      // numColumns can't change on a mounted FlatList.
      key={columns}
      style={styles.root}
      data={titles}
      numColumns={columns}
      keyExtractor={(title) => title.key}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      columnWrapperStyle={columns > 1 ? styles.line : undefined}
      contentContainerStyle={styles.content}
      initialNumToRender={columns * 4}
      windowSize={9}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      renderItem={({ item, index }) => (
        <Card title={item} imageBase={imageBase} onSelect={onSelect} width={card} preferred={preferFirst && index === 0} />
      )}
    />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  content: { paddingBottom: theme.space.safeY * 2 },
  // Room for the focused card's scale-up, as in the Home rows.
  line: { gap: theme.space.gap, paddingHorizontal: theme.space.safeX, paddingVertical: Platform.isTV ? 10 : 12 },
})
