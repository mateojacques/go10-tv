import { ScrollView, StyleSheet, Text, TVFocusGuideView, View } from 'react-native'
import type { Lineup } from '@go10/core/tv/types'
import { theme } from '../theme'
import { ChannelTile } from './ChannelTile'
import { useLiveNow } from './useLiveNow'

/** Home's "En vivo ahora" (apps/web/src/tv/LiveRow.tsx): every channel and what it's airing, one press from tuning in. */
export function LiveRow({ lineup, imageBase, onWatch }: { lineup: Lineup; imageBase: string; onWatch: (channelId: string) => void }) {
  const live = useLiveNow(lineup)
  return (
    <View style={styles.row}>
      <View style={styles.heading}>
        <View style={styles.dot} />
        <Text accessibilityRole="header" style={styles.label}>
          En vivo ahora
        </Text>
      </View>
      <TVFocusGuideView autoFocus>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
          {lineup.channels.map((channel) => {
            const schedule = live.get(channel.id)
            return schedule ? <ChannelTile key={channel.id} channel={channel} schedule={schedule} imageBase={imageBase} onSelect={(c) => onWatch(c.id)} /> : null
          })}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { marginBottom: theme.space.rowGap },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: theme.space.safeX, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.live },
  label: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.section },
  // Vertical padding leaves room for the focused tile's scale.
  track: { paddingHorizontal: theme.space.safeX, paddingVertical: 10, gap: theme.space.gap },
})
