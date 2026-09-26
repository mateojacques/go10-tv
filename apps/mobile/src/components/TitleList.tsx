import { Image } from 'expo-image'
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { imageSrc } from '@go10/core/lib/imageSrc'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'

/** Phase 2's stand-in for Home: every title, to prove the data path end to end. */
export function TitleList({ titles, imageBase }: { titles: Title[]; imageBase: string }) {
  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={titles}
      keyExtractor={(t) => t.key}
      ListHeaderComponent={<Text style={styles.count}>{`${titles.length} títulos`}</Text>}
      renderItem={({ item }) => (
        <Pressable style={({ focused }) => [styles.item, focused && styles.itemFocused]}>
          <Image
            accessibilityLabel={item.title}
            source={{ uri: imageSrc(item.thumbnail, imageBase) }}
            style={styles.thumb}
            contentFit="cover"
          />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            {item.year !== null && <Text style={styles.meta}>{item.year}</Text>}
          </View>
        </Pressable>
      )}
    />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  content: { paddingHorizontal: theme.space.safeX, paddingVertical: theme.space.safeY, gap: theme.space.gap },
  count: { color: theme.color.textMuted, fontSize: theme.size.meta, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: theme.space.gap, padding: 4, borderRadius: theme.radius, borderWidth: 2, borderColor: 'transparent' },
  itemFocused: { borderColor: theme.color.accent },
  thumb: { width: theme.card.width, height: (theme.card.width * 9) / 16, borderRadius: theme.radius, backgroundColor: theme.color.bgRaised },
  text: { flex: 1 },
  title: { color: theme.color.text, fontSize: theme.size.card, fontWeight: '600' },
  meta: { color: theme.color.textMuted, fontSize: theme.size.meta },
})
