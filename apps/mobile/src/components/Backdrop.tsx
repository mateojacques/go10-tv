import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View } from 'react-native'
import { theme } from '../theme'

/**
 * The web's Backdrop: the 368x210 thumbnail blurred hard into a colour field
 * behind the screen — mood, never detail. No thumbnail, no request.
 */
export function Backdrop({ uri }: { uri: string | null }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {uri && <Image testID="backdrop" source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 9, 12, 0.55)' }]} />
      <LinearGradient colors={['rgba(8, 9, 12, 0)', theme.color.bg]} locations={[0.2, 0.85]} style={StyleSheet.absoluteFill} />
    </View>
  )
}
