import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { theme } from '../theme'

export function LoadingScreen() {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={theme.color.accent} accessibilityLabel="Cargando catálogo" />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.bg },
})
