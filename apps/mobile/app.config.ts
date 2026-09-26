import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConfigContext, ExpoConfig } from 'expo/config'
import { mobileExtra, parseEnvFile } from './config/envFile'

// The same file the web app reads: the repo root's .env.local.
const ROOT_ENV = join(__dirname, '..', '..', '.env.local')

export default ({ config }: ConfigContext): ExpoConfig => {
  const fileEnv = existsSync(ROOT_ENV) ? parseEnvFile(readFileSync(ROOT_ENV, 'utf8')) : {}
  return {
    ...config,
    name: 'GO10 TV',
    slug: 'go10-tv',
    scheme: 'go10',
    icon: './assets/images/icon.png',
    android: {
      package: 'blog.go10.tv',
      adaptiveIcon: { foregroundImage: './assets/images/adaptive-icon.png', backgroundColor: '#08090c' },
    },
    plugins: [
      'expo-router',
      'expo-image',
      'expo-font',
      ['expo-splash-screen', { image: './assets/images/splash-icon.png', imageWidth: 180, backgroundColor: '#08090c' }],
      ['@react-native-tvos/config-tv', { androidTVBanner: './assets/images/tv-banner.png' }],
    ],
    // Real environment variables win over the file (CI, one-off overrides).
    extra: mobileExtra({ ...fileEnv, ...process.env }),
  }
}
