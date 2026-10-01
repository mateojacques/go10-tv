import { useMemo } from 'react'
import { FlatList, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ROW_LIMIT, type CatalogRowGroup } from '@go10/core/catalog/buildRows'
import type { Collection } from '@go10/core/collections/types'
import { externalTitlesEnabled } from '@go10/core/external/config'
import { listSnapshots } from '@go10/core/external/snapshots'
import { continueCardProgress } from '@go10/core/progress/describe'
import type { Progress } from '@go10/core/progress/progressStore'
import { continueWatching } from '@go10/core/progress/titleProgress'
import type { Lineup } from '@go10/core/tv/types'
import type { CatalogRow, Title } from '@go10/core/types'
import type { HomeModel } from '../home/homeModel'
import { useListFill } from '../platform/listFill'
import { theme } from '../theme'
import { LiveRow } from '../tv/LiveRow'
import { CollectionStrip } from './CollectionStrip'
import { HeroCarousel } from './HeroCarousel'
import { NAV_HEIGHT, Navbar } from './Navbar'
import { Row } from './Row'

type Section = { kind: 'strip' } | { kind: 'live' } | { kind: 'continue' } | { kind: 'row'; index: number }

/** The virtualised part of Home: the strip (when any collection shows), En vivo ahora (when channels are on the air), Seguir viendo (when anything is in progress), the rows. The hero is the list header. */
export function homeSections(model: HomeModel, continueCount = 0, hasLive = false): Section[] {
  return [
    ...(model.strip.length > 0 ? [{ kind: 'strip' } as const] : []),
    ...(hasLive ? [{ kind: 'live' } as const] : []),
    ...(continueCount > 0 ? [{ kind: 'continue' } as const] : []),
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
export function HomeView({ model, progress, imageBase, onSelectTitle, onPlayTitle, onSelectCollection, onOpenSection, onSearch, lineup = null, onWatchChannel, onOpenTv }: {
  model: HomeModel
  progress: Record<string, Progress>
  imageBase: string
  onSelectTitle: (title: Title) => void
  /** `row` is what Reproducir/Reanudar starts. */
  onPlayTitle: (title: Title, row: CatalogRow) => void
  onSelectCollection: (collection: Collection) => void
  onOpenSection: (section: 'movie' | 'show') => void
  onSearch: () => void
  /** Live TV's channels; null (no channels file on the site) hides En vivo ahora and the TV item. */
  lineup?: Lineup | null
  onWatchChannel?: (channelId: string) => void
  onOpenTv?: () => void
}) {
  // Re-read on arriving at Home (the screen passes fresh progress), like the
  // web's per-mount read. Played TMDB titles aren't in the catalog; their
  // snapshots stand in for them here, and only here.
  const continueItems = useMemo(() => {
    const candidates = externalTitlesEnabled() ? [...model.titles, ...listSnapshots()] : model.titles
    return continueWatching(candidates, progress).slice(0, ROW_LIMIT)
  }, [model.titles, progress])
  const continueByKey = useMemo(() => new Map(continueItems.map((item) => [item.title.key, item])), [continueItems])
  const continueGroup: CatalogRowGroup = { id: 'seguir-viendo', label: 'Seguir viendo', titles: continueItems.map((item) => item.title) }
  const sections = homeSections(model, continueItems.length, lineup !== null)
  const fill = useListFill()
  const insets = useSafeAreaInsets()
  return (
    <View style={styles.root} onLayout={fill.onLayout}>
    <FlatList
      style={fill.style}
      data={sections}
      keyExtractor={(s) => (s.kind === 'row' ? model.rows[s.index].id : s.kind)}
      initialNumToRender={4}
      windowSize={7}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        model.slides.length > 0 ? (
          <HeroCarousel
            slides={model.slides}
            imageBase={imageBase}
            progress={progress}
            onPlayTitle={onPlayTitle}
            onSelectTitle={onSelectTitle}
          />
        ) : (
          // Nothing with art to feature: no hero, just clearance for the navbar.
          <View style={{ height: NAV_HEIGHT + insets.top + 16 }} />
        )
      }
      renderItem={({ item }) => {
        if (item.kind === 'strip') return <CollectionStrip collections={model.strip} imageBase={imageBase} onSelect={onSelectCollection} />
        if (item.kind === 'live') return lineup && <LiveRow lineup={lineup} imageBase={imageBase} onWatch={(id) => onWatchChannel?.(id)} />
        if (item.kind === 'continue') {
          return (
            <Row
              group={continueGroup}
              imageBase={imageBase}
              // Seguir viendo skips Detail and plays the resume target.
              onSelect={(title) => {
                const entry = continueByKey.get(title.key)
                if (entry) onPlayTitle(title, entry.progress.row)
              }}
              progressFor={(title) => {
                const entry = continueByKey.get(title.key)
                return entry && continueCardProgress(entry)
              }}
            />
          )
        }
        return <Row group={model.rows[item.index]} imageBase={imageBase} onSelect={onSelectTitle} />
      }}
    />
      <Navbar section="all" onSection={onOpenSection} onSearch={onSearch} onTv={lineup ? onOpenTv : undefined} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
})
