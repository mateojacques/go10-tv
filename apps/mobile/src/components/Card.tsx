import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { cardMeta, seasonCount } from '@go10/core/catalog/describeTitle'
import { imageSrc } from '@go10/core/lib/imageSrc'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'

/** A catalog card (apps/web/src/components/Card.tsx): art, tags, name, year · genre. */
export function Card({ title, imageBase, onSelect }: { title: Title; imageBase: string; onSelect: (title: Title) => void }) {
  const seasons = seasonCount(title)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title.title}
      onPress={() => onSelect(title)}
      style={({ focused }) => [styles.card, focused && styles.cardFocused]}
    >
      {({ focused }) => (
        <>
          <View style={[styles.frame, focused && styles.frameFocused]}>
            {title.thumbnail !== '' && (
              <Image testID="card-image" source={{ uri: imageSrc(title.thumbnail, imageBase) }} style={styles.image} contentFit="cover" />
            )}
            <View style={styles.tags}>
              {title.quality === '4K' && <Text style={[styles.tag, styles.tagAccent]}>4K</Text>}
              {title.kind === 'show' && seasons > 0 && (
                <Text style={styles.tag}>{`${seasons} ${seasons === 1 ? 'Temporada' : 'Temporadas'}`}</Text>
              )}
            </View>
            {!focused && <View style={styles.dim} pointerEvents="none" />}
          </View>
          <Text style={[styles.name, !focused && styles.dimText]} numberOfLines={1}>{title.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{cardMeta(title)}</Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { width: theme.card.width },
  cardFocused: { transform: [{ scale: theme.focusScale }], zIndex: 2 },
  frame: { width: theme.card.width, height: theme.card.height, borderRadius: theme.radius, overflow: 'hidden', backgroundColor: theme.color.bgRaised, borderWidth: 1, borderColor: theme.color.hairline },
  frameFocused: { borderWidth: 3, borderColor: theme.color.accent },
  image: { width: '100%', height: '100%' },
  tags: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 4 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.color.scrim, color: theme.color.text, fontFamily: theme.font.monoSemi, fontSize: theme.size.tag, letterSpacing: 0.6 },
  tagAccent: { backgroundColor: theme.color.accent, color: theme.color.bg },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: `rgba(0, 0, 0, ${theme.dim})` },
  name: { marginTop: 8, color: theme.color.text, fontFamily: theme.font.displaySemi, fontSize: theme.size.card },
  dimText: { opacity: 0.62 },
  meta: { marginTop: 2, color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.tag + 2 },
})
