import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, TVFocusGuideView, View, useWindowDimensions } from 'react-native'
import { detailEyebrow, detailMeta } from '@go10/core/catalog/describeTitle'
import { rowKey } from '@go10/core/catalog/rowKey'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { groupSeasons } from '@go10/core/player/groupSeasons'
import { playMeta, rowStatus } from '@go10/core/progress/describe'
import { resumeFromTime, type Progress } from '@go10/core/progress/progressStore'
import { playedFraction, titleProgress } from '@go10/core/progress/titleProgress'
import type { CatalogRow, Title } from '@go10/core/types'
import { episodeGrid } from '../detail/episodeGrid'
import { theme } from '../theme'
import { Backdrop } from './Backdrop'
import { ProgressBar } from './ProgressBar'

const tv = Platform.isTV
const GAP = 8
const TILE_MIN = tv ? 44 : 56
const TILE_H = tv ? 38 : 52

function EpisodeTile({ episode, progress, active, width, onPress, onFocus }: {
  episode: CatalogRow
  progress: Progress | undefined
  active: boolean
  width: number
  onPress: () => void
  onFocus: () => void
}) {
  const watched = progress?.watched === true
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[`Episodio ${episode.episode_number}`, rowStatus(episode, progress)].filter(Boolean).join(', ')}
      onPress={onPress}
      onFocus={onFocus}
      style={({ focused }) => [styles.ep, { width }, watched && styles.epWatched, active && styles.epActive, focused && styles.epFocused]}
    >
      <Text style={[styles.epN, watched && styles.epNWatched, active && styles.epNActive]}>{episode.episode_number}</Text>
      {watched && <Text style={styles.check}>✓</Text>}
      {!watched && <ProgressBar fraction={playedFraction(progress)} style={styles.epProgress} />}
    </Pressable>
  )
}

/**
 * A title's Detail screen (apps/web/src/screens/Detail.tsx): backdrop, title
 * block, Reproducir/Reanudar, and for shows the season tabs and a dense
 * grid of numbered episode tiles.
 */
export function DetailView({ title, progress, imageBase, onPlay, onBack }: {
  title: Title
  /** Re-read by the screen each time it regains focus, e.g. back from the player. */
  progress: Record<string, Progress>
  imageBase: string
  onPlay: (row: CatalogRow) => void
  onBack: () => void
}) {
  const { width } = useWindowDimensions()
  const seasonGroups = useMemo(() => groupSeasons(title.seasons), [title.seasons])
  const latest = titleProgress(title, progress)
  const [activeRow, setActiveRow] = useState<CatalogRow>(latest.row)
  const [season, setSeason] = useState<number>(latest.row.season_number ?? seasonGroups[0]?.seasonNumber ?? 0)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)

  // Back from the player with something newer played (autoplay may have
  // moved on several episodes): Play and the season follow it.
  const seenRef = useRef(latest.updatedAt)
  useEffect(() => {
    if (latest.updatedAt <= seenRef.current) return
    seenRef.current = latest.updatedAt
    setActiveRow(latest.row)
    if (latest.row.season_number !== null) setSeason(latest.row.season_number)
  }, [latest.updatedAt, latest.row])

  const isShow = title.kind === 'show'
  const activeProgress = progress[rowKey(activeRow)] ?? null
  const resuming = resumeFromTime(activeProgress) !== null
  const note = playMeta(title, activeRow, activeProgress)
  const selected = seasonGroups.find((group) => group.seasonNumber === season)
  const thumb = title.thumbnail !== '' ? imageSrc(title.thumbnail, imageBase) : null
  const grid = episodeGrid(width - theme.space.safeX * 2, TILE_MIN, GAP)
  const playLabel = resuming ? 'Reanudar' : 'Reproducir'

  const described = selected
    ? selected.rows.find((episode) => rowKey(episode) === focusedKey) ?? selected.rows.find((episode) => rowKey(episode) === rowKey(activeRow))
    : undefined
  const describedStatus = described ? rowStatus(described, progress[rowKey(described)]) : ''

  return (
    <View style={styles.root}>
      <Backdrop uri={thumb} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          <View style={styles.main}>
            <Text style={styles.eyebrow}>{detailEyebrow(title)}</Text>
            <Text accessibilityRole="header" style={styles.title}>{title.title}</Text>
            <View style={styles.metaRow}>
              {detailMeta(title, activeRow).map((item, index) => (
                <View key={index} style={styles.metaItem}>
                  {index > 0 && <View style={styles.sep} />}
                  <Text style={styles.meta}>{item}</Text>
                </View>
              ))}
            </View>
            <View style={styles.genres}>
              {[title.genre, title.genre_secondary].filter(Boolean).map((genre) => (
                <Text key={genre} style={styles.chip}>{genre}</Text>
              ))}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={playLabel}
              hasTVPreferredFocus
              onPress={() => onPlay(activeRow)}
              style={({ focused }) => [styles.play, focused && styles.playFocused]}
            >
              {({ focused }) => (
                <>
                  <View style={[styles.playIcon, focused && styles.playIconFocused]} />
                  <Text style={[styles.playText, focused && styles.onAccent]}>{playLabel}</Text>
                </>
              )}
            </Pressable>
            {note !== '' && (
              <View style={styles.playMeta}>
                {resuming && <ProgressBar fraction={playedFraction(activeProgress)} style={styles.playProgress} />}
                <Text style={styles.playMetaText}>{note}</Text>
              </View>
            )}
          </View>
          {tv && thumb && <Image source={{ uri: thumb }} style={styles.art} contentFit="cover" />}
        </View>

        {isShow && (
          <View style={styles.seasons}>
            {seasonGroups.length > 1 && (
              <TVFocusGuideView autoFocus>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                  {seasonGroups.map((group) => {
                    // A season that is one whole file plays straight from its tab.
                    const single = group.rows.length === 1 ? group.rows[0] : null
                    const singleProgress = single ? progress[rowKey(single)] : undefined
                    const isSelected = group.seasonNumber === season
                    return (
                      <Pressable
                        key={group.seasonNumber}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={
                          single
                            ? [group.label, rowStatus(single, singleProgress)].filter(Boolean).join(', ')
                            : `${group.label}, ${group.rows.length} episodios`
                        }
                        onPress={() => {
                          setActiveRow(group.rows[0])
                          setSeason(group.seasonNumber)
                          if (single) onPlay(single)
                        }}
                        style={({ focused }) => [styles.tab, isSelected && styles.tabActive, focused && styles.tabFocused]}
                      >
                        <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>{group.label}</Text>
                        {single && !singleProgress?.watched && (
                          <ProgressBar fraction={playedFraction(singleProgress)} style={styles.tabProgress} />
                        )}
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </TVFocusGuideView>
            )}

            {selected && selected.rows.length > 1 && (
              <View>
                <Text accessibilityRole="header" style={styles.label}>
                  Episodios
                  <Text style={styles.count}>{`  ${selected.rows.length}`}</Text>
                </Text>
                {/* Height reserved so the grid never jumps as the caption changes. */}
                <Text testID="episode-caption" style={styles.caption}>
                  {described && (
                    <>
                      <Text style={styles.captionN}>{`Episodio ${described.episode_number}`}</Text>
                      {describedStatus !== '' && ` · ${describedStatus}`}
                    </>
                  )}
                </Text>
                <TVFocusGuideView autoFocus style={styles.grid}>
                  {selected.rows.map((episode) => (
                    <EpisodeTile
                      key={rowKey(episode)}
                      episode={episode}
                      progress={progress[rowKey(episode)]}
                      active={rowKey(episode) === rowKey(activeRow)}
                      width={grid.tile}
                      onFocus={() => setFocusedKey(rowKey(episode))}
                      onPress={() => {
                        setActiveRow(episode)
                        onPlay(episode)
                      }}
                    />
                  ))}
                </TVFocusGuideView>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Touch-only: the remote and the phone's back gesture already go back. */}
      {!tv && (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={theme.color.text} />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  content: { paddingBottom: theme.space.safeY * 2 },
  body: {
    flexDirection: 'row', alignItems: 'center', gap: theme.space.safeX,
    paddingHorizontal: theme.space.safeX, paddingTop: tv ? 48 : theme.space.safeY + 56, paddingBottom: tv ? 24 : 32,
  },
  main: { flex: 1, maxWidth: tv ? 368 : undefined },
  eyebrow: { marginBottom: 8, color: theme.color.accent, fontFamily: theme.font.mono, fontSize: theme.size.eyebrow + 1, letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginBottom: 14, color: theme.color.text, fontFamily: theme.font.displayHeavy, fontSize: theme.size.hero, lineHeight: theme.size.hero * 1.02, letterSpacing: -theme.size.hero * 0.03 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: tv ? 12 : 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  sep: { width: 3, height: 3, borderRadius: 2, marginHorizontal: tv ? 8 : 8, backgroundColor: theme.color.textMuted },
  meta: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: tv ? 20 : 24 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.hairline, color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.tag + 2 },
  play: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: tv ? 'flex-start' : 'stretch', gap: 12,
    minHeight: tv ? undefined : 52, paddingHorizontal: tv ? 16 : 24, paddingVertical: tv ? 8 : 0, borderRadius: theme.radius,
    backgroundColor: 'rgba(242, 244, 240, 0.08)', borderWidth: 1, borderColor: theme.color.hairline,
  },
  playFocused: { backgroundColor: theme.color.accent, borderColor: theme.color.accent, transform: [{ scale: 1.03 }] },
  playIcon: { width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderLeftWidth: 12, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: theme.color.text },
  playIconFocused: { borderLeftColor: theme.color.bg },
  playText: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
  onAccent: { color: theme.color.bg },
  playMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  playProgress: { width: 40, height: 3 },
  playMetaText: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.tag + 3 },
  art: { width: 208, aspectRatio: 368 / 210, borderRadius: theme.radius, borderWidth: 1, borderColor: theme.color.hairline },
  seasons: { paddingHorizontal: theme.space.safeX },
  tabs: { gap: 8, paddingVertical: 8, marginBottom: tv ? 12 : 20 },
  tab: { minHeight: tv ? 28 : 44, justifyContent: 'center', paddingHorizontal: tv ? 12 : 18, borderRadius: 999, backgroundColor: 'rgba(242, 244, 240, 0.07)', borderWidth: 2, borderColor: 'transparent' },
  tabActive: { backgroundColor: theme.color.text },
  tabFocused: { borderColor: theme.color.accent, transform: [{ scale: 1.06 }] },
  tabText: { color: theme.color.textMuted, fontFamily: theme.font.displayBold, fontSize: tv ? 9 : 15 },
  tabTextActive: { color: theme.color.bg },
  tabProgress: { position: 'absolute', left: 18, right: 18, bottom: 6, height: 2 },
  label: { marginBottom: 4, color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.section },
  count: { color: theme.color.textMuted, fontFamily: theme.font.monoMedium, fontSize: theme.size.tag + 3 },
  caption: { minHeight: tv ? 14 : 20, marginBottom: tv ? 10 : 16, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.tag + 3 },
  captionN: { color: theme.color.text, fontFamily: theme.font.monoSemi },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  ep: { height: TILE_H, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius, backgroundColor: theme.color.bgRaised, borderWidth: 1, borderColor: theme.color.hairline },
  epWatched: { backgroundColor: 'transparent' },
  epActive: { backgroundColor: 'rgba(198, 242, 78, 0.12)', borderWidth: 1.5, borderColor: theme.color.accent },
  epFocused: { borderWidth: 2, borderColor: theme.color.accent, transform: [{ scale: 1.08 }], zIndex: 2 },
  epN: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: tv ? 12 : 17, fontVariant: ['tabular-nums'] },
  epNWatched: { color: theme.color.textMuted },
  epNActive: { color: theme.color.accent },
  check: { position: 'absolute', top: 3, right: 6, color: theme.color.accentDim, fontSize: tv ? 7 : 10 },
  epProgress: { position: 'absolute', left: 8, right: 8, bottom: 6, height: 3 },
  back: {
    position: 'absolute', top: theme.space.safeY, left: theme.space.safeX, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.scrim, borderWidth: 1, borderColor: theme.color.hairline,
  },
})
