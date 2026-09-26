import { Platform } from 'react-native'

/**
 * The web app's tokens (apps/web/src/styles/tokens.css) in dp. A 1080p TV is
 * 960x540 dp, so TV values are the web's 1920-px values halved; phone values
 * are the web's CSS px at a phone viewport.
 */
const tv = Platform.isTV

const cardWidth = tv ? 192 : 240 // --go-card-w: clamp(15rem, 20vw, 22rem)
const tileWidth = tv ? 158 : 176 // --go-tile-w: clamp(11rem, 16.5vw, 20rem)

export const theme = {
  color: {
    bg: '#08090c',
    bgRaised: '#12141a',
    bgSunken: '#050609',
    scrim: 'rgba(8, 9, 12, 0.92)',
    hairline: 'rgba(242, 244, 240, 0.09)',
    accent: '#c6f24e',
    accentDim: '#7f9b2c',
    accentGlow: 'rgba(198, 242, 78, 0.28)',
    text: '#f2f4f0',
    textMuted: '#878d99',
    textMeta: '#aab0bb',
  },
  /** One family per weight: Android can't synthesise weights for custom fonts. */
  font: {
    display: 'BricolageGrotesque_400Regular',
    displaySemi: 'BricolageGrotesque_600SemiBold',
    displayBold: 'BricolageGrotesque_700Bold',
    displayHeavy: 'BricolageGrotesque_800ExtraBold',
    mono: 'IBMPlexMono_400Regular',
    monoMedium: 'IBMPlexMono_500Medium',
    monoSemi: 'IBMPlexMono_600SemiBold',
  },
  space: { safeX: tv ? 40 : 20, safeY: tv ? 20 : 24, gap: tv ? 10 : 12, rowGap: tv ? 18 : 28 },
  size: { hero: tv ? 42 : 40, section: tv ? 15 : 22, card: tv ? 9.5 : 16, body: tv ? 10.5 : 17, meta: tv ? 8.5 : 15, eyebrow: tv ? 7 : 12, tag: tv ? 6 : 11 },
  card: { width: cardWidth, height: Math.round(cardWidth * 0.5625) },
  tile: { width: tileWidth, height: Math.round(tileWidth * 0.5625) },
  /** Focused cards and tiles grow like the web's `scale(1.09)`. */
  focusScale: 1.09,
  /** Unfocused cards sit under a scrim of this opacity: the web's brightness(0.62). */
  dim: 0.38,
  radius: 8,
}
