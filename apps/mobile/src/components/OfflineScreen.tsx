import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

/** No network and no cached catalog: the only way forward is to try again. */
export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Sin conexión</Text>
      <Text style={styles.body}>No se pudo cargar el catálogo. Revisá tu conexión e intentá de nuevo.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reintentar"
        hasTVPreferredFocus
        onPress={onRetry}
        style={({ focused, pressed }) => [styles.button, (focused || pressed) && styles.buttonActive]}
      >
        <Text style={styles.buttonText}>Reintentar</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: theme.space.safeX, backgroundColor: theme.color.bg },
  title: { color: theme.color.text, fontSize: theme.size.section, fontWeight: '700' },
  body: { color: theme.color.textMuted, fontSize: theme.size.body, textAlign: 'center' },
  button: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 12, borderRadius: theme.radius, borderWidth: 2, borderColor: theme.color.accent },
  buttonActive: { backgroundColor: theme.color.accent },
  buttonText: { color: theme.color.text, fontSize: theme.size.body, fontWeight: '700' },
})
