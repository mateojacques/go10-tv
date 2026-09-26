import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { theme } from '../theme'

/** A thin played-share bar (apps/web/src/components/ProgressBar.tsx); `fraction` is 0..1. Nothing at 0. */
export function ProgressBar({ fraction, style }: { fraction: number; style?: StyleProp<ViewStyle> }) {
  if (fraction <= 0) return null
  return (
    <View testID="progress" style={[styles.track, style]}>
      <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(242, 244, 240, 0.18)' },
  fill: { height: '100%', backgroundColor: theme.color.accent },
})
