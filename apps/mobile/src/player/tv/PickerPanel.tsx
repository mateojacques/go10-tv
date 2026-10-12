import { Ionicons } from '@expo/vector-icons'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SETTING_LABELS, type BridgeSetting, type MergedChoice } from '@go10/core/player/bridge/protocol'
import { theme } from '../../theme'

/**
 * One embed setting's options on the right edge, opening on the current
 * one (spec: Android TV player controls → 1, picker panel).
 */
export function PickerPanel({ setting, choice, onPick }: {
  setting: BridgeSetting
  choice: MergedChoice
  onPick: (value: string) => void
}) {
  const preferred = choice.current ?? choice.options[0].value
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>{SETTING_LABELS[setting]}</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {choice.options.map((option) => {
          const selected = option.value === choice.current
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              hasTVPreferredFocus={option.value === preferred}
              onPress={() => onPick(option.value)}
              style={({ focused }) => [styles.item, focused && styles.itemFocused]}
            >
              {({ focused }) => (
                <>
                  <Text style={[styles.label, focused && styles.labelFocused]}>{option.label}</Text>
                  {selected && <Ionicons name="checkmark" size={14} color={focused ? theme.color.bg : theme.color.accent} />}
                </>
              )}
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: 220, paddingTop: theme.space.safeY, paddingHorizontal: 14,
    backgroundColor: theme.color.scrim, borderLeftWidth: 1, borderLeftColor: theme.color.hairline,
  },
  heading: {
    color: theme.color.textMuted, fontFamily: theme.font.monoMedium, fontSize: theme.size.eyebrow, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 10,
  },
  list: { gap: 4, paddingBottom: theme.space.safeY },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius },
  itemFocused: { backgroundColor: theme.color.accent },
  label: { color: theme.color.text, fontFamily: theme.font.displaySemi, fontSize: theme.size.body },
  labelFocused: { color: theme.color.bg },
})
