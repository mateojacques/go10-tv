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
    android: { package: 'blog.go10.tv' },
    plugins: [
      'expo-router',
      'expo-image',
      'expo-font',
      ['@react-native-tvos/config-tv', { androidTVBanner: './assets/images/icon-400x240.png' }],
    ],
    // Real environment variables win over the file (CI, one-off overrides).
    extra: mobileExtra({ ...fileEnv, ...process.env }),
  }
}
