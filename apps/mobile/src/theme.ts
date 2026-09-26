import { Platform } from 'react-native'

/**
 * The web app's tokens (apps/web/src/styles/tokens.css) in dp. TV sizes are
 * for a 1080p panel at 960x540 dp; phone sizes follow the web's mobile pass.
 * Fonts arrive with the Home screen (Phase 3).
 */
const tv = Platform.isTV

export const theme = {
  color: {
    bg: '#08090c',
    bgRaised: '#12141a',
    bgSunken: '#050609',
    hairline: 'rgba(242, 244, 240, 0.09)',
    accent: '#c6f24e',
    accentDim: '#7f9b2c',
    text: '#f2f4f0',
    textMuted: '#878d99',
  },
  space: { safeX: tv ? 48 : 20, safeY: tv ? 27 : 24, gap: tv ? 20 : 12 },
  size: { hero: tv ? 42 : 32, section: tv ? 22 : 20, card: tv ? 16 : 15, body: tv ? 17 : 16, meta: tv ? 15 : 14 },
  card: { width: tv ? 220 : 150 },
  radius: 8,
}
