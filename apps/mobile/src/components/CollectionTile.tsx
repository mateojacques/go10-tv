import { Image } from 'expo-image'
import { Pressable, StyleSheet, View } from 'react-native'
import type { Collection } from '@go10/core/collections/types'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { theme } from '../theme'

/** A brand card (apps/web/src/components/CollectionTile.tsx): the logo on its colour, no text. */
export function CollectionTile({ collection, imageBase, onSelect }: { collection: Collection; imageBase: string; onSelect: (c: Collection) => void }) {
  const { color, background } = collection.tile
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={collection.name}
      onPress={() => onSelect(collection)}
      style={({ focused }) => [styles.tile, focused && styles.tileFocused]}
    >
      {({ focused }) => (
        <View testID="tile-surface" style={[styles.surface, { backgroundColor: color }, focused && styles.surfaceFocused]}>
          {background && <Image testID="tile-background" source={{ uri: imageSrc(background, imageBase) }} style={StyleSheet.absoluteFill} contentFit="cover" />}
          <Image testID="tile-logo" source={{ uri: imageSrc(collection.logo, imageBase) }} style={styles.logo} contentFit="contain" />
          {!focused && <View style={styles.dim} pointerEvents="none" />}
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tile: { width: theme.tile.width, height: theme.tile.height },
  tileFocused: { transform: [{ scale: theme.focusScale }], zIndex: 2 },
  surface: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.hairline },
  surfaceFocused: { borderWidth: 3, borderColor: theme.color.accent },
  logo: { width: '70%', height: '62%' },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: `rgba(0, 0, 0, ${theme.dim})` },
})
