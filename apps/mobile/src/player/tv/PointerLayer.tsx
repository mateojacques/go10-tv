import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../../theme'

/** The TV pointer (spec: Android TV player controls → 3): drawn over the embed, never focusable. */
export function PointerLayer({ x, y }: { x: number; y: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View testID="pointer" style={[styles.cursor, { left: x - 2, top: y - 2 }]}>
        <Ionicons name="navigate" size={22} color={theme.color.accent} style={styles.icon} />
      </View>
      <Text style={styles.hint}>Flechas para mover · OK para tocar · Atrás para salir</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  cursor: { position: 'absolute' },
  icon: { transform: [{ rotate: '-90deg' }], textShadowColor: '#000', textShadowRadius: 4 },
  hint: {
    position: 'absolute', top: theme.space.safeY, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999,
    backgroundColor: theme.color.scrim, color: theme.color.textMeta, fontFamily: theme.font.mono, fontSize: theme.size.meta,
  },
})
