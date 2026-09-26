import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { catalogHeading } from '@go10/core/catalog/catalogHeading'
import { selectTitles, type Section } from '@go10/core/catalog/selectTitles'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'
import { CatalogGrid } from './CatalogGrid'

/**
 * Every title matching a section and/or a query (apps/web/src/screens/Catalog.tsx),
 * catalog-only until Phase 6 brings TMDB: the same view serves Películas,
 * Series and search results.
 */
export function CatalogView({ titles, section, query, imageBase, onSelect, top = 0, preferFirst }: {
  titles: Title[]
  section: Section
  query: string
  imageBase: string
  onSelect: (title: Title) => void
  /** Room above the heading for an overlaid navbar. */
  top?: number
  preferFirst?: boolean
}) {
  const selection = useMemo(() => selectTitles(titles, section, query), [titles, section, query])
  const counted = selection.mode === 'results' || selection.mode === 'browse'

  const header = (
    <View style={[styles.head, { paddingTop: top + 16 }]}>
      <Text accessibilityRole="header" style={styles.title}>
        {catalogHeading(selection.mode, section, query)}
        {counted && <Text style={styles.count}>{`  ${selection.titles.length}`}</Text>}
      </Text>
      {selection.mode === 'suggestions' && <Text style={styles.sub}>Quizás te interese</Text>}
    </View>
  )

  return (
    <CatalogGrid
      // A new filter starts again at the top.
      key={`${section}|${query.trim()}`}
      titles={selection.titles}
      imageBase={imageBase}
      onSelect={onSelect}
      header={header}
      empty={<Text style={styles.empty}>No hay títulos.</Text>}
      preferFirst={preferFirst}
    />
  )
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: theme.space.safeX, paddingBottom: 4 },
  title: { color: theme.color.text, fontFamily: theme.font.displayHeavy, fontSize: theme.size.section * 1.3, letterSpacing: -theme.size.section * 0.02 },
  count: { color: theme.color.textMuted, fontFamily: theme.font.monoMedium, fontSize: theme.size.tag + 3 },
  sub: { marginTop: 8, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta, letterSpacing: 2.5, textTransform: 'uppercase' },
  empty: { marginHorizontal: theme.space.safeX, marginTop: 24, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.body },
})
