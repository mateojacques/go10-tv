import { FlatList, StyleSheet } from 'react-native'
import type { Collection } from '@go10/core/collections/types'
import type { Title } from '@go10/core/types'
import type { HomeModel } from '../home/homeModel'
import { theme } from '../theme'
import { CollectionStrip } from './CollectionStrip'
import { Hero } from './Hero'
import { Row } from './Row'

type Section = { kind: 'strip' } | { kind: 'row'; index: number }

/** The virtualised part of Home: the strip (when any collection shows) and the rows. The hero is the list header. */
export function homeSections(model: HomeModel): Section[] {
  return [
    ...(model.strip.length > 0 ? [{ kind: 'strip' } as const] : []),
    ...model.rows.map((_, index) => ({ kind: 'row', index }) as const),
  ]
}

/**
 * Home as one vertical list of sections, so only the rows near the viewport
 * are mounted (28 rows x 20 cards is too many images to hold at once). The
 * window is generous so a row focused by the D-pad is always mounted. The
 * hero is the list header, never virtualised: remounting it would re-apply
 * hasTVPreferredFocus and yank TV focus back to the top.
 */
export function HomeView({ model, imageBase, onSelectTitle, onPlayTitle, onSelectCollection }: {
  model: HomeModel
  imageBase: string
  onSelectTitle: (title: Title) => void
  onPlayTitle: (title: Title) => void
  onSelectCollection: (collection: Collection) => void
}) {
  const sections = homeSections(model)
  return (
    <FlatList
      style={styles.root}
      data={sections}
      keyExtractor={(s) => (s.kind === 'row' ? model.rows[s.index].id : s.kind)}
      initialNumToRender={4}
      windowSize={7}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <Hero
          title={model.featured}
          art={model.featuredArt}
          imageBase={imageBase}
          onPlay={() => onPlayTitle(model.featured)}
          onInfo={() => onSelectTitle(model.featured)}
        />
      }
      renderItem={({ item }) => {
        if (item.kind === 'strip') return <CollectionStrip collections={model.strip} imageBase={imageBase} onSelect={onSelectCollection} />
        return <Row group={model.rows[item.index]} imageBase={imageBase} onSelect={onSelectTitle} />
      }}
    />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
})
