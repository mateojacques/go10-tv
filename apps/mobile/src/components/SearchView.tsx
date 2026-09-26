import { Ionicons } from '@expo/vector-icons'
import { Platform, Pressable, StyleSheet, Text, TextInput, TVFocusGuideView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SECTION_LABELS } from '@go10/core/catalog/catalogHeading'
import type { Section } from '@go10/core/catalog/selectTitles'
import { externalTitlesEnabled } from '@go10/core/external/config'
import type { Title } from '@go10/core/types'
import { SEARCH_DEBOUNCE_MS, useDebounced } from '../hooks/useDebounced'
import { theme } from '../theme'
import { CatalogView } from './CatalogView'

const tv = Platform.isTV
const SECTIONS: Section[] = ['all', 'movie', 'show']
const CHIP_LABELS: Record<Section, string> = { all: 'Todo', movie: SECTION_LABELS.movie, show: SECTION_LABELS.show }

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ focused }) => [styles.chip, selected && styles.chipActive, focused && styles.chipFocused]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

/**
 * Search (the web's navbar field plus its catalog results). The input owns
 * the keyboard — the IME on TV — and results follow it after a pause. The
 * section chips replace the web's scope chip and phone menu; D-pad Down
 * from the input reaches them, then the first result.
 */
export function SearchView({ titles, section, query, catalogOnly, imageBase, onQueryChange, onSectionChange, onCatalogOnlyChange, onSelect, onBack }: {
  titles: Title[]
  section: Section
  query: string
  imageBase: string
  onQueryChange: (query: string) => void
  onSectionChange: (section: Section) => void
  /** The web's "Fuente": Doblaje latino searches the catalog only. */
  catalogOnly: boolean
  onCatalogOnlyChange: (catalogOnly: boolean) => void
  onSelect: (title: Title) => void
  onBack: () => void
}) {
  const insets = useSafeAreaInsets()
  const shown = useDebounced(query, SEARCH_DEBOUNCE_MS)
  const placeholder = section === 'all' ? 'Buscar' : `Buscar en ${SECTION_LABELS[section]}`

  return (
    <View style={styles.root}>
      <View style={[styles.head, { paddingTop: insets.top + (tv ? 16 : 10) }]}>
        <View style={styles.fieldRow}>
          {!tv && (
            <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={styles.back}>
              <Ionicons name="chevron-back" size={22} color={theme.color.text} />
            </Pressable>
          )}
          <View style={styles.field}>
            <Ionicons name="search" size={tv ? 12 : 18} color={theme.color.textMuted} />
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={onQueryChange}
              placeholder={placeholder}
              placeholderTextColor={theme.color.textMuted}
              accessibilityLabel={placeholder}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              selectionColor={theme.color.accent}
            />
            {query !== '' && (
              <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => onQueryChange('')} hitSlop={8}>
                <Ionicons name="close" size={tv ? 12 : 18} color={theme.color.textMuted} />
              </Pressable>
            )}
          </View>
        </View>
        <TVFocusGuideView autoFocus style={styles.chips}>
          {SECTIONS.map((target) => (
            <Chip key={target} label={CHIP_LABELS[target]} selected={target === section} onPress={() => onSectionChange(target)} />
          ))}
        </TVFocusGuideView>
        {/* The web's "Fuente": only while searching with external titles on. */}
        {externalTitlesEnabled() && query.trim() !== '' && (
          <TVFocusGuideView autoFocus style={styles.chips}>
            <Chip label="Lenguaje original" selected={!catalogOnly} onPress={() => onCatalogOnlyChange(false)} />
            <Chip label="Doblaje latino" selected={catalogOnly} onPress={() => onCatalogOnlyChange(true)} />
          </TVFocusGuideView>
        )}
      </View>
      <CatalogView titles={titles} section={section} query={shown} catalogOnly={catalogOnly} imageBase={imageBase} onSelect={onSelect} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  head: { paddingHorizontal: theme.space.safeX, gap: tv ? 8 : 12 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.scrim, borderWidth: 1, borderColor: theme.color.hairline },
  field: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: tv ? 32 : 44, paddingHorizontal: 12,
    borderRadius: 999, backgroundColor: theme.color.bgRaised, borderWidth: 1, borderColor: theme.color.hairline,
  },
  input: { flex: 1, padding: 0, color: theme.color.text, fontFamily: theme.font.display, fontSize: tv ? 11 : 17 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: tv ? 10 : 14, paddingVertical: tv ? 4 : 7, borderRadius: 999, backgroundColor: 'rgba(242, 244, 240, 0.07)', borderWidth: 2, borderColor: 'transparent' },
  chipActive: { backgroundColor: theme.color.text },
  chipFocused: { borderColor: theme.color.accent },
  chipText: { color: theme.color.textMuted, fontFamily: theme.font.displayBold, fontSize: tv ? 9 : 14 },
  chipTextActive: { color: theme.color.bg },
})
