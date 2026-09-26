import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Collection } from '@go10/core/collections/types'
import { imageSrc } from '@go10/core/lib/imageSrc'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'
import { CatalogGrid } from './CatalogGrid'

const tv = Platform.isTV

/**
 * One collection's titles in the order it lists them
 * (apps/web/src/screens/Collection.tsx): the logo banner is the heading.
 */
export function CollectionView({ collection, titles, imageBase, onSelect, onBack }: {
  collection: Collection
  titles: Title[]
  imageBase: string
  onSelect: (title: Title) => void
  onBack: () => void
}) {
  const insets = useSafeAreaInsets()
  const { color, background } = collection.tile

  const banner = (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={collection.name}
      style={[styles.banner, { backgroundColor: color, marginTop: insets.top + (tv ? 24 : 64) }]}
    >
      {background && <Image testID="collection-background" source={{ uri: imageSrc(background, imageBase) }} style={StyleSheet.absoluteFill} contentFit="cover" />}
      <Image testID="collection-logo" source={{ uri: imageSrc(collection.logo, imageBase) }} style={styles.logo} contentFit="contain" />
    </View>
  )

  return (
    <View style={styles.root}>
      <CatalogGrid key={collection.id} titles={titles} imageBase={imageBase} onSelect={onSelect} header={banner} preferFirst />
      {!tv && (
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} style={[styles.back, { top: insets.top + 10 }]}>
          <Ionicons name="chevron-back" size={22} color={theme.color.text} />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  banner: { height: tv ? 104 : 144, marginHorizontal: theme.space.safeX, marginBottom: 4, borderRadius: theme.radius, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logo: { width: '40%', height: '62%' },
  back: {
    position: 'absolute', left: theme.space.safeX, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.color.scrim, borderWidth: 1, borderColor: theme.color.hairline,
  },
})
