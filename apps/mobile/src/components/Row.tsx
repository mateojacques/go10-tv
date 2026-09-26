import { ScrollView, StyleSheet, Text, TVFocusGuideView, View } from 'react-native'
import type { CatalogRowGroup } from '@go10/core/catalog/buildRows'
import type { CardProgress } from '@go10/core/progress/describe'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'
import { Card } from './Card'

/**
 * One labelled row of cards. The focus guide's autoFocus sends D-pad focus
 * entering the row to the card last focused in it, instead of whichever card
 * is geometrically nearest (Android TV's default). Rows are capped at 20
 * titles (core's ROW_LIMIT), so every card is rendered and focus can never
 * target one that isn't mounted.
 */
export function Row({ group, imageBase, onSelect, progressFor }: {
  group: CatalogRowGroup
  imageBase: string
  onSelect: (title: Title) => void
  /** Seguir viendo: each card's progress, shown in place of its meta line. */
  progressFor?: (title: Title) => CardProgress | undefined
}) {
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={styles.label}>
        {group.label}
        <Text style={styles.count}>{`  ${group.titles.length}`}</Text>
      </Text>
      <TVFocusGuideView autoFocus>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
          {group.titles.map((title) => (
            <Card key={`${group.id}:${title.key}`} title={title} imageBase={imageBase} onSelect={onSelect} progress={progressFor?.(title)} />
          ))}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { marginBottom: theme.space.rowGap },
  label: { marginLeft: theme.space.safeX, marginBottom: 8, color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.section },
  count: { color: theme.color.textMuted, fontFamily: theme.font.monoMedium, fontSize: theme.size.tag + 2 },
  // Vertical padding leaves room for the focused card's 1.09 scale.
  track: { paddingHorizontal: theme.space.safeX, paddingVertical: 10, gap: theme.space.gap },
})
