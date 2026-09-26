import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { catalogHeading } from '@go10/core/catalog/catalogHeading'
import { selectTitles, type Section } from '@go10/core/catalog/selectTitles'
import { externalTitlesEnabled } from '@go10/core/external/config'
import { mergeSearch } from '@go10/core/external/mergeSearch'
import type { Title } from '@go10/core/types'
import { useTmdbSearch } from '../external/useTmdbSearch'
import { theme } from '../theme'
import { CatalogGrid } from './CatalogGrid'

/**
 * Every title matching a section and/or a query (apps/web/src/screens/Catalog.tsx),
 * with TMDB hits appended when external titles are on: the same view serves Películas,
 * Series and search results.
 */
export function CatalogView({ titles, section, query, catalogOnly = false, imageBase, onSelect, top = 0, preferFirst }: {
  titles: Title[]
  section: Section
  query: string
  /** "Doblaje latino": skip TMDB for this search. */
  catalogOnly?: boolean
  imageBase: string
  onSelect: (title: Title) => void
  /** Room above the heading for an overlaid navbar. */
  top?: number
  preferFirst?: boolean
}) {
  const selection = useMemo(() => selectTitles(titles, section, query), [titles, section, query])
  const tmdb = useTmdbSearch(query, section, externalTitlesEnabled() && !catalogOnly && selection.mode !== 'browse')
  const shown = mergeSearch(selection, tmdb)
  const counted = shown.mode === 'results' || shown.mode === 'browse'

  const header = (
    <View style={[styles.head, { paddingTop: top + 16 }]}>
      <Text accessibilityRole="header" style={styles.title}>
        {catalogHeading(shown.mode, section, query)}
        {counted && <Text style={styles.count}>{`  ${shown.titles.length}`}</Text>}
      </Text>
      {shown.mode === 'suggestions' && <Text style={styles.sub}>Quizás te interese</Text>}
    </View>
  )

  return (
    <CatalogGrid
      // A new filter starts again at the top.
      key={`${section}|${query.trim()}`}
      titles={shown.titles}
      imageBase={imageBase}
      onSelect={onSelect}
      header={header}
      empty={<Text style={styles.empty}>{shown.mode === 'searching' ? 'Buscando…' : 'No hay títulos.'}</Text>}
      // TMDB's API terms require the credit wherever its data is shown.
      footer={shown.external ? <Text style={styles.credit}>Datos de títulos: TMDB</Text> : undefined}
      preferFirst={preferFirst}
    />
  )
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: theme.space.safeX, paddingBottom: 4 },
  title: { color: theme.color.text, fontFamily: theme.font.displayHeavy, fontSize: theme.size.section * 1.3, letterSpacing: -theme.size.section * 0.02 },
  count: { color: theme.color.textMuted, fontFamily: theme.font.monoMedium, fontSize: theme.size.tag + 3 },
  sub: { marginTop: 8, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta, letterSpacing: 2.5, textTransform: 'uppercase' },
  credit: { marginHorizontal: theme.space.safeX, marginTop: 8, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta, letterSpacing: 1, opacity: 0.7 },
  empty: { marginHorizontal: theme.space.safeX, marginTop: 24, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.body },
})
