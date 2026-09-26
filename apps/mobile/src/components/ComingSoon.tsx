import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

/** Stand-in for screens that arrive in later phases, at their final routes. */
export function ComingSoon({ heading, note }: { heading: string; note: string }) {
  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.heading}>{heading}</Text>
      <Text style={styles.note}>{note}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', gap: 12, padding: theme.space.safeX, backgroundColor: theme.color.bg },
  heading: { color: theme.color.text, fontFamily: theme.font.displayHeavy, fontSize: theme.size.hero },
  note: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta },
})
