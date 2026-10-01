import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { programLabel, progressOf } from '@go10/core/tv/describe'
import type { Channel, Schedule } from '@go10/core/tv/types'
import { theme } from '../theme'

/** A channel and what it's airing right now (apps/web/src/tv/ChannelTile.tsx, without the hover preview). */
export function ChannelTile({ channel, schedule, imageBase, current = false, preferred = false, onSelect }: {
  channel: Channel
  schedule: Schedule
  imageBase: string
  current?: boolean
  /** TV: the strip opens with focus on the playing channel. */
  preferred?: boolean
  onSelect: (channel: Channel) => void
}) {
  const label = programLabel(schedule.current.unit)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${channel.number} ${channel.name}: ${label}`}
      accessibilityState={{ selected: current }}
      hasTVPreferredFocus={preferred}
      onPress={() => onSelect(channel)}
      style={({ focused }) => [styles.tile, focused && styles.tileFocused]}
    >
      {({ focused }) => (
        <>
          <View style={[styles.thumb, { backgroundColor: channel.collection.tile.color }, current && styles.thumbCurrent, focused && styles.thumbFocused]}>
            <Image source={{ uri: imageSrc(schedule.current.unit.row.thumbnail, imageBase) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={styles.badge}>
              <Image source={{ uri: imageSrc(channel.collection.logo, imageBase) }} style={styles.logo} contentFit="contain" />
              <Text style={styles.number}>{channel.number}</Text>
            </View>
          </View>
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${Math.round(progressOf(schedule) * 100)}%` }]} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tile: { width: theme.tile.width },
  tileFocused: { transform: [{ scale: theme.focusScale }], zIndex: 2 },
  thumb: { height: theme.tile.height, borderRadius: theme.radius, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.hairline },
  thumbCurrent: { borderWidth: 2, borderColor: theme.color.text },
  thumbFocused: { borderWidth: 3, borderColor: theme.color.accent },
  badge: {
    position: 'absolute', left: 6, top: 6, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: theme.color.scrim,
  },
  logo: { width: 28, height: 16 },
  number: { color: theme.color.text, fontFamily: theme.font.monoMedium, fontSize: theme.size.meta },
  progress: { height: 3, marginTop: 6, borderRadius: 2, backgroundColor: theme.color.hairline, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: theme.color.accent },
  label: { marginTop: 4, color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.meta },
})
