import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

/** The web's `.go-state`: the mark and one line — loading (spinner) or a dead end (Volver). */
export function StateScreen({ message, onBack }: { message: string; onBack?: () => void }) {
  return (
    <View style={styles.root}>
      <Text style={styles.mark}>GO10 TV</Text>
      <Text style={styles.msg}>{message}</Text>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hasTVPreferredFocus
          onPress={onBack}
          style={({ focused, pressed }) => [styles.button, (focused || pressed) && styles.buttonActive]}
        >
          {({ focused, pressed }) => <Text style={[styles.buttonText, (focused || pressed) && styles.onAccent]}>Volver</Text>}
        </Pressable>
      ) : (
        <ActivityIndicator color={theme.color.accent} accessibilityLabel="Cargando" />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: theme.space.safeX, backgroundColor: theme.color.bg },
  mark: { color: theme.color.accent, fontFamily: theme.font.displayHeavy, fontSize: theme.size.section },
  msg: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.body, textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: theme.radius, borderWidth: 2, borderColor: theme.color.accent },
  buttonActive: { backgroundColor: theme.color.accent },
  buttonText: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
  onAccent: { color: theme.color.bg },
})
