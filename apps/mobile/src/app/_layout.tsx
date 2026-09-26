// First: wires core's storage and config before any other module evaluates.
import '../platform/install'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { CatalogProvider } from '../data/CatalogProvider'
import { theme } from '../theme'

export default function RootLayout() {
  return (
    <CatalogProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.color.bg } }} />
    </CatalogProvider>
  )
}
