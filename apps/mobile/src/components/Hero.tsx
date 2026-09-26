import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import { PixelRatio, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { heroMeta } from '@go10/core/catalog/describeTitle'
import { imageSrc } from '@go10/core/lib/imageSrc'
import { remainingLabel, rowLabel } from '@go10/core/progress/describe'
import { playedFraction, type TitleProgress } from '@go10/core/progress/titleProgress'
import type { Title } from '@go10/core/types'
import { theme } from '../theme'
import { ProgressBar } from './ProgressBar'

const BG = theme.color.bg
const tv = Platform.isTV

function HeroButton({ label, note, primary, preferred, onPress, icon }: { label: string; note?: string; primary?: boolean; preferred?: boolean; onPress: () => void; icon: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hasTVPreferredFocus={preferred}
      onPress={onPress}
      style={({ focused }) => [styles.button, primary ? styles.primary : styles.secondary, focused && styles.buttonFocused]}
    >
      {({ focused }) => (
        <View style={styles.buttonInner}>
          {icon}
          <Text style={[styles.buttonText, (primary || focused) && styles.buttonTextOnAccent]}>{label}</Text>
          {note ? <Text style={[styles.note, (primary || focused) && styles.buttonTextOnAccent]}>{note}</Text> : null}
        </View>
      )}
    </Pressable>
  )
}

/** The Home hero (apps/web/src/screens/Home.tsx + Home.css): key art or a blurred backdrop, then the title block. */
export function Hero({ title, art, imageBase, progress, onPlay, onInfo }: {
  title: Title
  art: { small: string; large: string } | null
  imageBase: string
  /** The featured title's progress: Reanudar and the episode, as on the web hero. */
  progress: TitleProgress | null
  onPlay: () => void
  onInfo: () => void
}) {
  const { width } = useWindowDimensions()
  const isShow = title.kind === 'show'
  const resuming = progress?.mode === 'resume'
  const position = progress && progress.mode !== 'start' ? rowLabel(progress.row) : ''
  // TV: full-bleed art with the text over its left side. Phone: 16:9 art on top, text over its foot.
  const artHeight = tv ? Math.min(width * 0.5, 540 * 0.8) : width * 0.5625
  // The web's srcset (960w / 1920w at 100vw): the small file only when the screen is no wider in pixels.
  const artPath = art && (width * PixelRatio.get() > 960 ? art.large : art.small)
  // No thumbnail: no request (imageSrc('') would be the site root), just the plain stage.
  const thumb = title.thumbnail !== '' ? imageSrc(title.thumbnail, imageBase) : null

  return (
    <View style={[styles.hero, { minHeight: tv ? artHeight : undefined }]}>
      {art ? (
        <View style={[styles.stage, !tv && { height: artHeight, bottom: undefined }]} pointerEvents="none">
          <Image testID="hero-art" source={{ uri: imageSrc(artPath!, imageBase) }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={tv ? { top: '20%' } : 'center'} />
          {tv ? (
            <LinearGradient colors={['rgba(8,9,12,0.94)', 'rgba(8,9,12,0.82)', 'rgba(8,9,12,0.4)', 'rgba(8,9,12,0)']} locations={[0, 0.24, 0.44, 0.62]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          ) : null}
          <LinearGradient colors={['rgba(8,9,12,0)', 'rgba(8,9,12,0.6)', BG]} locations={[0.5, 0.78, 1]} style={StyleSheet.absoluteFill} />
        </View>
      ) : (
        <View style={styles.stage} pointerEvents="none">
          {thumb && <Image testID="hero-backdrop" source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,9,12,0.55)' }]} />
          <LinearGradient colors={['rgba(8,9,12,0)', BG]} locations={[0.55, 1]} style={StyleSheet.absoluteFill} />
        </View>
      )}

      <View style={[styles.body, art && !tv && { paddingTop: artHeight - 48 }, art && tv && styles.bodyOverArt]}>
        <View style={styles.eyebrowRow}>
          <Text style={styles.badge}>Destacado</Text>
          <Text style={styles.eyebrow}>{`${isShow ? 'Serie' : 'Película'}${title.studio ? ` · ${title.studio}` : ''}`}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>{title.title}</Text>
        <View style={styles.metaRow}>
          {heroMeta(title).map((item, index) => (
            <View key={index} style={styles.metaItem}>
              {index > 0 && <View style={styles.sep} />}
              <Text style={styles.meta}>{item}</Text>
            </View>
          ))}
        </View>
        <View style={styles.genres}>
          {[title.genre, title.genre_secondary].filter(Boolean).map((genre) => (
            <Text key={genre} style={styles.chip}>{genre}</Text>
          ))}
        </View>
        <View style={styles.actions}>
          <HeroButton label={resuming ? 'Reanudar' : 'Reproducir'} note={position} primary preferred onPress={onPlay} icon={<View style={styles.playIcon} />} />
          <HeroButton label="Más información" onPress={onInfo} icon={<Text style={styles.infoIcon}>i</Text>} />
        </View>
        {resuming && progress?.progress && (
          <View style={styles.resume}>
            <ProgressBar fraction={playedFraction(progress.progress)} style={styles.resumeBar} />
            <Text style={styles.resumeText}>{remainingLabel(progress.progress)}</Text>
          </View>
        )}
      </View>

      {/* No key art: the thumbnail (when there is one) crisp at close to its native 368x210 (TV: beside the text; phone: under it). */}
      {!art && thumb && <Image testID="hero-thumb" source={{ uri: thumb }} style={tv ? styles.thumb : styles.thumbPhone} contentFit="cover" />}
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { position: 'relative', justifyContent: 'flex-end', paddingHorizontal: theme.space.safeX, paddingBottom: tv ? 28 : 36, paddingTop: tv ? 40 : 24 },
  stage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', backgroundColor: BG },
  body: { maxWidth: tv ? 352 : undefined },
  bodyOverArt: { maxWidth: 384 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.color.accent, color: BG, fontFamily: theme.font.monoSemi, fontSize: theme.size.eyebrow, letterSpacing: 1.8, textTransform: 'uppercase' },
  eyebrow: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.eyebrow, letterSpacing: 2, textTransform: 'uppercase' },
  title: { color: theme.color.text, fontFamily: theme.font.displayHeavy, fontSize: theme.size.hero, lineHeight: theme.size.hero * 1.02, letterSpacing: -theme.size.hero * 0.03, marginBottom: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  sep: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 10, backgroundColor: theme.color.textMeta },
  meta: { color: theme.color.textMeta, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: theme.color.hairline, color: theme.color.text, fontFamily: theme.font.mono, fontSize: theme.size.tag + 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  button: { borderRadius: theme.radius, paddingHorizontal: tv ? 18 : 22, paddingVertical: tv ? 9 : 13 },
  primary: { backgroundColor: theme.color.accent },
  secondary: { backgroundColor: 'rgba(242,244,240,0.12)', borderWidth: 1, borderColor: 'rgba(242,244,240,0.16)' },
  buttonFocused: { backgroundColor: theme.color.accent, transform: [{ scale: 1.04 }] },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonText: { color: theme.color.text, fontFamily: theme.font.displayBold, fontSize: theme.size.body },
  buttonTextOnAccent: { color: BG },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  resumeBar: { width: 96, height: 3 },
  resumeText: { color: theme.color.textMuted, fontFamily: theme.font.mono, fontSize: theme.size.meta },
  note: { paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: 'rgba(8,9,12,0.5)', color: theme.color.text, fontFamily: theme.font.monoMedium, fontSize: theme.size.meta, opacity: 0.75 },
  playIcon: { width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderLeftWidth: 11, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: BG },
  infoIcon: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: theme.color.text, color: theme.color.text, textAlign: 'center', fontFamily: theme.font.monoSemi, fontSize: 11, lineHeight: 14 },
  thumb: { position: 'absolute', right: theme.space.safeX, bottom: 28, width: 184, height: 105, borderRadius: theme.radius },
  thumbPhone: { width: '100%', aspectRatio: 368 / 210, borderRadius: theme.radius, marginTop: 20 },
})
