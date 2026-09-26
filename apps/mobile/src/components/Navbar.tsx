import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SECTION_LABELS } from '@go10/core/catalog/catalogHeading'
import type { Section } from '@go10/core/catalog/selectTitles'
import { theme } from '../theme'

const tv = Platform.isTV
export const NAV_HEIGHT = tv ? 44 : 56

function NavLink({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ focused }) => [styles.link, focused && styles.linkFocused]}
    >
      {({ focused }) => <Text style={[styles.linkText, active && styles.linkActive, focused && styles.onAccent]}>{label}</Text>}
    </Pressable>
  )
}

/**
 * The web navbar (apps/web/src/components/Navbar.tsx), overlaid on the top of
 * Home and the section pages: wordmark, Películas, Series, and a search
 * button that opens the search screen (typing lives there, so the IME never
 * closes on a navigation).
 */
export function Navbar({ section, onHome, onSection, onSearch }: {
  section: Section
  /** Absent on Home itself, where the wordmark is just a mark. */
  onHome?: () => void
  onSection: (section: 'movie' | 'show') => void
  onSearch: () => void
}) {
  const insets = useSafeAreaInsets()
  const mark = (
    <View style={styles.wordmark}>
      <View style={styles.dot} />
      <Text style={styles.wordmarkText}>GO10 TV</Text>
    </View>
  )
  return (
    <View style={[styles.root, { paddingTop: insets.top, height: NAV_HEIGHT + insets.top }]}>
      <LinearGradient colors={['rgba(8, 9, 12, 0.92)', 'rgba(8, 9, 12, 0)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {onHome ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Ir al inicio" onPress={onHome} style={({ focused }) => [styles.markButton, focused && styles.linkFocused]}>
          {mark}
        </Pressable>
      ) : (
        mark
      )}
      <View style={styles.links}>
        {(['movie', 'show'] as const).map((target) => (
          <NavLink key={target} label={SECTION_LABELS[target]} active={section === target} onPress={() => section !== target && onSection(target)} />
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Buscar" onPress={onSearch} style={({ focused }) => [styles.search, focused && styles.linkFocused]}>
        {({ focused }) => (
          <>
            <Ionicons name="search" size={tv ? 12 : 20} color={focused ? theme.color.bg : theme.color.text} />
            {tv && <Text style={[styles.linkText, focused && styles.onAccent]}>Buscar</Text>}
          </>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: tv ? 16 : 10, paddingHorizontal: theme.space.safeX },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markButton: { borderRadius: theme.radius, paddingHorizontal: 4, paddingVertical: 2 },
  dot: { width: tv ? 6 : 8, height: tv ? 6 : 8, borderRadius: 4, backgroundColor: theme.color.accent },
  wordmarkText: { color: theme.color.text, fontFamily: theme.font.displayHeavy, fontSize: tv ? 11 : 17, letterSpacing: -0.3 },
  links: { flex: 1, flexDirection: 'row', gap: 4 },
  link: { borderRadius: 999, paddingHorizontal: tv ? 10 : 10, paddingVertical: tv ? 4 : 8 },
  linkFocused: { backgroundColor: theme.color.accent },
  linkText: { color: theme.color.textMuted, fontFamily: theme.font.displayBold, fontSize: tv ? 9 : 15 },
  linkActive: { color: theme.color.text },
  onAccent: { color: theme.color.bg },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: tv ? 10 : 10, paddingVertical: tv ? 4 : 8 },
})
